/**
 * GridDown Undo/Redo Module
 * Implements command pattern for reversible actions
 */
const UndoModule = (function() {
    'use strict';

    // History stacks
    let undoStack = [];
    let redoStack = [];
    
    // Configuration
    const MAX_HISTORY = 50;  // Maximum undo steps to keep
    
    // Track initialization
    let initialized = false;
    let cleanupFunctions = [];
    
    // Action types
    const ActionTypes = {
        // Waypoints
        WAYPOINT_ADD: 'waypoint:add',
        WAYPOINT_DELETE: 'waypoint:delete',
        WAYPOINT_EDIT: 'waypoint:edit',
        WAYPOINT_MOVE: 'waypoint:move',
        
        // Routes
        ROUTE_ADD: 'route:add',
        ROUTE_DELETE: 'route:delete',
        ROUTE_EDIT: 'route:edit',
        ROUTE_POINT_ADD: 'route:point:add',
        ROUTE_POINT_DELETE: 'route:point:delete',
        
        // Bulk operations
        BULK_WAYPOINT_DELETE: 'waypoint:bulk:delete',
        BULK_ROUTE_DELETE: 'route:bulk:delete',
        
        // Import operations (for undoing imports)
        IMPORT_WAYPOINTS: 'import:waypoints',
        IMPORT_ROUTES: 'import:routes'
    };

    /**
     * Initialize the undo module
     */
    function init() {
        // Prevent double initialization
        if (initialized) {
            console.debug('UndoModule already initialized');
            return;
        }
        
        // Set up keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
        cleanupFunctions.push(() => document.removeEventListener('keydown', handleKeyboard));
        
        // Load any persisted history (optional, for session recovery)
        // loadHistory();
        
        initialized = true;
        console.log('UndoModule initialized');
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboard(e) {
        // Don't intercept when user is typing in an input field
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        // Ctrl+Z or Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Shift+Z or Cmd+Shift+Z for redo
        else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            redo();
        }
        // Ctrl+Y for redo (Windows style)
        else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
        }
    }

    /**
     * Push an action onto the undo stack
     * @param {string} type - Action type from ActionTypes
     * @param {object} data - Data needed to undo/redo the action
     */
    function pushAction(type, data) {
        const action = {
            type,
            data,
            timestamp: Date.now()
        };
        
        undoStack.push(action);
        
        // Clear redo stack when new action is performed
        redoStack = [];
        
        // Limit history size
        if (undoStack.length > MAX_HISTORY) {
            undoStack.shift();
        }
        
        // Notify UI to update undo/redo button states
        notifyStateChange();
        
        return action;
    }

    /**
     * Undo the last action
     */
    async function undo() {
        if (undoStack.length === 0) {
            showToast('Nothing to undo', 'info');
            return false;
        }
        
        const action = undoStack.pop();
        
        try {
            await executeUndo(action);
            redoStack.push(action);
            notifyStateChange();
            return true;
        } catch (e) {
            console.error('Undo failed:', e);
            // Put action back on stack if undo failed
            undoStack.push(action);
            showToast('Undo failed: ' + e.message, 'error');
            return false;
        }
    }

    /**
     * Redo the last undone action
     */
    async function redo() {
        if (redoStack.length === 0) {
            showToast('Nothing to redo', 'info');
            return false;
        }
        
        const action = redoStack.pop();
        
        try {
            await executeRedo(action);
            undoStack.push(action);
            notifyStateChange();
            return true;
        } catch (e) {
            console.error('Redo failed:', e);
            // Put action back on redo stack if redo failed
            redoStack.push(action);
            showToast('Redo failed: ' + e.message, 'error');
            return false;
        }
    }

    /**
     * Execute an undo operation
     */
    async function executeUndo(action) {
        switch (action.type) {
            case ActionTypes.WAYPOINT_ADD:
                // Undo add = delete
                await undoWaypointAdd(action.data);
                showToast('Waypoint creation undone', 'success');
                break;
                
            case ActionTypes.WAYPOINT_DELETE:
                // Undo delete = restore
                await undoWaypointDelete(action.data);
                showToast(`Restored "${action.data.waypoint.name}"`, 'success');
                break;
                
            case ActionTypes.WAYPOINT_EDIT:
                // Undo edit = restore previous state
                await undoWaypointEdit(action.data);
                showToast('Waypoint edit undone', 'success');
                break;
                
            case ActionTypes.WAYPOINT_MOVE:
                // Undo move = restore previous position
                await undoWaypointMove(action.data);
                showToast('Waypoint move undone', 'success');
                break;
                
            case ActionTypes.ROUTE_ADD:
                await undoRouteAdd(action.data);
                showToast('Route creation undone', 'success');
                break;
                
            case ActionTypes.ROUTE_DELETE:
                await undoRouteDelete(action.data);
                showToast(`Restored "${action.data.route.name}"`, 'success');
                break;
                
            case ActionTypes.ROUTE_EDIT:
                await undoRouteEdit(action.data);
                showToast('Route edit undone', 'success');
                break;
                
            case ActionTypes.BULK_WAYPOINT_DELETE:
                await undoBulkWaypointDelete(action.data);
                showToast(`Restored ${action.data.waypoints.length} waypoints`, 'success');
                break;
                
            case ActionTypes.BULK_ROUTE_DELETE:
                await undoBulkRouteDelete(action.data);
                showToast(`Restored ${action.data.routes.length} routes`, 'success');
                break;
                
            case ActionTypes.IMPORT_WAYPOINTS:
                await undoImportWaypoints(action.data);
                showToast(`Removed ${action.data.waypoints.length} imported waypoints`, 'success');
                break;
                
            case ActionTypes.IMPORT_ROUTES:
                await undoImportRoutes(action.data);
                showToast(`Removed ${action.data.routes.length} imported routes`, 'success');
                break;
                
            default:
                console.warn('Unknown action type:', action.type);
        }
        
        refreshUI();
    }

    /**
     * Execute a redo operation
     */
    async function executeRedo(action) {
        switch (action.type) {
            case ActionTypes.WAYPOINT_ADD:
                // Redo add = add again
                await redoWaypointAdd(action.data);
                showToast('Waypoint restored', 'success');
                break;
                
            case ActionTypes.WAYPOINT_DELETE:
                // Redo delete = delete again
                await redoWaypointDelete(action.data);
                showToast(`Deleted "${action.data.waypoint.name}"`, 'success');
                break;
                
            case ActionTypes.WAYPOINT_EDIT:
                await redoWaypointEdit(action.data);
                showToast('Waypoint edit restored', 'success');
                break;
                
            case ActionTypes.WAYPOINT_MOVE:
                await redoWaypointMove(action.data);
                showToast('Waypoint move restored', 'success');
                break;
                
            case ActionTypes.ROUTE_ADD:
                await redoRouteAdd(action.data);
                showToast('Route restored', 'success');
                break;
                
            case ActionTypes.ROUTE_DELETE:
                await redoRouteDelete(action.data);
                showToast(`Deleted "${action.data.route.name}"`, 'success');
                break;
                
            case ActionTypes.ROUTE_EDIT:
                await redoRouteEdit(action.data);
                showToast('Route edit restored', 'success');
                break;
                
            case ActionTypes.BULK_WAYPOINT_DELETE:
                await redoBulkWaypointDelete(action.data);
                showToast(`Deleted ${action.data.waypoints.length} waypoints`, 'success');
                break;
                
            case ActionTypes.BULK_ROUTE_DELETE:
                await redoBulkRouteDelete(action.data);
                showToast(`Deleted ${action.data.routes.length} routes`, 'success');
                break;
                
            case ActionTypes.IMPORT_WAYPOINTS:
                await redoImportWaypoints(action.data);
                showToast(`Re-imported ${action.data.waypoints.length} waypoints`, 'success');
                break;
                
            case ActionTypes.IMPORT_ROUTES:
                await redoImportRoutes(action.data);
                showToast(`Re-imported ${action.data.routes.length} routes`, 'success');
                break;
                
            default:
                console.warn('Unknown action type:', action.type);
        }
        
        refreshUI();
    }

    // ==========================================
    // Waypoint Operations
    // ==========================================

    async function undoWaypointAdd(data) {
        const waypoints = State.get('waypoints').filter(w => w.id !== data.waypoint.id);
        State.Waypoints.setAll(waypoints);
        await Storage.Waypoints.delete(data.waypoint.id);
    }

    async function redoWaypointAdd(data) {
        const waypoints = State.get('waypoints');
        State.Waypoints.setAll([...waypoints, data.waypoint]);
        await Storage.Waypoints.save(data.waypoint);
    }

    async function undoWaypointDelete(data) {
        const waypoints = State.get('waypoints');
        // Insert at original index if possible
        if (data.index !== undefined && data.index <= waypoints.length) {
            waypoints.splice(data.index, 0, data.waypoint);
            State.Waypoints.setAll([...waypoints]);
        } else {
            State.Waypoints.setAll([...waypoints, data.waypoint]);
        }
        await Storage.Waypoints.save(data.waypoint);
    }

    async function redoWaypointDelete(data) {
        const waypoints = State.get('waypoints').filter(w => w.id !== data.waypoint.id);
        State.Waypoints.setAll(waypoints);
        if (State.get('selectedWaypoint')?.id === data.waypoint.id) {
            State.Waypoints.select(null);
        }
        await Storage.Waypoints.delete(data.waypoint.id);
    }

    async function undoWaypointEdit(data) {
        const waypoints = State.get('waypoints').map(w => 
            w.id === data.waypoint.id ? data.previousState : w
        );
        State.Waypoints.setAll(waypoints);
        await Storage.Waypoints.save(data.previousState);
    }

    async function redoWaypointEdit(data) {
        const waypoints = State.get('waypoints').map(w => 
            w.id === data.waypoint.id ? data.waypoint : w
        );
        State.Waypoints.setAll(waypoints);
        await Storage.Waypoints.save(data.waypoint);
    }

    async function undoWaypointMove(data) {
        const waypoints = State.get('waypoints').map(w => {
            if (w.id === data.waypoint.id) {
                return { ...w, x: data.previousX, y: data.previousY, lat: data.previousLat, lon: data.previousLon };
            }
            return w;
        });
        State.Waypoints.setAll(waypoints);
        const wp = waypoints.find(w => w.id === data.waypoint.id);
        if (wp) await Storage.Waypoints.save(wp);
    }

    async function redoWaypointMove(data) {
        const waypoints = State.get('waypoints').map(w => {
            if (w.id === data.waypoint.id) {
                return { ...w, x: data.newX, y: data.newY, lat: data.newLat, lon: data.newLon };
            }
            return w;
        });
        State.Waypoints.setAll(waypoints);
        const wp = waypoints.find(w => w.id === data.waypoint.id);
        if (wp) await Storage.Waypoints.save(wp);
    }

    async function undoBulkWaypointDelete(data) {
        const waypoints = State.get('waypoints');
        State.Waypoints.setAll([...waypoints, ...data.waypoints]);
        for (const wp of data.waypoints) {
            await Storage.Waypoints.save(wp);
        }
    }

    async function redoBulkWaypointDelete(data) {
        const ids = new Set(data.waypoints.map(w => w.id));
        const waypoints = State.get('waypoints').filter(w => !ids.has(w.id));
        State.Waypoints.setAll(waypoints);
        for (const wp of data.waypoints) {
            await Storage.Waypoints.delete(wp.id);
        }
    }

    async function undoImportWaypoints(data) {
        const ids = new Set(data.waypoints.map(w => w.id));
        const waypoints = State.get('waypoints').filter(w => !ids.has(w.id));
        State.Waypoints.setAll(waypoints);
        for (const wp of data.waypoints) {
            await Storage.Waypoints.delete(wp.id);
        }
    }

    async function redoImportWaypoints(data) {
        const waypoints = State.get('waypoints');
        State.Waypoints.setAll([...waypoints, ...data.waypoints]);
        for (const wp of data.waypoints) {
            await Storage.Waypoints.save(wp);
        }
    }

    // ==========================================
    // Route Operations
    // ==========================================

    async function undoRouteAdd(data) {
        const routes = State.get('routes').filter(r => r.id !== data.route.id);
        State.Routes.setAll(routes);
        await Storage.Routes.delete(data.route.id);
    }

    async function redoRouteAdd(data) {
        const routes = State.get('routes');
        State.Routes.setAll([...routes, data.route]);
        await Storage.Routes.save(data.route);
    }

    async function undoRouteDelete(data) {
        const routes = State.get('routes');
        if (data.index !== undefined && data.index <= routes.length) {
            routes.splice(data.index, 0, data.route);
            State.Routes.setAll([...routes]);
        } else {
            State.Routes.setAll([...routes, data.route]);
        }
        await Storage.Routes.save(data.route);
    }

    async function redoRouteDelete(data) {
        const routes = State.get('routes').filter(r => r.id !== data.route.id);
        State.Routes.setAll(routes);
        if (State.get('selectedRoute')?.id === data.route.id) {
            State.Routes.select(null);
        }
        await Storage.Routes.delete(data.route.id);
    }

    async function undoRouteEdit(data) {
        const routes = State.get('routes').map(r => 
            r.id === data.route.id ? data.previousState : r
        );
        State.Routes.setAll(routes);
        await Storage.Routes.save(data.previousState);
    }

    async function redoRouteEdit(data) {
        const routes = State.get('routes').map(r => 
            r.id === data.route.id ? data.route : r
        );
        State.Routes.setAll(routes);
        await Storage.Routes.save(data.route);
    }

    async function undoBulkRouteDelete(data) {
        const routes = State.get('routes');
        State.Routes.setAll([...routes, ...data.routes]);
        for (const route of data.routes) {
            await Storage.Routes.save(route);
        }
    }

    async function redoBulkRouteDelete(data) {
        const ids = new Set(data.routes.map(r => r.id));
        const routes = State.get('routes').filter(r => !ids.has(r.id));
        State.Routes.setAll(routes);
        for (const route of data.routes) {
            await Storage.Routes.delete(route.id);
        }
    }

    async function undoImportRoutes(data) {
        const ids = new Set(data.routes.map(r => r.id));
        const routes = State.get('routes').filter(r => !ids.has(r.id));
        State.Routes.setAll(routes);
        for (const route of data.routes) {
            await Storage.Routes.delete(route.id);
        }
    }

    async function redoImportRoutes(data) {
        const routes = State.get('routes');
        State.Routes.setAll([...routes, ...data.routes]);
        for (const route of data.routes) {
            await Storage.Routes.save(route);
        }
    }

    // ==========================================
    // Convenience Methods for Recording Actions
    // ==========================================

    /**
     * Record a waypoint being added
     */
    function recordWaypointAdd(waypoint) {
        return pushAction(ActionTypes.WAYPOINT_ADD, { waypoint: { ...waypoint } });
    }

    /**
     * Record a waypoint being deleted
     */
    function recordWaypointDelete(waypoint, index) {
        return pushAction(ActionTypes.WAYPOINT_DELETE, { 
            waypoint: { ...waypoint },
            index 
        });
    }

    /**
     * Record a waypoint being edited
     */
    function recordWaypointEdit(waypoint, previousState) {
        return pushAction(ActionTypes.WAYPOINT_EDIT, { 
            waypoint: { ...waypoint },
            previousState: { ...previousState }
        });
    }

    /**
     * Record a waypoint being moved
     */
    function recordWaypointMove(waypoint, previousX, previousY, previousLat, previousLon, newX, newY, newLat, newLon) {
        return pushAction(ActionTypes.WAYPOINT_MOVE, {
            waypoint: { ...waypoint },
            previousX, previousY, previousLat, previousLon,
            newX, newY, newLat, newLon
        });
    }

    /**
     * Record a route being added
     */
    function recordRouteAdd(route) {
        return pushAction(ActionTypes.ROUTE_ADD, { route: { ...route } });
    }

    /**
     * Record a route being deleted
     */
    function recordRouteDelete(route, index) {
        return pushAction(ActionTypes.ROUTE_DELETE, { 
            route: { ...route },
            index 
        });
    }

    /**
     * Record a route being edited
     */
    function recordRouteEdit(route, previousState) {
        return pushAction(ActionTypes.ROUTE_EDIT, { 
            route: { ...route },
            previousState: { ...previousState }
        });
    }

    /**
     * Record multiple waypoints being deleted
     */
    function recordBulkWaypointDelete(waypoints) {
        return pushAction(ActionTypes.BULK_WAYPOINT_DELETE, { 
            waypoints: waypoints.map(w => ({ ...w }))
        });
    }

    /**
     * Record multiple routes being deleted
     */
    function recordBulkRouteDelete(routes) {
        return pushAction(ActionTypes.BULK_ROUTE_DELETE, { 
            routes: routes.map(r => ({ ...r }))
        });
    }

    /**
     * Record waypoints being imported
     */
    function recordImportWaypoints(waypoints) {
        return pushAction(ActionTypes.IMPORT_WAYPOINTS, { 
            waypoints: waypoints.map(w => ({ ...w }))
        });
    }

    /**
     * Record routes being imported
     */
    function recordImportRoutes(routes) {
        return pushAction(ActionTypes.IMPORT_ROUTES, { 
            routes: routes.map(r => ({ ...r }))
        });
    }

    // ==========================================
    // UI Helpers
    // ==========================================

    function showToast(message, type) {
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showToast) {
            ModalsModule.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    function refreshUI() {
        // Refresh panels if available
        if (typeof PanelsModule !== 'undefined' && PanelsModule.render) {
            PanelsModule.render();
        }
        // Refresh map if available
        if (typeof MapModule !== 'undefined' && MapModule.render) {
            MapModule.render();
        }
        // Persist state
        if (typeof State !== 'undefined' && State.persist) {
            State.persist();
        }
    }

    function notifyStateChange() {
        // Emit event for UI components to update their undo/redo buttons
        if (typeof Events !== 'undefined') {
            Events.emit('undo:stateChange', {
                canUndo: undoStack.length > 0,
                canRedo: redoStack.length > 0,
                undoCount: undoStack.length,
                redoCount: redoStack.length,
                lastAction: undoStack.length > 0 ? undoStack[undoStack.length - 1] : null
            });
        }
    }

    // ==========================================
    // State Access
    // ==========================================

    /**
     * Check if undo is available
     */
    function canUndo() {
        return undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    function canRedo() {
        return redoStack.length > 0;
    }

    /**
     * Get the description of the last undoable action
     */
    function getUndoDescription() {
        if (undoStack.length === 0) return null;
        const action = undoStack[undoStack.length - 1];
        return describeAction(action);
    }

    /**
     * Get the description of the last redoable action
     */
    function getRedoDescription() {
        if (redoStack.length === 0) return null;
        const action = redoStack[redoStack.length - 1];
        return describeAction(action);
    }

    /**
     * Get human-readable description of an action
     */
    function describeAction(action) {
        switch (action.type) {
            case ActionTypes.WAYPOINT_ADD:
                return `Add waypoint "${action.data.waypoint.name}"`;
            case ActionTypes.WAYPOINT_DELETE:
                return `Delete waypoint "${action.data.waypoint.name}"`;
            case ActionTypes.WAYPOINT_EDIT:
                return `Edit waypoint "${action.data.waypoint.name}"`;
            case ActionTypes.WAYPOINT_MOVE:
                return `Move waypoint "${action.data.waypoint.name}"`;
            case ActionTypes.ROUTE_ADD:
                return `Add route "${action.data.route.name}"`;
            case ActionTypes.ROUTE_DELETE:
                return `Delete route "${action.data.route.name}"`;
            case ActionTypes.ROUTE_EDIT:
                return `Edit route "${action.data.route.name}"`;
            case ActionTypes.BULK_WAYPOINT_DELETE:
                return `Delete ${action.data.waypoints.length} waypoints`;
            case ActionTypes.BULK_ROUTE_DELETE:
                return `Delete ${action.data.routes.length} routes`;
            case ActionTypes.IMPORT_WAYPOINTS:
                return `Import ${action.data.waypoints.length} waypoints`;
            case ActionTypes.IMPORT_ROUTES:
                return `Import ${action.data.routes.length} routes`;
            default:
                return 'Unknown action';
        }
    }

    /**
     * Clear all history
     */
    function clearHistory() {
        undoStack = [];
        redoStack = [];
        notifyStateChange();
    }

    /**
     * Get current state for debugging
     */
    function getState() {
        return {
            undoStack: [...undoStack],
            redoStack: [...redoStack],
            canUndo: canUndo(),
            canRedo: canRedo()
        };
    }

    // Public API
    return {
        init,
        
        // Core operations
        undo,
        redo,
        pushAction,
        clearHistory,
        
        // Recording helpers
        recordWaypointAdd,
        recordWaypointDelete,
        recordWaypointEdit,
        recordWaypointMove,
        recordRouteAdd,
        recordRouteDelete,
        recordRouteEdit,
        recordBulkWaypointDelete,
        recordBulkRouteDelete,
        recordImportWaypoints,
        recordImportRoutes,
        
        // State access
        canUndo,
        canRedo,
        getUndoDescription,
        getRedoDescription,
        getState,
        
        // Action types (for external use)
        ActionTypes
    };
})();

window.UndoModule = UndoModule;
