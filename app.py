import os
import time
from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv
import pandas as pd

# Carregar variables d'entorn
load_dotenv()

app = Flask(__name__)

import json
from deltalake import DeltaTable
from azure.identity import DefaultAzureCredential, ClientSecretCredential

# Configuració de la font de dades
CSV_PATH = os.path.join(os.path.dirname(__file__), 'data', 'huts.csv')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'data', 'config.json')

# Estat global de memòria cau per a dades de l'aplicació
_cached_df = None              # DataFrame netejat complet per a consultes ràpides
_cached_precisions = []        # Llista única de precisions
_cached_municipalities = []    # Llista única de municipis
_cached_points_map = {}        # Mapa de consulta ràpida Index -> Dades detallades
_cached_source = "Arxiu local CSV" # Descripció de la font de dades activa
_cached_error_msg = ""         # Missatge del darrer error de càrrega

def load_data_into_cache():
    """Carrega les dades en memòria cau (RAM) segons la configuració actora (CSV o Fabric)."""
    global _cached_df, _cached_precisions, _cached_municipalities, _cached_points_map, _cached_source, _cached_error_msg
    
    start_time = time.time()
    print("--------------------------------------------------")
    print(" Carregant dades en memòria cau...")
    
    # 1. Llegim la configuració
    mode = "csv"
    fabric_url = ""
    tenant_id = ""
    client_id = ""
    client_secret = ""
    sql_server = ""
    sql_db = ""
    sql_user = ""
    sql_table = "hut_geocodificat"
    
    config = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                mode = config.get("mode", "csv")
                fabric_url = config.get("url", "")
                tenant_id = config.get("tenant_id", "")
                client_id = config.get("client_id", "")
                client_secret = config.get("client_secret", "")
                sql_server = config.get("sql_server", "")
                sql_db = config.get("sql_db", "")
                sql_user = config.get("sql_user", "")
                sql_table = config.get("sql_table", "hut_geocodificat")
            print(f" [CONFIG] Mode de connexió actiu: {mode.upper()}")
        except Exception as e:
            print(f" [CONFIG ERROR] Error al llegir config.json: {str(e)}. Farem servir CSV.")
            mode = "csv"
            
    # 2. Executem la càrrega segons el mode
    if mode == "fabric":
        if not fabric_url:
            print(" [WARNING] Mode Fabric seleccionat però la URL de la taula està buida.")
            return False
            
        print(f" [FABRIC] Connectant a OneLake: {fabric_url}")
        try:
            # Configurar credencials
            if tenant_id and client_id and client_secret:
                print(" [FABRIC] Utilitzant credencials de Client Secret (Service Principal)")
                credential = ClientSecretCredential(
                    tenant_id=tenant_id,
                    client_id=client_id,
                    client_secret=client_secret
                )
                os.environ["AZURE_TENANT_ID"] = tenant_id
                os.environ["AZURE_CLIENT_ID"] = client_id
                os.environ["AZURE_CLIENT_SECRET"] = client_secret
                storage_options = {}
            else:
                print(" [FABRIC] Utilitzant credencials per defecte del sistema (DefaultAzureCredential)")
                os.environ.pop("AZURE_TENANT_ID", None)
                os.environ.pop("AZURE_CLIENT_ID", None)
                os.environ.pop("AZURE_CLIENT_SECRET", None)
                storage_options = {}
                
            # Llegir taula Delta de Fabric directament sense Spark (Rust power!)
            dt = DeltaTable(fabric_url, storage_options=storage_options)
            
            columns_to_read = [
                'ide_inscripcio', 'des_retol', 'des_tipus_establiment', 
                'des_municipi', 'des_comarca', 'num_total_places', 
                'coordenada_lon', 'coordenada_lat', 'precisio_geocodificacio'
            ]
            
            # python-deltalake només descarrega les columnes demanades
            df = dt.to_pandas(columns=columns_to_read)
            _cached_source = "Fabric OneLake Delta Table (DFS)"
            print(f" [FABRIC] Descàrrega de dades en viu completada. Files: {len(df)}")
            
        except Exception as e:
            _cached_error_msg = f"Error OneLake DFS: {str(e)}"
            print(f" [FABRIC ERROR] Fallida en llegir de OneLake: {str(e)}")
            print("--------------------------------------------------")
            return False
            
    elif mode == "fabric_sql":
        if not sql_server or not sql_db or not sql_user:
            print(" [WARNING] Mode Fabric SQL seleccionat però falten paràmetres de connexió SQL.")
            return False
            
        print(f" [FABRIC SQL] Connectant a SQL Analytics Endpoint: {sql_server}")
        try:
            import pyodbc
            
            # Prioritzem controladors moderns (ODBC Driver 18 o 17) davant del vell 'SQL Server' de Windows
            all_drivers = pyodbc.drivers()
            print(f" [FABRIC SQL] Controladors ODBC detectats al sistema: {all_drivers}")
            
            modern_drivers = [d for d in all_drivers if 'ODBC Driver' in d and 'SQL Server' in d]
            if not modern_drivers:
                raise Exception(
                    "Es requereix un controlador modern (com 'ODBC Driver 17 for SQL Server' o 'ODBC Driver 18 for SQL Server') "
                    "per a la connexió SQL interactiva. El controlador legacy 'SQL Server' de Windows no és compatible."
                )
                
            driver = modern_drivers[0]
            print(f" [FABRIC SQL] Utilitzant el controlador ODBC modern: {driver}")
            
            # Construir cadena de connexió interactiva (obre finestra de navegador per a MFA)
            conn_str = (
                f'DRIVER={{{driver}}};'
                f'SERVER={sql_server};'
                f'DATABASE={sql_db};'
                'Authentication=ActiveDirectoryInteractive;'
                f'UID={sql_user};'
            )
            
            print(" [FABRIC SQL] Connectant de forma interactiva...")
            conn = pyodbc.connect(conn_str)
            print(f" [FABRIC SQL] Connexió establerta. Querying taula {sql_table}...")
            
            query = f"""
                SELECT ide_inscripcio, des_retol, des_tipus_establiment, 
                       des_municipi, des_comarca, num_total_places, 
                       coordenada_lon, coordenada_lat, precisio_geocodificacio 
                FROM {sql_table}
            """
            
            df = pd.read_sql(query, conn)
            conn.close()
            _cached_source = "Fabric SQL Analytics Endpoint (ODBC)"
            print(f" [FABRIC SQL] Lectura SQL completada amb èxit. Files: {len(df)}")
            
        except Exception as e:
            _cached_error_msg = f"Error SQL Endpoint: {str(e)}"
            print(f" [FABRIC SQL ERROR] Fallida en connectar/llegir via SQL: {str(e)}")
            print("--------------------------------------------------")
            return False
            
    else: # mode == "csv"
        print(f" [CSV] Llegint fitxer local: {CSV_PATH}")
        if not os.path.exists(CSV_PATH):
            print(" [WARNING] No s'ha trobat el fitxer huts.csv a data/huts.csv.")
            return False
            
        try:
            columns_to_read = [
                'ide_inscripcio', 'des_retol', 'des_tipus_establiment', 
                'des_municipi', 'des_comarca', 'num_total_places', 
                'coordenada_lon', 'coordenada_lat', 'precisio_geocodificacio'
            ]
            df = pd.read_csv(CSV_PATH, sep=';', encoding='utf-8', usecols=columns_to_read)
            _cached_source = "Arxiu local CSV"
        except Exception as e:
            _cached_error_msg = f"Error CSV local: {str(e)}"
            print(f" [CSV ERROR] Error en obrir el CSV: {str(e)}")
            print("--------------------------------------------------")
            return False
            
    # 3. Neteja comuna de dades
    try:
        df = df.dropna(subset=['coordenada_lat', 'coordenada_lon'])
        df['des_retol'] = df['des_retol'].fillna("Sense Nom Comercial")
        df['des_tipus_establiment'] = df['des_tipus_establiment'].fillna("Allotjament")
        df['des_municipi'] = df['des_municipi'].fillna("Desconegut")
        df['des_comarca'] = df['des_comarca'].fillna("Desconegut")
        df['num_total_places'] = df['num_total_places'].fillna(1.0).astype(float)
        df['precisio_geocodificacio'] = df['precisio_geocodificacio'].fillna("No Definida")
        df['ide_inscripcio'] = df['ide_inscripcio'].fillna("Sense Registre")
        
        df = df.reset_index(drop=True)
        _cached_df = df
        _cached_points_map = df.to_dict(orient='index')
        _cached_precisions = sorted(df['precisio_geocodificacio'].unique().tolist())
        _cached_municipalities = sorted(df['des_municipi'].unique().tolist())
        
        elapsed = time.time() - start_time
        print(f" Memòria cau llesta! Càrrega completada en {elapsed:.2f} segons.")
        print(f" Allotjaments indexats: {len(_cached_points_map)} establiments.")
        print("--------------------------------------------------")
        return True
    except Exception as e:
        _cached_error_msg = f"Error al processar les dades: {str(e)}"
        print(f" [ERROR COMÚ] Error al processar el DataFrame: {str(e)}")
        print("--------------------------------------------------")
        return False

# Intentem carregar les dades al boot si hi ha una configuració guardada
CSV_READY = load_data_into_cache()

@app.route('/')
def index():
    """Serveix la pàgina web del visor de mapes."""
    return render_template('index.html')

@app.route('/api/config')
def get_config():
    """Retorna l'estat actual de la configuració de l'aplicació."""
    mode = "csv"
    fabric_url = ""
    sql_server = ""
    sql_db = ""
    sql_user = ""
    sql_table = "hut_geocodificat"
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                config = json.load(f)
                mode = config.get("mode", "csv")
                fabric_url = config.get("url", "")
                sql_server = config.get("sql_server", "")
                sql_db = config.get("sql_db", "")
                sql_user = config.get("sql_user", "")
                sql_table = config.get("sql_table", "hut_geocodificat")
        except Exception:
            pass
            
    return jsonify({
        "csv_loaded": CSV_READY,
        "total_records": len(_cached_df) if _cached_df is not None else 0,
        "connection_mode": mode,
        "fabric_url": fabric_url,
        "sql_server": sql_server,
        "sql_db": sql_db,
        "sql_user": sql_user,
        "sql_table": sql_table
    })

@app.route('/api/setup_connection', methods=['POST'])
def setup_connection():
    """Configura el mode de connexió i recarrega la memòria cau amb les credencials trameses."""
    global CSV_READY
    
    data = request.get_json() or {}
    mode = data.get("mode", "csv")
    url = data.get("url", "")
    tenant_id = data.get("tenant_id", "")
    client_id = data.get("client_id", "")
    client_secret = data.get("client_secret", "")
    sql_server = data.get("sql_server", "")
    sql_db = data.get("sql_db", "")
    sql_user = data.get("sql_user", "")
    sql_table = data.get("sql_table", "hut_geocodificat")
    
    # Valida paràmetres
    if mode == "fabric" and not url:
        return jsonify({"success": False, "message": "Falta la URL de la taula de Microsoft Fabric."}), 400
    if mode == "fabric_sql" and (not sql_server or not sql_db or not sql_user):
        return jsonify({"success": False, "message": "Falten paràmetres de la connexió SQL a Microsoft Fabric (Servidor, Base de dades o Usuari)."}), 400
        
    try:
        # Crea el directori data si no existeix
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        
        # Desa la configuració a data/config.json
        config_data = {
            "mode": mode,
            "url": url,
            "tenant_id": tenant_id,
            "client_id": client_id,
            "client_secret": client_secret,
            "sql_server": sql_server,
            "sql_db": sql_db,
            "sql_user": sql_user,
            "sql_table": sql_table
        }
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=4)
            
        print(f" [CONFIG] S'ha desat la nova configuració a {CONFIG_PATH}")
        
        # Re-carrega la memòria cau amb el nou mode
        success = load_data_into_cache()
        CSV_READY = success
        
        if success:
            return jsonify({
                "success": True,
                "message": f"Connexió configurada correctament en mode {mode.upper()} i dades carregades.",
                "total_records": len(_cached_df) if _cached_df is not None else 0
            })
        else:
            return jsonify({
                "success": False,
                "message": f"La càrrega de dades ha fallat: {_cached_error_msg}"
            }), 500
            
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error al desar la configuració: {str(e)}"
        }), 500

@app.route('/api/precisions')
def get_precisions():
    """Retorna la llista de valors únics de la precisió de geolocalització."""
    return jsonify({
        "success": True,
        "precisions": _cached_precisions if CSV_READY else []
    })

@app.route('/api/municipalities')
def get_municipalities():
    """Retorna la llista de municipis únics de Catalunya del CSV."""
    return jsonify({
        "success": True,
        "municipalities": _cached_municipalities if CSV_READY else []
    })

@app.route('/api/points')
def get_points():
    """Retorna els punts filtrats en format compactat ultra-lleuger (Array de Arrays)."""
    precision_filter = request.args.get("precision", "all")
    municipality_filter = request.args.get("municipality", "all")
    
    if not CSV_READY or _cached_df is None:
        return jsonify({"success": False, "message": "Les dades no estan llestes."}), 500
        
    try:
        df = _cached_df
        
        # Filtre per precisió
        if precision_filter != "all":
            df = df[df['precisio_geocodificacio'] == precision_filter]
            
        # Filtre per municipi
        if municipality_filter != "all":
            df = df[df['des_municipi'] == municipality_filter]
            
        # Retornem una llista d'arrays:
        # [index_unic, coordenada_lat, coordenada_lon, num_total_places, des_tipus_establiment]
        # Això redueix la transferència radicalment.
        # Afegim l'índex de DataFrame per poder fer lazy loading usant la clau d'índex.
        # df.index conté els índexs 0..N-1. Afegim-lo com a columna provisional.
        df_output = df.copy()
        df_output['index_unic'] = df_output.index
        
        compacted_data = df_output[[
            'index_unic', 'coordenada_lat', 'coordenada_lon', 
            'num_total_places', 'des_tipus_establiment', 'ide_inscripcio'
        ]].values.tolist()
        
        return jsonify({
            "success": True,
            "source": _cached_source,
            "count": len(compacted_data),
            "data": compacted_data
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "message": "Error al processar els punts de geolocalització."
        }), 500

@app.route('/api/point/<int:point_idx>')
def get_point_details(point_idx):
    """Retorna els detalls complets d'un únic punt sota demanda mitjançant el seu índex únic (Lazy Loading)."""
    global _cached_points_map
    
    if not CSV_READY or not _cached_points_map:
        return jsonify({"success": False, "message": "Dades no indexades."}), 500
        
    point_data = _cached_points_map.get(point_idx)
    if point_data:
        return jsonify({
            "success": True,
            "data": {
                "id": point_data['ide_inscripcio'],
                "label": point_data['des_retol'],
                "category": point_data['des_tipus_establiment'],
                "intensity": point_data['num_total_places'],
                "municipality": point_data['des_municipi'],
                "county": point_data['des_comarca'],
                "precision": point_data['precisio_geocodificacio']
            }
        })
    else:
        return jsonify({"success": False, "message": "Punt no trobat"}), 404

if __name__ == '__main__':
    if not CSV_READY:
        CSV_READY = load_data_into_cache()
    app.run(host='0.0.0.0', port=5000, debug=True)
