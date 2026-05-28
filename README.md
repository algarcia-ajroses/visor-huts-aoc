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
  * **Renderització asíncrona fragmentada**: Processament asíncron no bloquejant de 60 FPS mitjançant lots de 6.000 elements controlats per `requestAnimationFrame`.
  * **Retall Geogràfic de Viewport**: Sota zoom de detall (> 9), només es dibuixen els elements de la pantalla activa, accelerant les actualitzacions silencioses en desplaçar el mapa.
  * **Mostreig intel·ligent**: A escala global (zoom <= 9), s'aplica un mostreig estadístic (1 de cada 15) que es dibuixa en menys de 100ms sense perdre definició visual de densitat.

---

## 📁 Estructura del Projecte

```text
visor-huts-aoc/
├── app.py                      # Servidor backend Flask i API d'allotjaments
├── requirements.txt            # Dependències de Python (llista de "receptes" per descarregar)
├── .gitignore                  # Exclusions per a un GitHub net (exclou venv i claus privades)
├── data/
│   └── huts.csv                # Arxiu local pre-carregat (113.349 files)
├── templates/
│   └── index.html              # Interfície HTML5 de vidre esmerilat (glassmorphism)
└── static/
    ├── css/
    │   └── styles.css          # Estils i maquetació adaptats a mòbils (mode fosc/clar)
    └── js/
        └── app.js              # Lògica interactiva del mapa i filtres
```

---

## ⚙️ Requisits Previs del Sistema

Abans de començar la instal·lació a qualsevol servidor, assegura't que compta amb els següents components del sistema:

1. **Python 3.9 o superior** instal·lat de manera global.
2. **Microsoft ODBC Driver for SQL Server (Driver 17 o 18)**: Requisit obligatori per poder connectar-se de manera interactiva a Microsoft Fabric mitjançant SQL Endpoint.
   * **Instal·lar a Windows**: Descarrega i executa el fitxer oficial `.msi` de [Microsoft ODBC Driver for SQL Server](https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server).
   * **Instal·lar a Linux (Ubuntu 20.04/22.04)**:
     ```bash
     sudo su
     curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
     curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list
     exit
     sudo apt-get update
     sudo ACCEPT_EULA=Y apt-get install -y msodbcsql18
     ```

---

## 📥 Guia d'Instal·lació Pas a Pas (Qualsevol Servidor)

Sigueu al vostre ordinador local, un servidor Linux o Windows Server, aquests són els passos per posar-lo en marxa:

### Pas 1: Descarregar el codi de GitHub
```bash
git clone https://github.com/algarcia-ajroses/visor-huts-aoc.git
cd visor-huts-aoc
```

### Pas 2: Crear l'Entorn Virtual de Python
Això garanteix que les dependències no tinguin cap conflicte amb altres aplicacions del vostre servidor.
```bash
python -m venv venv
```

### Pas 3: Activar l'Entorn Virtual
* **A Windows (PowerShell)**:
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
* **A Windows (Símbol del sistema - cmd)**:
  ```cmd
  .\venv\Scripts\activate.bat
  ```
* **A Linux o macOS**:
  ```bash
  source venv/bin/activate
  ```

### Pas 4: Instal·lar les Dependències i Llibreries
El servidor llegirà la llista de requisits i es descarregarà de forma automàtica la versió de cada llibreria ideal per a la teva plataforma específica:
```bash
pip install -r requirements.txt
```

### Pas 5: Executar l'Aplicació de Prova
```bash
python app.py
```
Obre el teu navegador a [http://localhost:5000](http://localhost:5000) o a l'IP pública del teu servidor. El visor estarà llest en format local (CSV) a l'instant.

---

## 🌐 Configurar com a Servei Permanent en Producció

Perquè l'aplicació funcioni a Internet de manera ininterrompuda (que no es tanqui en tancar la consola), es recomana configurar-la com a servei de sistema de fons:

### Opció A: En un Servidor Linux (Gunicorn + Nginx) - Recomanada
Aquesta és l'opció estàndard per a servidors a Internet:

1. **Crea un servei del sistema** creant el fitxer `/etc/systemd/system/visorhuts.service`:
   ```ini
   [Unit]
   Description=Servei Visor de HUTs AOC
   After=network.target

   [Service]
   User=www-data
   Group=www-data
   WorkingDirectory=/var/www/visor-huts-aoc
   Environment="PATH=/var/www/visor-huts-aoc/venv/bin"
   ExecStart=/var/www/visor-huts-aoc/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 app:app

   [Install]
   WantedBy=multi-user.target
   ```
2. **Activa i inicia el servei**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start visorhuts
   sudo systemctl enable visorhuts
   ```
3. **Exposa el port mitjançant Nginx** afegint el redireccionament a `/etc/nginx/sites-available/default`:
   ```nginx
   server {
       listen 80;
       server_name elteuvisor.cat;

       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Reinicia Nginx: `sudo systemctl restart nginx`

### Opció B: En un Servidor Windows Server (IIS / Servei de Windows)
Si el vostre organisme requereix desplegar-lo sobre Windows Server corporatiu:

1. Descarrega l'eina gratuïta **[NSSM (Non-Sucking Service Manager)](https://nssm.cc/)**.
2. Obre la consola de Windows com a Administrador i executa:
   ```cmd
   nssm install VisorHuts
   ```
3. S'obrirà una finestra gràfica. Configura els camps:
   * **Path**: Selecciona el fitxer executiu de Python de l'entorn virtual: `C:\ruta-del-projecte\venv\Scripts\python.exe`
   * **Startup directory**: La teva carpeta del projecte: `C:\ruta-del-projecte`
   * **Arguments**: Escriu: `app.py`
4. Fes clic a **Install service**. A partir d'aquest moment, Windows mantindrà l'aplicació en segon pla de forma permanent, iniciant-la sola quan s'engegui el servidor.

---

## 🔌 Configuració de les Fonts de Dades

El Visor de HUTs de Catalunya disposa de dos mètodes d'alimentació de dades, completament configurables de manera gràfica a través de l'assistent inicial de la pròpia interfície web:

### Opció A: Arxiu local CSV (Pre-carregat)
* **Ubicació**: A la carpeta `data/` del projecte es troba el fitxer `huts.csv` que conté la totalitat dels **113.349 registres** geocodificats dels allotjaments de Catalunya.
* **Ús**: Aquesta opció funciona a l'instant i fora de línia, ideal per a proves inicials o entorns sense connexió a Microsoft Fabric.

### Opció B: Microsoft Fabric (Recomanat mitjançant SQL Endpoint + MFA)
Per a entorns de producció on les dades s'actualitzen des de processos data pipeline de Fabric, es recomana utilitzar el mètode de connexió **SQL Endpoint (MFA)**. Aquest mètode és completament compatible amb els comptes de seguretat corporativa que tenen activat el doble factor d'autenticació (MFA / Microsoft Authenticator).

Quan trieu aquest mètode a la interfície de configuració, s'han d'emplenar els següents camps:

1. **Servidor SQL Analytics Endpoint**: L'adreça de connexió del servidor SQL Analytics de la vostra Lakehouse. Es pot obtenir copiant la cadena de connexió des de la secció de propietats de la Lakehouse a la interfície de Microsoft Fabric.
2. **Base de Dades / Lakehouse (Nom complet)**: El nom complet de la Lakehouse o Base de dades d'on voleu extreure les dades.
3. **Usuari Corporatiu (Correu Microsoft)**: La vostra adreça de correu electrònic corporatiu vinculada al compte de Microsoft. En clicar a connectar, s'obrirà de forma interactiva una finestra del navegador perquè aproveu l'inici de sessió amb l'Authenticator.
4. **Nom de la Taula**: El nom complet de la taula que conté els allotjaments geocodificats. **IMPORTANT**: Cal especificar el nom complet de la taula incloent el seu esquema de dades (per exemple: `nom_esquema.nom_taula`).

