# Guia de Publicació a Windows Server (IIS + Waitress)

Aquesta guia detalla els passos necessaris per desplegar l'aplicació Flask (Visor de HUTs) en un entorn de producció sobre un servidor **Windows Server**.

Per a entorns Windows, la combinació més robusta, moderna i fàcil de mantenir és utilitzar **Waitress** (un servidor WSGI de producció per a Windows) com a motor d'execució de Python, situat darrere de **IIS (Internet Information Services)** funcionant com a Proxy Invers per gestionar el trànsit web, els dominis, i els certificats SSL (HTTPS).

---

## Requisits Previs del Servidor

Assegura't de tenir instal·lats els següents components al servidor Windows Server:
1. **Python 3.10+**: Instal·lat per a tots els usuaris i amb l'opció "Add Python to PATH" activada.
2. **IIS (Internet Information Services)**: Activat des de la consola d'Administració del Servidor (Server Manager) > *Add Roles and Features*, seleccionant *Web Server (IIS)*.
3. **Application Request Routing (ARR) per a IIS**: Mòdul oficial de Microsoft necessari per permetre que IIS funcioni com a Proxy Invers. 
   - [Descarregar ARR de Microsoft](https://www.iis.net/downloads/microsoft/application-request-routing)

---

## Pas 1: Preparació del Projecte i Virtual Environment

1. Copia la carpeta del projecte (`fabric-map-viewer`) al directori de producció desitjat del servidor, per exemple a `C:\inetpub\wwwroot\fabric-map-viewer`.
2. Obre una consola de Windows (PowerShell o CMD) com a Administrador i navega fins al directori:
   ```powershell
   cd C:\inetpub\wwwroot\fabric-map-viewer
   ```
3. Crea un entorn virtual net (si no s'ha copiat el previ):
   ```powershell
   python -m venv venv
   ```
4. Activa l'entorn virtual:
   ```powershell
   .\venv\Scripts\activate
   ```
5. Instal·la les dependències del projecte juntament amb **Waitress** (el servidor de producció):
   ```powershell
   pip install -r requirements.txt
   pip install waitress
   ```

---

## Pas 2: Crear el Fitxer d'Arrencada de Producció (`wsgi.py`)

A la carpeta arrel del projecte (`C:\inetpub\wwwroot\fabric-map-viewer`), crea un fitxer anomenat `wsgi.py` per arrencar l'aplicació amb Waitress en lloc del servidor de desenvolupament de Flask.

Crea el fitxer amb el següent contingut:

```python
import os
import sys
from waitress import serve
from app import app, CSV_READY, load_data_into_cache

# Assegurar que el directori del projecte està al path
sys.path.insert(0, os.path.dirname(__file__))

if __name__ == '__main__':
    # Forçar la càrrega del CSV a memòria abans d'obrir el servei
    if not CSV_READY:
        load_data_into_cache()
        
    print("Iniciant servidor de producció Waitress a http://localhost:5000...")
    # Executem l'aplicació en el port local 5000 mitjançant 4 fils en paral·lel
    serve(app, host='127.0.0.1', port=5000, threads=4)
```

---

## Pas 3: Configurar l'Aplicació com a Servei de Windows (Recomanat)

Per a garantir que l'aplicació s'arrenca automàticament quan s'inicia el servidor, s'executa en segon pla i es reinicia sola en cas de fallada, el millor és instal·lar-la com a **Servei de Windows**. Utilitzarem l'eina de codi obert **NSSM (Non-Sucking Service Manager)**:

1. Descarrega NSSM de la seva web oficial: [nssm.cc](https://nssm.cc/download).
2. Copia l'executable `nssm.exe` (de la carpeta win64 de la descàrrega) a `C:\windows\system32` o a la mateixa carpeta del projecte.
3. Des d'una consola d'Administrador, executa:
   ```powershell
   nssm install VisorHUTs
   ```
4. S'obrirà una finestra gràfica on has de configurar els següents camps:
   - **Path**: Cerca l'executable de Python de l'entorn virtual:
     `C:\inetpub\wwwroot\fabric-map-viewer\venv\Scripts\python.exe`
   - **Startup directory**: La ruta del projecte:
     `C:\inetpub\wwwroot\fabric-map-viewer`
   - **Arguments**: El script de producció de Waitress:
     `wsgi.py`
5. A la pestanya **Details**, pots posar:
   - *Display name*: `Visor de HUTs - Consorci AOC`
   - *Startup type*: `Automatic`
6. Fes clic a **Install service**.
7. Inicia el servei des de la línia de comandes o des de l'eina `services.msc` de Windows:
   ```powershell
   Start-Service VisorHUTs
   ```

A partir d'aquest moment, l'aplicació Flask està corrent en segon pla a la màquina i escoltant localment al port `5000`.

---

## Pas 4: Configurar IIS com a Proxy Invers (Reverse Proxy)

Ara utilitzarem IIS per rebre les peticions públiques externes (ports 80 o 443) i redirigir-les internament al port local 5000.

### 1. Activar Application Request Routing (ARR)
1. Obre el **IIS Manager** (*Internet Information Services Manager*).
2. A l'arbre esquerre, fes clic a sobre del nom del teu Servidor.
3. Al panell central, obre **Application Request Routing Cache**.
4. Al panell de la dreta (*Actions*), fes clic a **Server Proxy Settings**.
5. Marca la casella **Enable proxy** i prem **Apply** a la dreta.

### 2. Crear el lloc web a IIS
1. A l'arbre esquerre de IIS, desplega *Sites*, fes clic dret i selecciona **Add Website**.
2. Configura el lloc:
   - **Site name**: `VisorHUTs`
   - **Physical path**: Crea una carpeta buida (per exemple, `C:\inetpub\wwwroot\visor_client`) o apunta a la carpeta del projecte (tot i que IIS no servirà directament els fitxers de Python, és correcte).
   - **Binding**: Eligeix el port (ex: `80` per a HTTP) i posa el nom de domini del servidor a **Host name** (ex: `visorhuts.teudomini.cat`).
3. Fes clic a **OK**.

### 3. Configurar la Regla d'Enrutament (URL Rewrite)
Necessitem que qualsevol petició HTTP que entri a IIS es redirigeixi a `http://127.0.0.1:5000`.
1. Fes clic a sobre del lloc web creat (`VisorHUTs`) a l'esquerra.
2. Al panell central, fes doble clic a **URL Rewrite** (si no hi és, assegura't d'instal·lar el mòdul *URL Rewrite* de IIS).
3. A la dreta (*Actions*), fes clic a **Add Rule(s)...** > selecciona **Blank rule** (Inbound rules) > **OK**.
4. Configura la regla:
   - **Name**: `Redireccio a Flask`
   - **Pattern**: `(.*)` (utilitzant Regular Expressions).
   - **Action type**: `Rewrite`
   - **Rewrite URL**: `http://127.0.0.1:5000/{R:1}`
5. Fes clic a **Apply** a la dreta.

IIS s'encarregarà d'enllaçar el teu domini extern amb la instància local en segon pla de forma instantània.

---

## Pas 5: Configuració de Permisos i Seguretat

1. **Lectura del fitxer CSV**: Assegura't que l'usuari local que executa el servei Windows (per defecte `Local System` o l'usuari configurat a NSSM) té permisos de lectura a la carpeta `data/huts.csv`.
2. **Firewall de Windows**: Si configures IIS al port públic 80 o 443, obre el *Windows Defender Firewall* del servidor i afegeix una regla d'entrada per permetre les connexions a aquests ports. El port local 5000 **no ha d'estar obert al Firewall**, ja que només IIS s'hi ha de comunicar de forma local.

---

## Pas 6: Assignar HTTPS (SSL) amb IIS (Opcional - Recomanat)

Si disposes d'un certificat SSL de l'entitat certificadora (o un de gratuït amb Let's Encrypt / Certify The Web):
1. Importa el certificat a la secció *Server Certificates* de IIS.
2. Fes clic dret a sobre del teu lloc web `VisorHUTs` > **Bindings**.
3. Afegeix un binding de tipus **https** al port **443**, assignant-li el teu certificat SSL.
4. Opcionalment, pots afegir una regla de redirecció a *URL Rewrite* per forçar que tot el trànsit HTTP (port 80) es redirigeixi automàticament a HTTPS (port 443).
