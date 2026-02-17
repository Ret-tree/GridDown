/**
 * GridDown State - Centralized State Management
 */
const State = (function() {
    'use strict';

    let state = {
        activePanel: 'map', isOffline: false, isPanelOpen: true, isLoading: true,
        zoom: 12, center: { x: 0, y: 0 },
        mapLayers: { baseLayer: 'standard', overlays: [], terrain: false, satellite: false, contours: false, grid: false },
        mousePosition: null,
        waypoints: [], routes: [], mapRegions: [], teamMembers: [],
        selectedWaypoint: null, selectedRoute: null,
        selectedVehicle: 'truck', waypointFilter: 'all',
        modal: { isOpen: false, type: null, data: null },
        gpsNavTarget: null  // Currently selected waypoint for GPS navigation
    };

    const subscribers = new Map();
    let subId = 0;

    const get = (path) => {
        if (!path) return { ...state };
        return path.split('.').reduce((o, k) => o?.[k], state);
    };

    const set = (pathOrObj, value) => {
        const prev = JSON.parse(JSON.stringify(state));
        if (typeof pathOrObj === 'string') {
            const parts = pathOrObj.split('.');
            let curr = state;
            for (let i = 0; i < parts.length - 1; i++) curr = curr[parts[i]] = curr[parts[i]] || {};
            curr[parts[parts.length - 1]] = value;
        } else {
            state = { ...state, ...pathOrObj };
        }
        notify(prev);
    };

    const subscribe = (cb, paths = null) => {
        const id = ++subId;
        subscribers.set(id, { cb, paths });
        return () => subscribers.delete(id);
    };

    const notify = (prev) => {
        subscribers.forEach(({ cb, paths }) => {
            if (!paths || paths.some(p => get(p) !== p.split('.').reduce((o, k) => o?.[k], prev))) cb(state, prev);
        });
    };

    // Flag to skip history recording (used during undo/redo)
    let skipHistory = false;
    
    const Waypoints = {
        add: (wp, recordHistory = true) => { 
            set('waypoints', [...get('waypoints'), wp]); 
            // Record to undo history
            if (recordHistory && !skipHistory && typeof UndoModule !== 'undefined') {
                UndoModule.recordWaypointAdd(wp);
            }
            return wp; 
        },
        update: (id, updates, recordHistory = true) => {
            const oldWaypoint = get('waypoints').find(w => w.id === id);
            if (!oldWaypoint) return;
            const newWaypoint = { ...oldWaypoint, ...updates };
            set('waypoints', get('waypoints').map(w => w.id === id ? newWaypoint : w));
            // Record to undo history
            if (recordHistory && !skipHistory && typeof UndoModule !== 'undefined') {
                UndoModule.recordWaypointEdit(newWaypoint, oldWaypoint);
            }
        },
        remove: (id, recordHistory = true) => { 
            const waypoints = get('waypoints');
            const index = waypoints.findIndex(w => w.id === id);
            const waypoint = waypoints[index];
            // Record to undo history BEFORE removing
            if (recordHistory && !skipHistory && waypoint && typeof UndoModule !== 'undefined') {
                UndoModule.recordWaypointDelete(waypoint, index);
            }
            set('waypoints', waypoints.filter(w => w.id !== id)); 
            if (get('selectedWaypoint')?.id === id) set('selectedWaypoint', null); 
        },
        select: (wp) => set('selectedWaypoint', wp),
        setAll: (wps, recordHistory = true) => {
            const oldWaypoints = get('waypoints');
            set('waypoints', wps);
            // Note: bulk changes don't record undo to avoid complex history
        }
    };

    const Routes = {
        add: (r, recordHistory = true) => { 
            set('routes', [...get('routes'), r]); 
            // Record to undo history (skip if it's a building route)
            if (recordHistory && !skipHistory && !r.isBuilding && typeof UndoModule !== 'undefined') {
                UndoModule.recordRouteAdd(r);
            }
            return r; 
        },
        update: (id, updates, recordHistory = true) => {
            const oldRoute = get('routes').find(r => r.id === id);
            if (!oldRoute) return;
            const newRoute = { ...oldRoute, ...updates };
            set('routes', get('routes').map(r => r.id === id ? newRoute : r));
            // Record to undo history (skip if it's a building route)
            if (recordHistory && !skipHistory && !oldRoute.isBuilding && !newRoute.isBuilding && typeof UndoModule !== 'undefined') {
                UndoModule.recordRouteEdit(newRoute, oldRoute);
            }
        },
        remove: (id, recordHistory = true) => { 
            const routes = get('routes');
            const index = routes.findIndex(r => r.id === id);
            const route = routes[index];
            // Record to undo history BEFORE removing (skip if it's a building route)
            if (recordHistory && !skipHistory && route && !route.isBuilding && typeof UndoModule !== 'undefined') {
                UndoModule.recordRouteDelete(route, index);
            }
            set('routes', routes.filter(r => r.id !== id)); 
            if (get('selectedRoute')?.id === id) set('selectedRoute', null); 
        },
        select: (r) => set('selectedRoute', r),
        setAll: (rs, recordHistory = true) => {
            const oldRoutes = get('routes').filter(r => !r.isBuilding);
            set('routes', rs);
            // Note: bulk changes don't record undo to avoid complex history
        }
    };
    
    // Helper to run operations without recording history
    const withoutHistory = (fn) => {
        skipHistory = true;
        try {
            fn();
        } finally {
            skipHistory = false;
        }
    };

    const UI = {
        setActivePanel: (p) => set('activePanel', p),
        togglePanel: () => set('isPanelOpen', !get('isPanelOpen')),
        openPanel: () => set('isPanelOpen', true),
        closePanel: () => set('isPanelOpen', false),
        setOffline: (o) => set('isOffline', o),
        toggleOffline: () => set('isOffline', !get('isOffline')),
        setLoading: (l) => set('isLoading', l)
    };

    const MapActions = {
        setZoom: (z) => set('zoom', Helpers.clamp(z, 5, 18)),
        zoomIn: () => MapActions.setZoom(get('zoom') + 1),
        zoomOut: () => MapActions.setZoom(get('zoom') - 1),
        setCenter: (c) => set('center', c),
        toggleLayer: (l) => { const layers = get('mapLayers'); set('mapLayers', { ...layers, [l]: !layers[l] }); },
        setMousePosition: (p) => set('mousePosition', p)
    };

    const Modal = {
        open: (type, data = null) => set('modal', { isOpen: true, type, data }),
        close: () => set('modal', { isOpen: false, type: null, data: null }),
        isOpen: () => get('modal').isOpen
    };

    async function init() {
        try {
            const wps = await Storage.Waypoints.getAll();
            set('waypoints', wps.length ? wps : Constants.SAMPLE_WAYPOINTS);
            const rts = await Storage.Routes.getAll();
            set('routes', rts.length ? rts : Constants.SAMPLE_ROUTES);
            // mapRegions is now managed by OfflineModule
            set('teamMembers', Constants.SAMPLE_TEAM);
            
            // Restore UI state that was previously lost on refresh
            const uiState = await Storage.Settings.get('uiState');
            if (uiState) {
                if (uiState.activePanel) set('activePanel', uiState.activePanel);
                if (uiState.isPanelOpen !== undefined) set('isPanelOpen', uiState.isPanelOpen);
                if (uiState.selectedVehicle) set('selectedVehicle', uiState.selectedVehicle);
                if (uiState.waypointFilter) set('waypointFilter', uiState.waypointFilter);
            }
            
            // Restore GPS navigation target (stored as waypoint ID string)
            const savedNavTarget = await Storage.Settings.get('gpsNavTarget');
            if (savedNavTarget) {
                // Verify the waypoint still exists before restoring nav
                const waypoints = get('waypoints');
                const targetExists = waypoints.some(wp => wp.id === savedNavTarget);
                if (targetExists) {
                    set('gpsNavTarget', savedNavTarget);
                }
            }
            
            // Auto-save UI state on change (debounced)
            let uiSaveTimer = null;
            subscribe(() => {
                clearTimeout(uiSaveTimer);
                uiSaveTimer = setTimeout(() => {
                    Storage.Settings.set('uiState', {
                        activePanel: get('activePanel'),
                        isPanelOpen: get('isPanelOpen'),
                        selectedVehicle: get('selectedVehicle'),
                        waypointFilter: get('waypointFilter')
                    });
                }, 500);
            }, ['activePanel', 'isPanelOpen', 'selectedVehicle', 'waypointFilter']);
            
            // Auto-save GPS nav target on change
            subscribe(() => {
                const target = get('gpsNavTarget');
                if (target) {
                    Storage.Settings.set('gpsNavTarget', target);
                } else {
                    Storage.Settings.set('gpsNavTarget', null);
                }
            }, ['gpsNavTarget']);
            
        } catch (e) {
            console.error('State init failed:', e);
            set('waypoints', Constants.SAMPLE_WAYPOINTS);
            set('routes', Constants.SAMPLE_ROUTES);
        }
    }

    async function persist() {
        try {
            await Storage.Waypoints.saveAll(get('waypoints'));
            await Storage.Routes.saveAll(get('routes'));
        } catch (e) { console.error('Persist failed:', e); }
    }

    return { get, set, subscribe, init, persist, Waypoints, Routes, UI, Map: MapActions, Modal, withoutHistory };
})();
window.State = State;
