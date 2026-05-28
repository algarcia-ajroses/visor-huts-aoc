// Visor d'Allotjaments de Catalunya | Lògica JavaScript (Leaflet + Interactivitat)

document.addEventListener("DOMContentLoaded", () => {
    // Estat global de l'aplicació
    const state = {
        map: null,
        tilesLayer: null,
        allPoints: [],          // Dades de punts bruts (Array de Arrays)
        filteredPoints: [],     // Punts filtrats pel client
        currentView: "heatmap",  // HEATMAP ACTIU PER DEFECTE! (Molt més ràpid en arrencada)
        precisions: [],
        municipalities: [],
        currentTheme: "light",   // dark, light
        
        // Capes nàtives de Leaflet
        pointsLayer: null,
        heatLayer: null,
        clusterLayer: null,
        
        // Memòria cau d'estat de capes pre-construïdes en segon pla
        pointsBuilt: false,
        clustersBuilt: false,
        
        // Identificadors de control per evitar condicions de carrera
        pointsAnimFrameId: null,
        clusterAnimFrameId: null,
        clusterTimeoutId: null,
        
        // Configuració de Heatmap
        heatRadius: 12,
        heatBlur: 15,
        
        // Filtres actius
        activePrecision: "all",
        activeMunicipality: "all",
        minPlaces: 1,
        
        // Cerca ultra-ràpida O(1) de solapaments
        overlappingMap: new Map()
    };

    // Inicialitzar Icones de Lucide
    lucide.createIcons();

    // Referències a elements del DOM
    const el = {
        themeToggle: document.getElementById("theme-toggle"),
        btnPoints: document.getElementById("btn-points"),
        btnHeatmap: document.getElementById("btn-heatmap"),
        btnClusters: document.getElementById("btn-clusters"),
        heatmapControls: document.getElementById("heatmap-controls"),
        aocLogo: document.getElementById("aoc-logo"),
        
        // Inputs
        inputRadius: document.getElementById("input-radius"),
        inputBlur: document.getElementById("input-blur"),
        valRadius: document.getElementById("val-radius"),
        valBlur: document.getElementById("val-blur"),
        filterPrecision: document.getElementById("filter-precision"),
        filterMunicipality: document.getElementById("filter-municipality"),
        inputMinPlaces: document.getElementById("input-min-places"),
        valMinPlaces: document.getElementById("val-min-places"),
        
        // Mètriques
        metricPointsCount: document.getElementById("metric-points-count"),
        metricAvgIntensity: document.getElementById("metric-avg-intensity"),
        statusDot: document.getElementById("status-dot"),
        statusText: document.getElementById("status-text"),
        sourceBadge: document.getElementById("active-source-text"),
        
        // Interfície
        loader: document.getElementById("loader"),
        errorOverlay: document.getElementById("error-overlay"),
        errorMessage: document.getElementById("error-message-text"),
        errorInstructions: document.getElementById("error-instructions-list"),
        btnRetryMock: document.getElementById("btn-retry-mock"),
        mobileSidebarToggle: document.getElementById("mobile-sidebar-toggle"),
        sidebar: document.getElementById("sidebar"),
        
        // Modal de connexió
        connectionModal: document.getElementById("connection-modal"),
        tabCsv: document.getElementById("tab-csv"),
        tabFabric: document.getElementById("tab-fabric"),
        contentCsv: document.getElementById("content-csv"),
        contentFabric: document.getElementById("content-fabric"),
        btnToggleAdvanced: document.getElementById("btn-toggle-advanced"),
        advancedFields: document.getElementById("advanced-fields"),
        advancedChevron: document.getElementById("advanced-chevron"),
        inputFabricUrl: document.getElementById("input-fabric-url"),
        inputTenantId: document.getElementById("input-tenant-id"),
        inputClientId: document.getElementById("input-client-id"),
        inputClientSecret: document.getElementById("input-client-secret"),
        btnFabricMethodDfs: document.getElementById("btn-fabric-method-dfs"),
        btnFabricMethodSql: document.getElementById("btn-fabric-method-sql"),
        fabricDfsPanel: document.getElementById("fabric-dfs-panel"),
        fabricSqlPanel: document.getElementById("fabric-sql-panel"),
        inputSqlServer: document.getElementById("input-sql-server"),
        inputSqlDb: document.getElementById("input-sql-db"),
        inputSqlUser: document.getElementById("input-sql-user"),
        inputSqlTable: document.getElementById("input-sql-table"),
        btnConnectLoad: document.getElementById("btn-connect-load"),
        connectionErrorMsg: document.getElementById("connection-error-msg"),
        connectionErrorText: document.getElementById("connection-error-text"),
        btnChangeSource: document.getElementById("btn-change-source"),
        aocLogoModal: document.getElementById("aoc-logo-modal")
    };

    // ----------------------------------------------------
    // 1. Inicialització del Mapa Leaflet (Amb Canvas)
    // ----------------------------------------------------
    function initClusterLayer() {
        return L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 60,
            spiderfyOnMaxZoom: true,
            iconCreateFunction: function (cluster) {
                const childCount = cluster.getChildCount();
                
                // Si estem en zoom global, multipliquem per 15 per estimar el total real
                const currentZoom = state.map.getZoom();
                const displayCount = currentZoom <= 9 ? childCount * 15 : childCount;
                
                let c = ' marker-cluster-';
                if (displayCount < 100) {
                    c += 'small';
                } else if (displayCount < 1000) {
                    c += 'medium';
                } else {
                    c += 'large';
                }

                return new L.DivIcon({ 
                    html: '<div><span>' + displayCount.toLocaleString("ca-ES") + '</span></div>', 
                    className: 'marker-cluster' + c, 
                    iconSize: new L.Point(40, 40) 
                });
            }
        });
    }

    function initMap() {
        // preferCanvas: true és el secret del alt rendiment per a 113.000 marcadors
        state.map = L.map("map", {
            zoomControl: false,
            preferCanvas: true,
            attributionControl: true
        }).setView([41.5912, 1.6200], 8);

        L.control.zoom({
            position: 'topright'
        }).addTo(state.map);

        updateMapTiles();

        // Inicialització de les capes principals com a buides
        state.pointsLayer = L.layerGroup();
        state.clusterLayer = initClusterLayer();

        // Escoltar el moviment o zoom del mapa per regenerar el viewport de forma intel·ligent
        let lastZoom = state.map.getZoom();
        state.map.on("moveend", () => {
            if (state.currentView === "points" || state.currentView === "clusters") {
                const currentZoom = state.map.getZoom();
                // Si el zoom ha canviat, o si estem en zoom de detall (> 9) on el viewport canvia al moure's
                if (currentZoom !== lastZoom || currentZoom > 9) {
                    renderMapLayers(true, true);
                }
                lastZoom = currentZoom;
            }
        });
    }

    function updateMapTiles() {
        if (state.tilesLayer) {
            state.map.removeLayer(state.tilesLayer);
        }

        const tileUrl = state.currentTheme === "dark" 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

        const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

        state.tilesLayer = L.tileLayer(tileUrl, {
            attribution: attribution,
            maxZoom: 20
        }).addTo(state.map);
    }

    // ----------------------------------------------------
    // 2. Càrrega asíncrona de Dades
    // ----------------------------------------------------
    async function loadMetadata() {
        try {
            const [precRes, munRes] = await Promise.all([
                fetch("/api/precisions").then(r => r.json()),
                fetch("/api/municipalities").then(r => r.json())
            ]);
            
            if (precRes.success) {
                state.precisions = precRes.precisions;
                populatePrecisionSelector();
            }
            
            if (munRes.success) {
                state.municipalities = munRes.municipalities;
                populateMunicipalitySelector();
            }
        } catch (error) {
            console.error("Error al carregar metadades dels filtres:", error);
        }
    }

    async function loadData() {
        showLoader(true);
        hideError();
        
        // Reset d'estat de capes pre-construïdes
        state.pointsBuilt = false;
        state.clustersBuilt = false;
        state.pointsLayer.clearLayers();
        if (state.map.hasLayer(state.clusterLayer)) {
            state.map.removeLayer(state.clusterLayer);
        }
        state.clusterLayer = initClusterLayer();
        
        try {
            const url = `/api/points?precision=${encodeURIComponent(state.activePrecision)}&municipality=${encodeURIComponent(state.activeMunicipality)}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Error de lectura del fitxer huts.csv.");
            }
            
            state.allPoints = result.data;
            
            if (el.sourceBadge) {
                el.sourceBadge.textContent = result.source;
                if (result.source.includes("Simulació") || result.source.includes("Dades de Simulació")) {
                    el.sourceBadge.classList.add("mock");
                } else {
                    el.sourceBadge.classList.remove("mock");
                }
            }
            
            // 1. Apliquem primer els filtres client bàsics per poder calcular enquadrament
            state.filteredPoints = state.allPoints.filter(p => p[3] >= state.minPlaces);
            
            // 2. Auto-enquadrar dinàmicament en primer lloc per tal que el nivell de zoom de Leaflet sigui correcte
            if (state.filteredPoints.length > 0) {
                if (state.activeMunicipality === "all" && state.activePrecision === "all") {
                    state.map.setView([41.5912, 1.6200], 8);
                } else {
                    const bounds = L.latLngBounds(state.filteredPoints.map(p => [p[1], p[2]]));
                    state.map.fitBounds(bounds.pad(0.15));
                }
            }

            // 3. Ara sí, apliquem filtres visuals generals i renderitzem capes sobre el nou viewport correctament
            applyFilters(false);
            
            if (el.statusDot) el.statusDot.className = "status-indicator-dot green";
            if (el.statusText) el.statusText.textContent = "Visor AOC actiu";
            
        } catch (error) {
            console.error("Error carregant dades del mapa:", error);
            showError(error.message || "No s'ha pogut analitzar el fitxer huts.csv.");
            if (el.statusDot) el.statusDot.className = "status-indicator-dot red";
            if (el.statusText) el.statusText.textContent = "Error de càrrega";
        } finally {
            showLoader(false);
        }
    }

    // ----------------------------------------------------
    // Filtrar punts que es troben dins del viewport actual (amb un marge del 10%)
    function getViewportPoints() {
        if (!state.map) return [];
        const bounds = state.map.getBounds();
        const paddedBounds = bounds.pad(0.10); // 10% de marge de protecció
        return state.filteredPoints.filter(p => paddedBounds.contains([p[1], p[2]]));
    }

    // Construcció asíncrona no-bloquejant de la capa de Punts (60 FPS, Chunked)
    function buildPointsLayerChunked(points, callback, silent = false) {
        if (state.pointsAnimFrameId) {
            cancelAnimationFrame(state.pointsAnimFrameId);
            state.pointsAnimFrameId = null;
        }

        if (!silent) {
            showLoader(true);
            const loaderText = el.loader.querySelector("p");
            if (loaderText) loaderText.textContent = "Preparant vista de punts...";
        }
        
        state.pointsLayer.clearLayers();
        
        const total = points.length;
        const isFiltered = state.activeMunicipality !== "all" || state.activePrecision !== "all";
        
        // Optimització instantània: si hi ha menys de 10.000 elements (ex. sota zoom o filtrat), dibuixem sincrònicament en 5ms
        if (total < 10000) {
            points.forEach(p => {
                const marker = createCustomMarker(p, isFiltered);
                state.pointsLayer.addLayer(marker);
            });
            state.pointsBuilt = true;
            if (!silent) showLoader(false);
            if (callback) callback();
            return;
        }

        state.pointsBuilt = false;
        const chunkSize = 6000; // Processar en paquets de 6K per mantenir 60 FPS
        let index = 0;
        const loaderSubtext = !silent ? el.loader.querySelector("span") : null;
        
        function processNextBatch() {
            const end = Math.min(index + chunkSize, total);
            for (let i = index; i < end; i++) {
                const marker = createCustomMarker(points[i], isFiltered);
                state.pointsLayer.addLayer(marker);
            }
            
            index = end;
            if (!silent && loaderSubtext) {
                const percent = Math.round((index / total) * 100);
                loaderSubtext.textContent = `Processant marcadors: ${index.toLocaleString("ca-ES")} de ${total.toLocaleString("ca-ES")} (${percent}%)`;
            }
            
            if (index < total) {
                state.pointsAnimFrameId = requestAnimationFrame(processNextBatch);
            } else {
                state.pointsBuilt = true;
                if (!silent) showLoader(false);
                if (callback) callback();
            }
        }
        
        state.pointsAnimFrameId = requestAnimationFrame(processNextBatch);
    }

    // Construcció asíncrona no-bloquejant de la capa de Clústers (60 FPS, Chunked, Sense conflictes de Canvas)
    function buildClustersLayerChunked(points, callback, silent = false) {
        if (state.clusterAnimFrameId) {
            cancelAnimationFrame(state.clusterAnimFrameId);
            state.clusterAnimFrameId = null;
        }
        if (state.clusterTimeoutId) {
            clearTimeout(state.clusterTimeoutId);
            state.clusterTimeoutId = null;
        }

        if (!silent) {
            showLoader(true);
            const loaderText = el.loader.querySelector("p");
            if (loaderText) loaderText.textContent = "Preparant clústers de punts...";
        }
        
        if (state.map.hasLayer(state.clusterLayer)) {
            state.map.removeLayer(state.clusterLayer);
        }
        state.clusterLayer = initClusterLayer();
        
        const total = points.length;
        
        // Optimització instantània: si hi ha pocs elements (menys de 10.000), s'indexa immediatament de forma directa
        if (total < 10000) {
            const markers = [];
            points.forEach(p => {
                const marker = createClusterChildMarker(p);
                markers.push(marker);
            });
            try {
                state.clusterLayer.addLayers(markers);
                state.clustersBuilt = true;
            } catch (err) {
                console.error("Error agrupant punts (sota 10K):", err);
            } finally {
                if (!silent) showLoader(false);
                if (callback) callback();
            }
            return;
        }

        state.clustersBuilt = false;
        const chunkSize = 6000;
        let index = 0;
        const markers = [];
        const loaderText = !silent ? el.loader.querySelector("p") : null;
        const loaderSubtext = !silent ? el.loader.querySelector("span") : null;
        
        function processNextBatch() {
            const end = Math.min(index + chunkSize, total);
            for (let i = index; i < end; i++) {
                const marker = createClusterChildMarker(points[i]);
                markers.push(marker);
            }
            
            index = end;
            if (!silent && loaderSubtext) {
                const percent = Math.round((index / total) * 100);
                loaderSubtext.textContent = `Indexant agrupacions: ${index.toLocaleString("ca-ES")} de ${total.toLocaleString("ca-ES")} (${percent}%)`;
            }
            if (index < total) {
                state.clusterAnimFrameId = requestAnimationFrame(processNextBatch);
            } else {
                if (!silent && loaderText) loaderText.textContent = "Agrupant punts al mapa...";
                if (!silent && loaderSubtext) loaderSubtext.textContent = "Dibuixant clústers...";
                
                state.clusterTimeoutId = setTimeout(() => {
                    try {
                        state.clusterLayer.addLayers(markers);
                        state.clustersBuilt = true;
                    } catch (err) {
                        console.error("Error al afegir clústers:", err);
                        showError("No s'han pogut agrupar els marcadors: " + err.message);
                    } finally {
                        if (!silent) showLoader(false);
                        if (callback) callback();
                    }
                }, 50);
            }
        }
        
        state.clusterAnimFrameId = requestAnimationFrame(processNextBatch);
    }

    // ----------------------------------------------------
    // 4. Lògica de filtres i Renderització
    // ----------------------------------------------------
    // Reconstueix la taula hash de coordenades per a cerca O(1) de solapaments
    function rebuildOverlappingMap() {
        state.overlappingMap = new Map();
        for (let i = 0; i < state.filteredPoints.length; i++) {
            const p = state.filteredPoints[i];
            const key = `${p[1]},${p[2]}`;
            if (!state.overlappingMap.has(key)) {
                state.overlappingMap.set(key, [p]);
            } else {
                state.overlappingMap.get(key).push(p);
            }
        }
    }

    function applyFilters(triggerApiReload = false) {
        if (triggerApiReload) {
            loadData();
            return;
        }

        // Filtre client-side per capacitat (p[3] = num_total_places)
        state.filteredPoints = state.allPoints.filter(p => {
            return p[3] >= state.minPlaces;
        });

        // Reconstruïm el mapa de solapaments a l'instant (O(N) - 10ms)
        rebuildOverlappingMap();

        // Al canviar els filtres de selecció, buidem capes i demanem pre-construcció
        state.pointsLayer.clearLayers();
        if (state.map.hasLayer(state.clusterLayer)) {
            state.map.removeLayer(state.clusterLayer);
        }
        state.clusterLayer = initClusterLayer();
        state.pointsBuilt = false;
        state.clustersBuilt = false;
        
        if (state.heatLayer) {
            state.map.removeLayer(state.heatLayer);
            state.heatLayer = null;
        }

        // Dibuixem la vista activa actual
        renderMapLayers();
        updateStatistics();
    }

    function populatePrecisionSelector() {
        el.filterPrecision.innerHTML = '<option value="all">Totes les precisions</option>';
        state.precisions.forEach(prec => {
            const opt = document.createElement("option");
            opt.value = prec;
            opt.textContent = prec;
            el.filterPrecision.appendChild(opt);
        });
        el.filterPrecision.value = state.activePrecision;
    }

    function populateMunicipalitySelector() {
        el.filterMunicipality.innerHTML = '<option value="all">Tots els municipis (Catalunya)</option>';
        state.municipalities.forEach(mun => {
            const opt = document.createElement("option");
            opt.value = mun;
            opt.textContent = mun;
            el.filterMunicipality.appendChild(opt);
        });
        el.filterMunicipality.value = state.activeMunicipality;
    }

    function getIntensityColor(places) {
        if (places >= 20) return "#ef4444"; // Vermell
        if (places >= 10) return "#f97316"; // Taronja
        if (places >= 5) return "#eab308";  // Groc
        if (places >= 3) return "#10b981";  // Verd
        return "#6366f1";                   // Indigo
    }

    // Dibuixa o commuta les capes de forma instantània (0ms) si ja estan pre-construïdes!
    function renderMapLayers(forceRebuild = false, silent = false) {
        // Ocultar totes les capes actives
        if (state.map.hasLayer(state.pointsLayer)) state.map.removeLayer(state.pointsLayer);
        if (state.map.hasLayer(state.clusterLayer)) state.map.removeLayer(state.clusterLayer);
        if (state.heatLayer && state.map.hasLayer(state.heatLayer)) state.map.removeLayer(state.heatLayer);
        state.heatLayer = null;

        const count = state.filteredPoints.length;
        if (count === 0) return;

        // Si el zoom és prou tancat (zoom > 9), processem només els elements del viewport (100% precisió local)
        // Si és un zoom allunyat/global (zoom <= 9), apliquem mostreig de densitat (1 de cada 15 punts)
        // per mostrar una distribució visual fidel de ~7.500 punts de forma instantània sense bloquejar el navegador
        const isZoomed = state.map.getZoom() > 9;
        let pointsToProcess;
        if (isZoomed) {
            pointsToProcess = getViewportPoints();
        } else {
            const downsampleFactor = 15;
            pointsToProcess = state.filteredPoints.filter((_, idx) => idx % downsampleFactor === 0);
        }

        if (state.currentView === "points") {
            if (!state.pointsBuilt || forceRebuild || isZoomed) {
                buildPointsLayerChunked(pointsToProcess, () => {
                    state.map.addLayer(state.pointsLayer);
                }, silent);
            } else {
                state.map.addLayer(state.pointsLayer);
            }
            
        } else if (state.currentView === "clusters") {
            if (!state.clustersBuilt || forceRebuild || isZoomed) {
                buildClustersLayerChunked(pointsToProcess, () => {
                    state.map.addLayer(state.clusterLayer);
                }, silent);
            } else {
                state.map.addLayer(state.clusterLayer);
            }
            
        } else if (state.currentView === "heatmap") {
            renderHeatmapDirectly();
        }
    }

    // Dibuixa el mapa de calor de forma independent (Super ràpid, HTML5 Canvas)
    function renderHeatmapDirectly() {
        const heatData = state.filteredPoints.map(p => {
            const weight = Math.min(1.0, Math.max(0.15, p[3] / 20));
            return [p[1], p[2], weight];
        });

        state.heatLayer = L.heatLayer(heatData, {
            radius: state.heatRadius,
            blur: state.heatBlur,
            maxZoom: 15,
            gradient: {
                0.2: '#4f46e5',
                0.4: '#10b981',
                0.6: '#eab308',
                0.8: '#f97316',
                1.0: '#ef4444'
            }
        }).addTo(state.map);
    }

    // Retorna l'estructura HTML estàndard per a la fitxa d'informació d'un allotjament
    function getPopupCardHTML(data) {
        const uniformColor = "#4f46e5";
        return `
            <div class="map-popup-card">
                <div class="map-popup-title" style="color: ${uniformColor}">${data.label}</div>
                <div class="map-popup-row">
                    <span class="label">Nº Registre:</span>
                    <span class="value">${data.id}</span>
                </div>
                <div class="map-popup-row">
                    <span class="label">Tipus:</span>
                    <span class="value">${data.category}</span>
                </div>
                <div class="map-popup-row">
                    <span class="label">Places totals:</span>
                    <span class="value" style="color: ${uniformColor}; font-weight:800;">${data.intensity} llits</span>
                </div>
                <div class="map-popup-row">
                    <span class="label">Municipi:</span>
                    <span class="value">${data.municipality}</span>
                </div>
                <div class="map-popup-row">
                    <span class="label">Comarca:</span>
                    <span class="value">${data.county}</span>
                </div>
                <div class="map-popup-row" style="border-top: 1px solid var(--border-glass); padding-top: 4px; margin-top: 4px;">
                    <span class="label">Precisió geolocalització:</span>
                    <span class="value" style="font-size:0.72rem; color:var(--text-secondary);">${data.precision}</span>
                </div>
            </div>
        `;
    }

    // Gestiona i vincula el popup del marcador detectant si hi ha més d'un allotjament en la mateixa ubicació (Multi-popup)
    function bindPopupForMarker(marker, p) {
        // Cercar punts en el conjunt actual que comparteixen exactament la mateixa lat/lon (Cerca ultra-ràpida O(1))
        const key = `${p[1]},${p[2]}`;
        const overlapping = state.overlappingMap.get(key) || [p];
        
        if (overlapping.length <= 1) {
            // Cas estàndard: un sol allotjament
            marker.bindPopup('<div class="popup-loading"><div class="spinner tiny"></div>Carregant detalls...</div>', {
                maxWidth: 260,
                closeButton: false
            });
            
            marker.on('popupopen', async function (e) {
                const popup = e.popup;
                if (marker._detailsLoaded) return;
                
                try {
                    const res = await fetch(`/api/point/${p[0]}`);
                    const d = await res.json();
                    
                    if (d.success) {
                        const content = getPopupCardHTML(d.data);
                        popup.setContent(content);
                        marker._detailsLoaded = true;
                    } else {
                        popup.setContent('<div class="popup-error">Error al llegir les dades.</div>');
                    }
                } catch (err) {
                    popup.setContent('<div class="popup-error">Error de connexió.</div>');
                }
            });
        } else {
            // Cas múltiple: llista de selecció d'allotjaments al mateix portal/coordenada
            const uniformColor = "#4f46e5";
            const listHTML = `
                <div class="map-popup-card multi-popup" style="width: 250px; padding: 2px 0;">
                    <div class="map-popup-title" style="color: ${uniformColor}; font-size: 0.8rem; font-weight: 700; border-bottom: 1px solid var(--border-glass); padding-bottom: 6px; margin-bottom: 8px; line-height: 1.3;">
                        ${overlapping.length} allotjaments en aquest punt:
                    </div>
                    <div class="popup-scroll-list" style="max-height: 140px; overflow-y: auto; padding-right: 2px;">
                        ${overlapping.map(pt => `
                            <div class="popup-list-item" style="padding: 6px 8px; margin-bottom: 4px; background: rgba(79,70,229,0.04); border-radius: 4px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;" onmouseover="this.style.borderColor='${uniformColor}'; this.style.background='rgba(79,70,229,0.08)';" onmouseout="this.style.borderColor='transparent'; this.style.background='rgba(79,70,229,0.04)';" onclick="window._loadPopupPointDetails(${pt[0]})">
                                <div style="font-weight: 600; font-size: 0.74rem; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                    Reg: ${pt[5] || "Sense Registre"}
                                </div>
                                <div style="font-size: 0.68rem; color: var(--text-secondary); display: flex; justify-content: space-between; margin-top: 2px;">
                                    <span>Places: <strong>${pt[3]} llits</strong></span>
                                    <span style="color:${uniformColor}; font-weight:600;">Detalls &rarr;</span>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                    <div id="multi-popup-detail-container" style="margin-top: 8px; border-top: 1px solid var(--border-glass); padding-top: 6px; display: none;">
                        <!-- Detalls de l'allotjament seleccionat carregats sota demanda -->
                    </div>
                </div>
            `;
            
            marker.bindPopup(listHTML, {
                maxWidth: 270,
                closeButton: true
            });
        }
    }

    // Registre global per a la càrrega de dades individuals des de la llista del popup
    window._loadPopupPointDetails = async function (idx) {
        const container = document.getElementById("multi-popup-detail-container");
        if (!container) return;
        
        container.style.display = "block";
        container.innerHTML = '<div class="popup-loading" style="font-size:0.7rem; padding: 10px 0;"><div class="spinner tiny"></div>Carregant detalls allotjament...</div>';
        
        try {
            const res = await fetch(`/api/point/${idx}`);
            const d = await res.json();
            
            if (d.success) {
                const uniformColor = "#4f46e5";
                const content = `
                    <div style="font-size: 0.72rem; line-height: 1.45; border-radius: 4px; padding: 4px 6px; background: rgba(0,0,0,0.02);">
                        <div class="map-popup-row" style="margin-top: 2px;">
                            <span class="label" style="font-weight:700;">Nº Registre:</span>
                            <span class="value" style="font-weight:600;">${d.data.id}</span>
                        </div>
                        <div class="map-popup-row">
                            <span class="label" style="font-weight:700;">Nom Comercial:</span>
                            <span class="value" style="font-weight:600; color:${uniformColor};">${d.data.label}</span>
                        </div>
                        <div class="map-popup-row">
                            <span class="label" style="font-weight:700;">Places totals:</span>
                            <span class="value" style="font-weight:800; color:${uniformColor};">${d.data.intensity} llits</span>
                        </div>
                        <div class="map-popup-row">
                            <span class="label" style="font-weight:700;">Comarca:</span>
                            <span class="value">${d.data.county}</span>
                        </div>
                        <div class="map-popup-row" style="border-top: 1px solid var(--border-glass); padding-top: 3px; margin-top: 3px;">
                            <span class="label" style="font-size:0.64rem;">Precisió geolocalització:</span>
                            <span class="value" style="font-size:0.64rem; color:var(--text-secondary);">${d.data.precision}</span>
                        </div>
                    </div>
                `;
                container.innerHTML = content;
            } else {
                container.innerHTML = '<div class="popup-error" style="font-size:0.7rem;">Error al llegir les dades.</div>';
            }
        } catch (err) {
            container.innerHTML = '<div class="popup-error" style="font-size:0.7rem;">Error de connexió.</div>';
        }
    };

    // Dibuixar un marcador DOM lleuger per als elements fills dels clústers (Evita conflictes de Canvas)
    function createClusterChildMarker(p) {
        const uniformColor = "#4f46e5";
        const currentZoom = state.map.getZoom();
        const isZoomed = currentZoom > 9;
        const size = isZoomed ? 5.5 : 3.5;
        const margin = isZoomed ? 1.0 : 0.4;
        
        const marker = L.marker([p[1], p[2]], {
            icon: L.divIcon({
                className: 'custom-cluster-dot',
                html: `<div style="background-color: ${uniformColor}; width: ${size}px; height: ${size}px; border-radius: 50%; border: ${margin}px solid ${state.currentTheme === 'dark' ? '#0b0f19' : '#ffffff'}; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            })
        });

        // POPUP INTEL·LIGENT (SUPORTA ALLOTJAMENTS COINCIDENTS EN MATEIXA UBICACIÓ)
        bindPopupForMarker(marker, p);

        return marker;
    }

    // Dibuixar tots els punts individuals amb el MATEIX ESTIL
    function createCustomMarker(p, isFiltered) {
        // Estil unificat nexe (Indigo corporatiu AOC)
        const uniformColor = "#4f46e5";
        
        // Determinar radi segons zoom actual del mapa per a millor clicabilitat i visibilitat
        const currentZoom = state.map.getZoom();
        const isZoomed = currentZoom > 9;
        const baseRadius = isZoomed ? 4.5 : 2.0;
        const borderWeight = isZoomed ? 1.0 : 0.3;
        
        const marker = L.circleMarker([p[1], p[2]], {
            radius: baseRadius,
            fillColor: uniformColor,
            color: state.currentTheme === "dark" ? "#0b0f19" : "#ffffff",
            weight: borderWeight,
            opacity: 0.8,
            fillOpacity: 0.65
        });

        // POPUP INTEL·LIGENT (SUPORTA ALLOTJAMENTS COINCIDENTS EN MATEIXA UBICACIÓ)
        bindPopupForMarker(marker, p);

        marker.on('mouseover', function () {
            const currentZoom = state.map.getZoom();
            const hoverRadius = currentZoom > 9 ? 8.0 : 5.0;
            this.setStyle({
                radius: hoverRadius,
                fillOpacity: 0.95,
                weight: currentZoom > 9 ? 2.0 : 1.0
            });
        });
        
        marker.on('mouseout', function () {
            const currentZoom = state.map.getZoom();
            const originalRadius = currentZoom > 9 ? 4.5 : 2.0;
            const originalWeight = currentZoom > 9 ? 1.0 : 0.3;
            this.setStyle({
                radius: originalRadius,
                fillOpacity: 0.65,
                weight: originalWeight
            });
        });

        return marker;
    }

    // Recalcula i mostra mètriques basades en els punts actius
    function updateStatistics() {
        const count = state.filteredPoints.length;
        el.metricPointsCount.textContent = count.toLocaleString("ca-ES");

        if (count > 0) {
            const sum = state.filteredPoints.reduce((acc, curr) => acc + (curr[3] || 0), 0);
            const avg = sum / count;
            el.metricAvgIntensity.textContent = avg.toFixed(1) + " places";
            
            if (el.statusDot) el.statusDot.className = "status-indicator-dot green";
            if (el.statusText) el.statusText.textContent = "Pre-càrrega activa";
        } else {
            el.metricAvgIntensity.textContent = "0.0 places";
            if (el.statusDot) el.statusDot.className = "status-indicator-dot yellow";
            if (el.statusText) el.statusText.textContent = "Sense dades filtrades";
        }
    }

    // ----------------------------------------------------
    // 5. Gestors d'Esdeveniments i Controls de la UI
    // ----------------------------------------------------
    
    el.themeToggle.addEventListener("click", () => {
        if (state.currentTheme === "dark") {
            state.currentTheme = "light";
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            // Canviar logo de l'AOC a negre per a tema clar
            el.aocLogo.src = "/static/logo/aoc-horitzontal-negre.svg";
        } else {
            state.currentTheme = "dark";
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            // Canviar logo de l'AOC a blanc per a tema fosc
            el.aocLogo.src = "/static/logo/aoc-horitzontal-blanc.svg";
        }
        updateMapTiles();
        renderMapLayers();
    });

    // Commutador de vistes INSTANTANI
    function setViewRepresentation(view) {
        state.currentView = view;
        
        el.btnPoints.classList.remove("active");
        el.btnHeatmap.classList.remove("active");
        el.btnClusters.classList.remove("active");
        
        if (view === "points") {
            el.btnPoints.classList.add("active");
            el.heatmapControls.classList.add("hidden");
        } else if (view === "heatmap") {
            el.btnHeatmap.classList.add("active");
            el.heatmapControls.classList.remove("hidden");
        } else if (view === "clusters") {
            el.btnClusters.classList.add("active");
            el.heatmapControls.classList.add("hidden");
        }
        
        // Commuta instantàniament les capes carregades
        renderMapLayers();
    }

    el.btnPoints.addEventListener("click", () => setViewRepresentation("points"));
    el.btnHeatmap.addEventListener("click", () => setViewRepresentation("heatmap"));
    el.btnClusters.addEventListener("click", () => setViewRepresentation("clusters"));

    // Sliders del Mapa de Calor
    el.inputRadius.addEventListener("input", (e) => {
        state.heatRadius = parseInt(e.target.value);
        el.valRadius.textContent = state.heatRadius + "px";
        if (state.currentView === "heatmap") {
            if (state.heatLayer) state.map.removeLayer(state.heatLayer);
            renderHeatmapDirectly();
        }
    });

    el.inputBlur.addEventListener("input", (e) => {
        state.heatBlur = parseInt(e.target.value);
        el.valBlur.textContent = state.heatBlur + "px";
        if (state.currentView === "heatmap") {
            if (state.heatLayer) state.map.removeLayer(state.heatLayer);
            renderHeatmapDirectly();
        }
    });

    // Toggle de paràmetres del Mapa de Calor
    const btnToggleHeatmapParams = document.getElementById("btn-toggle-heatmap-params");
    const heatmapSlidersContainer = document.getElementById("heatmap-sliders-container");
    const heatmapChevron = document.getElementById("heatmap-chevron");
    
    if (btnToggleHeatmapParams && heatmapSlidersContainer) {
        btnToggleHeatmapParams.addEventListener("click", () => {
            heatmapSlidersContainer.classList.toggle("hidden");
            const isExpanded = !heatmapSlidersContainer.classList.contains("hidden");
            if (isExpanded) {
                heatmapChevron.setAttribute("data-lucide", "chevron-up");
            } else {
                heatmapChevron.setAttribute("data-lucide", "chevron-down");
            }
            lucide.createIcons();
        });
    }

    // Filtres (API-side!)
    el.filterPrecision.addEventListener("change", (e) => {
        state.activePrecision = e.target.value;
        applyFilters(true); // Cridar a l'API
    });

    el.filterMunicipality.addEventListener("change", (e) => {
        state.activeMunicipality = e.target.value;
        applyFilters(true); // Cridar a l'API
    });

    // Slider client-side amb Debounce per evitar lag al moure'l contínuament
    let filterDebounceTimeout;
    el.inputMinPlaces.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        el.valMinPlaces.textContent = val;
        state.minPlaces = val;
        
        clearTimeout(filterDebounceTimeout);
        filterDebounceTimeout = setTimeout(() => {
            applyFilters(false);
        }, 120);
    });

    function showLoader(show) {
        if (show) {
            el.loader.classList.remove("hidden");
        } else {
            el.loader.classList.add("hidden");
        }
    }

    function showError(message) {
        el.errorMessage.textContent = message;
        el.errorOverlay.classList.remove("hidden");
    }

    function hideError() {
        el.errorOverlay.classList.add("hidden");
    }

    // Fallback
    el.btnRetryMock.addEventListener("click", async () => {
        showLoader(true);
        hideError();
        
        try {
            const response = await fetch("/api/points");
            const result = await response.json();
            
            state.allPoints = result.data;
            if (el.sourceBadge) {
                el.sourceBadge.textContent = "Dades de Simulació";
                el.sourceBadge.classList.add("mock");
            }
            
            state.precisions = ["1. Portal Exacte", "2. Portal (Fuzzy 88%)"];
            state.municipalities = ["Barcelona", "Girona", "Tarragona"];
            populatePrecisionSelector();
            populateMunicipalitySelector();
            applyFilters(false);
            
        } catch (e) {
            state.allPoints = generateLocalMockData();
            if (el.sourceBadge) {
                el.sourceBadge.textContent = "Simulació Frontend";
                el.sourceBadge.classList.add("mock");
            }
            
            state.precisions = ["1. Portal Exacte"];
            state.municipalities = ["Barcelona"];
            populatePrecisionSelector();
            populateMunicipalitySelector();
            applyFilters(false);
        } finally {
            showLoader(false);
        }
    });

    function generateLocalMockData() {
        const points = [];
        for (let i = 0; i < 500; i++) {
            points.push([
                i,
                41.3851 + (Math.random() - 0.5) * 0.4,
                2.1734 + (Math.random() - 0.5) * 0.4,
                Math.round(Math.random() * 20) + 1,
                "Habitatge d'ús turístic",
                "HUTG-" + String(100000 + i)
            ]);
        }
        return points;
    }

    el.mobileSidebarToggle.addEventListener("click", () => {
        el.sidebar.classList.toggle("mobile-open");
        const icon = el.mobileSidebarToggle.querySelector("i");
        if (el.sidebar.classList.contains("mobile-open")) {
            icon.setAttribute("data-lucide", "x");
        } else {
            icon.setAttribute("data-lucide", "menu");
        }
        lucide.createIcons();
    });

    // ----------------------------------------------------
    // 5.1. Lògica del Modal de Connexió (CSV vs Microsoft Fabric)
    // ----------------------------------------------------
    let activeConnectionMode = "csv"; // csv, fabric
    let activeFabricMethod = "dfs"; // dfs, sql
    const defaultFabricUrl = "https://onelake.dfs.fabric.microsoft.com/pd_ml_roses/lakehouse_gold.lakehouse/Tables/gencat_ddoo/hut_geocodificat";

    // Canviar de pestanya (Tab toggles)
    function setConnectionTab(mode) {
        activeConnectionMode = mode;
        el.tabCsv.classList.remove("active");
        el.tabFabric.classList.remove("active");
        el.contentCsv.classList.remove("active");
        el.contentFabric.classList.remove("active");

        if (mode === "csv") {
            el.tabCsv.classList.add("active");
            el.contentCsv.classList.add("active");
        } else {
            el.tabFabric.classList.add("active");
            el.contentFabric.classList.add("active");
            // Pre-omplir la URL per defecte si està buida
            if (!el.inputFabricUrl.value) {
                el.inputFabricUrl.value = defaultFabricUrl;
            }
        }
    }

    el.tabCsv.addEventListener("click", () => setConnectionTab("csv"));
    el.tabFabric.addEventListener("click", () => setConnectionTab("fabric"));

    // Canviar mètode de Fabric (OneLake DFS vs SQL Endpoint)
    function setFabricMethod(method) {
        activeFabricMethod = method;
        el.btnFabricMethodDfs.classList.remove("active");
        el.btnFabricMethodSql.classList.remove("active");
        el.fabricDfsPanel.classList.add("hidden");
        el.fabricSqlPanel.classList.add("hidden");

        if (method === "dfs") {
            el.btnFabricMethodDfs.classList.add("active");
            el.fabricDfsPanel.classList.remove("hidden");
        } else {
            el.btnFabricMethodSql.classList.add("active");
            el.fabricSqlPanel.classList.remove("hidden");
        }
    }

    el.btnFabricMethodDfs.addEventListener("click", () => setFabricMethod("dfs"));
    el.btnFabricMethodSql.addEventListener("click", () => setFabricMethod("sql"));

    // Desplegar/Col·lapsar camps avançats
    el.btnToggleAdvanced.addEventListener("click", () => {
        el.btnToggleAdvanced.classList.toggle("active");
        el.advancedFields.classList.toggle("hidden");
        
        const isExpanded = !el.advancedFields.classList.contains("hidden");
        const icon = el.advancedChevron;
        if (isExpanded) {
            icon.setAttribute("data-lucide", "chevron-up");
        } else {
            icon.setAttribute("data-lucide", "chevron-down");
        }
        lucide.createIcons();
    });

    // Tancar/Obrir modal
    function showConnectionModal(show) {
        if (show) {
            el.connectionModal.classList.remove("hidden");
            // Sincronitzar logos del modal amb el tema
            if (state.currentTheme === "dark") {
                el.aocLogoModal.src = "/static/logo/aoc-horitzontal-blanc.svg";
            } else {
                el.aocLogoModal.src = "/static/logo/aoc-horitzontal-negre.svg";
            }
        } else {
            el.connectionModal.classList.add("hidden");
        }
    }

    el.btnChangeSource.addEventListener("click", () => {
        showConnectionModal(true);
    });

    // Enviar formulari i carregar
    el.btnConnectLoad.addEventListener("click", async () => {
        // Amagar errors anteriors
        el.connectionErrorMsg.classList.add("hidden");
        
        // Mostrar estat de càrrega a sobre del botó
        const originalBtnHTML = el.btnConnectLoad.innerHTML;
        el.btnConnectLoad.disabled = true;
        el.btnConnectLoad.innerHTML = '<div class="spinner tiny" style="width:16px; height:16px; border-width:2px; display:inline-block; margin-right:8px; vertical-align:middle; animation:spin 1s linear infinite;"></div>Carregant font...';

        const finalMode = (activeConnectionMode === "fabric" && activeFabricMethod === "sql") ? "fabric_sql" : activeConnectionMode;

        const payload = {
            mode: finalMode
        };

        if (finalMode === "fabric") {
            const url = el.inputFabricUrl.value.trim();
            if (!url) {
                showModalError("Cal especificar la URL de la taula de Microsoft Fabric.");
                resetBtn();
                return;
            }
            payload.url = url;
            payload.tenant_id = el.inputTenantId.value.trim();
            payload.client_id = el.inputClientId.value.trim();
            payload.client_secret = el.inputClientSecret.value.trim();
        } else if (finalMode === "fabric_sql") {
            const server = el.inputSqlServer.value.trim();
            const db = el.inputSqlDb.value.trim();
            const user = el.inputSqlUser.value.trim();
            const table = el.inputSqlTable.value.trim();

            if (!server || !db || !user) {
                showModalError("Cal especificar el Servidor, Base de Dades i l'Usuari per a la connexió SQL.");
                resetBtn();
                return;
            }
            payload.sql_server = server;
            payload.sql_db = db;
            payload.sql_user = user;
            payload.sql_table = table || "hut_geocodificat";
        }

        try {
            const response = await fetch("/api/setup_connection", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success: tancar modal i inicialitzar interfície
                showConnectionModal(false);
                showLoader(true);
                
                // Recarrega metadades dels selectors i re-dibuixa el mapa
                await loadMetadata();
                
                // Buidem la memòria de construcció de capes prèvies per a refresc obligatori
                state.pointsBuilt = false;
                state.clustersBuilt = false;
                state.pointsLayer.clearLayers();
                state.clusterLayer.clearLayers();
                
                // Carrega dades locals i pinta el mapa
                await loadData();
            } else {
                showModalError(result.message || "Error al connectar amb la font de dades de Microsoft Fabric.");
            }
        } catch (err) {
            console.error("Error al connectar:", err);
            showModalError("Error de connexió amb el servidor de dades. Assegura't que el servidor de desenvolupament és actiu.");
        } finally {
            resetBtn();
        }

        function resetBtn() {
            el.btnConnectLoad.disabled = false;
            el.btnConnectLoad.innerHTML = originalBtnHTML;
            showLoader(false);
        }
    });

    function showModalError(msg) {
        el.connectionErrorText.textContent = msg;
        el.connectionErrorMsg.classList.remove("hidden");
    }

    // ----------------------------------------------------
    // 6. Arrencada de l'Aplicació
    // ----------------------------------------------------
    initMap();
    
    // Verifiquem primer la configuració de dades actual a l'arrencada
    fetch("/api/config")
        .then(res => res.json())
        .then(config => {
            // Sincronitzem el mode seleccionat al formulari segons darrera sessió
            if (config.connection_mode === "fabric" || config.connection_mode === "fabric_sql") {
                setConnectionTab("fabric");
                if (config.connection_mode === "fabric_sql") {
                    setFabricMethod("sql");
                    if (config.sql_server) el.inputSqlServer.value = config.sql_server;
                    if (config.sql_db) el.inputSqlDb.value = config.sql_db;
                    if (config.sql_user) el.inputSqlUser.value = config.sql_user;
                    if (config.sql_table) el.inputSqlTable.value = config.sql_table;
                } else {
                    setFabricMethod("dfs");
                    if (config.fabric_url) {
                        el.inputFabricUrl.value = config.fabric_url;
                    }
                }
            } else {
                setConnectionTab("csv");
            }
            
            if (config.csv_loaded) {
                // Les dades ja estan pre-carregades a la RAM, arrenquem directament en 0ms!
                loadMetadata().then(() => {
                    loadData();
                });
            } else {
                // No hi ha dades carregades a memòria, demanem selecció obligatòria de font
                showConnectionModal(true);
            }
        })
        .catch(err => {
            console.error("Error al llegir configuració inicial, mostrant diàleg:", err);
            showConnectionModal(true);
        });
});
