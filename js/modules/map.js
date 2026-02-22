/**
 * GridDown Map Module - Multi-Layer Tile Map Integration
 * Supports multiple tile providers with layer blending and offline caching
 */
const MapModule = (function() {
    'use strict';
    
    let canvas, ctx;
    
    // P2: Effective DPR used for canvas scaling — may be capped below native on mobile
    // to reduce GPU fill rate. All canvas↔CSS coordinate conversions must use this value.
    let effectiveDpr = 1;
    let tileCache = new Map();
    let pendingTiles = new Set();
    
    // P0: RAF-based render scheduling to prevent excessive redraws during gestures.
    // On 120Hz touch devices, input events can fire 120+/sec — this ensures the
    // canvas is only repainted once per display refresh regardless of event rate.
    let renderScheduled = false;
    function scheduleRender() {
        if (!renderScheduled) {
            renderScheduled = true;
            requestAnimationFrame(() => {
                renderScheduled = false;
                render();
            });
        }
    }
    
    // P1: Debounced position save for continuous gestures (drag/pinch).
    // Avoids IndexedDB writes + WMM declination recalc on every touchmove.
    // Final position is always saved on gesture end via direct saveMapPosition().
    let savePositionTimer = null;
    function debouncedSaveMapPosition() {
        if (savePositionTimer) clearTimeout(savePositionTimer);
        savePositionTimer = setTimeout(() => {
            saveMapPosition();
            savePositionTimer = null;
        }, 250);
    }
    
    // Cached DOM references
    let zoomLevelEl = null;
    let coordsFormatEl = null;
    let coordsTextEl = null;
    let declinationValueEl = null;
    
    // Map state
    let mapState = {
        lat: 37.4215,
        lon: -119.1892,
        zoom: 12,
        tileSize: 256,
        isDragging: false,
        dragStart: null,
        lastMousePos: null,
        bearing: 0,           // Map rotation in degrees (0 = north up)
        interactionMode: null // Special interaction modes: 'resection-landmark', etc.
    };
    
    // When true, latLonToPixel returns map-space coordinates (no bearing rotation).
    // The canvas context transform handles rotation during rendering.
    // Outside rendering (hit testing, click handlers), latLonToPixel returns
    // screen-space coordinates with bearing rotation applied.
    let _insideRotatedContext = false;
    
    // Multi-touch gesture state for pinch/rotation
    let gestureState = {
        isActive: false,
        pending: false,         // true when two fingers are down but haven't moved enough
        startTime: 0,
        initialDistance: 0,
        initialAngle: 0,
        initialZoom: 0,
        initialBearing: 0,
        initialLat: 0,          // map center at gesture start (for non-incremental math)
        initialLon: 0,
        initialCenterX: 0,      // first pinch midpoint in screen coords
        initialCenterY: 0,
        rotationUnlocked: false, // true once fingers rotate > 25° (prevents accidental rotation)
        zoomLocked: false,       // true once rotation unlocks; prevents accidental zoom during rotation
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
        threshold: 15,        // pixels - max movement before canceling (15px accommodates
                              // touch digitizer jitter and Samsung glove mode)
        duration: 600         // ms - hold duration to trigger
    };
    
    let contextMenuState = {
        isOpen: false,
        x: 0,
        y: 0,
        lat: 0,
        lon: 0
    };
    
    // Inertia (momentum) panning state
    let inertiaState = {
        animationId: null,
        // Ring buffer of recent touch positions for velocity calculation
        history: [],   // [{x, y, time}]
        maxSamples: 5
    };
    
    // Double-tap zoom state
    let doubleTapState = {
        lastTapTime: 0,
        lastTapX: 0,
        lastTapY: 0,
        suppressClick: false,  // prevents click handler from firing after double-tap zoom
        animationId: null,     // tracks running zoom animation
        singleTapTimer: null   // delayed single-tap → handleClick dispatch
    };
    
    // Double-tap-hold-drag one-finger zoom state
    let oneFingerZoomState = {
        isActive: false,
        screenX: 0,           // tap point (for anchor)
        screenY: 0,
        startY: 0,            // finger Y at drag start (for delta)
        startZoom: 0,
        startLat: 0,          // map center at zoom start (for non-incremental math)
        startLon: 0,
        didMove: false         // true once finger moves beyond threshold
    };
    
    // Cached canvas bounds — updated on resize/orientation, used in touch handlers
    // to avoid forced reflow from getBoundingClientRect() on every touchmove (120Hz).
    let cachedCanvasRect = { left: 0, top: 0, width: 0, height: 0 };
    
    // Tracks what the canvas currently shows so we can apply a CSS transform
    // for instant visual feedback between expensive render() repaints.
    // During pinch: touch events update mapState AND apply a CSS transform.
    // During pan: touch events update mapState AND apply CSS translate.
    // On next RAF: render() clears the transform, repaints, updates this state.
    let gestureRenderState = {
        active: false,
        zoom: 0,
        bearing: 0,
        lat: 0,
        lon: 0,
        pinchCX: 0,   // pinch center X (CSS px relative to canvas) at last repaint
        pinchCY: 0
    };
    
    // Accumulated pixel drift since last render() for CSS translate during pan.
    // Each touch/mouse move adds the finger delta; render() resets to zero.
    // The CSS translate gives instant compositor-thread feedback on 120Hz displays
    // where 2-3 touch events can fire between RAF callbacks.
    let panDriftX = 0;
    let panDriftY = 0;
    
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
        
        // ===== USGS LAYERS (US Government - Public Domain) =====
        usgs_topo: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Topo',
            description: 'Official USGS topographic maps (US only)'
        },
        usgs_imagery: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Imagery',
            description: 'USGS orthoimagery (US only)'
        },
        usgs_imagery_topo: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'base',
            category: 'usgs',
            name: 'USGS Imagery + Topo',
            description: 'Aerial imagery with topo overlay (US only)'
        },
        usgs_hydro: {
            url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}',
            attribution: '© USGS The National Map',
            maxZoom: 16,
            type: 'overlay',
            category: 'usgs',
            name: 'USGS Hydro',
            description: 'Hydrography - water features (US only)'
        },
        
        // ===== BLM LAYERS (US Government - Public Domain) =====
        blm_surface: {
            url: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}',
            attribution: '© Bureau of Land Management',
            maxZoom: 16,
            type: 'overlay',
            category: 'blm',
            name: 'BLM Surface Mgmt',
            description: 'Land ownership & management (US only)'
        }
        
        // NOTE: Esri basemaps (satellite, hillshade, labels, transportation, natgeo, usfs_topo)
        // have been removed as they require commercial licensing for paid distribution.
        // USGS Imagery can be used as a satellite alternative for US coverage.
    };
    
    // Current active layers
    let activeLayers = {
        base: 'standard',  // standard | terrain | satellite
        overlays: []       // ['labels', 'hillshade']
    };
    
    // Custom tile layers (for satellite weather, etc.)
    // Map of layerId -> { url, opacity, maxZoom, attribution, zIndex }
    const customTileLayers = new Map();
    
    // Custom overlay markers (for AQI stations, etc.)
    // Map of layerId -> { markers: [...], visible: true, onClick: fn }
    const customOverlayMarkers = new Map();
    
    // Callbacks for map movement/zoom (for external modules like AQI)
    const moveCallbacks = [];

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
        
        // Cache hot DOM references (static elements only)
        zoomLevelEl = document.getElementById('zoom-level');
        coordsFormatEl = document.getElementById('coords-format');
        coordsTextEl = document.getElementById('coords-text');
        declinationValueEl = document.getElementById('declination-value');
        
        // Initialize scoped event manager
        mapEvents = EventManager.createScopedManager(EventManager.SCOPES.MAP);
        
        // Load saved position and layer preferences
        loadMapPosition();
        loadLayerPreferences();
        
        resize();
        
        // Track resize listener with EventManager
        const debouncedResize = Helpers.debounce(resize, 250);
        mapEvents.on(window, 'resize', debouncedResize);
        
        // Safety net: if the browser's visual viewport scale changes (e.g., 
        // accessibility zoom), re-sync the canvas dimensions to prevent
        // coordinate misalignment between latLonToPixel and rendered tiles.
        if (window.visualViewport) {
            mapEvents.on(window.visualViewport, 'resize', debouncedResize);
        }
        
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
        
        // Pointer events — used exclusively for getCoalescedEvents() which
        // provides sub-frame touch positions that TouchEvent doesn't expose.
        // This improves inertia velocity estimation and smooths out the 
        // "quantized" feel of touch interactions at high refresh rates.
        mapEvents.on(canvas, 'pointermove', handlePointerMoveCoalesced);
        
        // Keyboard shortcuts (document-level)
        mapEvents.on(document, 'keydown', handleGlobalKeyDown);
        
        initialized = true;
        
        // Subscribe to state changes
        State.subscribe(render, ['waypoints', 'routes', 'mapLayers', 'selectedWaypoint', 'mousePosition', 'teamMembers']);
        
        // Subscribe to GPS position updates
        if (typeof GPSModule !== 'undefined') {
            GPSModule.subscribe(() => {
                scheduleRender(); // Re-render map when GPS position updates
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
                    if (declinationValueEl) {
                        const current = DeclinationModule.getCurrent();
                        declinationValueEl.textContent = DeclinationModule.formatDeclination(current.declination);
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
        
        if (!declinationValueEl) return;
        
        DeclinationModule.updatePosition(mapState.lat, mapState.lon);
        const current = DeclinationModule.getCurrent();
        declinationValueEl.textContent = DeclinationModule.formatDeclination(current.declination);
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
            zoomLevelEl.textContent = mapState.zoom + 'z';
            updateScaleBar();
            render();
            saveMapPosition();
        }
        
        // - - Zoom out
        if (e.key === '-') {
            mapState.zoom = Math.max(3, mapState.zoom - 1);
            zoomLevelEl.textContent = mapState.zoom + 'z';
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
        if (!coordsFormatEl) return;
        
        // Update display to current format
        updateCoordFormatDisplay();
        
        // Click to cycle through formats
        coordsFormatEl.onclick = () => {
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
        if (!coordsFormatEl || typeof Coordinates === 'undefined') return;
        
        const format = Coordinates.getFormat();
        const labels = {
            dd: 'DD',
            dms: 'DMS',
            ddm: 'DDM',
            utm: 'UTM',
            mgrs: 'MGRS'
        };
        coordsFormatEl.textContent = labels[format] || 'DD';
    }

    function resize() {
        const nativeDpr = window.devicePixelRatio || 1;
        // P2: Cap DPR on touch devices to reduce canvas pixel count.
        // At native 2.0 on a 1920×1200 tablet, canvas is 3840×2400 (9.2M pixels).
        // At 1.5, it's 2880×1800 (5.2M pixels) — 43% fewer pixels, visually identical
        // for 256px raster map tiles on a 10" display.
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        effectiveDpr = isTouch ? Math.min(nativeDpr, 1.5) : nativeDpr;
        
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * effectiveDpr;
        canvas.height = rect.height * effectiveDpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(effectiveDpr, effectiveDpr);
        
        // High-quality bilinear interpolation for tile upscaling during
        // fractional zoom.  Reduces the "blurry sawtooth" effect inherent
        // in raster tiles scaled between integer zoom levels.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Cache canvas bounds for touch handlers (avoids forced reflow per event)
        const canvasRect = canvas.getBoundingClientRect();
        cachedCanvasRect.left = canvasRect.left;
        cachedCanvasRect.top = canvasRect.top;
        cachedCanvasRect.width = canvasRect.width;
        cachedCanvasRect.height = canvasRect.height;
        
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
        const width = canvas.width / effectiveDpr;
        const height = canvas.height / effectiveDpr;
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
        
        // Apply rotation around center if map is rotated.
        // Skip during rendering — the canvas context transform handles rotation,
        // so applying it here too would double-rotate all markers/overlays.
        if (!_insideRotatedContext && mapState.bearing !== 0) {
            const bearingRad = -mapState.bearing * Math.PI / 180;
            const dx = pixelX - width / 2;
            const dy = pixelY - height / 2;
            pixelX = width / 2 + dx * Math.cos(bearingRad) - dy * Math.sin(bearingRad);
            pixelY = height / 2 + dx * Math.sin(bearingRad) + dy * Math.cos(bearingRad);
        }
        
        return { x: pixelX, y: pixelY };
    }

    function pixelToLatLon(pixelX, pixelY) {
        const width = canvas.width / effectiveDpr;
        const height = canvas.height / effectiveDpr;
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
                // Limit cache size per layer type.
                // 400 base tiles retains ~2 zoom levels (current + previous)
                // ensuring fallback tiles are available during zoom transitions.
                const cacheLimit = tileServer.type === 'overlay' ? 150 : 400;
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
        
        // Clear any CSS gesture transform before painting.  render() is called
        // synchronously inside a RAF callback, so the browser won't composite
        // the un-transformed canvas mid-frame — it only sees the final
        // repainted pixels at the end of this callback.
        if (canvas.style.transform) {
            canvas.style.transform = '';
            canvas.style.transformOrigin = '';
        }
        panDriftX = 0;
        panDriftY = 0;
        
        const width = canvas.width / effectiveDpr;
        const height = canvas.height / effectiveDpr;
        const layers = State.get('mapLayers');
        
        // During pinch/one-finger-zoom/pan-drag, skip expensive overlay rendering.
        // Tiles + GPS + waypoints + crosshair are kept; everything else deferred
        // until the gesture ends.  This cuts per-frame work significantly on
        // complex scenes (hardware overlays, routes, breadcrumbs, etc.).
        const isGesturing = gestureState.isActive || oneFingerZoomState.isActive || mapState.isDragging;
        
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
        
        // Flag tells latLonToPixel to skip bearing rotation — the canvas
        // context transform already handles it.  Without this, every marker
        // drawn via latLonToPixel would be rotated twice.
        _insideRotatedContext = true;
        
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
        
        if (!isGesturing) {
            // Full render — all overlays
            if (layers.grid) renderGrid(width, height);
            renderRoutes(width, height);
            renderMeasurements(width, height);
            renderWaypoints(width, height);
            renderTeamMembers(width, height);
            renderTAKOverlay(width, height);
            renderAPRSStations(width, height);
            renderRadiaCodeOverlay(width, height);
            renderAtlasRFOverlay(width, height);
            renderSarsatOverlay(width, height);
            renderNavigationBreadcrumbs(width, height);
            renderGPSPosition(width, height);
            renderCrosshair(width, height);
            renderDrawingRegion(width, height);
            renderRFLOSOverlay(width, height);
            renderStreamGaugeOverlay(width, height);
            renderOverlayMarkers(width, height);
        } else {
            // Gesture render — essentials only for speed
            renderWaypoints(width, height);
            renderGPSPosition(width, height);
            renderCrosshair(width, height);
        }
        
        _insideRotatedContext = false;
        
        // Restore state (removes rotation)
        ctx.restore();
        
        // Render non-rotated UI elements
        renderAttribution(width, height);
        renderCompassRose(width, height);
        
        // Update gestureRenderState so the next CSS transform delta is computed
        // relative to what's actually painted on this frame.
        // gestureRenderState is ONLY set here (in render), never in touch handlers,
        // because only render() knows what's actually on the canvas.
        if (gestureState.isActive) {
            // Two-finger pinch — anchor is the pinch midpoint
            gestureRenderState.active = true;
            gestureRenderState.zoom = mapState.zoom;
            gestureRenderState.bearing = mapState.bearing;
            gestureRenderState.lat = mapState.lat;
            gestureRenderState.lon = mapState.lon;
            gestureRenderState.pinchCX = gestureState.centerX - cachedCanvasRect.left;
            gestureRenderState.pinchCY = gestureState.centerY - cachedCanvasRect.top;
        } else if (oneFingerZoomState.isActive) {
            // One-finger zoom drag — anchor is the initial tap point
            gestureRenderState.active = true;
            gestureRenderState.zoom = mapState.zoom;
            gestureRenderState.bearing = mapState.bearing;
            gestureRenderState.lat = mapState.lat;
            gestureRenderState.lon = mapState.lon;
            gestureRenderState.pinchCX = oneFingerZoomState.screenX - cachedCanvasRect.left;
            gestureRenderState.pinchCY = oneFingerZoomState.screenY - cachedCanvasRect.top;
        }
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
        
        // Render enhanced hiking trail if active
        if (typeof HikingModule !== 'undefined' && HikingModule.isHikeActive()) {
            HikingModule.renderHikingTrail(ctx, latLonToPixel, {
                colorBySpeed: true,
                showDistanceMarkers: true,
                lineWidth: 4,
                markerInterval: 0.25
            });
        }
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
            // Legacy fallback: satellite was removed, use USGS imagery instead
            activeLayers.base = 'usgs_imagery';
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
        
        // Tile servers only serve tiles at integer zoom levels.
        // During pinch zoom, mapState.zoom is fractional (e.g., 12.7).
        // We fetch tiles at the floored zoom level and scale them visually
        // by the fractional remainder for smooth interpolation.
        // Math.floor ensures tiles always scale UP (1.0× to 2.0×) during zoom-in,
        // which feels natural. Math.round was tried but creates a jarring shrink
        // at the 0.5 boundary where tiles suddenly switch direction.
        const tileZoom = Math.floor(zoom);
        const interpScale = Math.pow(2, zoom - tileZoom);
        const scaledTileSize = tileSize * interpScale;
        
        const n = Math.pow(2, tileZoom);
        
        const server = TILE_SERVERS[layerKey];
        if (!server) return;
        
        // Check zoom limit - use max zoom tiles if beyond limit
        const effectiveZoom = Math.min(tileZoom, server.maxZoom);
        const zoomDiff = tileZoom - effectiveZoom;
        const scaleFactor = Math.pow(2, zoomDiff);
        
        // Calculate center position in tile-space at the integer tile zoom
        const centerX = (mapState.lon + 180) / 360 * n;
        const centerLatRad = mapState.lat * Math.PI / 180;
        const centerY = (1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2 * n;
        
        // Integer tile coordinates of the center
        const centerTileX = Math.floor(centerX);
        const centerTileY = Math.floor(centerY);
        
        // Sub-tile offset scaled to rendered tile size
        const offsetX = (centerX - centerTileX) * scaledTileSize;
        const offsetY = (centerY - centerTileY) * scaledTileSize;
        
        // How many tiles cover the viewport at this scaled size
        const tilesX = Math.ceil(width / scaledTileSize) + 2;
        const tilesY = Math.ceil(height / scaledTileSize) + 2;
        
        const startTileX = centerTileX - Math.floor(tilesX / 2);
        const startTileY = centerTileY - Math.floor(tilesY / 2);
        
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
                
                // Position tiles relative to the ACTUAL canvas center, not the
                // expanded viewport center.  When map is rotated, the viewport
                // is expanded 1.5× to cover corners, but tile/marker coordinate
                // systems must share the same center point.  latLonToPixel uses
                // (canvas.width/dpr)/2 as center; tiles must match.
                const canvasCX = (canvas.width / effectiveDpr) / 2;
                const canvasCY = (canvas.height / effectiveDpr) / 2;
                const screenX = canvasCX + (dx - Math.floor(tilesX / 2)) * scaledTileSize - offsetX;
                const screenY = canvasCY + (dy - Math.floor(tilesY / 2)) * scaledTileSize - offsetY;
                
                // Only draw placeholder for base layer
                if (!isOverlay) {
                    ctx.fillStyle = '#2a2f3e';
                    ctx.fillRect(screenX, screenY, scaledTileSize, scaledTileSize);
                }
                
                // When zoom exceeds maxZoom (overzoom), compute parent tile
                // at effectiveZoom and extract the correct sub-region.
                const parentX = scaleFactor > 1 ? Math.floor(wrappedTileX / scaleFactor) : wrappedTileX;
                const parentY = scaleFactor > 1 ? Math.floor(tileY / scaleFactor) : tileY;
                const cacheKey = `${layerKey}/${effectiveZoom}/${parentX}/${parentY}`;
                
                if (tileCache.has(cacheKey)) {
                    if (scaleFactor > 1) {
                        // Draw the sub-region of the parent tile that corresponds
                        // to this overzoomed child tile
                        const subX = wrappedTileX % scaleFactor;
                        const subY = tileY % scaleFactor;
                        const srcSize = tileSize / scaleFactor;
                        const srcX = subX * srcSize;
                        const srcY = subY * srcSize;
                        ctx.drawImage(tileCache.get(cacheKey), srcX, srcY, srcSize, srcSize, screenX, screenY, scaledTileSize, scaledTileSize);
                    } else {
                        ctx.drawImage(tileCache.get(cacheKey), screenX, screenY, scaledTileSize, scaledTileSize);
                    }
                } else {
                    // Tile not cached — try to render from a cached ancestor/descendant
                    if (!drawFallbackTile(layerKey, parentX, parentY, effectiveZoom, screenX, screenY, scaledTileSize)) {
                        if (!isOverlay) {
                            loadingCount++;
                            ctx.fillStyle = '#1e2433';
                            ctx.fillRect(screenX, screenY, scaledTileSize, scaledTileSize);
                            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                            ctx.strokeRect(screenX, screenY, scaledTileSize, scaledTileSize);
                        }
                    }
                    
                    // During active gestures, don't fetch new tiles — render
                    // from cache/fallback only to avoid flooding the connection pool.
                    if (!gestureState.isActive && !oneFingerZoomState.isActive && !mapState.isDragging) {
                        loadTile(parentX, parentY, effectiveZoom, layerKey)
                            .then(() => scheduleRender())
                            .catch(() => {});
                    }
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
        
        // Prefetch tiles at the next zoom level when approaching the integer
        // transition boundary. With Math.floor, tileZoom increments at each
        // integer crossing (12.99→13.0). Pre-warming the cache at frac > 0.6
        // ensures z+1 tiles are ready before the visual switchover.
        if (!isOverlay && !Number.isInteger(zoom) && !gestureState.isActive && !oneFingerZoomState.isActive) {
            const frac = zoom - tileZoom; // always 0..1 with Math.floor
            if (frac > 0.6) {
                const prefetchZoom = tileZoom + 1;
                if (prefetchZoom <= (server.maxZoom || 19)) {
                    const pfN = Math.pow(2, prefetchZoom);
                    const pfCenterX = (mapState.lon + 180) / 360 * pfN;
                    const pfCenterLatRad = mapState.lat * Math.PI / 180;
                    const pfCenterY = (1 - Math.log(Math.tan(pfCenterLatRad) + 1 / Math.cos(pfCenterLatRad)) / Math.PI) / 2 * pfN;
                    const pfCenterTileX = Math.floor(pfCenterX);
                    const pfCenterTileY = Math.floor(pfCenterY);
                    // Prefetch a small grid around center (just the core visible tiles)
                    const pfRadius = 3;
                    for (let dx = -pfRadius; dx <= pfRadius; dx++) {
                        for (let dy = -pfRadius; dy <= pfRadius; dy++) {
                            const tx = ((pfCenterTileX + dx) % pfN + pfN) % pfN;
                            const ty = pfCenterTileY + dy;
                            if (ty < 0 || ty >= pfN) continue;
                            const key = `${layerKey}/${prefetchZoom}/${tx}/${ty}`;
                            if (!tileCache.has(key) && !pendingTiles.has(key)) {
                                loadTile(tx, ty, prefetchZoom, layerKey).catch(() => {});
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Show tile loading indicator
     */
    function showTileLoadingIndicator(width, height, count) {
        // Use actual canvas width for positioning, not expanded viewport
        const actualWidth = canvas.width / effectiveDpr;
        ctx.fillStyle = 'rgba(15, 20, 25, 0.85)';
        ctx.fillRect(actualWidth - 120, 70, 110, 30);
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
        ctx.strokeRect(actualWidth - 120, 70, 110, 30);
        
        ctx.fillStyle = '#f97316';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`⏳ Loading ${count} tiles`, actualWidth - 112, 89);
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
        const tileZoom = Math.floor(mapState.zoom);
        const interpScale = Math.pow(2, mapState.zoom - tileZoom);
        const scaledTileSize = mapState.tileSize * interpScale;
        
        const effectiveZoom = Math.min(tileZoom, layer.maxZoom);
        const scale = Math.pow(2, tileZoom);
        const worldSize = scaledTileSize * scale;
        
        const centerX = ((mapState.lon + 180) / 360) * worldSize;
        const centerY = ((1 - Math.log(Math.tan(mapState.lat * Math.PI / 180) + 
                         1 / Math.cos(mapState.lat * Math.PI / 180)) / Math.PI) / 2) * worldSize;
        
        // Position tiles relative to actual canvas center, not expanded viewport.
        // Coverage uses expanded width for corner coverage when rotated.
        const canvasCX = (canvas.width / effectiveDpr) / 2;
        const canvasCY = (canvas.height / effectiveDpr) / 2;
        const startX = centerX - canvasCX;
        const startY = centerY - canvasCY;
        
        // Tile coverage range uses expanded viewport for corner coverage
        const coverStartX = centerX - width / 2;
        const coverStartY = centerY - height / 2;
        const startTileX = Math.floor(coverStartX / scaledTileSize);
        const startTileY = Math.floor(coverStartY / scaledTileSize);
        const endTileX = Math.ceil((coverStartX + width) / scaledTileSize);
        const endTileY = Math.ceil((coverStartY + height) / scaledTileSize);
        
        const maxTile = Math.pow(2, effectiveZoom) - 1;
        
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                const wrappedX = ((tileX % (maxTile + 1)) + (maxTile + 1)) % (maxTile + 1);
                
                if (tileY < 0 || tileY > maxTile) continue;
                
                const drawX = tileX * scaledTileSize - startX;
                const drawY = tileY * scaledTileSize - startY;
                
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
                        ctx.drawImage(cached.img, drawX, drawY, scaledTileSize, scaledTileSize);
                    }
                } else if (!pendingTiles.has(cacheKey) &&
                           !gestureState.isActive && !oneFingerZoomState.isActive && !mapState.isDragging) {
                    // Start loading tile (suppressed during gestures)
                    pendingTiles.add(cacheKey);
                    
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    img.onload = () => {
                        tileCache.set(cacheKey, { img, loaded: true });
                        pendingTiles.delete(cacheKey);
                        scheduleRender();
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

    // ==================== CUSTOM OVERLAY MARKERS ====================
    
    /**
     * Add a custom overlay marker layer (for AQI stations, etc.)
     * @param {string} layerId - Unique identifier for the layer
     * @param {Array} markers - Array of marker objects with {lat, lon, color, value, label, data}
     * @param {Object} options - Optional: { onClick: fn, tooltip: true }
     */
    function addOverlayMarkers(layerId, markers = [], options = {}) {
        customOverlayMarkers.set(layerId, {
            markers: markers,
            visible: true,
            onClick: options.onClick || null,
            showTooltip: options.tooltip !== false,
            markerRadius: options.radius || 12
        });
        render();
        return true;
    }
    
    /**
     * Update markers in an existing overlay layer
     */
    function updateOverlayMarkers(layerId, markers) {
        const layer = customOverlayMarkers.get(layerId);
        if (!layer) return false;
        
        layer.markers = markers;
        render();
        return true;
    }
    
    /**
     * Remove an overlay marker layer
     */
    function removeOverlayMarkers(layerId) {
        if (!customOverlayMarkers.has(layerId)) return false;
        customOverlayMarkers.delete(layerId);
        render();
        return true;
    }
    
    /**
     * Check if overlay marker layer exists
     */
    function hasOverlayMarkers(layerId) {
        return customOverlayMarkers.has(layerId);
    }
    
    /**
     * Render all custom overlay markers
     */
    function renderOverlayMarkers(width, height) {
        if (customOverlayMarkers.size === 0) return;
        
        customOverlayMarkers.forEach((layer, layerId) => {
            if (!layer.visible || !layer.markers) return;
            
            const radius = layer.markerRadius || 12;
            
            layer.markers.forEach(marker => {
                if (!marker.lat || !marker.lon) return;
                
                const pixel = latLonToPixel(marker.lat, marker.lon);
                
                // Skip if off screen
                if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
                
                // Draw outer ring (white border)
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = marker.color || '#808080';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw value text inside marker
                if (marker.value !== undefined && marker.value !== null) {
                    ctx.font = 'bold 9px system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // Text color based on marker color brightness
                    const textColor = marker.textColor || '#ffffff';
                    ctx.fillStyle = textColor;
                    ctx.fillText(String(marker.value), pixel.x, pixel.y);
                }
                
                // Store pixel position for click detection
                marker._screenX = pixel.x;
                marker._screenY = pixel.y;
                marker._radius = radius;
            });
        });
    }
    
    /**
     * Handle click on overlay markers
     */
    function handleOverlayMarkerClick(screenX, screenY) {
        let clickedMarker = null;
        let clickedLayerId = null;
        
        customOverlayMarkers.forEach((layer, layerId) => {
            if (!layer.visible || !layer.markers || clickedMarker) return;
            
            layer.markers.forEach(marker => {
                if (clickedMarker) return;
                if (marker._screenX === undefined) return;
                
                const dx = screenX - marker._screenX;
                const dy = screenY - marker._screenY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance <= (marker._radius || 12) + 5) {
                    clickedMarker = marker;
                    clickedLayerId = layerId;
                }
            });
        });
        
        if (clickedMarker && clickedLayerId) {
            const layer = customOverlayMarkers.get(clickedLayerId);
            if (layer?.onClick) {
                layer.onClick(clickedMarker, clickedLayerId);
                return true;
            }
        }
        
        return false;
    }
    
    // ==================== MAP MOVEMENT CALLBACKS ====================
    
    /**
     * Register a callback for map movement (pan/zoom)
     * @param {Function} callback - Function to call when map moves
     * @returns {Function} - Unsubscribe function
     */
    function onMoveEnd(callback) {
        if (typeof callback === 'function') {
            moveCallbacks.push(callback);
        }
        // Return unsubscribe function
        return () => {
            const index = moveCallbacks.indexOf(callback);
            if (index > -1) {
                moveCallbacks.splice(index, 1);
            }
        };
    }
    
    /**
     * Notify all move callbacks (debounced)
     */
    let moveEndTimeout = null;
    function notifyMoveEnd() {
        if (moveEndTimeout) {
            clearTimeout(moveEndTimeout);
        }
        moveEndTimeout = setTimeout(() => {
            moveCallbacks.forEach(cb => {
                try {
                    cb(getMapState());
                } catch (e) {
                    console.error('Move callback error:', e);
                }
            });
            moveEndTimeout = null;
        }, 300);
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
        
        // Filter to members with valid positions (including self when it has a real position)
        const visibleMembers = team.filter(m => 
            m.lat && m.lon && 
            (Math.abs(m.lat) > 0.001 || Math.abs(m.lon) > 0.001)
        );
        
        if (visibleMembers.length === 0) return;
        
        visibleMembers.forEach(member => {
            const pixel = latLonToPixel(member.lat, member.lon);
            
            // Skip if offscreen
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            if (member.isMe) {
                // === SELF MARKER: Distinct mesh device indicator ===
                // Orange ring with pulse — shows "your mesh node" on the network
                // Visually distinct from blue GPS dot (phone) and green team nodes (others)
                
                const selfColor = '#f97316'; // Orange — matches Meshtastic branding
                
                // Pulsing outer ring
                ctx.shadowColor = selfColor;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, 16, 0, Math.PI * 2);
                ctx.strokeStyle = selfColor + '88';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.shadowBlur = 0;
                
                // Solid circle
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, 12, 0, Math.PI * 2);
                ctx.fillStyle = selfColor + 'dd';
                ctx.fill();
                
                // Inner dark circle
                ctx.beginPath();
                ctx.arc(pixel.x, pixel.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#1a1f2e';
                ctx.fill();
                
                // Mesh icon
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = selfColor;
                ctx.fillText('📡', pixel.x, pixel.y);
                
                // Label
                const selfLabel = member.shortName || 'You';
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.fillStyle = selfColor;
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 3;
                ctx.strokeText(selfLabel, pixel.x, pixel.y + 24);
                ctx.fillText(selfLabel, pixel.x, pixel.y + 24);
                
                return;
            }
            
            // === OTHER NODE MARKERS ===
            
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
     * Render CoT positions and markers on the map
     */
    function renderTAKOverlay(width, height) {
        if (typeof TAKModule === 'undefined') return;
        
        const status = TAKModule.getStatus();
        if (!status.isConnected) return;
        
        const positions = TAKModule.getPositions();
        const markers = TAKModule.getMarkers();
        
        // Render markers first (under positions)
        markers.forEach(marker => {
            if (!marker.lat || !marker.lon) return;
            
            const pixel = latLonToPixel(marker.lat, marker.lon);
            
            // Skip if offscreen
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            const color = marker.color || '#f97316';
            
            // Draw marker dot
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw label at higher zoom
            if (mapState.zoom >= 10) {
                ctx.font = '10px system-ui, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.strokeText(marker.name, pixel.x, pixel.y + 18);
                ctx.fillText(marker.name, pixel.x, pixel.y + 18);
            }
        });
        
        // Render positions
        positions.forEach(pos => {
            if (!pos.lat || !pos.lon) return;
            
            const pixel = latLonToPixel(pos.lat, pos.lon);
            
            // Skip if offscreen
            if (pixel.x < -50 || pixel.x > width + 50 || pixel.y < -50 || pixel.y > height + 50) return;
            
            const color = pos.color || '#06b6d4';
            
            // Draw direction indicator (if moving)
            if (pos.speed > 0.5 && pos.course !== undefined) {
                ctx.save();
                ctx.translate(pixel.x, pixel.y);
                ctx.rotate((pos.course * Math.PI) / 180);
                
                ctx.beginPath();
                ctx.moveTo(0, -18);
                ctx.lineTo(-6, -10);
                ctx.lineTo(6, -10);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                
                ctx.restore();
            }
            
            // Draw position dot with TAK styling
            ctx.beginPath();
            ctx.arc(pixel.x, pixel.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            
            // White border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Inner 'T' indicator for TAK
            ctx.font = 'bold 10px system-ui';
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('T', pixel.x, pixel.y);
            
            // Name label
            if (mapState.zoom >= 10) {
                const shortName = pos.name?.substring(0, 10) || 'TAK';
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = 'rgba(0,0,0,0.7)';
                ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.strokeText(shortName, pixel.x, pixel.y + 14);
                ctx.fillText(shortName, pixel.x, pixel.y + 14);
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
     * Render RadiaCode radiation overlay (heatmap, tracks, current position)
     */
    function renderRadiaCodeOverlay(width, height) {
        if (typeof RadiaCodeModule === 'undefined') return;
        if (!RadiaCodeModule.isConnected() && !RadiaCodeModule.isDemoMode() && RadiaCodeModule.getTracks().length === 0) return;
        
        // Delegate to the module's built-in render function (includes heatmap support)
        RadiaCodeModule.renderOnMap(ctx, width, height, latLonToPixel);
    }

    /**
     * Render AtlasRF tracks (aircraft, ships, drones, etc.)
     */
    function renderAtlasRFOverlay(width, height) {
        if (typeof AtlasRFModule === 'undefined') return;
        if (!AtlasRFModule.isConnected()) return;
        
        // Use the module's built-in render function
        AtlasRFModule.renderOnMap(ctx, width, height, latLonToPixel, mapState.zoom);
    }
    
    function renderSarsatOverlay(width, height) {
        // Render SARSAT PLB/ELT/EPIRB beacons on map
        if (typeof SarsatModule === 'undefined') return;
        
        const beacons = SarsatModule.getBeacons();
        if (!beacons || beacons.length === 0) return;
        
        // Use module's built-in render function if available
        if (typeof SarsatModule.renderOnMap === 'function') {
            SarsatModule.renderOnMap(ctx, width, height, latLonToPixel);
        }
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
        // NOTE: satellite layer removed for commercial licensing compliance
        
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
            const x = e.clientX - cachedCanvasRect.left;
            const y = e.clientY - cachedCanvasRect.top;
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
            
            // Reset pan drift and inertia for new drag
            panDriftX = 0;
            panDriftY = 0;
            cancelInertia();
            inertiaState.history = [];
        }
    }

    function handleMouseMove(e) {
        // Use cached rect to avoid forced layout reflow on every frame.
        // cachedCanvasRect is updated on resize/orientation change.
        const pos = { x: e.clientX - cachedCanvasRect.left, y: e.clientY - cachedCanvasRect.top };
        State.Map.setMousePosition(pos);
        
        // Check if drawing region
        if (mapState.isDrawingRegion && mapState.drawStart) {
            const coords = pixelToLatLon(pos.x, pos.y);
            if (typeof OfflineModule !== 'undefined') {
                const bounds = OfflineModule.handleDrawMove(coords);
                if (bounds) {
                    mapState.drawEnd = pos;
                    scheduleRender();
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
            
            // Reuse object to avoid GC pressure
            mapState.dragStart.x = e.clientX;
            mapState.dragStart.y = e.clientY;
            
            // Record velocity for mouse inertia (momentum after release)
            recordInertiaSample(e.clientX, e.clientY);
            
            // CSS translate for instant visual feedback
            panDriftX += dx;
            panDriftY += dy;
            canvas.style.transform = `translate(${panDriftX}px, ${panDriftY}px)`;
            
            scheduleRender();
            debouncedSaveMapPosition();
        } else {
            // Only update coordinate display when NOT dragging — avoids
            // DOM text writes on every frame during pan gestures.
            const coords = pixelToLatLon(pos.x, pos.y);
            if (coordsTextEl) {
                if (typeof Coordinates !== 'undefined') {
                    coordsTextEl.textContent = Coordinates.formatShort(coords.lat, coords.lon);
                } else {
                    const latDir = coords.lat >= 0 ? 'N' : 'S';
                    const lonDir = coords.lon >= 0 ? 'E' : 'W';
                    coordsTextEl.textContent = `${Math.abs(coords.lat).toFixed(4)}° ${latDir}, ${Math.abs(coords.lon).toFixed(4)}° ${lonDir}`;
                }
            }
            
            // Update measure hover point for preview line
            if (typeof MeasureModule !== 'undefined' && MeasureModule.isActive()) {
                MeasureModule.setHoverPoint(coords.lat, coords.lon);
            }
            
            scheduleRender();
        }
    }

    function handleMouseUp(e) {
        // Check if we were drawing a region
        if (mapState.isDrawingRegion && mapState.drawStart) {
            if (typeof OfflineModule !== 'undefined') {
                const x = e.clientX - cachedCanvasRect.left;
                const y = e.clientY - cachedCanvasRect.top;
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
        panDriftX = 0;
        panDriftY = 0;
        canvas.style.cursor = 'crosshair';
        
        // Launch inertia (momentum) animation from mouse drag velocity
        const velocity = computeInertiaVelocity();
        if (velocity) {
            startInertia(velocity.vx, velocity.vy);
        } else {
            saveMapPosition();
        }
        render();
    }
    function handleMouseLeave() {
        mapState.isDragging = false;
        mapState.dragStart = null;
        mapState.isDrawingRegion = false;
        panDriftX = 0;
        panDriftY = 0;
        State.Map.setMousePosition(null);
        canvas.style.cursor = 'crosshair';
        scheduleRender();
    }

    function handleWheel(e) {
        e.preventDefault();
        const mouseX = e.clientX - cachedCanvasRect.left;
        const mouseY = e.clientY - cachedCanvasRect.top;
        const beforeZoom = pixelToLatLon(mouseX, mouseY);
        
        const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
        mapState.zoom = e.deltaY < 0 ? Math.min(maxZoom, mapState.zoom + 1) : Math.max(3, mapState.zoom - 1);
        
        const afterZoom = pixelToLatLon(mouseX, mouseY);
        mapState.lat += beforeZoom.lat - afterZoom.lat;
        mapState.lon += beforeZoom.lon - afterZoom.lon;
        mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
        
        zoomLevelEl.textContent = mapState.zoom + 'z';
        updateScaleBar();
        scheduleRender();
        saveMapPosition();
    }

    function handleClick(e) {
        if (mapState.isDragging) return;
        
        // Suppress click fired by the browser after a double-tap zoom
        if (doubleTapState.suppressClick) {
            doubleTapState.suppressClick = false;
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const clickCoords = pixelToLatLon(x, y);
        
        // Check for resection-landmark mode
        if (mapState.interactionMode === 'resection-landmark') {
            if (typeof RangefinderModule !== 'undefined') {
                // Prompt for landmark name
                const name = prompt('Enter landmark name (or leave blank):');
                RangefinderModule.addFromMapTap(clickCoords.lat, clickCoords.lon, name || null);
                
                // Reset mode
                mapState.interactionMode = null;
                
                // Refresh UI
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Landmark added', 'success', 2000);
                }
                
                // Reopen navigation panel
                if (typeof State !== 'undefined') {
                    State.set('activePanel', 'navigation');
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar) sidebar.classList.add('open');
                    if (typeof PanelsModule !== 'undefined') {
                        PanelsModule.render();
                    }
                }
                
                render();
                return;
            }
        }
        
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
        
        // Check if clicked on a custom overlay marker (AQI stations, etc.)
        if (handleOverlayMarkerClick(x, y)) {
            return;
        }
        
        // Check if clicked on an AtlasRF track (aircraft, ship, drone, etc.)
        if (typeof AtlasRFModule !== 'undefined' && AtlasRFModule.isConnected()) {
            const hitTrack = AtlasRFModule.hitTest(x, y, latLonToPixel);
            if (hitTrack) {
                const details = AtlasRFModule.getTrackDetails(hitTrack);
                if (details.length > 0 && typeof ModalsModule !== 'undefined') {
                    const typeConfig = AtlasRFModule.TRACK_TYPES[hitTrack.type] || {};
                    const title = `${typeConfig.icon || '📡'} ${hitTrack.callsign || hitTrack.name || hitTrack.id?.slice(0, 10) || 'Track'}`;
                    const bodyHtml = `
                        <div style="font-size:0.875rem;line-height:1.6">
                            ${details.map(d => `
                                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1)">
                                    <span style="color:#94a3b8;min-width:100px">${d.label}</span>
                                    <span style="color:#f8fafc;text-align:right;font-weight:500">${d.value}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                    ModalsModule.showModal(title, bodyHtml);
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
            const width = canvas.width / effectiveDpr;
            const height = canvas.height / effectiveDpr;
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
        } else {
            // No waypoint — zoom in one level centered on the click/tap point,
            // matching Google Maps / Apple Maps double-click behavior.
            const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
            if (mapState.zoom < maxZoom) {
                animateZoomAt(e.clientX, e.clientY, Math.round(mapState.zoom) + 1);
            }
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
     * Check if Meshtastic is connected
     */
    function isMeshConnected() {
        if (typeof MeshtasticModule === 'undefined') return false;
        const state = MeshtasticModule.getState();
        return state && state.connectionState === 'connected';
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
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Map actions');
        
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
                <button class="map-context-menu__item" role="menuitem" data-action="add-waypoint">
                    <span class="map-context-menu__icon" aria-hidden="true">📍</span>
                    <span>Add Waypoint Here</span>
                </button>
                <button class="map-context-menu__item" role="menuitem" data-action="send-to-mesh" ${isMeshConnected() ? '' : 'disabled'}>
                    <span class="map-context-menu__icon" aria-hidden="true">📡</span>
                    <span>Send to Mesh</span>
                    ${!isMeshConnected() ? '<span class="map-context-menu__hint">(not connected)</span>' : ''}
                </button>
                <button class="map-context-menu__item" role="menuitem" data-action="measure-from">
                    <span class="map-context-menu__icon" aria-hidden="true">📏</span>
                    <span>Measure From Here</span>
                </button>
                <button class="map-context-menu__item" role="menuitem" data-action="navigate-to">
                    <span class="map-context-menu__icon" aria-hidden="true">🧭</span>
                    <span>Navigate To Here</span>
                </button>
                <button class="map-context-menu__item" role="menuitem" data-action="center-map">
                    <span class="map-context-menu__icon" aria-hidden="true">⊕</span>
                    <span>Center Map Here</span>
                </button>
                <div class="map-context-menu__divider"></div>
                <button class="map-context-menu__item" role="menuitem" data-action="copy-coords">
                    <span class="map-context-menu__icon" aria-hidden="true">📋</span>
                    <span>Copy Coordinates</span>
                </button>
                <button class="map-context-menu__item" role="menuitem" data-action="copy-coords-decimal">
                    <span class="map-context-menu__icon" aria-hidden="true">📋</span>
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
                const width = canvas.width / effectiveDpr;
                const height = canvas.height / effectiveDpr;
                const pixel = latLonToPixel(lat, lon);
                Events.emit(Events.EVENTS.MAP_CLICK, { 
                    x: (pixel.x / width) * 100, 
                    y: (pixel.y / height) * 100, 
                    lat: lat, 
                    lon: lon 
                });
                break;
            
            case 'send-to-mesh':
                // Open Send to Mesh modal
                if (typeof MeshtasticModule !== 'undefined' && isMeshConnected()) {
                    openSendToMeshModal(lat, lon);
                } else {
                    ModalsModule.showToast('Connect to Meshtastic first', 'warning');
                }
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
    
    // ==================== Send to Mesh Modal ====================
    
    /**
     * Open modal to send a location to mesh network
     */
    function openSendToMeshModal(lat, lon) {
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) {
            console.error('Modal container not found');
            return;
        }
        
        // Format coordinates for display
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'W' : 'E';
        const coordsDisplay = `${Math.abs(lat).toFixed(5)}°${latDir}, ${Math.abs(lon).toFixed(5)}°${lonDir}`;
        
        // Get available recipients
        const nodes = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.getNodesForRecipientSelection()
            : [];
        
        // Build recipient options
        const recipientOptions = nodes.map(node => {
            const activeClass = node.isActive ? 'active' : 'inactive';
            const signalBadge = node.signalQuality 
                ? `<span class="signal-badge signal-${node.signalQuality}">${node.signalQuality}</span>` 
                : '';
            const timeAgo = formatTimeAgo(node.lastSeen);
            return `
                <button class="recipient-btn ${activeClass}" data-node-id="${node.id}" data-node-name="${node.name}">
                    <span class="recipient-icon">👤</span>
                    <span class="recipient-info">
                        <span class="recipient-name">${node.name}</span>
                        <span class="recipient-details">${timeAgo} ${signalBadge}</span>
                    </span>
                </button>
            `;
        }).join('');
        
        modalContainer.innerHTML = `
            <div class="modal-overlay" id="send-to-mesh-modal">
                <div class="modal" style="max-width:400px">
                    <div class="modal__header">
                        <h3 class="modal__title">📡 Send Location to Mesh</h3>
                        <button class="modal__close" id="close-send-mesh-modal">&times;</button>
                    </div>
                    <div class="modal__content">
                        <!-- Location Preview -->
                        <div style="padding:12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:8px;margin-bottom:16px">
                            <div style="display:flex;align-items:center;gap:10px">
                                <span style="font-size:24px">📍</span>
                                <div>
                                    <div style="font-size:14px;font-weight:600">Dropped Pin</div>
                                    <div style="font-size:12px;color:rgba(255,255,255,0.6);font-family:monospace">${coordsDisplay}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Label Input -->
                        <div style="margin-bottom:16px">
                            <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:4px">LABEL (optional)</label>
                            <input type="text" id="mesh-pin-label" placeholder="e.g., Meeting point, Rally point" 
                                style="width:100%;padding:10px;font-size:13px" maxlength="50">
                        </div>
                        
                        <!-- Recipient Selection -->
                        <div style="margin-bottom:16px">
                            <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:8px">SEND TO</label>
                            
                            <!-- Broadcast Option -->
                            <button class="recipient-btn broadcast selected" data-node-id="" id="broadcast-btn">
                                <span class="recipient-icon">📢</span>
                                <span class="recipient-info">
                                    <span class="recipient-name">Broadcast to All</span>
                                    <span class="recipient-details">Everyone on mesh will receive</span>
                                </span>
                            </button>
                            
                            ${nodes.length > 0 ? `
                                <div style="font-size:10px;color:rgba(255,255,255,0.3);margin:12px 0 8px;text-transform:uppercase">Or send to specific node</div>
                                <div style="max-height:150px;overflow-y:auto">
                                    ${recipientOptions}
                                </div>
                            ` : `
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px;text-align:center;padding:12px">
                                    No other nodes detected yet
                                </div>
                            `}
                        </div>
                        
                        <!-- Send Button -->
                        <button class="btn btn--primary btn--full" id="send-location-btn">
                            📡 Send Location
                        </button>
                    </div>
                </div>
            </div>
            
            <style>
                .recipient-btn {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    width: 100%;
                    padding: 10px 12px;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 8px;
                    margin-bottom: 6px;
                    cursor: pointer;
                    transition: all 0.15s;
                    text-align: left;
                }
                .recipient-btn:hover {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.2);
                }
                .recipient-btn.selected {
                    background: rgba(249,115,22,0.15);
                    border-color: rgba(249,115,22,0.4);
                }
                .recipient-btn.broadcast {
                    background: rgba(34,197,94,0.1);
                    border-color: rgba(34,197,94,0.2);
                }
                .recipient-btn.broadcast.selected {
                    background: rgba(34,197,94,0.2);
                    border-color: rgba(34,197,94,0.4);
                }
                .recipient-btn.inactive {
                    opacity: 0.6;
                }
                .recipient-icon {
                    font-size: 20px;
                }
                .recipient-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .recipient-name {
                    font-size: 13px;
                    font-weight: 500;
                    color: #fff;
                }
                .recipient-details {
                    font-size: 10px;
                    color: rgba(255,255,255,0.5);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .signal-badge {
                    padding: 1px 4px;
                    border-radius: 3px;
                    font-size: 9px;
                    text-transform: uppercase;
                }
                .signal-excellent { background: rgba(34,197,94,0.2); color: #22c55e; }
                .signal-good { background: rgba(132,204,22,0.2); color: #84cc16; }
                .signal-fair { background: rgba(245,158,11,0.2); color: #f59e0b; }
                .signal-poor { background: rgba(239,68,68,0.2); color: #ef4444; }
            </style>
        `;
        
        // Store selected recipient
        let selectedNodeId = null;
        let selectedNodeName = 'all';
        
        // Event handlers
        document.getElementById('close-send-mesh-modal').onclick = () => modalContainer.innerHTML = '';
        document.getElementById('send-to-mesh-modal').onclick = (e) => {
            if (e.target.id === 'send-to-mesh-modal') modalContainer.innerHTML = '';
        };
        
        // Recipient selection
        modalContainer.querySelectorAll('.recipient-btn').forEach(btn => {
            btn.onclick = () => {
                modalContainer.querySelectorAll('.recipient-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedNodeId = btn.dataset.nodeId || null;
                selectedNodeName = btn.dataset.nodeName || 'all';
            };
        });
        
        // Send button
        document.getElementById('send-location-btn').onclick = async () => {
            const label = document.getElementById('mesh-pin-label').value.trim() || null;
            
            // Show sending state
            const sendBtn = document.getElementById('send-location-btn');
            sendBtn.disabled = true;
            sendBtn.innerHTML = '⏳ Sending...';
            
            try {
                const result = await MeshtasticModule.sendLocation(lat, lon, label, selectedNodeId);
                
                if (result.success) {
                    modalContainer.innerHTML = '';
                    // Show pin on map briefly
                    showTemporaryPin(lat, lon, label || 'Sent');
                } else {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '📡 Send Location';
                    ModalsModule.showToast('Failed to send: ' + result.error, 'error');
                }
            } catch (e) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '📡 Send Location';
                ModalsModule.showToast('Error: ' + e.message, 'error');
            }
        };
        
        // Focus label input
        setTimeout(() => {
            const labelInput = document.getElementById('mesh-pin-label');
            if (labelInput) labelInput.focus();
        }, 100);
    }
    
    /**
     * Format time ago for recipient list
     */
    function formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const diff = Date.now() - timestamp;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return 'long ago';
    }
    
    /**
     * Show temporary pin marker on map after sending
     */
    function showTemporaryPin(lat, lon, label) {
        // Add temporary marker
        const tempMarker = {
            id: `temp-sent-${Date.now()}`,
            lat: lat,
            lon: lon,
            label: label,
            type: 'sent-pin'
        };
        
        // Store temporarily and render
        if (!mapState.tempMarkers) mapState.tempMarkers = [];
        mapState.tempMarkers.push(tempMarker);
        render();
        
        // Remove after 3 seconds
        setTimeout(() => {
            mapState.tempMarkers = mapState.tempMarkers.filter(m => m.id !== tempMarker.id);
            render();
        }, 3000);
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
    
    /**
     * Cancel any running inertia animation
     */
    function cancelInertia() {
        if (inertiaState.animationId) {
            cancelAnimationFrame(inertiaState.animationId);
            inertiaState.animationId = null;
        }
        inertiaState.history = [];
    }
    
    /**
     * Record a touch position sample for velocity computation.
     * Called each frame during single-finger drag.
     */
    function recordInertiaSample(x, y) {
        const now = performance.now();
        inertiaState.history.push({ x, y, time: now });
        // Keep only the last N samples
        if (inertiaState.history.length > inertiaState.maxSamples) {
            inertiaState.history.shift();
        }
    }
    
    /**
     * Compute flick velocity (pixels/sec) from recent touch history.
     * Uses only samples from the last 100ms for responsiveness.
     * Returns {vx, vy} or null if insufficient data.
     */
    function computeInertiaVelocity() {
        const h = inertiaState.history;
        if (h.length < 2) return null;
        
        const latest = h[h.length - 1];
        const cutoff = latest.time - 100; // last 100ms
        
        // Find earliest sample within the window
        let startIdx = h.length - 1;
        for (let i = h.length - 2; i >= 0; i--) {
            if (h[i].time >= cutoff) startIdx = i;
            else break;
        }
        
        const first = h[startIdx];
        const dt = latest.time - first.time;
        if (dt < 15) return null; // too short to measure
        
        return {
            vx: (latest.x - first.x) / dt * 1000, // px/sec
            vy: (latest.y - first.y) / dt * 1000
        };
    }
    
    /**
     * Start inertia (momentum) animation after a flick gesture.
     * Applies exponential friction until velocity drops below threshold.
     * @param {number} vx - horizontal velocity in pixels/sec
     * @param {number} vy - vertical velocity in pixels/sec
     */
    function startInertia(vx, vy) {
        // Minimum speed to bother animating (px/sec)
        const minSpeed = 20;
        if (Math.abs(vx) < minSpeed && Math.abs(vy) < minSpeed) {
            saveMapPosition();
            return;
        }
        
        // Cap max velocity to prevent wild flings
        const maxV = 8000;
        vx = Math.max(-maxV, Math.min(maxV, vx));
        vy = Math.max(-maxV, Math.min(maxV, vy));
        
        const friction = 0.95; // per-frame decay at 60fps baseline (0.92 was too aggressive)
        let lastTime = performance.now();
        
        function animate(currentTime) {
            const dt = (currentTime - lastTime) / 1000; // seconds
            lastTime = currentTime;
            
            // Guard against huge dt (tab in background, etc.)
            if (dt > 0.1) {
                inertiaState.animationId = null;
                saveMapPosition();
                return;
            }
            
            // Frame-rate-independent exponential decay
            const decay = Math.pow(friction, dt * 60);
            vx *= decay;
            vy *= decay;
            
            // Stop when slow enough
            if (Math.abs(vx) < minSpeed && Math.abs(vy) < minSpeed) {
                inertiaState.animationId = null;
                saveMapPosition();
                return;
            }
            
            // Convert pixel velocity to lat/lon shift
            const pixelDx = vx * dt;
            const pixelDy = vy * dt;
            
            // Account for map rotation
            const bearingRad = mapState.bearing * Math.PI / 180;
            const rotatedDx = pixelDx * Math.cos(bearingRad) + pixelDy * Math.sin(bearingRad);
            const rotatedDy = -pixelDx * Math.sin(bearingRad) + pixelDy * Math.cos(bearingRad);
            
            const n = Math.pow(2, mapState.zoom);
            mapState.lon -= rotatedDx / mapState.tileSize / n * 360;
            mapState.lat += rotatedDy / mapState.tileSize / n * 180 * Math.cos(mapState.lat * Math.PI / 180);
            mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            while (mapState.lon > 180) mapState.lon -= 360;
            while (mapState.lon < -180) mapState.lon += 360;
            
            scheduleRender();
            inertiaState.animationId = requestAnimationFrame(animate);
        }
        
        inertiaState.animationId = requestAnimationFrame(animate);
    }
    
    /**
     * Animated zoom centered on a screen point (used for double-tap zoom).
     * Smoothly transitions zoom level while keeping the anchor point stationary.
     * @param {number} screenX - clientX of the tap
     * @param {number} screenY - clientY of the tap
     * @param {number} targetZoom - desired integer zoom level
     */
    function animateZoomAt(screenX, screenY, targetZoom) {
        const px = screenX - cachedCanvasRect.left;
        const py = screenY - cachedCanvasRect.top;
        
        const startZoom = mapState.zoom;
        const startLat = mapState.lat;
        const startLon = mapState.lon;
        targetZoom = Math.max(3, Math.min(19, Math.round(targetZoom)));
        if (startZoom === targetZoom) return;
        
        // Capture the geo-coordinate under the tap point at initial state
        const anchorGeo = pixelToLatLon(px, py);
        
        const duration = 250; // ms
        const startTime = performance.now();
        
        // Cancel conflicting animations
        cancelInertia();
        if (doubleTapState.animationId) {
            cancelAnimationFrame(doubleTapState.animationId);
        }
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic for natural deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Non-incremental: restore initial position then apply new zoom
            mapState.lat = startLat;
            mapState.lon = startLon;
            mapState.zoom = startZoom + (targetZoom - startZoom) * eased;
            
            // Reposition so anchor geo stays under tap point
            const cur = pixelToLatLon(px, py);
            mapState.lat += anchorGeo.lat - cur.lat;
            mapState.lon += anchorGeo.lon - cur.lon;
            mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            
            if (zoomLevelEl) zoomLevelEl.textContent = Math.round(mapState.zoom) + 'z';
            updateScaleBar();
            render();
            
            if (progress < 1) {
                doubleTapState.animationId = requestAnimationFrame(animate);
            } else {
                // Snap to exact integer zoom on final frame
                mapState.lat = startLat;
                mapState.lon = startLon;
                mapState.zoom = targetZoom;
                const final = pixelToLatLon(px, py);
                mapState.lat += anchorGeo.lat - final.lat;
                mapState.lon += anchorGeo.lon - final.lon;
                mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
                if (zoomLevelEl) zoomLevelEl.textContent = mapState.zoom + 'z';
                updateScaleBar();
                render();
                saveMapPosition();
                doubleTapState.animationId = null;
            }
        }
        
        doubleTapState.animationId = requestAnimationFrame(animate);
    }
    
    /**
     * Draw a fallback tile from a cached ancestor when the exact tile isn't loaded.
     * Searches up to 3 zoom levels for a parent tile and draws the relevant sub-region
     * scaled up. Prevents the dark-placeholder flash at integer zoom boundaries.
     *
     * @param {string} layerKey - tile layer key
     * @param {number} tileX    - tile X at tileZoom
     * @param {number} tileY    - tile Y at tileZoom
     * @param {number} tileZoom - integer zoom level the tile belongs to
     * @param {number} screenX  - destination X on canvas
     * @param {number} screenY  - destination Y on canvas
     * @param {number} drawSize - destination width/height on canvas
     * @returns {boolean} true if a fallback was drawn
     */
    function drawFallbackTile(layerKey, tileX, tileY, tileZoom, screenX, screenY, drawSize) {
        const ts = mapState.tileSize; // 256
        // Search ancestors: parent (z-1), grandparent (z-2), great-grandparent (z-3)
        for (let dz = 1; dz <= 3; dz++) {
            const ancestorZ = tileZoom - dz;
            if (ancestorZ < 0) continue;
            const divisor = 1 << dz; // 2^dz
            const ancestorX = Math.floor(tileX / divisor);
            const ancestorY = Math.floor(tileY / divisor);
            const key = `${layerKey}/${ancestorZ}/${ancestorX}/${ancestorY}`;
            if (tileCache.has(key)) {
                // Which sub-region of the ancestor covers this tile?
                const subX = tileX % divisor;
                const subY = tileY % divisor;
                const srcSize = ts / divisor;
                const srcX = subX * srcSize;
                const srcY = subY * srcSize;
                ctx.drawImage(tileCache.get(key),
                    srcX, srcY, srcSize, srcSize,
                    screenX, screenY, drawSize, drawSize);
                return true;
            }
        }
        // Also check children — if all 4 child tiles at z+1 are cached,
        // draw them scaled down (helps when zooming out)
        const childZ = tileZoom + 1;
        const childBaseX = tileX * 2;
        const childBaseY = tileY * 2;
        let allChildren = true;
        for (let cy = 0; cy < 2 && allChildren; cy++) {
            for (let cx = 0; cx < 2 && allChildren; cx++) {
                if (!tileCache.has(`${layerKey}/${childZ}/${childBaseX + cx}/${childBaseY + cy}`)) {
                    allChildren = false;
                }
            }
        }
        if (allChildren) {
            const half = drawSize / 2;
            for (let cy = 0; cy < 2; cy++) {
                for (let cx = 0; cx < 2; cx++) {
                    const childImg = tileCache.get(`${layerKey}/${childZ}/${childBaseX + cx}/${childBaseY + cy}`);
                    ctx.drawImage(childImg, screenX + cx * half, screenY + cy * half, half, half);
                }
            }
            return true;
        }
        return false;
    }
    
    /**
     * Apply a CSS transform to the canvas for instant visual feedback during pinch.
     * The transform bridges the gap between touch events (up to 120Hz) and the
     * next RAF repaint (~60Hz).  The browser compositor applies scale/rotate/translate
     * on the GPU at zero JavaScript cost, so the user sees immediate response.
     *
     * IMPORTANT: gestureRenderState is ONLY set by render(), never here.
     * render() knows what's actually painted on the canvas. If we initialized
     * gestureRenderState here (from post-modification mapState), it wouldn't
     * match what's on screen, causing the CSS transform delta to be wrong —
     * which manifests as a visible "warp" where the map doesn't track fingers.
     */
    function applyGestureCSSTransform() {
        // Only apply CSS transform after render() has run at least once during
        // this gesture and snapshotted the painted state. Before that first
        // render, the canvas repaint is the only visual path (no worse than
        // pre-optimization behavior — just one RAF of latency).
        if (!gestureRenderState.active) return;
        
        const scale = Math.pow(2, mapState.zoom - gestureRenderState.zoom);
        const bearingDelta = mapState.bearing - gestureRenderState.bearing;
        const rotateDeg = -bearingDelta;
        
        if (gestureState.zoomLocked) {
            // Rotation-dominant: rotate around canvas center, no translate.
            // Matches the anchor math which keeps lat/lon fixed and only
            // changes bearing, effectively rotating around the map center.
            const ccx = (canvas.width / effectiveDpr) / 2;
            const ccy = (canvas.height / effectiveDpr) / 2;
            canvas.style.transformOrigin = `${ccx}px ${ccy}px`;
            canvas.style.transform = `rotate(${rotateDeg}deg)`;
            return;
        }
        
        // Track finger midpoint movement since last repaint
        const curCX = gestureState.centerX - cachedCanvasRect.left;
        const curCY = gestureState.centerY - cachedCanvasRect.top;
        const tx = curCX - gestureRenderState.pinchCX;
        const ty = curCY - gestureRenderState.pinchCY;
        
        // For pure scale+translate (no rotation change), use the fast path
        // with transform-origin at pinch center.
        if (Math.abs(bearingDelta) < 0.1) {
            canvas.style.transformOrigin = `${gestureRenderState.pinchCX}px ${gestureRenderState.pinchCY}px`;
            canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
            return;
        }
        
        // Combined zoom+rotate: scale around pinch center, rotate around
        // canvas center, translate to track finger movement.
        const width = canvas.width / effectiveDpr;
        const height = canvas.height / effectiveDpr;
        const ccx = width / 2;
        const ccy = height / 2;
        const pcx = gestureRenderState.pinchCX;
        const pcy = gestureRenderState.pinchCY;
        
        const theta = -bearingDelta * Math.PI / 180;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        
        const a = scale * cos;
        const b = scale * sin;
        const c = -scale * sin;
        const d = scale * cos;
        const e = ccx * (1 - cos) + ccy * sin
                + pcx * (1 - scale) * cos - pcy * (1 - scale) * sin + tx;
        const f = ccy * (1 - cos) - ccx * sin
                + pcx * (1 - scale) * sin + pcy * (1 - scale) * cos + ty;
        
        canvas.style.transformOrigin = '0px 0px';
        canvas.style.transform = `matrix(${a},${b},${c},${d},${e},${f})`;
    }
    
    /**
     * Clear gesture CSS transform and mark state as needing re-init.
     * Called at gesture boundaries (touch start, touch end).
     */
    function clearGestureCSSTransform() {
        if (gestureRenderState.active || canvas.style.transform) {
            canvas.style.transform = '';
            canvas.style.transformOrigin = '';
            gestureRenderState.active = false;
        }
        panDriftX = 0;
        panDriftY = 0;
    }
    
    function handleTouchStart(e) {
        // Close context menu if open
        if (contextMenuState.isOpen) {
            hideContextMenu();
        }
        
        // Cancel any running momentum or zoom animation, and clear CSS transform
        cancelInertia();
        clearGestureCSSTransform();
        if (doubleTapState.animationId) {
            cancelAnimationFrame(doubleTapState.animationId);
            doubleTapState.animationId = null;
        }
        
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const x = touch.clientX - cachedCanvasRect.left;
            const y = touch.clientY - cachedCanvasRect.top;
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
            
            // --- Double-tap-hold-drag detection ---
            // If this touch-down is within the double-tap window of the last tap,
            // enter one-finger zoom mode. If the user lifts quickly it behaves
            // like a normal double-tap zoom; if they hold and drag it becomes
            // continuous zoom.
            const now = Date.now();
            const dtTap = now - doubleTapState.lastTapTime;
            const dxTap = touch.clientX - doubleTapState.lastTapX;
            const dyTap = touch.clientY - doubleTapState.lastTapY;
            const tapDist = Math.sqrt(dxTap * dxTap + dyTap * dyTap);
            
            if (dtTap < 350 && tapDist < 40 && doubleTapState.lastTapTime > 0) {
                // Second tap detected — enter one-finger zoom mode
                // Cancel pending single-tap click dispatch
                if (doubleTapState.singleTapTimer) {
                    clearTimeout(doubleTapState.singleTapTimer);
                    doubleTapState.singleTapTimer = null;
                }
                oneFingerZoomState.isActive = true;
                oneFingerZoomState.screenX = touch.clientX;
                oneFingerZoomState.screenY = touch.clientY;
                oneFingerZoomState.startY = touch.clientY;
                oneFingerZoomState.startZoom = mapState.zoom;
                oneFingerZoomState.startLat = mapState.lat;
                oneFingerZoomState.startLon = mapState.lon;
                oneFingerZoomState.didMove = false;
                doubleTapState.lastTapTime = 0; // consume the double-tap
                doubleTapState.suppressClick = true;
                // Don't set up long press or drag for this touch
                cancelLongPress();
                return;
            }
            
            // Reset gesture state
            gestureState.isActive = false;
            gestureState.pending = false;
            oneFingerZoomState.isActive = false;
            
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
            doubleTapState.lastTapTime = 0; // invalidate pending double-tap
            oneFingerZoomState.isActive = false; // cancel one-finger zoom if active
            
            // Cancel drawing if active
            if (mapState.isDrawingRegion) {
                mapState.isDrawingRegion = false;
                mapState.drawStart = null;
                mapState.drawEnd = null;
                if (typeof OfflineModule !== 'undefined') {
                    OfflineModule.cancelDrawing();
                }
            }
            
            // Initialize two-finger gesture (pending until fingers actually move)
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            gestureState.pending = true;
            gestureState.isActive = false;
            gestureState.startTime = Date.now();
            gestureState.initialDistance = getTouchDistance(touch1, touch2);
            gestureState.initialAngle = getTouchAngle(touch1, touch2);
            gestureState.initialZoom = mapState.zoom;
            gestureState.initialBearing = mapState.bearing;
            gestureState.initialLat = mapState.lat;
            gestureState.initialLon = mapState.lon;
            gestureState.rotationUnlocked = false;
            gestureState.zoomLocked = false;
            gestureState.lastDistance = gestureState.initialDistance;
            gestureState.lastAngle = gestureState.initialAngle;
            
            const center = getTouchCenter(touch1, touch2);
            gestureState.centerX = center.x;
            gestureState.centerY = center.y;
            gestureState.initialCenterX = center.x;
            gestureState.initialCenterY = center.y;
        } else {
            // More than 2 touches - cancel everything
            cancelLongPress();
            gestureState.isActive = false;
            gestureState.pending = false;
            oneFingerZoomState.isActive = false;
        }
    }

    function handleTouchMove(e) {
        // --- One-finger zoom drag (double-tap-hold-drag) ---
        if (e.touches.length === 1 && oneFingerZoomState.isActive) {
            e.preventDefault();
            const touch = e.touches[0];
            const dy = touch.clientY - oneFingerZoomState.startY;
            
            // Movement threshold before zoom starts (prevents jitter on tap)
            if (!oneFingerZoomState.didMove && Math.abs(dy) < 8) return;
            oneFingerZoomState.didMove = true;
            
            // Map vertical drag to zoom: drag up = zoom in, drag down = zoom out.
            // 150px of drag ≈ 1 zoom level for comfortable control.
            const zoomDelta = -dy / 150;
            let newZoom = oneFingerZoomState.startZoom + zoomDelta;
            const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
            newZoom = Math.max(3, Math.min(maxZoom, newZoom));
            
            // Anchor: keep the geo-coordinate under the initial tap point stationary.
            // Non-incremental: compute from initial state each frame to prevent
            // cumulative floating-point drift in Mercator projection math.
            const px = oneFingerZoomState.screenX - cachedCanvasRect.left;
            const py = oneFingerZoomState.screenY - cachedCanvasRect.top;
            
            // Temporarily restore initial state to find anchor geo
            mapState.lat = oneFingerZoomState.startLat;
            mapState.lon = oneFingerZoomState.startLon;
            mapState.zoom = oneFingerZoomState.startZoom;
            const anchorGeo = pixelToLatLon(px, py);
            
            // Apply new zoom and compute where anchor ended up
            mapState.zoom = newZoom;
            const newGeo = pixelToLatLon(px, py);
            mapState.lat += anchorGeo.lat - newGeo.lat;
            mapState.lon += anchorGeo.lon - newGeo.lon;
            mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            
            if (zoomLevelEl) zoomLevelEl.textContent = Math.round(mapState.zoom) + 'z';
            updateScaleBar();
            
            // CSS transform for instant visual feedback during one-finger zoom.
            // Only applies after render() has established the baseline via
            // gestureRenderState — same principle as the two-finger path.
            if (gestureRenderState.active) {
                const scale = Math.pow(2, mapState.zoom - gestureRenderState.zoom);
                canvas.style.transformOrigin = `${px}px ${py}px`;
                canvas.style.transform = `scale(${scale})`;
            }
            
            scheduleRender();
            return;
        }
        
        if (e.touches.length === 1 && mapState.dragStart && !gestureState.isActive) {
            // Prevent default immediately for ALL single-finger moves on the map canvas.
            // This stops the browser from consuming events during the drag threshold
            // dead zone, which previously allowed pull-to-refresh and scroll gestures
            // to fire before isDragging became true.
            e.preventDefault();
            
            const touch = e.touches[0];
            const x = touch.clientX - cachedCanvasRect.left;
            const y = touch.clientY - cachedCanvasRect.top;
            
            // Check if we're drawing a region
            if (mapState.isDrawingRegion && mapState.drawStart) {
                if (typeof OfflineModule !== 'undefined') {
                    const coords = pixelToLatLon(x, y);
                    const bounds = OfflineModule.handleDrawMove(coords);
                    if (bounds) {
                        mapState.drawEnd = { x, y };
                        scheduleRender();
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
                
                // Reuse object to avoid GC pressure at 120Hz
                mapState.dragStart.x = touch.clientX;
                mapState.dragStart.y = touch.clientY;
                
                // Record velocity for inertia (always, not just as fallback).
                // getCoalescedEvents provides higher-resolution samples when
                // available; this ensures at least one sample per event.
                recordInertiaSample(touch.clientX, touch.clientY);
                
                // Accumulate pixel drift and apply CSS translate for instant
                // compositor-thread visual feedback.  On 120Hz displays, 2-3
                // touch events fire between RAF callbacks — without this, the
                // user sees stale pixels until the next render().
                panDriftX += moveDx;
                panDriftY += moveDy;
                canvas.style.transform = `translate(${panDriftX}px, ${panDriftY}px)`;
                
                scheduleRender();
                debouncedSaveMapPosition();
            }
            
        } else if (e.touches.length === 2 && (gestureState.isActive || gestureState.pending)) {
            e.preventDefault();
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDistance = getTouchDistance(touch1, touch2);
            const currentAngle = getTouchAngle(touch1, touch2);
            const currentCenter = getTouchCenter(touch1, touch2);
            
            // --- Deadzone: don't activate until fingers actually move ---
            // Google Maps / Apple Maps require real finger movement before any
            // visual change.  This prevents overlay stripping and stale renders
            // when two fingers are simply resting on the screen.
            if (gestureState.pending) {
                const distRatio = currentDistance / gestureState.initialDistance;
                const centerDx = currentCenter.x - gestureState.centerX;
                const centerDy = currentCenter.y - gestureState.centerY;
                const centerMove = Math.sqrt(centerDx * centerDx + centerDy * centerDy);
                
                // Thresholds: 5% distance change (zoom) OR 8px center shift (pan)
                if (Math.abs(distRatio - 1.0) < 0.05 && centerMove < 8) {
                    return; // Still inside deadzone — do nothing
                }
                // Crossed threshold — activate the gesture
                gestureState.pending = false;
                gestureState.isActive = true;
            }
            
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
            
            // --- Dual axis lock: rotation lock + zoom lock ---
            // Prevents accidental cross-contamination between rotation and zoom.
            // On touchscreens, finger distance inevitably changes during rotation
            // (10-30% on a 10" tablet) and fingers naturally rotate 5-15° during
            // a pinch-zoom.  Without locks, "pure rotation" causes blurry tiles
            // (wrong zoom level) and GPS marker drift (anchor math at wrong zoom).
            //
            // Rotation lock: bearing stays at initial until > 25° deliberate rotation
            // Zoom lock:     once rotation unlocks, zoom pins to initial until
            //                distance changes > 40% (|zoomDelta| > 0.5)
            
            if (!gestureState.rotationUnlocked) {
                if (Math.abs(angleDelta) > 25) {
                    gestureState.rotationUnlocked = true;
                    gestureState.zoomLocked = true;  // lock zoom when rotation begins
                } else {
                    newBearing = gestureState.initialBearing;
                }
            }
            
            // Zoom lock: pin zoom to initial value during rotation-dominant gestures.
            // Only release if distance change clearly indicates intentional zooming
            // (> 40% change ≈ 0.5 zoom levels).  This prevents finger-distance
            // fluctuations during rotation from causing tile-level changes and
            // blurry rendering.
            if (gestureState.zoomLocked) {
                if (Math.abs(zoomDelta) > 0.5) {
                    gestureState.zoomLocked = false;  // release — user is deliberately zooming too
                } else {
                    newZoom = gestureState.initialZoom;  // pin to initial zoom
                }
            }
            
            // --- Non-incremental anchor math ---
            // Each frame computes the final map position from the INITIAL gesture
            // state rather than incrementally adjusting from the previous frame.
            // This eliminates cumulative floating-point drift in the Mercator
            // projection math (log/tan/atan/sinh round-trip errors) that caused
            // the GPS marker to visibly shift during long pinch gestures.
            
            if (gestureState.zoomLocked) {
                // --- ROTATION-DOMINANT: rotate around canvas center ---
                // When zoom is locked, the user is performing a pure rotation.
                // Google/Apple Maps rotate around the screen center (map center
                // stays fixed, everything else spins around it).
                //
                // The pinch-center anchor math rotates around the FINGER midpoint,
                // which shifts lat/lon to keep the finger-point geo stationary.
                // With fingers 200px from center and 90° rotation, this causes
                // 300+ pixel map center drift — making the GPS marker appear to
                // fly off-screen and showing a completely different location.
                //
                // Fix: just set bearing, keep lat/lon at initial values.
                // The canvas center IS the map center, so rotating around it
                // means lat/lon don't change.
                mapState.lat = gestureState.initialLat;
                mapState.lon = gestureState.initialLon;
                mapState.zoom = gestureState.initialZoom;
                mapState.bearing = newBearing;
            } else {
                // --- ZOOM / PAN / COMBINED: anchor at pinch center ---
                // Keep the geo-coordinate under the user's fingers stationary
                // while zoom and/or bearing changes.  This gives the natural
                // "zoom into what I'm looking at" behavior.
                
                // Step 1: Restore initial state to find anchor geo
                mapState.lat = gestureState.initialLat;
                mapState.lon = gestureState.initialLon;
                mapState.zoom = gestureState.initialZoom;
                mapState.bearing = gestureState.initialBearing;
                
                // Step 2: What geo-coordinate was under the initial pinch center?
                const initCX = gestureState.initialCenterX - cachedCanvasRect.left;
                const initCY = gestureState.initialCenterY - cachedCanvasRect.top;
                const anchorGeo = pixelToLatLon(initCX, initCY);
                
                // Step 3: Apply new zoom and bearing, starting from initial lat/lon
                mapState.zoom = newZoom;
                mapState.bearing = newBearing;
                // lat/lon still at initial values from step 1
                
                // Step 4: Where does the CURRENT pinch center point now?
                const curCX = currentCenter.x - cachedCanvasRect.left;
                const curCY = currentCenter.y - cachedCanvasRect.top;
                const newGeo = pixelToLatLon(curCX, curCY);
                
                // Step 5: Shift map so the anchor geo ends up under the current center
                mapState.lat += anchorGeo.lat - newGeo.lat;
                mapState.lon += anchorGeo.lon - newGeo.lon;
            }
            
            // Clamp latitude
            mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            while (mapState.lon > 180) mapState.lon -= 360;
            while (mapState.lon < -180) mapState.lon += 360;
            
            // Update tracked center for CSS transform and zoom snap
            gestureState.centerX = currentCenter.x;
            gestureState.centerY = currentCenter.y;
            
            // Apply CSS transform for instant visual feedback (GPU-composited).
            // Between this touch event and the next RAF, the browser compositor
            // scales/rotates/translates the canvas at zero JS cost.
            // render() then clears the transform and paints the correct state.
            applyGestureCSSTransform();
            scheduleRender();
            updateScaleBar();
            updateCompassRose();
            
            // Update zoom display
            if (zoomLevelEl) zoomLevelEl.textContent = Math.round(mapState.zoom) + 'z';
            
            gestureState.lastDistance = currentDistance;
            gestureState.lastAngle = currentAngle;
        }
    }

    function handleTouchEnd(e) {
        cancelLongPress();
        clearGestureCSSTransform();
        
        if (e.touches.length === 0) {
            // All fingers lifted
            
            // --- One-finger zoom drag end ---
            if (oneFingerZoomState.isActive) {
                oneFingerZoomState.isActive = false;
                
                if (!oneFingerZoomState.didMove) {
                    // Finger didn't move — this was a quick double-tap, not a drag.
                    // Animate zoom in one level centered on tap point (same as double-tap).
                    const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
                    if (mapState.zoom < maxZoom) {
                        animateZoomAt(oneFingerZoomState.screenX, oneFingerZoomState.screenY, Math.round(mapState.zoom) + 1);
                    }
                } else {
                    // Finger moved — snap fractional zoom to integer, anchored at tap point
                    const snappedZoom = Math.max(3, Math.min(19, Math.round(mapState.zoom)));
                    if (snappedZoom !== mapState.zoom) {
                        const px = oneFingerZoomState.screenX - cachedCanvasRect.left;
                        const py = oneFingerZoomState.screenY - cachedCanvasRect.top;
                        const anchorGeo = pixelToLatLon(px, py);
                        mapState.zoom = snappedZoom;
                        const newGeo = pixelToLatLon(px, py);
                        mapState.lat += anchorGeo.lat - newGeo.lat;
                        mapState.lon += anchorGeo.lon - newGeo.lon;
                        mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
                    }
                    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(mapState.zoom) + 'z';
                    updateScaleBar();
                    render();
                    saveMapPosition();
                }
                return;
            }
            
            // Check if we were drawing a region
            if (mapState.isDrawingRegion && mapState.drawStart) {
                if (typeof OfflineModule !== 'undefined' && e.changedTouches.length > 0) {
                    const touch = e.changedTouches[0];
                    const x = touch.clientX - cachedCanvasRect.left;
                    const y = touch.clientY - cachedCanvasRect.top;
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
            const wasDragging = mapState.isDragging;
            const wasGesture = gestureState.isActive || gestureState.pending;
            const wasTap = !wasDragging && !longPressState.isLongPress && !wasGesture && elapsed < 400;
            
            // --- Two-finger tap to zoom out ---
            // Detect: two fingers touched (active or pending), short duration,
            // no significant zoom/bearing change.  With the deadzone, a quick
            // two-finger tap will still be "pending" (fingers never moved enough).
            if (wasGesture) {
                const gestureElapsed = Date.now() - gestureState.startTime;
                const zoomUnchanged = Math.abs(mapState.zoom - gestureState.initialZoom) < 0.3;
                const bearingUnchanged = Math.abs(mapState.bearing - gestureState.initialBearing) < 2;
                
                if (gestureElapsed < 400 && zoomUnchanged && bearingUnchanged) {
                    // Two-finger tap — animate zoom out centered on gesture center
                    mapState.zoom = gestureState.initialZoom; // reset any micro-drift
                    mapState.bearing = gestureState.initialBearing;
                    if (mapState.zoom > 3) {
                        animateZoomAt(gestureState.centerX, gestureState.centerY, Math.round(mapState.zoom) - 1);
                    }
                    mapState.isDragging = false;
                    mapState.dragStart = null;
                    gestureState.isActive = false;
                    gestureState.pending = false;
                    inertiaState.history = [];
                    return;
                }
            }
            
            // --- Inertia: start momentum panning after a flick ---
            if (wasDragging && !wasGesture) {
                const vel = computeInertiaVelocity();
                if (vel) {
                    startInertia(vel.vx, vel.vy);
                } else {
                    saveMapPosition();
                    // Schedule full render to restore overlays hidden during
                    // the fast-path drag (isGesturing was true during drag).
                    // isDragging goes false below, so the next render is full.
                    scheduleRender();
                }
            }
            
            // --- Double-tap detection & single-tap click synthesis ---
            // e.preventDefault() on touchstart suppresses browser click events,
            // so we must manually dispatch to handleClick for tap interactions
            // (waypoint clicks, measure points, route builder, stream gauges, etc.).
            if (wasTap && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                const now = Date.now();
                const dtTap = now - doubleTapState.lastTapTime;
                const dx = touch.clientX - doubleTapState.lastTapX;
                const dy = touch.clientY - doubleTapState.lastTapY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dtTap < 350 && dist < 40 && doubleTapState.lastTapTime > 0) {
                    // Double-tap detected — zoom in, cancel pending single-tap
                    if (doubleTapState.singleTapTimer) {
                        clearTimeout(doubleTapState.singleTapTimer);
                        doubleTapState.singleTapTimer = null;
                    }
                    doubleTapState.lastTapTime = 0;
                    const maxZoom = TILE_SERVERS[activeLayers.base]?.maxZoom || 19;
                    if (mapState.zoom < maxZoom) {
                        doubleTapState.suppressClick = true;
                        animateZoomAt(touch.clientX, touch.clientY, mapState.zoom + 1);
                    }
                } else {
                    // First tap — record for potential double-tap and schedule
                    // a delayed single-tap click dispatch after the double-tap
                    // window (350ms).  If a second tap arrives, the timer above
                    // is cancelled and no click fires.
                    doubleTapState.lastTapTime = now;
                    doubleTapState.lastTapX = touch.clientX;
                    doubleTapState.lastTapY = touch.clientY;
                    
                    if (doubleTapState.singleTapTimer) {
                        clearTimeout(doubleTapState.singleTapTimer);
                    }
                    const tapX = touch.clientX;
                    const tapY = touch.clientY;
                    doubleTapState.singleTapTimer = setTimeout(() => {
                        doubleTapState.singleTapTimer = null;
                        handleClick({
                            clientX: tapX,
                            clientY: tapY,
                            preventDefault() {},
                            stopPropagation() {}
                        });
                    }, 350);
                }
            }
            
            mapState.isDragging = false;
            mapState.dragStart = null;
            gestureState.isActive = false;
            gestureState.pending = false;
            inertiaState.history = [];
            
            // Snap zoom to nearest integer after pinch gesture completes.
            // Fractional zoom is used during the gesture for smooth visual interpolation,
            // but final zoom must be integer for clean tile rendering.
            // Anchor the snap around the last pinch center to prevent a visible jump.
            // Only run this if a gesture actually changed zoom/bearing (wasGesture).
            if (wasGesture && (gestureState.initialZoom !== mapState.zoom || gestureState.initialBearing !== mapState.bearing)) {
                // --- Rotation snap-back (BEFORE zoom snap) ---
                // Must snap bearing first so the zoom anchor math uses the
                // final bearing.  Previously, zoom snap adjusted lat/lon with
                // the gesture bearing, then bearing snapped back — leaving
                // lat/lon computed for the wrong bearing, causing the GPS
                // marker to drift off-position at high zoom levels.
                const b = mapState.bearing;
                const ib = gestureState.initialBearing;
                let bearingDelta = Math.abs(b - ib);
                if (bearingDelta > 180) bearingDelta = 360 - bearingDelta;
                const bearingNeedsSnap = b !== ib && bearingDelta < 45;
                if (bearingNeedsSnap) {
                    mapState.bearing = ib;
                }
                
                // --- Zoom snap ---
                // Snap fractional zoom to nearest integer, anchored at pinch
                // center so the map doesn't visually jump.
                const snappedZoom = Math.max(3, Math.min(19, Math.round(mapState.zoom)));
                if (snappedZoom !== mapState.zoom) {
                    const anchorX = gestureState.centerX - cachedCanvasRect.left;
                    const anchorY = gestureState.centerY - cachedCanvasRect.top;
                    const anchorGeo = pixelToLatLon(anchorX, anchorY);
                    mapState.zoom = snappedZoom;
                    const newGeo = pixelToLatLon(anchorX, anchorY);
                    mapState.lat += anchorGeo.lat - newGeo.lat;
                    mapState.lon += anchorGeo.lon - newGeo.lon;
                    mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
                } else {
                    mapState.zoom = snappedZoom;
                }
                if (zoomLevelEl) zoomLevelEl.textContent = mapState.zoom + 'z';
                updateScaleBar();
                render();
                saveMapPosition();
                
                // Animate bearing reset to north if needed (after render)
                if (bearingNeedsSnap && ib === 0) {
                    resetBearing();
                }
                updateCompassRose();
            }
            
        } else if (e.touches.length === 1) {
            // Went from 2 fingers to 1 — transition to single-finger drag
            gestureState.isActive = false;
            gestureState.pending = false;
            const touch = e.touches[0];
            mapState.dragStart = { x: touch.clientX, y: touch.clientY };
            mapState.isDragging = true;
            inertiaState.history = []; // reset velocity history for the new drag
            
            // --- Rotation snap-back FIRST (before zoom snap) ---
            // Bearing must be finalized before zoom anchor math runs,
            // otherwise lat/lon are computed for the wrong bearing.
            const b2 = mapState.bearing;
            const ib2 = gestureState.initialBearing;
            let bearingDelta2 = Math.abs(b2 - ib2);
            if (bearingDelta2 > 180) bearingDelta2 = 360 - bearingDelta2;
            const bearingNeedsSnap2 = b2 !== ib2 && bearingDelta2 < 45;
            if (bearingNeedsSnap2) {
                mapState.bearing = ib2;
            }
            
            // --- Zoom snap ---
            const snappedZoom = Math.max(3, Math.min(19, Math.round(mapState.zoom)));
            if (snappedZoom !== mapState.zoom) {
                const anchorX = gestureState.centerX - cachedCanvasRect.left;
                const anchorY = gestureState.centerY - cachedCanvasRect.top;
                const anchorGeo = pixelToLatLon(anchorX, anchorY);
                mapState.zoom = snappedZoom;
                const newGeo = pixelToLatLon(anchorX, anchorY);
                mapState.lat += anchorGeo.lat - newGeo.lat;
                mapState.lon += anchorGeo.lon - newGeo.lon;
                mapState.lat = Math.max(-85, Math.min(85, mapState.lat));
            } else {
                mapState.zoom = snappedZoom;
            }
            if (zoomLevelEl) zoomLevelEl.textContent = mapState.zoom + 'z';
            updateScaleBar();
            render();
            saveMapPosition();
            
            if (bearingNeedsSnap2 && ib2 === 0) {
                resetBearing();
            }
            updateCompassRose();
        }
    }
    
    /**
     * Process coalesced pointer events for sub-frame touch position accuracy.
     * Chrome on Android provides getCoalescedEvents() which contains all
     * intermediate touch positions that occurred between the previous and
     * current pointer event dispatch. Without this, 2-4 positions per event
     * are discarded at 120Hz, causing "quantized" feeling and poor inertia.
     *
     * This handler supplements the TouchEvent handlers — it ONLY records
     * high-resolution velocity samples into the inertia ring buffer.
     * The actual pan/zoom math remains in the touch handlers.
     */
    function handlePointerMoveCoalesced(e) {
        // Only process touch pointers during single-finger drag
        if (e.pointerType !== 'touch' || !mapState.isDragging) return;
        if (gestureState.isActive || gestureState.pending || oneFingerZoomState.isActive) return;
        
        // Use coalesced events if available (Chrome 59+)
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        
        for (const pe of events) {
            recordInertiaSample(pe.clientX, pe.clientY);
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
            usgs_topo: { icon: 'terrain', label: 'USGS' },
            usgs_imagery: { icon: 'satellite', label: 'USGS Sat' },
            usgs_imagery_topo: { icon: 'layers', label: 'USGS Hyb' }
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
            zoomLevelEl.textContent = mapState.zoom + 'z'; 
            updateScaleBar();
            render(); 
            saveMapPosition(); 
        };
        
        container.querySelector('#zoom-out-btn').onclick = () => { 
            mapState.zoom = Math.max(3, mapState.zoom - 1); 
            zoomLevelEl.textContent = mapState.zoom + 'z'; 
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
                    zoomLevelEl.textContent = mapState.zoom + 'z';
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
                        zoomLevelEl.textContent = mapState.zoom + 'z';
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
                        zoomLevelEl.textContent = mapState.zoom + 'z'; 
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
        // NOTE: Esri layers removed for commercial licensing compliance
        const baseLayers = ['standard', 'terrain', 'usgs_topo', 'usgs_imagery'];
        const layerNames = {
            standard: 'OpenStreetMap',
            terrain: 'OpenTopoMap',
            usgs_topo: 'USGS Topo',
            usgs_imagery: 'USGS Imagery'
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
        
        // Notify move callbacks (debounced)
        notifyMoveEnd();
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
            const zoomEl = zoomLevelEl;
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
        if (zoom !== undefined) { mapState.zoom = zoom; zoomLevelEl.textContent = mapState.zoom + 'z'; }
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
        
        // Interaction mode for special click handling
        setInteractionMode: (mode) => { mapState.interactionMode = mode; },
        getInteractionMode: () => mapState.interactionMode,
        
        // Custom tile layers (for satellite weather, etc.)
        addCustomTileLayer,
        removeCustomTileLayer,
        getCustomTileLayers,
        setCustomLayerOpacity,
        setLayerOpacity: setCustomLayerOpacity,  // Alias for compatibility
        
        // Custom overlay markers (for AQI stations, etc.)
        addOverlayMarkers,
        updateOverlayMarkers,
        removeOverlayMarkers,
        hasOverlayMarkers,
        
        // Map movement callbacks
        onMoveEnd,
        
        // Tile loading status - useful for external tools/bridges
        hasPendingTiles: () => pendingTiles.size > 0,
        getPendingTileCount: () => pendingTiles.size,
        
        // Wait for all tiles to load (returns Promise)
        waitForTiles: (timeoutMs = 10000) => {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    if (pendingTiles.size === 0) {
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (Date.now() - startTime > timeoutMs) {
                        clearInterval(checkInterval);
                        resolve(false); // Timeout, but don't reject
                    }
                }, 100);
            });
        }
    };
})();

window.MapModule = MapModule;
