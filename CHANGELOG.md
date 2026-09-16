# Historial de Canvis (Changelog)

Totes les modificacions i actualitzacions destacades d'aquest projecte es documenten en aquest arxiu.

El format es basa en [Keep a Changelog](https://keepachangelog.com/ca/1.0.0/) i aquest projecte segueix el versionat semàntic ([Semantic Versioning](https://semver.org/spec/v2.0.0.html)).

---

## [1.2.0] - 2026-09-16

### ✨ Novetats i Millores
- **Migració completa als mapes de l'ICGC i OpenStreetMap**:
  - Eliminat completament el proveïdor de teseles CARTO i els seus requeriments de clau d'API (`carto.com/basemaps/apikey`), suprimint definitivament qualsevol marca d'aigua sobre el mapa.
  - S'ha establert el mapa **ICGC Simplificat (Mínim)** com a capa base per defecte: una base neta, minimalista i neutral que ressalta el mapa de calor i els marcadors geolocalitzats dels HUTs.
- **Nou Selector de Mapa Base a la barra lateral**:
  - **ICGC Simplificat (Mínim)** *(Predeterminat)*: Cartografia simplificada de l'Institut Cartogràfic i Geològic de Catalunya.
  - **ICGC Topogràfic (Oficial Catalunya)**: Mapa oficial detallat d'alta precisió.
  - **ICGC Satèl·lit (Ortofoto)**: Imatges aèries reals i ortofotografia d'alta resolució de Catalunya.
  - **OpenStreetMap (Lliure)**: Cartografia global col·laborativa i oberta.
- **Suport avançat per al Tema Fosc**:
  - Implementat filtre de contrast i inversió d'alta fidelitat (`.dark-tiles-filtered`) per als mapes de l'ICGC i OpenStreetMap, adaptant-los de manera elegant a la interfície fosca de vidre esmerilat (glassmorphism) sense alterar els colors del mapa de calor ni dels punts.
- **Migració transparent per a l'usuari**:
  - Neteja automàtica del `localStorage` del navegador per despatxar configuracions antigues de CARTO i activar directament l'ICGC Simplificat en recarregar la pàgina.

---

## [1.1.0] - 2026-09-08

### ✨ Novetats i Millores
- **Suport per a Fonts de Dades GeoJSON Remotes (HTTPS)**:
  - Afegida la possibilitat de descarregar i visualitzar conjunts de dades geoespacials directament des d'una URL web HTTPS (per exemple `https://bpm.roses.cat:8085/visor/huts.geojson`).
  - Assistent gràfic actualitzat per alternar entre CSV local, Microsoft Fabric i GeoJSON remot.
- **Resolució de Solapaments i Multi-Popup**:
  - Detecció d'allotjaments turístics que comparteixen les mateixes coordenades exactes (edificis plurifamiliars).
  - Finestra emergent desplegable amb navegació per llistat i càrrega sota demanda (*lazy loading*).
- **Filtres i Optimitzacions de Rendiment**:
  - Filtratge automàtic de coordenades `0.0` errònies per evitar desquadraments d'escala mundial.
  - Assignació de capacitat mínima per defecte (`1.0`) per evitar l'exclusió accidental d'establiments sense registre de places.
  - Càrrega i indexació prèvia en memòria cau en $O(1)$ mitjançant taules hash.

---

## [1.0.0] - 2026-08-25

### 🚀 Llançament Inicial
- **Visor ultra-lleuger d'alt rendiment**:
  - Renderització de 113.349 allotjaments turístics de Catalunya sobre HTML5 Canvas i WebGL a 60 FPS.
  - Tres modes de visualització interactius: Mapa de Calor (Heatmap), Punts Individuals i Clústers (Agrupacions).
- **Integració nativa amb Microsoft Fabric**:
  - Lectura directa de taules Delta a OneLake (DFS) mitjançant el motor de baix nivell de Rust (`python-deltalake`).
  - Connexió interactiva a SQL Analytics Endpoint compatible amb autenticació de doble factor MFA (Microsoft Authenticator).
- **Interfície Moderna**:
  - Disseny *Glassmorphism* amb suport natiu per a Tema Clar i Tema Fosc.
  - Controls dinàmics de radi de calor, difuminat (blur), filtres per municipi i precisió cadastral.
