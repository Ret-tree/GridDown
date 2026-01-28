/**
 * GridDown Map Module - Multi-Layer Tile Map Integration
 * Supports multiple tile providers with layer blending and offline caching
 */
const MapModule = (function() {
    'use strict';
    
    let canvas, ctx;
    let tileCache = new Map();
    let pendingTiles = new Set();
    
    // Map state
    let mapState = {
        lat: 37.4215,
        lon: -119.1892,
        zoom: 12,
        tileSize: 256,
        isDragging: false,
        dragStart: null,
        lastMousePos: null,
        bearing: 0           // Map rotation in degrees (0 = north up)
    };
    
    // Multi-touch gesture state for pinch/rotation
    let gestureState = {
        isActive: false,
        initialDistance: 0,
        initialAngle: 0,
        initialZoom: 0,
        initialBearing: 0,
        centerX: 0,
        centerY: 0,
        lastDistance: 0,
        lastAngle: 0
    };
    
    // Long press / context menu state
    let longPressState = {
        timer: null,
        startX: 0,
        startY: 0,
        startTime: 0,
        isLongPress: false,
        threshold: 10,        // pixels - max movement before canceling
        duration: 600         // ms - hold duration to trigger
    };
    
    let contextMenuState = {
        isOpen: false,
        x: 0,
        y: 0,
        lat: 0,
        lon: 0
    };
    
    // Tile server configuration - multiple providers
    const TILE_SERVERS = {
        // ===== BASE LAYERS =====
        standard: {
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            type: 'base',
            category: 'general',
            name: 'OpenStreetMap',
            description: 'Standard street map'
        },
        terrain: {
            url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
            attribution: '© OpenTopoMap (CC-BY-SA)',
            maxZoom: 17,
            type: 'base',
            category: 'general',
            name: 'OpenTopoMap',
            description: 'Topographic with contours'
        },
        satellite: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri, Maxar, Earthstar Geographics',
            maxZoom: 19,
            type: 'base',
            category: 'general',
            name: 'Satellite',
            description: 'Aerial/satellite imagery'
        },
        
        // ===== USGS LAYERS =====
        usgs_topo: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Topo',
            description: 'Official USGS topographic maps'
        },
        usgs_imagery: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Imagery',
            description: 'USGS orthoimagery'
        },
        usgs_imagery_topo: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Imagery + Topo',
            description: 'Aerial imagery with topo overlay'
        },
        usgs_hydro: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'overlay',
            category: 'usgs',
            name: 'USGS Hydro',
            description: 'Hydrography (water features)'
        },
        
        // ===== USFS / TOPO LAYERS =====
        // Note: Direct USFS tile servers have CORS restrictions, using Esri alternatives
        usfs_topo: {
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri, USGS, NOAA',
            maxZoom: 15,
            type: 'base',
            category: 'usfs',
            name: 'USA Topo',
            description: 'USGS quads with Forest Service data'
        },
        // NOTE: world_topo is deprecated by Esri - tiles no longer maintained
        // world_topo: {
        //     url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        //     attribution: '© Esri, HERE, Garmin, USGS, NGA',
        //     maxZoom: 19,
        //     type: 'base',
        //     category: 'usfs',
        //     name: 'World Topo',
        //     description: 'Detailed worldwide topographic'
        // },
        natgeo: {
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}',
            attribution: '© National Geographic, Esri',
            maxZoom: 16,
            type: 'base',
            category: 'usfs',
            name: 'Nat Geo',
            description: 'National Geographic style map'
        },
        
        // ===== BLM LAYERS =====
        blm_surface: {
            url: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Bureau of Land Management',
            maxZoom: 16,
            type: 'overlay',
            category: 'blm',
            name: 'BLM Surface Mgmt',
            description: 'Land ownership & management'
        },
        // NOTE: BLM Grazing Allotments is a dynamic service (not cached tiles)
        // It requires ArcGIS export API which isn't currently supported
        // blm_grazing: {
        //     url: 'https://gis.blm.gov/arcgis/rest/services/range/BLM_Natl_Grazing_Allotment/MapServer/export',
        //     attribution: '© Bureau of Land Management',
        //     maxZoom: 14,
        //     type: 'overlay',
        //     category: 'blm',
        //     name: 'BLM Grazing',
        //     description: 'Grazing allotments'
        // },
        
        // ===== OVERLAY LAYERS =====
        labels: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri',
            maxZoom: 19,
            type: 'overlay',
            category: 'overlay',
            name: 'Labels',
            description: 'Place names and boundaries'
        },
        hillshade: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri',
            maxZoom: 16,
            type: 'overlay',
            category: 'overlay',
            name: 'Hillshade',
            description: 'Terrain shading'
        },
        transportation: {
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Esri',
            maxZoom: 19,
            type: 'overlay',
            category: 'overlay',
            name: 'Roads',
            description: 'Major roads overlay'
        }
    };
    
    // Current active layers
    let activeLayers = {
        base: 'standard',  // standard | terrain | satellite
        overlays: []       // ['labels', 'hillshade']
    };
    
    // Custom tile layers (for satellite weather, etc.)
    // Map of layerId -> { url, opacity, maxZoom, attribution, zIndex }
    const customTileLayers = new Map();

    // Track initialization state
    let initialized = false;
    
    // Create scoped event manager for map module
    let mapEvents = null;

    /**
     * Initialize the map module
     */
    function init() {
        // Prevent double initialization
        if (initialized) {
            console.debug('MapModule already initialized');
            return;
        }
        
        canvas = document.getElementById('map-canvas');
        if (!canvas) return console.error('Map canvas not found');
        ctx = canvas.getContext('2d');
        
        // Initialize scoped event manager
        mapEvents = EventManager.createScopedManager(EventManager.SCOPES.MAP);
        
        // Load saved position and layer preferences
        loadMapPosition();
        loadLayerPreferences();
        
        resize();
        
        // Track resize listener with EventManager
        const debouncedResize = Helpers.debounce(resize, 250);
        mapEvents.on(window, 'resize', debouncedResize);
        
        // Mouse events (use EventManager for all canvas events)
        mapEvents.on(canvas, 'mousedown', handleMouseDown);
        mapEvents.on(canvas, 'mousemove', handleMouseMove);
        mapEvents.on(canvas, 'mouseup', handleMouseUp);
        mapEvents.on(canvas, 'mouseleave', handleMouseLeave);
        mapEvents.on(canvas, 'wheel', handleWheel, { passive: false });
        mapEvents.on(canvas, 'click', handleClick);
        mapEvents.on(canvas, 'dblclick', handleDoubleClick);
        mapEvents.on(canvas, 'contextmenu', handleRightClick);
        
        // Touch events
        mapEvents.on(canvas, 'touchstart', handleTouchStart, { passive: false });
        mapEvents.on(canvas, 'touchmove', handleTouchMove, { passive: false });
        mapEvents.on(canvas, 'touchend', handleTouchEnd);
        
        // Keyboard shortcuts (document-level)
        mapEvents.on(document, 'keydown', handleGlobalKeyDown);
        
        initialized = true;
        
        // Subscribe to state changes
        State.subscribe(render, ['waypoints', 'routes', 'mapLayers', 'selectedWaypoint', 'mousePosition']);
        
        // Subscribe to GPS position updates
        if (typeof GPSModule !== 'undefined') {
            GPSModule.subscribe(() => {
                render(); // Re-render map when GPS position updates
            });
        }
        
        // Setup coordinate format toggle
        setupCoordFormatToggle();
        
        // Setup declination display
        setupDeclinationDisplay();
        
        renderControls();
        render();
        updateScaleBar();
        
        console.log('Map module initialized with OSM tiles');
    }
    
    /**
     * Setup declination display and click handler
     */
    function setupDeclinationDisplay() {
        // Initialize declination module
        if (typeof DeclinationModule !== 'undefined') {
            DeclinationModule.init();
            
            // Update declination for current map center
            updateDeclinationDisplay();
            
            // Setup click handler for declination display
            const decDisplay = document.getElementById('declination-display');
            if (decDisplay) {
                decDisplay.onclick = showDeclinationDetails;
            }
            
            // Listen for declination updates
            if (typeof Events !== 'undefined') {
                Events.on('declination:updated', () => {
                    const decValue = document.getElementById('declination-value');
                    if (decValue) {
                        const current = DeclinationModule.getCurrent();
                        decValue.textContent = DeclinationModule.formatDeclination(current.declination);
                    }
                });
            }
        }
    }
    
    /**
     * Update declination display for current map center
     */
    function updateDeclinationDisplay() {
        if (typeof DeclinationModule === 'undefined') return;
        
        const decValue = document.getElementById('declination-value');
        if (!decValue) return;
        
        DeclinationModule.updatePosition(mapState.lat, mapState.lon);
        const current = DeclinationModule.getCurrent();
        decValue.textContent = DeclinationModule.formatDeclination(current.declination);
    }
    
    /**
     * Show declination details modal
     */
    function showDeclinationDetails() {
        if (typeof DeclinationModule === 'undefined' || typeof ModalsModule === 'undefined') return;
        
        const current = DeclinationModule.getCurrent();
        const modelInfo = DeclinationModule.getModelInfo();
        
        const statusColor = {
            valid: '#22c55e',
            degraded: '#f59e0b',
            expired: '#ef4444',
            invalid: '#ef4444'
        }[modelInfo.status] || '#6b7280';
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="width:380px">
                    <div class="modal__header">
                        <h3 class="modal__title">🧭 Magnetic Declination</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <!-- Current Values -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
                            <div style="padding:16px;background:rgba(34,197,94,0.1);border-radius:12px;text-align:center">
                                <div style="font-size:24px;font-weight:600;color:#22c55e">${DeclinationModule.formatDeclination(current.declination)}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">DECLINATION</div>
                            </div>
                            <div style="padding:16px;background:rgba(59,130,246,0.1);border-radius:12px;text-align:center">
                                <div style="font-size:24px;font-weight:600;color:#3b82f6">${DeclinationModule.formatInclination(current.inclination)}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">INCLINATION</div>
                            </div>
                        </div>
                        
                        <!-- Explanation -->
                        <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:16px">
                            <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:8px">
                                ${current.declination >= 0 
                                    ? `Magnetic north is <strong style="color:#f97316">${Math.abs(current.declination).toFixed(1)}° EAST</strong> of true north` 
                                    : `Magnetic north is <strong style="color:#f97316">${Math.abs(current.declination).toFixed(1)}° WEST</strong> of true north`}
                            </div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                ${current.declination >= 0 
                                    ? 'Add declination to magnetic bearing to get true bearing' 
                                    : 'Subtract declination from magnetic bearing to get true bearing'}
                            </div>
                        </div>
                        
                        <!-- Bearing Converter -->
                        <div class="section-label">Bearing Converter</div>
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
                            <div style="flex:1">
                                <label style="font-size:10px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">TRUE BEARING</label>
                                <input type="number" id="true-bearing-input" min="0" max="360" step="1" placeholder="0-360" 
                                    style="padding:10px;font-family:'IBM Plex Mono',monospace;text-align:center">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;padding-top:14px">
                                <button class="btn btn--secondary" id="convert-to-mag" style="padding:6px 10px;font-size:11px">→ MAG</button>
                                <button class="btn btn--secondary" id="convert-to-true" style="padding:6px 10px;font-size:11px">← TRUE</button>
                            </div>
                            <div style="flex:1">
                                <label style="font-size:10px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">MAGNETIC BEARING</label>
                                <input type="number" id="mag-bearing-input" min="0" max="360" step="1" placeholder="0-360" 
                                    style="padding:10px;font-family:'IBM Plex Mono',monospace;text-align:center">
                            </div>
                        </div>
                        
                        <!-- Quick Reference -->
                        <div class="section-label">Quick Reference</div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
                            ${[0, 90, 180, 270].map(trueBrg => {
                                const magBrg = DeclinationModule.trueToMagnetic(trueBrg, current.declination);
                                const compass = ['N', 'E', 'S', 'W'][trueBrg / 90];
                                return `
                                    <div style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;text-align:center">
                                        <div style="font-size:14px;font-weight:600">${compass}</div>
                                        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">True: ${trueBrg}°</div>
                                        <div style="font-size:10px;color:#f97316">Mag: ${Math.round(magBrg)}°</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <!-- Model Info -->
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:11px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                                <span style="color:rgba(255,255,255,0.5)">Model:</span>
                                <span style="font-family:'IBM Plex Mono',monospace">${modelInfo.model}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                                <span style="color:rgba(255,255,255,0.5)">Valid Until:</span>
                                <span>${modelInfo.validUntil}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                                <span style="color:rgba(255,255,255,0.5)">Status:</span>
                                <span style="color:${statusColor};font-weight:500">${modelInfo.status.toUpperCase()}</span>
                            </div>
                            ${modelInfo.warning ? `
                                <div style="margin-top:8px;padding:8px;background:rgba(245,158,11,0.1);border-radius:6px;color:#f59e0b">
                                    ⚠️ ${modelInfo.warning}
                                </div>
                            ` : ''}
                            <div style="margin-top:8px;color:rgba(255,255,255,0.4)">
                                Location: ${mapState.lat.toFixed(4)}°, ${mapState.lon.toFixed(4)}°
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary btn--full" id="modal-done">Done</button>
                    </div>
                </div>
            </div>
        `;
        
        // Event handlers
        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-done').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };
        
        // Bearing converter
        const trueInput = modalContainer.querySelector('#true-bearing-input');
        const magInput = modalContainer.querySelector('#mag-bearing-input');
        
        modalContainer.querySelector('#convert-to-mag').onclick = () => {
            const trueBrg = parseFloat(trueInput.value);
            if (!isNaN(trueBrg)) {
                magInput.value = Math.round(DeclinationModule.trueToMagnetic(trueBrg, current.declination));
            }
        };
        
        modalContainer.querySelector('#convert-to-true').onclick = () => {
            const magBrg = parseFloat(magInput.value);
            if (!isNaN(magBrg)) {
                trueInput.value = Math.round(DeclinationModule.magneticToTrue(magBrg, current.declination));
            }
        };
        
        // Auto-convert on Enter
        trueInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const trueBrg = parseFloat(trueInput.value);
                if (!isNaN(trueBrg)) {
                    magInput.value = Math.round(DeclinationModule.trueToMagnetic(trueBrg, current.declination));
                }
            }
        };
        
        magInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const magBrg = parseFloat(magInput.value);
                if (!isNaN(magBrg)) {
                    trueInput.value = Math.round(DeclinationModule.magneticToTrue(magBrg, current.declination));
                }
            }
        };
    }
    
    /**
     * Handle global keyboard shortcuts
     */
    function handleGlobalKeyDown(e) {
        // Don't trigger if focused on input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        // M - Toggle measure mode
        if (e.key === 'm' || e.key === 'M') {
            if (typeof MeasureModule !== 'undefined') {
                MeasureModule.toggle();
                renderControls();
                render();
            }
        }
        
        // + or = - Zoom in
        if (e.key === '+' || e.key === '=') {
            mapState.zoom = Math.min(19, mapState.zoom + 1);
            document.getElementById('zoom-level').textContent = mapState.zoom + 'z';
            updateScaleBar();
            render();
            saveMapPosition();
        }
        
        // - - Zoom out
        if (e.key === '-') {
            mapState.zoom = Math.max(3, mapState.zoom - 1);
            document.getElementById('zoom-level').textContent = mapState.zoom + 'z';
            updateScaleBar();
            render();
            saveMapPosition();
        }
        
        // G - Toggle grid
        if (e.key === 'g' || e.key === 'G') {
            State.Map.toggleLayer('grid');
            saveLayerPreferences();
            renderControls();
        }
    }
    
    /**
     * Setup coordinate format toggle click handler
     */
    function setupCoordFormatToggle() {
        const formatEl = document.getElementById('coords-format');
        if (!formatEl) return;
        
        // Update display to current format
        updateCoordFormatDisplay();
        
        // Click to cycle through formats
        formatEl.onclick = () => {
            if (typeof Coordinates === 'undefined') return;
            
            const formats = ['dd', 'dms', 'ddm', 'utm', 'mgrs'];
            const current = Coordinates.getFormat();
            const currentIdx = formats.indexOf(current);
            const nextIdx = (currentIdx + 1) % formats.length;
            const nextFormat = formats[nextIdx];
            
            Coordinates.setFormat(nextFormat);
            Storage.Settings.set('coordinateFormat', nextFormat);
            updateCoordFormatDisplay();
            
            // Show toast with format name
            const formatNames = {
                dd: 'Decimal Degrees',
                dms: 'Degrees Minutes Seconds',
                ddm: 'Degrees Decimal Minutes',
                utm: 'UTM',
                mgrs: 'Military Grid (MGRS)'
            };
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`Format: ${formatNames[nextFormat]}`, 'success');
            }
        };
        
        // Listen for format changes from settings
        if (typeof Events !== 'undefined') {
            Events.on('coords:formatChanged', () => {
                updateCoordFormatDisplay();
            });
        }
    }
    
    /**
     * Update coordinate format display label
     */
    function updateCoordFormatDisplay() {
        const formatEl = document.getElementById('coords-format');
        if (!formatEl || typeof Coordinates === 'undefined') return;
        
        const format = Coordinates.getFormat();
        const labels = {
            dd: 'DD',
            dms: 'DMS',
            ddm: 'DDM',
            utm: 'UTM',
            mgrs: 'MGRS'
        };
        formatEl.textContent = labels[format] || 'DD';
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(dpr, dpr);
        render();
    }

    function latLonToTile(lat, lon, zoom) {
        const n = Math.pow(2, zoom);
        const x = Math.floor((lon + 180) / 360 * n);
        const latRad = lat * Math.PI / 180;
        const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
        return { x, y };
    }

    function latLonToPixel(lat, lon) {
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const n = Math.pow(2, mapState.zoom);
        
        const centerX = (mapState.lon + 180) / 360 * n;
        const centerLatRad = mapState.lat * Math.PI / 180;
        const centerY = (1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2 * n;
        
        const pointX = (lon + 180) / 360 * n;
        const pointLatRad = lat * Math.PI / 180;
        const pointY = (1 - Math.log(Math.tan(pointLatRad) + 1 / Math.cos(pointLatRad)) / Math.PI) / 2 * n;
        
        // Calculate unrotated pixel position
        let pixelX = width / 2 + (pointX - centerX) * mapState.tileSize;
        let pixelY = height / 2 + (pointY - centerY) * mapState.tileSize;
        
        // Apply rotation around center if map is rotated
        if (mapState.bearing !== 0) {
            const bearingRad = -mapState.bearing * Math.PI / 180;
            const dx = pixelX - width / 2;
            const dy = pixelY - height / 2;
            pixelX = width / 2 + dx * Math.cos(bearingRad) - dy * Math.sin(bearingRad);
            pixelY = height / 2 + dx * Math.sin(bearingRad) + dy * Math.cos(bearingRad);
        }
        
        return { x: pixelX, y: pixelY };
    }

    function pixelToLatLon(pixelX, pixelY) {
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const n = Math.pow(2, mapState.zoom);
        
        // Un-rotate the pixel position if map is rotated
        let unrotatedX = pixelX;
        let unrotatedY = pixelY;
        
        if (mapState.bearing !== 0) {
            const bearingRad = mapState.bearing * Math.PI / 180;
            const dx = pixelX - width / 2;
            const dy = pixelY - height / 2;
            unrotatedX = width / 2 + dx * Math.cos(bearingRad) - dy * Math.sin(bearingRad);
            unrotatedY = height / 2 + dx * Math.sin(bearingRad) + dy * Math.cos(bearingRad);
        }
        
        const centerX = (mapState.lon + 180) / 360 * n;
        const centerLatRad = mapState.lat * Math.PI / 180;
        const centerY = (1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2 * n;
        
        const pointX = centerX + (unrotatedX - width / 2) / mapState.tileSize;
        const pointY = centerY + (unrotatedY - height / 2) / mapState.tileSize;
        
        const lon = pointX / n * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * pointY / n)));
        const lat = latRad * 180 / Math.PI;
        
        return { lat, lon };
    }

    function loadTile(x, y, z, serverKey = null) {
        const server = serverKey || activeLayers.base;
        const key = `${server}/${z}/${x}/${y}`;
        
        if (tileCache.has(key)) {
            return Promise.resolve(tileCache.get(key));
        }
        
        if (pendingTiles.has(key)) {
            // Wait for pending tile with timeout to prevent memory leaks
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 200; // 10 seconds max (50ms * 200)
                const checkCache = setInterval(() => {
                    attempts++;
                    if (tileCache.has(key)) {
                        clearInterval(checkCache);
                        resolve(tileCache.get(key));
                    } else if (attempts >= maxAttempts || !pendingTiles.has(key)) {
                        // Timeout or tile failed - clean up interval
                        clearInterval(checkCache);
                        reject(new Error(`Tile load timeout: ${key}`));
                    }
                }, 50);
            });
        }
        
        pendingTiles.add(key);
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            const tileServer = TILE_SERVERS[server];
            if (!tileServer) {
                pendingTiles.delete(key);
                reject(new Error(`Unknown tile server: ${server}`));
                return;
            }
            
            // Check zoom limit
            if (z > tileServer.maxZoom) {
                pendingTiles.delete(key);
                reject(new Error(`Zoom ${z} exceeds max ${tileServer.maxZoom} for ${server}`));
                return;
            }
            
            const url = tileServer.url
                .replace('{z}', z)
                .replace('{x}', x)
                .replace('{y}', y);
            
            img.onload = () => {
                tileCache.set(key, img);
                pendingTiles.delete(key);
                // Limit cache size per layer type
                const cacheLimit = tileServer.type === 'overlay' ? 100 : 200;
                const layerKeys = Array.from(tileCache.keys()).filter(k => k.startsWith(server + '/'));
                if (layerKeys.length > cacheLimit) {
                    tileCache.delete(layerKeys[0]);
                }
                resolve(img);
            };
            
            img.onerror = () => {
                pendingTiles.delete(key);
                reject(new Error(`Failed to load tile ${key}`));
            };
            
            img.src = url;
        });
    }

    function render() {
        if (!ctx) return;
        
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const layers = State.get('mapLayers');
        
        // Update active layers based on state
        updateActiveLayersFromState(layers);
        
        // Clear entire canvas
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, width, height);
        
        // Save state before applying rotation
        ctx.save();
        
        // Apply rotation around canvas center
        if (mapState.bearing !== 0) {
            const centerX = width / 2;
            const centerY = height / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(-mapState.bearing * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
        }
        
        // Render rotated map content
        // Need to render more tiles when rotated to cover corners
        const rotatedWidth = mapState.bearing !== 0 ? width * 1.5 : width;
        const rotatedHeight = mapState.bearing !== 0 ? height * 1.5 : height;
        
        // Render base layer
        renderTilesForLayer(rotatedWidth, rotatedHeight, activeLayers.base);
        
        // Render custom tile layers (satellite weather, etc.)
        renderCustomTileLayers(rotatedWidth, rotatedHeight);
        
        // Render overlays
        for (const overlay of activeLayers.overlays) {
            renderTilesForLayer(rotatedWidth, rotatedHeight, overlay, true);
        }
        
        if (layers.grid) renderGrid(width, height);
        renderRoutes(width, height);
        renderMeasurements(width, height);
        renderWaypoints(width, height);
        renderTeamMembers(width, height);
        renderAPRSStations(width, height);
        renderRadiaCodeOverlay(width, height);
        renderRFSentinelOverlay(width, height);
        renderNavigationBreadcrumbs(width, height);
        renderGPSPosition(width, height);
        renderCrosshair(width, height);
        renderDrawingRegion(width, height);
        renderRFLOSOverlay(width, height);
        renderStreamGaugeOverlay(width, height);
        
        // Restore state (removes rotation)
        ctx.restore();
        
        // Render non-rotated UI elements
        renderAttribution(width, height);
        renderCompassRose(width, height);
    }
    
    /**
     * Render navigation breadcrumbs trail
     */
    function renderNavigationBreadcrumbs(width, height) {
        if (typeof NavigationModule === 'undefined') return;
        
        const navState = NavigationModule.getState();
        if (!navState.isActive || !navState.settings?.showBreadcrumbs) return;
        
        const breadcrumbs = navState.breadcrumbs || [];
        if (breadcrumbs.length < 2) return;
        
        // Draw breadcrumb trail
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        breadcrumbs.forEach((point, i) => {
            const pixel = latLonToPixel(point.lat, point.lon);
            if (i === 0) {
                ctx.moveTo(pixel.x, pixel.y);
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw breadcrumb dots
        ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
        breadcrumbs.forEach((point, i) => {
            // Only draw every 5th point to reduce clutter
            if (i % 5 !== 0 && i !== breadcrumbs.length - 1) return;
            
            const pixel = latLonToPixel(point.lat, point.lon);
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    /**
     * Render measurements overlay from MeasureModule
     */
    function renderMeasurements(width, height) {
        if (typeof MeasureModule === 'undefined') return;
        
        // Only render if there are measurements or measure mode is active
        const data = MeasureModule.getMeasurementData();
        if (!data || (data.points.length === 0 && !MeasureModule.isActive())) return;
        
        MeasureModule.render(ctx, latLonToPixel, width, height);
    }
    
    /**
     * Update activeLayers based on State mapLayers
     */
    function updateActiveLayersFromState(layers) {
        // Determine base layer - use new baseLayer property if available
        if (layers.baseLayer && TILE_SERVERS[layers.baseLayer]) {
            activeLayers.base = layers.baseLayer;
        } else if (layers.satellite) {
            activeLayers.base = 'satellite';
        } else if (layers.terrain) {
            activeLayers.base = 'terrain';
        } else {
            activeLayers.base = 'standard';
        }
        
        // Determine overlays from new overlays array
        activeLayers.overlays = [];
        
        if (layers.overlays && Array.isArray(layers.overlays)) {
            // Use the new overlays array
            for (const overlayKey of layers.overlays) {
                if (TILE_SERVERS[overlayKey] && TILE_SERVERS[overlayKey].type === 'overlay') {
                    activeLayers.overlays.push(overlayKey);
                }
            }
        } else {
            // Legacy fallback
            if (layers.satellite && layers.terrain) {
                activeLayers.overlays.push('labels');
            }
            if (layers.satellite && layers.contours) {
                activeLayers.overlays.push('hillshade');
            }
        }
    }

    function renderTilesForLayer(width, height, layerKey, isOverlay = false) {
        const zoom = mapState.zoom;
        const tileSize = mapState.tileSize;
        const centerTile = latLonToTile(mapState.lat, mapState.lon, zoom);
        const n = Math.pow(2, zoom);
        
        const server = TILE_SERVERS[layerKey];
        if (!server) return;
        
        // Check zoom limit - use max zoom tiles if beyond limit
        const effectiveZoom = Math.min(zoom, server.maxZoom);
        const zoomDiff = zoom - effectiveZoom;
        const scaleFactor = Math.pow(2, zoomDiff);
        
        const centerX = (mapState.lon + 180) / 360 * n;
        const centerLatRad = mapState.lat * Math.PI / 180;
        const centerY = (1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2 * n;
        
        const offsetX = (centerX - centerTile.x) * tileSize;
        const offsetY = (centerY - centerTile.y) * tileSize;
        
        const tilesX = Math.ceil(width / tileSize) + 2;
        const tilesY = Math.ceil(height / tileSize) + 2;
        
        const startTileX = centerTile.x - Math.floor(tilesX / 2);
        const startTileY = centerTile.y - Math.floor(tilesY / 2);
        
        // Set composite operation for overlays
        if (isOverlay) {
            ctx.globalAlpha = 0.7;
        }
        
        let loadingCount = 0;
        
        for (let dx = 0; dx < tilesX; dx++) {
            for (let dy = 0; dy < tilesY; dy++) {
                const tileX = startTileX + dx;
                const tileY = startTileY + dy;
                const wrappedTileX = ((tileX % n) + n) % n;
                
                if (tileY < 0 || tileY >= n) continue;
                
                const screenX = width / 2 + (dx - Math.floor(tilesX / 2)) * tileSize - offsetX;
                const screenY = height / 2 + (dy - Math.floor(tilesY / 2)) * tileSize - offsetY;
                
                // Only draw placeholder for base layer
                if (!isOverlay) {
                    ctx.fillStyle = '#2a2f3e';
                    ctx.fillRect(screenX, screenY, tileSize, tileSize);
                }
                
                const cacheKey = `${layerKey}/${effectiveZoom}/${wrappedTileX}/${tileY}`;
                if (tileCache.has(cacheKey)) {
                    // If we're past max zoom, scale up the tile
                    if (scaleFactor > 1) {
                        // Calculate which portion of the tile to draw
                        const srcSize = tileSize / scaleFactor;
                        const srcX = ((wrappedTileX * scaleFactor) % 1) * tileSize;
                        const srcY = ((tileY * scaleFactor) % 1) * tileSize;
                        ctx.drawImage(tileCache.get(cacheKey), srcX, srcY, srcSize, srcSize, screenX, screenY, tileSize, tileSize);
                    } else {
                        ctx.drawImage(tileCache.get(cacheKey), screenX, screenY, tileSize, tileSize);
                    }
                } else {
                    // Show loading indicator for base layer
                    if (!isOverlay) {
                        loadingCount++;
                        // Draw loading placeholder
                        ctx.fillStyle = '#1e2433';
                        ctx.fillRect(screenX, screenY, tileSize, tileSize);
                        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                        ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                    }
                    
                    loadTile(wrappedTileX, tileY, effectiveZoom, layerKey)
                        .then(() => render())
                        .catch(() => {});
                }
            }
        }
        
        // Reset alpha
        if (isOverlay) {
            ctx.globalAlpha = 1.0;
        }
        
        // Show loading indicator if tiles are loading
        if (loadingCount > 0 && !isOverlay) {
            showTileLoadingIndicator(width, height, loadingCount);
        }
    }
    
    /**
     * Show tile loading indicator
     */
    function showTileLoadingIndicator(width, height, count) {
        ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
        ctx.fillRect(width - 120, 70, 110, 30);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
        ctx.strokeRect(width - 120, 70, 110, 30);
        
        ctx.fillStyle = '#f97316';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`⏳ Loading ${count} tiles`, width - 112, 89);
    }

    // ==================== CUSTOM TILE LAYERS ====================
    
    /**
     * Add a custom tile layer (for satellite weather, etc.)
     * @param {Object} layerInfo - { id, name, type, url, opacity, maxZoom, attribution, zIndex }
     */
    function addCustomTileLayer(layerInfo) {
        if (!layerInfo || !layerInfo.id || !layerInfo.url) {
            console.error('Invalid layer info:', layerInfo);
            return false;
        }
        
        customTileLayers.set(layerInfo.id, {
            id: layerInfo.id,
            name: layerInfo.name || layerInfo.id,
            type: layerInfo.type || 'tiles',
            url: layerInfo.url,
            opacity: layerInfo.opacity ?? 0.7,
            maxZoom: layerInfo.maxZoom || 18,
            attribution: layerInfo.attribution || '',
            zIndex: layerInfo.zIndex ?? 50
        });
        
        console.log('Added custom tile layer:', layerInfo.id);
        render();
        return true;
    }
    
    /**
     * Remove a custom tile layer
     */
    function removeCustomTileLayer(layerId) {
        if (!customTileLayers.has(layerId)) {
            return false;
        }
        
        customTileLayers.delete(layerId);
        console.log('Removed custom tile layer:', layerId);
        render();
        return true;
    }
    
    /**
     * Get all custom tile layers
     */
    function getCustomTileLayers() {
        return new Map(customTileLayers);
    }
    
    /**
     * Set opacity for a custom tile layer
     */
    function setCustomLayerOpacity(layerId, opacity) {
        const layer = customTileLayers.get(layerId);
        if (!layer) return false;
        
        layer.opacity = Math.max(0, Math.min(1, opacity));
        render();
        return true;
    }
    
    /**
     * Render all custom tile layers
     */
    function renderCustomTileLayers(width, height) {
        if (customTileLayers.size === 0) return;
        
        // Sort layers by zIndex
        const sortedLayers = [...customTileLayers.values()]
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        
        for (const layer of sortedLayers) {
            ctx.globalAlpha = layer.opacity;
            renderCustomTileLayer(width, height, layer);
            ctx.globalAlpha = 1.0;
        }
    }
    
    /**
     * Render a single custom tile layer
     */
    function renderCustomTileLayer(width, height, layer) {
        const effectiveZoom = Math.min(mapState.zoom, layer.maxZoom);
        const scale = Math.pow(2, mapState.zoom);
        const worldSize = mapState.tileSize * scale;
        
        const centerX = ((mapState.lon + 180) / 360) * worldSize;
        const centerY = ((1 - Math.log(Math.tan(mapState.lat * Math.PI / 180) + 
                         1 / Math.cos(mapState.lat * Math.PI / 180)) / Math.PI) / 2) * worldSize;
        
        const startX = centerX - width / 2;
        const startY = centerY - height / 2;
        
        const startTileX = Math.floor(startX / mapState.tileSize);
        const startTileY = Math.floor(startY / mapState.tileSize);
        const endTileX = Math.ceil((startX + width) / mapState.tileSize);
        const endTileY = Math.ceil((startY + height) / mapState.tileSize);
        
        const maxTile = Math.pow(2, effectiveZoom) - 1;
        
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const wrappedX = ((tileX % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
                
                if (tileY < 0 || tileY > maxTile) continue;
                
                const drawX = tileX * mapState.tileSize - startX;
                const drawY = tileY * mapState.tileSize - startY;
                
                // Replace placeholders in URL template
                const url = layer.url
                    .replace('{z}', effectiveZoom)
                    .replace('{x}', wrappedX)
                    .replace('{y}', tileY);
                
                const cacheKey = `custom:${layer.id}:${effectiveZoom}:${wrappedX}:${tileY}`;
                
                // Try to draw from cache
                if (tileCache.has(cacheKey)) {
                    const cached = tileCache.get(cacheKey);
                    if (cached.loaded) {
                        ctx.drawImage(cached.img, drawX, drawY, mapState.tileSize, mapState.tileSize);
                    }
                } else if (!pendingTiles.has(cacheKey)) {
                    // Start loading tile
                    pendingTiles.add(cacheKey);
                    
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    img.onload = () => {
                        tileCache.set(cacheKey, { img, loaded: true });
                        pendingTiles.delete(cacheKey);
                        render();
                    };
                    
                    img.onerror = () => {
                        pendingTiles.delete(cacheKey);
                        // Cache failure briefly to avoid repeated attempts
                        tileCache.set(cacheKey, { loaded: false, error: true });
                        setTimeout(() => tileCache.delete(cacheKey), 30000);
                    };
                    
                    img.src = url;
                }
            }
        }
    }

    function renderGrid(width, height) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 0; y < height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }

    function renderRoutes(width, height) {
        const routes = State.get('routes');
        const waypoints = State.get('waypoints');
        
        routes.forEach(route => {
            if (!route.points || route.points.length === 0) return;
            
            // Render single-point routes (especially during building) as a marker
            if (route.points.length === 1) {
                const point = route.points[0];
                let lat, lon;
                if (point.waypointId) {
                    const wp = waypoints.find(w => w.id === point.waypointId);
                    if (wp) { lat = wp.lat; lon = wp.lon; }
                } else if (point.lat && point.lon) {
                    lat = point.lat; lon = point.lon;
                }
                
                if (lat && lon) {
                    const pixel = latLonToPixel(lat, lon);
                    if (pixel.x >= -50 && pixel.x <= width + 50 && pixel.y >= -50 && pixel.y <= height + 50) {
                        // Pulsing effect for building routes
                        const isBuilding = route.isBuilding;
                        const pulse = isBuilding ? (Math.sin(Date.now() / 300) + 1) / 2 : 0;
                        const radius = 12 + (pulse * 6);
                        
                        // Outer glow for building routes
                        if (isBuilding) {
                            ctx.beginPath();
                            ctx.arc(pixel.x, pixel.y, radius + 8, 0, Math.PI * 2);
                            ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
                            ctx.fill();
                        }
                        
                        // Main circle
                        ctx.beginPath();
                        ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
                        ctx.fillStyle = '#f97316';
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        
                        // Inner circle
                        ctx.beginPath();
                        ctx.arc(pixel.x, pixel.y, 5, 0, Math.PI * 2);
                        ctx.fillStyle = '#fff';
                        ctx.fill();
                        
                        // "Start" label for building routes
                        if (isBuilding) {
                            ctx.font = '10px system-ui, sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillStyle = '#fff';
                            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                            ctx.lineWidth = 3;
                            ctx.strokeText('Start', pixel.x, pixel.y + radius + 14);
                            ctx.fillText('Start', pixel.x, pixel.y + radius + 14);
                        }
                    }
                }
                return;
            }
            
            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#f97316');
            grad.addColorStop(1, '#ea580c');
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            
            ctx.beginPath();
            
            route.points.forEach((point, i) => {
                let lat, lon;
                if (point.waypointId) {
                    const wp = waypoints.find(w => w.id === point.waypointId);
                    if (wp) { lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002); lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004); }
                } else if (point.lat && point.lon) { lat = point.lat; lon = point.lon; }
                else { lat = 37.4215 + (point.y - 50) * 0.002; lon = -119.1892 + (point.x - 50) * 0.004; }
                
                if (lat && lon) {
                    const pixel = latLonToPixel(lat, lon);
                    i === 0 ? ctx.moveTo(pixel.x, pixel.y) : ctx.lineTo(pixel.x, pixel.y);
                }
            });
            ctx.stroke();
            
            ctx.fillStyle = '#f97316';
            for (let i = 1; i < route.points.length; i++) {
                const p1 = route.points[i - 1], p2 = route.points[i];
                const lat1 = p1.lat || (37.4215 + ((p1.y || 50) - 50) * 0.002);
                const lon1 = p1.lon || (-119.1892 + ((p1.x || 50) - 50) * 0.004);
                const lat2 = p2.lat || (37.4215 + ((p2.y || 50) - 50) * 0.002);
                const lon2 = p2.lon || (-119.1892 + ((p2.x || 50) - 50) * 0.004);
                const pixel1 = latLonToPixel(lat1, lon1), pixel2 = latLonToPixel(lat2, lon2);
                const mx = (pixel1.x + pixel2.x) / 2, my = (pixel1.y + pixel2.y) / 2;
                const angle = Math.atan2(pixel2.y - pixel1.y, pixel2.x - pixel1.x);
                ctx.save(); ctx.translate(mx, my); ctx.rotate(angle);
                ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
        });
    }

    function renderWaypoints(width, height) {
        const waypoints = State.get('waypoints');
        const selectedWaypoint = State.get('selectedWaypoint');
        
        // Visibility indicator colors
        const visibilityColors = {
            private: '#6b7280',
            team: '#3b82f6',
            community: '#10b981'
        };
        
        waypoints.forEach(wp => {
            const lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
            const lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
            const pixel = latLonToPixel(lat, lon);
            const type = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
            const isSelected = selectedWaypoint && selectedWaypoint.id === wp.id;
            const visibility = wp.visibility || 'private';
            
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            if (isSelected) { ctx.shadowColor = type.color; ctx.shadowBlur = 20; }
            
            // Main waypoint circle
            ctx.beginPath(); ctx.arc(pixel.x, pixel.y, isSelected ? 22 : 18, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? type.color : `${type.color}dd`; ctx.fill();
            ctx.beginPath(); ctx.arc(pixel.x, pixel.y, isSelected ? 16 : 13, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1f2e'; ctx.fill();
            ctx.shadowBlur = 0;
            
            // Waypoint type icon
            ctx.font = `${isSelected ? 18 : 14}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(type.icon, pixel.x, pixel.y);
            
            // Visibility indicator (small dot in corner)
            if (visibility !== 'private') {
                const indicatorRadius = 5;
                const offsetX = isSelected ? 14 : 12;
                const offsetY = isSelected ? -14 : -12;
                
                ctx.beginPath();
                ctx.arc(pixel.x + offsetX, pixel.y + offsetY, indicatorRadius + 1, 0, Math.PI * 2);
                ctx.fillStyle = '#1a1f2e';
                ctx.fill();
                
                ctx.beginPath();
                ctx.arc(pixel.x + offsetX, pixel.y + offsetY, indicatorRadius, 0, Math.PI * 2);
                ctx.fillStyle = visibilityColors[visibility];
                ctx.fill();
                
                // Add icon based on visibility
                ctx.font = '7px sans-serif';
                ctx.fillStyle = '#fff';
                ctx.fillText(visibility === 'team' ? '👥' : '🌐', pixel.x + offsetX, pixel.y + offsetY);
            }
            
            // Waypoint name label
            if (wp.name) {
                ctx.font = '11px system-ui, sans-serif';
                ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.strokeText(wp.name, pixel.x, pixel.y + 30);
                ctx.fillText(wp.name, pixel.x, pixel.y + 30);
            }
        });
    }

    /**
     * Render GPS position, accuracy circle, heading, and recorded track
     */
    function renderGPSPosition(width, height) {
        // Check if GPS module is available
        if (typeof GPSModule === 'undefined') return;
        
        // Use getPosition() which includes manual position support
        const pos = GPSModule.getPosition();
        if (!pos || !pos.lat || !pos.lon) return;
        
        const gpsState = GPSModule.getState();
        const isManual = pos.isManual || false;
        
        const pixel = latLonToPixel(pos.lat, pos.lon);
        
        // Skip if off screen
        if (pixel.x < -100 || pixel.x > width + 100 || pixel.y < -100 || pixel.y > height + 100) return;
        
        // Render recorded track if recording
        if (gpsState.isRecording) {
            renderRecordedTrack();
        }
        
        if (isManual) {
            // === MANUAL POSITION MARKER (Purple home/pin icon) ===
            
            // Outer glow
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 12;
            
            // Pin body (teardrop shape)
            ctx.beginPath();
            ctx.moveTo(pixel.x, pixel.y + 20);  // Bottom point
            ctx.bezierCurveTo(
                pixel.x - 14, pixel.y,      // Left control
                pixel.x - 14, pixel.y - 18, // Left top control
                pixel.x, pixel.y - 22       // Top
            );
            ctx.bezierCurveTo(
                pixel.x + 14, pixel.y - 18, // Right top control
                pixel.x + 14, pixel.y,      // Right control
                pixel.x, pixel.y + 20       // Back to bottom
            );
            ctx.fillStyle = '#a855f7';
            ctx.fill();
            ctx.shadowBlur = 0;
            
            // Inner circle (white)
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y - 6, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            
            // Home icon inside
            ctx.fillStyle = '#a855f7';
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⌂', pixel.x, pixel.y - 5);
            
            // Label
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            const label = pos.name || 'Manual';
            ctx.strokeText(label, pixel.x, pixel.y + 34);
            ctx.fillText(label, pixel.x, pixel.y + 34);
            
        } else {
            // === GPS POSITION MARKER (Blue pulsing dot) ===
            
            // Accuracy circle
            if (gpsState.accuracy && gpsState.accuracy < 500) {
                // Convert accuracy (meters) to pixels
                const metersPerPixel = 156543.03392 * Math.cos(pos.lat * Math.PI / 180) / Math.pow(2, mapState.zoom);
                const accuracyRadius = gpsState.accuracy / metersPerPixel;
                
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, Math.max(accuracyRadius, 10), 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            
            // Heading indicator (if moving)
            if (gpsState.heading !== null && gpsState.speed && gpsState.speed > 0.5) {
                const headingRad = gpsState.heading * Math.PI / 180;
                const arrowLength = 30;
                
                ctx.save();
                ctx.translate(pixel.x, pixel.y);
                ctx.rotate(headingRad);
                
                // Direction cone
                ctx.beginPath();
                ctx.moveTo(0, -arrowLength);
                ctx.lineTo(-10, 5);
                ctx.lineTo(10, 5);
                ctx.closePath();
                ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
                ctx.fill();
                
                ctx.restore();
            }
            
            // Position marker (pulsing blue dot)
            const pulseScale = 1 + 0.15 * Math.sin(Date.now() / 500);
            
            // Outer glow
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur = 15;
            
            // Outer circle
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 12 * pulseScale, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            
            ctx.shadowBlur = 0;
            
            // Inner white dot
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            
            // Center blue dot
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            
            // Status indicator (fix quality)
            if (gpsState.fix === 'none' || gpsState.error) {
                // Red ring for no fix
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, 16, 0, Math.PI * 2);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            } else if (gpsState.fix === '2D') {
                // Yellow ring for 2D fix
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, 16, 0, Math.PI * 2);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            // Speed label (if moving fast enough)
            if (gpsState.speed && gpsState.speed > 1) {
                const speedMph = (gpsState.speed * 2.237).toFixed(0);
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.strokeText(`${speedMph} mph`, pixel.x, pixel.y + 28);
                ctx.fillText(`${speedMph} mph`, pixel.x, pixel.y + 28);
            }
        }
    }
    
    /**
     * Render recorded GPS track
     */
    function renderRecordedTrack() {
        if (typeof GPSModule === 'undefined') return;
        
        const track = GPSModule.getRecordedTrack();
        if (!track || track.length < 2) return;
        
        ctx.beginPath();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        track.forEach((pt, i) => {
            const pixel = latLonToPixel(pt.lat, pt.lon);
            if (i === 0) {
                ctx.moveTo(pixel.x, pixel.y);
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        
        ctx.stroke();
        
        // Start marker (green circle)
        const startPixel = latLonToPixel(track[0].lat, track[0].lon);
        ctx.beginPath();
        ctx.arc(startPixel.x, startPixel.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    /**
     * Render team member positions from Meshtastic
     */
    function renderTeamMembers(width, height) {
        const team = State.get('teamMembers') || [];
        
        // Filter to members with valid positions (not self, not lat/lon of 0)
        const visibleMembers = team.filter(m => 
            !m.isMe && 
            m.lat && m.lon && 
            (Math.abs(m.lat) > 0.001 || Math.abs(m.lon) > 0.001)
        );
        
        if (visibleMembers.length === 0) return;
        
        visibleMembers.forEach(member => {
            const pixel = latLonToPixel(member.lat, member.lon);
            
            // Skip if offscreen
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            // Status color
            const statusColor = member.status === 'active' ? '#22c55e' : 
                               member.status === 'stale' ? '#f59e0b' : '#6b7280';
            
            // Draw outer glow for active members
            if (member.status === 'active') {
                ctx.shadowColor = statusColor;
                ctx.shadowBlur = 10;
            }
            
            // Draw member marker (different from waypoints)
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = statusColor + 'dd';
            ctx.fill();
            
            // Inner circle
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1f2e';
            ctx.fill();
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            // Draw icon
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = statusColor;
            ctx.fillText('👤', pixel.x, pixel.y);
            
            // Draw name label below
            const shortName = member.shortName || member.name?.substring(0, 6) || '???';
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.strokeText(shortName, pixel.x, pixel.y + 22);
            ctx.fillText(shortName, pixel.x, pixel.y + 22);
            
            // Draw accuracy circle if available
            if (member.accuracy && member.accuracy < 500) {
                // Convert accuracy (meters) to pixels at current zoom
                const metersPerPixel = 156543.03392 * Math.cos(member.lat * Math.PI / 180) / Math.pow(2, mapState.zoom);
                const accuracyRadius = member.accuracy / metersPerPixel;
                
                if (accuracyRadius > 5 && accuracyRadius < 200) {
                    ctx.beginPath();
                    ctx.arc(pixel.x, pixel.y, accuracyRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = statusColor + '40';
                    ctx.fillStyle = statusColor + '15';
                    ctx.lineWidth = 1;
                    ctx.fill();
                    ctx.stroke();
                }
            }
        });
    }

    /**
     * Render APRS stations on the map
     */
    function renderAPRSStations(width, height) {
        if (typeof APRSModule === 'undefined') return;
        
        const stations = APRSModule.getStations();
        if (stations.length === 0) return;
        
        const now = Date.now();
        
        stations.forEach(station => {
            if (!station.lat || !station.lon) return;
            
            const pixel = latLonToPixel(station.lat, station.lon);
            
            // Skip if offscreen
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            // Calculate age and opacity
            const age = now - station.lastHeard;
            const isFresh = age < 3600000; // 1 hour
            const opacity = isFresh ? 1 : Math.max(0.3, 1 - (age - 3600000) / 3600000);
            
            // Get symbol info
            const symbolInfo = APRSModule.getSymbolInfo(station.symbol);
            
            // Draw track tail if available
            if (station.track && station.track.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.4})`;
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                
                const tailPoints = station.track.slice(-20);
                tailPoints.forEach((pt, i) => {
                    const px = latLonToPixel(pt.lat, pt.lon);
                    if (i === 0) ctx.moveTo(px.x, px.y);
                    else ctx.lineTo(px.x, px.y);
                });
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            // Draw direction indicator if moving
            if (station.course !== undefined && station.speedMph && station.speedMph > 2) {
                const angle = (station.course - 90) * Math.PI / 180;
                const arrowLen = 25;
                ctx.beginPath();
                ctx.moveTo(pixel.x, pixel.y);
                ctx.lineTo(
                    pixel.x + Math.cos(angle) * arrowLen,
                    pixel.y + Math.sin(angle) * arrowLen
                );
                ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
                ctx.lineWidth = 3;
                ctx.stroke();
                
                // Arrow head
                ctx.save();
                ctx.translate(pixel.x + Math.cos(angle) * arrowLen, pixel.y + Math.sin(angle) * arrowLen);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-8, -5);
                ctx.lineTo(-8, 5);
                ctx.closePath();
                ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;
                ctx.fill();
                ctx.restore();
            }
            
            // Draw station marker (diamond shape to distinguish from waypoints)
            ctx.save();
            ctx.globalAlpha = opacity;
            
            // Outer diamond
            ctx.beginPath();
            ctx.moveTo(pixel.x, pixel.y - 16);
            ctx.lineTo(pixel.x + 14, pixel.y);
            ctx.lineTo(pixel.x, pixel.y + 16);
            ctx.lineTo(pixel.x - 14, pixel.y);
            ctx.closePath();
            ctx.fillStyle = '#3b82f6';
            ctx.fill();
            
            // Inner circle
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1f2e';
            ctx.fill();
            
            // Symbol
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(symbolInfo.icon, pixel.x, pixel.y);
            
            ctx.restore();
            
            // Callsign label
            ctx.font = '10px monospace';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            ctx.globalAlpha = opacity;
            ctx.strokeText(station.callsign, pixel.x, pixel.y + 24);
            ctx.fillText(station.callsign, pixel.x, pixel.y + 24);
            
            // Speed label if moving
            if (station.speedMph && station.speedMph > 2) {
                const speedLabel = station.speedMph + ' mph';
                ctx.font = '9px system-ui, sans-serif';
                ctx.fillStyle = '#3b82f6';
                ctx.strokeText(speedLabel, pixel.x, pixel.y + 34);
                ctx.fillText(speedLabel, pixel.x, pixel.y + 34);
            }
            
            ctx.globalAlpha = 1;
        });
    }

    /**
     * Render RadiaCode radiation tracks and current position
     */
    function renderRadiaCodeOverlay(width, height) {
        if (typeof RadiaCodeModule === 'undefined') return;
        
        // Get all completed tracks
        const tracks = RadiaCodeModule.getTracks();
        const currentTrack = RadiaCodeModule.getCurrentTrack();
        const isConnected = RadiaCodeModule.isConnected();
        const currentReading = RadiaCodeModule.getCurrentReading();
        
        // Render completed tracks
        tracks.forEach(track => {
            renderRadiationTrack(track, width, height, false);
        });
        
        // Render current recording track
        if (currentTrack) {
            renderRadiationTrack(currentTrack, width, height, true);
        }
        
        // Render current position indicator if connected and has GPS
        if (isConnected && currentReading.doseRate > 0) {
            let pos = null;
            if (typeof GPSModule !== 'undefined') {
                pos = GPSModule.getPosition();
            }
            
            if (pos && pos.lat && pos.lon) {
                const pixel = latLonToPixel(pos.lat, pos.lon);
                
                // Skip if offscreen
                if (pixel.x >= -50 && pixel.x <= width + 50 && pixel.y >= -50 && pixel.y <= height + 50) {
                    const doseRate = currentReading.doseRate;
                    const color = RadiaCodeModule.getDoseColor(doseRate);
                    
                    // Pulsing radiation indicator
                    const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
                    const baseRadius = 18;
                    const pulseRadius = baseRadius + pulse * 8;
                    
                    // Outer pulse ring
                    ctx.beginPath();
                    ctx.arc(pixel.x, pixel.y, pulseRadius, 0, Math.PI * 2);
                    ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba').replace('#', '');
                    // Convert hex to rgba
                    if (color.startsWith('#')) {
                        const r = parseInt(color.slice(1, 3), 16);
                        const g = parseInt(color.slice(3, 5), 16);
                        const b = parseInt(color.slice(5, 7), 16);
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
                    }
                    ctx.fill();
                    
                    // Main circle
                    ctx.beginPath();
                    ctx.arc(pixel.x, pixel.y, baseRadius, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // Radiation symbol
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff';
                    ctx.fillText('☢', pixel.x, pixel.y);
                    
                    // Dose rate label
                    ctx.font = '10px system-ui, sans-serif';
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                    ctx.lineWidth = 3;
                    const label = RadiaCodeModule.formatDoseRate(doseRate);
                    ctx.strokeText(label, pixel.x, pixel.y + baseRadius + 12);
                    ctx.fillText(label, pixel.x, pixel.y + baseRadius + 12);
                }
            }
        }
    }
    
    /**
     * Render a single radiation track
     */
    function renderRadiationTrack(track, width, height, isActive) {
        const points = track.points.filter(p => p.latitude && p.longitude);
        if (points.length === 0) return;
        
        // Draw track line
        ctx.beginPath();
        ctx.strokeStyle = isActive ? 'rgba(34, 197, 94, 0.8)' : 'rgba(34, 197, 94, 0.4)';
        ctx.lineWidth = isActive ? 3 : 2;
        
        let firstVisible = true;
        points.forEach((point, i) => {
            const pixel = latLonToPixel(point.latitude, point.longitude);
            
            // Check if visible
            if (pixel.x < -100 || pixel.x > width + 100 || pixel.y < -100 || pixel.y > height + 100) {
                return;
            }
            
            if (firstVisible) {
                ctx.moveTo(pixel.x, pixel.y);
                firstVisible = false;
            } else {
                ctx.lineTo(pixel.x, pixel.y);
            }
        });
        ctx.stroke();
        
        // Draw radiation-colored dots at each point (sample every few points for performance)
        const sampleRate = Math.max(1, Math.floor(points.length / 100)); // Max 100 dots
        
        points.forEach((point, i) => {
            if (i % sampleRate !== 0 && i !== points.length - 1) return;
            
            const pixel = latLonToPixel(point.latitude, point.longitude);
            
            // Check if visible
            if (pixel.x < -20 || pixel.x > width + 20 || pixel.y < -20 || pixel.y > height + 20) {
                return;
            }
            
            const color = RadiaCodeModule.getDoseColor(point.doseRate);
            const radius = isActive ? 5 : 4;
            
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    }

    /**
     * Render RF Sentinel tracks (aircraft, ships, drones, etc.)
     */
    function renderRFSentinelOverlay(width, height) {
        if (typeof RFSentinelModule === 'undefined') return;
        if (!RFSentinelModule.isConnected()) return;
        
        // Use the module's built-in render function
        RFSentinelModule.renderOnMap(ctx, width, height, latLonToPixel, mapState.zoom);
    }

    function renderCrosshair(width, height) {
        const mousePos = State.get('mousePosition');
        if (mousePos) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(mousePos.x - 20, mousePos.y); ctx.lineTo(mousePos.x + 20, mousePos.y);
            ctx.moveTo(mousePos.x, mousePos.y - 20); ctx.lineTo(mousePos.x, mousePos.y + 20);
            ctx.stroke(); ctx.setLineDash([]);
        }
    }
    
    /**
     * Render region selection rectangle when drawing
     */
    function renderDrawingRegion(width, height) {
        // Check if we're drawing a region
        if (!mapState.isDrawingRegion || !mapState.drawStart || !mapState.drawEnd) {
            // Also check OfflineModule state for persistent drawing indicator
            if (typeof OfflineModule === 'undefined') return;
            const drawState = OfflineModule.getDrawingState();
            if (!drawState.isDrawing || !drawState.bounds) return;
            
            // Show bounds from OfflineModule
            const nw = latLonToPixel(drawState.bounds.north, drawState.bounds.west);
            const se = latLonToPixel(drawState.bounds.south, drawState.bounds.east);
            
            const x = Math.min(nw.x, se.x);
            const y = Math.min(nw.y, se.y);
            const w = Math.abs(se.x - nw.x);
            const h = Math.abs(se.y - nw.y);
            
            ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
            ctx.fillRect(x, y, w, h);
            
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            return;
        }
        
        // Draw selection rectangle
        const x = Math.min(mapState.drawStart.x, mapState.drawEnd.x);
        const y = Math.min(mapState.drawStart.y, mapState.drawEnd.y);
        const w = Math.abs(mapState.drawEnd.x - mapState.drawStart.x);
        const h = Math.abs(mapState.drawEnd.y - mapState.drawStart.y);
        
        // Semi-transparent fill
        ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
        ctx.fillRect(x, y, w, h);
        
        // Dashed border
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        
        // Corner handles
        const handleSize = 8;
        ctx.fillStyle = '#f97316';
        ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x + w - handleSize/2, y - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
        ctx.fillRect(x + w - handleSize/2, y + h - handleSize/2, handleSize, handleSize);
        
        // Size indicator
        if (w > 100 && h > 50) {
            const topLeft = pixelToLatLon(x, y);
            const bottomRight = pixelToLatLon(x + w, y + h);
            const latDiff = Math.abs(topLeft.lat - bottomRight.lat);
            const lonDiff = Math.abs(topLeft.lon - bottomRight.lon);
            
            // Approximate distance
            const kmLat = latDiff * 111;
            const kmLon = lonDiff * 111 * Math.cos(topLeft.lat * Math.PI / 180);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(x + w/2 - 50, y + h/2 - 12, 100, 24);
            
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${kmLat.toFixed(1)} × ${kmLon.toFixed(1)} km`, x + w/2, y + h/2);
        }
    }

    /**
     * Render RF Line-of-Sight overlay
     */
    function renderRFLOSOverlay(width, height) {
        if (typeof RFLOSModule === 'undefined') return;
        
        const state = RFLOSModule.getState();
        if (!state.pointA && !state.pointB) return;
        
        RFLOSModule.renderMapOverlay(ctx, latLonToPixel);
    }

    /**
     * Render USGS stream gauge markers on map
     */
    function renderStreamGaugeOverlay(width, height) {
        if (typeof StreamGaugeModule === 'undefined') return;
        if (!StreamGaugeModule.isShowingOnMap()) return;
        
        const stations = StreamGaugeModule.getStations();
        if (stations.length === 0) return;
        
        StreamGaugeModule.renderMapOverlay(ctx, latLonToPixel);
    }

    function renderAttribution(width, height) {
        // Collect all attributions from active layers
        const attributions = new Set();
        
        const baseServer = TILE_SERVERS[activeLayers.base];
        if (baseServer) attributions.add(baseServer.attribution);
        
        for (const overlay of activeLayers.overlays) {
            const overlayServer = TILE_SERVERS[overlay];
            if (overlayServer) attributions.add(overlayServer.attribution);
        }
        
        const attrText = Array.from(attributions).join(' | ');
        
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(attrText, 10, height - 10);
    }
    
    /**
     * Render compass rose showing current map bearing
     * Only visible when map is rotated
     */
    function renderCompassRose(width, height) {
        // Only show when rotated
        if (Math.abs(mapState.bearing) < 0.5) return;
        
        const x = 60;  // Position from left
        const y = 80;  // Position from top
        const radius = 28;
        
        // Draw background circle
        ctx.beginPath();
        ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 20, 25, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Save context and apply rotation for the compass needle
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-mapState.bearing * Math.PI / 180);
        
        // Draw compass rose
        // North arrow (red)
        ctx.beginPath();
        ctx.moveTo(0, -radius);
        ctx.lineTo(-8, 8);
        ctx.lineTo(0, 2);
        ctx.lineTo(8, 8);
        ctx.closePath();
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        
        // South arrow (white/gray)
        ctx.beginPath();
        ctx.moveTo(0, radius);
        ctx.lineTo(-8, -8);
        ctx.lineTo(0, -2);
        ctx.lineTo(8, -8);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
        
        // Draw N label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, -radius - 14);
        
        ctx.restore();
        
        // Draw bearing value below compass
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(mapState.bearing) + '°', x, y + radius + 20);
    }
    
    /**
     * Update the compass rose (called after rotation changes)
     */
    function updateCompassRose() {
        // Compass rose is rendered as part of render(), 
        // but we can use this to update any DOM-based compass if needed
        const compassBtn = document.getElementById('compass-btn');
        if (compassBtn) {
            if (Math.abs(mapState.bearing) > 0.5) {
                compassBtn.classList.add('map-controls__btn--rotated');
                compassBtn.style.transform = `rotate(${-mapState.bearing}deg)`;
            } else {
                compassBtn.classList.remove('map-controls__btn--rotated');
                compassBtn.style.transform = '';
            }
        }
    }
    
    /**
     * Reset map bearing to north
     */
    function resetBearing() {
        if (mapState.bearing !== 0) {
            // Animate back to north
            const startBearing = mapState.bearing;
            const duration = 300;
            const startTime = performance.now();
            
            function animate(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                
                // Find shortest rotation path
                let targetBearing = 0;
                if (startBearing > 180) {
                    targetBearing = 360;
                }
                
                mapState.bearing = startBearing + (targetBearing - startBearing) * eased;
                if (mapState.bearing >= 360) mapState.bearing -= 360;
                
                render();
                updateCompassRose();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    mapState.bearing = 0;
                    render();
                    updateCompassRose();
                    saveMapPosition();
                }
            }
            
            requestAnimationFrame(animate);
        }
    }
    
    /**
     * Load layer preferences from storage
     */
    async function loadLayerPreferences() {
        try {
            const saved = await Storage.Settings.get('mapLayers');
            if (saved) {
                State.set('mapLayers', saved);
            }
        } catch (e) {
            console.error('Failed to load layer preferences:', e);
        }
    }
    
    /**
     * Save layer preferences to storage
     */
    async function saveLayerPreferences() {
        try {
            const layers = State.get('mapLayers');
            await Storage.Settings.set('mapLayers', layers);
        } catch (e) {
            console.error('Failed to save layer preferences:', e);
        }
    }
    
    /**
     * Set the base map layer
     */
    function setBaseLayer(layerKey) {
        // Validate layer exists and is a base type
        if (!TILE_SERVERS[layerKey]) {
            console.warn('Unknown layer:', layerKey);
            return;
        }
        
        const layers = State.get('mapLayers');
        
        // Update the new baseLayer property
        layers.baseLayer = layerKey;
        
        // Update legacy flags for backwards compatibility
        layers.terrain = layerKey === 'terrain';
        layers.satellite = layerKey === 'satellite';
        
        // Update internal active layers
        activeLayers.base = layerKey;
        
        State.set('mapLayers', { ...layers });
        saveLayerPreferences();
        render();
        
        // Always update the map controls button to stay in sync
        renderControls();
    }
    
    /**
     * Toggle an overlay layer on/off
     */
    function toggleOverlay(overlayKey) {
        // Validate layer exists
        if (!TILE_SERVERS[overlayKey]) {
            console.warn('Unknown overlay:', overlayKey);
            return;
        }
        
        const layers = State.get('mapLayers');
        const currentOverlays = layers.overlays || [];
        
        let newOverlays;
        if (currentOverlays.includes(overlayKey)) {
            newOverlays = currentOverlays.filter(k => k !== overlayKey);
        } else {
            newOverlays = [...currentOverlays, overlayKey];
        }
        
        layers.overlays = newOverlays;
        
        // Update legacy flags
        layers.grid = newOverlays.includes('grid');
        layers.contours = newOverlays.includes('hillshade');
        
        State.set('mapLayers', { ...layers });
        saveLayerPreferences();
        render();
    }
    
    /**
     * Get current base layer key
     */
    function getBaseLayer() {
        return activeLayers.base;
    }
    
    /**
     * Get available tile servers info
     */
    function getTileServers() {
        return TILE_SERVERS;
    }

    function handleMouseDown(e) {
        if (e.button === 0) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            const coords = pixelToLatLon(x, y);
            
            // Check if OfflineModule is in drawing mode
            if (typeof OfflineModule !== 'undefined') {
                const drawingState = OfflineModule.getDrawingState();
                if (drawingState.isDrawing) {
                    OfflineModule.handleDrawStart(coords);
                    mapState.isDrawingRegion = true;
                    mapState.drawStart = { x, y };
                    return;
                }
            }
            
            mapState.isDragging = true;
            mapState.dragStart = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
        }
    }

    function handleMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        State.Map.setMousePosition(pos);
        
        const coords = pixelToLatLon(pos.x, pos.y);
        const coordsEl = document.getElementById('coords-text');
        if (coordsEl) {
            // Use Coordinates module for formatting
            if (typeof Coordinates !== 'undefined') {
                coordsEl.textContent = Coordinates.formatShort(coords.lat, coords.lon);
            } else {
                // Fallback to basic format
                const latDir = coords.lat >= 0 ? 'N' : 'S';
                const lonDir = coords.lon >= 0 ? 'E' : 'W';
                coordsEl.textContent = `${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lon).toFixed(4)}° ${lonDir}`;
            }
        }
        
        // Update measure hover point for preview line
        if (typeof MeasureModule !== 'undefined' && MeasureModule.isActive()) {
            MeasureModule.setHoverPoint(coords.lat, coords.lon);
        }
        
        // Check if drawing region
        if (mapState.isDrawingRegion && mapState.drawStart) {
            if (typeof OfflineModule !== 'undefined') {
                const bounds = OfflineModule.handleDrawMove(coords);
                if (bounds) {
                    mapState.drawEnd = pos;
                    render();
                }
            }
            return;
        }
        
        if (mapState.isDragging && mapState.dragStart) {
            const dx = e.clientX - mapState.dragStart.x;
            const dy = e.clientY - mapState.dragStart.y;
            
            // Apply rotation to pan direction
            const bearingRad = mapState.bearing * Math.PI / 180;
            const rotatedDx = dx * Math.cos(bearingRad) + dy * Math.sin(bearingRad);
            const rotatedDy = -dx * Math.sin(bearingRad) + dy * Math.cos(bearingRad);
            
            const n = Math.pow(2, mapState.zoom);
            mapState.lon -= rotatedDx / mapState.tileSize / n * 360;
            mapState.lat += rotatedDy / mapState.tileSize / n * 180 * Math.cos(mapState.lat * Math.PI / 180);
            mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            while (mapState.lon > 180) mapState.lon -= 360;
            while (mapState.lon < -180) mapState.lon += 360;
            mapState.dragStart = { x: e.clientX, y: e.clientY };
            render();
            saveMapPosition();
        } else {
            render();
        }
    }

    function handleMouseUp(e) {
        // Check if we were drawing a region
        if (mapState.isDrawingRegion && mapState.drawStart) {
            if (typeof OfflineModule !== 'undefined') {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left, y = e.clientY - rect.top;
                const coords = pixelToLatLon(x, y);
                OfflineModule.handleDrawEnd(coords);
            }
            mapState.isDrawingRegion = false;
            mapState.drawStart = null;
            mapState.drawEnd = null;
            render();
            return;
        }
        
        mapState.isDragging = false;
        mapState.dragStart = null;
        canvas.style.cursor = 'crosshair';
    }
    function handleMouseLeave() {
        mapState.isDragging = false;
        mapState.dragStart = null;
        mapState.isDrawingRegion = false;
        State.Map.setMousePosition(null);
        canvas.style.cursor = 'crosshair';
        render();
    }

    function handleWheel(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const beforeZoom = pixelToLatLon(mouseX, mouseY);
        
        const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
        mapState.zoom = e.deltaY < 0 ? Math.min(maxZoom, mapState.zoom + 1) : Math.max(3, mapState.zoom - 1);
        
        const afterZoom = pixelToLatLon(mouseX, mouseY);
        mapState.lat += beforeZoom.lat - afterZoom.lat;
        mapState.lon += beforeZoom.lon - afterZoom.lon;
        mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
        
        document.getElementById('zoom-level').textContent = mapState.zoom + 'z';
        updateScaleBar();
        render();
        saveMapPosition();
    }

    function handleClick(e) {
        if (mapState.isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const clickCoords = pixelToLatLon(x, y);
        
        // Check if MeasureModule is active and handle the click there first
        if (typeof MeasureModule !== 'undefined' && MeasureModule.isActive()) {
            // Try to get elevation for the point
            let elevation = null;
            if (typeof ElevationModule !== 'undefined') {
                ElevationModule.getElevation(clickCoords.lat, clickCoords.lon).then(ele => {
                    // Update the point with elevation after it's fetched
                    // (MeasureModule handles this internally)
                }).catch(() => {});
            }
            
            MeasureModule.addPoint(clickCoords.lat, clickCoords.lon, elevation);
            MeasureModule.renderResultsPanel();
            render();
            return;
        }
        
        // Check if RouteBuilder is active and handle the click there first
        if (typeof RouteBuilderModule !== 'undefined' && RouteBuilderModule.getState().isBuilding) {
            if (RouteBuilderModule.handleMapClick(clickCoords)) {
                render();
                return;
            }
        }
        
        // Check if RFLOS is selecting a point
        if (typeof RFLOSModule !== 'undefined' && RFLOSModule.isSelecting()) {
            if (RFLOSModule.handleMapClick(clickCoords.lat, clickCoords.lon)) {
                render();
                return;
            }
        }
        
        // Check if clicked on a stream gauge marker
        if (typeof StreamGaugeModule !== 'undefined' && StreamGaugeModule.isShowingOnMap()) {
            const station = StreamGaugeModule.hitTest(x, y, latLonToPixel);
            if (station) {
                StreamGaugeModule.setSelectedStation(station);
                // Switch to weather panel to show station details
                if (typeof State !== 'undefined') {
                    State.set('activePanel', 'weather');
                    if (typeof PanelsModule !== 'undefined') {
                        PanelsModule.render();
                    }
                }
                render();
                return;
            }
        }
        
        const waypoints = State.get('waypoints');
        const clickedWp = waypoints.find(wp => {
            const lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
            const lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
            const pixel = latLonToPixel(lat, lon);
            return Math.sqrt((pixel.x - x) ** 2 + (pixel.y - y) ** 2) < 25;
        });
        
        if (clickedWp) {
            State.Waypoints.select(clickedWp);
            Events.emit(Events.EVENTS.WAYPOINT_SELECT, clickedWp);
        } else {
            const width = canvas.width / (window.devicePixelRatio || 1);
            const height = canvas.height / (window.devicePixelRatio || 1);
            Events.emit(Events.EVENTS.MAP_CLICK, { x: (x / width) * 100, y: (y / height) * 100, lat: clickCoords.lat, lon: clickCoords.lon });
        }
    }

    function handleDoubleClick(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        
        // Find waypoint under cursor
        const waypoints = State.get('waypoints');
        const clickedWp = waypoints.find(wp => {
            const lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
            const lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
            const pixel = latLonToPixel(lat, lon);
            return Math.sqrt((pixel.x - x) ** 2 + (pixel.y - y) ** 2) < 25;
        });
        
        if (clickedWp) {
            // Open edit modal for this waypoint
            ModalsModule.openWaypointModal(null, clickedWp);
        }
    }

    /**
     * Handle right-click for context menu (desktop)
     */
    function handleRightClick(e) {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY);
    }

    // ==================== Context Menu ====================
    
    /**
     * Show context menu at specified screen position
     */
    function showContextMenu(screenX, screenY) {
        const rect = canvas.getBoundingClientRect();
        const x = screenX - rect.left;
        const y = screenY - rect.top;
        const coords = pixelToLatLon(x, y);
        
        contextMenuState = {
            isOpen: true,
            x: screenX,
            y: screenY,
            lat: coords.lat,
            lon: coords.lon
        };
        
        renderContextMenu();
    }
    
    /**
     * Hide context menu
     */
    function hideContextMenu() {
        contextMenuState.isOpen = false;
        const menu = document.getElementById('map-context-menu');
        if (menu) {
            menu.remove();
        }
    }
    
    /**
     * Render the context menu UI
     */
    function renderContextMenu() {
        // Remove existing menu if any
        hideContextMenu();
        contextMenuState.isOpen = true;
        
        const menu = document.createElement('div');
        menu.id = 'map-context-menu';
        menu.className = 'map-context-menu';
        
        // Position menu, keeping it on screen
        const menuWidth = 200;
        const menuHeight = 240;
        let posX = contextMenuState.x;
        let posY = contextMenuState.y;
        
        // Adjust if menu would go off screen
        if (posX + menuWidth > window.innerWidth) {
            posX = window.innerWidth - menuWidth - 10;
        }
        if (posY + menuHeight > window.innerHeight) {
            posY = window.innerHeight - menuHeight - 10;
        }
        
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
        
        // Format coordinates for display
        const latDir = contextMenuState.lat >= 0 ? 'N' : 'S';
        const lonDir = contextMenuState.lon >= 0 ? 'E' : 'W';
        const coordsDisplay = `${Math.abs(contextMenuState.lat).toFixed(5)}° ${latDir}, ${Math.abs(contextMenuState.lon).toFixed(5)}° ${lonDir}`;
        
        menu.innerHTML = `
            <div class="map-context-menu__header">
                <span class="map-context-menu__coords">${coordsDisplay}</span>
            </div>
            <div class="map-context-menu__items">
                <button class="map-context-menu__item" data-action="add-waypoint">
                    <span class="map-context-menu__icon">📍</span>
                    <span>Add Waypoint Here</span>
                </button>
                <button class="map-context-menu__item" data-action="measure-from">
                    <span class="map-context-menu__icon">📏</span>
                    <span>Measure From Here</span>
                </button>
                <button class="map-context-menu__item" data-action="navigate-to">
                    <span class="map-context-menu__icon">🧭</span>
                    <span>Navigate To Here</span>
                </button>
                <button class="map-context-menu__item" data-action="center-map">
                    <span class="map-context-menu__icon">⊕</span>
                    <span>Center Map Here</span>
                </button>
                <div class="map-context-menu__divider"></div>
                <button class="map-context-menu__item" data-action="copy-coords">
                    <span class="map-context-menu__icon">📋</span>
                    <span>Copy Coordinates</span>
                </button>
                <button class="map-context-menu__item" data-action="copy-coords-decimal">
                    <span class="map-context-menu__icon">📋</span>
                    <span>Copy as Decimal</span>
                </button>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Add click handlers
        menu.querySelectorAll('[data-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                handleContextMenuAction(btn.dataset.action);
            };
        });
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeContextMenuOnClick);
            document.addEventListener('touchstart', closeContextMenuOnClick);
        }, 10);
    }
    
    /**
     * Close context menu when clicking outside
     */
    function closeContextMenuOnClick(e) {
        const menu = document.getElementById('map-context-menu');
        if (menu && !menu.contains(e.target)) {
            hideContextMenu();
            document.removeEventListener('click', closeContextMenuOnClick);
            document.removeEventListener('touchstart', closeContextMenuOnClick);
        }
    }
    
    /**
     * Handle context menu action
     */
    function handleContextMenuAction(action) {
        const { lat, lon } = contextMenuState;
        
        switch (action) {
            case 'add-waypoint':
                // Create waypoint at this location
                const width = canvas.width / (window.devicePixelRatio || 1);
                const height = canvas.height / (window.devicePixelRatio || 1);
                const pixel = latLonToPixel(lat, lon);
                Events.emit(Events.EVENTS.MAP_CLICK, { 
                    x: (pixel.x / width) * 100, 
                    y: (pixel.y / height) * 100, 
                    lat: lat, 
                    lon: lon 
                });
                break;
                
            case 'measure-from':
                // Start measure mode from this point
                if (typeof MeasureModule !== 'undefined') {
                    if (!MeasureModule.isActive()) {
                        MeasureModule.toggle();
                        renderControls();
                    }
                    // Add the point
                    MeasureModule.addPoint(lat, lon);
                    render();
                    ModalsModule.showToast('Measuring from this point', 'info');
                }
                break;
                
            case 'navigate-to':
                // Show bearing and distance to this point from current GPS position
                if (typeof GPSModule !== 'undefined') {
                    const gpsPos = GPSModule.getPosition();
                    if (gpsPos && gpsPos.lat && gpsPos.lon) {
                        // Calculate bearing and distance
                        const bearing = calculateBearing(gpsPos.lat, gpsPos.lon, lat, lon);
                        const distance = haversineDistance(gpsPos.lat, gpsPos.lon, lat, lon);
                        const cardinalDir = getCardinalDirection(bearing);
                        
                        const distStr = distance < 1 
                            ? `${Math.round(distance * 5280)} ft` 
                            : `${distance.toFixed(1)} mi`;
                        
                        ModalsModule.showToast(
                            `${cardinalDir} (${Math.round(bearing)}°) • ${distStr}`, 
                            'info'
                        );
                    } else {
                        ModalsModule.showToast('GPS position unavailable - enable GPS first', 'warning');
                    }
                } else {
                    ModalsModule.showToast('GPS module not available', 'error');
                }
                break;
                
            case 'center-map':
                // Center map on this location
                setCenter(lat, lon);
                ModalsModule.showToast('Map centered', 'info');
                break;
                
            case 'copy-coords':
                // Copy coordinates in current format
                const latDir = lat >= 0 ? 'N' : 'S';
                const lonDir = lon >= 0 ? 'W' : 'E';
                const coordStr = `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lon).toFixed(6)}° ${lonDir}`;
                copyToClipboard(coordStr);
                ModalsModule.showToast('Coordinates copied', 'success');
                break;
                
            case 'copy-coords-decimal':
                // Copy coordinates as decimal
                const decimalStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
                copyToClipboard(decimalStr);
                ModalsModule.showToast('Decimal coordinates copied', 'success');
                break;
        }
        
        hideContextMenu();
    }
    
    /**
     * Copy text to clipboard
     */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(err => {
                console.error('Clipboard write failed:', err);
                fallbackCopyToClipboard(text);
            });
        } else {
            fallbackCopyToClipboard(text);
        }
    }
    
    /**
     * Fallback clipboard copy for older browsers
     */
    function fallbackCopyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        document.body.removeChild(textarea);
    }
    
    /**
     * Calculate bearing between two points (degrees, 0-360)
     */
    function calculateBearing(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }
    
    /**
     * Calculate distance between two points using Haversine formula (miles)
     */
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) ** 2 + 
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                  Math.sin(dLon/2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    
    /**
     * Get cardinal direction from bearing
     */
    function getCardinalDirection(bearing) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                           'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(bearing / 22.5) % 16;
        return directions[index];
    }
    
    /**
     * Cancel any pending long press
     */
    function cancelLongPress() {
        if (longPressState.timer) {
            clearTimeout(longPressState.timer);
            longPressState.timer = null;
        }
        longPressState.isLongPress = false;
    }

    // ==================== Touch Handlers ====================

    /**
     * Calculate distance between two touch points
     */
    function getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * Calculate angle between two touch points (in degrees)
     */
    function getTouchAngle(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    
    /**
     * Get center point between two touches
     */
    function getTouchCenter(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    function handleTouchStart(e) {
        // Close context menu if open
        if (contextMenuState.isOpen) {
            hideContextMenu();
        }
        
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const coords = pixelToLatLon(x, y);
            
            // Check if OfflineModule is in drawing mode
            if (typeof OfflineModule !== 'undefined') {
                const drawingState = OfflineModule.getDrawingState();
                if (drawingState.isDrawing) {
                    OfflineModule.handleDrawStart(coords);
                    mapState.isDrawingRegion = true;
                    mapState.drawStart = { x, y };
                    cancelLongPress();
                    return;
                }
            }
            
            // Reset gesture state
            gestureState.isActive = false;
            
            // Setup for potential drag
            mapState.isDragging = false;
            mapState.dragStart = { x: touch.clientX, y: touch.clientY };
            
            // Setup long press detection
            longPressState.startX = touch.clientX;
            longPressState.startY = touch.clientY;
            longPressState.startTime = Date.now();
            longPressState.isLongPress = false;
            
            // Start long press timer
            longPressState.timer = setTimeout(() => {
                if (!mapState.isDragging && !gestureState.isActive) {
                    longPressState.isLongPress = true;
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    showContextMenu(longPressState.startX, longPressState.startY);
                }
            }, longPressState.duration);
            
        } else if (e.touches.length === 2) {
            e.preventDefault();
            // Cancel long press and single-finger drag
            cancelLongPress();
            mapState.isDragging = false;
            
            // Cancel drawing if active
            if (mapState.isDrawingRegion) {
                mapState.isDrawingRegion = false;
                mapState.drawStart = null;
                mapState.drawEnd = null;
                if (typeof OfflineModule !== 'undefined') {
                    OfflineModule.cancelDrawing();
                }
            }
            
            // Initialize two-finger gesture
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            gestureState.isActive = true;
            gestureState.initialDistance = getTouchDistance(touch1, touch2);
            gestureState.initialAngle = getTouchAngle(touch1, touch2);
            gestureState.initialZoom = mapState.zoom;
            gestureState.initialBearing = mapState.bearing;
            gestureState.lastDistance = gestureState.initialDistance;
            gestureState.lastAngle = gestureState.initialAngle;
            
            const center = getTouchCenter(touch1, touch2);
            gestureState.centerX = center.x;
            gestureState.centerY = center.y;
        } else {
            // More than 2 touches - cancel everything
            cancelLongPress();
            gestureState.isActive = false;
        }
    }

    function handleTouchMove(e) {
        if (e.touches.length === 1 && mapState.dragStart && !gestureState.isActive) {
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            // Check if we're drawing a region
            if (mapState.isDrawingRegion && mapState.drawStart) {
                e.preventDefault();
                if (typeof OfflineModule !== 'undefined') {
                    const coords = pixelToLatLon(x, y);
                    const bounds = OfflineModule.handleDrawMove(coords);
                    if (bounds) {
                        mapState.drawEnd = { x, y };
                        render();
                    }
                }
                return;
            }
            
            const dx = touch.clientX - longPressState.startX;
            const dy = touch.clientY - longPressState.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // If moved beyond threshold, cancel long press and start dragging
            if (distance > longPressState.threshold) {
                cancelLongPress();
                mapState.isDragging = true;
            }
            
            // Handle drag if we're dragging
            if (mapState.isDragging) {
                e.preventDefault();
                const moveDx = touch.clientX - mapState.dragStart.x;
                const moveDy = touch.clientY - mapState.dragStart.y;
                
                // Apply rotation to pan direction
                const bearingRad = mapState.bearing * Math.PI / 180;
                const rotatedDx = moveDx * Math.cos(bearingRad) + moveDy * Math.sin(bearingRad);
                const rotatedDy = -moveDx * Math.sin(bearingRad) + moveDy * Math.cos(bearingRad);
                
                const n = Math.pow(2, mapState.zoom);
                mapState.lon -= rotatedDx / mapState.tileSize / n * 360;
                mapState.lat += rotatedDy / mapState.tileSize / n * 180 * Math.cos(mapState.lat * Math.PI / 180);
                mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
                while (mapState.lon > 180) mapState.lon -= 360;
                while (mapState.lon < -180) mapState.lon += 360;
                mapState.dragStart = { x: touch.clientX, y: touch.clientY };
                render();
                saveMapPosition();
            }
            
        } else if (e.touches.length === 2 && gestureState.isActive) {
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDistance = getTouchDistance(touch1, touch2);
            const currentAngle = getTouchAngle(touch1, touch2);
            const currentCenter = getTouchCenter(touch1, touch2);
            
            // Calculate zoom change (pinch)
            const distanceRatio = currentDistance / gestureState.initialDistance;
            const zoomDelta = Math.log2(distanceRatio);
            let newZoom = gestureState.initialZoom + zoomDelta;
            
            // Clamp zoom to valid range
            const maxZoom = 19;
            const minZoom = 3;
            newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
            
            // Calculate rotation change
            let angleDelta = currentAngle - gestureState.initialAngle;
            
            // Normalize angle delta to -180 to 180
            while (angleDelta > 180) angleDelta -= 360;
            while (angleDelta < -180) angleDelta += 360;
            
            let newBearing = gestureState.initialBearing - angleDelta;
            
            // Normalize bearing to 0-360
            while (newBearing < 0) newBearing += 360;
            while (newBearing >= 360) newBearing -= 360;
            
            // Apply changes
            const zoomChanged = Math.abs(newZoom - mapState.zoom) > 0.01;
            const bearingChanged = Math.abs(newBearing - mapState.bearing) > 0.5;
            
            if (zoomChanged || bearingChanged) {
                // Get the lat/lon at the gesture center before zoom/rotation change
                const rect = canvas.getBoundingClientRect();
                const centerPixelX = gestureState.centerX - rect.left;
                const centerPixelY = gestureState.centerY - rect.top;
                const centerCoords = pixelToLatLon(centerPixelX, centerPixelY);
                
                // Apply zoom
                mapState.zoom = newZoom;
                
                // Apply rotation
                mapState.bearing = newBearing;
                
                // Adjust map center to keep gesture center point stationary
                // (This creates the "zoom to point" effect)
                const newCenterCoords = pixelToLatLon(centerPixelX, centerPixelY);
                mapState.lat += centerCoords.lat - newCenterCoords.lat;
                mapState.lon += centerCoords.lon - newCenterCoords.lon;
                
                // Clamp latitude
                mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
                
                render();
                updateScaleBar();
                updateCompassRose();
                
                // Update zoom display
                const zoomEl = document.getElementById('zoom-level');
                if (zoomEl) zoomEl.textContent = Math.round(mapState.zoom) + 'z';
            }
            
            gestureState.lastDistance = currentDistance;
            gestureState.lastAngle = currentAngle;
        }
    }

    function handleTouchEnd(e) {
        cancelLongPress();
        
        if (e.touches.length === 0) {
            // All fingers lifted
            
            // Check if we were drawing a region
            if (mapState.isDrawingRegion && mapState.drawStart) {
                if (typeof OfflineModule !== 'undefined' && e.changedTouches.length > 0) {
                    const touch = e.changedTouches[0];
                    const rect = canvas.getBoundingClientRect();
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;
                    const coords = pixelToLatLon(x, y);
                    OfflineModule.handleDrawEnd(coords);
                }
                mapState.isDrawingRegion = false;
                mapState.drawStart = null;
                mapState.drawEnd = null;
                render();
                return;
            }
            
            const elapsed = Date.now() - longPressState.startTime;
            if (!mapState.isDragging && !longPressState.isLongPress && !gestureState.isActive && elapsed < 300) {
                // This was a tap - let normal click event handle it
            }
            
            mapState.isDragging = false;
            mapState.dragStart = null;
            gestureState.isActive = false;
            
            // Save position after gesture completes
            if (gestureState.initialZoom !== mapState.zoom || gestureState.initialBearing !== mapState.bearing) {
                saveMapPosition();
            }
            
        } else if (e.touches.length === 1) {
            // Went from 2 fingers to 1 - transition to single-finger drag
            gestureState.isActive = false;
            const touch = e.touches[0];
            mapState.dragStart = { x: touch.clientX, y: touch.clientY };
            mapState.isDragging = true;
            
            // Save position after pinch/rotate gesture
            saveMapPosition();
        }
    }

    function renderControls() {
        const container = document.getElementById('map-controls');
        const layers = State.get('mapLayers');
        const currentBase = layers.baseLayer || 'standard';
        const measureActive = typeof MeasureModule !== 'undefined' && MeasureModule.isActive();
        
        // Layer display info
        const layerInfo = {
            standard: { icon: 'map', label: 'OSM' },
            terrain: { icon: 'terrain', label: 'Topo' },
            satellite: { icon: 'satellite', label: 'Sat' },
            usgs_topo: { icon: 'terrain', label: 'USGS' },
            usgs_imagery: { icon: 'satellite', label: 'USGS' },
            usfs_topo: { icon: 'terrain', label: 'USFS' }
        };
        
        const info = layerInfo[currentBase] || layerInfo.standard;
        const isRotated = Math.abs(mapState.bearing) > 0.5;
        
        container.innerHTML = `
            <button class="map-controls__btn" id="zoom-in-btn" title="Zoom In" aria-label="Zoom in">${Icons.get('zoomIn')}</button>
            <button class="map-controls__btn" id="zoom-out-btn" title="Zoom Out" aria-label="Zoom out">${Icons.get('zoomOut')}</button>
            <button class="map-controls__btn" id="locate-btn" title="My Location" aria-label="Center on my location">${Icons.get('locate')}</button>
            <button class="map-controls__btn ${isRotated ? 'map-controls__btn--rotated' : ''}" id="compass-btn" title="${isRotated ? 'Reset to North (' + Math.round(mapState.bearing) + '°)' : 'Map is North-up'}" style="${isRotated ? 'transform: rotate(' + (-mapState.bearing) + 'deg)' : ''}" aria-label="${isRotated ? 'Reset map to north. Current bearing: ' + Math.round(mapState.bearing) + ' degrees' : 'Map is oriented north-up'}" aria-pressed="${isRotated}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <polygon points="12,2 9,12 12,10 15,12" fill="${isRotated ? '#ef4444' : 'currentColor'}" stroke="none"/>
                    <polygon points="12,22 9,12 12,14 15,12" fill="${isRotated ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)'}" stroke="none"/>
                </svg>
            </button>
            <div class="map-controls__divider" role="separator" aria-hidden="true"></div>
            <button class="map-controls__btn ${measureActive ? 'map-controls__btn--active' : ''}" id="measure-btn" title="Measure Distance" aria-label="Measure distance tool" aria-pressed="${measureActive}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M2 12h4m4 0h4m4 0h4"/>
                    <path d="M6 8v8M10 10v4M14 10v4M18 8v8"/>
                </svg>
            </button>
            <button class="map-controls__btn map-controls__btn--layer" id="layer-btn" data-current="${currentBase}" title="Cycle Map Layer (click to change)" aria-label="Current map layer: ${info.label}. Click to change." aria-haspopup="true">
                <span aria-hidden="true">${Icons.get(info.icon)}</span>
                <span class="map-controls__layer-label">${info.label}</span>
            </button>
        `;
        
        container.querySelector('#zoom-in-btn').onclick = () => { 
            mapState.zoom = Math.min(19, mapState.zoom + 1); 
            document.getElementById('zoom-level').textContent = mapState.zoom + 'z'; 
            updateScaleBar();
            render(); 
            saveMapPosition(); 
        };
        
        container.querySelector('#zoom-out-btn').onclick = () => { 
            mapState.zoom = Math.max(3, mapState.zoom - 1); 
            document.getElementById('zoom-level').textContent = mapState.zoom + 'z'; 
            updateScaleBar();
            render(); 
            saveMapPosition(); 
        };
        
        container.querySelector('#locate-btn').onclick = () => {
            // Use GPSModule if available
            if (typeof GPSModule !== 'undefined') {
                // First check for any available position (GPS or manual)
                const existingPos = GPSModule.getPosition();
                if (existingPos && existingPos.lat && existingPos.lon) {
                    // Center on existing position immediately
                    mapState.lat = existingPos.lat;
                    mapState.lon = existingPos.lon;
                    mapState.zoom = Math.max(mapState.zoom, 15);
                    document.getElementById('zoom-level').textContent = mapState.zoom + 'z';
                    updateScaleBar();
                    render();
                    saveMapPosition();
                    
                    if (existingPos.isManual) {
                        ModalsModule.showToast('Centered on manual position', 'success');
                    } else {
                        ModalsModule.showToast('Centered on GPS position', 'success');
                    }
                    return;
                }
                
                const gpsState = GPSModule.getState();
                
                // Start GPS tracking if not already active
                if (!gpsState.isTracking) {
                    ModalsModule.showToast('Starting GPS tracking...', 'info');
                    GPSModule.startInternalGPS();
                }
                
                // Get fresh position asynchronously
                GPSModule.getCurrentPosition().then(pos => {
                    if (pos && pos.latitude && pos.longitude) {
                        mapState.lat = pos.latitude;
                        mapState.lon = pos.longitude;
                        mapState.zoom = 15;
                        document.getElementById('zoom-level').textContent = mapState.zoom + 'z';
                        updateScaleBar();
                        render();
                        saveMapPosition();
                        ModalsModule.showToast('GPS tracking active', 'success');
                    } else {
                        ModalsModule.showToast('Waiting for GPS fix...', 'info');
                    }
                }).catch(err => {
                    console.error('GPS position error:', err);
                    ModalsModule.showToast('Could not get GPS position. Try setting manual position.', 'error');
                });
            } else if ('geolocation' in navigator) {
                // Fallback to direct geolocation API
                ModalsModule.showToast('Getting location...', 'info');
                navigator.geolocation.getCurrentPosition(
                    (pos) => { 
                        mapState.lat = pos.coords.latitude; 
                        mapState.lon = pos.coords.longitude; 
                        mapState.zoom = 15; 
                        document.getElementById('zoom-level').textContent = mapState.zoom + 'z'; 
                        updateScaleBar();
                        render(); 
                        saveMapPosition(); 
                        ModalsModule.showToast('Location found', 'success'); 
                    },
                    (err) => { 
                        console.error('Geolocation error:', err); 
                        ModalsModule.showToast('Could not get location: ' + err.message, 'error'); 
                    },
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
                );
            } else { 
                ModalsModule.showToast('Geolocation not supported', 'error'); 
            }
        };
        
        // Compass button - reset to north
        container.querySelector('#compass-btn').onclick = () => {
            if (Math.abs(mapState.bearing) > 0.5) {
                resetBearing();
                ModalsModule.showToast('Map reset to north', 'info');
            } else {
                ModalsModule.showToast('Map is already north-up', 'info');
            }
        };
        
        // Measure tool toggle
        container.querySelector('#measure-btn').onclick = () => {
            if (typeof MeasureModule !== 'undefined') {
                MeasureModule.toggle();
                renderControls();
                render();
            }
        };
        
        // Layer switcher - cycles through base layers on click
        const baseLayers = ['standard', 'terrain', 'satellite', 'usgs_topo', 'usfs_topo'];
        const layerNames = {
            standard: 'OpenStreetMap',
            terrain: 'OpenTopoMap',
            satellite: 'Satellite',
            usgs_topo: 'USGS Topo',
            usfs_topo: 'USA Topo'
        };
        
        const layerBtn = container.querySelector('#layer-btn');
        layerBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Read current layer from data attribute (most reliable)
            const currentBase = this.dataset.current || State.get('mapLayers').baseLayer || 'standard';
            const currentIndex = baseLayers.indexOf(currentBase);
            const nextIndex = (currentIndex + 1) % baseLayers.length;
            const nextBase = baseLayers[nextIndex];
            
            console.log('Layer switch:', currentBase, '->', nextBase);
            
            // Show toast with layer name
            ModalsModule.showToast(`Layer: ${layerNames[nextBase]}`, 'info');
            
            // Update the layer (this also updates the button via renderControls)
            setBaseLayer(nextBase);
        };
    }

    function saveMapPosition() { 
        Storage.Settings.set('mapPosition', { 
            lat: mapState.lat, 
            lon: mapState.lon, 
            zoom: mapState.zoom,
            bearing: mapState.bearing 
        });
        
        // Update declination for new position
        updateDeclinationDisplay();
    }
    
    /**
     * Update the scale bar based on current zoom level and latitude
     * Calculates meters per pixel and displays an appropriate "nice" distance
     */
    function updateScaleBar() {
        const scaleBarLine = document.querySelector('.scale-bar__line');
        const scaleBarLabel = document.querySelector('.scale-bar__label');
        if (!scaleBarLine || !scaleBarLabel) return;
        
        // Earth's circumference at equator in meters
        const EARTH_CIRCUMFERENCE = 40075016.686;
        
        // Calculate meters per pixel at current zoom and latitude
        // Formula: metersPerPixel = (C * cos(lat)) / (256 * 2^zoom)
        const latRad = mapState.lat * Math.PI / 180;
        const metersPerPixel = (EARTH_CIRCUMFERENCE * Math.cos(latRad)) / (256 * Math.pow(2, mapState.zoom));
        
        // Convert to feet per pixel (for imperial units)
        const feetPerPixel = metersPerPixel * 3.28084;
        const milesPerPixel = feetPerPixel / 5280;
        
        // Define "nice" scale values in feet and miles
        // We want the scale bar to be between 60-150 pixels wide ideally
        const niceDistances = [
            { value: 100, unit: 'ft', feet: 100 },
            { value: 200, unit: 'ft', feet: 200 },
            { value: 500, unit: 'ft', feet: 500 },
            { value: 1000, unit: 'ft', feet: 1000 },
            { value: 2000, unit: 'ft', feet: 2000 },
            { value: 0.25, unit: 'mi', feet: 0.25 * 5280 },
            { value: 0.5, unit: 'mi', feet: 0.5 * 5280 },
            { value: 1, unit: 'mi', feet: 5280 },
            { value: 2, unit: 'mi', feet: 2 * 5280 },
            { value: 5, unit: 'mi', feet: 5 * 5280 },
            { value: 10, unit: 'mi', feet: 10 * 5280 },
            { value: 20, unit: 'mi', feet: 20 * 5280 },
            { value: 50, unit: 'mi', feet: 50 * 5280 },
            { value: 100, unit: 'mi', feet: 100 * 5280 },
            { value: 200, unit: 'mi', feet: 200 * 5280 },
            { value: 500, unit: 'mi', feet: 500 * 5280 }
        ];
        
        // Find the best "nice" distance that gives a bar width between 60-150 pixels
        let bestDistance = niceDistances[0];
        for (const dist of niceDistances) {
            const barWidth = dist.feet / feetPerPixel;
            if (barWidth >= 50 && barWidth <= 150) {
                bestDistance = dist;
                break;
            }
            if (barWidth < 50) {
                bestDistance = dist;
            }
        }
        
        // Calculate the actual bar width in pixels
        const barWidth = bestDistance.feet / feetPerPixel;
        
        // Update the scale bar
        scaleBarLine.style.width = Math.round(barWidth) + 'px';
        
        // Format the label
        let label;
        if (bestDistance.unit === 'ft') {
            label = bestDistance.value.toLocaleString() + ' ft';
        } else {
            label = bestDistance.value + ' mi';
        }
        scaleBarLabel.textContent = label;
    }
    
    async function loadMapPosition() {
        try {
            const saved = await Storage.Settings.get('mapPosition');
            if (saved) { 
                mapState.lat = saved.lat || 37.4215; 
                mapState.lon = saved.lon || -119.1892; 
                mapState.zoom = saved.zoom || 12; 
                mapState.bearing = saved.bearing || 0;
            }
            const zoomEl = document.getElementById('zoom-level');
            if (zoomEl) zoomEl.textContent = Math.round(mapState.zoom) + 'z';
            // Schedule scale bar and compass update after DOM is ready
            setTimeout(() => {
                updateScaleBar();
                updateCompassRose();
            }, 100);
        } catch (e) { console.error('Failed to load map position:', e); }
    }

    function setCenter(lat, lon, zoom) {
        mapState.lat = lat; mapState.lon = lon;
        if (zoom !== undefined) { mapState.zoom = zoom; document.getElementById('zoom-level').textContent = mapState.zoom + 'z'; }
        updateScaleBar();
        render(); saveMapPosition();
    }

    function getMapState() { return { ...mapState }; }
    
    /**
     * Cleanup all event listeners (call when destroying the module)
     */
    function destroy() {
        // Clear all map-scoped event listeners and resources
        if (mapEvents) {
            mapEvents.clear();
            mapEvents = null;
        }
        
        initialized = false;
        
        // Clear tile cache
        tileCache.clear();
        pendingTiles.clear();
    }

    return { 
        init, 
        render, 
        resize, 
        setCenter, 
        getCenter: () => ({ lat: mapState.lat, lon: mapState.lon }),
        setZoom: (z) => { mapState.zoom = Math.max(1, Math.min(18, z)); render(); },
        getZoom: () => mapState.zoom,
        getMapState, 
        latLonToPixel, 
        pixelToLatLon,
        setBaseLayer,
        toggleOverlay,
        getBaseLayer,
        getTileServers,
        saveLayerPreferences,
        renderControls,
        updateScaleBar,
        resetBearing,
        updateCompassRose,
        destroy,
        
        // Request a render (for external modules)
        requestRender: render,
        
        // Custom tile layers (for satellite weather, etc.)
        addCustomTileLayer,
        removeCustomTileLayer,
        getCustomTileLayers,
        setCustomLayerOpacity,
        setLayerOpacity: setCustomLayerOpacity  // Alias for compatibility
    };
})();

window.MapModule = MapModule;
