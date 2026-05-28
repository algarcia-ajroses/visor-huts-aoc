# Visor d'Allotjaments de Catalunya (Visor de HUTs)

Aquest és un visor de mapes **ultra-lleuger**, de **codi obert** i **alt rendiment**, dissenyat per a la visualització gràfica del cens d'allotjaments d'ús turístic (HUTs) de Catalunya (113.349 registres). 

El visor s'integra de manera nativa amb **Microsoft Fabric** (permetent la lectura directa de taules Delta a OneLake o consultes a l'Endpoint SQL) i ofereix un mecanisme d'autenticació interactiu completament compatible amb sistemes de seguretat corporativa **MFA (Doble factor / Microsoft Authenticator)**.

---

## 🚀 Característiques Destacades

* **Tres Modes de Visualització Premium**:
  1. **Mapa de Calor (Heatmap)**: Vista per defecte ultra-ràpida renderitzada mitjançant la GPU del navegador sobre HTML5 Canvas (càrrega de 113K punts en <120ms). Compta amb un panell col·lapsable de paràmetres de radi i blur a la barra lateral per estalviar espai.
  2. **Punts Individuals**: Marcadors minimalistes de color **Índigo Corporatiu AOC (`#4f46e5`)** amb ampliació dinàmica al passar el ratolí per millorar la interactivitat.
  3. **Clústers (Agrupacions)**: Algorisme de agrupament espacial jeràrquic instantani amb indicadors numèrics que reflecteixen la totalitat real del cens geogràfic.
* **Resolució de Solapaments en Coordenades (Multi-Popup)**: En edificis plurifamiliars amb múltiples pisos turístics, el visor agrupa els HUTs coincidents de forma intel·ligent en un llistat interactiu que permet consultar els detalls de cada registre sota demanda (*lazy loading*).
* **Velocitat d'Execució en Temps Real**:
  * **Cerca de solapaments en O(1)**: Indexació prèvia en memòria cau mitjançant taules hash en lloc de cerques quadràtiques $O(N^2)$, evitant la congelació del navegador.
  * **Renderització asíncrona fragmentada**: Processament asíncron no bloquejant de 60 FPS mitjançant lots controlats per `requestAnimationFrame`.
  * **Retall Geogràfic de Viewport**: Sota zoom de detall (> 9), només es dibuixen els elements de la pantalla activa, accelerant les actualitzacions silencioses en desplaçar el mapa.
  * **Mostreig intel·ligent**: A escala global (zoom <= 9), s'aplica un mostreig estadístic (1 de cada 15) que es dibuixa en menys de 100ms sense perdre definició visual de densitat.

---

## 📁 Estructura del Projecte

```text
fabric-map-viewer/
├── app.py                      # Servidor backend Flask i API d'allotjaments
├── requirements.txt            # Dependències de Python (inclou pyodbc, deltalake, etc.)
├── .gitignore                  # Exclusions per a un GitHub net (exclou venv i claus privades)
├── data/
│   └── huts.csv                # Arxiu local pre-carregat (113.349 files)
├── templates/
│   └── index.html              # Interfície HTML5 de vidre esmerilat (glassmorphism)
└── static/
    ├── css/
    │   └── styles.css          # Estils i maquetació adaptats a mòbils (mode fosc/clar)
    └── js/
        └── app.js              # Control de mapes Leaflet i esdeveniments
```

---

## 🛠️ Requisits de Sistema i Instal·lació

L'aplicació necessita tenir instal·lat **Python 3.9 o superior** al sistema.

### ⚠️ Requisits per a la connexió SQL a Fabric (MFA):
Si es vol connectar mitjançant l'Endpoint SQL interactiu, la màquina (local o servidor) ha de tenir instal·lat el controlador oficial de Microsoft:
* **[Microsoft ODBC Driver for SQL Server (Driver 17 o 18)](https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server)**.

### Instruccions per a la instal·lació local:

1. **Clona el teu repositori**:
   ```bash
   git clone https://github.com/algarcia-ajroses/visor-huts-aoc.git
   cd visor-huts-aoc
   ```

2. **Crea i activa l'entorn virtual**:
   ```bash
   python -m venv venv
   # A Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   # A Linux / macOS:
   source venv/bin/activate
   ```

3. **Instal·la les dependències**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Executa el visor**:
   ```bash
   python app.py
   ```
   Obre el teu navegador a [http://localhost:5000](http://localhost:5000).

---

## 🔌 Configuració de les Fonts de Dades

El visor s'iniciarà amb un modal interactiu en el qual es pot triar i configurar en viu la font que alimentarà el mapa:

### 1. Arxiu local CSV
Llegeix de forma instantània les dades en memòria cache del fitxer `data/huts.csv`. És l'opció ideal per a proves ràpides sense connexió d'Internet.

### 2. Microsoft Fabric (OneLake DFS)
Lectura en viu de fitxers Parquet del directori de OneLake. Està pensat per a serveis amb credencials automatitzades d'Azure (Service Principal amb Tenant ID, Client ID i Client Secret) o màquines de desenvolupament pre-autenticades a Azure CLI.

### 3. Microsoft Fabric (SQL Analytics Endpoint - MFA compatible)
Dissenyat específicament per a **usuaris corporatius amb doble factor de verificació obligatori (Microsoft Authenticator)**. 
* **Servidor SQL**: L'adreça de la teva capacitat (ex. `xxxx.datawarehouse.fabric.microsoft.com`).
* **Lakehouse**: El nom de la base de dades SQL (ex. `lakehouse_gold`).
* **Usuari**: El teu correu corporatiu (ex. `algarcia@roses.cat`).
* **Taula**: El camí amb l'esquema de Fabric (ex. `gencat_ddoo.hut_geocodificat`).

*En prémer "Connecta i Carrega", el visor obrirà de manera totalment segura una finestra de navegador per demanar-te la verificació de l'Authenticator. Un cop acceptada, carregarà la taula en menys de 2 segons.*

---

## 🌐 Desplegament en Producció

Per a indicacions detallades, ordres i scripts per publicar aquest visor a Internet darrere de servidors professionals (Nginx + Gunicorn en Linux, o IIS en Windows Server), consulta la [Guia de Desplegament completa](file:///C:/Users/AGARCIA/.gemini/antigravity/brain/8e85888c-58e7-4ba6-8867-9c150f45beb2/deployment_guide.md) que es troba a la documentació del projecte.
