# Visor de Mapes per a Microsoft Fabric (Delta Tables)

Aquest és un visor de mapes **ultra-lleuger**, de **codi obert** i **fàcilment instal·lable** a qualsevol servidor. Està dissenyat per connectar-se de forma segura a taules Delta en entorns de **Microsoft Fabric** (mitjançant el SQL Endpoint o OneLake) i representar dades geoespacials (latituds i longituds) com a:
1. **Punts individuals**: Marcadors interactius de colors segons la intensitat amb finestres emergents de detalls.
2. **Mapa de calor (Heatmap)**: Visualització dinàmica de densitat i acumulació de valors amb paràmetres de radi i difusió ajustables en temps real.
3. **Agrupació (Marker Clustering)**: Agrupament intel·ligent per gestionar milers de punts de forma eficient sense alentir el navegador.

---

## Característiques Principals

- **100% Codi Lliure**: Utilitza **Leaflet.js**, **Leaflet.heat** i **Leaflet.markercluster** per a una visualització ràpida i gratuïta sense dependre d'APIs de pagament (com Google Maps).
- **Rendiment Superior**: Interfície minimalista construïda amb Vanilla CSS i HTML5, pesant menys de 100KB a la càrrega inicial del navegador.
- **Disseny Premium**: Estètica moderna amb panell de controls de vidre translúcid (glassmorphism), mode fosc/clar automàtic i totalment adaptat a mòbils i tauletes.
- **Instal·lació Súper Sencera**: El backend utilitza Python i Flask amb una única llibreria SQL (`pymssql`) que no requereix controladors complexos a nivell de sistema operatiu.
- **Mode de Simulació (Mock Mode)**: Inclou dades geoespacials sintètiques basades a Catalunya perquè puguis provar l'aplicació a l'instant abans d'enllaçar-la amb Fabric.

---

## Estructura del Projecte

```
fabric-map-viewer/
├── app.py                     # Servidor Flask (Backend i API de dades)
├── requirements.txt           # Dependències del projecte
├── .env                       # Fitxer de configuració actiu (creat a partir de .env.example)
├── .env.example               # Plantilla de configuració de Microsoft Fabric
├── templates/
│   └── index.html             # Interfície web HTML5
└── static/
    ├── css/
    │   └── styles.css         # Full d'estils premium amb mode fosc/clar
    └── js/
        └── app.js             # Lògica interactiva del mapa i filtres
```

---

## Requisits Previs

Només necessites tenir instal·lat **Python 3.8 o superior** al servidor.

---

## Instal·lació i Posada en Marxa (Local o Servidor)

### 1. Clonar o descarregar el projecte
Navega fins a la carpeta del projecte:
```bash
cd fabric-map-viewer
```

### 2. Crear un entorn virtual (Recomanat)
```bash
python -m venv venv
```
Activa l'entorn virtual:
* **Windows (PowerShell)**: `.\venv\Scripts\Activate.ps1`
* **Windows (cmd)**: `.\venv\Scripts\activate.bat`
* **Linux/macOS**: `source venv/bin/activate`

### 3. Instal·lar les dependències
```bash
pip install -r requirements.txt
```

### 4. Executar l'aplicació
```bash
python app.py
```
Obre el teu navegador a [http://localhost:5000](http://localhost:5000). L'aplicació s'iniciarà immediatament en **Mode de Simulació** amb dades de Catalunya.

---

## Com connectar-se a Microsoft Fabric

Per utilitzar les dades reals de la teva taula Delta a Microsoft Fabric, segueix aquests passos:

### 1. Obtenir el SQL Connection String de Fabric
1. Entra al teu workspace de **Microsoft Fabric**.
2. Obre el teu **Lakehouse** o **Warehouse**.
3. A la cantonada superior dreta, obre la configuració i copia la **cadena de connexió SQL** (SQL Connection String). Serà similar a:
   `xxxx.datawarehouse.fabric.microsoft.com`

### 2. Configurar el fitxer `.env`
Obre el fitxer `.env` del projecte i configura les variables següents:

```env
# Desactiva el mode de simulació
MOCK_MODE=False

# Configuració de la base de dades i taula de Fabric
FABRIC_SERVER=la-teva-cadena-connexio.datawarehouse.fabric.microsoft.com
FABRIC_DATABASE=nom_del_teu_lakehouse_o_warehouse
FABRIC_TABLE=nom_de_la_teva_taula_delta

# Nom de les teves columnes de latitud i longitud
LAT_COLUMN=latitud
LON_COLUMN=longitud
VAL_COLUMN=intensitat # Columna opcional per donar pes al mapa de calor

# Autenticació (Opció A: Credencials directes de Microsoft Entra)
FABRIC_USER=el-teu-correu@empresa.com
FABRIC_PASSWORD=la_teva_contrasenya_de_microsoft
```

*Nota: Per a entorns corporatius de producció, és molt recomanable fer servir un **Service Principal** de Microsoft Entra ID (Client ID, Client Secret i Tenant ID) per evitar guardar contrasenyes personals al servidor.*

### 3. Reiniciar l'aplicació
Atura el servidor (`Ctrl + C`) i torna'l a iniciar (`python app.py`). El visor carregarà automàticament els punts directament de la teva taula Delta en temps real.

---

## Desplegament en Servidors de Producció

L'aplicació és tan senzilla que es pot desplegar a pràcticament qualsevol lloc:
- **Docker**: Pots encapsular-la en un contenidor amb una imatge base de `python:3.10-slim`.
- **WSGI / Gunicorn**: Per a producció a Linux, executa-la darrere de Nginx amb Gunicorn:
  ```bash
  pip install gunicorn
  gunicorn -w 4 -b 0.0.0.0:5000 app:app
  ```
- **Azure App Service**: S'integra de forma nativa com una Web App de Python, garantint un accés de xarxa optimitzat cap als teus serveis de Fabric.
