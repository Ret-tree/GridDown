/**
 * GridDown Panels Module - All Panel Content
 */
const PanelsModule = (function() {
    'use strict';
    let container;
    let measurePanelEl = null;
    let initialized = false;
    
    // Track delegated event handlers for cleanup
    let coordConverterState = {
        parsedCoords: null,
        inputTimeout: null
    };

    function init() {
        // Prevent double initialization
        if (initialized) {
            console.debug('PanelsModule already initialized');
            return;
        }
        
        container = document.getElementById('panel-content');
        if (!container) return;
        
        // Setup event delegation for panel interactions
        setupEventDelegation();
        
        render();
        State.subscribe(render, ['activePanel', 'waypoints', 'routes', 'mapLayers', 'selectedWaypoint', 'selectedVehicle', 'waypointFilter', 'mapRegions', 'teamMembers']);
        const offlineBtn = document.getElementById('offline-toggle');
        if (offlineBtn) offlineBtn.onclick = () => { State.UI.toggleOffline(); updateOfflineToggle(); };
        updateOfflineToggle();
        
        // Set up measure panel event listeners
        setupMeasurePanel();
        
        // Subscribe to undo state changes to update UI
        if (typeof UndoModule !== 'undefined') {
            Events.on('undo:stateChange', () => {
                // Re-render if on waypoints or routes panel to update undo buttons
                const panel = State.get('activePanel');
                if (panel === 'waypoints' || panel === 'routes') {
                    updateUndoToolbar();
                }
            });
        }
        
        initialized = true;
    }
    
    /**
     * Setup event delegation for common panel interactions
     * This reduces memory usage by using a single listener instead of many
     */
    function setupEventDelegation() {
        // Handle click events via delegation
        container.addEventListener('click', handleDelegatedClick);
        
        // Handle change events via delegation
        container.addEventListener('change', handleDelegatedChange);
        
        // Handle input events via delegation
        container.addEventListener('input', handleDelegatedInput);
    }
    
    /**
     * Handle delegated click events
     */
    function handleDelegatedClick(e) {
        const target = e.target;
        
        // Coordinate converter example buttons
        if (target.closest('.coord-example')) {
            const btn = target.closest('.coord-example');
            const input = container.querySelector('#coord-input');
            if (input && btn.dataset.example) {
                input.value = btn.dataset.example;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
        }
        
        // Coordinate copy buttons
        if (target.closest('.coord-copy-btn')) {
            const btn = target.closest('.coord-copy-btn');
            const format = btn.dataset.copy;
            const valueEl = container.querySelector(`#result-${format}`);
            if (valueEl && valueEl.textContent !== '--') {
                copyToClipboard(valueEl.textContent);
                showCoordToast(`${format.toUpperCase()} copied to clipboard`);
            }
            return;
        }
        
        // Coordinate format buttons
        if (target.closest('.coord-format-btn')) {
            const btn = target.closest('.coord-format-btn');
            const format = btn.dataset.format;
            if (typeof Coordinates !== 'undefined') {
                Coordinates.setFormat(format);
                container.querySelectorAll('.coord-format-btn').forEach(b => {
                    b.classList.toggle('coord-format-btn--active', b.dataset.format === format);
                });
                renderCoordinateConverter();
                showCoordToast(`Display format set to ${format.toUpperCase()}`);
            }
            return;
        }
        
        // Go button for coordinates
        if (target.closest('#coord-go-btn')) {
            if (coordConverterState.parsedCoords && typeof MapModule !== 'undefined') {
                MapModule.setCenter(coordConverterState.parsedCoords.lat, coordConverterState.parsedCoords.lon);
                showCoordToast('Map centered on coordinates');
            } else if (!coordConverterState.parsedCoords) {
                showCoordToast('Enter valid coordinates first', 'error');
            }
            return;
        }
        
        // Create waypoint from coordinates
        if (target.closest('#coord-create-waypoint')) {
            if (coordConverterState.parsedCoords && typeof ModalsModule !== 'undefined') {
                ModalsModule.openWaypointModal({
                    lat: coordConverterState.parsedCoords.lat,
                    lon: coordConverterState.parsedCoords.lon,
                    x: lonToX(coordConverterState.parsedCoords.lon),
                    y: latToY(coordConverterState.parsedCoords.lat)
                });
            }
            return;
        }
        
        // Distance calculator button
        if (target.closest('#calc-distance-btn')) {
            handleDistanceCalculation();
            return;
        }
        
        // Data action buttons (copy-gps, copy-map, use-gps, use-map)
        const actionBtn = target.closest('[data-action]');
        if (actionBtn) {
            handleDataAction(actionBtn.dataset.action, actionBtn);
            return;
        }
    }
    
    /**
     * Handle delegated change events
     */
    function handleDelegatedChange(e) {
        // Handle schedule toggles, selects, etc.
    }
    
    /**
     * Handle delegated input events
     */
    function handleDelegatedInput(e) {
        const target = e.target;
        
        // Coordinate input
        if (target.id === 'coord-input') {
            clearTimeout(coordConverterState.inputTimeout);
            coordConverterState.inputTimeout = setTimeout(() => {
                handleCoordInput(target.value.trim());
            }, 300);
        }
    }
    
    /**
     * Handle coordinate input parsing
     */
    function handleCoordInput(value) {
        const statusEl = container.querySelector('#coord-input-status');
        const resultsEl = container.querySelector('#coord-results');
        
        if (!statusEl || !resultsEl) return;
        
        if (!value) {
            statusEl.innerHTML = '';
            statusEl.className = 'coord-input-status';
            resultsEl.style.display = 'none';
            coordConverterState.parsedCoords = null;
            return;
        }
        
        if (typeof Coordinates !== 'undefined') {
            const result = Coordinates.parse(value);
            if (result) {
                coordConverterState.parsedCoords = result;
                statusEl.innerHTML = `<span class="coord-status-success">✓ Valid coordinates detected</span>`;
                statusEl.className = 'coord-input-status coord-input-status--success';
                updateConversionResults(result.lat, result.lon);
                resultsEl.style.display = 'block';
            } else {
                coordConverterState.parsedCoords = null;
                statusEl.innerHTML = `<span class="coord-status-error">✗ Could not parse coordinates</span>`;
                statusEl.className = 'coord-input-status coord-input-status--error';
                resultsEl.style.display = 'none';
            }
        }
    }
    
    /**
     * Handle data action buttons
     */
    function handleDataAction(action, btn) {
        const input = container.querySelector('#coord-input');
        
        switch (action) {
            case 'copy-gps':
            case 'copy-map':
                const card = btn.closest('.coord-quick-card');
                const valueEl = card?.querySelector('.coord-quick-value');
                if (valueEl) {
                    copyToClipboard(valueEl.textContent);
                    showCoordToast('Coordinates copied');
                }
                break;
                
            case 'use-gps':
                if (typeof GPSModule !== 'undefined') {
                    const state = GPSModule.getState();
                    if (state.position && input) {
                        input.value = `${state.position.lat}, ${state.position.lon}`;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
                break;
                
            case 'use-map':
                if (typeof MapModule !== 'undefined' && MapModule.getMapState && input) {
                    const mapState = MapModule.getMapState();
                    input.value = `${mapState.lat}, ${mapState.lon}`;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                break;
        }
    }
    
    /**
     * Handle distance calculation
     */
    function handleDistanceCalculation() {
        const fromInput = container.querySelector('#distance-from');
        const toInput = container.querySelector('#distance-to');
        const resultEl = container.querySelector('#distance-result');
        
        if (typeof Coordinates === 'undefined' || !fromInput || !toInput) return;
        
        const fromCoords = Coordinates.parse(fromInput.value);
        const toCoords = Coordinates.parse(toInput.value);
        
        if (!fromCoords) {
            showCoordToast('Invalid "From" coordinates', 'error');
            return;
        }
        if (!toCoords) {
            showCoordToast('Invalid "To" coordinates', 'error');
            return;
        }
        
        const dist = Coordinates.distance(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
        const bear = Coordinates.bearing(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
        
        const distValueEl = container.querySelector('#distance-value');
        const bearValueEl = container.querySelector('#bearing-value');
        
        if (distValueEl) distValueEl.textContent = formatDistanceResult(dist);
        if (bearValueEl) bearValueEl.textContent = Coordinates.formatBearing(bear);
        if (resultEl) resultEl.style.display = 'block';
    }
    
    /**
     * Render the undo/redo toolbar
     */
    function renderUndoToolbar() {
        if (typeof UndoModule === 'undefined') return '';
        
        const canUndo = UndoModule.canUndo();
        const canRedo = UndoModule.canRedo();
        const undoDesc = UndoModule.getUndoDescription();
        const redoDesc = UndoModule.getRedoDescription();
        
        return `
            <div class="undo-toolbar" style="display:flex;gap:8px;margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;align-items:center">
                <button class="btn btn--secondary undo-btn" id="undo-btn" style="flex:1;padding:8px;${!canUndo ? 'opacity:0.4;cursor:not-allowed' : ''}" 
                    ${!canUndo ? 'disabled' : ''} title="${undoDesc ? 'Undo: ' + undoDesc : 'Nothing to undo (Ctrl+Z)'}">
                    ↩️ Undo
                </button>
                <button class="btn btn--secondary redo-btn" id="redo-btn" style="flex:1;padding:8px;${!canRedo ? 'opacity:0.4;cursor:not-allowed' : ''}"
                    ${!canRedo ? 'disabled' : ''} title="${redoDesc ? 'Redo: ' + redoDesc : 'Nothing to redo (Ctrl+Y)'}">
                    ↪️ Redo
                </button>
                <span style="font-size:10px;color:rgba(255,255,255,0.4);white-space:nowrap">Ctrl+Z/Y</span>
            </div>
        `;
    }
    
    /**
     * Update undo toolbar without full re-render
     */
    function updateUndoToolbar() {
        const undoBtn = container.querySelector('#undo-btn');
        const redoBtn = container.querySelector('#redo-btn');
        
        if (!undoBtn || !redoBtn || typeof UndoModule === 'undefined') return;
        
        const canUndo = UndoModule.canUndo();
        const canRedo = UndoModule.canRedo();
        const undoDesc = UndoModule.getUndoDescription();
        const redoDesc = UndoModule.getRedoDescription();
        
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity = canUndo ? '1' : '0.4';
        undoBtn.style.cursor = canUndo ? 'pointer' : 'not-allowed';
        undoBtn.title = undoDesc ? 'Undo: ' + undoDesc : 'Nothing to undo (Ctrl+Z)';
        
        redoBtn.disabled = !canRedo;
        redoBtn.style.opacity = canRedo ? '1' : '0.4';
        redoBtn.style.cursor = canRedo ? 'pointer' : 'not-allowed';
        redoBtn.title = redoDesc ? 'Redo: ' + redoDesc : 'Nothing to redo (Ctrl+Y)';
    }
    
    /**
     * Attach undo toolbar event handlers
     */
    function attachUndoHandlers() {
        const undoBtn = container.querySelector('#undo-btn');
        const redoBtn = container.querySelector('#redo-btn');
        
        if (undoBtn && typeof UndoModule !== 'undefined') {
            undoBtn.onclick = () => UndoModule.undo();
        }
        if (redoBtn && typeof UndoModule !== 'undefined') {
            redoBtn.onclick = () => UndoModule.redo();
        }
    }
    
    /**
     * Set up the floating measure panel
     */
    function setupMeasurePanel() {
        // Create the measure panel element
        measurePanelEl = document.createElement('div');
        measurePanelEl.id = 'measure-results-panel';
        measurePanelEl.className = 'measure-results-panel';
        measurePanelEl.style.display = 'none';
        document.getElementById('main').appendChild(measurePanelEl);
        
        // Listen for measure events
        if (typeof Events !== 'undefined') {
            Events.on('measure:toggle', (data) => {
                if (data.active) {
                    measurePanelEl.style.display = 'block';
                    updateMeasurePanel();
                } else {
                    measurePanelEl.style.display = 'none';
                }
            });
            
            Events.on('measure:pointAdded', updateMeasurePanel);
            Events.on('measure:pointRemoved', updateMeasurePanel);
            Events.on('measure:cleared', updateMeasurePanel);
            Events.on('measure:updated', updateMeasurePanel);
        }
    }
    
    /**
     * Update the measure panel content
     */
    function updateMeasurePanel() {
        if (!measurePanelEl || typeof MeasureModule === 'undefined') return;
        
        const html = MeasureModule.renderResultsPanel();
        measurePanelEl.innerHTML = `
            <div class="measure-results-panel__header">
                <span class="measure-results-panel__title">📏 Measure Tool</span>
                <button class="measure-results-panel__close" id="measure-close-btn">✕</button>
            </div>
            <div class="measure-results-panel__content">
                ${html}
            </div>
        `;
        
        // Bind events
        MeasureModule.bindResultsPanelEvents(measurePanelEl);
        
        // Close button
        const closeBtn = measurePanelEl.querySelector('#measure-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                MeasureModule.toggle();
                measurePanelEl.style.display = 'none';
                MapModule.render();
                MapModule.renderControls();
            };
        }
    }

    function updateOfflineToggle() {
        const btn = document.getElementById('offline-toggle');
        const icon = document.getElementById('offline-icon');
        const text = document.getElementById('offline-text');
        const offline = State.get('isOffline');
        btn.classList.toggle('offline-toggle--offline', offline);
        icon.innerHTML = Icons.get(offline ? 'offline' : 'satellite');
        text.textContent = offline ? 'Offline Mode' : 'Online';
    }

    function render() {
        const panel = State.get('activePanel');
        switch (panel) {
            case 'sos': renderSOS(); break;
            case 'waypoints': renderWaypoints(); break;
            case 'routes': renderRoutes(); break;
            case 'logistics': renderLogistics(); break;
            case 'offline': renderOffline(); break;
            case 'team': renderTeam(); break;
            case 'settings': renderSettings(); break;
            case 'gps': renderGPS(); break;
            case 'weather': renderWeather(); break;
            case 'contingency': renderContingency(); break;
            case 'sunmoon': renderSunMoon(); break;
            case 'navigation': renderNavigation(); break;
            case 'coords': renderCoordinateConverter(); break;
            case 'comms': renderComms(); break;
            case 'terrain': renderTerrain(); break;
            case 'radio': renderRadio(); break;
            case 'medical': renderMedical(); break;
            default: renderMapLayers();
        }
        const panelEl = document.getElementById('panel');
        if (Helpers.isMobile() && State.get('isPanelOpen')) panelEl.classList.add('panel--open');
        else panelEl.classList.remove('panel--open');
    }

    /**
     * Render SOS/Emergency Panel
     */
    function renderSOS() {
        if (typeof SOSModule === 'undefined') {
            container.innerHTML = `
                <div class="panel__header">
                    <h2 class="panel__title">🆘 Emergency</h2>
                </div>
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('alert')}</div>
                    <div class="empty-state__title">SOS Module Not Loaded</div>
                    <div class="empty-state__desc">Emergency features are not available</div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = SOSModule.renderPanel();
        SOSModule.attachPanelListeners(container);
    }

    function renderMapLayers() {
        const layers = State.get('mapLayers');
        
        // Get current base layer
        const currentBase = layers.baseLayer || 'standard';
        const activeOverlays = layers.overlays || [];
        
        // Layer categories with metadata
        const layerCategories = {
            general: {
                name: 'General Maps',
                icon: '🗺️',
                collapsed: false,
                baseLayers: [
                    { key: 'standard', name: 'OpenStreetMap', desc: 'Street map with roads & places', icon: 'map' },
                    { key: 'terrain', name: 'OpenTopoMap', desc: 'Topographic with contour lines', icon: 'terrain' },
                    { key: 'satellite', name: 'Satellite', desc: 'Aerial imagery (Esri)', icon: 'satellite' }
                ]
            },
            usgs: {
                name: 'USGS (US Geological Survey)',
                icon: '🏔️',
                collapsed: true,
                baseLayers: [
                    { key: 'usgs_topo', name: 'USGS Topo', desc: 'Official USGS topographic maps', icon: 'terrain' },
                    { key: 'usgs_imagery', name: 'USGS Imagery', desc: 'USGS orthoimagery', icon: 'satellite' },
                    { key: 'usgs_imagery_topo', name: 'USGS Imagery + Topo', desc: 'Aerial with topo overlay', icon: 'layers' }
                ],
                overlays: [
                    { key: 'usgs_hydro', name: 'Hydrography', desc: 'Rivers, streams, lakes', icon: 'water' }
                ]
            },
            usfs: {
                name: 'USFS / Topo Maps',
                icon: '🌲',
                collapsed: true,
                baseLayers: [
                    { key: 'usfs_topo', name: 'USA Topo', desc: 'USGS quads with Forest data', icon: 'terrain' },
                    { key: 'world_topo', name: 'World Topo', desc: 'Detailed worldwide topo', icon: 'terrain' },
                    { key: 'natgeo', name: 'Nat Geo', desc: 'National Geographic style', icon: 'map' }
                ],
                overlays: []
            },
            blm: {
                name: 'BLM (Bureau of Land Mgmt)',
                icon: '🏜️',
                collapsed: true,
                baseLayers: [],
                overlays: [
                    { key: 'blm_surface', name: 'Surface Management', desc: 'Land ownership & management', icon: 'layers' },
                    { key: 'blm_grazing', name: 'Grazing Allotments', desc: 'Grazing boundaries', icon: 'map' }
                ]
            },
            overlays: {
                name: 'Map Overlays',
                icon: '📍',
                collapsed: false,
                baseLayers: [],
                overlays: [
                    { key: 'hillshade', name: 'Hillshade', desc: 'Terrain shading effect', icon: 'terrain' },
                    { key: 'labels', name: 'Labels', desc: 'Place names & boundaries', icon: 'map' },
                    { key: 'transportation', name: 'Roads Overlay', desc: 'Major roads on satellite', icon: 'route' },
                    { key: 'grid', name: 'Grid', desc: 'Reference grid overlay', icon: 'layers' }
                ]
            }
        };
        
        // Get expanded state from localStorage or default (with try-catch for private browsing)
        let expandedState = {};
        try {
            expandedState = JSON.parse(localStorage.getItem('gd_layer_expanded') || '{}');
        } catch (e) {
            console.warn('Could not read layer expanded state from localStorage:', e);
        }
        
        container.innerHTML = `
            <div class="panel__header"><h2 class="panel__title">Map Layers</h2></div>
            
            ${Object.entries(layerCategories).map(([catKey, cat]) => {
                const isExpanded = expandedState[catKey] !== undefined ? expandedState[catKey] : !cat.collapsed;
                const hasBaseLayers = cat.baseLayers && cat.baseLayers.length > 0;
                const hasOverlays = cat.overlays && cat.overlays.length > 0;
                const activeInCategory = (hasBaseLayers && cat.baseLayers.some(l => l.key === currentBase)) ||
                                         (hasOverlays && cat.overlays.some(l => activeOverlays.includes(l.key)));
                
                return `
                    <div class="layer-category ${isExpanded ? 'layer-category--expanded' : ''}" data-category="${catKey}">
                        <button class="layer-category__header" data-toggle-category="${catKey}">
                            <span class="layer-category__icon">${cat.icon}</span>
                            <span class="layer-category__name">${cat.name}</span>
                            ${activeInCategory ? '<span class="layer-category__active">●</span>' : ''}
                            <span class="layer-category__arrow">${Icons.get('back')}</span>
                        </button>
                        <div class="layer-category__content" style="${isExpanded ? '' : 'display:none'}">
                            ${hasBaseLayers ? `
                                <div class="layer-group">
                                    ${catKey !== 'general' ? '<div class="layer-group__label">Base Maps</div>' : ''}
                                    ${cat.baseLayers.map(layer => `
                                        <button class="layer-btn ${currentBase === layer.key ? 'layer-btn--active' : ''}" 
                                                data-base="${layer.key}">
                                            <span class="layer-btn__icon">${Icons.get(layer.icon)}</span>
                                            <div class="layer-btn__text">
                                                <span class="layer-btn__label">${layer.name}</span>
                                                <span class="layer-btn__desc">${layer.desc}</span>
                                            </div>
                                            ${currentBase === layer.key ? `<span class="layer-btn__check">${Icons.get('check')}</span>` : ''}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                            ${hasOverlays ? `
                                <div class="layer-group">
                                    ${hasBaseLayers ? '<div class="layer-group__label">Overlays</div>' : ''}
                                    ${cat.overlays.map(layer => `
                                        <button class="layer-btn layer-btn--overlay ${activeOverlays.includes(layer.key) ? 'layer-btn--active' : ''}" 
                                                data-overlay="${layer.key}">
                                            <span class="layer-btn__icon">${Icons.get(layer.icon)}</span>
                                            <div class="layer-btn__text">
                                                <span class="layer-btn__label">${layer.name}</span>
                                                <span class="layer-btn__desc">${layer.desc}</span>
                                            </div>
                                            ${activeOverlays.includes(layer.key) ? `<span class="layer-btn__check">${Icons.get('check')}</span>` : ''}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
            
            <!-- Active Layers Summary -->
            <div class="divider"></div>
            <div class="section-label">Active Layers</div>
            <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:12px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <span style="color:#f97316">●</span>
                    <span>Base: <strong>${getLayerDisplayName(currentBase)}</strong></span>
                </div>
                ${activeOverlays.length > 0 ? `
                    <div style="color:rgba(255,255,255,0.6)">
                        Overlays: ${activeOverlays.map(k => getLayerDisplayName(k)).join(', ')}
                    </div>
                ` : `
                    <div style="color:rgba(255,255,255,0.4)">No overlays active</div>
                `}
            </div>
            
            <!-- Quick Actions -->
            <div style="margin-top:16px;display:flex;gap:8px">
                <button class="btn btn--secondary" id="reset-layers" style="flex:1;font-size:12px">
                    Reset to Default
                </button>
            </div>
            
            <!-- Attribution Note -->
            <div style="margin-top:16px;padding:10px;font-size:10px;color:rgba(255,255,255,0.3);line-height:1.4">
                Map data © OpenStreetMap contributors, USGS, USDA Forest Service, BLM. 
                Tiles are cached locally for offline use.
            </div>
        `;
        
        // Helper function for layer display names
        function getLayerDisplayName(key) {
            const names = {
                standard: 'OpenStreetMap',
                terrain: 'OpenTopoMap',
                satellite: 'Satellite',
                usgs_topo: 'USGS Topo',
                usgs_imagery: 'USGS Imagery',
                usgs_imagery_topo: 'USGS Imagery+Topo',
                usgs_hydro: 'Hydrography',
                usfs_topo: 'USA Topo',
                world_topo: 'World Topo',
                natgeo: 'Nat Geo',
                blm_surface: 'BLM Surface',
                blm_grazing: 'Grazing',
                hillshade: 'Hillshade',
                labels: 'Labels',
                transportation: 'Roads',
                grid: 'Grid'
            };
            return names[key] || key;
        }
        
        // Category collapse/expand handlers
        container.querySelectorAll('[data-toggle-category]').forEach(btn => {
            btn.onclick = () => {
                const catKey = btn.dataset.toggleCategory;
                const category = btn.closest('.layer-category');
                const content = category.querySelector('.layer-category__content');
                const isExpanded = content.style.display !== 'none';
                
                content.style.display = isExpanded ? 'none' : '';
                category.classList.toggle('layer-category--expanded', !isExpanded);
                
                // Save state (with try-catch for private browsing/quota)
                try {
                    const state = JSON.parse(localStorage.getItem('gd_layer_expanded') || '{}');
                    state[catKey] = !isExpanded;
                    localStorage.setItem('gd_layer_expanded', JSON.stringify(state));
                } catch (e) {
                    console.warn('Could not save layer expanded state to localStorage:', e);
                }
            };
        });
        
        // Base layer selection (radio-style - only one active)
        container.querySelectorAll('[data-base]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const baseKey = btn.dataset.base;
                const newLayers = { 
                    ...layers, 
                    baseLayer: baseKey,
                    // Keep legacy flags for backwards compatibility
                    terrain: baseKey === 'terrain',
                    satellite: baseKey === 'satellite'
                };
                
                State.set('mapLayers', newLayers);
                MapModule.setBaseLayer(baseKey);
                MapModule.saveLayerPreferences();
                renderMapLayers();
            };
        });
        
        // Overlay toggles (checkbox-style)
        container.querySelectorAll('[data-overlay]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const overlayKey = btn.dataset.overlay;
                const currentOverlays = layers.overlays || [];
                
                let newOverlays;
                if (currentOverlays.includes(overlayKey)) {
                    newOverlays = currentOverlays.filter(k => k !== overlayKey);
                } else {
                    newOverlays = [...currentOverlays, overlayKey];
                }
                
                const newLayers = { 
                    ...layers, 
                    overlays: newOverlays,
                    // Keep legacy flags
                    grid: newOverlays.includes('grid'),
                    contours: newOverlays.includes('hillshade')
                };
                
                State.set('mapLayers', newLayers);
                MapModule.saveLayerPreferences();
                renderMapLayers();
            };
        });
        
        // Reset button
        container.querySelector('#reset-layers').onclick = () => {
            const defaultLayers = {
                baseLayer: 'standard',
                overlays: [],
                terrain: false,
                satellite: false,
                grid: false,
                contours: false
            };
            State.set('mapLayers', defaultLayers);
            MapModule.setBaseLayer('standard');
            MapModule.saveLayerPreferences();
            renderMapLayers();
            ModalsModule.showToast('Layers reset to default', 'success');
        };
    }

    function renderWaypoints() {
        const wps = State.get('waypoints'), filter = State.get('waypointFilter'), sel = State.get('selectedWaypoint');
        
        // Apply type filter
        let filtered = filter === 'all' ? wps : 
                       filter === 'private' ? wps.filter(w => !w.visibility || w.visibility === 'private') :
                       filter === 'team' ? wps.filter(w => w.visibility === 'team') :
                       filter === 'community' ? wps.filter(w => w.visibility === 'community') :
                       wps.filter(w => w.type === filter);
        
        // Count by visibility
        const privateCount = wps.filter(w => !w.visibility || w.visibility === 'private').length;
        const teamCount = wps.filter(w => w.visibility === 'team').length;
        const communityCount = wps.filter(w => w.visibility === 'community').length;
        
        // Confidence level colors
        const confidenceColors = {
            1: '#ef4444', // Very Low - red
            2: '#f97316', // Low - orange
            3: '#eab308', // Medium - yellow
            4: '#22c55e', // High - green
            5: '#10b981'  // Very High - teal
        };
        
        // Visibility icons and colors
        const visibilityIcons = {
            private: { icon: '🔒', color: '#6b7280', label: 'Private' },
            team: { icon: '👥', color: '#3b82f6', label: 'Team' },
            community: { icon: '🌐', color: '#10b981', label: 'Community' }
        };
        
        // Helper to render visibility badge
        const renderVisibilityBadge = (wp) => {
            const visibility = wp.visibility || 'private';
            const vis = visibilityIcons[visibility];
            return `<span style="font-size:12px" title="${vis.label}">${vis.icon}</span>`;
        };
        
        // Helper to render mini confidence stars
        const renderConfidenceStars = (wp) => {
            const confidence = wp.confidence || 3;
            const color = confidenceColors[confidence] || '#eab308';
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                stars += `<span style="color:${i <= confidence ? color : 'rgba(255,255,255,0.15)'};font-size:10px">${i <= confidence ? '★' : '☆'}</span>`;
            }
            return `<div style="display:flex;gap:1px;align-items:center" title="Confidence: ${confidence}/5">${stars}</div>`;
        };
        
        // Helper to format coordinates
        const formatCoords = (wp) => {
            if (wp.lat && wp.lon) {
                const latDir = wp.lat >= 0 ? 'N' : 'S';
                const lonDir = wp.lon >= 0 ? 'E' : 'W';
                return `${Math.abs(wp.lat).toFixed(4)}° ${latDir}, ${Math.abs(wp.lon).toFixed(4)}° ${lonDir}`;
            }
            return `${wp.x.toFixed(1)}%, ${wp.y.toFixed(1)}%`;
        };
        
        // Helper to render key structured fields for a waypoint type
        const renderKeyFields = (wp) => {
            const typeConfig = Constants.WAYPOINT_TYPES[wp.type];
            if (!typeConfig || !typeConfig.fields) return '';
            
            // Select 2-3 most important fields to display
            const keyFieldsMap = {
                water: ['flowRate', 'reliability', 'treatmentRequired'],
                fuel: ['fuelType', 'quantity', 'cacheType'],
                camp: ['capacity', 'cover', 'cellSignal'],
                resupply: ['storeType', 'hours'],
                hazard: ['hazardType', 'severity', 'vehicleImpact'],
                bailout: ['accessType', 'emsResponse', 'cellSignal'],
                custom: ['category']
            };
            
            const keyFields = keyFieldsMap[wp.type] || [];
            const fieldsHtml = keyFields
                .filter(key => wp[key] && wp[key] !== '' && wp[key] !== 'unknown')
                .map(key => {
                    const field = typeConfig.fields.find(f => f.key === key);
                    if (!field) return '';
                    const displayValue = Constants.getFieldDisplayValue(wp.type, key, wp[key]);
                    return `<span style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;font-size:10px">${displayValue}</span>`;
                })
                .filter(Boolean)
                .join('');
            
            if (!fieldsHtml) return '';
            return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${fieldsHtml}</div>`;
        };
        
        // Helper to render photo thumbnails
        const renderPhotoThumbs = (wp) => {
            if (!wp.photos || wp.photos.length === 0) return '';
            const maxThumbs = 3;
            const displayPhotos = wp.photos.slice(0, maxThumbs);
            const remaining = wp.photos.length - maxThumbs;
            
            return `
                <div style="display:flex;gap:4px;margin-top:8px;align-items:center" data-wp-photos="${wp.id}">
                    ${displayPhotos.map(photo => `
                        <div class="wp-photo-thumb" data-photo-id="${photo.id}" style="
                            width:40px;
                            height:40px;
                            border-radius:4px;
                            overflow:hidden;
                            cursor:pointer;
                        ">
                            <img src="${photo.data}" alt="Photo" style="width:100%;height:100%;object-fit:cover">
                        </div>
                    `).join('')}
                    ${remaining > 0 ? `<span style="font-size:11px;color:rgba(255,255,255,0.5)">+${remaining} more</span>` : ''}
                </div>
            `;
        };
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title" id="waypoints-title">Waypoints</h2>
                <button class="btn btn--primary" id="add-wp-btn" aria-label="Add new waypoint">${Icons.get('plus')} Add</button>
            </div>
            
            <!-- Undo/Redo Toolbar -->
            ${renderUndoToolbar()}
            
            <!-- Visibility Filter Row -->
            <div style="display:flex;gap:6px;margin-bottom:12px" role="group" aria-label="Filter by visibility">
                <button class="chip ${filter === 'all' ? 'chip--active' : ''}" data-filter="all" style="flex:1" aria-pressed="${filter === 'all'}">All (${wps.length})</button>
                ${privateCount > 0 ? `<button class="chip ${filter === 'private' ? 'chip--active' : ''}" data-filter="private" style="flex:1" aria-pressed="${filter === 'private'}" aria-label="Private waypoints: ${privateCount}">🔒 ${privateCount}</button>` : ''}
                ${teamCount > 0 ? `<button class="chip ${filter === 'team' ? 'chip--active' : ''}" data-filter="team" style="flex:1" aria-pressed="${filter === 'team'}" aria-label="Team waypoints: ${teamCount}">👥 ${teamCount}</button>` : ''}
                ${communityCount > 0 ? `<button class="chip ${filter === 'community' ? 'chip--active' : ''}" data-filter="community" style="flex:1" aria-pressed="${filter === 'community'}" aria-label="Community waypoints: ${communityCount}">🌐 ${communityCount}</button>` : ''}
            </div>
            
            <!-- Type Filter Row -->
            <div class="filter-chips" role="group" aria-label="Filter by type">
                ${Object.entries(Constants.WAYPOINT_TYPES).map(([k, t]) => { const c = wps.filter(w => w.type === k).length; return c ? `<button class="chip ${filter === k ? 'chip--active' : ''}" data-filter="${k}" aria-pressed="${filter === k}" aria-label="${t.label}: ${c}"><span aria-hidden="true">${t.icon}</span> ${c}</button>` : ''; }).join('')}
            </div>
            
            <div class="panel__scroll" role="list" aria-label="Waypoint list">${filtered.map(wp => { const t = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom; return `
                <article class="card ${sel?.id === wp.id ? 'card--selected' : ''}" data-wp="${wp.id}" style="margin-bottom:8px" role="listitem" aria-selected="${sel?.id === wp.id}" tabindex="0" aria-label="${wp.name}, ${t.label}">
                    <div class="card__header">
                        <div class="card__icon" style="background:${t.color}22" aria-hidden="true">${t.icon}</div>
                        <div style="flex:1;min-width:0">
                            <div class="card__title" style="display:flex;align-items:center;gap:6px">
                                ${renderVisibilityBadge(wp)}
                                <span>${wp.name}</span>
                                ${renderConfidenceStars(wp)}
                            </div>
                            <div class="card__subtitle">${t.label} • ${formatCoords(wp)}</div>
                        </div>
                        ${wp.photos && wp.photos.length > 0 ? `<span style="font-size:11px;color:rgba(255,255,255,0.4);margin-right:4px" aria-label="${wp.photos.length} photos">📷${wp.photos.length}</span>` : ''}
                        ${wp.verified ? `<span style="color:#22c55e;width:16px;height:16px;flex-shrink:0" aria-label="Verified" title="Verified">${Icons.get('check')}</span>` : ''}
                        <button class="btn btn--secondary" data-edit-wp="${wp.id}" style="padding:6px;margin-left:4px" title="Edit" aria-label="Edit ${wp.name}">✏️</button>
                        <button class="btn btn--secondary" data-delete-wp="${wp.id}" style="padding:6px" title="Delete" aria-label="Delete ${wp.name}">🗑️</button>
                    </div>
                    ${renderKeyFields(wp)}
                    ${wp.notes ? `<div class="card__notes">${wp.notes}</div>` : ''}
                    ${renderPhotoThumbs(wp)}
                </article>`; }).join('')}</div>
        `;
        
        // Attach undo/redo handlers
        attachUndoHandlers();
        
        container.querySelector('#add-wp-btn').onclick = () => ModalsModule.openWaypointModal();
        container.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => State.set('waypointFilter', b.dataset.filter));
        
        // Card click selects waypoint (but not if clicking buttons or photos)
        container.querySelectorAll('[data-wp]').forEach(c => {
            c.onclick = (e) => {
                if (e.target.closest('[data-edit-wp]') || e.target.closest('[data-delete-wp]') || e.target.closest('.wp-photo-thumb')) return;
                State.Waypoints.select(wps.find(w => w.id === c.dataset.wp));
            };
        });
        
        // Photo thumbnail click handler - open photo in full view
        container.querySelectorAll('.wp-photo-thumb').forEach(thumb => {
            thumb.onclick = (e) => {
                e.stopPropagation();
                const wpId = thumb.closest('[data-wp-photos]')?.dataset.wpPhotos;
                const photoId = thumb.dataset.photoId;
                const wp = wps.find(w => w.id === wpId);
                const photo = wp?.photos?.find(p => p.id === photoId);
                if (photo) {
                    // Open full-size viewer
                    const viewer = document.createElement('div');
                    viewer.id = 'photo-viewer';
                    viewer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:1000;cursor:pointer;';
                    viewer.innerHTML = `
                        <img src="${photo.data}" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:8px">
                        <button style="position:absolute;top:20px;right:20px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:white;font-size:24px;cursor:pointer;">×</button>
                    `;
                    viewer.onclick = () => viewer.remove();
                    document.body.appendChild(viewer);
                }
            };
        });
        
        // Edit button handler
        container.querySelectorAll('[data-edit-wp]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const wp = wps.find(w => w.id === btn.dataset.editWp);
                if (wp) ModalsModule.openWaypointModal(null, wp);
            };
        });
        
        // Delete button handler
        container.querySelectorAll('[data-delete-wp]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const wp = wps.find(w => w.id === btn.dataset.deleteWp);
                if (wp) ModalsModule.confirmDeleteWaypoint(wp);
            };
        });
    }

    function renderRoutes() {
        const routes = State.get('routes');
        const waypoints = State.get('waypoints');
        const builderState = RouteBuilderModule.getState();
        const isBuilding = builderState.isBuilding;
        const currentRoute = builderState.currentRoute;

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Routes</h2>
                ${!isBuilding ? `
                    <button class="btn btn--primary" id="new-route-btn">${Icons.get('plus')} New</button>
                ` : ''}
            </div>
            
            <!-- Undo/Redo Toolbar -->
            ${renderUndoToolbar()}
            
            <!-- Import/Export Section -->
            <div class="section-label">Import</div>
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <label class="btn btn--secondary" style="flex:1;cursor:pointer">
                    ${Icons.get('download')} GPX
                    <input type="file" id="gpx-import" accept=".gpx" style="display:none">
                </label>
                <label class="btn btn--secondary" style="flex:1;cursor:pointer">
                    ${Icons.get('download')} KML/KMZ
                    <input type="file" id="kml-import" accept=".kml,.kmz" style="display:none">
                </label>
            </div>
            
            <div class="section-label">Export</div>
            <div style="display:flex;gap:8px;margin-bottom:16px">
                <button class="btn btn--secondary" id="gpx-export" style="flex:1" ${routes.length === 0 && waypoints.length === 0 ? 'disabled' : ''}>
                    ${Icons.get('export')} GPX
                </button>
                <button class="btn btn--secondary" id="kml-export" style="flex:1" ${routes.length === 0 && waypoints.length === 0 ? 'disabled' : ''}>
                    ${Icons.get('export')} KML
                </button>
            </div>
            
            ${isBuilding && currentRoute ? `
                <!-- Route Builder Mode -->
                <div style="padding:14px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:12px;margin-bottom:16px">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                        <span style="font-size:12px;color:#f97316;font-weight:600">BUILDING ROUTE</span>
                        <span style="font-size:11px;color:rgba(255,255,255,0.5)">${currentRoute.points.length} points</span>
                    </div>
                    <input type="text" id="route-name-input" value="${currentRoute.name}" placeholder="Route name" 
                        style="margin-bottom:12px;background:rgba(0,0,0,0.3)">
                    
                    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                        Click on the map to add points. Click near waypoints to link them.
                    </div>
                    
                    <!-- Route Stats -->
                    <div class="stat-grid stat-grid--3" style="margin-bottom:12px">
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:14px;font-weight:600">${currentRoute.distance}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">MILES</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:14px;font-weight:600">${currentRoute.duration}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">TIME</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:6px">
                            <div style="font-size:14px;font-weight:600">${currentRoute.elevation}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">ELEV (FT)</div>
                        </div>
                    </div>
                    
                    <!-- Point List -->
                    ${currentRoute.points.length > 0 ? `
                        <div class="section-label">Route Points</div>
                        <div style="max-height:200px;overflow-y:auto;margin-bottom:12px">
                            ${currentRoute.points.map((pt, i) => {
                                const linkedWp = pt.waypointId ? waypoints.find(w => w.id === pt.waypointId) : null;
                                const wpType = linkedWp ? Constants.WAYPOINT_TYPES[linkedWp.type] : null;
                                return `
                                    <div class="list-item" style="margin-bottom:4px;padding:8px" data-point-index="${i}">
                                        <div style="display:flex;align-items:center;gap:8px;flex:1">
                                            <span style="font-size:11px;color:rgba(255,255,255,0.3);width:20px">${i + 1}</span>
                                            ${linkedWp ? `
                                                <span style="font-size:14px">${wpType?.icon || '📍'}</span>
                                                <span style="font-size:12px">${linkedWp.name}</span>
                                            ` : `
                                                <span style="font-size:12px;color:rgba(255,255,255,0.6)">${pt.lat.toFixed(4)}°, ${pt.lon.toFixed(4)}°</span>
                                            `}
                                        </div>
                                        <select data-terrain-index="${i}" style="width:80px;padding:4px;font-size:11px">
                                            <option value="highway" ${pt.terrain === 'highway' ? 'selected' : ''}>Highway</option>
                                            <option value="road" ${pt.terrain === 'road' ? 'selected' : ''}>Road</option>
                                            <option value="trail" ${pt.terrain === 'trail' ? 'selected' : ''}>Trail</option>
                                            <option value="crawl" ${pt.terrain === 'crawl' ? 'selected' : ''}>Technical</option>
                                        </select>
                                        <button class="btn btn--secondary" data-remove-point="${i}" style="padding:4px 8px;font-size:11px">✕</button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
                            Click on the map to add your first point
                        </div>
                    `}
                    
                    <!-- Builder Actions -->
                    <div style="display:flex;gap:8px">
                        <button class="btn btn--secondary" id="reverse-route" style="flex:1" ${currentRoute.points.length < 2 ? 'disabled' : ''}>
                            ↔️ Reverse
                        </button>
                        <button class="btn btn--secondary" id="cancel-route" style="flex:1">
                            Cancel
                        </button>
                        <button class="btn btn--primary" id="finish-route" style="flex:1" ${currentRoute.points.length < 2 ? 'disabled' : ''}>
                            ✓ Save
                        </button>
                    </div>
                </div>
            ` : ''}
            
            <!-- Existing Routes List -->
            ${routes.filter(r => !r.isBuilding).length === 0 && !isBuilding ? `
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('route')}</div>
                    <div class="empty-state__title">No routes yet</div>
                    <div class="empty-state__desc">Create a route or import a GPX file</div>
                </div>
            ` : `
                <div class="panel__scroll">
                    ${routes.filter(r => !r.isBuilding).map(r => `
                        <div class="card" style="margin-bottom:12px" data-route-id="${r.id}">
                            <div class="card__header">
                                <div class="card__icon" style="background:rgba(249,115,22,0.15);color:#f97316">${Icons.get('route')}</div>
                                <div style="flex:1">
                                    <div class="card__title">${r.name}</div>
                                    <div class="card__subtitle">${r.points?.length || 0} points ${r.source ? `• ${r.source}` : ''}</div>
                                </div>
                                <button class="btn btn--secondary" data-elevation-route="${r.id}" style="padding:6px" title="Elevation Profile">📈</button>
                                <button class="btn btn--secondary" data-edit-route="${r.id}" style="padding:6px">✏️</button>
                                <button class="btn btn--secondary" data-delete-route="${r.id}" style="padding:6px">🗑️</button>
                            </div>
                            <div class="stat-grid stat-grid--3" style="margin-top:12px;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px">
                                <div style="text-align:center">
                                    <div style="font-size:16px;font-weight:600">${r.distance || '0'}</div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">MILES</div>
                                </div>
                                <div style="text-align:center">
                                    <div style="font-size:16px;font-weight:600">${r.duration || '0h'}</div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">EST TIME</div>
                                </div>
                                <div style="text-align:center">
                                    <div style="font-size:16px;font-weight:600">${r.elevation || '0'}</div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">ELEV (FT)</div>
                                </div>
                            </div>
                            <!-- Elevation Profile Container (initially hidden) -->
                            <div id="elevation-profile-${r.id}" class="elevation-profile" style="display:none;margin-top:12px">
                                <div class="elevation-profile__loading" id="elevation-loading-${r.id}">
                                    ${Icons.get('elevation')}
                                    <div>Loading elevation data...</div>
                                </div>
                                <div class="elevation-profile__chart" id="elevation-chart-${r.id}" style="display:none">
                                    <canvas id="elevation-canvas-${r.id}"></canvas>
                                </div>
                                <div id="elevation-stats-${r.id}"></div>
                                <div id="elevation-grades-${r.id}"></div>
                                <div id="elevation-warnings-${r.id}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
            
            <!-- Quick Create from Waypoints -->
            ${!isBuilding && waypoints.length >= 2 ? `
                <div class="divider"></div>
                <div class="section-label">Quick Create</div>
                <button class="btn btn--secondary btn--full" id="route-from-waypoints">
                    📍 Create Route from All Waypoints
                </button>
            ` : ''}
        `;
        
        // Attach undo/redo handlers
        attachUndoHandlers();
        
        // Event handlers
        const newRouteBtn = container.querySelector('#new-route-btn');
        if (newRouteBtn) {
            newRouteBtn.onclick = () => {
                RouteBuilderModule.startNewRoute();
                renderRoutes();
            };
        }
        
        // GPX Import
        const gpxImport = container.querySelector('#gpx-import');
        if (gpxImport) {
            gpxImport.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const result = await GPXModule.importFromFile(file);
                    
                    // Add imported waypoints
                    if (result.waypoints.length > 0) {
                        const existingWps = State.get('waypoints');
                        State.Waypoints.setAll([...existingWps, ...result.waypoints]);
                        await Storage.Waypoints.saveAll(result.waypoints);
                    }
                    
                    // Add imported routes
                    const importedRoutes = [...result.routes, ...result.tracks];
                    if (importedRoutes.length > 0) {
                        const existingRoutes = State.get('routes');
                        State.Routes.setAll([...existingRoutes, ...importedRoutes]);
                        for (const route of importedRoutes) {
                            await Storage.Routes.save(route);
                        }
                    }
                    
                    ModalsModule.showToast(
                        `Imported ${result.waypoints.length} waypoints, ${importedRoutes.length} routes`, 
                        'success'
                    );
                    
                    renderRoutes();
                    MapModule.render();
                    
                } catch (err) {
                    console.error('GPX import error:', err);
                    ModalsModule.showToast('Failed to import GPX: ' + err.message, 'error');
                }
                
                // Reset input
                e.target.value = '';
            };
        }
        
        // GPX Export
        const gpxExport = container.querySelector('#gpx-export');
        if (gpxExport) {
            gpxExport.onclick = () => {
                const allWaypoints = State.get('waypoints');
                const allRoutes = State.get('routes').filter(r => !r.isBuilding);
                GPXModule.downloadGPX(allWaypoints, allRoutes, 'griddown-export.gpx');
                ModalsModule.showToast('GPX file downloaded', 'success');
            };
        }
        
        // KML Import
        const kmlImport = container.querySelector('#kml-import');
        if (kmlImport) {
            kmlImport.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                try {
                    const result = await KMLModule.importFromFile(file);
                    
                    // Add imported waypoints
                    if (result.waypoints.length > 0) {
                        const existingWps = State.get('waypoints');
                        State.Waypoints.setAll([...existingWps, ...result.waypoints]);
                        await Storage.Waypoints.saveAll(result.waypoints);
                    }
                    
                    // Add imported routes
                    if (result.routes.length > 0) {
                        const existingRoutes = State.get('routes');
                        State.Routes.setAll([...existingRoutes, ...result.routes]);
                        for (const route of result.routes) {
                            await Storage.Routes.save(route);
                        }
                    }
                    
                    ModalsModule.showToast(
                        `Imported ${result.waypoints.length} waypoints, ${result.routes.length} routes from KML`, 
                        'success'
                    );
                    
                    renderRoutes();
                    MapModule.render();
                    
                } catch (err) {
                    console.error('KML import error:', err);
                    ModalsModule.showToast('Failed to import KML: ' + err.message, 'error');
                }
                
                // Reset input
                e.target.value = '';
            };
        }
        
        // KML Export
        const kmlExport = container.querySelector('#kml-export');
        if (kmlExport) {
            kmlExport.onclick = () => {
                const allWaypoints = State.get('waypoints');
                const allRoutes = State.get('routes').filter(r => !r.isBuilding);
                KMLModule.downloadKML(allWaypoints, allRoutes, 'griddown-export.kml');
                ModalsModule.showToast('KML file downloaded', 'success');
            };
        }
        
        // Route name input
        const routeNameInput = container.querySelector('#route-name-input');
        if (routeNameInput) {
            routeNameInput.onchange = (e) => {
                if (currentRoute) {
                    currentRoute.name = e.target.value || 'Unnamed Route';
                }
            };
        }
        
        // Terrain selectors
        container.querySelectorAll('[data-terrain-index]').forEach(sel => {
            sel.onchange = (e) => {
                const idx = parseInt(sel.dataset.terrainIndex);
                RouteBuilderModule.setSegmentTerrain(idx, e.target.value);
                renderRoutes();
            };
        });
        
        // Remove point buttons
        container.querySelectorAll('[data-remove-point]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.removePoint);
                RouteBuilderModule.removePoint(idx);
                renderRoutes();
            };
        });
        
        // Reverse route
        const reverseBtn = container.querySelector('#reverse-route');
        if (reverseBtn) {
            reverseBtn.onclick = () => {
                RouteBuilderModule.reverseRoute();
                renderRoutes();
            };
        }
        
        // Cancel route
        const cancelBtn = container.querySelector('#cancel-route');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                RouteBuilderModule.cancelRoute();
                renderRoutes();
            };
        }
        
        // Finish route
        const finishBtn = container.querySelector('#finish-route');
        if (finishBtn) {
            finishBtn.onclick = () => {
                RouteBuilderModule.finishRoute();
                renderRoutes();
            };
        }
        
        // Edit route
        container.querySelectorAll('[data-edit-route]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                RouteBuilderModule.editRoute(btn.dataset.editRoute);
                renderRoutes();
            };
        });
        
        // Delete route
        container.querySelectorAll('[data-delete-route]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this route?')) {
                    RouteBuilderModule.deleteRoute(btn.dataset.deleteRoute);
                    renderRoutes();
                }
            };
        });
        
        // Create from waypoints
        const fromWaypointsBtn = container.querySelector('#route-from-waypoints');
        if (fromWaypointsBtn) {
            fromWaypointsBtn.onclick = () => {
                const waypointIds = waypoints.map(w => w.id);
                RouteBuilderModule.createFromWaypoints(waypointIds);
                renderRoutes();
            };
        }
        
        // Elevation profile toggles
        container.querySelectorAll('[data-elevation-route]').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const routeId = btn.dataset.elevationRoute;
                const profileContainer = document.getElementById(`elevation-profile-${routeId}`);
                const loadingEl = document.getElementById(`elevation-loading-${routeId}`);
                const chartContainer = document.getElementById(`elevation-chart-${routeId}`);
                const statsEl = document.getElementById(`elevation-stats-${routeId}`);
                const gradesEl = document.getElementById(`elevation-grades-${routeId}`);
                const warningsEl = document.getElementById(`elevation-warnings-${routeId}`);
                
                if (!profileContainer) return;
                
                // Toggle visibility
                const isVisible = profileContainer.style.display !== 'none';
                if (isVisible) {
                    profileContainer.style.display = 'none';
                    btn.style.background = '';
                    return;
                }
                
                // Show and load profile
                profileContainer.style.display = 'block';
                btn.style.background = 'rgba(249,115,22,0.15)';
                loadingEl.style.display = 'block';
                chartContainer.style.display = 'none';
                
                // Find the route
                const route = routes.find(r => r.id === routeId);
                if (!route || !route.points || route.points.length < 2) {
                    loadingEl.innerHTML = '<div style="color:rgba(255,255,255,0.5)">Route needs at least 2 points</div>';
                    return;
                }
                
                try {
                    // Analyze elevation profile
                    const profile = await ElevationModule.analyzeRoute(route, waypoints);
                    
                    if (!profile) {
                        loadingEl.innerHTML = '<div style="color:rgba(255,255,255,0.5)">Could not load elevation data</div>';
                        return;
                    }
                    
                    // Hide loading, show chart
                    loadingEl.style.display = 'none';
                    chartContainer.style.display = 'block';
                    
                    // Render elevation profile canvas
                    const canvas = document.getElementById(`elevation-canvas-${routeId}`);
                    if (canvas) {
                        ElevationModule.renderProfile(canvas, profile, { height: 150 });
                    }
                    
                    // Render stats
                    statsEl.innerHTML = `
                        <div class="stat-grid stat-grid--2" style="margin-top:12px">
                            <div class="stat-box" style="padding:12px">
                                <div style="font-size:18px;font-weight:600;color:#22c55e">+${Math.round(profile.totalElevationGain).toLocaleString()}'</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.4)">ELEVATION GAIN</div>
                            </div>
                            <div class="stat-box" style="padding:12px">
                                <div style="font-size:18px;font-weight:600;color:#3b82f6">-${Math.round(profile.totalElevationLoss).toLocaleString()}'</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.4)">ELEVATION LOSS</div>
                            </div>
                            <div class="stat-box" style="padding:12px">
                                <div style="font-size:16px;font-weight:600">${Math.round(profile.maxElevation).toLocaleString()}'</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.4)">MAX ELEVATION</div>
                            </div>
                            <div class="stat-box" style="padding:12px">
                                <div style="font-size:16px;font-weight:600">${Math.round(profile.minElevation).toLocaleString()}'</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.4)">MIN ELEVATION</div>
                            </div>
                        </div>
                    `;
                    
                    // Render grade distribution
                    gradesEl.innerHTML = `<div class="section-label" style="margin-top:12px">Grade Distribution</div>`;
                    const gradeContainer = document.createElement('div');
                    gradesEl.appendChild(gradeContainer);
                    ElevationModule.renderGradeDistribution(gradeContainer, profile);
                    
                    // Render warnings for steep sections
                    const impact = ElevationModule.getLogisticsImpact(profile);
                    if (impact.warnings.length > 0) {
                        warningsEl.innerHTML = `
                            <div class="section-label" style="margin-top:12px">⚠️ Steep Sections (${impact.warnings.length})</div>
                            ${impact.warnings.slice(0, 5).map(w => `
                                <div style="padding:8px 10px;background:${w.direction === 'uphill' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'};border-radius:6px;margin-bottom:4px;font-size:12px">
                                    <span style="color:${w.direction === 'uphill' ? '#ef4444' : '#3b82f6'}">
                                        ${w.direction === 'uphill' ? '↗️' : '↘️'} ${w.grade}% grade
                                    </span>
                                    <span style="color:rgba(255,255,255,0.5)"> at mile ${w.location}</span>
                                    <span style="color:rgba(255,255,255,0.4);font-size:11px"> • ${w.impact}</span>
                                </div>
                            `).join('')}
                            ${impact.warnings.length > 5 ? `
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);text-align:center;padding:4px">
                                    +${impact.warnings.length - 5} more steep sections
                                </div>
                            ` : ''}
                            <div style="margin-top:8px;padding:10px;background:rgba(249,115,22,0.1);border-radius:8px;font-size:12px">
                                <div style="color:#f97316;font-weight:500">Logistics Impact</div>
                                <div style="color:rgba(255,255,255,0.6);margin-top:4px">
                                    Fuel: ×${impact.fuelMultiplier.toFixed(2)} • Time: ×${impact.timeMultiplier.toFixed(2)}
                                </div>
                            </div>
                        `;
                    } else {
                        warningsEl.innerHTML = `
                            <div style="margin-top:12px;padding:10px;background:rgba(34,197,94,0.1);border-radius:8px;font-size:12px;color:#22c55e">
                                ✓ No significant steep sections detected
                            </div>
                        `;
                    }
                    
                } catch (err) {
                    console.error('Elevation analysis error:', err);
                    loadingEl.innerHTML = `<div style="color:rgba(255,255,255,0.5)">Error: ${err.message}</div>`;
                }
            };
        });
    }

    function renderLogistics() {
        const config = LogisticsModule.getConfig();
        const profiles = LogisticsModule.getProfiles();
        const routes = State.get('routes');
        const waypoints = State.get('waypoints');
        
        // Run analysis if we have a route
        let analysis = null;
        let report = null;
        if (routes.length > 0 && routes[0].points?.length >= 2) {
            analysis = LogisticsModule.analyzeRoute(routes[0], waypoints, config);
            report = LogisticsModule.generateReport(analysis);
        }
        
        const waterCount = waypoints.filter(w => w.type === 'water').length;
        const fuelCount = waypoints.filter(w => w.type === 'fuel').length;
        const bailCount = waypoints.filter(w => w.type === 'bailout').length;

        container.innerHTML = `
            <div class="panel__header"><h2 class="panel__title">Logistics Calculator</h2></div>
            
            <!-- Vehicle Selection -->
            <div class="section-label">Vehicle Profile</div>
            <div class="vehicle-grid">
                ${Object.entries(profiles.vehicles).map(([k, v]) => `
                    <button class="vehicle-btn ${config.vehicle === k ? 'vehicle-btn--selected' : ''}" data-vehicle="${k}">
                        <div class="vehicle-btn__name">${v.icon} ${v.name}</div>
                        <div class="vehicle-btn__specs">${v.fuelCapacity} gal • ${v.consumption.road} mpg</div>
                    </button>
                `).join('')}
            </div>
            
            <!-- Aux Fuel -->
            <div style="margin-top:12px;display:flex;align-items:center;gap:10px">
                <label style="font-size:12px;color:rgba(255,255,255,0.6)">Extra Fuel (gal):</label>
                <input type="number" id="aux-fuel" value="${config.auxFuel}" min="0" max="50" step="5" 
                    style="width:70px;padding:8px;font-size:14px;text-align:center">
            </div>
            
            <div class="divider"></div>
            
            <!-- Personnel -->
            <div class="section-label">Personnel</div>
            <div id="personnel-list">
                ${(config.personnel.length === 0 ? [{type: 'fit_adult', count: 1}] : config.personnel).map((p, i) => `
                    <div class="list-item" style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
                        <select data-personnel-type="${i}" style="flex:1;padding:8px">
                            ${Object.entries(profiles.personnel).map(([k, v]) => 
                                `<option value="${k}" ${p.type === k ? 'selected' : ''}>${v.icon} ${v.name}</option>`
                            ).join('')}
                        </select>
                        <input type="number" data-personnel-count="${i}" value="${p.count || 1}" min="1" max="20" 
                            style="width:50px;padding:8px;text-align:center">
                        <button class="btn btn--secondary" data-remove-personnel="${i}" style="padding:8px">✕</button>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn--secondary btn--full" id="add-personnel" style="margin-top:8px">
                ${Icons.get('plus')} Add Personnel
            </button>
            
            <!-- Weather Toggle -->
            <label class="checkbox-field" style="margin-top:12px">
                <input type="checkbox" id="hot-weather" ${config.hotWeather ? 'checked' : ''} style="width:auto">
                <span>Hot Weather (+50% water)</span>
            </label>
            
            <div class="divider"></div>
            
            <!-- Analysis Results -->
            ${analysis && report ? `
                <div class="status-card ${report.feasibility === 'FEASIBLE' ? 'status-card--success' : 'status-card--error'}">
                    <div class="status-card__icon">${Icons.get(report.feasibility === 'FEASIBLE' ? 'check' : 'alert')}</div>
                    <div>
                        <div class="status-card__title">${report.feasibility === 'FEASIBLE' ? 'Route Feasible' : 'Route NOT Feasible'}</div>
                        <div class="status-card__desc">${report.distance} • ${report.duration}</div>
                    </div>
                </div>
                
                <div class="section-label">Fuel Analysis</div>
                <div class="stat-grid stat-grid--2">
                    <div class="stat-box">
                        <div class="stat-box__icon" style="color:#f59e0b">${Icons.get('fuel')}</div>
                        <div class="stat-box__value">${report.fuel.required}</div>
                        <div class="stat-box__label">REQUIRED</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box__icon" style="color:#3b82f6">${Icons.get('route')}</div>
                        <div class="stat-box__value">${report.fuel.reserve}</div>
                        <div class="stat-box__label">RESERVE</div>
                    </div>
                </div>
                ${report.fuel.deficit !== 'None' ? `
                    <div style="margin-top:8px;padding:10px;background:rgba(239,68,68,0.15);border-radius:8px;color:#ef4444;font-size:13px">
                        ⚠️ ${report.fuel.deficit}
                    </div>
                ` : ''}
                
                <div class="section-label" style="margin-top:16px">Water & Food</div>
                <div class="stat-grid stat-grid--2">
                    <div class="stat-box">
                        <div class="stat-box__value" style="color:#3b82f6">💧 ${report.water.required}</div>
                        <div class="stat-box__label">${report.water.perDay}/DAY</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box__value" style="color:#22c55e">🍽️ ${report.food.perDay}</div>
                        <div class="stat-box__label">CAL/DAY</div>
                    </div>
                </div>
                
                ${analysis.criticalPoints.length > 0 ? `
                    <div class="section-label" style="margin-top:16px">⚠️ Critical Points (${analysis.criticalPoints.length})</div>
                    ${analysis.criticalPoints.map(cp => `
                        <div style="padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;margin-bottom:8px">
                            <div style="font-size:13px;font-weight:500;color:#ef4444">${cp.severity}: ${cp.location}</div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.5)">${cp.issue}</div>
                        </div>
                    `).join('')}
                ` : ''}
                
                <div class="divider"></div>
                
                <!-- What-If Scenarios -->
                <div class="section-label">What-If Scenarios</div>
                ${fuelCount > 0 ? `
                    <div id="scenario-results"></div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${waypoints.filter(w => w.type === 'fuel').map(w => `
                            <button class="btn btn--secondary" data-scenario-cache="${w.id}" style="text-align:left;justify-content:flex-start">
                                ⛽ What if "${w.name}" is empty?
                            </button>
                        `).join('')}
                    </div>
                ` : `
                    <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:10px;font-size:12px;color:rgba(255,255,255,0.5)">
                        Add fuel cache waypoints to enable scenario analysis
                    </div>
                `}
            ` : `
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('route')}</div>
                    <div class="empty-state__title">No Route Selected</div>
                    <div class="empty-state__desc">Create a route to analyze logistics</div>
                </div>
            `}
            
            <div class="divider"></div>
            
            <!-- Route Resources Summary -->
            <div class="section-label">Route Resources</div>
            <div class="list-item"><span class="list-item__label">💧 Water Sources</span><span class="list-item__value" style="color:#3b82f6">${waterCount}</span></div>
            <div class="list-item" style="margin-top:8px"><span class="list-item__label">⛽ Fuel Caches</span><span class="list-item__value" style="color:#f59e0b">${fuelCount}</span></div>
            <div class="list-item" style="margin-top:8px"><span class="list-item__label">🚁 Bail-out Points</span><span class="list-item__value" style="color:#ec4899">${bailCount}</span></div>
        `;
        
        // Event handlers
        container.querySelectorAll('[data-vehicle]').forEach(btn => {
            btn.onclick = () => {
                LogisticsModule.setConfig({ vehicle: btn.dataset.vehicle });
                renderLogistics();
            };
        });
        
        container.querySelector('#aux-fuel').onchange = (e) => {
            LogisticsModule.setConfig({ auxFuel: parseFloat(e.target.value) || 0 });
            renderLogistics();
        };
        
        container.querySelector('#hot-weather').onchange = (e) => {
            LogisticsModule.setConfig({ hotWeather: e.target.checked });
            renderLogistics();
        };
        
        container.querySelector('#add-personnel').onclick = () => {
            const current = LogisticsModule.getConfig().personnel;
            LogisticsModule.setConfig({ 
                personnel: [...current, { type: 'average_adult', count: 1 }] 
            });
            renderLogistics();
        };
        
        container.querySelectorAll('[data-personnel-type]').forEach(sel => {
            sel.onchange = (e) => {
                const idx = parseInt(sel.dataset.personnelType);
                const current = LogisticsModule.getConfig().personnel;
                current[idx] = { ...current[idx], type: e.target.value };
                LogisticsModule.setConfig({ personnel: current });
                renderLogistics();
            };
        });
        
        container.querySelectorAll('[data-personnel-count]').forEach(inp => {
            inp.onchange = (e) => {
                const idx = parseInt(inp.dataset.personnelCount);
                const current = LogisticsModule.getConfig().personnel;
                current[idx] = { ...current[idx], count: parseInt(e.target.value) || 1 };
                LogisticsModule.setConfig({ personnel: current });
                renderLogistics();
            };
        });
        
        container.querySelectorAll('[data-remove-personnel]').forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.removePersonnel);
                const current = LogisticsModule.getConfig().personnel;
                current.splice(idx, 1);
                LogisticsModule.setConfig({ personnel: current.length ? current : [{ type: 'fit_adult', count: 1 }] });
                renderLogistics();
            };
        });
        
        container.querySelectorAll('[data-scenario-cache]').forEach(btn => {
            btn.onclick = () => {
                const cacheId = btn.dataset.scenarioCache;
                const result = LogisticsModule.runScenario(routes[0], waypoints, {
                    type: 'cache_empty',
                    cacheId: cacheId
                });
                
                const resultsDiv = container.querySelector('#scenario-results');
                const cacheName = waypoints.find(w => w.id === cacheId)?.name || 'Cache';
                
                resultsDiv.innerHTML = `
                    <div style="padding:14px;background:${result.comparison.stillViable ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'};
                        border:1px solid ${result.comparison.stillViable ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};
                        border-radius:10px;margin-bottom:12px">
                        <div style="font-size:13px;font-weight:600;color:${result.comparison.stillViable ? '#22c55e' : '#ef4444'}">
                            ${result.comparison.stillViable ? '✓ Route still viable' : '✗ Route NOT viable'}
                        </div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:4px">
                            If "${cacheName}" is empty: +${result.comparison.fuelDifference.toFixed(1)} gal needed
                        </div>
                        ${result.comparison.newCriticalPoints.length > 0 ? `
                            <div style="font-size:11px;color:#ef4444;margin-top:4px">
                                ${result.comparison.newCriticalPoints.length} new critical point(s)
                            </div>
                        ` : ''}
                    </div>
                `;
            };
        });
    }

    async function renderOffline() {
        const regions = State.get('mapRegions') || [];
        const downloadedRegions = regions.filter(r => r.status === 'downloaded' || r.status === 'partial');
        const isDownloading = OfflineModule.isDownloadInProgress();
        const progress = OfflineModule.getDownloadProgress();
        const drawingState = OfflineModule.getDrawingState();
        
        // Get storage stats
        let storageStats = { usedFormatted: '...', quotaFormatted: '...', percentUsed: 0 };
        try {
            storageStats = await OfflineModule.getStorageStats();
        } catch (e) {
            console.warn('Failed to get storage stats:', e);
        }
        
        // Calculate total downloaded size from regions
        const totalDownloaded = downloadedRegions.reduce((sum, r) => sum + (r.estimatedSize || 0), 0);
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Offline Maps</h2>
            </div>
            
            <!-- Storage Usage -->
            <div class="storage-bar">
                <div class="storage-bar__header">
                    <span class="storage-bar__label">Storage Used</span>
                    <span class="storage-bar__value">${storageStats.usedFormatted}</span>
                </div>
                <div class="storage-bar__track">
                    <div class="storage-bar__fill" style="width:${Math.min(storageStats.percentUsed, 100)}%"></div>
                </div>
            </div>
            
            <!-- Download Progress (if active) -->
            ${isDownloading && progress ? `
                <div style="padding:14px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:12px;margin-bottom:16px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div>
                            <div style="font-size:13px;font-weight:500">Downloading "${progress.region?.name || 'Region'}"</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">${progress.downloaded.toLocaleString()} / ${progress.total.toLocaleString()} tiles</div>
                        </div>
                        <button class="btn btn--secondary" id="cancel-download" style="padding:6px 12px;font-size:11px">Cancel</button>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                        <div style="height:100%;width:${progress.progress}%;background:linear-gradient(90deg,#f97316,#ea580c);transition:width 0.3s"></div>
                    </div>
                    ${progress.errors > 0 ? `
                        <div style="margin-top:8px;font-size:11px;color:#ef4444">⚠️ ${progress.errors} tile(s) failed</div>
                    ` : ''}
                </div>
            ` : ''}
            
            <!-- Drawing Mode Banner -->
            ${drawingState.isDrawing ? `
                <div style="padding:14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:12px;margin-bottom:16px">
                    <div style="font-size:13px;font-weight:500;color:#3b82f6;margin-bottom:8px">✏️ Draw Region on Map</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:10px">
                        Click and drag on the map to select the area you want to download.
                    </div>
                    <button class="btn btn--secondary btn--full" id="cancel-drawing">Cancel Drawing</button>
                </div>
            ` : ''}
            
            <!-- Actions -->
            ${!drawingState.isDrawing && !isDownloading ? `
                <div style="display:flex;gap:8px;margin-bottom:20px">
                    <button class="btn btn--primary" id="draw-region" style="flex:1">
                        ${Icons.get('edit')} Draw Region
                    </button>
                    <button class="btn btn--secondary" id="download-view" style="flex:1">
                        ${Icons.get('download')} Current View
                    </button>
                </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <!-- Downloaded Regions -->
            <div class="section-label">Downloaded Regions (${downloadedRegions.length})</div>
            
            ${regions.length === 0 ? `
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('download')}</div>
                    <div class="empty-state__title">No Offline Maps</div>
                    <div class="empty-state__desc">Draw a region on the map or download the current view to use maps offline.</div>
                </div>
            ` : `
                <div class="panel__scroll" style="max-height:300px">
                    ${regions.map(r => {
                        const statusColors = {
                            downloaded: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', icon: 'check' },
                            partial: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', icon: 'alert' },
                            downloading: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', icon: 'download' },
                            queued: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', icon: 'clock' },
                            error: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', icon: 'alert' },
                            cancelled: { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', icon: 'close' }
                        };
                        const status = statusColors[r.status] || statusColors.cancelled;
                        
                        return `
                            <div class="card" style="margin-bottom:10px" data-region-id="${r.id}">
                                <div class="card__header">
                                    <div class="card__icon" style="background:${status.bg};color:${status.color}">
                                        ${Icons.get(status.icon)}
                                    </div>
                                    <div style="flex:1">
                                        <div class="card__title">${r.name}</div>
                                        <div class="card__subtitle">
                                            ${r.tileCount?.toLocaleString() || '?'} tiles • 
                                            ~${OfflineModule.formatSize(r.estimatedSize || 0)} • 
                                            z${r.minZoom}-${r.maxZoom}
                                        </div>
                                    </div>
                                    <button class="btn btn--secondary" data-delete-region="${r.id}" style="padding:6px" title="Delete">
                                        ${Icons.get('trash')}
                                    </button>
                                </div>
                                ${r.status === 'downloaded' || r.status === 'partial' ? `
                                    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,0.4)">
                                        <span>Layers: ${(r.layers || []).join(', ')}</span>
                                        <span>${r.lastSync ? 'Synced ' + new Date(r.lastSync).toLocaleDateString() : ''}</span>
                                    </div>
                                ` : ''}
                                ${r.status === 'partial' ? `
                                    <div style="margin-top:8px;font-size:11px;color:#f59e0b">
                                        ⚠️ ${r.failedTiles || 0} tiles failed to download
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
            
            <div class="divider"></div>
            
            <!-- Storage Management -->
            <div class="section-label">Storage Management</div>
            <div style="display:flex;flex-direction:column;gap:8px">
                <div class="list-item">
                    <span class="list-item__label">Cached Tiles</span>
                    <span class="list-item__value" style="color:#f97316">${storageStats.usedFormatted}</span>
                </div>
                <div class="list-item">
                    <span class="list-item__label">Downloaded Regions</span>
                    <span class="list-item__value">${downloadedRegions.length}</span>
                </div>
            </div>
            
            <button class="btn btn--secondary btn--full" id="clear-cache" style="margin-top:12px;color:#ef4444">
                ${Icons.get('trash')} Clear All Cached Tiles
            </button>
            
            <div class="divider"></div>
            
            <!-- Background Sync Status -->
            <div class="section-label">Background Sync</div>
            <div id="background-sync-status" style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px">
                <div style="font-size:12px;color:rgba(255,255,255,0.5)">Checking status...</div>
            </div>
        `;
        
        // Event handlers
        const drawRegionBtn = container.querySelector('#draw-region');
        if (drawRegionBtn) {
            drawRegionBtn.onclick = () => {
                OfflineModule.startDrawing((bounds) => {
                    showDownloadRegionModal(bounds);
                });
                renderOffline();
                ModalsModule.showToast('Click and drag on the map to select a region', 'info');
            };
        }
        
        const downloadViewBtn = container.querySelector('#download-view');
        if (downloadViewBtn) {
            downloadViewBtn.onclick = () => {
                const mapState = MapModule.getMapState();
                const canvas = document.getElementById('map-canvas');
                if (!canvas) return;
                
                const w = canvas.offsetWidth;
                const h = canvas.offsetHeight;
                const topLeft = MapModule.pixelToLatLon(0, 0);
                const bottomRight = MapModule.pixelToLatLon(w, h);
                
                const bounds = {
                    north: topLeft.lat,
                    south: bottomRight.lat,
                    west: topLeft.lon,
                    east: bottomRight.lon
                };
                
                showDownloadRegionModal(bounds);
            };
        }
        
        const cancelDrawingBtn = container.querySelector('#cancel-drawing');
        if (cancelDrawingBtn) {
            cancelDrawingBtn.onclick = () => {
                OfflineModule.cancelDrawing();
                renderOffline();
            };
        }
        
        const cancelDownloadBtn = container.querySelector('#cancel-download');
        if (cancelDownloadBtn) {
            cancelDownloadBtn.onclick = () => {
                OfflineModule.cancelDownload();
            };
        }
        
        // Delete region handlers
        container.querySelectorAll('[data-delete-region]').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const regionId = btn.dataset.deleteRegion;
                if (confirm('Delete this offline region? Cached tiles will be removed.')) {
                    try {
                        await OfflineModule.deleteRegion(regionId);
                        ModalsModule.showToast('Region deleted', 'success');
                        renderOffline();
                    } catch (err) {
                        ModalsModule.showToast('Failed to delete region: ' + err.message, 'error');
                    }
                }
            };
        });
        
        // Clear cache handler
        const clearCacheBtn = container.querySelector('#clear-cache');
        if (clearCacheBtn) {
            clearCacheBtn.onclick = async () => {
                if (confirm('Clear all cached map tiles? You will need to re-download regions for offline use.')) {
                    try {
                        await caches.delete('griddown-tiles-v1');
                        await Storage.Settings.set('offlineRegions', []);
                        State.set('mapRegions', []);
                        ModalsModule.showToast('Cache cleared', 'success');
                        renderOffline();
                    } catch (err) {
                        ModalsModule.showToast('Failed to clear cache: ' + err.message, 'error');
                    }
                }
            };
        }
        
        // Background sync status
        updateBackgroundSyncStatus();
    }
    
    /**
     * Update background sync status display
     */
    async function updateBackgroundSyncStatus() {
        const statusContainer = document.getElementById('background-sync-status');
        if (!statusContainer) return;
        
        try {
            const status = await OfflineModule.getBackgroundSyncStatus();
            
            let html = '';
            
            // Support status
            if (status.supported) {
                html += `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                        <span style="color:#22c55e">✓</span>
                        <span style="font-size:12px">Background sync supported</span>
                    </div>
                `;
            } else {
                html += `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                        <span style="color:#f59e0b">⚠️</span>
                        <span style="font-size:12px;color:rgba(255,255,255,0.5)">Background sync not available in this browser</span>
                    </div>
                `;
            }
            
            // Pending sync status
            if (status.hasPendingSync) {
                html += `
                    <div style="padding:12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:8px;margin-bottom:10px">
                        <div style="font-size:13px;font-weight:500;margin-bottom:6px">
                            📥 Background download in progress
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                            "${status.regionName}" - ${status.downloadedCount.toLocaleString()} / ${status.totalTiles.toLocaleString()} tiles (${status.progress}%)
                        </div>
                        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-bottom:10px">
                            <div style="height:100%;width:${status.progress}%;background:#f97316;transition:width 0.3s"></div>
                        </div>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn--secondary" id="resume-sync" style="flex:1;padding:8px;font-size:11px">
                                ▶️ Resume
                            </button>
                            <button class="btn btn--secondary" id="cancel-sync" style="flex:1;padding:8px;font-size:11px;color:#ef4444">
                                ✕ Cancel
                            </button>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="font-size:12px;color:rgba(255,255,255,0.4)">
                        No background downloads pending
                    </div>
                `;
            }
            
            // Periodic sync option (if supported)
            if (status.periodicSupported) {
                html += `
                    <div style="margin-top:10px">
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
                            <input type="checkbox" id="periodic-sync-toggle" style="width:auto;accent-color:#f97316">
                            <span style="font-size:12px">Auto-refresh tiles daily</span>
                        </label>
                    </div>
                `;
            }
            
            statusContainer.innerHTML = html;
            
            // Attach event handlers
            const resumeBtn = statusContainer.querySelector('#resume-sync');
            if (resumeBtn) {
                resumeBtn.onclick = async () => {
                    const result = await OfflineModule.resumeBackgroundDownload();
                    if (result.success) {
                        ModalsModule.showToast('Background download resumed', 'success');
                    } else {
                        ModalsModule.showToast(result.reason || 'Failed to resume', 'error');
                    }
                    updateBackgroundSyncStatus();
                };
            }
            
            const cancelBtn = statusContainer.querySelector('#cancel-sync');
            if (cancelBtn) {
                cancelBtn.onclick = async () => {
                    if (confirm('Cancel background download?')) {
                        await OfflineModule.cancelBackgroundDownload();
                        ModalsModule.showToast('Background download cancelled', 'info');
                        renderOffline();
                    }
                };
            }
            
        } catch (err) {
            console.error('Error updating sync status:', err);
            statusContainer.innerHTML = `
                <div style="font-size:12px;color:rgba(255,255,255,0.4)">
                    Unable to check sync status
                </div>
            `;
        }
    }
    
    /**
     * Show download configuration modal for a region
     */
    function showDownloadRegionModal(bounds) {
        const modalContainer = document.getElementById('modal-container');
        
        // Default settings
        const defaultMinZoom = 10;
        const defaultMaxZoom = 14;
        const defaultLayers = ['standard'];
        
        // Get initial preview
        const preview = OfflineModule.getDownloadPreview(bounds, defaultMinZoom, defaultMaxZoom, defaultLayers);
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">Download Region</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <!-- Region bounds preview -->
                        <div style="padding:12px;background:rgba(249,115,22,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                            <div style="color:rgba(255,255,255,0.5);margin-bottom:4px">Selected Area</div>
                            <div style="font-family:monospace">
                                ${bounds.north.toFixed(4)}°N to ${bounds.south.toFixed(4)}°N<br>
                                ${bounds.west.toFixed(4)}°W to ${bounds.east.toFixed(4)}°W
                            </div>
                        </div>
                        
                        <!-- Region name -->
                        <div class="form-group">
                            <label>Region Name</label>
                            <input type="text" id="region-name" placeholder="e.g., Sierra Nevada" value="">
                        </div>
                        
                        <!-- Zoom levels -->
                        <div class="form-group">
                            <label>Zoom Levels</label>
                            <div style="display:flex;gap:10px;align-items:center">
                                <select id="min-zoom" style="flex:1">
                                    ${[8,9,10,11,12].map(z => `
                                        <option value="${z}" ${z === defaultMinZoom ? 'selected' : ''}>
                                            ${z} ${z <= 9 ? '(Overview)' : z <= 10 ? '(Region)' : '(Detail)'}
                                        </option>
                                    `).join('')}
                                </select>
                                <span style="color:rgba(255,255,255,0.4)">to</span>
                                <select id="max-zoom" style="flex:1">
                                    ${[12,13,14,15,16].map(z => `
                                        <option value="${z}" ${z === defaultMaxZoom ? 'selected' : ''}>
                                            ${z} ${z <= 13 ? '(Streets)' : z <= 14 ? '(Buildings)' : '(Max)'}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <!-- Map layers -->
                        <div class="form-group">
                            <label>Map Layers</label>
                            
                            <!-- General Maps -->
                            <div style="margin-bottom:12px">
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">🗺️ GENERAL</div>
                                <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px">
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-standard" checked style="width:auto">
                                        <span>OpenStreetMap ~15KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-terrain" style="width:auto">
                                        <span>OpenTopoMap ~25KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-satellite" style="width:auto">
                                        <span>Satellite (Esri) ~40KB/tile</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- USGS -->
                            <div style="margin-bottom:12px">
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">🏔️ USGS</div>
                                <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px">
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-usgs_topo" style="width:auto">
                                        <span>USGS Topo ~30KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-usgs_imagery" style="width:auto">
                                        <span>USGS Imagery ~45KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-usgs_hydro" style="width:auto">
                                        <span>USGS Hydro (water) ~10KB/tile</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- USFS / Topo -->
                            <div style="margin-bottom:12px">
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">🌲 USFS / Topo Maps</div>
                                <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px">
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-usfs_topo" style="width:auto">
                                        <span>USA Topo ~40KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-world_topo" style="width:auto">
                                        <span>World Topo ~35KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-natgeo" style="width:auto">
                                        <span>Nat Geo ~40KB/tile</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- BLM -->
                            <div style="margin-bottom:12px">
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">🏜️ BLM</div>
                                <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px">
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-blm_surface" style="width:auto">
                                        <span>Land Ownership ~15KB/tile</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- Overlays -->
                            <div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">📍 OVERLAYS</div>
                                <div style="display:flex;flex-direction:column;gap:6px;padding-left:8px">
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-hillshade" style="width:auto">
                                        <span>Hillshade ~20KB/tile</span>
                                    </label>
                                    <label class="checkbox-field" style="margin:0;padding:8px 12px">
                                        <input type="checkbox" id="layer-labels" style="width:auto">
                                        <span>Labels ~5KB/tile</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Download preview -->
                        <div style="padding:14px;background:rgba(0,0,0,0.2);border-radius:10px;margin-top:16px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span style="color:rgba(255,255,255,0.5)">Total Tiles</span>
                                <span id="preview-tiles" style="font-weight:600">${preview.totalTiles.toLocaleString()}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between">
                                <span style="color:rgba(255,255,255,0.5)">Est. Size</span>
                                <span id="preview-size" style="font-weight:600;color:#f97316">${preview.estimatedSize}</span>
                            </div>
                        </div>
                        
                        <div id="size-warning" style="display:${preview.estimatedSizeKB > 500000 ? 'block' : 'none'};margin-top:12px;padding:10px;background:rgba(239,68,68,0.1);border-radius:8px;font-size:12px;color:#ef4444">
                            ⚠️ Large download. Consider reducing zoom levels or selecting a smaller area.
                        </div>
                        
                        <!-- Background sync option -->
                        <div id="background-sync-option" style="margin-top:16px;padding:14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:10px">
                            <label class="checkbox-field" style="margin:0">
                                <input type="checkbox" id="use-background-sync" style="width:auto" checked>
                                <span>Download in background</span>
                            </label>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:6px;margin-left:24px">
                                Download continues even if you close the app
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-download">${Icons.get('download')} Download</button>
                    </div>
                </div>
            </div>
        `;
        
        // Check background sync support and update UI
        (async () => {
            const syncStatus = await OfflineModule.getBackgroundSyncStatus();
            const syncOption = document.getElementById('background-sync-option');
            const syncCheckbox = document.getElementById('use-background-sync');
            
            if (!syncStatus.supported) {
                syncOption.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="color:#f59e0b">⚠️</span>
                        <span style="font-size:12px;color:rgba(255,255,255,0.5)">
                            Background sync not available in this browser. 
                            Download will run in foreground.
                        </span>
                    </div>
                `;
            }
        })();
        
        // All available layer keys
        const allLayerKeys = [
            'standard', 'terrain', 'satellite',
            'usgs_topo', 'usgs_imagery', 'usgs_hydro',
            'usfs_topo', 'world_topo', 'natgeo',
            'blm_surface',
            'hillshade', 'labels'
        ];
        
        // Helper to get selected layers
        const getSelectedLayers = () => {
            const layers = [];
            allLayerKeys.forEach(key => {
                const checkbox = document.getElementById(`layer-${key}`);
                if (checkbox && checkbox.checked) {
                    layers.push(key);
                }
            });
            return layers.length > 0 ? layers : ['standard'];
        };
        
        // Update preview when options change
        const updatePreview = () => {
            const minZoom = parseInt(document.getElementById('min-zoom').value);
            const maxZoom = parseInt(document.getElementById('max-zoom').value);
            const layers = getSelectedLayers();
            
            const newPreview = OfflineModule.getDownloadPreview(bounds, minZoom, maxZoom, layers);
            document.getElementById('preview-tiles').textContent = newPreview.totalTiles.toLocaleString();
            document.getElementById('preview-size').textContent = newPreview.estimatedSize;
            document.getElementById('size-warning').style.display = newPreview.estimatedSizeKB > 500000 ? 'block' : 'none';
        };
        
        // Attach change handlers to all layer checkboxes
        document.getElementById('min-zoom').onchange = updatePreview;
        document.getElementById('max-zoom').onchange = updatePreview;
        allLayerKeys.forEach(key => {
            const checkbox = document.getElementById(`layer-${key}`);
            if (checkbox) checkbox.onchange = updatePreview;
        });
        
        // Close modal
        const closeModal = () => { modalContainer.innerHTML = ''; };
        document.getElementById('modal-close').onclick = closeModal;
        document.getElementById('modal-cancel').onclick = closeModal;
        document.getElementById('modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Start download
        document.getElementById('modal-download').onclick = async () => {
            const name = document.getElementById('region-name').value || `Region ${new Date().toLocaleDateString()}`;
            const minZoom = parseInt(document.getElementById('min-zoom').value);
            const maxZoom = parseInt(document.getElementById('max-zoom').value);
            const layers = getSelectedLayers();
            
            if (layers.length === 0) {
                ModalsModule.showToast('Select at least one map layer', 'error');
                return;
            }
            
            const regionConfig = { name, bounds, minZoom, maxZoom, layers };
            const useBackgroundSync = document.getElementById('use-background-sync')?.checked;
            
            closeModal();
            
            // Try background sync first if enabled
            if (useBackgroundSync && OfflineModule.isBackgroundSyncSupported()) {
                try {
                    const result = await OfflineModule.queueBackgroundDownload(regionConfig);
                    
                    if (result.supported) {
                        ModalsModule.showToast(`Downloading ${result.tileCount.toLocaleString()} tiles in background`, 'success');
                        renderOffline();
                        return;
                    }
                } catch (err) {
                    console.warn('Background sync failed, falling back to foreground:', err);
                }
            }
            
            // Foreground download (fallback or explicitly selected)
            try {
                await OfflineModule.downloadRegion(regionConfig, (progress) => {
                    // Update panel every 2% or on completion
                    if (progress.phase === 'complete' || progress.phase === 'cancelled' || progress.progress % 2 === 0) {
                        renderOffline();
                    }
                });
                
                ModalsModule.showToast('Download complete!', 'success');
            } catch (err) {
                if (err.message !== 'Download cancelled') {
                    ModalsModule.showToast('Download failed: ' + err.message, 'error');
                }
            }
            
            renderOffline();
        };
    }

    // ==================== APRS Helper Functions ====================
    
    /**
     * Get APRS station count
     */
    function getAPRSStationCount() {
        if (typeof APRSModule === 'undefined') return 0;
        return APRSModule.getStations().length;
    }
    
    /**
     * Render APRS section for Team panel
     */
    function renderAPRSSection() {
        if (typeof APRSModule === 'undefined') {
            return `
                <div class="section-label">📻 APRS (VHF Radio)</div>
                <div style="padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:16px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center">
                        APRS module not loaded
                    </div>
                </div>
            `;
        }
        
        const isConnected = APRSModule.isConnected();
        const isConnecting = APRSModule.isConnecting();
        const stations = APRSModule.getStations();
        const stats = APRSModule.getStats();
        const config = {
            callsign: APRSModule.getCallsign(),
            beaconEnabled: APRSModule.isBeaconEnabled(),
            beaconInterval: APRSModule.getBeaconInterval(),
            smartBeaconing: APRSModule.isSmartBeaconing()
        };
        
        // Check for Web Bluetooth support
        const hasBluetooth = 'bluetooth' in navigator;
        
        return `
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                📻 APRS (VHF Radio)
                <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">144.390 MHz • Long range</span>
            </div>
            
            <!-- APRS Connection Card -->
            <div style="padding:14px;background:${isConnected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${isConnected ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:12px;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:${isConnected ? '12px' : '0'}">
                    <div style="width:40px;height:40px;border-radius:10px;background:${isConnected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center">
                        <span style="font-size:20px">${isConnected ? '📻' : isConnecting ? '⏳' : '📴'}</span>
                    </div>
                    <div style="flex:1">
                        <div style="font-size:14px;font-weight:600;color:${isConnected ? '#3b82f6' : 'inherit'}">
                            ${isConnected ? 'TNC Connected' : isConnecting ? 'Connecting...' : 'TNC Not Connected'}
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                            ${isConnected 
                                ? `${stats.packetsReceived} pkts received • ${stations.length} stations` 
                                : hasBluetooth 
                                    ? 'Connect Bluetooth TNC (Mobilinkd)' 
                                    : 'Web Bluetooth not supported'}
                        </div>
                    </div>
                </div>
                
                ${isConnected ? `
                    <!-- Connected Actions -->
                    <div style="display:flex;gap:8px;margin-bottom:12px">
                        <button class="btn btn--secondary aprs-beacon-btn" style="flex:1;font-size:12px;padding:8px;${config.beaconEnabled ? 'background:rgba(59,130,246,0.2);border-color:rgba(59,130,246,0.3)' : ''}">
                            ${config.beaconEnabled ? '⏸️ Stop Beacon' : '▶️ Start Beacon'}
                        </button>
                        <button class="btn btn--secondary aprs-send-beacon-btn" style="font-size:12px;padding:8px">
                            📍 Send Now
                        </button>
                        <button class="btn btn--secondary aprs-disconnect-btn" style="font-size:12px;padding:8px;color:#ef4444">
                            ✕
                        </button>
                    </div>
                    
                    <!-- Beacon Status -->
                    ${config.beaconEnabled ? `
                        <div style="padding:8px;background:rgba(59,130,246,0.1);border-radius:6px;font-size:11px;color:rgba(255,255,255,0.6)">
                            🔄 Beaconing as <strong>${config.callsign || 'NO CALL'}</strong> 
                            every ${config.smartBeaconing ? 'smart' : config.beaconInterval + 's'}
                        </div>
                    ` : ''}
                ` : `
                    <!-- Not Connected -->
                    ${!isConnecting ? `
                        <!-- Callsign Configuration -->
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:12px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:8px">YOUR CALLSIGN (Required for TX)</div>
                            <div style="display:flex;gap:8px">
                                <input type="text" id="aprs-callsign" placeholder="W1ABC" value="${config.callsign.split('-')[0] || ''}" 
                                    style="flex:2;padding:8px;font-size:13px;text-transform:uppercase" maxlength="6">
                                <select id="aprs-ssid" style="flex:1;padding:8px;font-size:12px">
                                    <option value="0" ${config.callsign.endsWith('-0') || !config.callsign.includes('-') ? 'selected' : ''}>-0 (Fixed)</option>
                                    <option value="1" ${config.callsign.endsWith('-1') ? 'selected' : ''}>-1 (Digi)</option>
                                    <option value="5" ${config.callsign.endsWith('-5') ? 'selected' : ''}>-5 (Phone)</option>
                                    <option value="7" ${config.callsign.endsWith('-7') ? 'selected' : ''}>-7 (HT)</option>
                                    <option value="9" ${config.callsign.endsWith('-9') ? 'selected' : ''}>-9 (Mobile)</option>
                                    <option value="10" ${config.callsign.endsWith('-10') ? 'selected' : ''}>-10 (Net)</option>
                                    <option value="14" ${config.callsign.endsWith('-14') ? 'selected' : ''}>-14 (Truck)</option>
                                </select>
                            </div>
                        </div>
                        
                        <!-- Connect Button -->
                        <button class="btn btn--primary btn--full aprs-connect-btn" ${!hasBluetooth ? 'disabled' : ''}>
                            ${Icons.get('satellite')} Connect Bluetooth TNC
                        </button>
                        
                        ${!hasBluetooth ? `
                            <div style="margin-top:8px;padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:12px;color:#ef4444">
                                ⚠️ Web Bluetooth requires Chrome or Edge
                            </div>
                        ` : `
                            <div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                                Supports Mobilinkd TNC3/TNC4 and compatible devices
                            </div>
                        `}
                    ` : ''}
                `}
            </div>
            
            <!-- APRS Stations List (if any) -->
            ${stations.length > 0 ? `
                <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                    <span>📡 APRS Stations (${stations.length})</span>
                    <button class="btn btn--secondary aprs-clear-stations-btn" style="padding:4px 8px;font-size:10px">Clear</button>
                </div>
                <div style="max-height:200px;overflow-y:auto;margin-bottom:12px">
                    ${(() => {
                        // Get current GPS or manual position for distance calculations
                        let myPos = null;
                        if (typeof GPSModule !== 'undefined') {
                            const gpsPos = GPSModule.getPosition();
                            if (gpsPos && gpsPos.lat && gpsPos.lon) {
                                myPos = { lat: gpsPos.lat, lon: gpsPos.lon };
                            }
                        }
                        
                        // Get stations with distance info (sorted by distance if GPS available)
                        const stationsWithDist = myPos ? APRSModule.getStationsWithDistance(myPos) : stations;
                        
                        return stationsWithDist.slice(0, 25).map(station => {
                            const symbolInfo = APRSModule.getSymbolInfo(station.symbol);
                            const age = Date.now() - station.lastHeard;
                            const ageStr = age < 60000 ? 'now' : 
                                          age < 3600000 ? Math.floor(age/60000) + 'm ago' : 
                                          Math.floor(age/3600000) + 'h ago';
                            const isFresh = age < 3600000;
                            
                            // Get distance info (either from sorted list or calculate)
                            let distInfo = station.distanceInfo;
                            if (!distInfo && myPos && station.lat && station.lon) {
                                distInfo = APRSModule.getDistanceToStation(station.callsign, myPos);
                            }
                            
                            return `
                                <div class="card" style="margin-bottom:6px;padding:10px;opacity:${isFresh ? 1 : 0.6}" data-aprs-station="${station.callsign}">
                                    <div style="display:flex;align-items:center;gap:10px">
                                        <div style="width:36px;height:36px;border-radius:10px;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                                            <span style="font-size:18px">${symbolInfo.icon}</span>
                                        </div>
                                        <div style="flex:1;min-width:0">
                                            <div style="display:flex;align-items:center;gap:6px">
                                                <span style="font-size:13px;font-weight:600;font-family:'IBM Plex Mono',monospace">${station.callsign}</span>
                                                ${station.speed && station.speed > 2 ? `<span style="font-size:10px;color:#3b82f6">${Math.round(station.speed)} mph</span>` : ''}
                                            </div>
                                            <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:2px">
                                                ${symbolInfo.name} • ${ageStr}
                                            </div>
                                            ${station.status ? `
                                                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                                    "${station.status.slice(0, 40)}"
                                                </div>
                                            ` : ''}
                                        </div>
                                        ${distInfo ? `
                                            <div style="text-align:right;flex-shrink:0">
                                                <div style="font-size:14px;font-weight:600;color:#3b82f6">${distInfo.formatted}</div>
                                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">${distInfo.compass} (${Math.round(distInfo.bearing)}°)</div>
                                            </div>
                                        ` : ''}
                                        ${station.lat && station.lon ? `
                                            <button class="btn btn--secondary" data-goto-aprs="${station.callsign}" style="padding:6px 8px;font-size:11px;margin-left:4px" title="Go to location">🎯</button>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('');
                    })()}
                    ${stations.length > 25 ? `
                        <div style="padding:8px;text-align:center;font-size:11px;color:rgba(255,255,255,0.4)">
                            +${stations.length - 25} more stations
                        </div>
                    ` : ''}
                </div>
                ${(() => {
                    // GPS status message for distance display
                    let myPos = null;
                    if (typeof GPSModule !== 'undefined') {
                        const gpsPos = GPSModule.getPosition();
                        if (gpsPos && gpsPos.lat && gpsPos.lon) {
                            myPos = gpsPos;
                        }
                    }
                    if (!myPos) {
                        return `
                            <div style="padding:8px;background:rgba(59,130,246,0.1);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.5);text-align:center;margin-bottom:12px">
                                📍 Enable GPS or set manual position to see distance/bearing to stations
                            </div>
                        `;
                    }
                    return '';
                })()}
            ` : ''}
            
            <!-- APRS Info Box (collapsed by default) -->
            <details style="margin-bottom:12px">
                <summary style="cursor:pointer;font-size:11px;color:rgba(255,255,255,0.5);padding:8px;background:rgba(255,255,255,0.03);border-radius:8px">
                    ℹ️ What is APRS?
                </summary>
                <div style="padding:10px;font-size:11px;color:rgba(255,255,255,0.5);line-height:1.5">
                    <p style="margin-bottom:8px"><strong>APRS</strong> (Automatic Packet Reporting System) is a digital communications protocol used by amateur radio operators.</p>
                    <p style="margin-bottom:8px">• Operates on VHF (144.390 MHz in North America)</p>
                    <p style="margin-bottom:8px">• Range: 50+ miles with digipeaters</p>
                    <p style="margin-bottom:8px">• Requires ham radio license to transmit</p>
                    <p>• Works completely offline - no internet needed</p>
                </div>
            </details>
        `;
    }
    
    /**
     * Attach APRS event handlers
     */
    function attachAPRSHandlers() {
        if (typeof APRSModule === 'undefined') return;
        
        // Connect button
        const connectBtn = container.querySelector('.aprs-connect-btn');
        if (connectBtn) {
            connectBtn.onclick = async () => {
                try {
                    // Save callsign first
                    const callsign = container.querySelector('#aprs-callsign')?.value || '';
                    const ssid = container.querySelector('#aprs-ssid')?.value || '9';
                    if (callsign) {
                        APRSModule.setCallsign(callsign, parseInt(ssid));
                    }
                    
                    await APRSModule.connectBluetooth();
                    ModalsModule.showToast('Connected to APRS TNC', 'success');
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('APRS connection failed: ' + err.message, 'error');
                    renderTeam();
                }
            };
        }
        
        // Disconnect button
        const disconnectBtn = container.querySelector('.aprs-disconnect-btn');
        if (disconnectBtn) {
            disconnectBtn.onclick = () => {
                APRSModule.disconnect();
                ModalsModule.showToast('Disconnected from APRS TNC', 'info');
                renderTeam();
            };
        }
        
        // Toggle beacon
        const beaconBtn = container.querySelector('.aprs-beacon-btn');
        if (beaconBtn) {
            beaconBtn.onclick = () => {
                const enabled = APRSModule.isBeaconEnabled();
                APRSModule.setBeaconEnabled(!enabled);
                ModalsModule.showToast(enabled ? 'Beacon stopped' : 'Beacon started', 'info');
                renderTeam();
            };
        }
        
        // Send beacon now
        const sendBeaconBtn = container.querySelector('.aprs-send-beacon-btn');
        if (sendBeaconBtn) {
            sendBeaconBtn.onclick = async () => {
                try {
                    await APRSModule.sendBeacon(true);
                    ModalsModule.showToast('Position beacon sent', 'success');
                } catch (err) {
                    ModalsModule.showToast('Beacon failed: ' + err.message, 'error');
                }
            };
        }
        
        // Clear stations
        const clearBtn = container.querySelector('.aprs-clear-stations-btn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                APRSModule.clearStations();
                ModalsModule.showToast('APRS stations cleared', 'info');
                renderTeam();
            };
        }
        
        // Go to APRS station
        container.querySelectorAll('[data-goto-aprs]').forEach(btn => {
            btn.onclick = () => {
                const station = APRSModule.getStation(btn.dataset.gotoAprs);
                if (station && station.lat && station.lon && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(station.lat, station.lon, 15);
                    ModalsModule.showToast(`Centered on ${station.callsign}`, 'info');
                }
            };
        });
    }

    // ==================== Position Helper Functions ====================

    /**
     * Render Position section for Team panel
     * Supports GPS (internal/external) and manual position entry
     */
    function renderPositionSection() {
        if (typeof GPSModule === 'undefined') {
            return `
                <div class="section-label">📍 My Position</div>
                <div style="padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:16px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center">
                        GPS module not loaded
                    </div>
                </div>
            `;
        }
        
        const gpsState = GPSModule.getState();
        const currentPos = GPSModule.getPosition();
        const isGPSActive = GPSModule.isActive();
        const isUsingManual = GPSModule.isUsingManualPosition();
        const positionSource = GPSModule.getPositionSource();
        
        // Format current position for display
        let positionDisplay = 'No position set';
        let positionColor = 'rgba(255,255,255,0.4)';
        
        if (currentPos) {
            if (typeof Coordinates !== 'undefined') {
                positionDisplay = Coordinates.format(currentPos.lat, currentPos.lon);
            } else {
                positionDisplay = `${currentPos.lat.toFixed(6)}, ${currentPos.lon.toFixed(6)}`;
            }
            positionColor = isUsingManual ? '#a855f7' : '#22c55e';  // Purple for manual, green for GPS
        }
        
        // Source indicator
        const sourceIcon = isUsingManual ? '📌' : (isGPSActive ? '🛰️' : '📍');
        
        return `
            <div style="margin-bottom:20px">
                <div class="section-label" style="display:flex;align-items:center;gap:8px">
                    📍 My Position
                </div>
                
                <!-- Compact Position Card -->
                <div style="padding:12px;background:${currentPos ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.03)'};border:1px solid ${currentPos ? (isUsingManual ? 'rgba(168,85,247,0.3)' : 'rgba(34,197,94,0.3)') : 'rgba(255,255,255,0.1)'};border-radius:12px">
                    
                    <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:36px;height:36px;border-radius:8px;background:${currentPos ? (isUsingManual ? 'rgba(168,85,247,0.2)' : 'rgba(34,197,94,0.2)') : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center">
                            <span style="font-size:18px">${sourceIcon}</span>
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="font-size:12px;font-weight:600;color:${positionColor};font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                                ${positionDisplay}
                            </div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                ${positionSource !== 'none' ? positionSource : 'Not set'}
                                ${gpsState.accuracy ? ` • ±${Math.round(gpsState.accuracy)}m` : ''}
                            </div>
                        </div>
                        ${currentPos ? `
                            <button class="btn btn--secondary position-center-btn" style="font-size:11px;padding:6px 8px" title="Center map">
                                🎯
                            </button>
                        ` : ''}
                    </div>
                    
                    <!-- Quick Actions -->
                    <div style="display:flex;gap:6px;margin-top:10px">
                        ${!currentPos ? `
                            <button class="btn btn--primary position-goto-gps-btn" style="flex:1;font-size:11px;padding:6px">
                                ⚙️ Set Position in GPS Panel
                            </button>
                        ` : `
                            <button class="btn btn--secondary position-goto-gps-btn" style="flex:1;font-size:11px;padding:6px">
                                ⚙️ GPS Settings
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach Position section event handlers (simplified for Team panel)
     */
    function attachPositionHandlers() {
        if (typeof GPSModule === 'undefined') return;
        
        // Center map button
        const centerBtn = container.querySelector('.position-center-btn');
        if (centerBtn) {
            centerBtn.onclick = () => {
                const pos = GPSModule.getPosition();
                if (pos && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(pos.lat, pos.lon);
                }
            };
        }
        
        // Go to GPS panel button
        const gotoGpsBtn = container.querySelector('.position-goto-gps-btn');
        if (gotoGpsBtn) {
            gotoGpsBtn.onclick = () => {
                // Switch to GPS panel
                State.set('activePanel', 'gps');
                render();
            };
        }
    }

    /**
     * Open manual position entry modal
     */
    function openManualPositionModal() {
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        
        const currentManual = typeof GPSModule !== 'undefined' ? GPSModule.getManualPosition() : null;
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px;width:90%">
                    <div class="modal__header">
                        <h3 class="modal__title">📌 Set Manual Position</h3>
                        <button class="modal__close" id="modal-close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:16px">
                            Enter coordinates in any format: Decimal Degrees (37.4215, -119.1892), 
                            DMS (37° 25' 17.4" N, 119° 11' 21.1" W), UTM, or MGRS.
                        </p>
                        
                        <!-- Coordinate Input -->
                        <div style="margin-bottom:16px">
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;display:block">Coordinates</label>
                            <input type="text" id="manual-position-input" 
                                placeholder="e.g., 37.4215, -119.1892"
                                value="${currentManual ? `${currentManual.lat}, ${currentManual.lon}` : ''}"
                                style="width:100%;padding:12px;font-size:14px;font-family:monospace;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;box-sizing:border-box">
                        </div>
                        
                        <!-- Quick Examples -->
                        <div style="margin-bottom:16px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">SUPPORTED FORMATS</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px">
                                <button class="btn btn--secondary manual-pos-example" data-example="37.4215, -119.1892" style="font-size:10px;padding:4px 8px">DD</button>
                                <button class="btn btn--secondary manual-pos-example" data-example="37° 25' 17.4&quot; N, 119° 11' 21.1&quot; W" style="font-size:10px;padding:4px 8px">DMS</button>
                                <button class="btn btn--secondary manual-pos-example" data-example="11S 318234 4143234" style="font-size:10px;padding:4px 8px">UTM</button>
                                <button class="btn btn--secondary manual-pos-example" data-example="11SLA1823443234" style="font-size:10px;padding:4px 8px">MGRS</button>
                            </div>
                        </div>
                        
                        <!-- Optional Name -->
                        <div style="margin-bottom:16px">
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;display:block">Location Name (optional)</label>
                            <input type="text" id="manual-position-name" 
                                placeholder="e.g., Base Camp, Observation Post"
                                value="${currentManual?.name || ''}"
                                style="width:100%;padding:10px;font-size:13px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;box-sizing:border-box">
                        </div>
                        
                        <!-- Optional Altitude -->
                        <div style="margin-bottom:20px">
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:4px;display:block">Altitude in meters (optional)</label>
                            <input type="number" id="manual-position-altitude" 
                                placeholder="e.g., 1500"
                                value="${currentManual?.altitude || ''}"
                                style="width:100%;padding:10px;font-size:13px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;box-sizing:border-box">
                        </div>
                        
                        <!-- Parse Preview -->
                        <div id="manual-position-preview" style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px;min-height:40px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">Enter coordinates to preview...</div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="manual-position-save-btn">📌 Set Position</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        // Close handlers
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Setup event handlers
        const input = document.getElementById('manual-position-input');
        const preview = document.getElementById('manual-position-preview');
        const saveBtn = document.getElementById('manual-position-save-btn');
        
        // Live preview of coordinate parsing
        if (input && preview) {
            const updatePreview = () => {
                const value = input.value.trim();
                if (!value) {
                    preview.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,0.4)">Enter coordinates to preview...</div>';
                    return;
                }
                
                if (typeof Coordinates !== 'undefined') {
                    const parsed = Coordinates.parse(value);
                    if (parsed) {
                        preview.innerHTML = `
                            <div style="font-size:11px;color:#22c55e;margin-bottom:4px">✓ Valid coordinates detected</div>
                            <div style="font-size:13px;font-family:monospace;color:white">${parsed.lat.toFixed(6)}, ${parsed.lon.toFixed(6)}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">${Coordinates.toDD(parsed.lat, parsed.lon)}</div>
                        `;
                    } else {
                        preview.innerHTML = '<div style="font-size:11px;color:#ef4444">✗ Could not parse coordinates</div>';
                    }
                } else {
                    // Fallback: try simple decimal parsing
                    const match = value.match(/^([-\d.]+)[,\s]+([-\d.]+)$/);
                    if (match) {
                        const lat = parseFloat(match[1]);
                        const lon = parseFloat(match[2]);
                        if (!isNaN(lat) && !isNaN(lon)) {
                            preview.innerHTML = `
                                <div style="font-size:11px;color:#22c55e;margin-bottom:4px">✓ Valid coordinates</div>
                                <div style="font-size:13px;font-family:monospace;color:white">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
                            `;
                        } else {
                            preview.innerHTML = '<div style="font-size:11px;color:#ef4444">✗ Invalid coordinates</div>';
                        }
                    } else {
                        preview.innerHTML = '<div style="font-size:11px;color:#ef4444">✗ Could not parse coordinates</div>';
                    }
                }
            };
            
            input.addEventListener('input', updatePreview);
            updatePreview();  // Initial preview if value exists
        }
        
        // Example buttons
        modalContainer.querySelectorAll('.manual-pos-example').forEach(btn => {
            btn.onclick = () => {
                if (input) {
                    input.value = btn.dataset.example;
                    input.dispatchEvent(new Event('input'));
                }
            };
        });
        
        // Save button
        if (saveBtn) {
            saveBtn.onclick = () => {
                const coordInput = document.getElementById('manual-position-input');
                const nameInput = document.getElementById('manual-position-name');
                const altInput = document.getElementById('manual-position-altitude');
                
                if (!coordInput || !coordInput.value.trim()) {
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Please enter coordinates', 'error');
                    }
                    return;
                }
                
                const options = {};
                if (nameInput && nameInput.value.trim()) {
                    options.name = nameInput.value.trim();
                }
                if (altInput && altInput.value) {
                    options.altitude = parseFloat(altInput.value);
                }
                
                let success = false;
                if (typeof GPSModule !== 'undefined') {
                    success = GPSModule.setManualPositionFromString(coordInput.value, options);
                }
                
                if (success) {
                    closeModal();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Manual position set', 'success');
                    }
                    
                    // Re-render appropriate panel
                    if (State.get('activePanel') === 'gps') {
                        renderGPS();
                    } else {
                        renderTeam();
                    }
                    
                    // Center map on new position
                    const pos = GPSModule.getPosition();
                    if (pos && typeof MapModule !== 'undefined') {
                        MapModule.setCenter(pos.lat, pos.lon);
                        MapModule.render();
                    }
                } else {
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Could not parse coordinates. Check format.', 'error');
                    }
                }
            };
        }
        
        // Focus input
        if (input) input.focus();
    }

    // ==================== RadiaCode Helper Functions ====================

    /**
     * Render RadiaCode section for Team panel
     */
    function renderRadiaCodeSection() {
        if (typeof RadiaCodeModule === 'undefined') {
            return `
                <div class="section-label">☢️ RadiaCode (Radiation)</div>
                <div style="padding:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:16px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center">
                        RadiaCode module not loaded
                    </div>
                </div>
            `;
        }
        
        const isConnected = RadiaCodeModule.isConnected();
        const isConnecting = RadiaCodeModule.isConnecting();
        const isDemoMode = RadiaCodeModule.isDemoMode();
        const reading = RadiaCodeModule.getCurrentReading();
        const deviceInfo = RadiaCodeModule.getDeviceInfo();
        const alertLevel = RadiaCodeModule.getAlertLevel();
        const isRecording = RadiaCodeModule.isRecording();
        const tracks = RadiaCodeModule.getTracks();
        const stats = RadiaCodeModule.getStats();
        
        // Check for Web Bluetooth support
        const hasBluetooth = 'bluetooth' in navigator;
        
        // Get alert color
        const alertColors = {
            normal: '#22c55e',
            elevated: '#eab308',
            warning: '#f97316',
            alarm: '#ef4444'
        };
        const alertColor = alertColors[alertLevel] || alertColors.normal;
        
        return `
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                ☢️ RadiaCode (Radiation)
                <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">Gamma dosimeter</span>
                ${isDemoMode ? '<span style="font-size:9px;padding:2px 6px;background:rgba(147,51,234,0.3);border-radius:4px;color:#a855f7">DEMO</span>' : ''}
            </div>
            
            <!-- RadiaCode Connection Card -->
            <div style="padding:14px;background:${isConnected ? (isDemoMode ? 'rgba(147,51,234,0.1)' : 'rgba(34,197,94,0.1)') : 'rgba(255,255,255,0.03)'};border:1px solid ${isConnected ? (isDemoMode ? 'rgba(147,51,234,0.3)' : 'rgba(34,197,94,0.3)') : 'rgba(255,255,255,0.1)'};border-radius:12px;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:${isConnected ? '12px' : '0'}">
                    <div style="width:40px;height:40px;border-radius:10px;background:${isConnected ? (isDemoMode ? 'rgba(147,51,234,0.2)' : 'rgba(34,197,94,0.2)') : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center">
                        <span style="font-size:20px">${isConnected ? (isDemoMode ? '🧪' : '☢️') : isConnecting ? '⏳' : '📴'}</span>
                    </div>
                    <div style="flex:1">
                        <div style="font-size:14px;font-weight:600;color:${isConnected ? (isDemoMode ? '#a855f7' : '#22c55e') : 'inherit'}">
                            ${isConnected 
                                ? (isDemoMode ? 'Demo Mode (Simulated)' : (deviceInfo.serialNumber || 'RadiaCode Connected'))
                                : isConnecting ? 'Connecting...' : 'RadiaCode Not Connected'}
                        </div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                            ${isConnected 
                                ? (isDemoMode 
                                    ? `Simulating RadiaCode-103 • ${stats.packetsReceived} readings`
                                    : `FW: ${deviceInfo.firmwareVersion || 'Unknown'} • ${stats.packetsReceived} readings`)
                                : hasBluetooth 
                                    ? 'Connect RadiaCode via Bluetooth' 
                                    : 'Web Bluetooth not supported'}
                        </div>
                    </div>
                </div>
                
                ${isConnected ? `
                    <!-- Live Reading Display -->
                    <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;margin-bottom:12px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase">Dose Rate</span>
                            <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${alertColor};color:#000;font-weight:600">${alertLevel.toUpperCase()}</span>
                        </div>
                        <div style="font-size:28px;font-weight:700;color:${alertColor};font-family:'IBM Plex Mono',monospace;letter-spacing:-1px">
                            ${RadiaCodeModule.formatDoseRate(reading.doseRate)}
                        </div>
                        <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:rgba(255,255,255,0.5)">
                            <span>CPS: ${RadiaCodeModule.formatCountRate(reading.countRate)}</span>
                            <span>Total: ${reading.totalDose.toFixed(3)} μSv</span>
                            <span>Temp: ${reading.temperature.toFixed(1)}°C</span>
                        </div>
                    </div>
                    
                    <!-- Recording & Actions -->
                    <div style="display:flex;gap:8px;margin-bottom:12px">
                        <button class="btn ${isRecording ? 'btn--danger' : 'btn--secondary'} radiacode-record-btn" style="flex:1;font-size:12px;padding:8px">
                            ${isRecording ? '⏹️ Stop Recording' : '⏺️ Record Track'}
                        </button>
                        <button class="btn btn--secondary radiacode-spectrum-btn" style="font-size:12px;padding:8px" title="View Spectrum">
                            📊
                        </button>
                        <button class="btn btn--secondary radiacode-disconnect-btn" style="font-size:12px;padding:8px;color:#ef4444" title="Disconnect">
                            ✕
                        </button>
                    </div>
                    
                    <!-- Recording Status -->
                    ${isRecording ? `
                        <div style="padding:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;font-size:11px;color:rgba(255,255,255,0.7);margin-bottom:12px">
                            <span style="color:#ef4444">●</span> Recording track • ${RadiaCodeModule.getCurrentTrack()?.points?.length || 0} points
                        </div>
                    ` : ''}
                ` : `
                    <!-- Not Connected -->
                    ${!isConnecting ? `
                        <button class="btn btn--primary btn--full radiacode-connect-btn" ${!hasBluetooth ? 'disabled' : ''}>
                            ☢️ Connect RadiaCode
                        </button>
                        
                        <button class="btn btn--secondary btn--full radiacode-demo-btn" style="margin-top:8px">
                            🧪 Start Demo Mode
                        </button>
                        
                        ${!hasBluetooth ? `
                            <div style="margin-top:8px;padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:12px;color:#ef4444">
                                ⚠️ Web Bluetooth requires Chrome or Edge. Use Demo Mode to test.
                            </div>
                        ` : `
                            <div style="margin-top:8px;font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                                Supports RadiaCode 101/102/103/110 devices
                            </div>
                        `}
                    ` : ''}
                `}
            </div>
            
            <!-- Radiation Tracks -->
            ${tracks.length > 0 ? `
                <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                    <span>📈 Radiation Tracks (${tracks.length})</span>
                </div>
                <div style="max-height:120px;overflow-y:auto;margin-bottom:12px">
                    ${tracks.slice(-5).reverse().map(track => {
                        const duration = track.stats.duration ? Math.round(track.stats.duration / 60000) : 0;
                        const maxDose = track.stats.maxDoseRate || 0;
                        const avgDose = track.stats.avgDoseRate || 0;
                        const points = track.points?.length || 0;
                        const maxColor = RadiaCodeModule.getDoseColor(maxDose);
                        
                        return `
                            <div class="card" style="margin-bottom:6px;padding:10px" data-radiacode-track="${track.id}">
                                <div style="display:flex;align-items:center;gap:10px">
                                    <div style="width:36px;height:36px;border-radius:10px;background:rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:center">
                                        <span style="font-size:16px">☢️</span>
                                    </div>
                                    <div style="flex:1;min-width:0">
                                        <div style="font-size:12px;font-weight:500">${track.name}</div>
                                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                                            ${duration} min • ${points} points • ${track.stats.distance?.toFixed(2) || 0} mi
                                        </div>
                                    </div>
                                    <div style="text-align:right">
                                        <div style="font-size:12px;font-weight:600;color:${maxColor}">${maxDose.toFixed(2)} μSv/h</div>
                                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">max</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
            
            <!-- Radiation Info Box -->
            <details style="margin-bottom:12px">
                <summary style="cursor:pointer;font-size:11px;color:rgba(255,255,255,0.5);padding:8px;background:rgba(255,255,255,0.03);border-radius:8px">
                    ℹ️ Radiation Reference Levels
                </summary>
                <div style="padding:10px;font-size:11px;color:rgba(255,255,255,0.5);line-height:1.6">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <div><span style="color:#22c55e">●</span> Normal: &lt;0.3 μSv/h</div>
                        <div><span style="color:#eab308">●</span> Elevated: 0.3-2.5 μSv/h</div>
                        <div><span style="color:#f97316">●</span> Warning: 2.5-10 μSv/h</div>
                        <div><span style="color:#ef4444">●</span> Alarm: &gt;10 μSv/h</div>
                    </div>
                    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1)">
                        <strong>Reference:</strong> Natural background is typically 0.1-0.3 μSv/h. 
                        Annual limit for public is 1 mSv (1000 μSv).
                    </div>
                </div>
            </details>
        `;
    }
    
    /**
     * Attach RadiaCode event handlers
     */
    function attachRadiaCodeHandlers() {
        if (typeof RadiaCodeModule === 'undefined') return;
        
        // Connect button
        const connectBtn = container.querySelector('.radiacode-connect-btn');
        if (connectBtn) {
            connectBtn.onclick = async () => {
                try {
                    await RadiaCodeModule.connect();
                    renderTeam();
                } catch (e) {
                    console.error('RadiaCode connection failed:', e);
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Connection failed: ' + e.message, 'error');
                    }
                }
            };
        }
        
        // Demo mode button
        const demoBtn = container.querySelector('.radiacode-demo-btn');
        if (demoBtn) {
            demoBtn.onclick = () => {
                RadiaCodeModule.startDemo();
                renderTeam();
            };
        }
        
        // Disconnect button
        const disconnectBtn = container.querySelector('.radiacode-disconnect-btn');
        if (disconnectBtn) {
            disconnectBtn.onclick = () => {
                RadiaCodeModule.disconnect();
                renderTeam();
            };
        }
        
        // Record button
        const recordBtn = container.querySelector('.radiacode-record-btn');
        if (recordBtn) {
            recordBtn.onclick = () => {
                if (RadiaCodeModule.isRecording()) {
                    RadiaCodeModule.stopTrack();
                } else {
                    RadiaCodeModule.startTrack();
                }
                renderTeam();
            };
        }
        
        // Spectrum button
        const spectrumBtn = container.querySelector('.radiacode-spectrum-btn');
        if (spectrumBtn) {
            spectrumBtn.onclick = () => {
                openRadiaCodeSpectrumModal();
            };
        }
        
        // Track click handlers
        container.querySelectorAll('[data-radiacode-track]').forEach(el => {
            el.onclick = () => {
                const trackId = parseInt(el.dataset.radiacodeTrack);
                openRadiaCodeTrackModal(trackId);
            };
        });
    }
    
    /**
     * Open RadiaCode spectrum viewer modal
     */
    function openRadiaCodeSpectrumModal() {
        if (typeof RadiaCodeModule === 'undefined') return;
        
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        
        const spectrum = RadiaCodeModule.getSpectrum();
        const peaks = RadiaCodeModule.findPeaks();
        const isotopes = RadiaCodeModule.identifyIsotopes();
        
        // Find max count for scaling
        const maxCount = Math.max(...spectrum.counts, 1);
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:600px;width:95%">
                    <div class="modal__header">
                        <h3 class="modal__title">📊 Gamma Spectrum</h3>
                        <button class="modal__close" id="modal-close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <div style="margin-bottom:16px;display:flex;gap:16px;font-size:12px;color:rgba(255,255,255,0.6)">
                            <span>Duration: ${spectrum.duration.toFixed(1)}s</span>
                            <span>Peaks: ${peaks.length}</span>
                            <span>Isotopes: ${isotopes.length}</span>
                        </div>
                        
                        <!-- Spectrum Chart -->
                        <div style="height:200px;background:rgba(0,0,0,0.3);border-radius:8px;padding:8px;margin-bottom:16px;overflow:hidden;position:relative">
                            <canvas id="spectrum-canvas" width="600" height="180" style="width:100%;height:100%"></canvas>
                        </div>
                        
                        <!-- Identified Isotopes -->
                        ${isotopes.length > 0 ? `
                            <div class="section-label">Identified Isotopes</div>
                            <div style="display:grid;gap:8px;max-height:200px;overflow-y:auto">
                                ${isotopes.map(match => `
                                    <div style="padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;display:flex;align-items:center;gap:12px">
                                        <div style="width:40px;height:40px;border-radius:8px;background:rgba(34,197,94,0.2);display:flex;align-items:center;justify-content:center">
                                            <span style="font-size:14px;font-weight:700">${match.isotope.name.split('-')[0]}</span>
                                        </div>
                                        <div style="flex:1">
                                            <div style="font-weight:600">${match.isotope.name}</div>
                                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">${match.isotope.notes}</div>
                                        </div>
                                        <div style="text-align:right">
                                            <div style="font-size:12px;font-family:monospace">${match.peak.energy.toFixed(1)} keV</div>
                                            <div style="font-size:10px;color:rgba(255,255,255,0.4)">${(match.confidence * 100).toFixed(0)}% conf</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4)">
                                No isotopes identified. Accumulate more counts for better analysis.
                            </div>
                        `}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="spectrum-reset-btn">
                            🔄 Reset Spectrum
                        </button>
                        <button class="btn btn--secondary" id="spectrum-refresh-btn">
                            📥 Refresh Data
                        </button>
                        <button class="btn btn--primary" id="modal-close-btn">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        // Close handlers
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-close-btn').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Reset spectrum button
        modalContainer.querySelector('#spectrum-reset-btn').onclick = () => {
            RadiaCodeModule.resetSpectrum();
            closeModal();
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Spectrum reset', 'info');
            }
        };
        
        // Refresh data button
        modalContainer.querySelector('#spectrum-refresh-btn').onclick = () => {
            RadiaCodeModule.requestSpectrum();
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Requesting spectrum data...', 'info');
            }
            // Re-open modal after a delay to show updated data
            setTimeout(() => {
                openRadiaCodeSpectrumModal();
            }, 500);
        };
        
        // Draw spectrum on canvas
        const canvas = document.getElementById('spectrum-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            // Clear
            ctx.clearRect(0, 0, width, height);
            
            // Draw spectrum bars
            const barWidth = width / 256; // Show 256 bins (downsample from 1024)
            ctx.fillStyle = '#22c55e';
            
            for (let i = 0; i < 256; i++) {
                // Average 4 channels per bin
                const sum = spectrum.counts[i*4] + spectrum.counts[i*4+1] + spectrum.counts[i*4+2] + spectrum.counts[i*4+3];
                const avg = sum / 4;
                const barHeight = (avg / maxCount) * height * 0.9;
                ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
            }
            
            // Mark peaks
            ctx.fillStyle = '#ef4444';
            peaks.forEach(peak => {
                const x = (peak.channel / 1024) * width;
                ctx.fillRect(x - 1, 0, 2, height);
            });
            
            // Energy axis labels
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '10px system-ui';
            ctx.textAlign = 'center';
            for (let keV = 0; keV <= 3000; keV += 500) {
                const x = (keV / 3000) * width;
                ctx.fillText(`${keV}`, x, height - 2);
            }
        }
    }
    
    /**
     * Open RadiaCode track detail modal
     */
    function openRadiaCodeTrackModal(trackId) {
        if (typeof RadiaCodeModule === 'undefined') return;
        
        const modalContainer = document.getElementById('modal-container');
        if (!modalContainer) return;
        
        const track = RadiaCodeModule.getTrack(trackId);
        if (!track) return;
        
        const duration = track.stats.duration ? Math.round(track.stats.duration / 60000) : 0;
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:450px;width:90%">
                    <div class="modal__header">
                        <h3 class="modal__title">☢️ ${track.name}</h3>
                        <button class="modal__close" id="modal-close">&times;</button>
                    </div>
                    <div class="modal__body">
                        <!-- Track Stats -->
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">
                            <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:700;color:#22c55e">${track.stats.avgDoseRate?.toFixed(2) || 0}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">Avg μSv/h</div>
                            </div>
                            <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:700;color:${RadiaCodeModule.getDoseColor(track.stats.maxDoseRate || 0)}">${track.stats.maxDoseRate?.toFixed(2) || 0}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">Max μSv/h</div>
                            </div>
                            <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:700">${track.stats.totalDose?.toFixed(3) || 0}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">Total μSv</div>
                            </div>
                            <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:700">${duration}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5)">Minutes</div>
                            </div>
                        </div>
                        
                        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:16px">
                            ${track.points?.length || 0} data points • ${track.stats.distance?.toFixed(2) || 0} miles
                        </div>
                        
                        ${track.notes ? `
                            <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px;font-size:12px;font-style:italic">
                                "${track.notes}"
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="export-track-geojson">
                            📤 Export GeoJSON
                        </button>
                        <button class="btn btn--danger" id="delete-track-btn">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        // Close handlers
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Export GeoJSON
        modalContainer.querySelector('#export-track-geojson').onclick = () => {
            const geojson = RadiaCodeModule.exportTrackGeoJSON(trackId);
            if (geojson) {
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `radiation-track-${trackId}.geojson`;
                a.click();
                URL.revokeObjectURL(url);
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Track exported', 'success');
                }
            }
        };
        
        // Delete track
        modalContainer.querySelector('#delete-track-btn').onclick = () => {
            if (confirm('Delete this radiation track?')) {
                RadiaCodeModule.deleteTrack(trackId);
                closeModal();
                renderTeam();
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Track deleted', 'info');
                }
            }
        };
    }

    /**
     * Render Team Management section
     */
    function renderTeamManagementSection(currentTeam, isInTeam, myMember, teamMembers, rallyPoints, ROLES, RALLY_TYPES) {
        if (!isInTeam) {
            // Not in a team - show create/join options
            return `
                <div style="margin-bottom:20px">
                    <div class="section-label" style="display:flex;align-items:center;gap:8px">
                        👥 Team Management
                        <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">Coordinate with your group</span>
                    </div>
                    
                    <!-- No Team State -->
                    <div style="padding:20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;text-align:center">
                        <div style="font-size:32px;margin-bottom:12px">👥</div>
                        <div style="font-size:14px;font-weight:500;margin-bottom:4px">No Active Team</div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:16px">
                            Create a team or join an existing one to coordinate with your group
                        </div>
                        
                        <div style="display:flex;gap:8px;justify-content:center">
                            <button class="btn btn--primary" id="team-create-btn">
                                ➕ Create Team
                            </button>
                            <button class="btn btn--secondary" id="team-join-btn">
                                🔗 Join Team
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="divider"></div>
            `;
        }
        
        // In a team - show team info
        const myRole = ROLES[myMember?.role] || ROLES.support;
        const isLeader = myMember?.role === 'leader' || myMember?.role === 'coleader';
        
        return `
            <div style="margin-bottom:20px">
                <div class="section-label" style="display:flex;align-items:center;gap:8px">
                    👥 Team Management
                    <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">${currentTeam.id}</span>
                </div>
                
                <!-- Team Info Card -->
                <div style="padding:14px;background:linear-gradient(135deg,rgba(249,115,22,0.1),rgba(234,88,12,0.05));border:1px solid rgba(249,115,22,0.2);border-radius:12px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                        <div style="width:44px;height:44px;border-radius:10px;background:rgba(249,115,22,0.2);display:flex;align-items:center;justify-content:center;font-size:22px">
                            👥
                        </div>
                        <div style="flex:1">
                            <div style="font-size:16px;font-weight:600">${escapeHtml(currentTeam.name)}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                ${teamMembers.length} member${teamMembers.length !== 1 ? 's' : ''} • ${rallyPoints.length} rally point${rallyPoints.length !== 1 ? 's' : ''}
                            </div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:12px;font-weight:500;color:${myRole.color}">${myRole.icon} ${myRole.name}</div>
                        </div>
                    </div>
                    
                    <!-- Quick Actions -->
                    <div style="display:flex;gap:8px">
                        ${isLeader ? `
                            <button class="btn btn--secondary" id="team-invite-btn" style="flex:1;font-size:11px;padding:8px">
                                📤 Invite
                            </button>
                        ` : ''}
                        <button class="btn btn--secondary" id="team-settings-btn" style="flex:1;font-size:11px;padding:8px">
                            ⚙️ Settings
                        </button>
                        <button class="btn btn--secondary" id="team-leave-btn" style="font-size:11px;padding:8px;color:#ef4444">
                            🚪 Leave
                        </button>
                    </div>
                </div>
                
                <!-- Team Health Summary -->
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    ${(() => {
                        const health = typeof TeamModule !== 'undefined' ? TeamModule.getTeamHealth() : { active: 0, stale: 0, offline: 0 };
                        return `
                            <div style="flex:1;padding:8px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center">
                                <div style="font-size:16px;font-weight:600;color:#22c55e">${health.active}</div>
                                <div style="font-size:9px;color:rgba(255,255,255,0.4)">ACTIVE</div>
                            </div>
                            <div style="flex:1;padding:8px;background:rgba(245,158,11,0.1);border-radius:8px;text-align:center">
                                <div style="font-size:16px;font-weight:600;color:#f59e0b">${health.stale}</div>
                                <div style="font-size:9px;color:rgba(255,255,255,0.4)">STALE</div>
                            </div>
                            <div style="flex:1;padding:8px;background:rgba(107,114,128,0.1);border-radius:8px;text-align:center">
                                <div style="font-size:16px;font-weight:600;color:#6b7280">${health.offline}</div>
                                <div style="font-size:9px;color:rgba(255,255,255,0.4)">OFFLINE</div>
                            </div>
                        `;
                    })()}
                </div>
                
                <!-- Team Members with Distance/Bearing -->
                <div style="margin-bottom:12px">
                    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:8px;display:flex;justify-content:space-between">
                        <span>MEMBERS</span>
                        <span>${teamMembers.length}/${typeof TeamModule !== 'undefined' ? '20' : '?'}</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${(() => {
                            // Get current GPS position if available
                            const gpsState = typeof GPSModule !== 'undefined' ? GPSModule.getState() : null;
                            const myPos = gpsState?.position ? { lat: gpsState.position.lat, lon: gpsState.position.lon } : null;
                            
                            return teamMembers.map(m => {
                                const role = ROLES[m.role] || ROLES.support;
                                const isMe = m.id === myMember?.id;
                                const statusColor = m.status === 'active' ? '#22c55e' : m.status === 'stale' ? '#f59e0b' : '#6b7280';
                                
                                // Get distance/bearing if we have GPS
                                let distInfo = null;
                                if (!isMe && myPos && typeof TeamModule !== 'undefined') {
                                    distInfo = TeamModule.getDistanceToMember(m.id, myPos);
                                }
                                
                                // Format last seen time
                                let lastSeenText = '';
                                if (m.lastSeen) {
                                    const elapsed = Date.now() - new Date(m.lastSeen).getTime();
                                    if (elapsed < 60000) lastSeenText = 'Now';
                                    else if (elapsed < 3600000) lastSeenText = Math.floor(elapsed / 60000) + 'm';
                                    else if (elapsed < 86400000) lastSeenText = Math.floor(elapsed / 3600000) + 'h';
                                    else lastSeenText = Math.floor(elapsed / 86400000) + 'd';
                                }
                                
                                return `
                                    <div style="padding:10px;background:${isMe ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${isMe ? 'rgba(249,115,22,0.2)' : 'transparent'};border-radius:10px;cursor:pointer" 
                                         data-team-member="${m.id}">
                                        <div style="display:flex;align-items:center;gap:10px">
                                            <!-- Role Icon & Status -->
                                            <div style="position:relative">
                                                <div style="width:36px;height:36px;border-radius:8px;background:${role.color}22;display:flex;align-items:center;justify-content:center;font-size:18px">
                                                    ${role.icon}
                                                </div>
                                                <div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${statusColor};border:2px solid #0f1419"></div>
                                            </div>
                                            
                                            <!-- Member Info -->
                                            <div style="flex:1;min-width:0">
                                                <div style="display:flex;align-items:center;gap:6px">
                                                    <span style="font-size:13px;font-weight:500">${escapeHtml(m.shortName || m.name)}</span>
                                                    ${isMe ? '<span style="font-size:9px;padding:2px 6px;background:rgba(249,115,22,0.2);border-radius:4px;color:#f97316">YOU</span>' : ''}
                                                </div>
                                                <div style="font-size:10px;color:${role.color}">${role.name}${lastSeenText ? ' • ' + lastSeenText + ' ago' : ''}</div>
                                            </div>
                                            
                                            <!-- Distance/Bearing (if available) -->
                                            ${!isMe && distInfo ? `
                                                <div style="text-align:right">
                                                    <div style="font-size:14px;font-weight:600;color:#3b82f6">${distInfo.formatted}</div>
                                                    <div style="font-size:10px;color:rgba(255,255,255,0.5)">
                                                        ${distInfo.compass} (${Math.round(distInfo.bearing)}°)
                                                    </div>
                                                </div>
                                            ` : !isMe && m.lat && m.lon ? `
                                                <div style="text-align:right">
                                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">📍 Has position</div>
                                                </div>
                                            ` : !isMe ? `
                                                <div style="text-align:right">
                                                    <div style="font-size:10px;color:rgba(255,255,255,0.3)">No position</div>
                                                </div>
                                            ` : ''}
                                            
                                            <!-- Go To Button -->
                                            ${!isMe && m.lat && m.lon ? `
                                                <button class="btn btn--secondary" data-goto-team="${m.id}" style="padding:6px 10px;font-size:11px" title="Go to location">
                                                    🎯
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                </div>
                
                <!-- Rally Points -->
                <div style="margin-bottom:12px">
                    <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
                        <span>RALLY POINTS</span>
                        <button class="btn btn--secondary" id="team-add-rally-btn" style="padding:2px 8px;font-size:10px">+ Add</button>
                    </div>
                    ${rallyPoints.length === 0 ? `
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.4);text-align:center">
                            No rally points defined. Add one for emergency meetup locations.
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:6px">
                            ${(() => {
                                const gpsState = typeof GPSModule !== 'undefined' ? GPSModule.getState() : null;
                                const myPos = gpsState?.position ? { lat: gpsState.position.lat, lon: gpsState.position.lon } : null;
                                
                                return rallyPoints.map(rp => {
                                    const rpType = RALLY_TYPES[rp.type] || RALLY_TYPES.primary;
                                    
                                    // Get distance/bearing if we have GPS
                                    let distInfo = null;
                                    if (myPos && typeof TeamModule !== 'undefined') {
                                        distInfo = TeamModule.getDistanceToRally(rp.id, myPos);
                                    }
                                    
                                    return `
                                        <div style="padding:10px;background:rgba(255,255,255,0.03);border:1px solid ${rpType.color}33;border-radius:10px;display:flex;align-items:center;gap:10px" data-rally-id="${rp.id}">
                                            <div style="width:36px;height:36px;border-radius:8px;background:${rpType.color}22;display:flex;align-items:center;justify-content:center;font-size:18px">
                                                ${rpType.icon}
                                            </div>
                                            <div style="flex:1;min-width:0">
                                                <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(rp.name)}</div>
                                                <div style="font-size:10px;color:${rpType.color}">${rpType.name}${rp.schedule ? ' • ' + rp.schedule : ''}</div>
                                            </div>
                                            ${distInfo ? `
                                                <div style="text-align:right">
                                                    <div style="font-size:13px;font-weight:600;color:${rpType.color}">${distInfo.formatted}</div>
                                                    <div style="font-size:9px;color:rgba(255,255,255,0.5)">${distInfo.compass} (${Math.round(distInfo.bearing)}°)</div>
                                                </div>
                                            ` : ''}
                                            <button class="btn btn--secondary" data-goto-rally="${rp.id}" style="padding:6px 10px;font-size:11px">🎯</button>
                                        </div>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    `}
                </div>
                
                <!-- Comm Plan Summary -->
                ${currentTeam.commPlan ? `
                    <div style="padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:10px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div style="font-size:10px;color:rgba(255,255,255,0.4)">COMM PLAN</div>
                            ${isLeader ? `<button class="btn btn--secondary" id="team-edit-commplan-btn" style="padding:2px 8px;font-size:9px">Edit</button>` : ''}
                        </div>
                        
                        <!-- Frequencies & Emergency Word -->
                        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
                            ${currentTeam.commPlan.primaryFreq ? `
                                <div style="padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:11px">
                                    📻 ${currentTeam.commPlan.primaryFreq}
                                </div>
                            ` : ''}
                            ${currentTeam.commPlan.emergencyWord ? `
                                <div style="padding:4px 8px;background:rgba(239,68,68,0.15);border-radius:6px;font-size:11px;color:#ef4444">
                                    🆘 "${currentTeam.commPlan.emergencyWord}"
                                </div>
                            ` : ''}
                            ${currentTeam.meshChannel ? `
                                <div style="padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:11px">
                                    📡 Ch ${currentTeam.meshChannel}
                                </div>
                            ` : ''}
                        </div>
                        
                        <!-- Next Check-In -->
                        ${(() => {
                            const nextCheckIn = typeof TeamModule !== 'undefined' ? TeamModule.getNextCheckIn() : null;
                            if (nextCheckIn) {
                                return `
                                    <div style="padding:8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:6px;display:flex;align-items:center;gap:8px">
                                        <span style="font-size:16px">⏰</span>
                                        <div style="flex:1">
                                            <div style="font-size:11px;font-weight:500;color:#22c55e">Next Check-In</div>
                                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">${nextCheckIn.formatted}</div>
                                        </div>
                                    </div>
                                `;
                            } else if (currentTeam.commPlan.checkInTimes && currentTeam.commPlan.checkInTimes.length > 0) {
                                return `
                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                                        ${currentTeam.commPlan.checkInTimes.length} scheduled check-in${currentTeam.commPlan.checkInTimes.length !== 1 ? 's' : ''}
                                    </div>
                                `;
                            }
                            return '';
                        })()}
                    </div>
                ` : ''}
            </div>
            
            <div class="divider"></div>
        `;
    }

    function renderTeam() {
        const team = State.get('teamMembers');
        const waypoints = State.get('waypoints') || [];
        const routes = State.get('routes') || [];
        
        // Get Team state
        const hasTeamModule = typeof TeamModule !== 'undefined';
        const currentTeam = hasTeamModule ? TeamModule.getCurrentTeam() : null;
        const isInTeam = hasTeamModule && TeamModule.isInTeam();
        const myMember = isInTeam ? TeamModule.getMyMember() : null;
        const teamMembers = isInTeam ? TeamModule.getMembers() : [];
        const rallyPoints = isInTeam ? TeamModule.getRallyPoints() : [];
        const ROLES = hasTeamModule ? TeamModule.ROLES : {};
        const RALLY_TYPES = hasTeamModule ? TeamModule.RALLY_TYPES : {};
        
        // Get Meshtastic connection state
        const meshState = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.getConnectionState() 
            : { state: 'disconnected', type: null };
        const isConnected = meshState.state === 'connected';
        const isConnecting = meshState.state === 'connecting';
        
        // Check API support
        const apiSupport = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.checkApiSupport() 
            : { bluetooth: false, serial: false };
        const hasApiSupport = apiSupport.bluetooth || apiSupport.serial;
        
        // Get messages
        const messages = typeof MeshtasticModule !== 'undefined' 
            ? MeshtasticModule.getMessages().slice(-10) 
            : [];
        
        container.innerHTML = `
            <div class="panel__header"><h2 class="panel__title">Team & Mesh</h2></div>
            
            <!-- ========== TEAM MANAGEMENT SECTION ========== -->
            ${renderTeamManagementSection(currentTeam, isInTeam, myMember, teamMembers, rallyPoints, ROLES, RALLY_TYPES)}
            
            <!-- Meshtastic Connection Section -->
            <div style="margin-bottom:20px">
                <div class="section-label" style="display:flex;align-items:center;gap:8px">
                    📡 Meshtastic Connection
                    <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">Off-grid mesh network</span>
                </div>
                
                <!-- Connection Status Card -->
                <div style="padding:14px;background:${isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:12px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:${isConnected ? '12px' : '0'}">
                        <div style="width:40px;height:40px;border-radius:10px;background:${isConnected ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center">
                            <span style="font-size:20px">${isConnected ? '📡' : isConnecting ? '⏳' : '📴'}</span>
                        </div>
                        <div style="flex:1">
                            <div style="font-size:14px;font-weight:600;color:${isConnected ? '#22c55e' : 'inherit'}">
                                ${isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Not Connected'}
                            </div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                ${isConnected 
                                    ? `via ${meshState.type === 'bluetooth' ? 'Bluetooth' : 'Serial'} • ${meshState.nodeName || 'Unknown'}` 
                                    : hasApiSupport 
                                        ? 'Click Connect to pair your Meshtastic device' 
                                        : 'Web Bluetooth/Serial not supported in this browser'}
                            </div>
                        </div>
                    </div>
                    
                    ${isConnected ? `
                        <div style="display:flex;gap:8px">
                            <button class="btn btn--secondary" id="mesh-broadcast-btn" style="flex:1;font-size:12px;padding:8px">
                                📍 Broadcast Position
                            </button>
                            <button class="btn btn--secondary" id="mesh-disconnect-btn" style="font-size:12px;padding:8px;color:#ef4444">
                                Disconnect
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                ${!isConnected && !isConnecting ? `
                    <!-- Connect Buttons -->
                    <div style="display:flex;gap:8px;margin-bottom:12px">
                        <button class="btn btn--primary" id="mesh-connect-ble-btn" style="flex:1" ${!apiSupport.bluetooth ? 'disabled' : ''}>
                            ${Icons.get('satellite')} Bluetooth
                        </button>
                        <button class="btn btn--secondary" id="mesh-connect-serial-btn" style="flex:1" ${!apiSupport.serial ? 'disabled' : ''}>
                            🔌 Serial/USB
                        </button>
                    </div>
                    
                    ${!hasApiSupport ? `
                        <div style="padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:12px;color:#ef4444">
                            ⚠️ Web Bluetooth/Serial requires Chrome or Edge browser
                        </div>
                    ` : ''}
                    
                    <!-- User Settings -->
                    <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px">
                        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:8px">YOUR NODE IDENTITY</div>
                        <div style="display:flex;gap:8px">
                            <input type="text" id="mesh-longname" placeholder="Your Name" value="${meshState.nodeName || 'GridDown User'}" style="flex:2;padding:8px;font-size:12px">
                            <input type="text" id="mesh-shortname" placeholder="ID" maxlength="4" value="${meshState.shortName || 'GDU'}" style="flex:1;padding:8px;font-size:12px;text-transform:uppercase">
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <div class="divider"></div>
            
            <!-- My Position Section -->
            ${renderPositionSection()}
            
            <div class="divider"></div>
            
            <!-- APRS Section -->
            ${renderAPRSSection()}
            
            <div class="divider"></div>
            
            <!-- RadiaCode Section -->
            ${renderRadiaCodeSection()}
            
            <div class="divider"></div>
            
            <!-- Team Positions Section -->
            <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>Team Positions (${team.length + getAPRSStationCount()})</span>
                ${isConnected ? '<span style="font-size:10px;color:#22c55e">● LIVE</span>' : ''}
            </div>
            
            <div style="max-height:200px;overflow-y:auto;margin-bottom:16px">
                ${team.length === 0 ? `
                    <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.4);font-size:12px">
                        ${isConnected ? 'Waiting for team positions...' : 'Connect to Meshtastic to see team'}
                    </div>
                ` : team.map(m => `
                    <div class="card team-card ${m.status === 'active' ? 'team-card--active' : ''}" style="margin-bottom:8px;padding:10px" data-team-id="${m.id}">
                        <div style="display:flex;align-items:center;gap:10px">
                            <div style="width:36px;height:36px;border-radius:50%;background:${m.isMe ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)'};display:flex;align-items:center;justify-content:center;position:relative">
                                <span style="font-size:16px">${m.isMe ? '📍' : '👤'}</span>
                                <div style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:${m.status === 'active' ? '#22c55e' : m.status === 'stale' ? '#f59e0b' : '#6b7280'};border:2px solid var(--color-bg-secondary)"></div>
                            </div>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                                    ${m.name}${m.isMe ? ' (You)' : ''}
                                </div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                                    ${m.lastUpdate}${m.lat && m.lon ? ` • ${m.lat.toFixed(4)}°, ${m.lon.toFixed(4)}°` : ''}
                                </div>
                            </div>
                            ${!m.isMe && m.lat && m.lon ? `
                                <button class="btn btn--secondary" data-goto-team="${m.id}" style="padding:6px 10px;font-size:10px" title="Go to location">
                                    🎯
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <!-- Quick Actions -->
            <div style="display:flex;gap:8px;margin-bottom:16px">
                <button class="btn ${isConnected ? 'btn--success' : 'btn--secondary'}" id="send-checkin-btn" style="flex:1" ${!isConnected ? 'disabled' : ''}>
                    ✓ Check-In OK
                </button>
                <button class="btn btn--secondary" id="send-checkin-help-btn" style="flex:1;color:#f59e0b" ${!isConnected ? 'disabled' : ''}>
                    ⚠️ Need Help
                </button>
            </div>
            
            <div class="divider"></div>
            
            <!-- Mesh Messaging Section -->
            <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                <span>💬 Mesh Messages</span>
                ${messages.length > 0 ? `<span style="font-size:10px;color:rgba(255,255,255,0.4)">${messages.length} messages</span>` : ''}
            </div>
            
            <div id="mesh-messages-container" style="max-height:150px;overflow-y:auto;margin-bottom:12px;background:rgba(0,0,0,0.2);border-radius:8px;padding:8px">
                ${messages.length === 0 ? `
                    <div style="padding:16px;text-align:center;color:rgba(255,255,255,0.3);font-size:11px">
                        ${isConnected ? 'No messages yet' : 'Connect to send/receive messages'}
                    </div>
                ` : messages.map(msg => `
                    <div style="padding:6px 8px;margin-bottom:4px;background:${msg.isSent ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;${msg.isSent ? 'margin-left:20px' : 'margin-right:20px'}">
                        <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:2px">
                            ${msg.isSent ? 'You' : msg.fromName || 'Unknown'} • ${formatMeshTime(msg.timestamp)}
                        </div>
                        <div style="font-size:12px;word-break:break-word">${escapeHtml(msg.text)}</div>
                    </div>
                `).join('')}
            </div>
            
            <div style="display:flex;gap:8px;margin-bottom:16px">
                <input type="text" id="mesh-message-input" placeholder="${isConnected ? 'Type a message...' : 'Connect to send messages'}" 
                    style="flex:1;padding:10px;font-size:12px" ${!isConnected ? 'disabled' : ''}>
                <button class="btn btn--primary" id="mesh-send-btn" style="padding:10px 16px" ${!isConnected ? 'disabled' : ''}>
                    📤
                </button>
            </div>
            
            <div class="divider"></div>
            
            <!-- Share via Mesh Section -->
            <div class="section-label">📤 Share via Mesh</div>
            <div style="display:flex;gap:8px;margin-bottom:16px">
                <button class="btn btn--secondary" id="mesh-share-waypoint-btn" style="flex:1;font-size:12px" ${!isConnected || waypoints.length === 0 ? 'disabled' : ''}>
                    📍 Share Waypoint
                </button>
                <button class="btn btn--secondary" id="mesh-share-route-btn" style="flex:1;font-size:12px" ${!isConnected || routes.length === 0 ? 'disabled' : ''}>
                    🛤️ Share Route
                </button>
            </div>
            
            <div class="divider"></div>
            
            <!-- Plan Sharing Section (File-based) -->
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                📦 Plan Sharing
                <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">Encrypted file transfer</span>
            </div>
            
            <!-- Current Plan Stats -->
            <div style="padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:10px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-size:12px;color:rgba(255,255,255,0.6)">Current Plan</span>
                    <span style="font-size:10px;color:rgba(255,255,255,0.3)">${new Date().toLocaleDateString()}</span>
                </div>
                <div style="display:flex;gap:16px">
                    <div style="text-align:center">
                        <div style="font-size:18px;font-weight:600;color:#8b5cf6">${waypoints.length}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">Waypoints</div>
                    </div>
                    <div style="text-align:center">
                        <div style="font-size:18px;font-weight:600;color:#8b5cf6">${routes.length}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">Routes</div>
                    </div>
                </div>
            </div>
            
            <!-- Export Button -->
            <button class="btn btn--primary btn--full" id="export-plan-btn" style="margin-bottom:8px">
                ${Icons.get('export')} Export Plan Package
            </button>
            
            <!-- Import Button -->
            <label class="btn btn--secondary btn--full" style="cursor:pointer;margin-bottom:8px">
                ${Icons.get('download')} Import Plan Package
                <input type="file" id="import-plan-input" accept=".gdplan,.json" style="display:none">
            </label>
            
            <!-- Quick Actions -->
            <div style="display:flex;gap:8px">
                <button class="btn btn--secondary" id="export-gpx-btn" style="flex:1;font-size:12px;padding:10px">
                    GPX
                </button>
                <button class="btn btn--secondary" id="export-unencrypted-btn" style="flex:1;font-size:12px;padding:10px">
                    JSON
                </button>
                <button class="btn btn--secondary" id="copy-summary-btn" style="flex:1;font-size:12px;padding:10px">
                    📋 Summary
                </button>
            </div>
        `;
        
        // === TEAM MANAGEMENT EVENT HANDLERS ===
        
        // Create Team button
        const createTeamBtn = container.querySelector('#team-create-btn');
        if (createTeamBtn) {
            createTeamBtn.onclick = () => openCreateTeamModal();
        }
        
        // Join Team button
        const joinTeamBtn = container.querySelector('#team-join-btn');
        if (joinTeamBtn) {
            joinTeamBtn.onclick = () => openJoinTeamModal();
        }
        
        // Invite to Team button
        const inviteBtn = container.querySelector('#team-invite-btn');
        if (inviteBtn) {
            inviteBtn.onclick = () => openTeamInviteModal();
        }
        
        // Team Settings button
        const teamSettingsBtn = container.querySelector('#team-settings-btn');
        if (teamSettingsBtn) {
            teamSettingsBtn.onclick = () => openTeamSettingsModal();
        }
        
        // Comm Plan Edit button
        const commPlanEditBtn = container.querySelector('#team-edit-commplan-btn');
        if (commPlanEditBtn) {
            commPlanEditBtn.onclick = () => openCommPlanModal();
        }
        
        // Leave Team button
        const leaveTeamBtn = container.querySelector('#team-leave-btn');
        if (leaveTeamBtn) {
            leaveTeamBtn.onclick = () => {
                if (confirm('Are you sure you want to leave this team?')) {
                    try {
                        TeamModule.leaveTeam();
                        ModalsModule.showToast('Left the team', 'success');
                        renderTeam();
                    } catch (err) {
                        ModalsModule.showToast('Error: ' + err.message, 'error');
                    }
                }
            };
        }
        
        // Add Rally Point button
        const addRallyBtn = container.querySelector('#team-add-rally-btn');
        if (addRallyBtn) {
            addRallyBtn.onclick = () => openAddRallyPointModal();
        }
        
        // Go to Rally Point buttons
        container.querySelectorAll('[data-goto-rally]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const rallyPoints = TeamModule.getRallyPoints();
                const rp = rallyPoints.find(r => r.id === btn.dataset.gotoRally);
                if (rp && rp.lat && rp.lon && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(rp.lat, rp.lon, 15);
                    ModalsModule.showToast(`Centered on ${rp.name}`, 'info');
                }
            };
        });
        
        // Team member click (for details)
        container.querySelectorAll('[data-team-member]').forEach(el => {
            el.onclick = (e) => {
                // Don't trigger if clicking on the goto button
                if (e.target.closest('[data-goto-team]')) return;
                
                const members = TeamModule.getMembers();
                const member = members.find(m => m.id === el.dataset.teamMember);
                if (member) {
                    openTeamMemberDetailModal(member);
                }
            };
        });
        
        // === MESHTASTIC EVENT HANDLERS ===
        
        // Bluetooth connect
        const connectBleBtn = container.querySelector('#mesh-connect-ble-btn');
        if (connectBleBtn) {
            connectBleBtn.onclick = async () => {
                try {
                    // Save user name first
                    const longName = container.querySelector('#mesh-longname')?.value || 'GridDown User';
                    const shortName = container.querySelector('#mesh-shortname')?.value || 'GDU';
                    MeshtasticModule.setUserName(longName, shortName);
                    
                    await MeshtasticModule.connectBluetooth();
                    ModalsModule.showToast('Connected to Meshtastic via Bluetooth', 'success');
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('Connection failed: ' + err.message, 'error');
                    renderTeam();
                }
            };
        }
        
        // Serial connect
        const connectSerialBtn = container.querySelector('#mesh-connect-serial-btn');
        if (connectSerialBtn) {
            connectSerialBtn.onclick = async () => {
                try {
                    const longName = container.querySelector('#mesh-longname')?.value || 'GridDown User';
                    const shortName = container.querySelector('#mesh-shortname')?.value || 'GDU';
                    MeshtasticModule.setUserName(longName, shortName);
                    
                    await MeshtasticModule.connectSerial();
                    ModalsModule.showToast('Connected to Meshtastic via Serial', 'success');
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('Connection failed: ' + err.message, 'error');
                    renderTeam();
                }
            };
        }
        
        // Disconnect
        const disconnectBtn = container.querySelector('#mesh-disconnect-btn');
        if (disconnectBtn) {
            disconnectBtn.onclick = async () => {
                await MeshtasticModule.disconnect();
                ModalsModule.showToast('Disconnected from Meshtastic', 'info');
                renderTeam();
            };
        }
        
        // Broadcast position
        const broadcastBtn = container.querySelector('#mesh-broadcast-btn');
        if (broadcastBtn) {
            broadcastBtn.onclick = async () => {
                await MeshtasticModule.broadcastPosition();
                ModalsModule.showToast('Position broadcast sent', 'success');
            };
        }
        
        // Check-in OK
        const checkinBtn = container.querySelector('#send-checkin-btn');
        if (checkinBtn) {
            checkinBtn.onclick = async () => {
                if (isConnected) {
                    await MeshtasticModule.sendCheckin('OK');
                } else {
                    ModalsModule.showToast('Connect to Meshtastic first', 'error');
                }
            };
        }
        
        // Check-in Need Help
        const checkinHelpBtn = container.querySelector('#send-checkin-help-btn');
        if (checkinHelpBtn) {
            checkinHelpBtn.onclick = async () => {
                if (isConnected) {
                    await MeshtasticModule.sendCheckin('NEED HELP');
                }
            };
        }
        
        // Send message
        const sendMsgBtn = container.querySelector('#mesh-send-btn');
        const msgInput = container.querySelector('#mesh-message-input');
        if (sendMsgBtn && msgInput) {
            const sendMessage = async () => {
                const text = msgInput.value.trim();
                if (text && isConnected) {
                    await MeshtasticModule.sendTextMessage(text);
                    msgInput.value = '';
                    renderTeam(); // Refresh to show sent message
                }
            };
            sendMsgBtn.onclick = sendMessage;
            msgInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
        }
        
        // Share waypoint
        const shareWpBtn = container.querySelector('#mesh-share-waypoint-btn');
        if (shareWpBtn) {
            shareWpBtn.onclick = () => openMeshShareWaypointModal();
        }
        
        // Share route
        const shareRouteBtn = container.querySelector('#mesh-share-route-btn');
        if (shareRouteBtn) {
            shareRouteBtn.onclick = () => openMeshShareRouteModal();
        }
        
        // Go to team member location
        container.querySelectorAll('[data-goto-team]').forEach(btn => {
            btn.onclick = () => {
                const member = team.find(m => m.id === btn.dataset.gotoTeam);
                if (member && member.lat && member.lon && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(member.lat, member.lon, 15);
                    ModalsModule.showToast(`Centered on ${member.name}`, 'info');
                }
            };
        });
        
        // === POSITION EVENT HANDLERS ===
        attachPositionHandlers();
        
        // === APRS EVENT HANDLERS ===
        attachAPRSHandlers();
        
        // === RADIACODE EVENT HANDLERS ===
        attachRadiaCodeHandlers();
        
        // === EXISTING PLAN SHARING HANDLERS ===
        
        // Export Plan Button
        container.querySelector('#export-plan-btn').onclick = () => {
            openExportModal();
        };
        
        // Import Plan Input
        container.querySelector('#import-plan-input').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const content = await file.text();
                const fileData = JSON.parse(content);
                
                if (fileData.encrypted) {
                    openImportModal(content, file.name);
                } else {
                    const planData = await PlanSharingModule.parsePlanFile(content);
                    showConflictResolution(planData, file.name);
                }
            } catch (err) {
                ModalsModule.showToast('Invalid plan file: ' + err.message, 'error');
            }
            
            e.target.value = '';
        };
        
        // GPX Export
        container.querySelector('#export-gpx-btn').onclick = () => {
            if (typeof GPXModule !== 'undefined') {
                GPXModule.downloadGPX(waypoints, routes, 'griddown-export.gpx');
                ModalsModule.showToast('GPX exported', 'success');
            } else {
                ModalsModule.showToast('GPX module not available', 'error');
            }
        };
        
        // Unencrypted Export
        container.querySelector('#export-unencrypted-btn').onclick = async () => {
            try {
                await PlanSharingModule.downloadPlan(null, {
                    planName: 'griddown-plan'
                });
                ModalsModule.showToast('Plan exported (unencrypted)', 'success');
            } catch (err) {
                ModalsModule.showToast('Export failed: ' + err.message, 'error');
            }
        };
        
        // Copy Summary
        container.querySelector('#copy-summary-btn').onclick = () => {
            const summary = PlanSharingModule.generatePlanSummary();
            navigator.clipboard.writeText(summary).then(() => {
                ModalsModule.showToast('Summary copied to clipboard', 'success');
            }).catch(() => {
                prompt('Copy this summary:', summary);
            });
        };
    }
    
    // Helper function for mesh message time formatting
    function formatMeshTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString();
    }
    
    // Helper to escape HTML in messages
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // =========================================================================
    // TEAM MANAGEMENT MODALS
    // =========================================================================
    
    /**
     * Open Create Team modal
     */
    function openCreateTeamModal() {
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">➕ Create New Team</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Team Name</label>
                            <input type="text" id="team-name" placeholder="e.g., Sierra Expedition" maxlength="30">
                        </div>
                        
                        <div class="form-group">
                            <label>Description (optional)</label>
                            <input type="text" id="team-desc" placeholder="Brief description of the mission">
                        </div>
                        
                        <div class="form-group">
                            <label>Your Name</label>
                            <input type="text" id="team-my-name" placeholder="Your display name" value="${typeof MeshtasticModule !== 'undefined' ? MeshtasticModule.getConnectionState().nodeName || '' : ''}">
                        </div>
                        
                        <div class="form-group">
                            <label>Your Short Name (4 chars)</label>
                            <input type="text" id="team-my-short" placeholder="e.g., LEAD" maxlength="4" style="text-transform:uppercase">
                        </div>
                        
                        <div style="padding:12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:8px;margin-top:16px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:8px">
                                💡 A unique Team ID and passphrase will be auto-generated. Share these with your team members to let them join.
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-create">Create Team</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelector('#modal-create').onclick = () => {
            const name = modalContainer.querySelector('#team-name').value.trim();
            const desc = modalContainer.querySelector('#team-desc').value.trim();
            const myName = modalContainer.querySelector('#team-my-name').value.trim();
            const myShort = modalContainer.querySelector('#team-my-short').value.trim().toUpperCase();
            
            if (!name) {
                ModalsModule.showToast('Please enter a team name', 'error');
                return;
            }
            
            if (!myName) {
                ModalsModule.showToast('Please enter your name', 'error');
                return;
            }
            
            try {
                const team = TeamModule.createTeam({
                    name: name,
                    description: desc,
                    creatorName: myName,
                    creatorShortName: myShort || myName.substring(0, 4).toUpperCase()
                });
                
                closeModal();
                ModalsModule.showToast(`Team "${team.name}" created!`, 'success');
                
                // Show invite modal immediately
                setTimeout(() => openTeamInviteModal(), 500);
                
                renderTeam();
            } catch (err) {
                ModalsModule.showToast('Error: ' + err.message, 'error');
            }
        };
    }
    
    /**
     * Open Join Team modal
     */
    function openJoinTeamModal() {
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">🔗 Join a Team</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:16px">
                            Enter a team invite code, paste package data, or import a .gdteam file.
                        </p>
                        
                        <div class="form-group">
                            <label>Invite Code or Package Data</label>
                            <textarea id="team-import-data" rows="4" placeholder="GDTEAM:eyJ0Ijoi... or paste JSON package"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>Passphrase (if required)</label>
                            <input type="text" id="team-passphrase" placeholder="e.g., alpha-bravo-42">
                        </div>
                        
                        <div style="text-align:center;margin:16px 0">
                            <span style="color:rgba(255,255,255,0.3);font-size:12px">— or —</span>
                        </div>
                        
                        <label class="btn btn--secondary btn--full" style="cursor:pointer">
                            📁 Import .gdteam File
                            <input type="file" id="team-file-input" accept=".gdteam,.json" style="display:none">
                        </label>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-join">Join Team</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // File import
        modalContainer.querySelector('#team-file-input').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const pkg = await TeamModule.importFromFile(file);
                modalContainer.querySelector('#team-import-data').value = JSON.stringify(pkg);
                ModalsModule.showToast('File loaded, enter passphrase and click Join', 'info');
            } catch (err) {
                ModalsModule.showToast('Error reading file: ' + err.message, 'error');
            }
        };
        
        // Join button
        modalContainer.querySelector('#modal-join').onclick = async () => {
            const data = modalContainer.querySelector('#team-import-data').value.trim();
            const passphrase = modalContainer.querySelector('#team-passphrase').value.trim();
            
            if (!data) {
                ModalsModule.showToast('Please enter invite code or package data', 'error');
                return;
            }
            
            try {
                let packageData = data;
                
                // Try to parse as JSON if not an invite code
                if (!data.startsWith('GDTEAM:')) {
                    try {
                        packageData = JSON.parse(data);
                    } catch (e) {
                        // Keep as string
                    }
                }
                
                const team = await TeamModule.importTeamPackage(packageData, passphrase || undefined);
                
                closeModal();
                ModalsModule.showToast(`Joined team "${team.name}"!`, 'success');
                renderTeam();
            } catch (err) {
                ModalsModule.showToast('Error: ' + err.message, 'error');
            }
        };
    }
    
    /**
     * Open Team Invite modal (for sharing)
     */
    function openTeamInviteModal() {
        if (!TeamModule.isInTeam()) return;
        
        const team = TeamModule.getCurrentTeam();
        const inviteCode = TeamModule.generateInviteCode();
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">📤 Invite to Team</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div style="text-align:center;margin-bottom:20px">
                            <div style="font-size:24px;margin-bottom:8px">👥</div>
                            <div style="font-size:16px;font-weight:600">${escapeHtml(team.name)}</div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.5)">Team ID: ${team.id}</div>
                        </div>
                        
                        <!-- QR Code -->
                        <div style="text-align:center;margin-bottom:20px">
                            <div id="team-qr-container" style="display:inline-block;padding:16px;background:#fff;border-radius:12px">
                                <div style="color:#000;font-size:12px">Loading QR...</div>
                            </div>
                        </div>
                        
                        <!-- Passphrase -->
                        <div style="padding:12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:8px;margin-bottom:16px">
                            <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">PASSPHRASE (share separately)</div>
                            <div style="font-size:16px;font-weight:600;font-family:monospace;letter-spacing:1px">${team.passphrase}</div>
                        </div>
                        
                        <!-- Invite Code -->
                        <div class="form-group">
                            <label>Invite Code</label>
                            <textarea id="invite-code-text" rows="3" readonly style="font-size:10px;font-family:monospace">${inviteCode}</textarea>
                        </div>
                        
                        <div style="display:flex;gap:8px">
                            <button class="btn btn--secondary" id="copy-invite-code" style="flex:1">
                                📋 Copy Code
                            </button>
                            <button class="btn btn--secondary" id="download-team-file" style="flex:1">
                                📁 Download .gdteam
                            </button>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--primary btn--full" id="modal-close-btn">Done</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-close-btn').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Generate QR code
        TeamModule.generateTeamQR(180).then(qrDataUrl => {
            const qrContainer = modalContainer.querySelector('#team-qr-container');
            if (qrContainer) {
                qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="Team QR Code" style="display:block">`;
            }
        });
        
        // Copy invite code
        modalContainer.querySelector('#copy-invite-code').onclick = () => {
            const code = modalContainer.querySelector('#invite-code-text').value;
            navigator.clipboard.writeText(code).then(() => {
                ModalsModule.showToast('Invite code copied!', 'success');
            }).catch(() => {
                modalContainer.querySelector('#invite-code-text').select();
                document.execCommand('copy');
                ModalsModule.showToast('Invite code copied!', 'success');
            });
        };
        
        // Download file
        modalContainer.querySelector('#download-team-file').onclick = () => {
            TeamModule.downloadTeamPackage();
            ModalsModule.showToast('Team file downloaded', 'success');
        };
    }
    
    /**
     * Open Team Settings modal
     */
    function openTeamSettingsModal() {
        if (!TeamModule.isInTeam()) return;
        
        const team = TeamModule.getCurrentTeam();
        const myMember = TeamModule.getMyMember();
        const isLeader = myMember?.role === 'leader';
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">⚙️ Team Settings</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <!-- Team Info -->
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span style="font-size:11px;color:rgba(255,255,255,0.5)">Team ID</span>
                                <span style="font-size:12px;font-family:monospace">${team.id}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span style="font-size:11px;color:rgba(255,255,255,0.5)">Mesh Channel</span>
                                <span style="font-size:12px">Channel ${team.meshChannel}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between">
                                <span style="font-size:11px;color:rgba(255,255,255,0.5)">Passphrase</span>
                                <span style="font-size:12px;font-family:monospace">${team.passphrase}</span>
                            </div>
                        </div>
                        
                        <!-- Comm Plan -->
                        <div class="section-label">Communication Plan</div>
                        <div class="form-group">
                            <label>Primary Frequency</label>
                            <input type="text" id="comm-primary" value="${team.commPlan?.primaryFreq || ''}" placeholder="e.g., 146.520 MHz" ${!isLeader ? 'disabled' : ''}>
                        </div>
                        <div class="form-group">
                            <label>Emergency Word</label>
                            <input type="text" id="comm-emergency" value="${team.commPlan?.emergencyWord || ''}" placeholder="e.g., MAYDAY" ${!isLeader ? 'disabled' : ''}>
                        </div>
                        
                        ${isLeader ? `
                            <div class="divider"></div>
                            <div class="section-label" style="color:#ef4444">Danger Zone</div>
                            <button class="btn btn--secondary btn--full" id="dissolve-team-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.3)">
                                ⚠️ Dissolve Team
                            </button>
                        ` : ''}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        ${isLeader ? `<button class="btn btn--primary" id="modal-save">Save Changes</button>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Save changes
        const saveBtn = modalContainer.querySelector('#modal-save');
        if (saveBtn) {
            saveBtn.onclick = () => {
                try {
                    TeamModule.updateTeam({
                        commPlan: {
                            primaryFreq: modalContainer.querySelector('#comm-primary').value.trim(),
                            emergencyWord: modalContainer.querySelector('#comm-emergency').value.trim()
                        }
                    });
                    closeModal();
                    ModalsModule.showToast('Settings saved', 'success');
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('Error: ' + err.message, 'error');
                }
            };
        }
        
        // Dissolve team
        const dissolveBtn = modalContainer.querySelector('#dissolve-team-btn');
        if (dissolveBtn) {
            dissolveBtn.onclick = () => {
                if (confirm('Are you sure you want to dissolve this team? This action cannot be undone.')) {
                    if (confirm('All members will be removed. Type "DISSOLVE" in the next prompt to confirm.')) {
                        const confirmation = prompt('Type DISSOLVE to confirm:');
                        if (confirmation === 'DISSOLVE') {
                            try {
                                TeamModule.dissolveTeam();
                                closeModal();
                                ModalsModule.showToast('Team dissolved', 'success');
                                renderTeam();
                            } catch (err) {
                                ModalsModule.showToast('Error: ' + err.message, 'error');
                            }
                        }
                    }
                }
            };
        }
    }
    
    /**
     * Open Add Rally Point modal
     */
    function openAddRallyPointModal() {
        if (!TeamModule.isInTeam()) return;
        
        const RALLY_TYPES = TeamModule.RALLY_TYPES;
        const modalContainer = document.getElementById('modal-container');
        
        // Get current map center for default coordinates
        const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">🏁 Add Rally Point</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="rally-name" placeholder="e.g., Trailhead Parking">
                        </div>
                        
                        <div class="form-group">
                            <label>Type</label>
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
                                ${Object.entries(RALLY_TYPES).map(([key, rt]) => `
                                    <button class="btn btn--secondary rally-type-btn ${key === 'primary' ? 'rally-type-btn--selected' : ''}" 
                                            data-rally-type="${key}" 
                                            style="padding:10px;flex-direction:column;gap:4px;${key === 'primary' ? 'border-color:' + rt.color : ''}">
                                        <span style="font-size:18px">${rt.icon}</span>
                                        <span style="font-size:10px">${rt.name.split(' ')[0]}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div style="display:flex;gap:8px">
                            <div class="form-group" style="flex:1">
                                <label>Latitude</label>
                                <input type="number" id="rally-lat" step="0.0001" value="${mapState.lat.toFixed(4)}">
                            </div>
                            <div class="form-group" style="flex:1">
                                <label>Longitude</label>
                                <input type="number" id="rally-lon" step="0.0001" value="${mapState.lon.toFixed(4)}">
                            </div>
                        </div>
                        
                        <button class="btn btn--secondary btn--full" id="use-gps-btn" style="margin-bottom:16px">
                            📍 Use Current GPS Location
                        </button>
                        
                        <div class="form-group">
                            <label>Schedule (optional)</label>
                            <input type="text" id="rally-schedule" placeholder="e.g., Every 2 hours, or 0800 daily">
                        </div>
                        
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="rally-notes" rows="2" placeholder="Additional instructions..."></textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-add">Add Rally Point</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        let selectedType = 'primary';
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Type selection
        modalContainer.querySelectorAll('.rally-type-btn').forEach(btn => {
            btn.onclick = () => {
                modalContainer.querySelectorAll('.rally-type-btn').forEach(b => {
                    b.classList.remove('rally-type-btn--selected');
                    b.style.borderColor = '';
                });
                btn.classList.add('rally-type-btn--selected');
                btn.style.borderColor = RALLY_TYPES[btn.dataset.rallyType].color;
                selectedType = btn.dataset.rallyType;
            };
        });
        
        // Use GPS button
        modalContainer.querySelector('#use-gps-btn').onclick = () => {
            // First check GPSModule for existing position (including manual)
            if (typeof GPSModule !== 'undefined') {
                const gpsPos = GPSModule.getPosition();
                if (gpsPos && gpsPos.lat && gpsPos.lon) {
                    modalContainer.querySelector('#rally-lat').value = gpsPos.lat.toFixed(4);
                    modalContainer.querySelector('#rally-lon').value = gpsPos.lon.toFixed(4);
                    ModalsModule.showToast(gpsPos.isManual ? 'Manual position set' : 'GPS location set', 'success');
                    return;
                }
            }
            
            // Fallback to browser geolocation
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        modalContainer.querySelector('#rally-lat').value = pos.coords.latitude.toFixed(4);
                        modalContainer.querySelector('#rally-lon').value = pos.coords.longitude.toFixed(4);
                        ModalsModule.showToast('GPS location set', 'success');
                    },
                    (err) => {
                        ModalsModule.showToast('Could not get GPS. Try setting manual position in Team panel.', 'error');
                    },
                    { enableHighAccuracy: true }
                );
            } else {
                ModalsModule.showToast('Geolocation not supported. Set manual position in Team panel.', 'error');
            }
        };
        
        // Add button
        modalContainer.querySelector('#modal-add').onclick = () => {
            const name = modalContainer.querySelector('#rally-name').value.trim();
            const lat = parseFloat(modalContainer.querySelector('#rally-lat').value);
            const lon = parseFloat(modalContainer.querySelector('#rally-lon').value);
            const schedule = modalContainer.querySelector('#rally-schedule').value.trim();
            const notes = modalContainer.querySelector('#rally-notes').value.trim();
            
            if (!name) {
                ModalsModule.showToast('Please enter a name', 'error');
                return;
            }
            
            if (isNaN(lat) || isNaN(lon)) {
                ModalsModule.showToast('Please enter valid coordinates', 'error');
                return;
            }
            
            try {
                TeamModule.addRallyPoint({
                    name: name,
                    type: selectedType,
                    lat: lat,
                    lon: lon,
                    schedule: schedule,
                    notes: notes
                });
                
                closeModal();
                ModalsModule.showToast('Rally point added', 'success');
                renderTeam();
            } catch (err) {
                ModalsModule.showToast('Error: ' + err.message, 'error');
            }
        };
    }
    
    /**
     * Open Team Member detail modal
     */
    function openTeamMemberModal(member) {
        const ROLES = TeamModule.ROLES;
        const role = ROLES[member.role] || ROLES.support;
        const myMember = TeamModule.getMyMember();
        const canEdit = myMember?.role === 'leader' || myMember?.role === 'coleader';
        const isMe = member.id === myMember?.id;
        const modalContainer = document.getElementById('modal-container');
        
        const lastSeenText = member.lastSeen 
            ? formatMeshTime(member.lastSeen)
            : 'Unknown';
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:380px">
                    <div class="modal__header">
                        <h3 class="modal__title">${role.icon} ${escapeHtml(member.name)}</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div style="text-align:center;margin-bottom:20px">
                            <div style="width:60px;height:60px;border-radius:50%;background:${role.color}22;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px">
                                ${role.icon}
                            </div>
                            <div style="font-size:14px;color:${role.color}">${role.name}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                                ${member.shortName || 'N/A'} • ${isMe ? 'This is you' : `Last seen: ${lastSeenText}`}
                            </div>
                        </div>
                        
                        ${member.lat && member.lon ? `
                            <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px">
                                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:4px">LAST KNOWN POSITION</div>
                                <div style="font-size:13px;font-family:monospace">${member.lat.toFixed(4)}°, ${member.lon.toFixed(4)}°</div>
                            </div>
                            <button class="btn btn--secondary btn--full" id="goto-member-btn" style="margin-bottom:16px">
                                🎯 Go to Location
                            </button>
                        ` : ''}
                        
                        ${canEdit && !isMe ? `
                            <div class="section-label">Change Role</div>
                            <select id="member-role-select" style="margin-bottom:16px">
                                ${Object.entries(ROLES).map(([key, r]) => `
                                    <option value="${key}" ${member.role === key ? 'selected' : ''}>${r.icon} ${r.name}</option>
                                `).join('')}
                            </select>
                            
                            <button class="btn btn--secondary btn--full" id="remove-member-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.3)">
                                Remove from Team
                            </button>
                        ` : ''}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary btn--full" id="modal-close-btn">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-close-btn').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Go to location
        const gotoBtn = modalContainer.querySelector('#goto-member-btn');
        if (gotoBtn) {
            gotoBtn.onclick = () => {
                if (member.lat && member.lon && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(member.lat, member.lon, 15);
                    closeModal();
                    ModalsModule.showToast(`Centered on ${member.name}`, 'info');
                }
            };
        }
        
        // Change role
        const roleSelect = modalContainer.querySelector('#member-role-select');
        if (roleSelect) {
            roleSelect.onchange = () => {
                try {
                    TeamModule.setMemberRole(member.id, roleSelect.value);
                    ModalsModule.showToast('Role updated', 'success');
                    closeModal();
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('Error: ' + err.message, 'error');
                }
            };
        }
        
        // Remove member
        const removeBtn = modalContainer.querySelector('#remove-member-btn');
        if (removeBtn) {
            removeBtn.onclick = () => {
                if (confirm(`Remove ${member.name} from the team?`)) {
                    try {
                        TeamModule.removeMember(member.id);
                        closeModal();
                        ModalsModule.showToast('Member removed', 'success');
                        renderTeam();
                    } catch (err) {
                        ModalsModule.showToast('Error: ' + err.message, 'error');
                    }
                }
            };
        }
    }

    /**
     * Open detailed team member modal with distance/bearing
     */
    function openTeamMemberDetailModal(member) {
        const ROLES = TeamModule.ROLES;
        const role = ROLES[member.role] || ROLES.support;
        const myMember = TeamModule.getMyMember();
        const canEdit = myMember?.role === 'leader' || myMember?.role === 'coleader';
        const isMe = member.id === myMember?.id;
        const modalContainer = document.getElementById('modal-container');
        
        // Get GPS position for distance/bearing
        const gpsState = typeof GPSModule !== 'undefined' ? GPSModule.getState() : null;
        const myPos = gpsState?.position ? { lat: gpsState.position.lat, lon: gpsState.position.lon } : null;
        
        // Calculate distance/bearing
        let distInfo = null;
        if (!isMe && myPos && member.lat && member.lon) {
            distInfo = TeamModule.getDistanceToMember(member.id, myPos);
        }
        
        const lastSeenText = member.lastSeen ? formatMeshTime(member.lastSeen) : 'Unknown';
        const statusColor = member.status === 'active' ? '#22c55e' : member.status === 'stale' ? '#f59e0b' : '#6b7280';
        const statusText = member.status === 'active' ? 'Active' : member.status === 'stale' ? 'Stale' : 'Offline';
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:400px">
                    <div class="modal__header">
                        <h3 class="modal__title">${role.icon} ${escapeHtml(member.name)}</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <!-- Member Header -->
                        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
                            <div style="position:relative">
                                <div style="width:64px;height:64px;border-radius:12px;background:${role.color}22;display:flex;align-items:center;justify-content:center;font-size:32px">
                                    ${role.icon}
                                </div>
                                <div style="position:absolute;bottom:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:${statusColor};border:3px solid #1a1f2e"></div>
                            </div>
                            <div style="flex:1">
                                <div style="font-size:16px;font-weight:600">${escapeHtml(member.name)}</div>
                                <div style="font-size:12px;color:${role.color}">${role.name}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                                    ${member.shortName || 'N/A'} • ${statusText}
                                </div>
                            </div>
                        </div>
                        
                        ${isMe ? `
                            <div style="padding:12px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:10px;text-align:center;margin-bottom:16px">
                                <span style="font-size:12px;color:#f97316">This is you</span>
                            </div>
                        ` : ''}
                        
                        <!-- Distance/Bearing Card -->
                        ${!isMe && distInfo ? `
                            <div style="padding:16px;background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(59,130,246,0.05));border:1px solid rgba(59,130,246,0.2);border-radius:12px;margin-bottom:16px">
                                <div style="display:flex;justify-content:space-between;align-items:center">
                                    <div>
                                        <div style="font-size:24px;font-weight:700;color:#3b82f6">${distInfo.formatted}</div>
                                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">Distance from you</div>
                                    </div>
                                    <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px">
                                        <div style="font-size:20px;font-weight:600">${distInfo.compass}</div>
                                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">${Math.round(distInfo.bearing)}°</div>
                                    </div>
                                </div>
                            </div>
                        ` : !isMe && member.lat && member.lon && !myPos ? `
                            <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;text-align:center;margin-bottom:16px;font-size:11px;color:rgba(255,255,255,0.4)">
                                Enable GPS to see distance and bearing
                            </div>
                        ` : ''}
                        
                        <!-- Position Info -->
                        ${member.lat && member.lon ? `
                            <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:16px">
                                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:6px">LAST KNOWN POSITION</div>
                                <div style="font-size:13px;font-family:'IBM Plex Mono',monospace">${member.lat.toFixed(5)}°, ${member.lon.toFixed(5)}°</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:4px">Updated ${lastSeenText}</div>
                            </div>
                            <button class="btn btn--primary btn--full" id="goto-member-btn" style="margin-bottom:16px">
                                🎯 Go to Location on Map
                            </button>
                        ` : `
                            <div style="padding:16px;background:rgba(255,255,255,0.03);border-radius:10px;text-align:center;margin-bottom:16px">
                                <div style="font-size:24px;margin-bottom:8px">📍</div>
                                <div style="font-size:12px;color:rgba(255,255,255,0.4)">No position data available</div>
                            </div>
                        `}
                        
                        <!-- Role Management (for leaders) -->
                        ${canEdit && !isMe ? `
                            <div class="divider" style="margin:16px 0"></div>
                            
                            <div class="section-label">Member Management</div>
                            
                            <div style="margin-bottom:12px">
                                <label style="font-size:11px;color:rgba(255,255,255,0.4);display:block;margin-bottom:6px">Change Role</label>
                                <select id="member-role-select" style="width:100%">
                                    ${Object.entries(ROLES).map(([key, r]) => `
                                        <option value="${key}" ${member.role === key ? 'selected' : ''}>${r.icon} ${r.name}</option>
                                    `).join('')}
                                </select>
                            </div>
                            
                            <button class="btn btn--secondary btn--full" id="remove-member-btn" style="color:#ef4444;border-color:rgba(239,68,68,0.3)">
                                🚫 Remove from Team
                            </button>
                        ` : ''}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary btn--full" id="modal-close-btn">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-close-btn').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Go to location
        const gotoBtn = modalContainer.querySelector('#goto-member-btn');
        if (gotoBtn) {
            gotoBtn.onclick = () => {
                if (member.lat && member.lon && typeof MapModule !== 'undefined') {
                    MapModule.setCenter(member.lat, member.lon, 15);
                    closeModal();
                    ModalsModule.showToast(`Centered on ${member.name}`, 'info');
                }
            };
        }
        
        // Change role
        const roleSelect = modalContainer.querySelector('#member-role-select');
        if (roleSelect) {
            roleSelect.onchange = () => {
                try {
                    TeamModule.setMemberRole(member.id, roleSelect.value);
                    ModalsModule.showToast('Role updated', 'success');
                    closeModal();
                    renderTeam();
                } catch (err) {
                    ModalsModule.showToast('Error: ' + err.message, 'error');
                }
            };
        }
        
        // Remove member
        const removeBtn = modalContainer.querySelector('#remove-member-btn');
        if (removeBtn) {
            removeBtn.onclick = () => {
                if (confirm(`Remove ${member.name} from the team?`)) {
                    try {
                        TeamModule.removeMember(member.id);
                        ModalsModule.showToast('Member removed', 'success');
                        closeModal();
                        renderTeam();
                    } catch (err) {
                        ModalsModule.showToast('Error: ' + err.message, 'error');
                    }
                }
            };
        }
    }

    /**
     * Open comm plan editing modal
     */
    function openCommPlanModal() {
        const currentTeam = TeamModule.getCurrentTeam();
        if (!currentTeam) return;
        
        const commPlan = currentTeam.commPlan || {};
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:450px">
                    <div class="modal__header">
                        <h3 class="modal__title">📡 Comm Plan</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <!-- Frequencies -->
                        <div class="section-label">Radio Frequencies</div>
                        <div class="form-group">
                            <label>Primary Frequency</label>
                            <input type="text" id="comm-primary-freq" value="${commPlan.primaryFreq || ''}" 
                                placeholder="e.g., 146.520 MHz">
                        </div>
                        <div class="form-group">
                            <label>Backup Frequency</label>
                            <input type="text" id="comm-backup-freq" value="${commPlan.backupFreq || ''}" 
                                placeholder="e.g., 462.5625 MHz">
                        </div>
                        
                        <div class="divider"></div>
                        
                        <!-- Emergency Word -->
                        <div class="section-label">Emergency Protocol</div>
                        <div class="form-group">
                            <label>Emergency Code Word</label>
                            <input type="text" id="comm-emergency-word" value="${commPlan.emergencyWord || ''}" 
                                placeholder="e.g., AVALANCHE">
                            <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                                Say this word to trigger emergency response
                            </div>
                        </div>
                        
                        <div class="divider"></div>
                        
                        <!-- Check-In Times -->
                        <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                            <span>Scheduled Check-Ins</span>
                            <button class="btn btn--secondary" id="add-checkin-btn" style="padding:2px 8px;font-size:10px">+ Add</button>
                        </div>
                        
                        <div id="checkin-list" style="margin-bottom:16px">
                            ${(commPlan.checkInTimes || []).map((ci, i) => `
                                <div style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px" data-checkin-index="${i}">
                                    <span style="font-size:14px">⏰</span>
                                    <input type="time" value="${ci.time || ''}" data-checkin-time="${i}" style="flex:1">
                                    <select data-checkin-freq="${i}" style="width:90px;padding:6px">
                                        <option value="daily" ${ci.frequency === 'daily' ? 'selected' : ''}>Daily</option>
                                        <option value="hourly" ${ci.frequency === 'hourly' ? 'selected' : ''}>Hourly</option>
                                        <option value="once" ${ci.frequency === 'once' ? 'selected' : ''}>Once</option>
                                    </select>
                                    <button class="btn btn--secondary" data-remove-checkin="${i}" style="padding:4px 8px;color:#ef4444">✕</button>
                                </div>
                            `).join('')}
                            ${(commPlan.checkInTimes || []).length === 0 ? `
                                <div style="padding:12px;text-align:center;font-size:11px;color:rgba(255,255,255,0.4)">
                                    No scheduled check-ins
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="divider"></div>
                        
                        <!-- Signal Plan -->
                        <div class="section-label">Signal Plan Notes</div>
                        <div class="form-group" style="margin-bottom:0">
                            <textarea id="comm-signal-plan" rows="3" 
                                placeholder="Visual/audio signals, contingency procedures...">${commPlan.signalPlan || ''}</textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="save-commplan-btn">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Add check-in
        modalContainer.querySelector('#add-checkin-btn').onclick = () => {
            const list = modalContainer.querySelector('#checkin-list');
            const emptyMsg = list.querySelector('div[style*="text-align:center"]');
            if (emptyMsg) emptyMsg.remove();
            
            const index = list.children.length;
            const newItem = document.createElement('div');
            newItem.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px';
            newItem.dataset.checkinIndex = index;
            newItem.innerHTML = `
                <span style="font-size:14px">⏰</span>
                <input type="time" value="08:00" data-checkin-time="${index}" style="flex:1">
                <select data-checkin-freq="${index}" style="width:90px;padding:6px">
                    <option value="daily" selected>Daily</option>
                    <option value="hourly">Hourly</option>
                    <option value="once">Once</option>
                </select>
                <button class="btn btn--secondary" data-remove-checkin="${index}" style="padding:4px 8px;color:#ef4444">✕</button>
            `;
            list.appendChild(newItem);
            
            // Attach remove handler
            newItem.querySelector('[data-remove-checkin]').onclick = function() {
                newItem.remove();
            };
        };
        
        // Remove check-in handlers
        modalContainer.querySelectorAll('[data-remove-checkin]').forEach(btn => {
            btn.onclick = () => {
                btn.closest('[data-checkin-index]').remove();
            };
        });
        
        // Save
        modalContainer.querySelector('#save-commplan-btn').onclick = () => {
            // Gather check-in times
            const checkInTimes = [];
            modalContainer.querySelectorAll('[data-checkin-index]').forEach(item => {
                const timeInput = item.querySelector('[data-checkin-time]');
                const freqSelect = item.querySelector('[data-checkin-freq]');
                if (timeInput?.value) {
                    checkInTimes.push({
                        id: Helpers.generateId(),
                        time: timeInput.value,
                        frequency: freqSelect?.value || 'daily'
                    });
                }
            });
            
            const updates = {
                primaryFreq: modalContainer.querySelector('#comm-primary-freq').value.trim(),
                backupFreq: modalContainer.querySelector('#comm-backup-freq').value.trim(),
                emergencyWord: modalContainer.querySelector('#comm-emergency-word').value.trim().toUpperCase(),
                signalPlan: modalContainer.querySelector('#comm-signal-plan').value.trim(),
                checkInTimes: checkInTimes
            };
            
            try {
                TeamModule.updateCommPlan(updates);
                ModalsModule.showToast('Comm plan saved', 'success');
                closeModal();
                renderTeam();
            } catch (err) {
                ModalsModule.showToast('Error: ' + err.message, 'error');
            }
        };
    }

    /**
     * Open modal to select waypoint for mesh sharing
     */
    function openMeshShareWaypointModal() {
        const waypoints = State.get('waypoints') || [];
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:400px">
                    <div class="modal__header">
                        <h3 class="modal__title">📍 Share Waypoint via Mesh</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                            Select a waypoint to share with your team over the mesh network.
                        </p>
                        <div style="max-height:300px;overflow-y:auto">
                            ${waypoints.map(wp => {
                                const type = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
                                return `
                                    <div class="card" style="margin-bottom:8px;cursor:pointer" data-share-wp="${wp.id}">
                                        <div class="card__header">
                                            <div class="card__icon" style="background:${type.color}22">${type.icon}</div>
                                            <div>
                                                <div class="card__title">${wp.name}</div>
                                                <div class="card__subtitle">${type.label}</div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelectorAll('[data-share-wp]').forEach(card => {
            card.onclick = async () => {
                const wp = waypoints.find(w => w.id === card.dataset.shareWp);
                if (wp) {
                    closeModal();
                    await MeshtasticModule.shareWaypoint(wp);
                }
            };
        });
    }
    
    /**
     * Open modal to select route for mesh sharing
     */
    function openMeshShareRouteModal() {
        const routes = State.get('routes') || [];
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:400px">
                    <div class="modal__header">
                        <h3 class="modal__title">🛤️ Share Route via Mesh</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                            Select a route to share. Large routes will be sent in chunks.
                        </p>
                        <div style="max-height:300px;overflow-y:auto">
                            ${routes.filter(r => !r.isBuilding).map(route => `
                                <div class="card" style="margin-bottom:8px;cursor:pointer" data-share-route="${route.id}">
                                    <div class="card__header">
                                        <div class="card__icon" style="background:rgba(249,115,22,0.15);color:#f97316">${Icons.get('route')}</div>
                                        <div>
                                            <div class="card__title">${route.name}</div>
                                            <div class="card__subtitle">${route.distance || '?'} mi • ${route.points?.length || 0} points</div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelectorAll('[data-share-route]').forEach(card => {
            card.onclick = async () => {
                const route = routes.find(r => r.id === card.dataset.shareRoute);
                if (route) {
                    closeModal();
                    await MeshtasticModule.shareRoute(route);
                }
            };
        });
    }
    
    /**
     * Open Export Plan Modal
     */
    function openExportModal() {
        const waypoints = State.get('waypoints') || [];
        const routes = State.get('routes') || [];
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:420px">
                    <div class="modal__header">
                        <h3 class="modal__title">📦 Export Plan Package</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:16px">
                            Create an encrypted package to share with your team via AirDrop, email, SD card, or mesh.
                        </p>
                        
                        <div class="form-group">
                            <label>Plan Name</label>
                            <input type="text" id="export-plan-name" value="Mission Plan" placeholder="Enter plan name">
                        </div>
                        
                        <div class="form-group">
                            <label>Your Name (optional)</label>
                            <input type="text" id="export-creator-name" placeholder="e.g., Alpha-1">
                        </div>
                        
                        <div class="form-group">
                            <label>Description (optional)</label>
                            <textarea id="export-description" rows="2" placeholder="Brief description of this plan..."></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>Encryption Passphrase *</label>
                            <input type="password" id="export-passphrase" placeholder="Min 4 characters">
                            <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">
                                Share this passphrase with your team separately
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Confirm Passphrase *</label>
                            <input type="password" id="export-passphrase-confirm" placeholder="Confirm passphrase">
                        </div>
                        
                        <!-- What's Included -->
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-top:12px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px">PACKAGE CONTENTS</div>
                            <div style="display:flex;gap:16px;font-size:13px">
                                <span>📍 ${waypoints.length} waypoints</span>
                                <span>🛣️ ${routes.length} routes</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-export">
                            ${Icons.get('export')} Export
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelector('#modal-export').onclick = async () => {
            const planName = modalContainer.querySelector('#export-plan-name').value || 'Mission Plan';
            const creatorName = modalContainer.querySelector('#export-creator-name').value;
            const description = modalContainer.querySelector('#export-description').value;
            const passphrase = modalContainer.querySelector('#export-passphrase').value;
            const passphraseConfirm = modalContainer.querySelector('#export-passphrase-confirm').value;
            
            if (passphrase.length < 4) {
                ModalsModule.showToast('Passphrase must be at least 4 characters', 'error');
                return;
            }
            
            if (passphrase !== passphraseConfirm) {
                ModalsModule.showToast('Passphrases do not match', 'error');
                return;
            }
            
            try {
                const filename = await PlanSharingModule.downloadPlan(passphrase, {
                    planName,
                    creatorName,
                    description
                });
                closeModal();
                ModalsModule.showToast(`Plan exported: ${filename}`, 'success');
            } catch (err) {
                ModalsModule.showToast('Export failed: ' + err.message, 'error');
            }
        };
    }
    
    /**
     * Open Import Modal (for encrypted files)
     */
    function openImportModal(fileContent, filename) {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:400px">
                    <div class="modal__header">
                        <h3 class="modal__title">🔐 Decrypt Plan</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <p style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:16px">
                            This plan package is encrypted. Enter the passphrase to decrypt it.
                        </p>
                        
                        <div style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:16px">
                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">FILE</div>
                            <div style="font-size:13px;word-break:break-all">${filename}</div>
                        </div>
                        
                        <div class="form-group">
                            <label>Passphrase</label>
                            <input type="password" id="import-passphrase" placeholder="Enter passphrase" autofocus>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-decrypt">
                            🔓 Decrypt & Import
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelector('#modal-decrypt').onclick = async () => {
            const passphrase = modalContainer.querySelector('#import-passphrase').value;
            
            if (!passphrase) {
                ModalsModule.showToast('Please enter the passphrase', 'error');
                return;
            }
            
            try {
                const planData = await PlanSharingModule.parsePlanFile(fileContent, passphrase);
                closeModal();
                showConflictResolution(planData, filename);
            } catch (err) {
                ModalsModule.showToast('Decryption failed. Check passphrase.', 'error');
            }
        };
        
        // Allow Enter key to submit
        modalContainer.querySelector('#import-passphrase').onkeypress = (e) => {
            if (e.key === 'Enter') {
                modalContainer.querySelector('#modal-decrypt').click();
            }
        };
    }
    
    /**
     * Show Conflict Resolution UI
     */
    function showConflictResolution(planData, filename) {
        const conflicts = PlanSharingModule.analyzeConflicts(planData);
        const hasConflicts = conflicts.waypoints.length > 0 || conflicts.routes.length > 0;
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:500px;max-height:85vh">
                    <div class="modal__header">
                        <h3 class="modal__title">📥 Import Plan</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body" style="max-height:60vh;overflow-y:auto">
                        <!-- Plan Info -->
                        <div style="padding:12px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);border-radius:10px;margin-bottom:16px">
                            <div style="font-size:14px;font-weight:600;margin-bottom:4px">${planData.planName || 'Imported Plan'}</div>
                            <div style="font-size:12px;color:rgba(255,255,255,0.5)">
                                ${planData.creator ? `From: ${planData.creator} • ` : ''}
                                ${new Date(planData.created).toLocaleString()}
                            </div>
                            ${planData.description ? `<div style="font-size:12px;color:rgba(255,255,255,0.6);margin-top:8px">${planData.description}</div>` : ''}
                        </div>
                        
                        <!-- Summary -->
                        <div style="display:flex;gap:12px;margin-bottom:16px">
                            <div style="flex:1;padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:600;color:#22c55e">${conflicts.newWaypoints.length}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5)">New Waypoints</div>
                            </div>
                            <div style="flex:1;padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;text-align:center">
                                <div style="font-size:20px;font-weight:600;color:#22c55e">${conflicts.newRoutes.length}</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5)">New Routes</div>
                            </div>
                            ${hasConflicts ? `
                                <div style="flex:1;padding:12px;background:rgba(249,115,22,0.1);border-radius:8px;text-align:center">
                                    <div style="font-size:20px;font-weight:600;color:#f97316">${conflicts.waypoints.length + conflicts.routes.length}</div>
                                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">Conflicts</div>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${hasConflicts ? `
                            <!-- Conflicts Section -->
                            <div class="section-label" style="color:#f97316">⚠️ Resolve Conflicts</div>
                            
                            ${conflicts.waypoints.map((c, i) => `
                                <div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:8px">
                                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                                        <div>
                                            <div style="font-size:13px;font-weight:500">📍 ${c.imported.name}</div>
                                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                                                ${c.type === 'name_collision' ? 'Name already exists' : 'Modified version exists'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn--secondary conflict-btn" data-conflict="waypoint_${c.imported.id}" data-action="skip" style="flex:1;padding:8px;font-size:11px">
                                            Skip
                                        </button>
                                        <button class="btn btn--secondary conflict-btn" data-conflict="waypoint_${c.imported.id}" data-action="replace" style="flex:1;padding:8px;font-size:11px">
                                            Replace
                                        </button>
                                        <button class="btn btn--secondary conflict-btn" data-conflict="waypoint_${c.imported.id}" data-action="keep_both" style="flex:1;padding:8px;font-size:11px">
                                            Keep Both
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                            
                            ${conflicts.routes.map((c, i) => `
                                <div style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:8px">
                                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
                                        <div>
                                            <div style="font-size:13px;font-weight:500">🛣️ ${c.imported.name}</div>
                                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                                                ${c.type === 'name_collision' ? 'Name already exists' : 'Modified version exists'}
                                            </div>
                                        </div>
                                    </div>
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn--secondary conflict-btn" data-conflict="route_${c.imported.id}" data-action="skip" style="flex:1;padding:8px;font-size:11px">
                                            Skip
                                        </button>
                                        <button class="btn btn--secondary conflict-btn" data-conflict="route_${c.imported.id}" data-action="replace" style="flex:1;padding:8px;font-size:11px">
                                            Replace
                                        </button>
                                        <button class="btn btn--secondary conflict-btn" data-conflict="route_${c.imported.id}" data-action="keep_both" style="flex:1;padding:8px;font-size:11px">
                                            Keep Both
                                        </button>
                                        <button class="btn btn--secondary conflict-btn" data-conflict="route_${c.imported.id}" data-action="merge" style="flex:1;padding:8px;font-size:11px">
                                            Merge
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        ` : `
                            <div style="padding:20px;text-align:center;color:rgba(255,255,255,0.5)">
                                <div style="font-size:24px;margin-bottom:8px">✓</div>
                                <div>No conflicts detected. Ready to import!</div>
                            </div>
                        `}
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--success" id="modal-import">
                            ${Icons.get('download')} Import ${conflicts.newWaypoints.length + conflicts.newRoutes.length + conflicts.waypoints.length + conflicts.routes.length} Items
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Track conflict resolutions
        const resolutions = {};
        
        // Set default resolutions to 'skip' for conflicts, implicit 'add' for new items
        conflicts.waypoints.forEach(c => { resolutions[`waypoint_${c.imported.id}`] = 'skip'; });
        conflicts.routes.forEach(c => { resolutions[`route_${c.imported.id}`] = 'skip'; });
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        // Conflict resolution buttons
        modalContainer.querySelectorAll('.conflict-btn').forEach(btn => {
            btn.onclick = () => {
                const conflictId = btn.dataset.conflict;
                const action = btn.dataset.action;
                
                // Update resolution
                resolutions[conflictId] = action;
                
                // Update button states
                const siblings = btn.parentElement.querySelectorAll('.conflict-btn');
                siblings.forEach(s => {
                    s.classList.remove('btn--primary');
                    s.classList.add('btn--secondary');
                });
                btn.classList.remove('btn--secondary');
                btn.classList.add('btn--primary');
            };
        });
        
        // Import button
        modalContainer.querySelector('#modal-import').onclick = async () => {
            try {
                const result = await PlanSharingModule.mergePlan(planData, resolutions);
                closeModal();
                
                const total = result.waypoints.added + result.waypoints.updated + 
                              result.routes.added + result.routes.updated;
                
                ModalsModule.showToast(
                    `Imported: ${result.waypoints.added} waypoints, ${result.routes.added} routes`,
                    'success'
                );
                
                // Refresh the map and panels
                if (typeof MapModule !== 'undefined') MapModule.render();
                renderTeam();
                
            } catch (err) {
                ModalsModule.showToast('Import failed: ' + err.message, 'error');
            }
        };
    }

    /**
     * GPS Panel - Location tracking, breadcrumbs, and navigation
     */
    /**
     * Render Manual Position card for GPS panel
     */
    function renderManualPositionCard() {
        if (typeof GPSModule === 'undefined') return '';
        
        const manualPos = GPSModule.getManualPosition();
        const isUsingManual = GPSModule.isUsingManualPosition();
        const preferManual = GPSModule.isPreferManual();
        const gpsState = GPSModule.getState();
        const hasGPSFix = gpsState.currentPosition !== null;
        
        return `
            <div style="margin-bottom:16px">
                <div class="section-label" style="display:flex;align-items:center;gap:8px">
                    📌 Manual Position
                    <span style="font-size:10px;color:rgba(255,255,255,0.3);font-weight:400">For use without GPS</span>
                </div>
                
                <div style="padding:14px;background:${manualPos ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)'};border:1px solid ${manualPos ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:12px">
                    
                    ${manualPos ? `
                        <!-- Manual Position Set -->
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                            <div style="width:40px;height:40px;border-radius:10px;background:rgba(168,85,247,0.2);display:flex;align-items:center;justify-content:center">
                                <span style="font-size:18px">📌</span>
                            </div>
                            <div style="flex:1">
                                <div style="font-size:13px;font-weight:600;color:#a855f7;font-family:monospace">
                                    ${manualPos.lat.toFixed(6)}, ${manualPos.lon.toFixed(6)}
                                </div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                    ${manualPos.name ? manualPos.name : 'Manual position'}
                                    ${manualPos.altitude ? ` • ${Math.round(manualPos.altitude)}m alt` : ''}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Position Formats -->
                        <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px;font-size:11px;font-family:monospace">
                            ${typeof Coordinates !== 'undefined' ? `
                                <div style="margin-bottom:4px"><span style="color:rgba(255,255,255,0.4)">DD:</span> ${Coordinates.toDD(manualPos.lat, manualPos.lon)}</div>
                                <div style="margin-bottom:4px"><span style="color:rgba(255,255,255,0.4)">DMS:</span> ${Coordinates.toDMS(manualPos.lat, manualPos.lon)}</div>
                                <div style="margin-bottom:4px"><span style="color:rgba(255,255,255,0.4)">UTM:</span> ${Coordinates.toUTM(manualPos.lat, manualPos.lon)}</div>
                                <div><span style="color:rgba(255,255,255,0.4)">MGRS:</span> ${Coordinates.toMGRS(manualPos.lat, manualPos.lon)}</div>
                            ` : `${manualPos.lat.toFixed(6)}, ${manualPos.lon.toFixed(6)}`}
                        </div>
                        
                        <!-- Status Indicator -->
                        <div style="padding:8px;background:${isUsingManual ? 'rgba(168,85,247,0.15)' : 'rgba(34,197,94,0.15)'};border-radius:6px;font-size:11px;text-align:center;margin-bottom:12px;color:${isUsingManual ? '#a855f7' : '#22c55e'}">
                            ${isUsingManual 
                                ? '✓ Using manual position' + (preferManual ? ' (preferred)' : ' (GPS inactive)')
                                : '✓ GPS active - using GPS position'}
                        </div>
                        
                        <!-- Prefer Manual Toggle -->
                        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,0.7);cursor:pointer;margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">
                            <input type="checkbox" id="gps-prefer-manual" ${preferManual ? 'checked' : ''} style="width:16px;height:16px">
                            <span>Always prefer manual position over GPS</span>
                        </label>
                        
                        <!-- Buttons -->
                        <div style="display:flex;gap:8px">
                            <button class="btn btn--secondary" id="gps-edit-manual" style="flex:1;font-size:12px">
                                ✏️ Edit Position
                            </button>
                            <button class="btn btn--secondary" id="gps-clear-manual" style="font-size:12px;color:#ef4444">
                                ✕ Clear
                            </button>
                        </div>
                    ` : `
                        <!-- No Manual Position -->
                        <div style="text-align:center;padding:8px 0 12px 0">
                            <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:4px">No manual position set</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                                ${hasGPSFix 
                                    ? 'Using GPS position. Set manual for GPS-denied environments.'
                                    : 'Set a manual position when GPS is unavailable.'}
                            </div>
                        </div>
                        
                        <button class="btn btn--primary btn--full" id="gps-set-manual" style="font-size:13px">
                            📌 Set Manual Position
                        </button>
                        
                        <div style="margin-top:10px;font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                            Supports: Decimal, DMS, UTM, MGRS formats
                        </div>
                    `}
                </div>
            </div>
            
            <div class="divider"></div>
        `;
    }

    function renderGPS() {
        // Check GPS module availability
        if (typeof GPSModule === 'undefined') {
            container.innerHTML = `
                <div class="panel__header"><h2 class="panel__title">GPS</h2></div>
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('alert')}</div>
                    <div class="empty-state__title">GPS Module Not Loaded</div>
                    <div class="empty-state__desc">GPS functionality is not available.</div>
                </div>
            `;
            return;
        }
        
        const gpsState = GPSModule.getState();
        const position = gpsState.currentPosition;
        const isTracking = gpsState.isTracking;
        const isRecording = gpsState.isRecording;
        const recordedTrack = GPSModule.getRecordedTrack();
        const waypoints = State.get('waypoints') || [];
        const selectedNavTarget = State.get('gpsNavTarget');
        
        // Get navigation info if we have a target
        let navInfo = null;
        if (selectedNavTarget && position) {
            const targetWp = waypoints.find(w => w.id === selectedNavTarget);
            if (targetWp) {
                const targetLat = targetWp.lat || (37.4215 + (targetWp.y - 50) * 0.002);
                const targetLon = targetWp.lon || (-119.1892 + (targetWp.x - 50) * 0.004);
                navInfo = GPSModule.getNavigationTo(targetLat, targetLon);
                navInfo.waypoint = targetWp;
            }
        }
        
        // Get all waypoint distances for the list
        let waypointDistances = [];
        if (position) {
            waypointDistances = waypoints.map(wp => {
                const lat = wp.lat || (37.4215 + (wp.y - 50) * 0.002);
                const lon = wp.lon || (-119.1892 + (wp.x - 50) * 0.004);
                const nav = GPSModule.getNavigationTo(lat, lon);
                return { ...wp, nav };
            }).filter(wp => wp.nav).sort((a, b) => a.nav.distance - b.nav.distance);
        }
        
        // Format position display
        const formatCoord = (lat, lon) => {
            const latDir = lat >= 0 ? 'N' : 'S';
            const lonDir = lon >= 0 ? 'E' : 'W';
            return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lon).toFixed(5)}° ${lonDir}`;
        };
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">GPS</h2>
                ${isTracking ? `
                    <span style="padding:4px 10px;background:rgba(34,197,94,0.15);border-radius:12px;font-size:11px;color:#22c55e;font-weight:500">
                        ● ACTIVE
                    </span>
                ` : ''}
            </div>
            
            <!-- GPS Status Card -->
            <div class="status-card ${position ? 'status-card--success' : (gpsState.error ? 'status-card--error' : '')}" style="margin-bottom:16px">
                <div class="status-card__icon">
                    ${Icons.get(position ? 'check' : (gpsState.error ? 'alert' : 'locate'))}
                </div>
                <div>
                    <div class="status-card__title">
                        ${position ? 'GPS Signal Acquired' : (gpsState.error || 'No GPS Signal')}
                    </div>
                    <div class="status-card__desc">
                        ${position ? `Fix: ${gpsState.fix || '3D'} • Accuracy: ${GPSModule.formatAccuracy(gpsState.accuracy)}` : 
                          (gpsState.error ? 'Check location permissions' : 'Waiting for signal...')}
                    </div>
                </div>
            </div>
            
            <!-- Current Position -->
            ${position ? `
                <div style="padding:14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:12px;margin-bottom:16px">
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px">CURRENT POSITION</div>
                    <div style="font-size:14px;font-family:monospace;margin-bottom:8px">
                        ${formatCoord(position.lat, position.lon)}
                    </div>
                    <div class="stat-grid stat-grid--3">
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${gpsState.altitude ? Math.round(gpsState.altitude * 3.28084) : '--'}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">ALT (FT)</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${gpsState.speed ? GPSModule.formatSpeed(gpsState.speed) : '--'}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">SPEED</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${gpsState.heading !== null ? Math.round(gpsState.heading) + '°' : '--'}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">HEADING</div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Manual Position Section -->
            ${renderManualPositionCard()}
            
            <!-- Tracking Controls -->
            <div style="display:flex;gap:8px;margin-bottom:16px">
                ${!isTracking ? `
                    <button class="btn btn--primary" id="gps-start" style="flex:1">
                        ${Icons.get('locate')} Start Tracking
                    </button>
                ` : `
                    <button class="btn btn--secondary" id="gps-stop" style="flex:1;color:#ef4444">
                        ${Icons.get('close')} Stop Tracking
                    </button>
                `}
                <button class="btn btn--secondary" id="gps-center" ${!position ? 'disabled' : ''} title="Center map on position">
                    ${Icons.get('locate')}
                </button>
            </div>
            
            <div class="divider"></div>
            
            <!-- Breadcrumb Trail Recording -->
            <div class="section-label">Breadcrumb Trail</div>
            <div style="padding:14px;background:var(--color-bg-elevated);border-radius:12px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                    <div>
                        <div style="font-size:13px;font-weight:500">${isRecording ? 'Recording...' : 'Not Recording'}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                            ${recordedTrack.length} points ${isRecording && recordedTrack.length > 1 ? 
                                `• ${GPSModule.formatDistance(GPSModule.haversineDistance(
                                    recordedTrack[0].lat, recordedTrack[0].lon,
                                    recordedTrack[recordedTrack.length-1].lat, recordedTrack[recordedTrack.length-1].lon
                                ))}` : ''}
                        </div>
                    </div>
                    ${isRecording ? `
                        <div style="width:12px;height:12px;background:#ef4444;border-radius:50%;animation:pulse 1s infinite"></div>
                    ` : ''}
                </div>
                
                <div style="display:flex;gap:8px">
                    ${!isRecording ? `
                        <button class="btn btn--success" id="trail-start" style="flex:1" ${!isTracking ? 'disabled' : ''}>
                            ● Start Recording
                        </button>
                    ` : `
                        <button class="btn btn--secondary" id="trail-stop" style="flex:1">
                            ■ Stop & Save
                        </button>
                    `}
                    <button class="btn btn--secondary" id="trail-clear" ${recordedTrack.length === 0 ? 'disabled' : ''}>
                        ${Icons.get('trash')}
                    </button>
                </div>
            </div>
            
            ${recordedTrack.length > 1 ? `
                <button class="btn btn--secondary btn--full" id="trail-to-route" style="margin-bottom:16px">
                    ${Icons.get('route')} Convert Trail to Route
                </button>
            ` : ''}
            
            <div class="divider"></div>
            
            <!-- Navigation to Waypoint -->
            <div class="section-label">Navigate to Waypoint</div>
            
            ${navInfo ? `
                <!-- Active Navigation -->
                <div style="padding:16px;background:linear-gradient(135deg,rgba(249,115,22,0.15),rgba(234,88,12,0.1));border:1px solid rgba(249,115,22,0.3);border-radius:14px;margin-bottom:16px">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                        <div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">NAVIGATING TO</div>
                            <div style="font-size:16px;font-weight:600;color:#f97316">${navInfo.waypoint.name}</div>
                        </div>
                        <button class="btn btn--secondary" id="nav-stop" style="padding:6px">✕</button>
                    </div>
                    
                    <div style="display:flex;gap:16px;margin-bottom:12px">
                        <!-- Distance -->
                        <div style="flex:1;text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:10px">
                            <div style="font-size:28px;font-weight:700;color:#fff">${navInfo.distanceFormatted}</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">DISTANCE</div>
                        </div>
                        
                        <!-- Bearing -->
                        <div style="flex:1;text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:10px">
                            <div style="font-size:28px;font-weight:700;color:#fff">${navInfo.bearingFormatted}</div>
                            <div style="font-size:10px;color:rgba(255,255,255,0.5)">BEARING</div>
                        </div>
                    </div>
                    
                    ${navInfo.eta ? `
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.15);border-radius:8px">
                            <span style="color:rgba(255,255,255,0.6)">ETA:</span>
                            <span style="font-weight:600;margin-left:6px">${navInfo.etaFormatted}</span>
                        </div>
                    ` : ''}
                    
                    ${navInfo.relativeBearing !== null ? `
                        <!-- Compass Arrow -->
                        <div style="margin-top:12px;display:flex;justify-content:center">
                            <div style="width:60px;height:60px;border-radius:50%;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;position:relative">
                                <div style="position:absolute;top:4px;font-size:10px;color:rgba(255,255,255,0.4)">N</div>
                                <div style="transform:rotate(${navInfo.relativeBearing}deg);transition:transform 0.3s">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#f97316">
                                        <path d="M12 2 L20 20 L12 16 L4 20 Z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:center;margin-top:6px;font-size:11px;color:rgba(255,255,255,0.5)">
                            ${navInfo.relativeBearing > 0 ? `Turn ${Math.abs(Math.round(navInfo.relativeBearing))}° right` :
                              navInfo.relativeBearing < 0 ? `Turn ${Math.abs(Math.round(navInfo.relativeBearing))}° left` : 'Straight ahead'}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <!-- Waypoint List with Distances -->
            ${waypoints.length > 0 ? `
                <div style="max-height:250px;overflow-y:auto">
                    ${waypointDistances.slice(0, 10).map(wp => {
                        const type = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
                        const isTarget = selectedNavTarget === wp.id;
                        return `
                            <div class="card ${isTarget ? 'card--selected' : ''}" style="margin-bottom:8px;cursor:pointer" data-nav-wp="${wp.id}">
                                <div class="card__header">
                                    <div class="card__icon" style="background:${type.color}22;font-size:16px">${type.icon}</div>
                                    <div style="flex:1">
                                        <div class="card__title">${wp.name}</div>
                                        <div class="card__subtitle">${wp.nav ? wp.nav.bearingFormatted : '--'}</div>
                                    </div>
                                    <div style="text-align:right">
                                        <div style="font-size:14px;font-weight:600;color:#f97316">${wp.nav ? wp.nav.distanceFormatted : '--'}</div>
                                        ${wp.nav && wp.nav.eta ? `<div style="font-size:10px;color:rgba(255,255,255,0.4)">${wp.nav.etaFormatted}</div>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${waypointDistances.length > 10 ? `
                    <div style="text-align:center;padding:8px;font-size:11px;color:rgba(255,255,255,0.4)">
                        + ${waypointDistances.length - 10} more waypoints
                    </div>
                ` : ''}
            ` : `
                <div class="empty-state" style="padding:20px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">No waypoints to navigate to</div>
                </div>
            `}
            
            <div class="divider"></div>
            
            <!-- GPS Source Selection -->
            <div class="section-label">GPS Source</div>
            <div style="display:flex;flex-direction:column;gap:8px">
                <button class="btn ${gpsState.source === 'internal' ? 'btn--primary' : 'btn--secondary'}" id="gps-internal" style="justify-content:flex-start">
                    📱 Internal GPS (Device)
                </button>
                ${GPSModule.isSerialAvailable && GPSModule.isSerialAvailable() ? `
                    <button class="btn ${gpsState.source === 'serial' ? 'btn--primary' : 'btn--secondary'}" id="gps-serial" style="justify-content:flex-start">
                        🔌 External GPS (USB/Serial)
                    </button>
                ` : ''}
                <button class="btn ${gpsState.source === 'simulation' ? 'btn--primary' : 'btn--secondary'}" id="gps-simulate" style="justify-content:flex-start">
                    🧪 Simulate GPS (Testing)
                </button>
            </div>
        `;
        
        // Event handlers
        
        // Start/Stop tracking
        const startBtn = container.querySelector('#gps-start');
        if (startBtn) {
            startBtn.onclick = () => {
                GPSModule.startInternalGPS();
                // Set up continuous UI updates
                setupGPSUpdates();
            };
        }
        
        const stopBtn = container.querySelector('#gps-stop');
        if (stopBtn) {
            stopBtn.onclick = () => {
                GPSModule.stop();
                resetGPSCenterFlag();  // Reset so next start will auto-center again
                renderGPS();
            };
        }
        
        // Center map
        const centerBtn = container.querySelector('#gps-center');
        if (centerBtn) {
            centerBtn.onclick = () => {
                if (position) {
                    MapModule.setCenter(position.lat, position.lon);
                }
            };
        }
        
        // Trail recording
        const trailStartBtn = container.querySelector('#trail-start');
        if (trailStartBtn) {
            trailStartBtn.onclick = () => {
                GPSModule.startRecording();
                renderGPS();
            };
        }
        
        const trailStopBtn = container.querySelector('#trail-stop');
        if (trailStopBtn) {
            trailStopBtn.onclick = () => {
                const track = GPSModule.stopRecording();
                if (track && track.points.length > 1) {
                    ModalsModule.showToast(`Trail saved: ${track.points.length} points, ${GPSModule.formatDistance(track.distance)}`, 'success');
                }
                renderGPS();
            };
        }
        
        const trailClearBtn = container.querySelector('#trail-clear');
        if (trailClearBtn) {
            trailClearBtn.onclick = () => {
                if (confirm('Clear the recorded trail?')) {
                    GPSModule.clearRecordedTrack();
                    renderGPS();
                }
            };
        }
        
        // Convert trail to route
        const trailToRouteBtn = container.querySelector('#trail-to-route');
        if (trailToRouteBtn) {
            trailToRouteBtn.onclick = () => {
                const route = GPSModule.trackToRoute('GPS Trail ' + new Date().toLocaleString());
                if (route) {
                    State.Routes.add(route);
                    Storage.Routes.save(route);
                    GPSModule.clearRecordedTrack();
                    ModalsModule.showToast('Trail converted to route!', 'success');
                    renderGPS();
                }
            };
        }
        
        // Navigation target selection
        container.querySelectorAll('[data-nav-wp]').forEach(card => {
            card.onclick = () => {
                const wpId = card.dataset.navWp;
                if (State.get('gpsNavTarget') === wpId) {
                    State.set('gpsNavTarget', null); // Deselect
                } else {
                    State.set('gpsNavTarget', wpId);
                }
                renderGPS();
            };
        });
        
        // Stop navigation
        const navStopBtn = container.querySelector('#nav-stop');
        if (navStopBtn) {
            navStopBtn.onclick = () => {
                State.set('gpsNavTarget', null);
                renderGPS();
            };
        }
        
        // GPS source selection
        const internalBtn = container.querySelector('#gps-internal');
        if (internalBtn) {
            internalBtn.onclick = () => {
                GPSModule.stop();
                GPSModule.startInternalGPS();
                setupGPSUpdates();
            };
        }
        
        const serialBtn = container.querySelector('#gps-serial');
        if (serialBtn) {
            serialBtn.onclick = async () => {
                try {
                    GPSModule.stop();
                    await GPSModule.connectSerialGPS();
                    setupGPSUpdates();
                    ModalsModule.showToast('External GPS connected!', 'success');
                } catch (e) {
                    ModalsModule.showToast(e.message, 'error');
                }
            };
        }
        
        const simulateBtn = container.querySelector('#gps-simulate');
        if (simulateBtn) {
            simulateBtn.onclick = () => {
                GPSModule.stop();
                GPSModule.startSimulation();
                setupGPSUpdates();
                ModalsModule.showToast('GPS simulation started', 'info');
            };
        }
        
        // Manual position handlers
        const setManualBtn = container.querySelector('#gps-set-manual');
        if (setManualBtn) {
            setManualBtn.onclick = () => {
                openManualPositionModal();
            };
        }
        
        const editManualBtn = container.querySelector('#gps-edit-manual');
        if (editManualBtn) {
            editManualBtn.onclick = () => {
                openManualPositionModal();
            };
        }
        
        const clearManualBtn = container.querySelector('#gps-clear-manual');
        if (clearManualBtn) {
            clearManualBtn.onclick = () => {
                GPSModule.clearManualPosition();
                ModalsModule.showToast('Manual position cleared', 'info');
                renderGPS();
                if (typeof MapModule !== 'undefined') MapModule.render();
            };
        }
        
        const preferManualCheckbox = container.querySelector('#gps-prefer-manual');
        if (preferManualCheckbox) {
            preferManualCheckbox.onchange = () => {
                GPSModule.setPreferManual(preferManualCheckbox.checked);
                renderGPS();
                if (typeof MapModule !== 'undefined') MapModule.render();
            };
        }
    }
    
    // GPS update subscription
    let gpsUpdateUnsubscribe = null;
    let initialGPSCenterDone = false;  // Track if we've centered on first fix
    
    function setupGPSUpdates(resetInitialCenter = true) {
        // Reset the initial center flag when starting fresh
        if (resetInitialCenter) {
            initialGPSCenterDone = false;
        }
        
        if (gpsUpdateUnsubscribe) return; // Already subscribed
        
        gpsUpdateUnsubscribe = GPSModule.subscribe((gpsState) => {
            // Auto-center map on first valid GPS fix
            if (!initialGPSCenterDone && gpsState.currentPosition && gpsState.isTracking) {
                initialGPSCenterDone = true;
                MapModule.setCenter(
                    gpsState.currentPosition.lat, 
                    gpsState.currentPosition.lon, 
                    15  // Zoom level 15 for good local detail
                );
                ModalsModule.showToast('GPS fix acquired - map centered', 'success');
            }
            
            // Only re-render GPS panel if it's active
            if (State.get('activePanel') === 'gps') {
                renderGPS();
            }
            // Always update map for position
            MapModule.render();
        });
    }
    
    // Reset initial center flag when GPS stops
    function resetGPSCenterFlag() {
        initialGPSCenterDone = false;
    }

    // Weather panel state
    let weatherData = null;
    let routeWeatherData = null;
    let weatherLoading = false;
    let weatherError = null;
    
    // Satellite/Radar imagery state
    let activeSatLayer = null;
    let satLayerOpacity = 0.7;

    async function renderWeather() {
        // Check WeatherModule availability
        if (typeof WeatherModule === 'undefined') {
            container.innerHTML = `
                <div class="panel__header"><h2 class="panel__title">Weather</h2></div>
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('alert')}</div>
                    <div class="empty-state__title">Weather Module Not Loaded</div>
                    <div class="empty-state__desc">Weather functionality is not available.</div>
                </div>
            `;
            return;
        }

        const routes = State.get('routes').filter(r => !r.isBuilding);
        const waypoints = State.get('waypoints');
        const selectedRoute = routes.length > 0 ? routes[0] : null;

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Weather</h2>
                <button class="btn btn--secondary" id="weather-refresh" style="padding:6px 10px">
                    ${Icons.get('locate')} Refresh
                </button>
            </div>
            
            ${weatherLoading ? `
                <div style="padding:40px;text-align:center">
                    <div style="font-size:24px;margin-bottom:12px">🌤️</div>
                    <div style="color:rgba(255,255,255,0.6)">Loading weather data...</div>
                </div>
            ` : weatherError ? `
                <div class="status-card status-card--error" style="margin-bottom:16px">
                    <div class="status-card__icon">${Icons.get('alert')}</div>
                    <div>
                        <div class="status-card__title">Weather Error</div>
                        <div class="status-card__desc">${weatherError}</div>
                    </div>
                </div>
            ` : ''}
            
            ${!weatherLoading && weatherData ? `
                <!-- Current Conditions -->
                <div class="section-label">Current Conditions</div>
                <div style="padding:16px;background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(37,99,235,0.1));border:1px solid rgba(59,130,246,0.3);border-radius:14px;margin-bottom:16px">
                    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
                        <div style="font-size:48px">${weatherData.current.weather.icon}</div>
                        <div>
                            <div style="font-size:36px;font-weight:700">${WeatherModule.formatTemp(weatherData.current.temperature)}</div>
                            <div style="font-size:13px;color:rgba(255,255,255,0.6)">${weatherData.current.weather.desc}</div>
                        </div>
                    </div>
                    
                    <div class="stat-grid stat-grid--3">
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px">
                            <div style="font-size:14px;font-weight:600">${WeatherModule.formatTemp(weatherData.current.feelsLike)}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">FEELS LIKE</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px">
                            <div style="font-size:14px;font-weight:600">${weatherData.current.humidity}%</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">HUMIDITY</div>
                        </div>
                        <div style="text-align:center;padding:8px;background:rgba(0,0,0,0.2);border-radius:8px">
                            <div style="font-size:14px;font-weight:600">${Math.round(weatherData.current.windSpeed)} mph</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">WIND</div>
                        </div>
                    </div>
                    
                    ${weatherData.current.windGusts > weatherData.current.windSpeed + 5 ? `
                        <div style="margin-top:8px;padding:8px;background:rgba(245,158,11,0.15);border-radius:6px;font-size:12px;color:#f59e0b">
                            💨 Gusts up to ${Math.round(weatherData.current.windGusts)} mph
                        </div>
                    ` : ''}
                </div>
                
                <!-- 7-Day Forecast -->
                <div class="section-label">7-Day Forecast</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                    ${weatherData.daily.slice(0, 7).map((day, i) => `
                        <div style="display:flex;align-items:center;padding:10px;background:var(--color-bg-elevated);border-radius:8px">
                            <div style="width:70px;font-size:12px;color:rgba(255,255,255,0.6)">
                                ${i === 0 ? 'Today' : WeatherModule.formatDate(day.date)}
                            </div>
                            <div style="font-size:20px;width:40px;text-align:center">${day.weather.icon}</div>
                            <div style="flex:1;font-size:12px;color:rgba(255,255,255,0.5)">${day.weather.desc}</div>
                            <div style="text-align:right">
                                <span style="font-weight:600">${Math.round(day.tempMax)}°</span>
                                <span style="color:rgba(255,255,255,0.4);margin-left:4px">${Math.round(day.tempMin)}°</span>
                            </div>
                            ${day.precipProbability > 20 ? `
                                <div style="width:40px;text-align:right;font-size:11px;color:#3b82f6">
                                    💧${day.precipProbability}%
                                </div>
                            ` : '<div style="width:40px"></div>'}
                        </div>
                    `).join('')}
                </div>
                
                <!-- Hourly Forecast (next 24 hours) -->
                <div class="section-label">Next 24 Hours</div>
                <div style="display:flex;overflow-x:auto;gap:8px;padding-bottom:8px;margin-bottom:16px">
                    ${weatherData.hourly.slice(0, 24).map((hour, i) => {
                        const time = new Date(hour.time);
                        const hourStr = i === 0 ? 'Now' : time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                        return `
                            <div style="flex-shrink:0;width:60px;padding:10px 8px;background:var(--color-bg-elevated);border-radius:8px;text-align:center">
                                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:4px">${hourStr}</div>
                                <div style="font-size:18px;margin-bottom:4px">${hour.weather.icon}</div>
                                <div style="font-size:14px;font-weight:600">${Math.round(hour.temperature)}°</div>
                                ${hour.precipProbability > 20 ? `
                                    <div style="font-size:10px;color:#3b82f6;margin-top:2px">💧${hour.precipProbability}%</div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : !weatherLoading ? `
                <div class="empty-state" style="padding:30px">
                    <div style="font-size:40px;margin-bottom:12px">🌤️</div>
                    <div class="empty-state__title">No Weather Data</div>
                    <div class="empty-state__desc">Click refresh to load current conditions</div>
                </div>
            ` : ''}
            
            <div class="divider"></div>
            
            <!-- Route Weather Analysis -->
            <div class="section-label">Route Weather Analysis</div>
            
            ${selectedRoute ? `
                <div style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                        <span style="color:#f97316">${Icons.get('route')}</span>
                        <span style="font-weight:500">${selectedRoute.name}</span>
                    </div>
                    <button class="btn btn--primary btn--full" id="analyze-route-weather">
                        🌦️ Analyze Route Weather
                    </button>
                </div>
                
                ${routeWeatherData ? `
                    <!-- Route Weather Summary -->
                    <div class="status-card ${
                        routeWeatherData.summary.status === 'good' ? 'status-card--success' : 
                        routeWeatherData.summary.status === 'hazardous' ? 'status-card--error' : ''
                    }" style="margin-bottom:16px;background:${
                        routeWeatherData.summary.status === 'fair' ? 'rgba(59,130,246,0.1)' : 
                        routeWeatherData.summary.status === 'poor' ? 'rgba(245,158,11,0.1)' : ''
                    };border-color:${
                        routeWeatherData.summary.status === 'fair' ? 'rgba(59,130,246,0.2)' :
                        routeWeatherData.summary.status === 'poor' ? 'rgba(245,158,11,0.2)' : ''
                    }">
                        <div class="status-card__icon" style="color:${WeatherModule.getStatusColor(routeWeatherData.summary.status)}">
                            ${routeWeatherData.summary.dominantCondition.icon}
                        </div>
                        <div>
                            <div class="status-card__title" style="color:${WeatherModule.getStatusColor(routeWeatherData.summary.status)}">
                                ${routeWeatherData.summary.status.charAt(0).toUpperCase() + routeWeatherData.summary.status.slice(1)} Conditions
                            </div>
                            <div class="status-card__desc">${routeWeatherData.summary.message}</div>
                        </div>
                    </div>
                    
                    <!-- Weather Alerts -->
                    ${routeWeatherData.alerts.length > 0 ? `
                        <div class="section-label">⚠️ Weather Alerts (${routeWeatherData.alerts.length})</div>
                        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                            ${routeWeatherData.alerts.slice(0, 5).map(alert => `
                                <div style="padding:12px;background:${
                                    alert.severity === 'critical' ? 'rgba(239,68,68,0.15)' :
                                    alert.severity === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)'
                                };border:1px solid ${
                                    alert.severity === 'critical' ? 'rgba(239,68,68,0.3)' :
                                    alert.severity === 'warning' ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.2)'
                                };border-radius:10px">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                                        <span style="font-size:18px">${alert.icon}</span>
                                        <span style="font-weight:600;color:${WeatherModule.getSeverityColor(alert.severity)}">${alert.message}</span>
                                    </div>
                                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:4px">📍 ${alert.location}</div>
                                    <div style="font-size:12px;color:rgba(255,255,255,0.7)">${alert.recommendation}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="padding:12px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:10px;margin-bottom:16px;text-align:center">
                            <span style="color:#22c55e">✅ No weather alerts for this route</span>
                        </div>
                    `}
                    
                    <!-- Recommendations -->
                    ${routeWeatherData.recommendations.length > 0 ? `
                        <div class="section-label">📋 Recommendations</div>
                        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
                            ${routeWeatherData.recommendations.map(rec => `
                                <div style="padding:10px 12px;background:var(--color-bg-elevated);border-radius:8px;display:flex;align-items:flex-start;gap:10px">
                                    <span style="font-size:16px">${rec.icon}</span>
                                    <span style="font-size:12px;color:rgba(255,255,255,0.8);line-height:1.4">${rec.text}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- Best Travel Windows -->
                    ${routeWeatherData.bestWindows.length > 0 ? `
                        <div class="section-label">🕐 Best Travel Windows</div>
                        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                            ${routeWeatherData.bestWindows.map((window, i) => {
                                const startTime = window.start.toLocaleString('en-US', { 
                                    weekday: 'short', hour: 'numeric', hour12: true 
                                });
                                const endTime = window.end.toLocaleTimeString('en-US', { 
                                    hour: 'numeric', hour12: true 
                                });
                                const scoreColor = window.score >= 70 ? '#22c55e' : window.score >= 50 ? '#f59e0b' : '#ef4444';
                                return `
                                    <div style="padding:12px;background:var(--color-bg-elevated);border-radius:10px;${i === 0 ? 'border:1px solid rgba(34,197,94,0.3)' : ''}">
                                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                                            <span style="font-weight:500">${startTime} - ${endTime}</span>
                                            <span style="padding:2px 8px;background:${scoreColor}22;color:${scoreColor};border-radius:10px;font-size:11px;font-weight:600">
                                                ${window.score}% favorable
                                            </span>
                                        </div>
                                        <div style="font-size:12px;color:rgba(255,255,255,0.5)">
                                            Avg temp: ${Math.round(window.avgTemp)}°F
                                            ${window.issues.length > 0 ? ' • Issues: ' + window.issues.join(', ') : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                    
                    <!-- Weather Along Route -->
                    <div class="section-label">Weather Along Route</div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${routeWeatherData.points.map(point => `
                            <div style="padding:10px 12px;background:var(--color-bg-elevated);border-radius:8px;display:flex;align-items:center;gap:12px">
                                <div style="font-size:24px">${point.weather?.current?.weather?.icon || '❓'}</div>
                                <div style="flex:1">
                                    <div style="font-size:13px;font-weight:500">${point.name}</div>
                                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                        ${point.weather?.current ? point.weather.current.weather.desc : 'No data'}
                                    </div>
                                </div>
                                <div style="text-align:right">
                                    <div style="font-size:16px;font-weight:600">
                                        ${point.weather?.current ? Math.round(point.weather.current.temperature) + '°' : '--'}
                                    </div>
                                    <div style="font-size:10px;color:rgba(255,255,255,0.4)">
                                        ${point.weather?.current ? Math.round(point.weather.current.windSpeed) + ' mph' : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            ` : `
                <div class="empty-state" style="padding:20px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">Create a route to analyze weather conditions</div>
                </div>
            `}
            
            <div class="divider"></div>
            
            <!-- Waypoint Weather -->
            ${waypoints.length > 0 ? `
                <div class="section-label">Waypoint Weather</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                    Click a waypoint to view detailed weather
                </div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    ${waypoints.slice(0, 5).map(wp => {
                        const type = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
                        return `
                            <button class="card" style="text-align:left" data-weather-wp="${wp.id}">
                                <div class="card__header">
                                    <div class="card__icon" style="background:${type.color}22">${type.icon}</div>
                                    <div style="flex:1">
                                        <div class="card__title">${wp.name}</div>
                                        <div class="card__subtitle">Click to load weather</div>
                                    </div>
                                    <span style="font-size:18px">🌤️</span>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
                ${waypoints.length > 5 ? `
                    <div style="text-align:center;padding:8px;font-size:11px;color:rgba(255,255,255,0.4)">
                        + ${waypoints.length - 5} more waypoints
                    </div>
                ` : ''}
            ` : ''}
            
            <div class="divider"></div>
            
            <!-- Satellite & Radar Imagery -->
            <div class="section-label">🛰️ Satellite & Radar Imagery</div>
            <div style="margin-bottom:16px">
                ${typeof SatWeatherModule !== 'undefined' ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                        <button class="btn ${activeSatLayer === 'nexrad_composite' ? 'btn--primary' : 'btn--secondary'}" 
                                data-sat-layer="nexrad_composite"
                                style="padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:20px">📡</span>
                            <span style="font-size:11px">Radar</span>
                        </button>
                        <button class="btn ${activeSatLayer === 'goes_ir' ? 'btn--primary' : 'btn--secondary'}" 
                                data-sat-layer="goes_ir"
                                style="padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:20px">🌡️</span>
                            <span style="font-size:11px">Infrared</span>
                        </button>
                        <button class="btn ${activeSatLayer === 'mrms_precip' ? 'btn--primary' : 'btn--secondary'}" 
                                data-sat-layer="mrms_precip"
                                style="padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:20px">🌧️</span>
                            <span style="font-size:11px">Precip</span>
                        </button>
                        <button class="btn ${activeSatLayer === 'nws_warnings' ? 'btn--primary' : 'btn--secondary'}" 
                                data-sat-layer="nws_warnings"
                                style="padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px">
                            <span style="font-size:20px">⚠️</span>
                            <span style="font-size:11px">Warnings</span>
                        </button>
                    </div>
                    
                    ${activeSatLayer ? `
                        <div style="padding:10px;background:var(--color-bg-elevated);border-radius:8px;margin-bottom:12px">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span style="font-size:12px;font-weight:500">${SatWeatherModule.getProduct(activeSatLayer)?.name || activeSatLayer}</span>
                                <button class="btn btn--secondary" id="clear-sat-layer" style="padding:4px 8px;font-size:10px">
                                    Clear
                                </button>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px">
                                <span style="font-size:10px;color:rgba(255,255,255,0.5)">Opacity</span>
                                <input type="range" id="sat-opacity" min="10" max="100" value="${Math.round(satLayerOpacity * 100)}" 
                                       style="flex:1;height:4px;accent-color:#f97316">
                                <span style="font-size:10px;color:rgba(255,255,255,0.5)">${Math.round(satLayerOpacity * 100)}%</span>
                            </div>
                        </div>
                    ` : `
                        <div style="padding:12px;background:var(--color-bg-elevated);border-radius:8px;text-align:center">
                            <span style="font-size:12px;color:rgba(255,255,255,0.5)">Select an overlay to view on map</span>
                        </div>
                    `}
                    
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center">
                        Data: NASA GIBS, NOAA, Iowa Environmental Mesonet
                    </div>
                ` : `
                    <div style="padding:16px;background:var(--color-bg-elevated);border-radius:8px;text-align:center">
                        <span style="color:rgba(255,255,255,0.5)">Satellite imagery module not available</span>
                    </div>
                `}
            </div>
            
            <div style="margin-top:20px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;text-align:center">
                <div style="font-size:11px;color:rgba(255,255,255,0.4)">
                    Weather data from Open-Meteo • Updates every 30 minutes
                </div>
            </div>
        `;

        // Event handlers
        
        // Refresh weather
        container.querySelector('#weather-refresh').onclick = async () => {
            await loadCurrentWeather();
        };
        
        // Analyze route weather
        const analyzeBtn = container.querySelector('#analyze-route-weather');
        if (analyzeBtn) {
            analyzeBtn.onclick = async () => {
                if (!selectedRoute) return;
                
                analyzeBtn.disabled = true;
                analyzeBtn.innerHTML = '⏳ Analyzing...';
                
                try {
                    routeWeatherData = await WeatherModule.analyzeRouteWeather(selectedRoute, waypoints, {
                        travelDate: new Date(),
                        estimatedHours: parseFloat(selectedRoute.duration) || 8
                    });
                    renderWeather();
                } catch (err) {
                    console.error('Route weather analysis failed:', err);
                    ModalsModule.showToast('Failed to analyze route weather', 'error');
                    analyzeBtn.disabled = false;
                    analyzeBtn.innerHTML = '🌦️ Analyze Route Weather';
                }
            };
        }
        
        // Waypoint weather
        container.querySelectorAll('[data-weather-wp]').forEach(btn => {
            btn.onclick = async () => {
                const wpId = btn.dataset.weatherWp;
                const wp = waypoints.find(w => w.id === wpId);
                if (!wp) return;
                
                btn.querySelector('.card__subtitle').textContent = 'Loading...';
                
                try {
                    const wpWeather = await WeatherModule.getWaypointWeather(wp);
                    if (wpWeather?.current) {
                        btn.querySelector('.card__subtitle').textContent = 
                            `${Math.round(wpWeather.current.temperature)}°F • ${wpWeather.current.weather.desc}`;
                        btn.querySelector('span:last-child').textContent = wpWeather.current.weather.icon;
                    }
                } catch (err) {
                    btn.querySelector('.card__subtitle').textContent = 'Failed to load';
                }
            };
        });
        
        // Satellite/Radar layer buttons
        container.querySelectorAll('[data-sat-layer]').forEach(btn => {
            btn.onclick = () => {
                const layerKey = btn.dataset.satLayer;
                if (typeof SatWeatherModule !== 'undefined') {
                    // Toggle layer
                    if (activeSatLayer === layerKey) {
                        // Clear layer
                        SatWeatherModule.removeSatelliteLayer(layerKey);
                        activeSatLayer = null;
                    } else {
                        // Remove previous layer
                        if (activeSatLayer) {
                            SatWeatherModule.removeSatelliteLayer(activeSatLayer);
                        }
                        // Add new layer
                        SatWeatherModule.addSatelliteLayer(layerKey, satLayerOpacity);
                        activeSatLayer = layerKey;
                    }
                    renderWeather();
                }
            };
        });
        
        // Clear satellite layer button
        const clearSatBtn = container.querySelector('#clear-sat-layer');
        if (clearSatBtn) {
            clearSatBtn.onclick = () => {
                if (activeSatLayer && typeof SatWeatherModule !== 'undefined') {
                    SatWeatherModule.removeSatelliteLayer(activeSatLayer);
                    activeSatLayer = null;
                    renderWeather();
                }
            };
        }
        
        // Satellite layer opacity slider
        const opacitySlider = container.querySelector('#sat-opacity');
        if (opacitySlider) {
            opacitySlider.oninput = (e) => {
                satLayerOpacity = parseInt(e.target.value, 10) / 100;
                if (activeSatLayer && typeof SatWeatherModule !== 'undefined') {
                    SatWeatherModule.setLayerOpacity(activeSatLayer, satLayerOpacity);
                }
                // Update display
                const display = opacitySlider.nextElementSibling;
                if (display) {
                    display.textContent = `${Math.round(satLayerOpacity * 100)}%`;
                }
            };
        }
    }

    async function loadCurrentWeather() {
        weatherLoading = true;
        weatherError = null;
        renderWeather();
        
        try {
            weatherData = await WeatherModule.getMapCenterWeather();
            weatherLoading = false;
            renderWeather();
        } catch (err) {
            weatherLoading = false;
            weatherError = err.message || 'Failed to load weather';
            renderWeather();
        }
    }

    async function renderSettings() {
        // Load current settings
        const units = await Storage.Settings.get('units', 'imperial');
        const coordFormat = await Storage.Settings.get('coordinateFormat', 'dd');
        const defaultZoom = await Storage.Settings.get('defaultZoom', 12);
        const homeLocation = await Storage.Settings.get('homeLocation', null);
        
        // Set the format in Coordinates module
        if (typeof Coordinates !== 'undefined') {
            Coordinates.setFormat(coordFormat);
        }
        
        // Sample coordinates for preview
        const sampleLat = 37.4215;
        const sampleLon = -119.1892;
        
        // Calculate storage usage
        const waypoints = State.get('waypoints');
        const routes = State.get('routes');
        const waypointCount = waypoints.length;
        const routeCount = routes.filter(r => !r.isBuilding).length;
        
        // Estimate storage size
        let storageEstimate = 'Calculating...';
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
                const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
                storageEstimate = `${usedMB} MB / ${quotaMB} MB`;
            }
        } catch (e) {
            storageEstimate = 'Unknown';
        }
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Settings</h2>
            </div>
            
            <!-- Units & Format -->
            <div class="section-label">Units & Format</div>
            
            <div class="settings-group">
                <div class="settings-row">
                    <span class="settings-row__label">Distance Units</span>
                    <div class="settings-row__control">
                        <select id="setting-units" class="settings-select">
                            <option value="imperial" ${units === 'imperial' ? 'selected' : ''}>Miles / Feet</option>
                            <option value="metric" ${units === 'metric' ? 'selected' : ''}>Kilometers / Meters</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-row" style="flex-direction:column;align-items:stretch">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                        <span class="settings-row__label">Coordinate Format</span>
                        <select id="setting-coord-format" class="settings-select" style="width:auto">
                            <option value="dd" ${coordFormat === 'dd' ? 'selected' : ''}>Decimal (DD)</option>
                            <option value="dms" ${coordFormat === 'dms' ? 'selected' : ''}>Deg Min Sec (DMS)</option>
                            <option value="ddm" ${coordFormat === 'ddm' ? 'selected' : ''}>Deg Dec Min (DDM)</option>
                            <option value="utm" ${coordFormat === 'utm' ? 'selected' : ''}>UTM</option>
                            <option value="mgrs" ${coordFormat === 'mgrs' ? 'selected' : ''}>MGRS (Military)</option>
                        </select>
                    </div>
                    <div id="coord-format-preview" style="padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:#f97316;text-align:center">
                        ${typeof Coordinates !== 'undefined' ? Coordinates.format(sampleLat, sampleLon, { format: coordFormat }) : '37.4215° N, 119.1892° W'}
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Night Mode Settings -->
            <div class="section-label">Display Mode</div>
            
            <div class="settings-group" id="night-mode-settings">
                ${typeof NightModeModule !== 'undefined' ? NightModeModule.renderSettingsPanel() : `
                    <div style="padding:12px;text-align:center;color:var(--color-text-muted)">
                        Night mode not available
                    </div>
                `}
            </div>
            
            <div class="divider"></div>
            
            <!-- Coordinate Converter Tool -->
            <div class="section-label">Coordinate Converter</div>
            
            <div class="settings-group">
                <div style="margin-bottom:12px">
                    <input type="text" id="coord-input" placeholder="Enter coordinates in any format..." 
                        style="font-family:'IBM Plex Mono',monospace;font-size:13px">
                    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                        Accepts: DD, DMS, DDM, UTM, MGRS formats
                    </div>
                </div>
                <button class="btn btn--secondary btn--full" id="convert-coords-btn">
                    Convert Coordinates
                </button>
                <div id="coord-convert-results" style="display:none;margin-top:12px;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px">
                    <!-- Results will be inserted here -->
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Magnetic Declination -->
            <div class="section-label">Magnetic Declination</div>
            
            <div class="settings-group">
                ${typeof DeclinationModule !== 'undefined' ? (() => {
                    const current = DeclinationModule.getCurrent();
                    const modelInfo = DeclinationModule.getModelInfo();
                    const statusColor = {
                        valid: '#22c55e',
                        degraded: '#f59e0b',
                        expired: '#ef4444',
                        invalid: '#ef4444'
                    }[modelInfo.status] || '#6b7280';
                    
                    return `
                        <!-- Current Values -->
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                            <div style="padding:14px;background:rgba(34,197,94,0.1);border-radius:10px;text-align:center">
                                <div style="font-size:22px;font-weight:600;color:#22c55e">${DeclinationModule.formatDeclination(current.declination)}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">DECLINATION</div>
                            </div>
                            <div style="padding:14px;background:rgba(59,130,246,0.1);border-radius:10px;text-align:center">
                                <div style="font-size:22px;font-weight:600;color:#3b82f6">${DeclinationModule.formatInclination(current.inclination)}</div>
                                <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:2px">INCLINATION</div>
                            </div>
                        </div>
                        
                        <!-- Explanation -->
                        <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:12px;font-size:12px;color:rgba(255,255,255,0.7)">
                            ${current.declination !== null ? (current.declination >= 0 
                                ? `Magnetic north is <strong style="color:#f97316">${Math.abs(current.declination).toFixed(1)}° EAST</strong> of true north` 
                                : `Magnetic north is <strong style="color:#f97316">${Math.abs(current.declination).toFixed(1)}° WEST</strong> of true north`)
                            : 'Move map to calculate declination'}
                        </div>
                        
                        <!-- Bearing Converter -->
                        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px">Bearing Converter</div>
                        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
                            <div style="flex:1">
                                <input type="number" id="settings-true-bearing" min="0" max="360" step="1" placeholder="True °" 
                                    style="padding:10px;font-family:'IBM Plex Mono',monospace;text-align:center;font-size:14px">
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px">
                                <button class="btn btn--secondary" id="settings-to-mag" style="padding:4px 8px;font-size:10px">→</button>
                                <button class="btn btn--secondary" id="settings-to-true" style="padding:4px 8px;font-size:10px">←</button>
                            </div>
                            <div style="flex:1">
                                <input type="number" id="settings-mag-bearing" min="0" max="360" step="1" placeholder="Mag °" 
                                    style="padding:10px;font-family:'IBM Plex Mono',monospace;text-align:center;font-size:14px">
                            </div>
                        </div>
                        
                        <!-- Quick Reference Card -->
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">
                            ${[0, 90, 180, 270].map(trueBrg => {
                                const magBrg = current.declination !== null 
                                    ? DeclinationModule.trueToMagnetic(trueBrg, current.declination) 
                                    : trueBrg;
                                const compass = ['N', 'E', 'S', 'W'][trueBrg / 90];
                                return `
                                    <div style="padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;text-align:center">
                                        <div style="font-size:12px;font-weight:600">${compass}</div>
                                        <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:2px">T: ${trueBrg}°</div>
                                        <div style="font-size:9px;color:#22c55e">M: ${Math.round(magBrg)}°</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <!-- Model Info -->
                        <div style="padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;font-size:10px;color:rgba(255,255,255,0.5)">
                            <div style="display:flex;justify-content:space-between">
                                <span>Model: ${modelInfo.model}</span>
                                <span style="color:${statusColor}">${modelInfo.status.toUpperCase()}</span>
                            </div>
                            ${modelInfo.warning ? `<div style="margin-top:6px;color:#f59e0b">⚠️ ${modelInfo.warning}</div>` : ''}
                        </div>
                    `;
                })() : `
                    <div style="padding:16px;text-align:center;color:rgba(255,255,255,0.4)">
                        Declination module not available
                    </div>
                `}
            </div>
            
            <div class="divider"></div>
            
            <!-- Map Preferences -->
            <div class="section-label">Map Preferences</div>
            
            <div class="settings-group">
                <div class="settings-row">
                    <span class="settings-row__label">Default Zoom</span>
                    <div class="settings-row__control">
                        <select id="setting-default-zoom" class="settings-select">
                            ${[8,9,10,11,12,13,14,15,16].map(z => 
                                `<option value="${z}" ${defaultZoom === z ? 'selected' : ''}>${z} ${z <= 10 ? '(Region)' : z <= 13 ? '(Area)' : '(Detail)'}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="settings-row">
                    <div style="flex:1">
                        <span class="settings-row__label">Home Location</span>
                        <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px">
                            ${homeLocation 
                                ? (typeof Coordinates !== 'undefined' 
                                    ? Coordinates.formatShort(homeLocation.lat, homeLocation.lon)
                                    : `${homeLocation.lat.toFixed(4)}°, ${homeLocation.lon.toFixed(4)}°`)
                                : 'Not set'}
                        </div>
                    </div>
                    <button class="btn btn--secondary" id="set-home-btn" style="padding:8px 12px;font-size:12px">
                        ${homeLocation ? 'Update' : 'Set Current'}
                    </button>
                </div>
                
                ${homeLocation ? `
                    <button class="btn btn--secondary btn--full" id="go-home-btn" style="margin-top:8px">
                        🏠 Go to Home Location
                    </button>
                ` : ''}
            </div>
            
            <div class="divider"></div>
            
            <!-- Print / Export -->
            <div class="section-label">Print / Export PDF</div>
            
            <div class="settings-group">
                <p style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                    Generate printable documents for paper backup. Use browser's "Save as PDF" to create PDF files.
                </p>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <button class="btn btn--secondary" id="print-full-plan-btn">
                        📋 Full Plan
                    </button>
                    <button class="btn btn--secondary" id="print-route-card-btn" ${routeCount === 0 ? 'disabled' : ''}>
                        🗺️ Route Card
                    </button>
                    <button class="btn btn--secondary" id="print-waypoints-btn" ${waypointCount === 0 ? 'disabled' : ''}>
                        📍 Waypoints
                    </button>
                    <button class="btn btn--secondary" id="print-comm-btn">
                        📻 Comm Plan
                    </button>
                    <button class="btn btn--secondary" id="print-quick-ref-btn">
                        📇 Quick Ref
                    </button>
                    <button class="btn btn--primary" id="print-modal-btn">
                        🖨️ More Options...
                    </button>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Data Management -->
            <div class="section-label">Data Management</div>
            
            <div class="settings-group">
                <div style="display:flex;gap:8px;margin-bottom:12px">
                    <div style="flex:1;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;text-align:center">
                        <div style="font-size:20px;font-weight:600;color:#f97316">${waypointCount}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">WAYPOINTS</div>
                    </div>
                    <div style="flex:1;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;text-align:center">
                        <div style="font-size:20px;font-weight:600;color:#3b82f6">${routeCount}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.4)">ROUTES</div>
                    </div>
                </div>
                
                <div style="display:flex;gap:8px">
                    <button class="btn btn--secondary" id="export-json-btn" style="flex:1">
                        ${Icons.get('export')} Export JSON
                    </button>
                    <label class="btn btn--secondary" style="flex:1;cursor:pointer">
                        ${Icons.get('download')} Import JSON
                        <input type="file" id="import-json-input" accept=".json" style="display:none">
                    </label>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Danger Zone -->
            <div class="section-label" style="color:#ef4444">Danger Zone</div>
            
            <div class="settings-group" style="border-color:rgba(239,68,68,0.2)">
                <button class="btn btn--secondary btn--full" id="clear-waypoints-btn" style="margin-bottom:8px;color:#ef4444">
                    Clear All Waypoints (${waypointCount})
                </button>
                <button class="btn btn--secondary btn--full" id="clear-routes-btn" style="margin-bottom:8px;color:#ef4444">
                    Clear All Routes (${routeCount})
                </button>
                <button class="btn btn--full" id="clear-all-btn" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)">
                    🗑️ Clear All Data
                </button>
            </div>
            
            <div class="divider"></div>
            
            <!-- Help & Guidance -->
            <div class="section-label">Help</div>
            
            <div class="settings-group">
                <button class="btn btn--secondary btn--full" id="restart-tour-btn" style="margin-bottom:8px">
                    🎓 Restart Feature Tour
                </button>
                <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px">
                    <div style="font-size:12px;font-weight:500;margin-bottom:8px">Keyboard Shortcuts</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:11px">
                        <kbd style="padding:2px 6px;background:rgba(255,255,255,0.1);border-radius:4px;font-family:monospace">Ctrl+K</kbd>
                        <span style="color:rgba(255,255,255,0.6)">Global Search</span>
                        <kbd style="padding:2px 6px;background:rgba(255,255,255,0.1);border-radius:4px;font-family:monospace">Ctrl+Z</kbd>
                        <span style="color:rgba(255,255,255,0.6)">Undo</span>
                        <kbd style="padding:2px 6px;background:rgba(255,255,255,0.1);border-radius:4px;font-family:monospace">Ctrl+Shift+Z</kbd>
                        <span style="color:rgba(255,255,255,0.6)">Redo</span>
                        <kbd style="padding:2px 6px;background:rgba(255,255,255,0.1);border-radius:4px;font-family:monospace">Esc</kbd>
                        <span style="color:rgba(255,255,255,0.6)">Close Dialog/Cancel</span>
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- App Info -->
            <div class="section-label">About</div>
            
            <div class="settings-group">
                <div class="settings-row">
                    <span class="settings-row__label">Version</span>
                    <span style="font-size:13px;color:rgba(255,255,255,0.6)">6.2.2</span>
                </div>
                <div class="settings-row">
                    <span class="settings-row__label">Storage Used</span>
                    <span style="font-size:13px;color:rgba(255,255,255,0.6)">${storageEstimate}</span>
                </div>
                <button class="btn btn--secondary btn--full" id="clear-cache-btn" style="margin-top:8px">
                    Clear Tile Cache
                </button>
            </div>
            
            <div style="margin-top:24px;padding:16px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:12px;text-align:center">
                <div style="font-size:24px;margin-bottom:8px">🧭</div>
                <div style="font-size:14px;font-weight:600;color:#f97316">GridDown</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px">Offline Tactical Navigation</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:8px">MIT License • 2025</div>
            </div>
        `;
        
        // Event Handlers
        
        // Units setting
        container.querySelector('#setting-units').onchange = async (e) => {
            await Storage.Settings.set('units', e.target.value);
            ModalsModule.showToast('Units updated', 'success');
        };
        
        // Coordinate format setting
        container.querySelector('#setting-coord-format').onchange = async (e) => {
            const newFormat = e.target.value;
            await Storage.Settings.set('coordinateFormat', newFormat);
            
            // Update Coordinates module
            if (typeof Coordinates !== 'undefined') {
                Coordinates.setFormat(newFormat);
                
                // Update preview
                const preview = container.querySelector('#coord-format-preview');
                if (preview) {
                    preview.textContent = Coordinates.format(37.4215, -119.1892, { format: newFormat });
                }
            }
            
            ModalsModule.showToast('Coordinate format updated', 'success');
        };
        
        // Night mode settings listeners
        const nightModeContainer = container.querySelector('#night-mode-settings');
        if (nightModeContainer && typeof NightModeModule !== 'undefined') {
            NightModeModule.attachSettingsListeners(nightModeContainer);
        }
        
        // Coordinate converter
        const convertBtn = container.querySelector('#convert-coords-btn');
        const coordInput = container.querySelector('#coord-input');
        const resultsDiv = container.querySelector('#coord-convert-results');
        
        if (convertBtn && coordInput && resultsDiv) {
            const doConvert = () => {
                const input = coordInput.value.trim();
                if (!input) {
                    ModalsModule.showToast('Enter coordinates to convert', 'error');
                    return;
                }
                
                if (typeof Coordinates === 'undefined') {
                    ModalsModule.showToast('Coordinates module not loaded', 'error');
                    return;
                }
                
                const parsed = Coordinates.parse(input);
                if (!parsed) {
                    resultsDiv.style.display = 'block';
                    resultsDiv.innerHTML = `
                        <div style="color:#ef4444;text-align:center">
                            ❌ Could not parse coordinates<br>
                            <span style="font-size:11px;color:rgba(255,255,255,0.5)">
                                Try formats like: 37.4215, -119.1892 or 37°25'17"N 119°11'21"W
                            </span>
                        </div>
                    `;
                    return;
                }
                
                // Show all format conversions
                resultsDiv.style.display = 'block';
                resultsDiv.innerHTML = `
                    <div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.5);text-align:center">
                        Parsed: ${parsed.lat.toFixed(6)}, ${parsed.lon.toFixed(6)}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        <div class="coord-result" data-value="${Coordinates.toDD(parsed.lat, parsed.lon)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);width:50px">DD</span>
                            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;flex:1">${Coordinates.toDD(parsed.lat, parsed.lon)}</span>
                            <span style="font-size:10px;color:rgba(255,255,255,0.3)">📋</span>
                        </div>
                        <div class="coord-result" data-value="${Coordinates.toDMS(parsed.lat, parsed.lon)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);width:50px">DMS</span>
                            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;flex:1">${Coordinates.toDMS(parsed.lat, parsed.lon)}</span>
                            <span style="font-size:10px;color:rgba(255,255,255,0.3)">📋</span>
                        </div>
                        <div class="coord-result" data-value="${Coordinates.toDDM(parsed.lat, parsed.lon)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);width:50px">DDM</span>
                            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;flex:1">${Coordinates.toDDM(parsed.lat, parsed.lon)}</span>
                            <span style="font-size:10px;color:rgba(255,255,255,0.3)">📋</span>
                        </div>
                        <div class="coord-result" data-value="${Coordinates.toUTM(parsed.lat, parsed.lon)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);width:50px">UTM</span>
                            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;flex:1">${Coordinates.toUTM(parsed.lat, parsed.lon)}</span>
                            <span style="font-size:10px;color:rgba(255,255,255,0.3)">📋</span>
                        </div>
                        <div class="coord-result" data-value="${Coordinates.toMGRS(parsed.lat, parsed.lon)}" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer">
                            <span style="font-size:10px;color:rgba(255,255,255,0.4);width:50px">MGRS</span>
                            <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;flex:1">${Coordinates.toMGRS(parsed.lat, parsed.lon)}</span>
                            <span style="font-size:10px;color:rgba(255,255,255,0.3)">📋</span>
                        </div>
                    </div>
                    <div style="margin-top:8px;display:flex;gap:8px">
                        <button class="btn btn--secondary" id="goto-coords-btn" style="flex:1;padding:8px;font-size:12px">
                            🗺️ Go to Location
                        </button>
                        <button class="btn btn--secondary" id="create-wp-coords-btn" style="flex:1;padding:8px;font-size:12px">
                            📍 Create Waypoint
                        </button>
                    </div>
                `;
                
                // Copy on click
                resultsDiv.querySelectorAll('.coord-result').forEach(el => {
                    el.onclick = () => {
                        const value = el.dataset.value;
                        navigator.clipboard.writeText(value).then(() => {
                            ModalsModule.showToast('Copied to clipboard', 'success');
                        }).catch(() => {
                            ModalsModule.showToast('Copy failed', 'error');
                        });
                    };
                });
                
                // Go to location
                const gotoBtn = resultsDiv.querySelector('#goto-coords-btn');
                if (gotoBtn) {
                    gotoBtn.onclick = () => {
                        MapModule.setCenter(parsed.lat, parsed.lon, 14);
                        ModalsModule.showToast('Map centered on coordinates', 'success');
                        
                        // Switch to map panel
                        State.UI.setActivePanel('map');
                        if (Helpers.isMobile()) State.UI.closePanel();
                    };
                }
                
                // Create waypoint
                const createWpBtn = resultsDiv.querySelector('#create-wp-coords-btn');
                if (createWpBtn) {
                    createWpBtn.onclick = () => {
                        // Add waypoint at coordinates
                        const wp = {
                            id: Helpers.generateId(),
                            name: 'Imported Location',
                            lat: parsed.lat,
                            lon: parsed.lon,
                            x: 50 + (parsed.lon + 119.1892) / 0.004,
                            y: 50 + (parsed.lat - 37.4215) / 0.002,
                            type: 'custom',
                            notes: `Created from: ${input}`,
                            verified: false
                        };
                        
                        State.Waypoints.add(wp);
                        Storage.Waypoints.save(wp);
                        
                        ModalsModule.showToast('Waypoint created', 'success');
                        
                        // Switch to waypoints panel
                        State.UI.setActivePanel('waypoints');
                        State.Waypoints.select(wp);
                        
                        // Center map on new waypoint
                        MapModule.setCenter(parsed.lat, parsed.lon, 14);
                    };
                }
            };
            
            convertBtn.onclick = doConvert;
            
            // Also convert on Enter key
            coordInput.onkeydown = (e) => {
                if (e.key === 'Enter') doConvert();
            };
        }
        
        // Declination bearing converter
        const toMagBtn = container.querySelector('#settings-to-mag');
        const toTrueBtn = container.querySelector('#settings-to-true');
        const trueBearingInput = container.querySelector('#settings-true-bearing');
        const magBearingInput = container.querySelector('#settings-mag-bearing');
        
        if (toMagBtn && toTrueBtn && trueBearingInput && magBearingInput && typeof DeclinationModule !== 'undefined') {
            const current = DeclinationModule.getCurrent();
            
            toMagBtn.onclick = () => {
                const trueBrg = parseFloat(trueBearingInput.value);
                if (!isNaN(trueBrg) && current.declination !== null) {
                    magBearingInput.value = Math.round(DeclinationModule.trueToMagnetic(trueBrg, current.declination));
                }
            };
            
            toTrueBtn.onclick = () => {
                const magBrg = parseFloat(magBearingInput.value);
                if (!isNaN(magBrg) && current.declination !== null) {
                    trueBearingInput.value = Math.round(DeclinationModule.magneticToTrue(magBrg, current.declination));
                }
            };
            
            trueBearingInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const trueBrg = parseFloat(trueBearingInput.value);
                    if (!isNaN(trueBrg) && current.declination !== null) {
                        magBearingInput.value = Math.round(DeclinationModule.trueToMagnetic(trueBrg, current.declination));
                    }
                }
            };
            
            magBearingInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const magBrg = parseFloat(magBearingInput.value);
                    if (!isNaN(magBrg) && current.declination !== null) {
                        trueBearingInput.value = Math.round(DeclinationModule.magneticToTrue(magBrg, current.declination));
                    }
                }
            };
        }
        
        // Default zoom setting
        container.querySelector('#setting-default-zoom').onchange = async (e) => {
            await Storage.Settings.set('defaultZoom', parseInt(e.target.value));
            ModalsModule.showToast('Default zoom updated', 'success');
        };
        
        // Set home location
        container.querySelector('#set-home-btn').onclick = async () => {
            const mapState = MapModule.getMapState();
            await Storage.Settings.set('homeLocation', {
                lat: mapState.lat,
                lon: mapState.lon,
                zoom: mapState.zoom
            });
            ModalsModule.showToast('Home location saved', 'success');
            renderSettings(); // Re-render to show updated location
        };
        
        // Go to home location
        const goHomeBtn = container.querySelector('#go-home-btn');
        if (goHomeBtn) {
            goHomeBtn.onclick = async () => {
                const home = await Storage.Settings.get('homeLocation');
                if (home) {
                    MapModule.setCenter(home.lat, home.lon, home.zoom);
                    ModalsModule.showToast('Navigated to home', 'success');
                }
            };
        }
        
        // Print button handlers
        container.querySelector('#print-full-plan-btn').onclick = () => {
            if (typeof PrintModule !== 'undefined') {
                PrintModule.printFullPlan({});
            } else {
                ModalsModule.showToast('Print module not available', 'error');
            }
        };
        
        const printRouteBtn = container.querySelector('#print-route-card-btn');
        if (printRouteBtn) {
            printRouteBtn.onclick = () => {
                if (typeof PrintModule !== 'undefined') {
                    const routes = State.get('routes').filter(r => !r.isBuilding);
                    if (routes.length > 0) {
                        PrintModule.printRouteCard(routes[0], {});
                    }
                }
            };
        }
        
        const printWaypointsBtn = container.querySelector('#print-waypoints-btn');
        if (printWaypointsBtn) {
            printWaypointsBtn.onclick = () => {
                if (typeof PrintModule !== 'undefined') {
                    const waypoints = State.get('waypoints');
                    PrintModule.printWaypointList(waypoints, {});
                }
            };
        }
        
        container.querySelector('#print-comm-btn').onclick = () => {
            if (typeof PrintModule !== 'undefined') {
                PrintModule.printCommPlan({});
            }
        };
        
        container.querySelector('#print-quick-ref-btn').onclick = () => {
            if (typeof PrintModule !== 'undefined') {
                PrintModule.printQuickRef({});
            }
        };
        
        container.querySelector('#print-modal-btn').onclick = () => {
            if (typeof PrintModule !== 'undefined') {
                PrintModule.showPrintModal();
            }
        };
        
        // Export JSON
        container.querySelector('#export-json-btn').onclick = async () => {
            try {
                const data = await Storage.exportData();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `griddown-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                ModalsModule.showToast('Data exported', 'success');
            } catch (e) {
                console.error('Export failed:', e);
                ModalsModule.showToast('Export failed', 'error');
            }
        };
        
        // Import JSON
        container.querySelector('#import-json-input').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const success = await Storage.importData(text);
                
                if (success) {
                    // Reload state from storage
                    const waypoints = await Storage.Waypoints.getAll();
                    const routes = await Storage.Routes.getAll();
                    State.Waypoints.setAll(waypoints);
                    State.Routes.setAll(routes);
                    
                    ModalsModule.showToast('Data imported successfully', 'success');
                    renderSettings(); // Re-render to show new counts
                    MapModule.render();
                } else {
                    ModalsModule.showToast('Invalid file format', 'error');
                }
            } catch (err) {
                console.error('Import failed:', err);
                ModalsModule.showToast('Import failed: ' + err.message, 'error');
            }
            
            // Reset input
            e.target.value = '';
        };
        
        // Clear waypoints
        container.querySelector('#clear-waypoints-btn').onclick = () => {
            if (waypointCount === 0) {
                ModalsModule.showToast('No waypoints to clear', 'info');
                return;
            }
            showClearConfirmation('waypoints', waypointCount);
        };
        
        // Clear routes
        container.querySelector('#clear-routes-btn').onclick = () => {
            if (routeCount === 0) {
                ModalsModule.showToast('No routes to clear', 'info');
                return;
            }
            showClearConfirmation('routes', routeCount);
        };
        
        // Clear all data
        container.querySelector('#clear-all-btn').onclick = () => {
            if (waypointCount === 0 && routeCount === 0) {
                ModalsModule.showToast('No data to clear', 'info');
                return;
            }
            showClearConfirmation('all', waypointCount + routeCount);
        };
        
        // Clear cache
        container.querySelector('#clear-cache-btn').onclick = async () => {
            try {
                if ('caches' in window) {
                    const keys = await caches.keys();
                    const tileCache = keys.find(k => k.includes('tiles'));
                    if (tileCache) {
                        await caches.delete(tileCache);
                        ModalsModule.showToast('Tile cache cleared', 'success');
                    } else {
                        ModalsModule.showToast('No tile cache found', 'info');
                    }
                }
            } catch (e) {
                console.error('Cache clear failed:', e);
                ModalsModule.showToast('Failed to clear cache', 'error');
            }
        };
        
        // Restart feature tour
        const restartTourBtn = container.querySelector('#restart-tour-btn');
        if (restartTourBtn) {
            restartTourBtn.onclick = async () => {
                if (typeof OnboardingModule !== 'undefined') {
                    await OnboardingModule.reset();
                    OnboardingModule.start();
                } else {
                    ModalsModule.showToast('Onboarding module not available', 'error');
                }
            };
        }
    }
    
    /**
     * Show confirmation dialog for clearing data
     */
    function showClearConfirmation(type, count) {
        const modalContainer = document.getElementById('modal-container');
        const typeLabel = type === 'all' ? 'all data' : type;
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal" style="max-width:360px">
                    <div class="modal__header">
                        <h3 class="modal__title">Clear ${type === 'all' ? 'All Data' : type.charAt(0).toUpperCase() + type.slice(1)}?</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body" style="text-align:center;padding:24px">
                        <div style="width:56px;height:56px;margin:0 auto 16px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px">
                            🗑️
                        </div>
                        <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-bottom:8px">
                            This will permanently delete <strong style="color:#ef4444">${count}</strong> ${type === 'all' ? 'items' : type}.
                        </div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.4)">
                            This action cannot be undone.
                        </div>
                    </div>
                    <div class="modal__footer" style="justify-content:center">
                        <button class="btn btn--secondary" id="modal-cancel" style="min-width:100px">Cancel</button>
                        <button class="btn" id="modal-confirm" style="min-width:100px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff">Delete</button>
                    </div>
                </div>
            </div>
        `;
        
        const closeModal = () => { modalContainer.innerHTML = ''; };
        
        modalContainer.querySelector('#modal-close').onclick = closeModal;
        modalContainer.querySelector('#modal-cancel').onclick = closeModal;
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') closeModal();
        };
        
        modalContainer.querySelector('#modal-confirm').onclick = async () => {
            try {
                if (type === 'waypoints' || type === 'all') {
                    const waypoints = State.get('waypoints');
                    for (const wp of waypoints) {
                        await Storage.Waypoints.delete(wp.id);
                    }
                    State.Waypoints.setAll([]);
                }
                
                if (type === 'routes' || type === 'all') {
                    const routes = State.get('routes');
                    for (const r of routes) {
                        await Storage.Routes.delete(r.id);
                    }
                    State.Routes.setAll([]);
                }
                
                closeModal();
                ModalsModule.showToast(`${type === 'all' ? 'All data' : type.charAt(0).toUpperCase() + type.slice(1)} cleared`, 'success');
                renderSettings();
                MapModule.render();
            } catch (e) {
                console.error('Clear failed:', e);
                ModalsModule.showToast('Failed to clear data', 'error');
            }
        };
        
        // Keyboard support
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);
    }

    // =========================================================================
    // CONTINGENCY PLANNING PANEL
    // =========================================================================

    function renderContingency() {
        const routes = State.get('routes').filter(r => !r.isBuilding);
        const waypoints = State.get('waypoints');
        const bailoutPoints = waypoints.filter(w => w.type === 'bailout');
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Contingency Planning</h2>
            </div>
            
            <!-- Status Overview -->
            ${routes.length === 0 ? `
                <div class="status-card status-card--error" style="margin-bottom:20px">
                    <div class="status-card__icon">${Icons.get('alert')}</div>
                    <div>
                        <div class="status-card__title">No Routes Available</div>
                        <div class="status-card__desc">Create a route to enable contingency planning</div>
                    </div>
                </div>
            ` : bailoutPoints.length === 0 ? `
                <div class="status-card status-card--error" style="margin-bottom:20px">
                    <div class="status-card__icon">${Icons.get('alert')}</div>
                    <div>
                        <div class="status-card__title">No Bail-out Points</div>
                        <div class="status-card__desc">Add bail-out waypoints (🚁) for emergency exit analysis</div>
                    </div>
                </div>
            ` : `
                <div class="status-card status-card--success" style="margin-bottom:20px">
                    <div class="status-card__icon">${Icons.get('check')}</div>
                    <div>
                        <div class="status-card__title">Ready for Planning</div>
                        <div class="status-card__desc">${routes.length} route(s), ${bailoutPoints.length} bail-out point(s)</div>
                    </div>
                </div>
            `}
            
            <!-- Section: Bail-out Analysis -->
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                🚁 Bail-out Analysis
            </div>
            <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:20px">
                ${routes.length > 0 ? `
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Select Route</label>
                        <select id="bailout-route-select" style="width:100%">
                            ${routes.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Check at Mile Marker</label>
                        <div style="display:flex;gap:8px">
                            <input type="number" id="bailout-mile-input" placeholder="e.g., 15" min="0" step="0.1" style="flex:1">
                            <button class="btn btn--primary" id="check-bailout-btn">Check</button>
                        </div>
                    </div>
                    
                    <button class="btn btn--secondary btn--full" id="full-bailout-analysis-btn">
                        📊 Full Route Bail-out Analysis
                    </button>
                    
                    <div id="bailout-results" style="margin-top:12px"></div>
                ` : `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4)">
                        Create a route to analyze bail-out options
                    </div>
                `}
            </div>
            
            <!-- Section: Route Comparison -->
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                ↔️ Route Comparison
            </div>
            <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:20px">
                ${routes.length >= 2 ? `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                        <div>
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Primary Route</label>
                            <select id="primary-route-select" style="width:100%">
                                ${routes.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Alternate Route</label>
                            <select id="alternate-route-select" style="width:100%">
                                ${routes.map((r, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${r.name}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <button class="btn btn--primary btn--full" id="compare-routes-btn">
                        Compare Routes
                    </button>
                    <div id="route-comparison-results" style="margin-top:12px"></div>
                ` : `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4)">
                        ${routes.length === 0 ? 'Create routes to compare them' : 'Create a second route to enable comparison'}
                    </div>
                `}
            </div>
            
            <!-- Section: Time Checkpoints -->
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                ⏱️ Time-Based Checkpoints
            </div>
            <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:20px">
                ${routes.length > 0 ? `
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Select Route</label>
                        <select id="checkpoint-route-select" style="width:100%">
                            ${routes.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                        <div>
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Departure Date</label>
                            <input type="date" id="departure-date" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div>
                            <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Departure Time</label>
                            <input type="time" id="departure-time" value="08:00">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Checkpoint Interval (miles)</label>
                        <input type="number" id="checkpoint-interval" value="10" min="1" max="50">
                    </div>
                    
                    <button class="btn btn--primary btn--full" id="generate-checkpoints-btn">
                        Generate Checkpoints
                    </button>
                    
                    <div id="checkpoint-results" style="margin-top:12px"></div>
                ` : `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4)">
                        Create a route to generate checkpoints
                    </div>
                `}
            </div>
            
            <!-- Section: Itinerary Generator -->
            <div class="section-label" style="display:flex;align-items:center;gap:8px">
                📋 Trip Itinerary
            </div>
            <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:20px">
                ${routes.length > 0 ? `
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Select Route</label>
                        <select id="itinerary-route-select" style="width:100%">
                            ${routes.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Traveler Name</label>
                        <input type="text" id="traveler-name" placeholder="Your Name">
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Vehicle Description</label>
                        <input type="text" id="vehicle-info" placeholder="e.g., Red Toyota 4Runner, License ABC123">
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Emergency Contact 1</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                            <input type="text" id="emergency-name-1" placeholder="Name">
                            <input type="tel" id="emergency-phone-1" placeholder="Phone">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Emergency Contact 2 (Optional)</label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                            <input type="text" id="emergency-name-2" placeholder="Name">
                            <input type="tel" id="emergency-phone-2" placeholder="Phone">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:12px">
                        <label style="font-size:12px;color:rgba(255,255,255,0.5);display:block;margin-bottom:6px">Additional Notes</label>
                        <textarea id="itinerary-notes" rows="2" placeholder="Any special instructions or notes..."></textarea>
                    </div>
                    
                    <button class="btn btn--primary btn--full" id="generate-itinerary-btn" style="margin-bottom:8px">
                        📋 Generate Itinerary
                    </button>
                    
                    <div id="itinerary-preview" style="margin-top:12px"></div>
                ` : `
                    <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.4)">
                        Create a route to generate an itinerary
                    </div>
                `}
            </div>
            
            <!-- Quick Tips -->
            <div class="section-label">💡 Planning Tips</div>
            <div style="padding:14px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:12px;font-size:12px;color:rgba(255,255,255,0.7)">
                <p style="margin-bottom:8px">• Add bail-out points (🚁) at highway junctions, ranger stations, or areas with cell service</p>
                <p style="margin-bottom:8px">• Share your itinerary with emergency contacts before departure</p>
                <p style="margin-bottom:8px">• Set realistic checkpoint times - better to arrive early than be marked overdue</p>
                <p>• Include vehicle description and license plate for search teams</p>
            </div>
        `;
        
        // Attach event handlers
        attachContingencyHandlers(routes, waypoints);
    }
    
    /**
     * Attach event handlers for contingency panel
     */
    function attachContingencyHandlers(routes, waypoints) {
        // Bail-out at mile
        const checkBailoutBtn = container.querySelector('#check-bailout-btn');
        if (checkBailoutBtn) {
            checkBailoutBtn.onclick = () => {
                const routeIdx = parseInt(container.querySelector('#bailout-route-select').value);
                const mileMarker = parseFloat(container.querySelector('#bailout-mile-input').value);
                
                if (isNaN(mileMarker) || mileMarker < 0) {
                    ModalsModule.showToast('Enter a valid mile marker', 'error');
                    return;
                }
                
                const result = ContingencyModule.getBailoutAtMile(routes[routeIdx], waypoints, mileMarker);
                displayBailoutAtMile(result);
            };
        }
        
        // Full bailout analysis
        const fullBailoutBtn = container.querySelector('#full-bailout-analysis-btn');
        if (fullBailoutBtn) {
            fullBailoutBtn.onclick = () => {
                const routeIdx = parseInt(container.querySelector('#bailout-route-select').value);
                const result = ContingencyModule.analyzeBailouts(routes[routeIdx], waypoints);
                displayFullBailoutAnalysis(result);
            };
        }
        
        // Route comparison
        const compareBtn = container.querySelector('#compare-routes-btn');
        if (compareBtn) {
            compareBtn.onclick = () => {
                const primaryIdx = parseInt(container.querySelector('#primary-route-select').value);
                const alternateIdx = parseInt(container.querySelector('#alternate-route-select').value);
                
                if (primaryIdx === alternateIdx) {
                    ModalsModule.showToast('Select different routes to compare', 'error');
                    return;
                }
                
                const result = ContingencyModule.compareRoutes(routes[primaryIdx], routes[alternateIdx], waypoints);
                displayRouteComparison(result);
            };
        }
        
        // Generate checkpoints
        const checkpointBtn = container.querySelector('#generate-checkpoints-btn');
        if (checkpointBtn) {
            checkpointBtn.onclick = () => {
                const routeIdx = parseInt(container.querySelector('#checkpoint-route-select').value);
                const dateStr = container.querySelector('#departure-date').value;
                const timeStr = container.querySelector('#departure-time').value;
                const interval = parseInt(container.querySelector('#checkpoint-interval').value) || 10;
                
                const departureTime = new Date(`${dateStr}T${timeStr}`);
                
                const result = ContingencyModule.generateCheckpoints(routes[routeIdx], waypoints, {
                    departureTime,
                    intervalMiles: interval
                });
                
                displayCheckpoints(result);
            };
        }
        
        // Generate itinerary
        const itineraryBtn = container.querySelector('#generate-itinerary-btn');
        if (itineraryBtn) {
            itineraryBtn.onclick = () => {
                const routeIdx = parseInt(container.querySelector('#itinerary-route-select').value);
                const dateStr = container.querySelector('#departure-date')?.value || new Date().toISOString().split('T')[0];
                const timeStr = container.querySelector('#departure-time')?.value || '08:00';
                
                const travelerName = container.querySelector('#traveler-name').value || 'Traveler';
                const vehicleInfo = container.querySelector('#vehicle-info').value || 'Vehicle not specified';
                const notes = container.querySelector('#itinerary-notes').value || '';
                
                // Collect emergency contacts
                const emergencyContacts = [];
                const name1 = container.querySelector('#emergency-name-1').value;
                const phone1 = container.querySelector('#emergency-phone-1').value;
                if (name1 && phone1) {
                    emergencyContacts.push({ name: name1, phone: phone1 });
                }
                const name2 = container.querySelector('#emergency-name-2').value;
                const phone2 = container.querySelector('#emergency-phone-2').value;
                if (name2 && phone2) {
                    emergencyContacts.push({ name: name2, phone: phone2 });
                }
                
                const departureTime = new Date(`${dateStr}T${timeStr}`);
                
                const itinerary = ContingencyModule.generateItinerary(routes[routeIdx], waypoints, {
                    departureTime,
                    travelerName,
                    vehicleInfo,
                    emergencyContacts,
                    notes
                });
                
                displayItineraryPreview(itinerary);
            };
        }
    }
    
    /**
     * Display bail-out at mile result
     */
    function displayBailoutAtMile(result) {
        const resultsDiv = container.querySelector('#bailout-results');
        if (!resultsDiv) return;
        
        if (result.error) {
            resultsDiv.innerHTML = `
                <div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;color:#ef4444">
                    ${result.error}${result.recommendation ? `<br><small>${result.recommendation}</small>` : ''}
                </div>
            `;
            return;
        }
        
        const bp = result.nearestBailout;
        const risk = result.riskLevel;
        
        resultsDiv.innerHTML = `
            <div style="padding:14px;background:${risk.color}15;border:1px solid ${risk.color}30;border-radius:10px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <span style="font-size:20px">🚁</span>
                    <div>
                        <div style="font-weight:600;color:${risk.color}">${risk.label}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">At Mile ${result.actualMileMarker.toFixed(1)}</div>
                    </div>
                </div>
                
                ${bp ? `
                    <div style="padding:12px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:12px">
                        <div style="font-weight:500;margin-bottom:4px">${bp.name}</div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.6)">
                            📍 ${bp.distance.toFixed(1)} miles away<br>
                            🧭 Bearing: ${Math.round(bp.bearing)}° (${getCardinalDirection(bp.bearing)})<br>
                            ⏱️ Est. travel time: ${bp.estimatedTime < 1 ? Math.round(bp.estimatedTime * 60) + ' min' : bp.estimatedTime.toFixed(1) + ' hours'}
                        </div>
                        ${bp.notes ? `<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.4)">Note: ${bp.notes}</div>` : ''}
                    </div>
                ` : ''}
                
                ${result.alternatives && result.alternatives.length > 0 ? `
                    <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:6px">Alternatives:</div>
                    ${result.alternatives.map(alt => `
                        <div style="font-size:12px;padding:6px 8px;background:rgba(0,0,0,0.1);border-radius:4px;margin-bottom:4px">
                            ${alt.name} - ${alt.distance.toFixed(1)} mi ${getCardinalDirection(alt.bearing)}
                        </div>
                    `).join('')}
                ` : ''}
            </div>
        `;
    }
    
    /**
     * Display full bail-out analysis
     */
    function displayFullBailoutAnalysis(result) {
        const resultsDiv = container.querySelector('#bailout-results');
        if (!resultsDiv) return;
        
        if (result.error) {
            resultsDiv.innerHTML = `
                <div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:8px;color:#ef4444">
                    ${result.error}${result.recommendation ? `<br><small>${result.recommendation}</small>` : ''}
                </div>
            `;
            return;
        }
        
        const summary = result.summary;
        const overallColor = summary.overallRisk === 'high' ? '#ef4444' : summary.overallRisk === 'moderate' ? '#f59e0b' : '#22c55e';
        
        resultsDiv.innerHTML = `
            <div style="padding:14px;background:${overallColor}15;border:1px solid ${overallColor}30;border-radius:10px;margin-bottom:12px">
                <div style="font-weight:600;color:${overallColor};margin-bottom:8px">
                    Overall Risk: ${summary.overallRisk.toUpperCase()}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
                    <div>
                        <span style="color:rgba(255,255,255,0.5)">Avg Distance:</span>
                        <span style="font-weight:500"> ${summary.avgDistanceToBailout.toFixed(1)} mi</span>
                    </div>
                    <div>
                        <span style="color:rgba(255,255,255,0.5)">Max Distance:</span>
                        <span style="font-weight:500"> ${summary.maxDistanceToBailout.toFixed(1)} mi</span>
                    </div>
                    <div>
                        <span style="color:rgba(255,255,255,0.5)">Critical Sections:</span>
                        <span style="font-weight:500"> ${summary.criticalSectionCount}</span>
                    </div>
                    <div>
                        <span style="color:rgba(255,255,255,0.5)">Critical Miles:</span>
                        <span style="font-weight:500"> ${summary.criticalMiles.toFixed(1)} mi</span>
                    </div>
                </div>
            </div>
            
            ${result.criticalSections.length > 0 ? `
                <div style="font-size:12px;font-weight:500;margin-bottom:8px;color:#ef4444">
                    ⚠️ Critical Sections (far from exits):
                </div>
                ${result.criticalSections.map(sec => `
                    <div style="padding:10px;background:rgba(239,68,68,0.1);border-radius:6px;margin-bottom:6px;font-size:12px">
                        Mile ${sec.startMile.toFixed(1)} - ${sec.endMile.toFixed(1)} (${sec.length.toFixed(1)} mi)<br>
                        <span style="color:rgba(255,255,255,0.5)">Max distance to exit: ${sec.maxDistanceToBailout.toFixed(1)} mi</span>
                    </div>
                `).join('')}
            ` : `
                <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px;color:#22c55e;font-size:12px">
                    ✓ Good bail-out coverage throughout route
                </div>
            `}
        `;
    }
    
    /**
     * Display route comparison
     */
    function displayRouteComparison(result) {
        const resultsDiv = container.querySelector('#route-comparison-results');
        if (!resultsDiv) return;
        
        if (result.error) {
            resultsDiv.innerHTML = `<div style="color:#ef4444">${result.error}</div>`;
            return;
        }
        
        const p = result.primary;
        const a = result.alternate;
        const d = result.differences;
        const rec = result.recommendation;
        
        const recColor = rec.choice === 'primary' ? '#22c55e' : rec.choice === 'alternate' ? '#3b82f6' : '#f59e0b';
        
        resultsDiv.innerHTML = `
            <!-- Recommendation -->
            <div style="padding:12px;background:${recColor}20;border:1px solid ${recColor}40;border-radius:10px;margin-bottom:12px">
                <div style="font-weight:600;color:${recColor};margin-bottom:4px">
                    ${rec.choice === 'primary' ? '✓ Primary Recommended' : rec.choice === 'alternate' ? '✓ Alternate Recommended' : '≈ Either Route Viable'}
                </div>
                <div style="font-size:12px;color:rgba(255,255,255,0.7)">${rec.reason}</div>
            </div>
            
            <!-- Comparison Table -->
            <div style="background:rgba(0,0,0,0.2);border-radius:10px;overflow:hidden">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:11px;text-transform:uppercase;color:rgba(255,255,255,0.4);padding:10px;border-bottom:1px solid rgba(255,255,255,0.1)">
                    <div>Metric</div>
                    <div style="text-align:center">${p.name}</div>
                    <div style="text-align:center">${a.name}</div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px">
                    <div style="color:rgba(255,255,255,0.6)">Distance</div>
                    <div style="text-align:center;font-weight:500">${p.totalDistance.toFixed(1)} mi</div>
                    <div style="text-align:center;font-weight:500;color:${d.distance < 0 ? '#22c55e' : d.distance > 0 ? '#ef4444' : 'inherit'}">${a.totalDistance.toFixed(1)} mi</div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px">
                    <div style="color:rgba(255,255,255,0.6)">Est. Time</div>
                    <div style="text-align:center;font-weight:500">${ContingencyModule.formatDuration(p.estimatedTime)}</div>
                    <div style="text-align:center;font-weight:500;color:${d.time < 0 ? '#22c55e' : d.time > 0 ? '#ef4444' : 'inherit'}">${ContingencyModule.formatDuration(a.estimatedTime)}</div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px">
                    <div style="color:rgba(255,255,255,0.6)">Est. Fuel</div>
                    <div style="text-align:center;font-weight:500">${p.estimatedFuel.toFixed(1)} gal</div>
                    <div style="text-align:center;font-weight:500;color:${d.fuel < 0 ? '#22c55e' : d.fuel > 0 ? '#ef4444' : 'inherit'}">${a.estimatedFuel.toFixed(1)} gal</div>
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:10px;font-size:12px">
                    <div style="color:rgba(255,255,255,0.6)">Risk Score</div>
                    <div style="text-align:center;font-weight:500">${p.riskScore}</div>
                    <div style="text-align:center;font-weight:500;color:${d.riskScore < 0 ? '#22c55e' : d.riskScore > 0 ? '#ef4444' : 'inherit'}">${a.riskScore}</div>
                </div>
            </div>
        `;
    }
    
    /**
     * Display checkpoints
     */
    function displayCheckpoints(result) {
        const resultsDiv = container.querySelector('#checkpoint-results');
        if (!resultsDiv) return;
        
        if (result.error) {
            resultsDiv.innerHTML = `<div style="color:#ef4444">${result.error}</div>`;
            return;
        }
        
        resultsDiv.innerHTML = `
            <div style="padding:14px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.2);border-radius:10px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:600;color:#f97316">${result.routeName}</span>
                    <span style="font-size:12px;color:rgba(255,255,255,0.5)">${result.totalDistance.toFixed(1)} miles</span>
                </div>
                <div style="font-size:12px">
                    <div>🚗 Departure: <strong>${ContingencyModule.formatDateTime(result.departureTime)}</strong></div>
                    <div>🏁 ETA: <strong>${ContingencyModule.formatDateTime(result.estimatedArrival)}</strong></div>
                    <div>⏱️ Duration: <strong>${ContingencyModule.formatDuration(result.estimatedDuration)}</strong></div>
                </div>
            </div>
            
            <div style="font-size:12px;font-weight:500;margin-bottom:8px">Checkpoints (${result.checkpoints.length})</div>
            <div style="max-height:300px;overflow-y:auto">
                ${result.checkpoints.map((cp, i) => {
                    const icon = cp.type === 'start' ? '🚩' : cp.type === 'end' ? '🏁' : '📍';
                    return `
                        <div style="padding:10px;background:rgba(0,0,0,0.2);border-radius:8px;margin-bottom:6px">
                            <div style="display:flex;justify-content:space-between;align-items:center">
                                <span style="font-weight:500">${icon} ${cp.name}</span>
                                <span style="font-size:11px;color:rgba(255,255,255,0.4)">Mile ${cp.mileMarker.toFixed(1)}</span>
                            </div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px">
                                Expected: ${ContingencyModule.formatDateTime(cp.expectedTime)}<br>
                                <span style="color:#f59e0b">Overdue if not here by: ${ContingencyModule.formatDateTime(cp.overdueTime)}</span>
                            </div>
                            ${cp.searchArea ? `
                                <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px">
                                    🔍 ${cp.searchArea.description}
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
    
    /**
     * Display itinerary preview
     */
    function displayItineraryPreview(itinerary) {
        const previewDiv = container.querySelector('#itinerary-preview');
        if (!previewDiv) return;
        
        if (itinerary.error) {
            previewDiv.innerHTML = `<div style="color:#ef4444">${itinerary.error}</div>`;
            return;
        }
        
        previewDiv.innerHTML = `
            <div style="padding:14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:10px;margin-bottom:12px">
                <div style="font-weight:600;color:#22c55e;margin-bottom:8px">✓ Itinerary Generated</div>
                <div style="font-size:12px">
                    <div><strong>${itinerary.summary.route}</strong></div>
                    <div style="color:rgba(255,255,255,0.6)">${itinerary.summary.totalDistance} • ${itinerary.summary.estimatedDuration}</div>
                    <div style="color:rgba(255,255,255,0.6)">Departure: ${itinerary.summary.departureTime}</div>
                    <div style="color:rgba(255,255,255,0.6)">ETA: ${itinerary.summary.expectedArrival}</div>
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <button class="btn btn--primary" id="download-itinerary-text">
                    📄 Download Text
                </button>
                <button class="btn btn--secondary" id="download-itinerary-json">
                    💾 Download JSON
                </button>
            </div>
            
            <div style="margin-top:12px">
                <button class="btn btn--secondary btn--full" id="preview-itinerary-text">
                    👁️ Preview Text
                </button>
            </div>
            
            <div id="itinerary-text-preview" style="margin-top:12px"></div>
        `;
        
        // Download handlers
        previewDiv.querySelector('#download-itinerary-text').onclick = () => {
            ContingencyModule.downloadItinerary(itinerary, 'text');
            ModalsModule.showToast('Itinerary downloaded', 'success');
        };
        
        previewDiv.querySelector('#download-itinerary-json').onclick = () => {
            ContingencyModule.downloadItinerary(itinerary, 'json');
            ModalsModule.showToast('JSON downloaded', 'success');
        };
        
        previewDiv.querySelector('#preview-itinerary-text').onclick = () => {
            const textPreview = previewDiv.querySelector('#itinerary-text-preview');
            const text = ContingencyModule.exportItineraryAsText(itinerary);
            textPreview.innerHTML = `
                <div style="padding:12px;background:#000;border-radius:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;white-space:pre-wrap;max-height:400px;overflow-y:auto;color:#0f0">
${text}
                </div>
            `;
        };
    }
    
    // ==================== Sun/Moon Panel ====================
    
    // Track current date for sun/moon panel
    let sunMoonDate = new Date();
    
    /**
     * Render Sun/Moon Calculator Panel
     */
    function renderSunMoon() {
        // Initialize module if needed
        if (typeof SunMoonModule !== 'undefined') {
            SunMoonModule.init();
            
            // Sync with map location if available
            if (typeof MapModule !== 'undefined') {
                const mapState = MapModule.getMapState();
                if (mapState) {
                    SunMoonModule.setLocation(mapState.lat, mapState.lon);
                }
            }
        }
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">☀️ Sun & Moon</h2>
            </div>
            ${typeof SunMoonModule !== 'undefined' ? SunMoonModule.renderPanel(sunMoonDate) : `
                <div style="padding:40px;text-align:center;color:rgba(255,255,255,0.5)">
                    <div style="font-size:32px;margin-bottom:12px">☀️</div>
                    <div style="font-size:13px">Sun/Moon module not loaded</div>
                </div>
            `}
        `;
        
        // Bind events
        if (typeof SunMoonModule !== 'undefined') {
            SunMoonModule.bindPanelEvents(
                container, 
                sunMoonDate, 
                (newDate) => {
                    sunMoonDate = newDate;
                    renderSunMoon();
                },
                (lat, lon) => {
                    renderSunMoon();
                }
            );
        }
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
     * Render Navigation Panel
     */
    function renderNavigation() {
        const routes = State.get('routes').filter(r => !r.isBuilding);
        const waypoints = State.get('waypoints');
        
        // Get navigation state
        const navState = typeof NavigationModule !== 'undefined' ? NavigationModule.getState() : null;
        const isActive = navState?.isActive || false;
        const currentRoute = navState?.route || null;
        const navInfo = typeof NavigationModule !== 'undefined' ? NavigationModule.getNavigationInfo() : null;
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">🧭 Navigation</h2>
            </div>
            
            <!-- Navigation Status -->
            <div class="nav-status-indicator ${isActive ? 'nav-status-indicator--active' : 'nav-status-indicator--inactive'}">
                <div class="nav-status-indicator__dot ${isActive ? 'nav-status-indicator__dot--active' : 'nav-status-indicator__dot--inactive'}"></div>
                <div>
                    <div style="font-size:13px;font-weight:500">${isActive ? 'Navigating' : 'Navigation Inactive'}</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                        ${isActive && currentRoute ? currentRoute.name : 'Select a route to begin'}
                    </div>
                </div>
            </div>
            
            ${isActive && navInfo ? `
                <!-- Active Navigation Info -->
                <div style="padding:16px;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:12px;margin-bottom:16px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                        <span style="font-size:12px;color:rgba(255,255,255,0.5)">NEXT WAYPOINT</span>
                        <span style="font-size:12px;color:#f97316">${navInfo.currentPointIndex + 1} / ${navInfo.totalPoints}</span>
                    </div>
                    
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                        <div style="font-size:24px">${getNextWaypointIcon(navInfo, waypoints)}</div>
                        <div>
                            <div style="font-size:15px;font-weight:600">${getNextWaypointName(navInfo, waypoints)}</div>
                            <div style="font-size:24px;font-weight:700;color:#f97316">${formatNavDistance(navInfo.distanceToNext)}</div>
                        </div>
                    </div>
                    
                    <div style="display:flex;justify-content:space-around;padding:12px;background:rgba(0,0,0,0.2);border-radius:8px">
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${formatNavBearing(navInfo.bearingToNext)}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">BEARING</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${formatNavDistance(navInfo.distanceRemaining)}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">REMAINING</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:16px;font-weight:600">${formatNavTime(navInfo.timeRemaining)}</div>
                            <div style="font-size:9px;color:rgba(255,255,255,0.4)">ETA</div>
                        </div>
                    </div>
                    
                    ${navInfo.isOffRoute ? `
                        <div style="margin-top:12px;padding:10px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#ef4444;font-size:12px;font-weight:600;text-align:center">
                            ⚠️ OFF ROUTE - ${formatNavDistance(navInfo.offRouteDistance)} from path
                        </div>
                    ` : ''}
                </div>
                
                <!-- Waypoint Progress List -->
                <div class="section-label">Route Progress</div>
                <div class="nav-waypoint-list">
                    ${currentRoute && currentRoute.points ? currentRoute.points.map((pt, i) => {
                        const isCompleted = i < navInfo.currentPointIndex;
                        const isCurrent = i === navInfo.currentPointIndex;
                        const linkedWp = pt.waypointId ? waypoints.find(w => w.id === pt.waypointId) : null;
                        const wpType = linkedWp ? Constants.WAYPOINT_TYPES[linkedWp.type] : null;
                        return `
                            <div class="nav-waypoint-item ${isCurrent ? 'nav-waypoint-item--current' : ''} ${isCompleted ? 'nav-waypoint-item--completed' : ''}"
                                 data-waypoint-index="${i}">
                                <div class="nav-waypoint-item__index">${isCompleted ? '✓' : (i + 1)}</div>
                                <div class="nav-waypoint-item__icon">${wpType?.icon || '📍'}</div>
                                <div class="nav-waypoint-item__info">
                                    <div class="nav-waypoint-item__name">${linkedWp?.name || `Point ${i + 1}`}</div>
                                    ${!isCompleted ? `<div class="nav-waypoint-item__dist">${isCurrent ? 'Next' : ''}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('') : '<div style="padding:10px;color:rgba(255,255,255,0.4);font-size:12px">No waypoints</div>'}
                </div>
                
                <!-- Navigation Controls -->
                <div style="display:flex;gap:8px;margin-top:16px">
                    <button class="btn btn--secondary" id="nav-prev-btn" ${navInfo.currentPointIndex === 0 ? 'disabled' : ''} style="flex:1">
                        ⏮️ Prev
                    </button>
                    <button class="btn btn--secondary" id="nav-stop-btn" style="flex:1;background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#ef4444">
                        ⏹️ Stop
                    </button>
                    <button class="btn btn--secondary" id="nav-next-btn" ${navInfo.currentPointIndex >= navInfo.totalPoints - 1 ? 'disabled' : ''} style="flex:1">
                        Next ⏭️
                    </button>
                </div>
                
                <!-- Stats -->
                <div class="divider"></div>
                <div class="section-label">Trip Statistics</div>
                <div class="stat-grid stat-grid--2">
                    <div class="stat-box">
                        <div class="stat-box__value">${formatNavDistance(navInfo.stats?.distanceTraveled || 0)}</div>
                        <div class="stat-box__label">TRAVELED</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box__value">${formatNavTime((navInfo.stats?.elapsedTime || 0) / 3600)}</div>
                        <div class="stat-box__label">ELAPSED</div>
                    </div>
                </div>
            ` : `
                <!-- Route Selection -->
                ${routes.length > 0 ? `
                    <div class="section-label">Select Route to Navigate</div>
                    <div class="nav-route-selector">
                        ${routes.map(route => `
                            <div class="nav-route-card" data-route-id="${route.id}">
                                <div style="display:flex;align-items:center;gap:12px">
                                    <div style="width:40px;height:40px;background:rgba(249,115,22,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#f97316">
                                        ${Icons.get('route')}
                                    </div>
                                    <div style="flex:1">
                                        <div style="font-size:14px;font-weight:500">${route.name}</div>
                                        <div style="font-size:11px;color:rgba(255,255,255,0.5)">
                                            ${route.points?.length || 0} points • ${route.distance || '?'} mi • ${route.duration || '?'}
                                        </div>
                                    </div>
                                    <button class="btn btn--primary" data-start-nav="${route.id}" style="padding:8px 16px;font-size:12px">
                                        ▶️ Start
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <div class="empty-state__icon">${Icons.get('route')}</div>
                        <div class="empty-state__title">No Routes Available</div>
                        <div class="empty-state__desc">Create a route first to begin navigation</div>
                    </div>
                `}
            `}
            
            <div class="divider"></div>
            
            <!-- Navigation Settings -->
            <div class="section-label">Navigation Settings</div>
            <label class="checkbox-field" style="margin-bottom:8px">
                <input type="checkbox" id="nav-voice" ${navState?.settings?.voiceGuidance ? 'checked' : ''} style="width:auto">
                <span>Voice Guidance</span>
            </label>
            <label class="checkbox-field" style="margin-bottom:8px">
                <input type="checkbox" id="nav-offroute" ${navState?.settings?.offRouteAlerts !== false ? 'checked' : ''} style="width:auto">
                <span>Off-Route Alerts</span>
            </label>
            <label class="checkbox-field" style="margin-bottom:8px">
                <input type="checkbox" id="nav-autoadvance" ${navState?.settings?.autoAdvance !== false ? 'checked' : ''} style="width:auto">
                <span>Auto-Advance to Next Point</span>
            </label>
            <label class="checkbox-field" style="margin-bottom:8px">
                <input type="checkbox" id="nav-screenon" ${navState?.settings?.keepScreenOn ? 'checked' : ''} style="width:auto">
                <span>Keep Screen On</span>
            </label>
            <label class="checkbox-field" style="margin-bottom:8px">
                <input type="checkbox" id="nav-center" ${navState?.settings?.centerOnPosition !== false ? 'checked' : ''} style="width:auto">
                <span>Center Map on Position</span>
            </label>
            <label class="checkbox-field">
                <input type="checkbox" id="nav-breadcrumbs" ${navState?.settings?.showBreadcrumbs !== false ? 'checked' : ''} style="width:auto">
                <span>Show Track Breadcrumbs</span>
            </label>
            
            <!-- GPS Status Reminder -->
            <div style="margin-top:16px;padding:12px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:10px">
                <div style="font-size:12px;color:#3b82f6;display:flex;align-items:center;gap:8px">
                    ${Icons.get('locate')}
                    <span>Navigation requires GPS. Check GPS panel for status.</span>
                </div>
            </div>
        `;
        
        // Bind event handlers
        bindNavigationEvents();
    }
    
    /**
     * Bind navigation panel event handlers
     */
    function bindNavigationEvents() {
        // Start navigation buttons
        container.querySelectorAll('[data-start-nav]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const routeId = btn.dataset.startNav;
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.startNavigation(routeId);
                    renderNavigation();
                    // Show HUD on map
                    MapModule.render();
                }
            };
        });
        
        // Stop navigation
        const stopBtn = container.querySelector('#nav-stop-btn');
        if (stopBtn) {
            stopBtn.onclick = () => {
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.stopNavigation();
                    renderNavigation();
                    MapModule.render();
                }
            };
        }
        
        // Previous waypoint
        const prevBtn = container.querySelector('#nav-prev-btn');
        if (prevBtn) {
            prevBtn.onclick = () => {
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.previousWaypoint();
                    renderNavigation();
                }
            };
        }
        
        // Next waypoint
        const nextBtn = container.querySelector('#nav-next-btn');
        if (nextBtn) {
            nextBtn.onclick = () => {
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.nextWaypoint();
                    renderNavigation();
                }
            };
        }
        
        // Waypoint click to jump
        container.querySelectorAll('[data-waypoint-index]').forEach(item => {
            item.onclick = () => {
                const index = parseInt(item.dataset.waypointIndex);
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.goToWaypoint(index);
                    renderNavigation();
                }
            };
        });
        
        // Settings toggles
        const settingsMap = {
            'nav-voice': 'voiceGuidance',
            'nav-offroute': 'offRouteAlerts',
            'nav-autoadvance': 'autoAdvance',
            'nav-screenon': 'keepScreenOn',
            'nav-center': 'centerOnPosition',
            'nav-breadcrumbs': 'showBreadcrumbs'
        };
        
        Object.entries(settingsMap).forEach(([id, setting]) => {
            const checkbox = container.querySelector(`#${id}`);
            if (checkbox) {
                checkbox.onchange = () => {
                    if (typeof NavigationModule !== 'undefined') {
                        NavigationModule.updateSettings({ [setting]: checkbox.checked });
                    }
                };
            }
        });
    }
    
    /**
     * Get next waypoint icon from navigation info
     */
    function getNextWaypointIcon(navInfo, waypoints) {
        if (!navInfo || !navInfo.route || !navInfo.route.points) return '📍';
        const currentPoint = navInfo.route.points[navInfo.currentPointIndex];
        if (!currentPoint) return '📍';
        if (currentPoint.waypointId) {
            const wp = waypoints.find(w => w.id === currentPoint.waypointId);
            if (wp) {
                const wpType = Constants.WAYPOINT_TYPES[wp.type];
                return wpType?.icon || '📍';
            }
        }
        return '📍';
    }
    
    /**
     * Get next waypoint name from navigation info
     */
    function getNextWaypointName(navInfo, waypoints) {
        if (!navInfo || !navInfo.route || !navInfo.route.points) return 'Unknown';
        const currentPoint = navInfo.route.points[navInfo.currentPointIndex];
        if (!currentPoint) return 'Unknown';
        if (currentPoint.waypointId) {
            const wp = waypoints.find(w => w.id === currentPoint.waypointId);
            if (wp) return wp.name;
        }
        return currentPoint.name || `Point ${navInfo.currentPointIndex + 1}`;
    }
    
    /**
     * Format navigation distance
     */
    function formatNavDistance(miles) {
        if (miles === null || miles === undefined) return '--';
        if (miles < 0.1) {
            return `${Math.round(miles * 5280)} ft`;
        } else if (miles < 10) {
            return `${miles.toFixed(2)} mi`;
        } else {
            return `${miles.toFixed(1)} mi`;
        }
    }
    
    /**
     * Format navigation bearing
     */
    function formatNavBearing(degrees) {
        if (degrees === null || degrees === undefined) return '--';
        const dir = getCardinalDirection(degrees);
        return `${Math.round(degrees)}° ${dir}`;
    }
    
    /**
     * Format navigation time (hours to readable)
     */
    function formatNavTime(hours) {
        if (hours === null || hours === undefined) return '--';
        if (hours < 1/60) {
            return `${Math.round(hours * 3600)}s`;
        } else if (hours < 1) {
            return `${Math.round(hours * 60)}m`;
        } else {
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
    }

    // ==================== COORDINATE CONVERTER ====================

    /**
     * Render the Coordinate Converter panel
     */
    function renderCoordinateConverter() {
        const currentFormat = typeof Coordinates !== 'undefined' ? Coordinates.getFormat() : 'dd';
        const formats = typeof Coordinates !== 'undefined' ? Coordinates.FORMATS : {
            DD: 'dd', DMS: 'dms', DDM: 'ddm', UTM: 'utm', MGRS: 'mgrs'
        };
        
        // Get GPS position if available
        let gpsLat = null, gpsLon = null, gpsAccuracy = null;
        if (typeof GPSModule !== 'undefined') {
            const gpsState = GPSModule.getState();
            if (gpsState.position) {
                gpsLat = gpsState.position.lat;
                gpsLon = gpsState.position.lon;
                gpsAccuracy = gpsState.position.accuracy;
            }
        }
        
        // Get map center
        let mapLat = 37.4215, mapLon = -119.1892;
        if (typeof MapModule !== 'undefined' && MapModule.getMapState) {
            const mapState = MapModule.getMapState();
            mapLat = mapState.lat;
            mapLon = mapState.lon;
        }

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Coordinate Converter</h2>
            </div>
            
            <!-- Input Section -->
            <div class="coord-converter-section">
                <div class="section-label">Enter Coordinates</div>
                <div class="coord-input-group">
                    <input type="text" 
                        id="coord-input" 
                        class="coord-input" 
                        placeholder="Enter any format: DD, DMS, UTM, MGRS..."
                        autocomplete="off"
                        spellcheck="false">
                    <button class="btn btn--primary coord-input-go" id="coord-go-btn" title="Go to location">
                        ${Icons.get('arrowRight')}
                    </button>
                </div>
                <div id="coord-input-status" class="coord-input-status"></div>
                <div class="coord-input-examples">
                    <span class="coord-example-label">Examples:</span>
                    <button class="coord-example" data-example="37.4215, -119.1892">DD</button>
                    <button class="coord-example" data-example="37° 25' 17.4&quot; N, 119° 11' 21.1&quot; W">DMS</button>
                    <button class="coord-example" data-example="11S 318234 4143234">UTM</button>
                    <button class="coord-example" data-example="11S LA 18234 43234">MGRS</button>
                </div>
            </div>
            
            <!-- Conversion Results -->
            <div id="coord-results" class="coord-results" style="display:none">
                <div class="section-label">Converted Coordinates</div>
                <div class="coord-results-list">
                    <div class="coord-result-item" data-format="dd">
                        <div class="coord-result-label">Decimal Degrees (DD)</div>
                        <div class="coord-result-row">
                            <div class="coord-result-value" id="result-dd">--</div>
                            <button class="coord-copy-btn" data-copy="dd" title="Copy">${Icons.get('copy')}</button>
                        </div>
                    </div>
                    <div class="coord-result-item" data-format="dms">
                        <div class="coord-result-label">Degrees Minutes Seconds (DMS)</div>
                        <div class="coord-result-row">
                            <div class="coord-result-value" id="result-dms">--</div>
                            <button class="coord-copy-btn" data-copy="dms" title="Copy">${Icons.get('copy')}</button>
                        </div>
                    </div>
                    <div class="coord-result-item" data-format="ddm">
                        <div class="coord-result-label">Degrees Decimal Minutes (DDM)</div>
                        <div class="coord-result-row">
                            <div class="coord-result-value" id="result-ddm">--</div>
                            <button class="coord-copy-btn" data-copy="ddm" title="Copy">${Icons.get('copy')}</button>
                        </div>
                    </div>
                    <div class="coord-result-item" data-format="utm">
                        <div class="coord-result-label">UTM</div>
                        <div class="coord-result-row">
                            <div class="coord-result-value" id="result-utm">--</div>
                            <button class="coord-copy-btn" data-copy="utm" title="Copy">${Icons.get('copy')}</button>
                        </div>
                    </div>
                    <div class="coord-result-item" data-format="mgrs">
                        <div class="coord-result-label">MGRS</div>
                        <div class="coord-result-row">
                            <div class="coord-result-value" id="result-mgrs">--</div>
                            <button class="coord-copy-btn" data-copy="mgrs" title="Copy">${Icons.get('copy')}</button>
                        </div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="coord-actions">
                    <button class="btn btn--secondary btn--full" id="coord-create-waypoint">
                        ${Icons.get('waypoint')} Create Waypoint Here
                    </button>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Quick Access: GPS Position -->
            ${gpsLat !== null ? `
                <div class="coord-quick-section">
                    <div class="section-label">📍 Current GPS Position</div>
                    <div class="coord-quick-card coord-quick-card--gps" id="gps-position-card">
                        <div class="coord-quick-info">
                            <div class="coord-quick-value">${formatCoordForDisplay(gpsLat, gpsLon, currentFormat)}</div>
                            <div class="coord-quick-meta">Accuracy: ±${gpsAccuracy ? gpsAccuracy.toFixed(0) : '?'}m</div>
                        </div>
                        <div class="coord-quick-actions">
                            <button class="coord-quick-btn" data-action="copy-gps" title="Copy">${Icons.get('copy')}</button>
                            <button class="coord-quick-btn" data-action="use-gps" title="Use this">${Icons.get('arrowRight')}</button>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="coord-quick-section">
                    <div class="section-label">📍 Current GPS Position</div>
                    <div class="coord-quick-card coord-quick-card--inactive">
                        <div class="coord-quick-info">
                            <div class="coord-quick-value" style="color:var(--color-text-muted)">GPS not active</div>
                            <div class="coord-quick-meta">Enable GPS in the GPS panel to see your position</div>
                        </div>
                    </div>
                </div>
            `}
            
            <!-- Quick Access: Map Center -->
            <div class="coord-quick-section">
                <div class="section-label">🗺️ Map Center</div>
                <div class="coord-quick-card" id="map-center-card">
                    <div class="coord-quick-info">
                        <div class="coord-quick-value">${formatCoordForDisplay(mapLat, mapLon, currentFormat)}</div>
                        <div class="coord-quick-meta">Current map viewport center</div>
                    </div>
                    <div class="coord-quick-actions">
                        <button class="coord-quick-btn" data-action="copy-map" title="Copy">${Icons.get('copy')}</button>
                        <button class="coord-quick-btn" data-action="use-map" title="Use this">${Icons.get('arrowRight')}</button>
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Display Format Preference -->
            <div class="coord-settings-section">
                <div class="section-label">Display Format Preference</div>
                <div class="coord-format-selector">
                    ${Object.entries(formats).map(([key, value]) => `
                        <button class="coord-format-btn ${currentFormat === value ? 'coord-format-btn--active' : ''}" 
                            data-format="${value}">
                            ${key}
                        </button>
                    `).join('')}
                </div>
                <div class="coord-format-desc">
                    This format will be used across the app for displaying coordinates.
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Distance Calculator -->
            <div class="coord-distance-section">
                <div class="section-label">Distance & Bearing Calculator</div>
                <div class="coord-distance-inputs">
                    <div class="form-group">
                        <label>From (Point A)</label>
                        <input type="text" id="distance-from" placeholder="Enter coordinates" class="coord-input-small">
                    </div>
                    <div class="form-group">
                        <label>To (Point B)</label>
                        <input type="text" id="distance-to" placeholder="Enter coordinates" class="coord-input-small">
                    </div>
                </div>
                <button class="btn btn--secondary btn--full" id="calc-distance-btn">
                    ${Icons.get('ruler')} Calculate Distance & Bearing
                </button>
                <div id="distance-result" class="coord-distance-result" style="display:none">
                    <div class="coord-distance-stat">
                        <span class="coord-distance-label">Distance:</span>
                        <span class="coord-distance-value" id="distance-value">--</span>
                    </div>
                    <div class="coord-distance-stat">
                        <span class="coord-distance-label">Bearing:</span>
                        <span class="coord-distance-value" id="bearing-value">--</span>
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <!-- Reference Info -->
            <div class="coord-reference-section">
                <div class="section-label">Quick Reference</div>
                <div class="coord-reference-list">
                    <div class="coord-reference-item">
                        <strong>DD</strong> - Decimal Degrees: 37.4215° N, 119.1892° W
                    </div>
                    <div class="coord-reference-item">
                        <strong>DMS</strong> - Degrees Minutes Seconds: 37° 25' 17.4" N
                    </div>
                    <div class="coord-reference-item">
                        <strong>DDM</strong> - Degrees Decimal Minutes: 37° 25.290' N
                    </div>
                    <div class="coord-reference-item">
                        <strong>UTM</strong> - Universal Transverse Mercator: 11S 318234 4143234
                    </div>
                    <div class="coord-reference-item">
                        <strong>MGRS</strong> - Military Grid Reference: 11SLA1823443234
                    </div>
                </div>
            </div>
        `;
        
        // Bind event handlers
        bindCoordinateConverterEvents();
    }
    
    /**
     * Format coordinate for display using current or specified format
     */
    function formatCoordForDisplay(lat, lon, format) {
        if (typeof Coordinates === 'undefined') {
            return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
        }
        return Coordinates.format(lat, lon, { format: format, compact: true });
    }
    
    /**
     * Bind all event handlers for the coordinate converter
     * Note: Most events are now handled via event delegation in setupEventDelegation()
     * This function is kept for backward compatibility and any remaining non-delegatable events
     */
    function bindCoordinateConverterEvents() {
        // Event delegation handles most interactions now
        // This function is kept for any edge cases that need direct binding
        // All click, input, and change events are handled by setupEventDelegation()
        
        // Reset parsed coords state when panel renders
        coordConverterState.parsedCoords = null;
        
        const container = document.getElementById('panel-content');
        if (!container) return;
        
        const input = container.querySelector('#coord-input');
        const goBtn = container.querySelector('#coord-go-btn');
        if (!input || !goBtn) return;
        
        // Input parsing with debounce
        let parseTimeout = null;
        input.addEventListener('input', function() {
            clearTimeout(parseTimeout);
            parseTimeout = setTimeout(() => {
                const value = this.value.trim();
                const resultEl = container.querySelector('#coord-parse-result');
                const formatDetected = container.querySelector('#coord-format-detected');
                
                if (!value) {
                    coordConverterState.parsedCoords = null;
                    if (resultEl) resultEl.style.display = 'none';
                    if (formatDetected) formatDetected.textContent = '';
                    goBtn.disabled = true;
                    return;
                }
                
                if (typeof Coordinates !== 'undefined') {
                    const parsed = Coordinates.parse(value);
                    if (parsed) {
                        coordConverterState.parsedCoords = parsed;
                        if (resultEl) {
                            resultEl.style.display = 'block';
                            resultEl.querySelector('#coord-result-dd').textContent = 
                                `${parsed.lat.toFixed(6)}°, ${parsed.lon.toFixed(6)}°`;
                            resultEl.querySelector('#coord-result-dms').textContent = 
                                Coordinates.format(parsed.lat, parsed.lon, { format: 'DMS' });
                        }
                        if (formatDetected) {
                            formatDetected.textContent = `Detected: ${parsed.format || 'DD'}`;
                            formatDetected.style.color = '#22c55e';
                        }
                        goBtn.disabled = false;
                    } else {
                        coordConverterState.parsedCoords = null;
                        if (resultEl) resultEl.style.display = 'none';
                        if (formatDetected) {
                            formatDetected.textContent = 'Invalid format';
                            formatDetected.style.color = '#ef4444';
                        }
                        goBtn.disabled = true;
                    }
                }
            }, 300);
        });
        
        // Go button - navigate to coordinates
        goBtn.addEventListener('click', function() {
            if (coordConverterState.parsedCoords && typeof MapModule !== 'undefined') {
                MapModule.setCenter(coordConverterState.parsedCoords.lat, coordConverterState.parsedCoords.lon);
                showCoordToast('Map centered on coordinates');
            } else if (!coordConverterState.parsedCoords) {
                showCoordToast('Enter valid coordinates first', 'error');
            }
        });
        
        // Example buttons
        container.querySelectorAll('.coord-example').forEach(btn => {
            btn.addEventListener('click', function() {
                input.value = this.dataset.example;
                input.dispatchEvent(new Event('input'));
            });
        });
        
        // Copy buttons
        container.querySelectorAll('.coord-copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const format = this.dataset.copy;
                const valueEl = container.querySelector(`#result-${format}`);
                if (valueEl && valueEl.textContent !== '--') {
                    copyToClipboard(valueEl.textContent);
                    showCoordToast(`${format.toUpperCase()} copied to clipboard`);
                }
            });
        });
        
        // Create waypoint button
        const createWpBtn = container.querySelector('#coord-create-waypoint');
        if (createWpBtn) {
            createWpBtn.addEventListener('click', function() {
                if (parsedCoords && typeof ModalsModule !== 'undefined') {
                    // Open waypoint modal with these coordinates
                    ModalsModule.openWaypointModal({
                        lat: parsedCoords.lat,
                        lon: parsedCoords.lon,
                        x: lonToX(parsedCoords.lon),
                        y: latToY(parsedCoords.lat)
                    });
                }
            });
        }
        
        // Quick action buttons (GPS and Map Center)
        container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', function() {
                const action = this.dataset.action;
                
                if (action === 'copy-gps' || action === 'copy-map') {
                    const card = this.closest('.coord-quick-card');
                    const valueEl = card.querySelector('.coord-quick-value');
                    if (valueEl) {
                        copyToClipboard(valueEl.textContent);
                        showCoordToast('Coordinates copied');
                    }
                } else if (action === 'use-gps') {
                    if (typeof GPSModule !== 'undefined') {
                        const state = GPSModule.getState();
                        if (state.position) {
                            input.value = `${state.position.lat}, ${state.position.lon}`;
                            input.dispatchEvent(new Event('input'));
                        }
                    }
                } else if (action === 'use-map') {
                    if (typeof MapModule !== 'undefined' && MapModule.getMapState) {
                        const mapState = MapModule.getMapState();
                        input.value = `${mapState.lat}, ${mapState.lon}`;
                        input.dispatchEvent(new Event('input'));
                    }
                }
            });
        });
        
        // Format selector buttons
        container.querySelectorAll('.coord-format-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const format = this.dataset.format;
                if (typeof Coordinates !== 'undefined') {
                    Coordinates.setFormat(format);
                    
                    // Update button states
                    container.querySelectorAll('.coord-format-btn').forEach(b => {
                        b.classList.toggle('coord-format-btn--active', b.dataset.format === format);
                    });
                    
                    // Refresh the panel to update displayed coords
                    renderCoordinateConverter();
                    showCoordToast(`Display format set to ${format.toUpperCase()}`);
                }
            });
        });
        
        // Distance calculator
        const calcDistBtn = container.querySelector('#calc-distance-btn');
        if (calcDistBtn) {
            calcDistBtn.addEventListener('click', function() {
                const fromInput = container.querySelector('#distance-from');
                const toInput = container.querySelector('#distance-to');
                const resultEl = container.querySelector('#distance-result');
                
                if (typeof Coordinates === 'undefined') return;
                
                const fromCoords = Coordinates.parse(fromInput.value);
                const toCoords = Coordinates.parse(toInput.value);
                
                if (!fromCoords) {
                    showCoordToast('Invalid "From" coordinates', 'error');
                    return;
                }
                if (!toCoords) {
                    showCoordToast('Invalid "To" coordinates', 'error');
                    return;
                }
                
                // Calculate distance and bearing
                const dist = Coordinates.distance(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
                const bear = Coordinates.bearing(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
                
                // Display results
                container.querySelector('#distance-value').textContent = formatDistanceResult(dist);
                container.querySelector('#bearing-value').textContent = Coordinates.formatBearing(bear);
                resultEl.style.display = 'block';
            });
        }
    }
    
    /**
     * Update conversion results display
     */
    function updateConversionResults(lat, lon) {
        if (typeof Coordinates === 'undefined') return;
        
        container.querySelector('#result-dd').textContent = Coordinates.toDD(lat, lon);
        container.querySelector('#result-dms').textContent = Coordinates.toDMS(lat, lon);
        container.querySelector('#result-ddm').textContent = Coordinates.toDDM(lat, lon);
        container.querySelector('#result-utm').textContent = Coordinates.toUTM(lat, lon);
        container.querySelector('#result-mgrs').textContent = Coordinates.toMGRS(lat, lon);
    }
    
    /**
     * Copy text to clipboard
     */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(err => {
                console.warn('Clipboard write failed:', err);
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }
    
    /**
     * Fallback copy using textarea
     */
    function fallbackCopy(text) {
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
     * Show toast message for coordinate converter
     */
    function showCoordToast(message, type = 'success') {
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showToast) {
            ModalsModule.showToast(message, type);
        }
    }
    
    /**
     * Format distance result with appropriate units
     */
    function formatDistanceResult(miles) {
        if (miles < 0.1) {
            const feet = miles * 5280;
            return `${feet.toFixed(0)} ft (${(feet * 0.3048).toFixed(0)} m)`;
        } else if (miles < 1) {
            const feet = miles * 5280;
            return `${feet.toFixed(0)} ft (${miles.toFixed(2)} mi)`;
        } else {
            const km = miles * 1.60934;
            return `${miles.toFixed(2)} mi (${km.toFixed(2)} km)`;
        }
    }
    
    /**
     * Convert longitude to approximate X coordinate (for waypoint creation)
     */
    function lonToX(lon) {
        return 50 + (lon + 119.1892) / 0.004;
    }
    
    /**
     * Convert latitude to approximate Y coordinate (for waypoint creation)
     */
    function latToY(lat) {
        return 50 + (lat - 37.4215) / 0.002;
    }

    // ==================== COMMUNICATION PLAN ====================

    // Comm plan state (loaded from storage)
    let commPlan = null;
    let commPlanLoaded = false;

    /**
     * Default comm plan structure
     */
    function getDefaultCommPlan() {
        return {
            channels: [
                { id: 'ch1', name: 'Primary', frequency: '146.520', mode: 'FM', tone: '', power: 'High', isPrimary: true, notes: 'National simplex calling frequency' },
                { id: 'ch2', name: 'Tactical', frequency: '147.450', mode: 'FM', tone: '100.0', power: 'Medium', isPrimary: false, notes: 'Team tactical channel' },
                { id: 'ch3', name: 'Emergency', frequency: '146.460', mode: 'FM', tone: '', power: 'High', isPrimary: false, notes: 'Emergency backup' }
            ],
            callSigns: [
                { id: 'cs1', name: 'Team Lead', callSign: 'Alpha-1', role: 'Command', notes: '' },
                { id: 'cs2', name: 'Scout', callSign: 'Bravo-2', role: 'Reconnaissance', notes: '' },
                { id: 'cs3', name: 'Support', callSign: 'Charlie-3', role: 'Logistics', notes: '' }
            ],
            schedule: {
                enabled: true,
                checkIns: [
                    { id: 'ck1', time: '08:00', channel: 'ch1', type: 'routine', notes: 'Morning check-in' },
                    { id: 'ck2', time: '12:00', channel: 'ch1', type: 'routine', notes: 'Midday status' },
                    { id: 'ck3', time: '18:00', channel: 'ch1', type: 'routine', notes: 'Evening check-in' }
                ],
                missedCheckInProtocol: 'Wait 15 minutes, then attempt contact on backup channel. After 30 minutes with no contact, initiate search protocol.'
            },
            emergency: {
                distressWord: 'MAYDAY',
                duressWord: 'UNCLE',
                rallyPoint: 'Primary bail-out point (Highway Junction)',
                emergencyChannel: 'ch3',
                protocols: [
                    { id: 'ep1', situation: 'Medical Emergency', procedure: '1. Broadcast MAYDAY on primary\n2. Give location & nature of emergency\n3. Switch to emergency channel\n4. Maintain radio watch' },
                    { id: 'ep2', situation: 'Lost/Separated', procedure: '1. Stop and stay put\n2. Three short broadcasts on primary\n3. If no response, move to high ground\n4. Activate PLB if available' },
                    { id: 'ep3', situation: 'Vehicle Breakdown', procedure: '1. Report position on primary\n2. Assess repair options\n3. Coordinate pickup/support\n4. Set up rally point if needed' }
                ]
            },
            notes: ''
        };
    }

    /**
     * Load comm plan from storage
     */
    async function loadCommPlan() {
        if (commPlanLoaded) return commPlan;
        try {
            const saved = await Storage.Settings.get('commPlan');
            commPlan = saved || getDefaultCommPlan();
            commPlanLoaded = true;
        } catch (e) {
            console.error('Failed to load comm plan:', e);
            commPlan = getDefaultCommPlan();
        }
        return commPlan;
    }

    /**
     * Save comm plan to storage
     */
    async function saveCommPlan() {
        try {
            await Storage.Settings.set('commPlan', commPlan);
            showCommToast('Communication plan saved');
        } catch (e) {
            console.error('Failed to save comm plan:', e);
            showCommToast('Failed to save', 'error');
        }
    }

    /**
     * Show toast for comm module
     */
    function showCommToast(message, type = 'success') {
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showToast) {
            ModalsModule.showToast(message, type);
        }
    }

    /**
     * Render the Communication Plan panel
     */
    async function renderComms() {
        // Load comm plan if not loaded
        if (!commPlanLoaded) {
            await loadCommPlan();
        }

        const plan = commPlan;
        const primaryChannel = plan.channels.find(c => c.isPrimary) || plan.channels[0];
        const emergencyChannel = plan.channels.find(c => c.id === plan.emergency.emergencyChannel);
        const nextCheckIn = getNextCheckIn(plan.schedule.checkIns);

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">Communication Plan</h2>
                <button class="btn btn--secondary" id="comm-export-btn" title="Export Plan">
                    ${Icons.get('export')}
                </button>
            </div>

            <!-- Quick Reference Card -->
            <div class="comm-quick-ref">
                <div class="comm-quick-ref__header">
                    ${Icons.get('broadcast')} Quick Reference
                </div>
                <div class="comm-quick-ref__grid">
                    <div class="comm-quick-ref__item">
                        <div class="comm-quick-ref__label">Primary Channel</div>
                        <div class="comm-quick-ref__value comm-quick-ref__value--primary">
                            ${primaryChannel ? `${primaryChannel.frequency} MHz` : 'Not set'}
                        </div>
                        <div class="comm-quick-ref__sub">${primaryChannel?.name || ''}</div>
                    </div>
                    <div class="comm-quick-ref__item">
                        <div class="comm-quick-ref__label">Next Check-in</div>
                        <div class="comm-quick-ref__value ${nextCheckIn ? '' : 'comm-quick-ref__value--muted'}">
                            ${nextCheckIn ? nextCheckIn.time : 'None scheduled'}
                        </div>
                        <div class="comm-quick-ref__sub">${nextCheckIn?.notes || ''}</div>
                    </div>
                </div>
                <div class="comm-quick-ref__emergency">
                    <span class="comm-quick-ref__emergency-label">Emergency:</span>
                    <span class="comm-quick-ref__emergency-word">${plan.emergency.distressWord}</span>
                    <span class="comm-quick-ref__emergency-freq">${emergencyChannel ? emergencyChannel.frequency + ' MHz' : 'Use primary'}</span>
                </div>
            </div>

            <!-- Channels Section -->
            <div class="comm-section">
                <div class="comm-section__header">
                    <span class="comm-section__title">${Icons.get('antenna')} Radio Channels</span>
                    <button class="btn btn--secondary btn--sm" id="add-channel-btn">
                        ${Icons.get('plus')} Add
                    </button>
                </div>
                <div class="comm-channel-list">
                    ${plan.channels.map(ch => `
                        <div class="comm-channel ${ch.isPrimary ? 'comm-channel--primary' : ''}" data-channel-id="${ch.id}">
                            <div class="comm-channel__header">
                                <div class="comm-channel__name">
                                    ${ch.isPrimary ? '<span class="comm-channel__badge">PRIMARY</span>' : ''}
                                    ${ch.name}
                                </div>
                                <div class="comm-channel__actions">
                                    <button class="comm-action-btn" data-edit-channel="${ch.id}" title="Edit">
                                        ${Icons.get('edit')}
                                    </button>
                                    <button class="comm-action-btn comm-action-btn--danger" data-delete-channel="${ch.id}" title="Delete">
                                        ${Icons.get('trash')}
                                    </button>
                                </div>
                            </div>
                            <div class="comm-channel__details">
                                <div class="comm-channel__freq">${ch.frequency} MHz</div>
                                <div class="comm-channel__meta">
                                    <span class="comm-tag">${ch.mode}</span>
                                    ${ch.tone ? `<span class="comm-tag">CTCSS ${ch.tone}</span>` : ''}
                                    <span class="comm-tag">${ch.power}</span>
                                </div>
                            </div>
                            ${ch.notes ? `<div class="comm-channel__notes">${ch.notes}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Call Signs Section -->
            <div class="comm-section">
                <div class="comm-section__header">
                    <span class="comm-section__title">${Icons.get('userCheck')} Call Signs</span>
                    <button class="btn btn--secondary btn--sm" id="add-callsign-btn">
                        ${Icons.get('plus')} Add
                    </button>
                </div>
                <div class="comm-callsign-list">
                    ${plan.callSigns.map(cs => `
                        <div class="comm-callsign" data-callsign-id="${cs.id}">
                            <div class="comm-callsign__sign">${cs.callSign}</div>
                            <div class="comm-callsign__info">
                                <div class="comm-callsign__name">${cs.name}</div>
                                <div class="comm-callsign__role">${cs.role}</div>
                            </div>
                            <div class="comm-callsign__actions">
                                <button class="comm-action-btn" data-edit-callsign="${cs.id}" title="Edit">
                                    ${Icons.get('edit')}
                                </button>
                                <button class="comm-action-btn comm-action-btn--danger" data-delete-callsign="${cs.id}" title="Delete">
                                    ${Icons.get('trash')}
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Check-in Schedule Section -->
            <div class="comm-section">
                <div class="comm-section__header">
                    <span class="comm-section__title">${Icons.get('calendar')} Check-in Schedule</span>
                    <button class="btn btn--secondary btn--sm" id="add-checkin-btn">
                        ${Icons.get('plus')} Add
                    </button>
                </div>
                <label class="checkbox-field" style="margin-bottom: 12px;">
                    <input type="checkbox" id="schedule-enabled" ${plan.schedule.enabled ? 'checked' : ''} style="width:auto">
                    <span>Enable scheduled check-ins</span>
                </label>
                ${plan.schedule.enabled ? `
                    <div class="comm-schedule-list">
                        ${plan.schedule.checkIns.map(ck => {
                            const ch = plan.channels.find(c => c.id === ck.channel);
                            return `
                                <div class="comm-checkin" data-checkin-id="${ck.id}">
                                    <div class="comm-checkin__time">${ck.time}</div>
                                    <div class="comm-checkin__info">
                                        <div class="comm-checkin__channel">${ch?.name || 'Unknown channel'} (${ch?.frequency || '?'} MHz)</div>
                                        <div class="comm-checkin__notes">${ck.notes}</div>
                                    </div>
                                    <div class="comm-checkin__type comm-checkin__type--${ck.type}">${ck.type}</div>
                                    <div class="comm-checkin__actions">
                                        <button class="comm-action-btn" data-edit-checkin="${ck.id}" title="Edit">
                                            ${Icons.get('edit')}
                                        </button>
                                        <button class="comm-action-btn comm-action-btn--danger" data-delete-checkin="${ck.id}" title="Delete">
                                            ${Icons.get('trash')}
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="comm-missed-protocol">
                        <div class="comm-missed-protocol__label">Missed Check-in Protocol:</div>
                        <textarea id="missed-protocol-text" class="comm-missed-protocol__text" rows="3">${plan.schedule.missedCheckInProtocol}</textarea>
                    </div>
                ` : `
                    <div class="comm-schedule-disabled">
                        Check-in schedule is disabled. Enable above to set scheduled radio check-ins.
                    </div>
                `}
            </div>

            <!-- Emergency Protocols Section -->
            <div class="comm-section">
                <div class="comm-section__header">
                    <span class="comm-section__title">${Icons.get('alertTriangle')} Emergency Protocols</span>
                </div>
                
                <div class="comm-emergency-words">
                    <div class="comm-emergency-word">
                        <label>Distress Word</label>
                        <input type="text" id="distress-word" value="${plan.emergency.distressWord}" placeholder="e.g., MAYDAY">
                        <div class="comm-emergency-word__hint">Spoken to indicate a real emergency</div>
                    </div>
                    <div class="comm-emergency-word">
                        <label>Duress Word</label>
                        <input type="text" id="duress-word" value="${plan.emergency.duressWord}" placeholder="e.g., UNCLE">
                        <div class="comm-emergency-word__hint">Covert signal indicating distress under duress</div>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 16px;">
                    <label>Emergency Channel</label>
                    <select id="emergency-channel">
                        ${plan.channels.map(ch => `
                            <option value="${ch.id}" ${ch.id === plan.emergency.emergencyChannel ? 'selected' : ''}>
                                ${ch.name} (${ch.frequency} MHz)
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label>Rally Point</label>
                    <input type="text" id="rally-point" value="${plan.emergency.rallyPoint}" placeholder="Enter rally point location">
                </div>

                <div class="comm-protocols-list">
                    <div class="section-label" style="margin-top: 16px;">Emergency Procedures</div>
                    ${plan.emergency.protocols.map(ep => `
                        <div class="comm-protocol" data-protocol-id="${ep.id}">
                            <div class="comm-protocol__header">
                                <div class="comm-protocol__situation">${ep.situation}</div>
                                <div class="comm-protocol__actions">
                                    <button class="comm-action-btn" data-edit-protocol="${ep.id}" title="Edit">
                                        ${Icons.get('edit')}
                                    </button>
                                    <button class="comm-action-btn comm-action-btn--danger" data-delete-protocol="${ep.id}" title="Delete">
                                        ${Icons.get('trash')}
                                    </button>
                                </div>
                            </div>
                            <div class="comm-protocol__procedure">${ep.procedure.replace(/\n/g, '<br>')}</div>
                        </div>
                    `).join('')}
                    <button class="btn btn--secondary btn--full" id="add-protocol-btn" style="margin-top: 12px;">
                        ${Icons.get('plus')} Add Emergency Procedure
                    </button>
                </div>
            </div>

            <!-- Notes Section -->
            <div class="comm-section">
                <div class="comm-section__header">
                    <span class="comm-section__title">${Icons.get('edit')} Additional Notes</span>
                </div>
                <textarea id="comm-notes" class="comm-notes-textarea" rows="4" placeholder="Additional communication notes, frequencies, or instructions...">${plan.notes}</textarea>
            </div>

            <!-- Save Button -->
            <button class="btn btn--primary btn--full" id="save-comm-plan" style="margin-top: 20px;">
                ${Icons.get('check')} Save Communication Plan
            </button>
        `;

        // Bind event handlers
        bindCommsEvents();
    }

    /**
     * Get the next scheduled check-in
     */
    function getNextCheckIn(checkIns) {
        if (!checkIns || checkIns.length === 0) return null;
        
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        
        // Sort by time and find next one
        const sorted = [...checkIns].sort((a, b) => {
            const [aH, aM] = a.time.split(':').map(Number);
            const [bH, bM] = b.time.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });
        
        for (const ck of sorted) {
            const [h, m] = ck.time.split(':').map(Number);
            if (h * 60 + m > currentMinutes) {
                return ck;
            }
        }
        
        // If all check-ins passed, return first one (next day)
        return sorted[0];
    }

    /**
     * Bind event handlers for communication plan
     */
    function bindCommsEvents() {
        // Save button
        const saveBtn = container.querySelector('#save-comm-plan');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                // Gather all data from form
                commPlan.emergency.distressWord = container.querySelector('#distress-word')?.value || 'MAYDAY';
                commPlan.emergency.duressWord = container.querySelector('#duress-word')?.value || '';
                commPlan.emergency.emergencyChannel = container.querySelector('#emergency-channel')?.value || '';
                commPlan.emergency.rallyPoint = container.querySelector('#rally-point')?.value || '';
                commPlan.schedule.missedCheckInProtocol = container.querySelector('#missed-protocol-text')?.value || '';
                commPlan.notes = container.querySelector('#comm-notes')?.value || '';
                
                await saveCommPlan();
            });
        }

        // Schedule enabled toggle
        const scheduleToggle = container.querySelector('#schedule-enabled');
        if (scheduleToggle) {
            scheduleToggle.addEventListener('change', async (e) => {
                commPlan.schedule.enabled = e.target.checked;
                await saveCommPlan();
                renderComms();
            });
        }

        // Export button
        const exportBtn = container.querySelector('#comm-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => exportCommPlan());
        }

        // Add channel button
        const addChannelBtn = container.querySelector('#add-channel-btn');
        if (addChannelBtn) {
            addChannelBtn.addEventListener('click', () => openChannelModal());
        }

        // Edit/delete channel buttons
        container.querySelectorAll('[data-edit-channel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.editChannel;
                const channel = commPlan.channels.find(c => c.id === id);
                if (channel) openChannelModal(channel);
            });
        });

        container.querySelectorAll('[data-delete-channel]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Delete this channel?')) {
                    const id = btn.dataset.deleteChannel;
                    commPlan.channels = commPlan.channels.filter(c => c.id !== id);
                    await saveCommPlan();
                    renderComms();
                }
            });
        });

        // Add call sign button
        const addCallsignBtn = container.querySelector('#add-callsign-btn');
        if (addCallsignBtn) {
            addCallsignBtn.addEventListener('click', () => openCallSignModal());
        }

        // Edit/delete call sign buttons
        container.querySelectorAll('[data-edit-callsign]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.editCallsign;
                const cs = commPlan.callSigns.find(c => c.id === id);
                if (cs) openCallSignModal(cs);
            });
        });

        container.querySelectorAll('[data-delete-callsign]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Delete this call sign?')) {
                    const id = btn.dataset.deleteCallsign;
                    commPlan.callSigns = commPlan.callSigns.filter(c => c.id !== id);
                    await saveCommPlan();
                    renderComms();
                }
            });
        });

        // Add check-in button
        const addCheckinBtn = container.querySelector('#add-checkin-btn');
        if (addCheckinBtn) {
            addCheckinBtn.addEventListener('click', () => openCheckInModal());
        }

        // Edit/delete check-in buttons
        container.querySelectorAll('[data-edit-checkin]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.editCheckin;
                const ck = commPlan.schedule.checkIns.find(c => c.id === id);
                if (ck) openCheckInModal(ck);
            });
        });

        container.querySelectorAll('[data-delete-checkin]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Delete this check-in?')) {
                    const id = btn.dataset.deleteCheckin;
                    commPlan.schedule.checkIns = commPlan.schedule.checkIns.filter(c => c.id !== id);
                    await saveCommPlan();
                    renderComms();
                }
            });
        });

        // Add protocol button
        const addProtocolBtn = container.querySelector('#add-protocol-btn');
        if (addProtocolBtn) {
            addProtocolBtn.addEventListener('click', () => openProtocolModal());
        }

        // Edit/delete protocol buttons
        container.querySelectorAll('[data-edit-protocol]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.editProtocol;
                const ep = commPlan.emergency.protocols.find(p => p.id === id);
                if (ep) openProtocolModal(ep);
            });
        });

        container.querySelectorAll('[data-delete-protocol]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('Delete this protocol?')) {
                    const id = btn.dataset.deleteProtocol;
                    commPlan.emergency.protocols = commPlan.emergency.protocols.filter(p => p.id !== id);
                    await saveCommPlan();
                    renderComms();
                }
            });
        });
    }

    /**
     * Open channel edit modal
     */
    function openChannelModal(channel = null) {
        const isNew = !channel;
        const ch = channel || { id: '', name: '', frequency: '', mode: 'FM', tone: '', power: 'High', isPrimary: false, notes: '' };
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="comm-modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">${isNew ? 'Add Channel' : 'Edit Channel'}</h3>
                        <button class="modal__close" id="comm-modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Channel Name</label>
                            <input type="text" id="ch-name" value="${ch.name}" placeholder="e.g., Primary, Tactical">
                        </div>
                        <div class="form-group">
                            <label>Frequency (MHz)</label>
                            <input type="text" id="ch-freq" value="${ch.frequency}" placeholder="e.g., 146.520">
                        </div>
                        <div class="form-group">
                            <label>Mode</label>
                            <select id="ch-mode">
                                <option value="FM" ${ch.mode === 'FM' ? 'selected' : ''}>FM</option>
                                <option value="NFM" ${ch.mode === 'NFM' ? 'selected' : ''}>NFM (Narrow FM)</option>
                                <option value="AM" ${ch.mode === 'AM' ? 'selected' : ''}>AM</option>
                                <option value="SSB" ${ch.mode === 'SSB' ? 'selected' : ''}>SSB</option>
                                <option value="DMR" ${ch.mode === 'DMR' ? 'selected' : ''}>DMR</option>
                                <option value="P25" ${ch.mode === 'P25' ? 'selected' : ''}>P25</option>
                                <option value="FRS" ${ch.mode === 'FRS' ? 'selected' : ''}>FRS/GMRS</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>CTCSS/DCS Tone (optional)</label>
                            <input type="text" id="ch-tone" value="${ch.tone}" placeholder="e.g., 100.0 or D023">
                        </div>
                        <div class="form-group">
                            <label>Power Level</label>
                            <select id="ch-power">
                                <option value="Low" ${ch.power === 'Low' ? 'selected' : ''}>Low</option>
                                <option value="Medium" ${ch.power === 'Medium' ? 'selected' : ''}>Medium</option>
                                <option value="High" ${ch.power === 'High' ? 'selected' : ''}>High</option>
                            </select>
                        </div>
                        <label class="checkbox-field">
                            <input type="checkbox" id="ch-primary" ${ch.isPrimary ? 'checked' : ''} style="width:auto">
                            <span>Primary channel</span>
                        </label>
                        <div class="form-group" style="margin-top:12px">
                            <label>Notes</label>
                            <textarea id="ch-notes" rows="2" placeholder="Additional notes...">${ch.notes}</textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="comm-modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="comm-modal-save">${isNew ? 'Add Channel' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        `;

        // Bind modal events
        modalContainer.querySelector('#comm-modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-backdrop').onclick = (e) => {
            if (e.target.id === 'comm-modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#comm-modal-save').onclick = async () => {
            const newChannel = {
                id: ch.id || Helpers.generateId(),
                name: modalContainer.querySelector('#ch-name').value || 'Unnamed',
                frequency: modalContainer.querySelector('#ch-freq').value || '',
                mode: modalContainer.querySelector('#ch-mode').value,
                tone: modalContainer.querySelector('#ch-tone').value,
                power: modalContainer.querySelector('#ch-power').value,
                isPrimary: modalContainer.querySelector('#ch-primary').checked,
                notes: modalContainer.querySelector('#ch-notes').value
            };

            // If this is primary, unset others
            if (newChannel.isPrimary) {
                commPlan.channels.forEach(c => c.isPrimary = false);
            }

            if (isNew) {
                commPlan.channels.push(newChannel);
            } else {
                const idx = commPlan.channels.findIndex(c => c.id === ch.id);
                if (idx >= 0) commPlan.channels[idx] = newChannel;
            }

            await saveCommPlan();
            modalContainer.innerHTML = '';
            renderComms();
        };
    }

    /**
     * Open call sign edit modal
     */
    function openCallSignModal(callSign = null) {
        const isNew = !callSign;
        const cs = callSign || { id: '', name: '', callSign: '', role: '', notes: '' };
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="comm-modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">${isNew ? 'Add Call Sign' : 'Edit Call Sign'}</h3>
                        <button class="modal__close" id="comm-modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Name / Identifier</label>
                            <input type="text" id="cs-name" value="${cs.name}" placeholder="e.g., Team Lead, John">
                        </div>
                        <div class="form-group">
                            <label>Call Sign</label>
                            <input type="text" id="cs-callsign" value="${cs.callSign}" placeholder="e.g., Alpha-1, KD6ABC">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <input type="text" id="cs-role" value="${cs.role}" placeholder="e.g., Command, Scout, Support">
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="cs-notes" rows="2" placeholder="Additional notes...">${cs.notes}</textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="comm-modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="comm-modal-save">${isNew ? 'Add Call Sign' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#comm-modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-backdrop').onclick = (e) => {
            if (e.target.id === 'comm-modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#comm-modal-save').onclick = async () => {
            const newCS = {
                id: cs.id || Helpers.generateId(),
                name: modalContainer.querySelector('#cs-name').value || 'Unnamed',
                callSign: modalContainer.querySelector('#cs-callsign').value || '',
                role: modalContainer.querySelector('#cs-role').value || '',
                notes: modalContainer.querySelector('#cs-notes').value
            };

            if (isNew) {
                commPlan.callSigns.push(newCS);
            } else {
                const idx = commPlan.callSigns.findIndex(c => c.id === cs.id);
                if (idx >= 0) commPlan.callSigns[idx] = newCS;
            }

            await saveCommPlan();
            modalContainer.innerHTML = '';
            renderComms();
        };
    }

    /**
     * Open check-in schedule modal
     */
    function openCheckInModal(checkIn = null) {
        const isNew = !checkIn;
        const ck = checkIn || { id: '', time: '12:00', channel: commPlan.channels[0]?.id || '', type: 'routine', notes: '' };
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="comm-modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">${isNew ? 'Add Check-in' : 'Edit Check-in'}</h3>
                        <button class="modal__close" id="comm-modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Time</label>
                            <input type="time" id="ck-time" value="${ck.time}">
                        </div>
                        <div class="form-group">
                            <label>Channel</label>
                            <select id="ck-channel">
                                ${commPlan.channels.map(ch => `
                                    <option value="${ch.id}" ${ch.id === ck.channel ? 'selected' : ''}>
                                        ${ch.name} (${ch.frequency} MHz)
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="ck-type">
                                <option value="routine" ${ck.type === 'routine' ? 'selected' : ''}>Routine</option>
                                <option value="mandatory" ${ck.type === 'mandatory' ? 'selected' : ''}>Mandatory</option>
                                <option value="optional" ${ck.type === 'optional' ? 'selected' : ''}>Optional</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <input type="text" id="ck-notes" value="${ck.notes}" placeholder="e.g., Morning check-in">
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="comm-modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="comm-modal-save">${isNew ? 'Add Check-in' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#comm-modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-backdrop').onclick = (e) => {
            if (e.target.id === 'comm-modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#comm-modal-save').onclick = async () => {
            const newCK = {
                id: ck.id || Helpers.generateId(),
                time: modalContainer.querySelector('#ck-time').value || '12:00',
                channel: modalContainer.querySelector('#ck-channel').value,
                type: modalContainer.querySelector('#ck-type').value,
                notes: modalContainer.querySelector('#ck-notes').value
            };

            if (isNew) {
                commPlan.schedule.checkIns.push(newCK);
            } else {
                const idx = commPlan.schedule.checkIns.findIndex(c => c.id === ck.id);
                if (idx >= 0) commPlan.schedule.checkIns[idx] = newCK;
            }

            await saveCommPlan();
            modalContainer.innerHTML = '';
            renderComms();
        };
    }

    /**
     * Open emergency protocol modal
     */
    function openProtocolModal(protocol = null) {
        const isNew = !protocol;
        const ep = protocol || { id: '', situation: '', procedure: '' };
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="comm-modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">${isNew ? 'Add Emergency Protocol' : 'Edit Protocol'}</h3>
                        <button class="modal__close" id="comm-modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Situation</label>
                            <input type="text" id="ep-situation" value="${ep.situation}" placeholder="e.g., Medical Emergency, Lost/Separated">
                        </div>
                        <div class="form-group">
                            <label>Procedure</label>
                            <textarea id="ep-procedure" rows="6" placeholder="Step-by-step procedure...">${ep.procedure}</textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="comm-modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="comm-modal-save">${isNew ? 'Add Protocol' : 'Save Changes'}</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#comm-modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#comm-modal-backdrop').onclick = (e) => {
            if (e.target.id === 'comm-modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#comm-modal-save').onclick = async () => {
            const newEP = {
                id: ep.id || Helpers.generateId(),
                situation: modalContainer.querySelector('#ep-situation').value || 'Unnamed',
                procedure: modalContainer.querySelector('#ep-procedure').value || ''
            };

            if (isNew) {
                commPlan.emergency.protocols.push(newEP);
            } else {
                const idx = commPlan.emergency.protocols.findIndex(p => p.id === ep.id);
                if (idx >= 0) commPlan.emergency.protocols[idx] = newEP;
            }

            await saveCommPlan();
            modalContainer.innerHTML = '';
            renderComms();
        };
    }

    /**
     * Export communication plan as text/JSON
     */
    function exportCommPlan() {
        const plan = commPlan;
        
        // Generate readable text export
        let text = `COMMUNICATION PLAN\n`;
        text += `==================\n`;
        text += `Generated: ${new Date().toLocaleString()}\n\n`;
        
        text += `RADIO CHANNELS\n`;
        text += `--------------\n`;
        plan.channels.forEach(ch => {
            text += `${ch.isPrimary ? '[PRIMARY] ' : ''}${ch.name}: ${ch.frequency} MHz ${ch.mode}`;
            if (ch.tone) text += ` (CTCSS ${ch.tone})`;
            text += ` - ${ch.power} power\n`;
            if (ch.notes) text += `  Notes: ${ch.notes}\n`;
        });
        
        text += `\nCALL SIGNS\n`;
        text += `----------\n`;
        plan.callSigns.forEach(cs => {
            text += `${cs.callSign}: ${cs.name} (${cs.role})\n`;
        });
        
        if (plan.schedule.enabled) {
            text += `\nCHECK-IN SCHEDULE\n`;
            text += `-----------------\n`;
            plan.schedule.checkIns.forEach(ck => {
                const ch = plan.channels.find(c => c.id === ck.channel);
                text += `${ck.time} - ${ch?.name || 'Unknown'} (${ck.type}) ${ck.notes}\n`;
            });
            text += `\nMissed Check-in Protocol:\n${plan.schedule.missedCheckInProtocol}\n`;
        }
        
        text += `\nEMERGENCY PROTOCOLS\n`;
        text += `-------------------\n`;
        text += `Distress Word: ${plan.emergency.distressWord}\n`;
        text += `Duress Word: ${plan.emergency.duressWord}\n`;
        text += `Rally Point: ${plan.emergency.rallyPoint}\n`;
        const emergCh = plan.channels.find(c => c.id === plan.emergency.emergencyChannel);
        text += `Emergency Channel: ${emergCh?.name || 'Primary'} (${emergCh?.frequency || ''} MHz)\n\n`;
        
        plan.emergency.protocols.forEach(ep => {
            text += `${ep.situation}:\n`;
            text += `${ep.procedure}\n\n`;
        });
        
        if (plan.notes) {
            text += `\nADDITIONAL NOTES\n`;
            text += `----------------\n`;
            text += plan.notes + '\n';
        }
        
        // Download as file
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comm-plan-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showCommToast('Communication plan exported');
    }

    // ==================== Terrain Analysis Panel ====================
    
    // Terrain analysis state
    let terrainAnalysis = null;
    let terrainAnalyzing = false;
    let terrainProgress = 0;
    let terrainLocation = null;
    
    /**
     * Render the Terrain Analysis panel
     */
    async function renderTerrain() {
        // Use getPosition() for synchronous access to cached position
        // (getCurrentPosition() returns a Promise)
        const gpsPos = GPSModule.getPosition();
        const selectedWp = State.get('selectedWaypoint');
        
        // Determine analysis location
        let analyzeLocation = terrainLocation;
        if (!analyzeLocation && gpsPos) {
            analyzeLocation = { lat: gpsPos.lat, lon: gpsPos.lon, source: 'GPS' };
        } else if (!analyzeLocation && selectedWp) {
            const lat = selectedWp.lat || (37.4215 + (selectedWp.y - 50) * 0.002);
            const lon = selectedWp.lon || (-119.1892 + (selectedWp.x - 50) * 0.004);
            analyzeLocation = { lat, lon, source: selectedWp.name };
        }
        
        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">${Icons.get('mountain')} Terrain Analysis</h2>
            </div>
            
            <!-- Location Selection -->
            <div class="terrain-section">
                <div class="terrain-section__header">
                    <span class="terrain-section__title">📍 Analysis Location</span>
                </div>
                
                <div class="terrain-location-selector">
                    ${analyzeLocation ? `
                        <div class="terrain-location-current">
                            <div class="terrain-location-coords">
                                <span class="terrain-coord-value">${analyzeLocation.lat.toFixed(5)}°</span>
                                <span class="terrain-coord-value">${analyzeLocation.lon.toFixed(5)}°</span>
                            </div>
                            <div class="terrain-location-source">Source: ${analyzeLocation.source || 'Manual'}</div>
                        </div>
                    ` : `
                        <div class="terrain-no-location">
                            No location selected. Use GPS or select a waypoint.
                        </div>
                    `}
                    
                    <div class="terrain-location-actions">
                        <button class="btn btn--secondary" id="terrain-use-gps" ${!gpsPos ? 'disabled' : ''}>
                            ${Icons.get('locate')} Use GPS
                        </button>
                        <button class="btn btn--secondary" id="terrain-use-map">
                            ${Icons.get('map')} Pick on Map
                        </button>
                    </div>
                    
                    <div class="terrain-manual-coords" style="margin-top:12px">
                        <div style="display:flex;gap:8px">
                            <input type="number" id="terrain-lat" placeholder="Latitude" 
                                value="${analyzeLocation?.lat?.toFixed(6) || ''}" step="0.000001" style="flex:1">
                            <input type="number" id="terrain-lon" placeholder="Longitude" 
                                value="${analyzeLocation?.lon?.toFixed(6) || ''}" step="0.000001" style="flex:1">
                        </div>
                        <button class="btn btn--secondary btn--full" id="terrain-set-coords" style="margin-top:8px">
                            Set Coordinates
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Analysis Options -->
            <div class="terrain-section">
                <div class="terrain-section__header">
                    <span class="terrain-section__title">⚙️ Analysis Options</span>
                </div>
                
                <div class="terrain-options">
                    <div class="terrain-option">
                        <label>Analysis Radius</label>
                        <select id="terrain-radius">
                            <option value="250">250m (Quick)</option>
                            <option value="500" selected>500m (Standard)</option>
                            <option value="1000">1km (Extended)</option>
                            <option value="2000">2km (Wide Area)</option>
                        </select>
                    </div>
                    
                    <div class="terrain-option">
                        <label>Grid Resolution</label>
                        <select id="terrain-resolution">
                            <option value="20">20m (High Detail)</option>
                            <option value="30" selected>30m (Standard)</option>
                            <option value="50">50m (Fast)</option>
                        </select>
                    </div>
                    
                    <div class="terrain-checkboxes">
                        <label class="terrain-checkbox">
                            <input type="checkbox" id="terrain-opt-viewshed" checked>
                            <span>Viewshed Analysis</span>
                        </label>
                        <label class="terrain-checkbox">
                            <input type="checkbox" id="terrain-opt-flood" checked>
                            <span>Flood Risk</span>
                        </label>
                        <label class="terrain-checkbox">
                            <input type="checkbox" id="terrain-opt-cover" checked>
                            <span>Cover & Concealment</span>
                        </label>
                    </div>
                </div>
                
                <button class="btn btn--primary btn--full" id="terrain-analyze" 
                    ${!analyzeLocation || terrainAnalyzing ? 'disabled' : ''}>
                    ${terrainAnalyzing ? `Analyzing... ${terrainProgress}%` : `${Icons.get('layers')} Analyze Terrain`}
                </button>
                
                ${terrainAnalyzing ? `
                    <div class="terrain-progress">
                        <div class="terrain-progress__bar" style="width:${terrainProgress}%"></div>
                    </div>
                ` : ''}
            </div>
            
            ${terrainAnalysis ? renderTerrainResults(terrainAnalysis) : `
                <div class="terrain-section">
                    <div class="terrain-empty-state">
                        <div class="terrain-empty-icon">${Icons.get('mountain')}</div>
                        <div class="terrain-empty-text">Select a location and run analysis to see terrain characteristics</div>
                    </div>
                </div>
            `}
        `;
        
        // Event handlers
        setupTerrainEventHandlers(analyzeLocation, gpsPos, selectedWp);
    }
    
    /**
     * Render terrain analysis results
     */
    function renderTerrainResults(analysis) {
        const point = analysis.pointAnalysis || {};
        const slope = analysis.slope?.statistics || {};
        const viewshed = analysis.viewshed || {};
        const flood = analysis.floodRisk || {};
        const cover = analysis.coverConcealment || {};
        const solar = analysis.solarExposure || {};
        const traffic = analysis.trafficability || {};
        
        return `
            <!-- Point Summary -->
            <div class="terrain-section terrain-results">
                <div class="terrain-section__header">
                    <span class="terrain-section__title">📊 Point Summary</span>
                </div>
                
                <div class="terrain-summary-grid">
                    <div class="terrain-summary-item">
                        <div class="terrain-summary-label">Elevation</div>
                        <div class="terrain-summary-value">${Math.round(analysis.centerElevation || 0)}m</div>
                        <div class="terrain-summary-sub">${Math.round((analysis.centerElevation || 0) * 3.281)}ft</div>
                    </div>
                    <div class="terrain-summary-item">
                        <div class="terrain-summary-label">Slope</div>
                        <div class="terrain-summary-value ${getSlopeColorClass(point.slope)}">${point.slope?.toFixed(1) || 0}°</div>
                        <div class="terrain-summary-sub">${point.slopeClass || 'flat'}</div>
                    </div>
                    <div class="terrain-summary-item">
                        <div class="terrain-summary-label">Aspect</div>
                        <div class="terrain-summary-value">${point.aspectClass || 'N/A'}</div>
                        <div class="terrain-summary-sub">${Math.round(point.aspect || 0)}°</div>
                    </div>
                    <div class="terrain-summary-item">
                        <div class="terrain-summary-label">Visibility</div>
                        <div class="terrain-summary-value ${viewshed.coverage > 50 ? 'terrain-good' : 'terrain-warn'}">${viewshed.coverage || 0}%</div>
                        <div class="terrain-summary-sub">coverage</div>
                    </div>
                </div>
            </div>
            
            <!-- Slope Analysis -->
            <div class="terrain-section">
                <div class="terrain-section__header">
                    <span class="terrain-section__title">⛰️ Slope Analysis</span>
                    <button class="terrain-collapse-btn" data-section="slope">▼</button>
                </div>
                
                <div class="terrain-section__content" id="terrain-slope-content">
                    <div class="terrain-slope-stats">
                        <div class="terrain-stat-row">
                            <span class="terrain-stat-label">Min Slope</span>
                            <span class="terrain-stat-value">${slope.min?.toFixed(1) || 0}°</span>
                        </div>
                        <div class="terrain-stat-row">
                            <span class="terrain-stat-label">Max Slope</span>
                            <span class="terrain-stat-value">${slope.max?.toFixed(1) || 0}°</span>
                        </div>
                        <div class="terrain-stat-row">
                            <span class="terrain-stat-label">Average Slope</span>
                            <span class="terrain-stat-value">${slope.mean?.toFixed(1) || 0}°</span>
                        </div>
                    </div>
                    
                    <div class="terrain-slope-distribution">
                        <div class="terrain-dist-label">Slope Distribution</div>
                        <div class="terrain-dist-bars">
                            ${renderSlopeDistribution(slope.distribution, slope.percentages)}
                        </div>
                    </div>
                    
                    <!-- Slope thresholds reference -->
                    <div class="terrain-reference">
                        <div class="terrain-ref-title">Slope Classification</div>
                        <div class="terrain-ref-items">
                            <span class="terrain-ref-item terrain-slope-flat">0-5° Flat</span>
                            <span class="terrain-ref-item terrain-slope-gentle">5-15° Gentle</span>
                            <span class="terrain-ref-item terrain-slope-moderate">15-25° Moderate</span>
                            <span class="terrain-ref-item terrain-slope-steep">25-35° Steep</span>
                            <span class="terrain-ref-item terrain-slope-extreme">35°+ Extreme</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Trafficability -->
            <div class="terrain-section">
                <div class="terrain-section__header">
                    <span class="terrain-section__title">🚗 Trafficability</span>
                    <button class="terrain-collapse-btn" data-section="traffic">▼</button>
                </div>
                
                <div class="terrain-section__content" id="terrain-traffic-content">
                    <div class="terrain-traffic-grid">
                        ${renderTrafficability(traffic)}
                    </div>
                </div>
            </div>
            
            <!-- Viewshed -->
            ${viewshed.coverage !== undefined ? `
                <div class="terrain-section">
                    <div class="terrain-section__header">
                        <span class="terrain-section__title">👁️ Viewshed Analysis</span>
                        <button class="terrain-collapse-btn" data-section="viewshed">▼</button>
                    </div>
                    
                    <div class="terrain-section__content" id="terrain-viewshed-content">
                        <div class="terrain-viewshed-summary">
                            <div class="terrain-viewshed-coverage">
                                <div class="terrain-viewshed-percent">${viewshed.coverage}%</div>
                                <div class="terrain-viewshed-label">Terrain Visible</div>
                            </div>
                            <div class="terrain-viewshed-stats">
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Max Visible Range</span>
                                    <span class="terrain-stat-value">${viewshed.maxVisibleDistance ? Math.round(viewshed.maxVisibleDistance) + 'm' : 'N/A'}</span>
                                </div>
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Visible Points</span>
                                    <span class="terrain-stat-value">${viewshed.visible?.length || 0}</span>
                                </div>
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Hidden Points</span>
                                    <span class="terrain-stat-value">${viewshed.hidden?.length || 0}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="terrain-viewshed-assessment">
                            ${viewshed.coverage > 70 ? `
                                <div class="terrain-assessment terrain-assessment--good">
                                    ${Icons.get('check')} Excellent observation point with wide field of view
                                </div>
                            ` : viewshed.coverage > 40 ? `
                                <div class="terrain-assessment terrain-assessment--moderate">
                                    ${Icons.get('alert')} Moderate visibility - some terrain masked
                                </div>
                            ` : `
                                <div class="terrain-assessment terrain-assessment--poor">
                                    ${Icons.get('alert')} Limited visibility - significant blind spots
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Solar Exposure -->
            ${solar.exposureScore !== undefined ? `
                <div class="terrain-section">
                    <div class="terrain-section__header">
                        <span class="terrain-section__title">☀️ Solar Exposure</span>
                        <button class="terrain-collapse-btn" data-section="solar">▼</button>
                    </div>
                    
                    <div class="terrain-section__content" id="terrain-solar-content">
                        <div class="terrain-solar-summary">
                            <div class="terrain-solar-score ${getSolarScoreClass(solar.exposureScore)}">
                                <div class="terrain-solar-value">${solar.exposureScore}%</div>
                                <div class="terrain-solar-label">${solar.exposureClass?.replace('-', ' ') || 'Unknown'}</div>
                            </div>
                            <div class="terrain-solar-details">
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Est. Sun Hours</span>
                                    <span class="terrain-stat-value">${solar.estimatedSunHours || 0}h</span>
                                </div>
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Best Sun Direction</span>
                                    <span class="terrain-stat-value">${solar.sunDirection || 'South'}</span>
                                </div>
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Aspect Alignment</span>
                                    <span class="terrain-stat-value">${solar.aspectAlignment || 0}%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="terrain-solar-recommendations">
                            ${solar.idealForCamping ? `
                                <div class="terrain-rec terrain-rec--good">
                                    ✓ Good exposure for camping - balanced sun/shade
                                </div>
                            ` : ''}
                            ${solar.shaded ? `
                                <div class="terrain-rec terrain-rec--info">
                                    ℹ️ Mostly shaded - good for hot weather, cold in winter
                                </div>
                            ` : ''}
                            ${solar.exposureScore > 80 ? `
                                <div class="terrain-rec terrain-rec--warn">
                                    ⚠️ High sun exposure - consider shade/shelter needs
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Flood Risk -->
            ${flood.riskLevel ? `
                <div class="terrain-section">
                    <div class="terrain-section__header">
                        <span class="terrain-section__title">💧 Flood Risk Assessment</span>
                        <button class="terrain-collapse-btn" data-section="flood">▼</button>
                    </div>
                    
                    <div class="terrain-section__content" id="terrain-flood-content">
                        <div class="terrain-flood-summary ${getFloodRiskClass(flood.riskLevel)}">
                            <div class="terrain-flood-level">${flood.riskLevel?.toUpperCase()}</div>
                            <div class="terrain-flood-score">Risk Score: ${flood.riskScore || 0}/100</div>
                        </div>
                        
                        ${flood.risks?.length > 0 ? `
                            <div class="terrain-flood-factors">
                                <div class="terrain-factors-title">Risk Factors</div>
                                ${flood.risks.map(r => `
                                    <div class="terrain-factor terrain-factor--${r.severity}">
                                        <span class="terrain-factor-type">${r.type.replace('-', ' ')}</span>
                                        <span class="terrain-factor-desc">${r.description}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                        
                        <div class="terrain-flood-rec">
                            <strong>Recommendation:</strong> ${flood.recommendation || 'No specific concerns.'}
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <!-- Cover & Concealment -->
            ${cover.defilade ? `
                <div class="terrain-section">
                    <div class="terrain-section__header">
                        <span class="terrain-section__title">🛡️ Cover & Concealment</span>
                        <button class="terrain-collapse-btn" data-section="cover">▼</button>
                    </div>
                    
                    <div class="terrain-section__content" id="terrain-cover-content">
                        <div class="terrain-cover-summary">
                            <div class="terrain-cover-rating">
                                <div class="terrain-cover-score">${cover.concealmentRating || 0}%</div>
                                <div class="terrain-cover-label">Concealment Rating</div>
                            </div>
                            <div class="terrain-cover-details">
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Terrain Masking</span>
                                    <span class="terrain-stat-value">${cover.terrainMasking || 0}%</span>
                                </div>
                                <div class="terrain-stat-row">
                                    <span class="terrain-stat-label">Defilade Type</span>
                                    <span class="terrain-stat-value">${cover.defilade?.replace('-', ' ') || 'None'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="terrain-cover-directions">
                            <div class="terrain-dir-title">Coverage by Direction</div>
                            <div class="terrain-dir-compass">
                                ${renderCoverageCompass(cover.coverDirections, cover.exposedDirections)}
                            </div>
                        </div>
                        
                        ${cover.tacticalNotes?.length > 0 ? `
                            <div class="terrain-tactical-notes">
                                <div class="terrain-notes-title">Tactical Notes</div>
                                ${cover.tacticalNotes.map(note => `
                                    <div class="terrain-note">${note}</div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Export/Actions -->
            <div class="terrain-section">
                <div class="terrain-actions">
                    <button class="btn btn--secondary" id="terrain-export">
                        ${Icons.get('export')} Export Report
                    </button>
                    <button class="btn btn--secondary" id="terrain-save-waypoint">
                        ${Icons.get('waypoint')} Save as Waypoint
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Setup terrain panel event handlers
     */
    function setupTerrainEventHandlers(analyzeLocation, gpsPos, selectedWp) {
        // Use GPS button
        const useGpsBtn = container.querySelector('#terrain-use-gps');
        if (useGpsBtn) {
            useGpsBtn.onclick = () => {
                if (gpsPos) {
                    terrainLocation = { lat: gpsPos.lat, lon: gpsPos.lon, source: 'GPS' };
                    terrainAnalysis = null;
                    renderTerrain();
                }
            };
        }
        
        // Use map picker
        const useMapBtn = container.querySelector('#terrain-use-map');
        if (useMapBtn) {
            useMapBtn.onclick = () => {
                ModalsModule.showToast('Click on the map to select location', 'info');
                // Set up one-time map click listener
                const handler = (coords) => {
                    terrainLocation = { 
                        lat: coords.lat, 
                        lon: coords.lon, 
                        source: 'Map Selection' 
                    };
                    terrainAnalysis = null;
                    Events.off(Events.EVENTS.MAP_CLICK, handler);
                    State.UI.setActivePanel('terrain');
                    renderTerrain();
                };
                Events.once(Events.EVENTS.MAP_CLICK, handler);
                // Switch to map view on mobile
                if (Helpers.isMobile()) {
                    State.UI.closePanel();
                }
            };
        }
        
        // Set manual coordinates
        const setCoordsBtn = container.querySelector('#terrain-set-coords');
        if (setCoordsBtn) {
            setCoordsBtn.onclick = () => {
                const lat = parseFloat(container.querySelector('#terrain-lat').value);
                const lon = parseFloat(container.querySelector('#terrain-lon').value);
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                    terrainLocation = { lat, lon, source: 'Manual Entry' };
                    terrainAnalysis = null;
                    renderTerrain();
                } else {
                    ModalsModule.showToast('Invalid coordinates', 'error');
                }
            };
        }
        
        // Analyze button
        const analyzeBtn = container.querySelector('#terrain-analyze');
        if (analyzeBtn) {
            analyzeBtn.onclick = async () => {
                if (!analyzeLocation || terrainAnalyzing) return;
                
                terrainAnalyzing = true;
                terrainProgress = 0;
                renderTerrain();
                
                try {
                    const radius = parseInt(container.querySelector('#terrain-radius')?.value || 500);
                    const resolution = parseInt(container.querySelector('#terrain-resolution')?.value || 30);
                    const includeViewshed = container.querySelector('#terrain-opt-viewshed')?.checked !== false;
                    const includeFlood = container.querySelector('#terrain-opt-flood')?.checked !== false;
                    const includeCover = container.querySelector('#terrain-opt-cover')?.checked !== false;
                    
                    terrainAnalysis = await TerrainModule.analyzeSite(
                        analyzeLocation.lat,
                        analyzeLocation.lon
                    );
                    
                    ModalsModule.showToast('Terrain analysis complete', 'success');
                } catch (e) {
                    console.error('Terrain analysis failed:', e);
                    ModalsModule.showToast('Analysis failed: ' + e.message, 'error');
                }
                
                terrainAnalyzing = false;
                terrainProgress = 100;
                renderTerrain();
            };
        }
        
        // Export report
        const exportBtn = container.querySelector('#terrain-export');
        if (exportBtn) {
            exportBtn.onclick = () => exportTerrainReport();
        }
        
        // Save as waypoint
        const saveWpBtn = container.querySelector('#terrain-save-waypoint');
        if (saveWpBtn) {
            saveWpBtn.onclick = () => {
                if (terrainLocation && terrainAnalysis) {
                    const wp = {
                        id: Helpers.generateId(),
                        name: `Terrain Analysis Point`,
                        type: 'custom',
                        lat: terrainLocation.lat,
                        lon: terrainLocation.lon,
                        x: 50 + (terrainLocation.lon + 119.1892) / 0.004,
                        y: 50 + (terrainLocation.lat - 37.4215) / 0.002,
                        notes: `Elevation: ${Math.round(terrainAnalysis.centerElevation || 0)}m, Slope: ${terrainAnalysis.pointAnalysis?.slope?.toFixed(1) || 0}°, Aspect: ${terrainAnalysis.pointAnalysis?.aspectClass || 'N/A'}`,
                        verified: false
                    };
                    State.Waypoints.add(wp);
                    Storage.Waypoints.save(wp);
                    ModalsModule.showToast('Waypoint saved', 'success');
                }
            };
        }
        
        // Collapse toggles
        container.querySelectorAll('.terrain-collapse-btn').forEach(btn => {
            btn.onclick = () => {
                const section = btn.dataset.section;
                const content = container.querySelector(`#terrain-${section}-content`);
                if (content) {
                    content.classList.toggle('collapsed');
                    btn.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
                }
            };
        });
    }
    
    /**
     * Render slope distribution bars
     */
    function renderSlopeDistribution(distribution, percentages) {
        if (!distribution) return '<div class="terrain-no-data">No data available</div>';
        
        const classes = ['flat', 'gentle', 'moderate', 'steep', 'extreme', 'cliff'];
        const colors = {
            flat: '#22c55e',
            gentle: '#84cc16',
            moderate: '#f59e0b',
            steep: '#ef4444',
            extreme: '#7c2d12',
            cliff: '#1f2937'
        };
        
        return classes.map(cls => `
            <div class="terrain-dist-bar-container">
                <div class="terrain-dist-bar-label">${cls}</div>
                <div class="terrain-dist-bar-track">
                    <div class="terrain-dist-bar-fill" style="width:${percentages?.[cls] || 0}%;background:${colors[cls]}"></div>
                </div>
                <div class="terrain-dist-bar-value">${percentages?.[cls] || 0}%</div>
            </div>
        `).join('');
    }
    
    /**
     * Render trafficability grid
     */
    function renderTrafficability(traffic) {
        if (!traffic) return '<div class="terrain-no-data">No data available</div>';
        
        const vehicles = [
            { key: 'foot', name: 'On Foot', icon: '🚶' },
            { key: 'atv', name: 'ATV/UTV', icon: '🏍️' },
            { key: 'jeep', name: '4x4 Vehicle', icon: '🚙' },
            { key: 'truck', name: 'Truck', icon: '🚛' },
            { key: 'wheeled', name: 'Standard Vehicle', icon: '🚗' }
        ];
        
        return vehicles.map(v => {
            const data = traffic[v.key];
            if (!data) return '';
            
            const passable = data.passablePercent >= 80;
            const difficult = data.passablePercent >= 50 && data.passablePercent < 80;
            
            return `
                <div class="terrain-traffic-item ${passable ? 'terrain-traffic--pass' : difficult ? 'terrain-traffic--diff' : 'terrain-traffic--fail'}">
                    <div class="terrain-traffic-icon">${v.icon}</div>
                    <div class="terrain-traffic-info">
                        <div class="terrain-traffic-name">${v.name}</div>
                        <div class="terrain-traffic-status">${data.passablePercent}% passable</div>
                    </div>
                    <div class="terrain-traffic-badge">${passable ? '✓' : difficult ? '⚠' : '✗'}</div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Render coverage compass
     */
    function renderCoverageCompass(covered, exposed) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        covered = covered || [];
        exposed = exposed || [];
        
        return `
            <div class="terrain-compass">
                ${directions.map((dir, i) => {
                    const isCovered = covered.includes(dir);
                    const angle = i * 45;
                    return `
                        <div class="terrain-compass-dir" 
                            style="transform:rotate(${angle}deg) translateY(-35px)"
                            data-dir="${dir}">
                            <div class="terrain-compass-marker ${isCovered ? 'covered' : 'exposed'}" 
                                style="transform:rotate(-${angle}deg)">
                                ${dir}
                            </div>
                        </div>
                    `;
                }).join('')}
                <div class="terrain-compass-center">
                    <div class="terrain-compass-legend">
                        <span class="covered">● Covered</span>
                        <span class="exposed">● Exposed</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Get slope color class
     */
    function getSlopeColorClass(slope) {
        if (!slope) return '';
        if (slope < 5) return 'terrain-slope-flat';
        if (slope < 15) return 'terrain-slope-gentle';
        if (slope < 25) return 'terrain-slope-moderate';
        if (slope < 35) return 'terrain-slope-steep';
        return 'terrain-slope-extreme';
    }
    
    /**
     * Get solar score class
     */
    function getSolarScoreClass(score) {
        if (score >= 80) return 'terrain-solar--high';
        if (score >= 50) return 'terrain-solar--medium';
        return 'terrain-solar--low';
    }
    
    /**
     * Get flood risk class
     */
    function getFloodRiskClass(level) {
        switch (level) {
            case 'high': return 'terrain-flood--high';
            case 'moderate': return 'terrain-flood--moderate';
            case 'low': return 'terrain-flood--low';
            default: return 'terrain-flood--minimal';
        }
    }
    
    /**
     * Export terrain report
     */
    function exportTerrainReport() {
        if (!terrainAnalysis || !terrainLocation) {
            ModalsModule.showToast('No analysis to export', 'error');
            return;
        }
        
        const a = terrainAnalysis;
        const p = a.pointAnalysis || {};
        
        let report = `TERRAIN ANALYSIS REPORT\n`;
        report += `========================\n\n`;
        report += `Generated: ${new Date().toLocaleString()}\n`;
        report += `Location: ${terrainLocation.lat.toFixed(6)}°, ${terrainLocation.lon.toFixed(6)}°\n`;
        report += `Source: ${terrainLocation.source || 'Manual'}\n\n`;
        
        report += `POINT SUMMARY\n`;
        report += `-------------\n`;
        report += `Elevation: ${Math.round(a.centerElevation || 0)}m (${Math.round((a.centerElevation || 0) * 3.281)}ft)\n`;
        report += `Slope: ${p.slope?.toFixed(1) || 0}° (${p.slopeClass || 'flat'})\n`;
        report += `Aspect: ${p.aspectClass || 'N/A'} (${Math.round(p.aspect || 0)}°)\n\n`;
        
        if (a.slope?.statistics) {
            const s = a.slope.statistics;
            report += `SLOPE ANALYSIS\n`;
            report += `--------------\n`;
            report += `Min: ${s.min?.toFixed(1)}° | Max: ${s.max?.toFixed(1)}° | Avg: ${s.mean?.toFixed(1)}°\n`;
            report += `Distribution:\n`;
            Object.entries(s.percentages || {}).forEach(([k, v]) => {
                report += `  ${k}: ${v}%\n`;
            });
            report += `\n`;
        }
        
        if (a.viewshed) {
            report += `VIEWSHED\n`;
            report += `--------\n`;
            report += `Coverage: ${a.viewshed.coverage}%\n`;
            report += `Max Visible: ${a.viewshed.maxVisibleDistance ? Math.round(a.viewshed.maxVisibleDistance) + 'm' : 'N/A'}\n\n`;
        }
        
        if (a.solarExposure) {
            report += `SOLAR EXPOSURE\n`;
            report += `--------------\n`;
            report += `Score: ${a.solarExposure.exposureScore}%\n`;
            report += `Est. Sun Hours: ${a.solarExposure.estimatedSunHours}h\n`;
            report += `Best Direction: ${a.solarExposure.sunDirection}\n\n`;
        }
        
        if (a.floodRisk) {
            report += `FLOOD RISK\n`;
            report += `----------\n`;
            report += `Level: ${a.floodRisk.riskLevel?.toUpperCase()}\n`;
            report += `Score: ${a.floodRisk.riskScore}/100\n`;
            report += `Recommendation: ${a.floodRisk.recommendation}\n\n`;
        }
        
        if (a.coverConcealment) {
            report += `COVER & CONCEALMENT\n`;
            report += `-------------------\n`;
            report += `Rating: ${a.coverConcealment.concealmentRating}%\n`;
            report += `Terrain Masking: ${a.coverConcealment.terrainMasking}%\n`;
            report += `Defilade: ${a.coverConcealment.defilade}\n`;
            if (a.coverConcealment.coverDirections?.length) {
                report += `Covered from: ${a.coverConcealment.coverDirections.join(', ')}\n`;
            }
            if (a.coverConcealment.exposedDirections?.length) {
                report += `Exposed to: ${a.coverConcealment.exposedDirections.join(', ')}\n`;
            }
            report += `\n`;
        }
        
        if (a.trafficability) {
            report += `TRAFFICABILITY\n`;
            report += `--------------\n`;
            Object.entries(a.trafficability).forEach(([k, v]) => {
                report += `${k}: ${v.passablePercent}% passable\n`;
            });
        }
        
        // Download
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `terrain-report-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        ModalsModule.showToast('Report exported', 'success');
    }

    // ==========================================
    // RADIO FREQUENCY REFERENCE PANEL
    // ==========================================

    let radioActiveTab = 'emergency';
    let radioSearchQuery = '';
    let radioInitialized = false;

    async function renderRadio() {
        // Initialize RadioModule if needed
        if (typeof RadioModule !== 'undefined' && !radioInitialized) {
            await RadioModule.init();
            radioInitialized = true;
        }

        if (typeof RadioModule === 'undefined') {
            container.innerHTML = `
                <div class="panel__header">
                    <h2 class="panel__title">📻 Radio Reference</h2>
                </div>
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('antenna')}</div>
                    <div class="empty-state__title">Radio Module Not Loaded</div>
                    <div class="empty-state__desc">Frequency reference is not available</div>
                </div>
            `;
            return;
        }

        const tabs = [
            { id: 'emergency', label: '🚨 Emergency', icon: 'alert' },
            { id: 'frs', label: 'FRS', icon: 'radio' },
            { id: 'gmrs', label: 'GMRS', icon: 'radio' },
            { id: 'murs', label: 'MURS', icon: 'radio' },
            { id: 'cb', label: 'CB', icon: 'radio' },
            { id: 'weather', label: '🌤️ WX', icon: 'weather' },
            { id: 'meshtastic', label: '📡 Mesh', icon: 'broadcast' },
            { id: 'ham', label: '📻 Ham', icon: 'antenna' },
            { id: 'repeaters', label: '📍 Repeaters', icon: 'antenna' },
            { id: 'rally', label: '🎯 Rally', icon: 'target' },
            { id: 'custom', label: '⭐ Custom', icon: 'star' }
        ];

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">📻 Radio Reference</h2>
                <button class="btn btn--secondary" id="radio-export-btn" title="Export Data">
                    ${Icons.get('export')}
                </button>
            </div>

            <!-- Search -->
            <div class="form-group" style="margin-bottom:12px">
                <div style="position:relative">
                    <input type="text" id="radio-search" placeholder="Search all frequencies..." 
                        value="${radioSearchQuery}" style="padding-left:36px">
                    <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:0.4">
                        ${Icons.get('zoomIn')}
                    </span>
                </div>
            </div>

            <!-- Tabs -->
            <div class="radio-tabs" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:16px">
                ${tabs.map(tab => `
                    <button class="chip ${radioActiveTab === tab.id ? 'chip--active' : ''}" 
                        data-radio-tab="${tab.id}">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>

            <!-- Content Area -->
            <div id="radio-content">
                ${renderRadioTabContent()}
            </div>
        `;

        // Event handlers
        container.querySelectorAll('[data-radio-tab]').forEach(btn => {
            btn.onclick = () => {
                radioActiveTab = btn.dataset.radioTab;
                radioSearchQuery = '';
                renderRadio();
            };
        });

        const searchInput = container.querySelector('#radio-search');
        searchInput.oninput = (e) => {
            radioSearchQuery = e.target.value;
            if (radioSearchQuery.length >= 2) {
                radioActiveTab = 'search';
            }
            document.getElementById('radio-content').innerHTML = renderRadioTabContent();
            attachRadioContentHandlers();
        };

        container.querySelector('#radio-export-btn').onclick = () => {
            const data = RadioModule.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `radio-data-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            ModalsModule.showToast('Radio data exported', 'success');
        };

        attachRadioContentHandlers();
    }

    function renderRadioTabContent() {
        if (radioSearchQuery.length >= 2) {
            return renderRadioSearchResults();
        }

        switch (radioActiveTab) {
            case 'emergency': return renderRadioEmergency();
            case 'frs': return renderRadioFRS();
            case 'gmrs': return renderRadioGMRS();
            case 'murs': return renderRadioMURS();
            case 'cb': return renderRadioCB();
            case 'weather': return renderRadioWeather();
            case 'meshtastic': return renderRadioMeshtastic();
            case 'ham': return renderRadioHam();
            case 'repeaters': return renderRadioRepeaters();
            case 'rally': return renderRadioRallyPoints();
            case 'custom': return renderRadioCustom();
            default: return renderRadioEmergency();
        }
    }

    function renderRadioSearchResults() {
        const results = RadioModule.searchAll(radioSearchQuery);
        
        if (results.length === 0) {
            return `
                <div class="empty-state" style="padding:20px">
                    <div class="empty-state__title">No results found</div>
                    <div class="empty-state__desc">Try a different search term</div>
                </div>
            `;
        }

        return `
            <div class="section-label">Search Results (${results.length})</div>
            <div class="radio-freq-list">
                ${results.map(r => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__freq">${r.freq ? RadioModule.formatFreq(r.freq, 4) : r.channel || ''}</div>
                            <div class="radio-freq-item__name">${r.name || r.channel || ''}</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${r._category}</span>
                            ${r.notes ? `<span style="opacity:0.6;font-size:11px">${r.notes}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioEmergency() {
        const freqs = RadioModule.EMERGENCY_FREQUENCIES;
        const critical = freqs.filter(f => f.priority === 'critical');
        const high = freqs.filter(f => f.priority === 'high');
        const medium = freqs.filter(f => f.priority === 'medium');

        return `
            <div class="status-card status-card--error" style="margin-bottom:16px">
                <div class="status-card__icon">${Icons.get('alertTriangle')}</div>
                <div>
                    <div class="status-card__title">Emergency Frequencies</div>
                    <div class="status-card__desc">For life-threatening emergencies only</div>
                </div>
            </div>

            <div class="section-label">🔴 Critical (Distress)</div>
            <div class="radio-freq-list">
                ${critical.map(f => renderFrequencyItem(f, 'critical')).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">🟠 High Priority</div>
            <div class="radio-freq-list">
                ${high.map(f => renderFrequencyItem(f, 'high')).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">🟡 Standard Emergency</div>
            <div class="radio-freq-list">
                ${medium.map(f => renderFrequencyItem(f, 'medium')).join('')}
            </div>

            <div style="margin-top:20px;padding:14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:10px;font-size:12px">
                <strong style="color:#ef4444">⚠️ Important:</strong> 
                Use emergency frequencies only for genuine emergencies. 
                False distress calls are illegal and can result in prosecution.
            </div>
        `;
    }

    function renderRadioFRS() {
        const channels = RadioModule.FRS_CHANNELS;
        
        return `
            <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>FRS (Family Radio Service)</strong><br>
                No license required. Max 2W on Ch 1-7 & 15-22, 0.5W on Ch 8-14.
                Channels 1-7 and 15-22 are shared with GMRS.
            </div>

            <div class="radio-freq-list">
                ${channels.map(ch => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(4)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.power}</span>
                            ${ch.shared ? `<span class="comm-tag comm-tag--secondary">${ch.shared}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioGMRS() {
        const channels = RadioModule.GMRS_CHANNELS;
        
        return `
            <div style="padding:12px;background:rgba(249,115,22,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>GMRS (General Mobile Radio Service)</strong><br>
                FCC license required ($35 for 10 years, covers family).
                Up to 50W on repeater channels. Channel 19 is calling/emergency.
            </div>

            <div class="section-label">Simplex Channels (5W)</div>
            <div class="radio-freq-list">
                ${channels.filter(ch => !ch.repeater).map(ch => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(4)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.power}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">Repeater Channels (50W)</div>
            <div class="radio-freq-list">
                ${channels.filter(ch => ch.repeater).map(ch => `
                    <div class="radio-freq-item ${ch.channel === 19 ? 'radio-freq-item--highlight' : ''}">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(4)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.power}</span>
                            <span class="comm-tag comm-tag--secondary">RPT</span>
                        </div>
                        ${ch.notes ? `<div class="radio-freq-item__notes">${ch.notes}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioMURS() {
        const channels = RadioModule.MURS_CHANNELS;
        
        return `
            <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>MURS (Multi-Use Radio Service)</strong><br>
                No license required. Max 2W. Less congested than FRS.
                Good for voice communication in rural areas.
            </div>

            <div class="radio-freq-list">
                ${channels.map(ch => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.power}</span>
                            <span class="comm-tag comm-tag--secondary">${ch.bandwidth}</span>
                        </div>
                        ${ch.notes ? `<div class="radio-freq-item__notes">${ch.notes}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioCB() {
        const channels = RadioModule.CB_CHANNELS;
        const highlighted = [9, 19]; // Emergency and trucker channel
        
        return `
            <div style="padding:12px;background:rgba(139,92,246,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>CB (Citizens Band) Radio</strong><br>
                No license required. 4W AM / 12W SSB.
                Ch 9 = Emergency, Ch 19 = Truckers/Highway.
            </div>

            <div class="section-label">Key Channels</div>
            <div class="radio-freq-list">
                ${channels.filter(ch => highlighted.includes(ch.channel)).map(ch => `
                    <div class="radio-freq-item radio-freq-item--highlight">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.mode}</span>
                        </div>
                        ${ch.notes ? `<div class="radio-freq-item__notes">${ch.notes}</div>` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">All Channels</div>
            <div class="radio-freq-list" style="max-height:400px;overflow-y:auto">
                ${channels.map(ch => `
                    <div class="radio-freq-item ${highlighted.includes(ch.channel) ? 'radio-freq-item--highlight' : ''}">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">Ch ${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${ch.mode}</span>
                            ${ch.notes ? `<span style="opacity:0.6;font-size:10px">${ch.notes}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioWeather() {
        const channels = RadioModule.WEATHER_FREQUENCIES;
        
        return `
            <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>NOAA Weather Radio</strong><br>
                Continuous broadcasts of weather information, warnings, and alerts.
                Coverage varies by region - scan to find active channel.
            </div>

            <div class="radio-freq-list">
                ${channels.map(ch => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">${ch.channel}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">Receive Only</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top:16px;padding:14px;background:var(--color-bg-elevated);border-radius:10px">
                <strong style="font-size:13px">📍 Finding Your Local Station</strong>
                <ol style="margin:8px 0 0 16px;font-size:12px;color:var(--color-text-secondary)">
                    <li>Turn on weather radio</li>
                    <li>Scan through WX1-WX7</li>
                    <li>Listen for strongest/clearest signal</li>
                    <li>Note which channel works best for your area</li>
                </ol>
            </div>
        `;
    }

    function renderRadioMeshtastic() {
        const channels = RadioModule.MESHTASTIC_CHANNELS;
        
        return `
            <div style="padding:12px;background:rgba(236,72,153,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>Meshtastic / LoRa (915 MHz ISM Band)</strong><br>
                Off-grid mesh network for text messaging. No license required.
                Range: 1-10+ miles depending on terrain and settings.
            </div>

            <div class="section-label">Preset Channels (US Region)</div>
            <div class="radio-freq-list">
                ${channels.map(ch => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__name" style="font-weight:500">${ch.name}</div>
                            <div class="radio-freq-item__freq">${ch.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">SF${ch.sf}</span>
                            <span class="comm-tag">${ch.bw}kHz</span>
                        </div>
                        <div class="radio-freq-item__notes">${ch.notes}</div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top:16px;padding:14px;background:var(--color-bg-elevated);border-radius:10px">
                <strong style="font-size:13px">🔧 Settings Guide</strong>
                <div style="margin-top:8px;font-size:12px;color:var(--color-text-secondary)">
                    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border)">
                        <span>LongFast</span><span>Best for most uses</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--color-border)">
                        <span>LongSlow</span><span>Maximum range</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0">
                        <span>ShortFast</span><span>High traffic areas</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderRadioHam() {
        const vhf = RadioModule.HAM_FREQUENCIES.vhf;
        const uhf = RadioModule.HAM_FREQUENCIES.uhf;
        const hf = RadioModule.HAM_FREQUENCIES.hf;
        
        return `
            <div style="padding:12px;background:rgba(249,115,22,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>Amateur (Ham) Radio</strong><br>
                FCC license required to transmit. Listen-only is permitted.
                These are common calling and simplex frequencies.
            </div>

            <div class="section-label">2m VHF (144-148 MHz)</div>
            <div class="radio-freq-list">
                ${vhf.map(f => `
                    <div class="radio-freq-item ${f.freq === 146.520 ? 'radio-freq-item--highlight' : ''}">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__freq">${f.freq.toFixed(3)} MHz</div>
                            <div class="radio-freq-item__name">${f.name}</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${f.mode}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">70cm UHF (420-450 MHz)</div>
            <div class="radio-freq-list">
                ${uhf.map(f => `
                    <div class="radio-freq-item ${f.freq === 446.000 ? 'radio-freq-item--highlight' : ''}">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__freq">${f.freq.toFixed(3)} MHz</div>
                            <div class="radio-freq-item__name">${f.name}</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${f.mode}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="section-label" style="margin-top:16px">HF (Long Distance)</div>
            <div class="radio-freq-list">
                ${hf.map(f => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__freq">${f.freq.toFixed(3)} MHz</div>
                            <div class="radio-freq-item__name">${f.name}</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${f.mode}</span>
                        </div>
                        ${f.notes ? `<div class="radio-freq-item__notes">${f.notes}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioRepeaters() {
        const repeaters = RadioModule.getRepeaters();
        
        return `
            <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>Amateur Repeaters</strong><br>
                Pre-loaded repeaters for the Sierra Nevada region.
                Add custom repeaters for your area.
            </div>

            <button class="btn btn--primary btn--full" id="add-repeater-btn" style="margin-bottom:16px">
                ${Icons.get('plus')} Add Repeater
            </button>

            <div class="radio-freq-list">
                ${repeaters.map(r => `
                    <div class="radio-freq-item">
                        <div class="radio-freq-item__main">
                            <div class="radio-freq-item__channel">${r.callsign}</div>
                            <div class="radio-freq-item__freq">${r.freq.toFixed(3)} MHz</div>
                        </div>
                        <div class="radio-freq-item__meta">
                            <span class="comm-tag">${r.offset}</span>
                            ${r.tone ? `<span class="comm-tag">T ${r.tone}</span>` : ''}
                            ${r.isCustom ? `<button class="comm-action-btn comm-action-btn--danger" data-delete-repeater="${r.id}" style="margin-left:auto">${Icons.get('trash')}</button>` : ''}
                        </div>
                        <div class="radio-freq-item__notes">${r.location}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRadioRallyPoints() {
        const rallyPoints = RadioModule.getRallyPoints();
        const waypoints = State.get('waypoints');
        
        return `
            <div style="padding:12px;background:rgba(236,72,153,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>Rally Point Frequencies</strong><br>
                Assign frequencies and codenames to rally points.
                Link to waypoints for coordinate reference.
            </div>

            <button class="btn btn--primary btn--full" id="add-rally-btn" style="margin-bottom:16px">
                ${Icons.get('plus')} Add Rally Point
            </button>

            ${rallyPoints.length === 0 ? `
                <div class="empty-state" style="padding:30px">
                    <div class="empty-state__icon">${Icons.get('target')}</div>
                    <div class="empty-state__title">No Rally Points</div>
                    <div class="empty-state__desc">Add frequencies for your team's rally points</div>
                </div>
            ` : `
                <div class="radio-freq-list">
                    ${rallyPoints.map(rp => {
                        const linkedWp = rp.waypointId ? waypoints.find(w => w.id === rp.waypointId) : null;
                        return `
                            <div class="radio-freq-item">
                                <div class="radio-freq-item__main">
                                    <div class="radio-freq-item__name" style="font-weight:600">${rp.codename || rp.name}</div>
                                    <div class="radio-freq-item__freq">${rp.freq.toFixed(4)} MHz</div>
                                </div>
                                <div class="radio-freq-item__meta">
                                    ${rp.tone ? `<span class="comm-tag">T ${rp.tone}</span>` : ''}
                                    ${linkedWp ? `<span class="comm-tag comm-tag--secondary">📍 ${linkedWp.name}</span>` : ''}
                                    <button class="comm-action-btn" data-edit-rally="${rp.id}" style="margin-left:auto">${Icons.get('edit')}</button>
                                    <button class="comm-action-btn comm-action-btn--danger" data-delete-rally="${rp.id}">${Icons.get('trash')}</button>
                                </div>
                                ${rp.notes ? `<div class="radio-freq-item__notes">${rp.notes}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        `;
    }

    function renderRadioCustom() {
        const custom = RadioModule.getCustomFrequencies();
        
        return `
            <div style="padding:12px;background:rgba(139,92,246,0.1);border-radius:10px;margin-bottom:16px;font-size:12px">
                <strong>Custom Frequencies</strong><br>
                Save frequently used frequencies for quick reference.
            </div>

            <button class="btn btn--primary btn--full" id="add-custom-freq-btn" style="margin-bottom:16px">
                ${Icons.get('plus')} Add Frequency
            </button>

            ${custom.length === 0 ? `
                <div class="empty-state" style="padding:30px">
                    <div class="empty-state__icon">${Icons.get('star')}</div>
                    <div class="empty-state__title">No Custom Frequencies</div>
                    <div class="empty-state__desc">Add your own frequencies for quick access</div>
                </div>
            ` : `
                <div class="radio-freq-list">
                    ${custom.map(f => `
                        <div class="radio-freq-item">
                            <div class="radio-freq-item__main">
                                <div class="radio-freq-item__name">${f.name || 'Unnamed'}</div>
                                <div class="radio-freq-item__freq">${f.freq.toFixed(4)} MHz</div>
                            </div>
                            <div class="radio-freq-item__meta">
                                <span class="comm-tag">${f.mode}</span>
                                ${f.tone ? `<span class="comm-tag">T ${f.tone}</span>` : ''}
                                ${f.category ? `<span class="comm-tag comm-tag--secondary">${f.category}</span>` : ''}
                                <button class="comm-action-btn" data-edit-custom="${f.id}" style="margin-left:auto">${Icons.get('edit')}</button>
                                <button class="comm-action-btn comm-action-btn--danger" data-delete-custom="${f.id}">${Icons.get('trash')}</button>
                            </div>
                            ${f.notes ? `<div class="radio-freq-item__notes">${f.notes}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `}
        `;
    }

    function renderFrequencyItem(f, priority) {
        const colors = {
            critical: '#ef4444',
            high: '#f59e0b',
            medium: '#3b82f6'
        };
        
        return `
            <div class="radio-freq-item" style="border-left:3px solid ${colors[priority] || '#666'}">
                <div class="radio-freq-item__main">
                    <div class="radio-freq-item__freq">${f.freq.toFixed(3)} MHz</div>
                    <div class="radio-freq-item__name">${f.name}</div>
                </div>
                <div class="radio-freq-item__meta">
                    <span class="comm-tag">${f.service}</span>
                </div>
                ${f.notes ? `<div class="radio-freq-item__notes">${f.notes}</div>` : ''}
            </div>
        `;
    }

    function attachRadioContentHandlers() {
        // Add custom frequency button
        const addCustomBtn = container.querySelector('#add-custom-freq-btn');
        if (addCustomBtn) {
            addCustomBtn.onclick = () => showAddFrequencyModal();
        }

        // Add rally point button
        const addRallyBtn = container.querySelector('#add-rally-btn');
        if (addRallyBtn) {
            addRallyBtn.onclick = () => showAddRallyPointModal();
        }

        // Add repeater button
        const addRepeaterBtn = container.querySelector('#add-repeater-btn');
        if (addRepeaterBtn) {
            addRepeaterBtn.onclick = () => showAddRepeaterModal();
        }

        // Delete handlers
        container.querySelectorAll('[data-delete-custom]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this frequency?')) {
                    RadioModule.deleteCustomFrequency(btn.dataset.deleteCustom);
                    document.getElementById('radio-content').innerHTML = renderRadioTabContent();
                    attachRadioContentHandlers();
                }
            };
        });

        container.querySelectorAll('[data-delete-rally]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this rally point?')) {
                    RadioModule.deleteRallyPoint(btn.dataset.deleteRally);
                    document.getElementById('radio-content').innerHTML = renderRadioTabContent();
                    attachRadioContentHandlers();
                }
            };
        });

        container.querySelectorAll('[data-delete-repeater]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this repeater?')) {
                    const repeaters = RadioModule.getRepeaters();
                    const rpt = repeaters.find(r => r.id === btn.dataset.deleteRepeater);
                    if (rpt) {
                        // Remove from array (would need proper delete method)
                        document.getElementById('radio-content').innerHTML = renderRadioTabContent();
                        attachRadioContentHandlers();
                    }
                }
            };
        });
    }

    function showAddFrequencyModal() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">Add Custom Frequency</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Frequency (MHz)</label>
                            <input type="number" id="freq-input" step="0.0001" placeholder="146.5200">
                        </div>
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="freq-name" placeholder="My frequency">
                        </div>
                        <div class="form-group">
                            <label>Mode</label>
                            <select id="freq-mode">
                                <option value="FM">FM</option>
                                <option value="AM">AM</option>
                                <option value="USB">USB</option>
                                <option value="LSB">LSB</option>
                                <option value="Digital">Digital</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>CTCSS Tone (optional)</label>
                            <select id="freq-tone">
                                <option value="">None</option>
                                ${RadioModule.CTCSS_TONES.map(t => `<option value="${t}">${t} Hz</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Category</label>
                            <input type="text" id="freq-category" placeholder="e.g., Local, Work, Club">
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="freq-notes" rows="2" placeholder="Additional notes..."></textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-save">Add Frequency</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#modal-save').onclick = () => {
            const freq = parseFloat(modalContainer.querySelector('#freq-input').value);
            if (!freq || freq <= 0) {
                ModalsModule.showToast('Enter a valid frequency', 'error');
                return;
            }

            RadioModule.addCustomFrequency({
                freq,
                name: modalContainer.querySelector('#freq-name').value,
                mode: modalContainer.querySelector('#freq-mode').value,
                tone: modalContainer.querySelector('#freq-tone').value || null,
                category: modalContainer.querySelector('#freq-category').value,
                notes: modalContainer.querySelector('#freq-notes').value
            });

            modalContainer.innerHTML = '';
            ModalsModule.showToast('Frequency added', 'success');
            document.getElementById('radio-content').innerHTML = renderRadioTabContent();
            attachRadioContentHandlers();
        };
    }

    function showAddRallyPointModal() {
        const waypoints = State.get('waypoints');
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">Add Rally Point</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="rally-name" placeholder="Rally Point Alpha">
                        </div>
                        <div class="form-group">
                            <label>Codename (optional)</label>
                            <input type="text" id="rally-codename" placeholder="PHOENIX">
                        </div>
                        <div class="form-group">
                            <label>Frequency (MHz)</label>
                            <input type="number" id="rally-freq" step="0.0001" placeholder="462.5625">
                        </div>
                        <div class="form-group">
                            <label>CTCSS Tone (optional)</label>
                            <select id="rally-tone">
                                <option value="">None</option>
                                ${RadioModule.CTCSS_TONES.map(t => `<option value="${t}">${t} Hz</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Link to Waypoint (optional)</label>
                            <select id="rally-waypoint">
                                <option value="">None</option>
                                ${waypoints.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="rally-notes" rows="2" placeholder="Check-in times, procedures..."></textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-save">Add Rally Point</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#modal-save').onclick = () => {
            const name = modalContainer.querySelector('#rally-name').value;
            const freq = parseFloat(modalContainer.querySelector('#rally-freq').value);
            
            if (!name) {
                ModalsModule.showToast('Enter a name', 'error');
                return;
            }
            if (!freq || freq <= 0) {
                ModalsModule.showToast('Enter a valid frequency', 'error');
                return;
            }

            RadioModule.addRallyPoint({
                name,
                codename: modalContainer.querySelector('#rally-codename').value,
                freq,
                tone: modalContainer.querySelector('#rally-tone').value || null,
                waypointId: modalContainer.querySelector('#rally-waypoint').value || null,
                notes: modalContainer.querySelector('#rally-notes').value
            });

            modalContainer.innerHTML = '';
            ModalsModule.showToast('Rally point added', 'success');
            document.getElementById('radio-content').innerHTML = renderRadioTabContent();
            attachRadioContentHandlers();
        };
    }

    function showAddRepeaterModal() {
        const modalContainer = document.getElementById('modal-container');
        
        modalContainer.innerHTML = `
            <div class="modal-backdrop" id="modal-backdrop">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__title">Add Repeater</h3>
                        <button class="modal__close" id="modal-close">${Icons.get('close')}</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-group">
                            <label>Callsign</label>
                            <input type="text" id="rpt-callsign" placeholder="W6ABC">
                        </div>
                        <div class="form-group">
                            <label>Output Frequency (MHz)</label>
                            <input type="number" id="rpt-freq" step="0.0001" placeholder="146.940">
                        </div>
                        <div class="form-group">
                            <label>Offset</label>
                            <select id="rpt-offset">
                                <option value="-">- (minus)</option>
                                <option value="+">+ (plus)</option>
                                <option value="0">Simplex</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>CTCSS Tone</label>
                            <select id="rpt-tone">
                                <option value="">None</option>
                                ${RadioModule.CTCSS_TONES.map(t => `<option value="${t}">${t} Hz</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Location</label>
                            <input type="text" id="rpt-location" placeholder="Mt. Wilson, CA">
                        </div>
                        <div class="form-group">
                            <label>Notes</label>
                            <textarea id="rpt-notes" rows="2" placeholder="Coverage area, linked systems..."></textarea>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secondary" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary" id="modal-save">Add Repeater</button>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('#modal-close').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-cancel').onclick = () => modalContainer.innerHTML = '';
        modalContainer.querySelector('#modal-backdrop').onclick = (e) => {
            if (e.target.id === 'modal-backdrop') modalContainer.innerHTML = '';
        };

        modalContainer.querySelector('#modal-save').onclick = () => {
            const freq = parseFloat(modalContainer.querySelector('#rpt-freq').value);
            
            if (!freq || freq <= 0) {
                ModalsModule.showToast('Enter a valid frequency', 'error');
                return;
            }

            RadioModule.addRepeater({
                callsign: modalContainer.querySelector('#rpt-callsign').value,
                freq,
                offset: modalContainer.querySelector('#rpt-offset').value,
                tone: modalContainer.querySelector('#rpt-tone').value || null,
                location: modalContainer.querySelector('#rpt-location').value,
                notes: modalContainer.querySelector('#rpt-notes').value
            });

            modalContainer.innerHTML = '';
            ModalsModule.showToast('Repeater added', 'success');
            document.getElementById('radio-content').innerHTML = renderRadioTabContent();
            attachRadioContentHandlers();
        };
    }

    // =========================================================================
    // MEDICAL REFERENCE PANEL
    // =========================================================================
    
    let medicalState = {
        searchQuery: '',
        activeCategory: null,
        activeView: 'categories', // 'categories', 'search', 'protocol', 'medication', 'bookmarks'
        selectedProtocol: null,
        selectedMedication: null,
        bookmarks: []
    };

    // Load bookmarks from storage
    async function loadMedicalBookmarks() {
        try {
            const saved = await Storage.Settings.get('medical_bookmarks');
            if (saved) {
                medicalState.bookmarks = saved;
            }
        } catch (e) {
            console.error('Failed to load medical bookmarks:', e);
        }
    }

    // Save bookmarks to storage
    async function saveMedicalBookmarks() {
        try {
            await Storage.Settings.set('medical_bookmarks', medicalState.bookmarks);
        } catch (e) {
            console.error('Failed to save medical bookmarks:', e);
        }
    }

    function renderMedical() {
        if (typeof MedicalModule === 'undefined') {
            container.innerHTML = `
                <div class="panel__header">
                    <h2 class="panel__title">🏥 Medical Reference</h2>
                </div>
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('medical')}</div>
                    <div class="empty-state__title">Medical Module Not Loaded</div>
                    <div class="empty-state__desc">Medical reference features are not available</div>
                </div>
            `;
            return;
        }

        // Load bookmarks if needed
        if (medicalState.bookmarks.length === 0) {
            loadMedicalBookmarks();
        }

        const categories = MedicalModule.getCategories();
        const medCategories = MedicalModule.getMedCategories();

        container.innerHTML = `
            <div class="panel__header">
                <h2 class="panel__title">🏥 Medical Reference</h2>
                ${medicalState.activeView !== 'categories' ? `
                    <button class="btn btn--secondary" id="medical-back" style="padding:8px">
                        ${Icons.get('back')}
                    </button>
                ` : ''}
            </div>

            <!-- Disclaimer -->
            <div style="padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;margin-bottom:16px">
                <div style="font-size:11px;color:#ef4444;font-weight:600;margin-bottom:4px">⚠️ DISCLAIMER</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.7);line-height:1.4">
                    For educational reference only. Not a substitute for professional medical training or emergency care. 
                    Always seek professional help when available.
                </div>
            </div>

            <!-- Search Bar -->
            <div style="position:relative;margin-bottom:16px">
                <input type="text" id="medical-search" 
                    placeholder="Search protocols, medications, symptoms..." 
                    value="${medicalState.searchQuery}"
                    style="padding-left:36px">
                <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:0.5">
                    ${Icons.get('search')}
                </span>
            </div>

            <!-- Quick Access Bookmarks -->
            ${medicalState.bookmarks.length > 0 && medicalState.activeView === 'categories' ? `
                <div style="margin-bottom:16px">
                    <div class="section-label" style="display:flex;justify-content:space-between;align-items:center">
                        <span>${Icons.get('bookmark')} Bookmarked</span>
                        <button class="btn btn--secondary" id="view-all-bookmarks" style="padding:4px 8px;font-size:10px">
                            View All (${medicalState.bookmarks.length})
                        </button>
                    </div>
                    <div style="display:flex;gap:8px;overflow-x:auto;padding:4px 0">
                        ${medicalState.bookmarks.slice(0, 3).map(b => {
                            const item = MedicalModule.getProtocol(b) || MedicalModule.getMedication(b);
                            if (!item) return '';
                            const isProtocol = !!MedicalModule.getProtocol(b);
                            return `
                                <button class="chip chip--active" 
                                    data-bookmark="${b}" 
                                    data-type="${isProtocol ? 'protocol' : 'medication'}"
                                    style="white-space:nowrap">
                                    ${isProtocol ? '📋' : '💊'} ${item.title || item.name}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Content Area -->
            <div id="medical-content">
                ${renderMedicalContent()}
            </div>
        `;

        attachMedicalHandlers();
    }

    function renderMedicalContent() {
        // Check for search results first
        if (medicalState.searchQuery && medicalState.searchQuery.length >= 2) {
            return renderMedicalSearchResults();
        }

        switch (medicalState.activeView) {
            case 'protocol':
                return renderMedicalProtocol();
            case 'medication':
                return renderMedicalMedication();
            case 'category':
                return renderMedicalCategory();
            case 'medications':
                return renderMedicationsList();
            case 'bookmarks':
                return renderMedicalBookmarks();
            case 'quickref':
                return renderQuickReferences();
            default:
                return renderMedicalCategories();
        }
    }

    function renderMedicalCategories() {
        const categories = MedicalModule.getCategories();
        const medCategories = MedicalModule.getMedCategories();
        
        return `
            <!-- Protocol Categories -->
            <div class="section-label">📋 Protocols & Procedures</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">
                ${Object.entries(categories).map(([key, cat]) => `
                    <button class="card" data-category="${key}" style="text-align:center;padding:16px">
                        <div style="font-size:24px;margin-bottom:8px">${cat.icon}</div>
                        <div style="font-size:13px;font-weight:500">${cat.name}</div>
                        <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:4px">
                            ${MedicalModule.getProtocolsByCategory(key).length} protocols
                        </div>
                    </button>
                `).join('')}
            </div>

            <!-- Medications Section -->
            <div class="section-label">💊 Medications Reference</div>
            <button class="card" data-view="medications" style="width:100%;margin-bottom:12px">
                <div class="card__header">
                    <div class="card__icon" style="background:rgba(245,158,11,0.15)">💊</div>
                    <div>
                        <div class="card__title">Drug Reference & Interactions</div>
                        <div class="card__subtitle">${Object.keys(MedicalModule.getAllMedications()).length} medications with dosing & warnings</div>
                    </div>
                </div>
            </button>

            <!-- Quick References -->
            <div class="section-label">📊 Quick References</div>
            <button class="card" data-view="quickref" style="width:100%;margin-bottom:12px">
                <div class="card__header">
                    <div class="card__icon" style="background:rgba(59,130,246,0.15)">📊</div>
                    <div>
                        <div class="card__title">Vital Signs, CPR, Burns, etc.</div>
                        <div class="card__subtitle">Essential reference tables</div>
                    </div>
                </div>
            </button>
        `;
    }

    function renderMedicalCategory() {
        const cat = medicalState.activeCategory;
        if (!cat) return renderMedicalCategories();

        const categoryInfo = MedicalModule.getCategories()[cat];
        const protocols = MedicalModule.getProtocolsByCategory(cat);

        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="font-size:32px">${categoryInfo.icon}</div>
                <div>
                    <div style="font-size:16px;font-weight:600">${categoryInfo.name}</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">${protocols.length} protocols</div>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px">
                ${protocols.map(p => `
                    <button class="card" data-protocol="${p.id}" style="text-align:left">
                        <div class="card__header">
                            <div class="card__icon" style="background:${getSeverityColor(p.severity)}22;color:${getSeverityColor(p.severity)}">
                                ${getSeverityIcon(p.severity)}
                            </div>
                            <div style="flex:1">
                                <div class="card__title">${p.title}</div>
                                <div class="card__subtitle" style="display:flex;gap:8px;align-items:center">
                                    <span style="padding:2px 6px;background:${getSeverityColor(p.severity)}33;color:${getSeverityColor(p.severity)};border-radius:4px;font-size:9px;font-weight:600">
                                        ${p.severity.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            ${medicalState.bookmarks.includes(p.id) ? `<span style="color:#f59e0b">${Icons.get('bookmarkFilled')}</span>` : ''}
                        </div>
                    </button>
                `).join('')}
            </div>
        `;
    }

    function renderMedicalProtocol() {
        const p = medicalState.selectedProtocol;
        if (!p) return renderMedicalCategories();

        const protocol = MedicalModule.getProtocol(p);
        if (!protocol) return '<div class="empty-state">Protocol not found</div>';

        const isBookmarked = medicalState.bookmarks.includes(p);

        return `
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div style="font-size:18px;font-weight:600">${protocol.title}</div>
                    <button class="btn btn--secondary" id="toggle-bookmark" data-id="${p}" style="padding:8px">
                        ${isBookmarked ? Icons.get('bookmarkFilled') : Icons.get('bookmark')}
                    </button>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
                    <span style="padding:4px 10px;background:${getSeverityColor(protocol.severity)}33;color:${getSeverityColor(protocol.severity)};border-radius:20px;font-size:11px;font-weight:600">
                        ${protocol.severity.toUpperCase()}
                    </span>
                    ${protocol.tags.slice(0, 3).map(t => `
                        <span style="padding:4px 10px;background:rgba(255,255,255,0.1);border-radius:20px;font-size:11px;color:rgba(255,255,255,0.6)">
                            ${t}
                        </span>
                    `).join('')}
                </div>
                <div style="font-size:13px;color:rgba(255,255,255,0.8);line-height:1.5;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px">
                    ${protocol.overview}
                </div>
            </div>

            <!-- Steps -->
            <div class="section-label">📋 Protocol Steps</div>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
                ${protocol.steps.map((step, i) => `
                    <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:10px;border-left:3px solid ${getSeverityColor(protocol.severity)}">
                        <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:#fff">
                            ${step.title}
                        </div>
                        <div style="font-size:12px;color:rgba(255,255,255,0.75);line-height:1.5;white-space:pre-wrap">
                            ${step.content}
                        </div>
                        ${step.warning ? `
                            <div style="margin-top:10px;padding:10px;background:rgba(239,68,68,0.15);border-radius:6px;border-left:3px solid #ef4444">
                                <div style="font-size:11px;font-weight:600;color:#ef4444;margin-bottom:4px">⚠️ WARNING</div>
                                <div style="font-size:11px;color:rgba(255,255,255,0.8)">${step.warning}</div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            ${protocol.equipment && protocol.equipment.length > 0 ? `
                <div class="section-label">🎒 Equipment Needed</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
                    ${protocol.equipment.map(e => `
                        <span style="padding:6px 12px;background:rgba(59,130,246,0.15);border-radius:20px;font-size:11px;color:#3b82f6">
                            ${e}
                        </span>
                    `).join('')}
                </div>
            ` : ''}

            ${protocol.medications && protocol.medications.length > 0 ? `
                <div class="section-label">💊 Medications</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                    ${protocol.medications.map(m => `
                        <div style="padding:12px;background:rgba(245,158,11,0.1);border-radius:8px">
                            <div style="font-size:13px;font-weight:600;color:#f59e0b">${m.name}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.6)">Dose: ${m.dose}</div>
                            <div style="font-size:11px;color:rgba(255,255,255,0.5)">${m.purpose}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${protocol.notes ? `
                <div class="section-label">📝 Notes</div>
                <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5">
                    ${protocol.notes}
                </div>
            ` : ''}
        `;
    }

    function renderMedicationsList() {
        const medCategories = MedicalModule.getMedCategories();
        const allMeds = MedicalModule.getAllMedications();

        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="font-size:32px">💊</div>
                <div>
                    <div style="font-size:16px;font-weight:600">Medications Reference</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">Dosing, interactions, and warnings</div>
                </div>
            </div>

            ${Object.entries(medCategories).map(([catKey, catInfo]) => {
                const meds = MedicalModule.getMedicationsByCategory(catKey);
                if (meds.length === 0) return '';
                
                return `
                    <div class="section-label">${catInfo.icon} ${catInfo.name}</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                        ${meds.map(m => `
                            <button class="card" data-medication="${Object.keys(MedicalModule.MEDICATIONS).find(k => MedicalModule.MEDICATIONS[k] === m)}" style="text-align:left">
                                <div class="card__header">
                                    <div class="card__icon" style="background:rgba(245,158,11,0.15)">${catInfo.icon}</div>
                                    <div style="flex:1">
                                        <div class="card__title">${m.name}</div>
                                        <div class="card__subtitle">${m.uses.slice(0, 2).join(', ')}</div>
                                    </div>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                `;
            }).join('')}
        `;
    }

    function renderMedicalMedication() {
        const key = medicalState.selectedMedication;
        if (!key) return renderMedicationsList();

        const med = MedicalModule.getMedication(key);
        if (!med) return '<div class="empty-state">Medication not found</div>';

        const isBookmarked = medicalState.bookmarks.includes(key);

        return `
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                    <div style="font-size:18px;font-weight:600">${med.name}</div>
                    <button class="btn btn--secondary" id="toggle-bookmark" data-id="${key}" style="padding:8px">
                        ${isBookmarked ? Icons.get('bookmarkFilled') : Icons.get('bookmark')}
                    </button>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
                    ${med.uses.map(u => `
                        <span style="padding:4px 10px;background:rgba(59,130,246,0.2);color:#3b82f6;border-radius:20px;font-size:11px">
                            ${u}
                        </span>
                    `).join('')}
                </div>
            </div>

            <!-- Dosing -->
            <div class="section-label">💊 Dosing</div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                <div style="padding:12px;background:rgba(34,197,94,0.1);border-radius:8px">
                    <div style="font-size:11px;color:#22c55e;font-weight:600;margin-bottom:4px">ADULT DOSE</div>
                    <div style="font-size:13px;color:#fff">${med.adultDose}</div>
                </div>
                ${med.pediatricDose ? `
                    <div style="padding:12px;background:rgba(59,130,246,0.1);border-radius:8px">
                        <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-bottom:4px">PEDIATRIC DOSE</div>
                        <div style="font-size:13px;color:#fff">${med.pediatricDose}</div>
                    </div>
                ` : ''}
            </div>

            <!-- Contraindications -->
            ${med.contraindications && med.contraindications.length > 0 ? `
                <div class="section-label">🚫 Contraindications</div>
                <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;margin-bottom:16px">
                    <ul style="margin:0;padding-left:20px;color:rgba(255,255,255,0.8);font-size:12px;line-height:1.6">
                        ${med.contraindications.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            <!-- Drug Interactions -->
            ${med.interactions && med.interactions.length > 0 ? `
                <div class="section-label">⚠️ Drug Interactions</div>
                <div style="padding:12px;background:rgba(245,158,11,0.1);border-radius:8px;margin-bottom:16px">
                    <ul style="margin:0;padding-left:20px;color:rgba(255,255,255,0.8);font-size:12px;line-height:1.6">
                        ${med.interactions.map(i => `<li>${i}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            <!-- Warnings -->
            ${med.warnings ? `
                <div class="section-label">⚠️ Warnings</div>
                <div style="padding:12px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:8px;margin-bottom:16px">
                    <div style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.5">${med.warnings}</div>
                </div>
            ` : ''}

            <!-- Notes -->
            ${med.notes ? `
                <div class="section-label">📝 Clinical Notes</div>
                <div style="padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5">
                    ${med.notes}
                </div>
            ` : ''}
        `;
    }

    function renderMedicalSearchResults() {
        const results = MedicalModule.search(medicalState.searchQuery);
        const totalResults = results.protocols.length + results.medications.length;

        if (totalResults === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('search')}</div>
                    <div class="empty-state__title">No Results</div>
                    <div class="empty-state__desc">Try different search terms</div>
                </div>
            `;
        }

        return `
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px">
                Found ${totalResults} result${totalResults !== 1 ? 's' : ''} for "${medicalState.searchQuery}"
            </div>

            ${results.protocols.length > 0 ? `
                <div class="section-label">📋 Protocols (${results.protocols.length})</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
                    ${results.protocols.map(p => `
                        <button class="card" data-protocol="${p.id}" style="text-align:left">
                            <div class="card__header">
                                <div class="card__icon" style="background:${getSeverityColor(p.severity)}22;color:${getSeverityColor(p.severity)}">
                                    ${getSeverityIcon(p.severity)}
                                </div>
                                <div style="flex:1">
                                    <div class="card__title">${p.title}</div>
                                    <div class="card__subtitle">${p.overview.substring(0, 60)}...</div>
                                </div>
                            </div>
                        </button>
                    `).join('')}
                </div>
            ` : ''}

            ${results.medications.length > 0 ? `
                <div class="section-label">💊 Medications (${results.medications.length})</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    ${results.medications.map(m => {
                        const key = Object.keys(MedicalModule.MEDICATIONS).find(k => MedicalModule.MEDICATIONS[k] === m);
                        return `
                            <button class="card" data-medication="${key}" style="text-align:left">
                                <div class="card__header">
                                    <div class="card__icon" style="background:rgba(245,158,11,0.15)">💊</div>
                                    <div style="flex:1">
                                        <div class="card__title">${m.name}</div>
                                        <div class="card__subtitle">${m.uses.slice(0, 2).join(', ')}</div>
                                    </div>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        `;
    }

    function renderQuickReferences() {
        const refs = MedicalModule.getQuickReferences();

        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="font-size:32px">📊</div>
                <div>
                    <div style="font-size:16px;font-weight:600">Quick Reference Tables</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">Essential medical reference data</div>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:16px">
                ${Object.entries(refs).map(([key, ref]) => `
                    <div style="padding:14px;background:rgba(255,255,255,0.03);border-radius:10px">
                        <div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1)">
                            ${ref.title}
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px">
                            ${ref.content.map(item => `
                                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                                    <span style="font-size:12px;color:rgba(255,255,255,0.6)">${item.label}</span>
                                    <span style="font-size:12px;font-weight:600;color:#fff">${item.value}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderMedicalBookmarks() {
        if (medicalState.bookmarks.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-state__icon">${Icons.get('bookmark')}</div>
                    <div class="empty-state__title">No Bookmarks</div>
                    <div class="empty-state__desc">Bookmark protocols and medications for quick access</div>
                </div>
            `;
        }

        return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="font-size:32px">🔖</div>
                <div>
                    <div style="font-size:16px;font-weight:600">Bookmarked Items</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.5)">${medicalState.bookmarks.length} saved</div>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:8px">
                ${medicalState.bookmarks.map(id => {
                    const protocol = MedicalModule.getProtocol(id);
                    const medication = MedicalModule.getMedication(id);
                    
                    if (protocol) {
                        return `
                            <button class="card" data-protocol="${id}" style="text-align:left">
                                <div class="card__header">
                                    <div class="card__icon" style="background:${getSeverityColor(protocol.severity)}22;color:${getSeverityColor(protocol.severity)}">
                                        📋
                                    </div>
                                    <div style="flex:1">
                                        <div class="card__title">${protocol.title}</div>
                                        <div class="card__subtitle">${protocol.severity.toUpperCase()} • Protocol</div>
                                    </div>
                                    <span style="color:#f59e0b">${Icons.get('bookmarkFilled')}</span>
                                </div>
                            </button>
                        `;
                    } else if (medication) {
                        return `
                            <button class="card" data-medication="${id}" style="text-align:left">
                                <div class="card__header">
                                    <div class="card__icon" style="background:rgba(245,158,11,0.15)">💊</div>
                                    <div style="flex:1">
                                        <div class="card__title">${medication.name}</div>
                                        <div class="card__subtitle">Medication</div>
                                    </div>
                                    <span style="color:#f59e0b">${Icons.get('bookmarkFilled')}</span>
                                </div>
                            </button>
                        `;
                    }
                    return '';
                }).join('')}
            </div>
        `;
    }

    function getSeverityColor(severity) {
        const colors = {
            critical: '#ef4444',
            urgent: '#f59e0b',
            moderate: '#3b82f6',
            minor: '#22c55e',
            info: '#6b7280'
        };
        return colors[severity] || colors.info;
    }

    function getSeverityIcon(severity) {
        const icons = {
            critical: '🔴',
            urgent: '🟠',
            moderate: '🔵',
            minor: '🟢',
            info: 'ℹ️'
        };
        return icons[severity] || icons.info;
    }

    function attachMedicalHandlers() {
        // Back button
        const backBtn = container.querySelector('#medical-back');
        if (backBtn) {
            backBtn.onclick = () => {
                if (medicalState.searchQuery) {
                    medicalState.searchQuery = '';
                    const searchInput = container.querySelector('#medical-search');
                    if (searchInput) searchInput.value = '';
                } else if (medicalState.activeView === 'protocol' || medicalState.activeView === 'medication') {
                    if (medicalState.activeCategory) {
                        medicalState.activeView = 'category';
                    } else {
                        medicalState.activeView = 'categories';
                    }
                } else if (medicalState.activeView === 'category') {
                    medicalState.activeView = 'categories';
                    medicalState.activeCategory = null;
                } else {
                    medicalState.activeView = 'categories';
                }
                medicalState.selectedProtocol = null;
                medicalState.selectedMedication = null;
                renderMedical();
            };
        }

        // Search input
        const searchInput = container.querySelector('#medical-search');
        if (searchInput) {
            searchInput.oninput = Helpers.debounce((e) => {
                medicalState.searchQuery = e.target.value;
                document.getElementById('medical-content').innerHTML = renderMedicalContent();
                attachMedicalContentHandlers();
            }, 300);
        }

        // View all bookmarks
        const viewBookmarks = container.querySelector('#view-all-bookmarks');
        if (viewBookmarks) {
            viewBookmarks.onclick = () => {
                medicalState.activeView = 'bookmarks';
                renderMedical();
            };
        }

        // Bookmark chips
        container.querySelectorAll('[data-bookmark]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.bookmark;
                const type = btn.dataset.type;
                if (type === 'protocol') {
                    medicalState.selectedProtocol = id;
                    medicalState.activeView = 'protocol';
                } else {
                    medicalState.selectedMedication = id;
                    medicalState.activeView = 'medication';
                }
                renderMedical();
            };
        });

        attachMedicalContentHandlers();
    }

    function attachMedicalContentHandlers() {
        // Category buttons
        container.querySelectorAll('[data-category]').forEach(btn => {
            btn.onclick = () => {
                medicalState.activeCategory = btn.dataset.category;
                medicalState.activeView = 'category';
                renderMedical();
            };
        });

        // View buttons (medications, quickref)
        container.querySelectorAll('[data-view]').forEach(btn => {
            btn.onclick = () => {
                medicalState.activeView = btn.dataset.view;
                renderMedical();
            };
        });

        // Protocol buttons
        container.querySelectorAll('[data-protocol]').forEach(btn => {
            btn.onclick = () => {
                medicalState.selectedProtocol = btn.dataset.protocol;
                medicalState.activeView = 'protocol';
                renderMedical();
            };
        });

        // Medication buttons
        container.querySelectorAll('[data-medication]').forEach(btn => {
            btn.onclick = () => {
                medicalState.selectedMedication = btn.dataset.medication;
                medicalState.activeView = 'medication';
                renderMedical();
            };
        });

        // Toggle bookmark
        const bookmarkBtn = container.querySelector('#toggle-bookmark');
        if (bookmarkBtn) {
            bookmarkBtn.onclick = () => {
                const id = bookmarkBtn.dataset.id;
                const idx = medicalState.bookmarks.indexOf(id);
                if (idx > -1) {
                    medicalState.bookmarks.splice(idx, 1);
                } else {
                    medicalState.bookmarks.push(id);
                }
                saveMedicalBookmarks();
                renderMedical();
                ModalsModule.showToast(idx > -1 ? 'Bookmark removed' : 'Bookmarked!', 'success');
            };
        }
    }

    return { init, render };
})();
window.PanelsModule = PanelsModule;

