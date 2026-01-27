/**
 * GridDown Meshtastic Module - Off-Grid Mesh Communication
 * Provides Web Bluetooth/Serial connectivity to Meshtastic devices for:
 * - Real-time team position sharing
 * - Encrypted text messaging
 * - Waypoint/route sharing
 * - Emergency beacons
 * 
 * Meshtastic Protocol Reference: https://meshtastic.org/docs/development/device/
 */
const MeshtasticModule = (function() {
    'use strict';

    // =========================================================================
    // CONSTANTS
    // =========================================================================
    
    // Meshtastic BLE Service UUIDs
    const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
    const TORADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';  // Write to device
    const FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002'; // Read from device
    const FROMNUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453';   // Notifications
    
    // Connection states
    const ConnectionState = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        ERROR: 'error'
    };
    
    // Message types (simplified - real Meshtastic uses protobuf)
    const MessageType = {
        POSITION: 'position',
        TEXT: 'text',
        NODEINFO: 'nodeinfo',
        TELEMETRY: 'telemetry',
        WAYPOINT: 'waypoint',
        ROUTE: 'route',
        SOS: 'sos',
        CHECKIN: 'checkin',
        ACK: 'ack'
    };
    
    // Position update interval (ms)
    const POSITION_BROADCAST_INTERVAL = 60000; // 1 minute
    const STALE_THRESHOLD = 300000; // 5 minutes
    const OFFLINE_THRESHOLD = 900000; // 15 minutes
    
    // Message size limits (Meshtastic has ~237 byte payload limit)
    const MAX_MESSAGE_SIZE = 200;
    const MAX_CHUNK_SIZE = 180;

    // =========================================================================
    // STATE
    // =========================================================================
    
    let state = {
        connectionState: ConnectionState.DISCONNECTED,
        connectionType: null, // 'bluetooth' or 'serial'
        device: null,
        characteristic: null,
        port: null,
        reader: null,
        writer: null,
        
        // Node information
        myNodeNum: null,
        myNodeId: null,
        longName: 'GridDown User',
        shortName: 'GDU',
        
        // Team tracking
        nodes: new Map(), // nodeNum -> nodeInfo
        messages: [],     // Message history
        
        // Intervals (no longer needed - using EventManager)
        positionInterval: null,
        statusInterval: null,
        
        // Callbacks
        onMessage: null,
        onPositionUpdate: null,
        onConnectionChange: null,
        onNodeUpdate: null
    };

    // Scoped event manager for cleanup
    let meshEvents = null;
    
    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize the Meshtastic module
     */
    function init() {
        console.log('MeshtasticModule initializing...');
        
        // Create scoped event manager
        meshEvents = EventManager.createScopedManager(EventManager.SCOPES.MESHTASTIC);
        
        // Check for Web Bluetooth/Serial support
        checkApiSupport();
        
        // Start status update interval with tracking
        meshEvents.setInterval(updateNodeStatuses, 30000);
        
        // Load saved settings
        loadSettings();
        
        console.log('MeshtasticModule ready');
    }
    
    /**
     * Cleanup Meshtastic module resources
     */
    function destroy() {
        // Disconnect if connected
        if (state.connectionState === ConnectionState.CONNECTED) {
            disconnect();
        }
        
        // Clear all tracked intervals and listeners
        if (meshEvents) {
            meshEvents.clear();
            meshEvents = null;
        }
        
        console.log('MeshtasticModule destroyed');
    }
    
    /**
     * Check browser API support
     * Result is cached since API availability never changes during a session
     */
    let _cachedApiSupport = null;
    
    function checkApiSupport() {
        if (_cachedApiSupport === null) {
            _cachedApiSupport = {
                bluetooth: 'bluetooth' in navigator,
                serial: 'serial' in navigator
            };
            // Log once on first check
            console.log('Meshtastic API support:', _cachedApiSupport);
        }
        return _cachedApiSupport;
    }
    
    /**
     * Load saved settings from storage
     */
    async function loadSettings() {
        try {
            const saved = await Storage.Settings.get('meshtastic');
            if (saved) {
                state.longName = saved.longName || state.longName;
                state.shortName = saved.shortName || state.shortName;
                state.myNodeId = saved.nodeId || null;
            }
        } catch (e) {
            console.warn('Could not load Meshtastic settings:', e);
        }
    }
    
    /**
     * Save settings to storage
     */
    async function saveSettings() {
        try {
            await Storage.Settings.set('meshtastic', {
                longName: state.longName,
                shortName: state.shortName,
                nodeId: state.myNodeId
            });
        } catch (e) {
            console.warn('Could not save Meshtastic settings:', e);
        }
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================
    
    /**
     * Connect to Meshtastic device via Web Bluetooth
     */
    async function connectBluetooth() {
        // Check browser compatibility first
        if (typeof CompatibilityModule !== 'undefined') {
            if (!CompatibilityModule.requireFeature('webBluetooth', true)) {
                throw new Error('Web Bluetooth not supported on this browser.');
            }
        }
        
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth not supported. Use Chrome or Edge.');
        }
        
        setConnectionState(ConnectionState.CONNECTING);
        
        try {
            // Request device
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [MESHTASTIC_SERVICE_UUID] }],
                optionalServices: [MESHTASTIC_SERVICE_UUID]
            });
            
            console.log('Bluetooth device selected:', device.name);
            state.device = device;
            
            // Connect to GATT server
            device.addEventListener('gattserverdisconnected', onDisconnected);
            const server = await device.gatt.connect();
            
            // Get Meshtastic service
            const service = await server.getPrimaryService(MESHTASTIC_SERVICE_UUID);
            
            // Get characteristics
            const fromRadio = await service.getCharacteristic(FROMRADIO_UUID);
            const toRadio = await service.getCharacteristic(TORADIO_UUID);
            const fromNum = await service.getCharacteristic(FROMNUM_UUID);
            
            state.characteristic = {
                fromRadio,
                toRadio,
                fromNum
            };
            
            // Start notifications
            await fromNum.startNotifications();
            fromNum.addEventListener('characteristicvaluechanged', onBleDataReceived);
            
            state.connectionType = 'bluetooth';
            setConnectionState(ConnectionState.CONNECTED);
            
            // Request node info
            await requestNodeInfo();
            
            // Start position broadcasting
            startPositionBroadcast();
            
            return true;
            
        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            setConnectionState(ConnectionState.ERROR);
            throw error;
        }
    }
    
    /**
     * Connect to Meshtastic device via Web Serial
     */
    async function connectSerial() {
        // Check browser compatibility first
        if (typeof CompatibilityModule !== 'undefined') {
            if (!CompatibilityModule.requireFeature('webSerial', true)) {
                throw new Error('Web Serial not supported on this browser.');
            }
        }
        
        if (!navigator.serial) {
            throw new Error('Web Serial not supported. Use Chrome or Edge.');
        }
        
        setConnectionState(ConnectionState.CONNECTING);
        
        try {
            // Request port
            const port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x1A86 }, // CH340
                    { usbVendorId: 0x10C4 }, // CP2102
                    { usbVendorId: 0x0403 }, // FTDI
                    { usbVendorId: 0x303A }  // ESP32-S3
                ]
            });
            
            // Open port
            await port.open({ 
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });
            
            state.port = port;
            state.reader = port.readable.getReader();
            state.writer = port.writable.getWriter();
            
            state.connectionType = 'serial';
            setConnectionState(ConnectionState.CONNECTED);
            
            // Start reading
            readSerialLoop();
            
            // Request node info
            await requestNodeInfo();
            
            // Start position broadcasting
            startPositionBroadcast();
            
            return true;
            
        } catch (error) {
            console.error('Serial connection failed:', error);
            setConnectionState(ConnectionState.ERROR);
            throw error;
        }
    }
    
    /**
     * Disconnect from device
     */
    async function disconnect() {
        stopPositionBroadcast();
        
        if (state.connectionType === 'bluetooth' && state.device?.gatt?.connected) {
            state.device.gatt.disconnect();
        }
        
        if (state.connectionType === 'serial') {
            if (state.reader) {
                await state.reader.cancel();
                state.reader.releaseLock();
            }
            if (state.writer) {
                await state.writer.close();
            }
            if (state.port) {
                await state.port.close();
            }
        }
        
        state.device = null;
        state.port = null;
        state.reader = null;
        state.writer = null;
        state.characteristic = null;
        
        setConnectionState(ConnectionState.DISCONNECTED);
    }
    
    /**
     * Handle disconnection event
     */
    function onDisconnected(event) {
        console.log('Meshtastic device disconnected');
        state.device = null;
        state.characteristic = null;
        setConnectionState(ConnectionState.DISCONNECTED);
        stopPositionBroadcast();
    }
    
    /**
     * Set connection state and notify listeners
     */
    function setConnectionState(newState) {
        const oldState = state.connectionState;
        state.connectionState = newState;
        
        if (state.onConnectionChange) {
            state.onConnectionChange(newState, oldState);
        }
        
        // Update UI via events
        Events.emit('meshtastic:connection', { state: newState, type: state.connectionType });
    }

    // =========================================================================
    // DATA TRANSMISSION
    // =========================================================================
    
    /**
     * Send data to device
     */
    async function sendToDevice(data) {
        if (state.connectionState !== ConnectionState.CONNECTED) {
            throw new Error('Not connected to Meshtastic device');
        }
        
        const encoded = encodeMessage(data);
        
        if (state.connectionType === 'bluetooth') {
            await state.characteristic.toRadio.writeValue(encoded);
        } else if (state.connectionType === 'serial') {
            await state.writer.write(encoded);
        }
    }
    
    /**
     * Encode message for transmission
     * Note: Real Meshtastic uses Protocol Buffers. This is a simplified text-based format
     * for demonstration. Production would use @meshtastic/js library.
     */
    function encodeMessage(data) {
        const json = JSON.stringify(data);
        const header = new Uint8Array([0x94, 0xC3]); // Meshtastic magic bytes
        const length = new Uint8Array([(json.length >> 8) & 0xFF, json.length & 0xFF]);
        const payload = new TextEncoder().encode(json);
        
        const combined = new Uint8Array(header.length + length.length + payload.length);
        combined.set(header, 0);
        combined.set(length, header.length);
        combined.set(payload, header.length + length.length);
        
        return combined;
    }
    
    /**
     * Decode received message
     */
    function decodeMessage(data) {
        try {
            // Skip magic bytes and length
            const payload = data.slice(4);
            const json = new TextDecoder().decode(payload);
            return JSON.parse(json);
        } catch (e) {
            console.warn('Failed to decode message:', e);
            return null;
        }
    }
    
    /**
     * Handle BLE data received
     */
    function onBleDataReceived(event) {
        const data = new Uint8Array(event.target.value.buffer);
        processReceivedData(data);
    }
    
    /**
     * Serial read loop
     */
    async function readSerialLoop() {
        const buffer = [];
        
        try {
            while (state.connectionState === ConnectionState.CONNECTED && state.reader) {
                const { value, done } = await state.reader.read();
                if (done) break;
                
                // Add to buffer
                buffer.push(...value);
                
                // Process complete packets
                while (buffer.length >= 4) {
                    // Check for magic bytes
                    if (buffer[0] !== 0x94 || buffer[1] !== 0xC3) {
                        buffer.shift();
                        continue;
                    }
                    
                    const length = (buffer[2] << 8) | buffer[3];
                    if (buffer.length < 4 + length) break;
                    
                    const packet = new Uint8Array(buffer.splice(0, 4 + length));
                    processReceivedData(packet);
                }
            }
        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error('Serial read error:', e);
            }
        }
    }
    
    /**
     * Process received data packet
     */
    function processReceivedData(data) {
        const message = decodeMessage(data);
        if (!message) return;
        
        console.log('Meshtastic message received:', message);
        
        switch (message.type) {
            case MessageType.POSITION:
                handlePositionUpdate(message);
                break;
            case MessageType.NODEINFO:
                handleNodeInfo(message);
                break;
            case MessageType.TEXT:
                handleTextMessage(message);
                break;
            case MessageType.WAYPOINT:
                handleWaypointShare(message);
                break;
            case MessageType.ROUTE:
                handleRouteShare(message);
                break;
            case MessageType.SOS:
                handleSOS(message);
                break;
            case MessageType.CHECKIN:
                handleCheckin(message);
                break;
            case MessageType.TELEMETRY:
                handleTelemetry(message);
                break;
            case MessageType.ACK:
                handleAck(message);
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
        
        if (state.onMessage) {
            state.onMessage(message);
        }
    }

    // =========================================================================
    // POSITION TRACKING
    // =========================================================================
    
    /**
     * Start broadcasting position
     */
    function startPositionBroadcast() {
        if (state.positionInterval) return;
        
        // Broadcast immediately
        broadcastPosition();
        
        // Then periodically - use EventManager for tracking
        state.positionInterval = meshEvents.setInterval(broadcastPosition, POSITION_BROADCAST_INTERVAL);
    }
    
    /**
     * Stop broadcasting position
     */
    function stopPositionBroadcast() {
        if (state.positionInterval) {
            meshEvents.clearInterval(state.positionInterval);
            state.positionInterval = null;
        }
    }
    
    /**
     * Broadcast current position
     */
    async function broadcastPosition() {
        if (state.connectionState !== ConnectionState.CONNECTED) return;
        
        try {
            // Get current GPS position
            const position = await getCurrentPosition();
            if (!position) return;
            
            const message = {
                type: MessageType.POSITION,
                nodeId: state.myNodeId,
                nodeName: state.shortName,
                lat: position.latitude,
                lon: position.longitude,
                alt: position.altitude || 0,
                accuracy: position.accuracy,
                timestamp: Date.now()
            };
            
            await sendToDevice(message);
            console.log('Position broadcast sent');
            
        } catch (e) {
            console.warn('Failed to broadcast position:', e);
        }
    }
    
    /**
     * Get current GPS position (checks GPSModule first, including manual position)
     */
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            // First check GPSModule for existing position (including manual)
            if (typeof GPSModule !== 'undefined') {
                const gpsPos = GPSModule.getPosition();
                if (gpsPos && gpsPos.lat && gpsPos.lon) {
                    resolve({
                        latitude: gpsPos.lat,
                        longitude: gpsPos.lon,
                        altitude: gpsPos.altitude || null,
                        accuracy: null,
                        isManual: gpsPos.isManual || false
                    });
                    return;
                }
            }
            
            // Fallback to browser geolocation
            if (!navigator.geolocation) {
                reject(new Error('No position available. Try setting manual position.'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    altitude: pos.coords.altitude,
                    accuracy: pos.coords.accuracy,
                    isManual: false
                }),
                (err) => reject(new Error(err.message + '. Try setting manual position.')),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
            );
        });
    }
    
    /**
     * Handle position update from another node
     */
    function handlePositionUpdate(message) {
        const nodeId = message.nodeId || message.from;
        
        // Get or create node entry
        let node = state.nodes.get(nodeId);
        if (!node) {
            node = {
                id: nodeId,
                name: message.nodeName || `Node-${nodeId?.slice(-4) || 'Unknown'}`,
                shortName: message.nodeName || '???'
            };
            state.nodes.set(nodeId, node);
        }
        
        // Update position
        node.lat = message.lat;
        node.lon = message.lon;
        node.alt = message.alt;
        node.accuracy = message.accuracy;
        node.lastSeen = Date.now();
        node.status = 'active';
        
        // Update team members in State
        updateTeamMembers();
        
        if (state.onPositionUpdate) {
            state.onPositionUpdate(node);
        }
        
        Events.emit('meshtastic:position', { node });
    }
    
    /**
     * Handle node info message
     */
    function handleNodeInfo(message) {
        const nodeId = message.nodeId || message.from;
        
        let node = state.nodes.get(nodeId);
        if (!node) {
            node = { id: nodeId };
            state.nodes.set(nodeId, node);
        }
        
        node.name = message.longName || node.name;
        node.shortName = message.shortName || node.shortName;
        node.hwModel = message.hwModel;
        node.macAddr = message.macAddr;
        node.lastSeen = Date.now();
        
        if (message.isMe) {
            state.myNodeNum = message.nodeNum;
            state.myNodeId = nodeId;
        }
        
        updateTeamMembers();
        
        if (state.onNodeUpdate) {
            state.onNodeUpdate(node);
        }
        
        Events.emit('meshtastic:nodeinfo', { node });
    }
    
    /**
     * Update node statuses based on last seen time
     */
    function updateNodeStatuses() {
        const now = Date.now();
        let changed = false;
        
        state.nodes.forEach((node, nodeId) => {
            const age = now - (node.lastSeen || 0);
            let newStatus;
            
            if (age < STALE_THRESHOLD) {
                newStatus = 'active';
            } else if (age < OFFLINE_THRESHOLD) {
                newStatus = 'stale';
            } else {
                newStatus = 'offline';
            }
            
            if (node.status !== newStatus) {
                node.status = newStatus;
                changed = true;
            }
        });
        
        if (changed) {
            updateTeamMembers();
        }
    }
    
    /**
     * Update State.teamMembers from our node tracking
     */
    function updateTeamMembers() {
        const members = [];
        
        // Add self first
        members.push({
            id: state.myNodeId || 'self',
            name: `${state.longName} (You)`,
            shortName: state.shortName,
            status: 'active',
            lastUpdate: 'Now',
            lat: 0,
            lon: 0,
            isMe: true
        });
        
        // Add other nodes
        state.nodes.forEach((node, nodeId) => {
            if (nodeId === state.myNodeId) return;
            
            const lastSeen = node.lastSeen ? formatLastSeen(node.lastSeen) : 'Unknown';
            
            members.push({
                id: nodeId,
                name: node.name || `Node-${nodeId?.slice(-4) || 'Unknown'}`,
                shortName: node.shortName || '???',
                status: node.status || 'offline',
                lastUpdate: lastSeen,
                lat: node.lat || 0,
                lon: node.lon || 0,
                alt: node.alt,
                accuracy: node.accuracy,
                isMe: false
            });
        });
        
        State.set('teamMembers', members);
    }
    
    /**
     * Format last seen timestamp
     */
    function formatLastSeen(timestamp) {
        const age = Date.now() - timestamp;
        
        if (age < 60000) return 'Just now';
        if (age < 120000) return '1 min ago';
        if (age < 3600000) return `${Math.floor(age / 60000)} min ago`;
        if (age < 7200000) return '1 hour ago';
        if (age < 86400000) return `${Math.floor(age / 3600000)} hours ago`;
        return 'Over a day ago';
    }
    
    /**
     * Request node info from device
     */
    async function requestNodeInfo() {
        await sendToDevice({
            type: 'request_nodeinfo'
        });
    }

    // =========================================================================
    // MESSAGING
    // =========================================================================
    
    /**
     * Send text message
     */
    async function sendTextMessage(text, to = null) {
        if (!text || text.length === 0) return;
        
        // Truncate if needed
        if (text.length > MAX_MESSAGE_SIZE) {
            text = text.substring(0, MAX_MESSAGE_SIZE);
        }
        
        const message = {
            type: MessageType.TEXT,
            from: state.myNodeId,
            fromName: state.shortName,
            to: to, // null = broadcast
            text: text,
            timestamp: Date.now(),
            id: generateMessageId()
        };
        
        // Store locally
        addMessageToHistory(message, true);
        
        // Send to mesh
        await sendToDevice(message);
        
        return message;
    }
    
    /**
     * Handle received text message
     */
    function handleTextMessage(message) {
        // Avoid duplicates
        if (state.messages.some(m => m.id === message.id)) return;
        
        addMessageToHistory(message, false);
        
        // Show notification
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`📨 ${message.fromName}: ${message.text.substring(0, 50)}...`, 'info');
        }
        
        Events.emit('meshtastic:message', { message });
    }
    
    /**
     * Add message to history
     */
    function addMessageToHistory(message, isSent) {
        state.messages.push({
            ...message,
            isSent,
            receivedAt: Date.now()
        });
        
        // Limit history
        if (state.messages.length > 100) {
            state.messages = state.messages.slice(-100);
        }
        
        Events.emit('meshtastic:messages_updated', { messages: state.messages });
    }
    
    /**
     * Get message history
     */
    function getMessages() {
        return [...state.messages];
    }
    
    /**
     * Generate unique message ID
     */
    function generateMessageId() {
        return `${state.myNodeId || 'local'}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }

    // =========================================================================
    // WAYPOINT & ROUTE SHARING
    // =========================================================================
    
    /**
     * Share a waypoint via mesh
     */
    async function shareWaypoint(waypoint) {
        const message = {
            type: MessageType.WAYPOINT,
            from: state.myNodeId,
            fromName: state.shortName,
            waypoint: {
                id: waypoint.id,
                name: waypoint.name,
                type: waypoint.type,
                lat: waypoint.lat || (37.4215 + (waypoint.y - 50) * 0.002),
                lon: waypoint.lon || (-119.1892 + (waypoint.x - 50) * 0.004),
                notes: waypoint.notes ? waypoint.notes.substring(0, 100) : '',
                icon: waypoint.icon
            },
            timestamp: Date.now()
        };
        
        await sendToDevice(message);
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`📍 Shared waypoint: ${waypoint.name}`, 'success');
        }
        
        return message;
    }
    
    /**
     * Handle received waypoint
     */
    function handleWaypointShare(message) {
        const wp = message.waypoint;
        if (!wp) return;
        
        // Convert to GridDown format
        const waypoint = {
            id: `mesh-${wp.id || Date.now()}`,
            name: wp.name || 'Shared Waypoint',
            type: wp.type || 'custom',
            lat: wp.lat,
            lon: wp.lon,
            x: lonToX(wp.lon),
            y: latToY(wp.lat),
            notes: `${wp.notes || ''}\n[Shared by ${message.fromName} via Meshtastic]`,
            verified: false,
            source: 'meshtastic',
            sharedBy: message.fromName,
            sharedAt: message.timestamp
        };
        
        // Add to state (prompt user first in production)
        const waypoints = State.get('waypoints');
        if (!waypoints.some(w => w.id === waypoint.id)) {
            State.Waypoints.add(waypoint);
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`📍 Received waypoint: ${waypoint.name} from ${message.fromName}`, 'success');
            }
        }
        
        Events.emit('meshtastic:waypoint', { waypoint, from: message.fromName });
    }
    
    /**
     * Share a route via mesh (chunked for bandwidth)
     */
    async function shareRoute(route) {
        // Compress route data
        const routeData = {
            id: route.id,
            name: route.name,
            points: route.points.map(p => ({
                lat: p.lat,
                lon: p.lon,
                t: p.terrain ? p.terrain[0] : 'r' // Single char for terrain
            })),
            distance: route.distance,
            duration: route.duration
        };
        
        const json = JSON.stringify(routeData);
        
        // If small enough, send as single message
        if (json.length <= MAX_MESSAGE_SIZE) {
            await sendToDevice({
                type: MessageType.ROUTE,
                from: state.myNodeId,
                fromName: state.shortName,
                route: routeData,
                chunk: 0,
                totalChunks: 1,
                timestamp: Date.now()
            });
        } else {
            // Chunk the data
            const chunks = [];
            for (let i = 0; i < json.length; i += MAX_CHUNK_SIZE) {
                chunks.push(json.substring(i, i + MAX_CHUNK_SIZE));
            }
            
            const routeId = `route-${Date.now()}`;
            for (let i = 0; i < chunks.length; i++) {
                await sendToDevice({
                    type: MessageType.ROUTE,
                    from: state.myNodeId,
                    fromName: state.shortName,
                    routeId: routeId,
                    data: chunks[i],
                    chunk: i,
                    totalChunks: chunks.length,
                    timestamp: Date.now()
                });
                
                // Small delay between chunks
                await sleep(500);
            }
        }
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`🛤️ Shared route: ${route.name}`, 'success');
        }
    }
    
    // Route chunk assembly buffer
    const routeChunks = new Map();
    
    /**
     * Handle received route
     */
    function handleRouteShare(message) {
        if (message.route && message.totalChunks === 1) {
            // Single message route
            processReceivedRoute(message.route, message.fromName);
        } else if (message.routeId && message.data) {
            // Chunked route
            const key = `${message.from}-${message.routeId}`;
            
            if (!routeChunks.has(key)) {
                routeChunks.set(key, {
                    chunks: new Array(message.totalChunks).fill(null),
                    fromName: message.fromName,
                    timestamp: Date.now()
                });
            }
            
            const buffer = routeChunks.get(key);
            buffer.chunks[message.chunk] = message.data;
            
            // Check if complete
            if (buffer.chunks.every(c => c !== null)) {
                const json = buffer.chunks.join('');
                try {
                    const routeData = JSON.parse(json);
                    processReceivedRoute(routeData, buffer.fromName);
                } catch (e) {
                    console.error('Failed to parse chunked route:', e);
                }
                routeChunks.delete(key);
            }
        }
    }
    
    /**
     * Process fully received route
     */
    function processReceivedRoute(routeData, fromName) {
        // Convert to GridDown format
        const route = {
            id: `mesh-${routeData.id || Date.now()}`,
            name: routeData.name || 'Shared Route',
            points: (routeData.points || []).map(p => ({
                lat: p.lat,
                lon: p.lon,
                x: lonToX(p.lon),
                y: latToY(p.lat),
                terrain: expandTerrain(p.t)
            })),
            distance: routeData.distance || '0',
            duration: routeData.duration || '0h',
            elevation: routeData.elevation || '0',
            source: 'meshtastic',
            sharedBy: fromName,
            notes: `[Shared by ${fromName} via Meshtastic]`
        };
        
        // Add to state
        const routes = State.get('routes');
        if (!routes.some(r => r.id === route.id)) {
            State.Routes.add(route);
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`🛤️ Received route: ${route.name} from ${fromName}`, 'success');
            }
        }
        
        Events.emit('meshtastic:route', { route, from: fromName });
    }
    
    // Helper to expand single-char terrain
    function expandTerrain(t) {
        const map = { h: 'highway', r: 'road', t: 'trail', c: 'crawl' };
        return map[t] || 'road';
    }

    // =========================================================================
    // EMERGENCY FEATURES
    // =========================================================================
    
    /**
     * Send SOS emergency broadcast
     */
    async function sendSOS(details = {}) {
        let position;
        try {
            position = await getCurrentPosition();
        } catch (e) {
            console.warn('Could not get GPS for SOS');
        }
        
        const message = {
            type: MessageType.SOS,
            from: state.myNodeId,
            fromName: state.longName,
            lat: position?.latitude,
            lon: position?.longitude,
            alt: position?.altitude,
            emergency: true,
            details: {
                situation: details.situation || 'Emergency',
                injuries: details.injuries || 'Unknown',
                people: details.people || 1,
                supplies: details.supplies || 'Unknown',
                message: details.message || ''
            },
            timestamp: Date.now()
        };
        
        // Send multiple times for reliability
        for (let i = 0; i < 3; i++) {
            await sendToDevice(message);
            await sleep(2000);
        }
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('🆘 SOS BROADCAST SENT', 'error');
        }
        
        Events.emit('meshtastic:sos_sent', { message });
        
        return message;
    }
    
    /**
     * Handle received SOS
     */
    function handleSOS(message) {
        console.warn('SOS RECEIVED:', message);
        
        // Create emergency waypoint
        if (message.lat && message.lon) {
            const waypoint = {
                id: `sos-${message.from}-${Date.now()}`,
                name: `🆘 SOS: ${message.fromName}`,
                type: 'hazard',
                lat: message.lat,
                lon: message.lon,
                x: lonToX(message.lon),
                y: latToY(message.lat),
                notes: `EMERGENCY from ${message.fromName}\n` +
                       `Situation: ${message.details?.situation || 'Unknown'}\n` +
                       `Injuries: ${message.details?.injuries || 'Unknown'}\n` +
                       `People: ${message.details?.people || 'Unknown'}\n` +
                       `Message: ${message.details?.message || 'None'}\n` +
                       `Time: ${new Date(message.timestamp).toLocaleString()}`,
                verified: false,
                emergency: true,
                source: 'meshtastic-sos'
            };
            
            State.Waypoints.add(waypoint);
        }
        
        // Alert user
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`🆘 SOS FROM ${message.fromName}!`, 'error');
        }
        
        // Play alert sound if available
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH6EiYuKiomIh4aDfXVsZF1YV1pdY2t0fYWLjo6NjIqIhoN+d3BpYl1aWl1hZ293gIeNkJCPjoyJhoJ9dnBpY15bW15iaXF5gYiOkZGQjo2Kh4N+eHFrZWBdXV9jaXF6goeNkJGQj42LiIR/eXJsZmFfX2FmbXR8hIqPkpGQj42KhoF7dW9pY19fYWVsc3qCiI2RkpGPjouHg356c25oY2BgYmducneAh42RkpKQjo2JhYB6dG5oY2FhY2dtc3qAh4yQkpKQj42JhYB7dW9pZGFhY2dscXiAhouQkpKQj42KhoF7dXBqZWJiZGltdHqBh4yPkpGQj42KhoF8dnBqZmNjZWltc3qAhouPkpKQj4yKhoJ9d3FrZmRkZmptc3l/houPkZGQj42KhoJ9eHJsZ2VkZmptcnl/hYqOkZGQj42KhoJ9eHJtaGZlZmptcnh/hYqOkZCQj42JhoJ9eHJtaGdmZ2ptcniAhYqOkJGPj42KhoJ9eHNuaWdnZ2ptcnh/hYqNkJCPj4yKhoJ+eXNuaWhnZ2ptcnh/hImNkJCPjoyKhoJ+eXRvaWhnaGptcnh+hImMj5CPjoyKhoN+eXRvamloaGptcnl+hIiMj5CPjouJhoN+enVwa2loaGptcXh9g4iLjpCOjYuJhYJ+enVwbGppamttcXh9g4eLjo+OjYqIhYJ/enZxbWppa2ttcHd9goeLjY+OjYqIhYJ/e3dybmppa2xtcHd8goaKjY6OjYqIhYKAe3hzbmtqbG1ucHZ7gYaKjI6NjImHhIKAe3hzbmxrbG1ucHZ7gYaJi42NjImHhIKAe3l0b2xrbG1ucHZ7gIWJi4yMi4mGhIGAe3l0b2xrbW1ucHV6gIWIioyMi4mGhIGAfHl0cG1sbW5vcHV6gIWIioqMi4mGhIGAfHp1cG1sbm5vcHV5f4SHioqLioiGg4CAfHp1cW5tbnBvcHR5f4OHiYqKioiFg4CAfHt2cW5tbnBwcHR5f4OGiImKiYiFgoCAfXt2cW5ubm9wcHR4foOGiImJiIeFgn9/fXt3cm9ub29wcHN3foKFh4iJiIeFgn5+fXt3cm9ub29vcHN3fYKFh4iIiIeEgn5+fXx4c29ub29vcHN3fYKEh4eHh4eEgX19fXx4c3Bvb3BwcHN2fIGEhoaGhoeEgX19fHt4dHBvb3BwcHJ2fIGDhoaGhoaDgX19fHt4dHFwcHFxcXJ1e4CDhYWFhYaDgX19fHt5dXFwcHFxcXJ1e4CDhIWFhYWCgX18fHt5dXJxcXFxcXJ0eoGChIWFhISDgX18fHp5dXJxcXFycnJ0eoGChISEhISCgH17e3p5dnJxcXFycnJ0eoGChISEhISCgH17e3p5dnNycnJycnN0eYCBg4ODg4OCAH17e3p5dnNycnJycnN0eYCBg4ODg4OBAX17enp5dnNycnJycnN0eYCBg4ODgoKBAX17enp5d3NycnJycnN0eH+Ag4OCgoKBAX16enl5d3NycXJycnJ0eH+AgYOCgoGBAX16enl4d3NxcXJycXJ0eH+AgYKCgoGAAV55eXl4d3RycXFxcXF0d3+AgYKCgYGAAV55eXh3dnRxcHFxcXF0d3+AgYKBgYGAAV14eHh3dnRxcHBwcHF0d36/gIGBgYCAAF14eHd2dnRxcHBwcHBzdnyAf4CAgICAAF14d3d2dXNwcG9wb3Bzdnx/f4CAgH9/AF13d3Z1dHNwbm9vbm9ydn1/f39/f39+AF12d3Z1dHJvbm5ubm5xdXx+fn5+fn5+AF11dXV0c3Jvbm1tbW1wdHt+fn5+fn5+AF11dXR0cnFubW1sbGxvdHp9fn5+fX5+AF11dHRzcnBubGxtbGxvdHp9fX19fX5+AF10dHNycW9ubGxsa2tudHl8fX19fX19AF10dHNxcG5tbGxra2tucnl8fHx8fX19AF1zcnJxcG5sbGtra2ptcnh8fHx8fHx8AF1zcnJwb21sbGtrampscXh8fHx7e3x8AF5ycnFwbm1sbGtqampsb3d7e3t7e3t7AF5ycW9vbmxra2tqamprcHZ6e3t7e3t7');
            audio.play();
        } catch (e) {}
        
        Events.emit('meshtastic:sos_received', { message });
    }
    
    /**
     * Send check-in message
     */
    async function sendCheckin(status = 'OK') {
        let position;
        try {
            position = await getCurrentPosition();
        } catch (e) {}
        
        const message = {
            type: MessageType.CHECKIN,
            from: state.myNodeId,
            fromName: state.longName,
            status: status,
            lat: position?.latitude,
            lon: position?.longitude,
            timestamp: Date.now()
        };
        
        await sendToDevice(message);
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`✓ Check-in sent: ${status}`, 'success');
        }
        
        return message;
    }
    
    /**
     * Handle received check-in
     */
    function handleCheckin(message) {
        // Update node status
        const node = state.nodes.get(message.from);
        if (node) {
            node.lastSeen = Date.now();
            node.status = 'active';
            node.lastCheckin = message.status;
            if (message.lat && message.lon) {
                node.lat = message.lat;
                node.lon = message.lon;
            }
            updateTeamMembers();
        }
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`✓ ${message.fromName}: ${message.status}`, 'info');
        }
        
        Events.emit('meshtastic:checkin', { message });
    }
    
    /**
     * Handle telemetry data
     */
    function handleTelemetry(message) {
        const node = state.nodes.get(message.from);
        if (node) {
            node.battery = message.battery;
            node.voltage = message.voltage;
            node.channelUtil = message.channelUtil;
            node.airUtil = message.airUtil;
            node.lastSeen = Date.now();
        }
        
        Events.emit('meshtastic:telemetry', { message });
    }
    
    /**
     * Handle acknowledgment
     */
    function handleAck(message) {
        Events.emit('meshtastic:ack', { message });
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================
    
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function lonToX(lon) {
        return 50 + (lon + 119.1892) / 0.004;
    }
    
    function latToY(lat) {
        return 50 + (lat - 37.4215) / 0.002;
    }

    // =========================================================================
    // SETTINGS
    // =========================================================================
    
    /**
     * Set user name
     */
    function setUserName(longName, shortName) {
        state.longName = longName;
        state.shortName = shortName || longName.substring(0, 4).toUpperCase();
        saveSettings();
        updateTeamMembers();
    }
    
    /**
     * Get connection state
     */
    function getConnectionState() {
        return {
            state: state.connectionState,
            type: state.connectionType,
            deviceName: state.device?.name || null,
            nodeId: state.myNodeId,
            nodeName: state.longName
        };
    }
    
    /**
     * Get all tracked nodes
     */
    function getNodes() {
        return Array.from(state.nodes.values());
    }
    
    /**
     * Set callback for events
     */
    function setCallback(event, callback) {
        switch (event) {
            case 'message': state.onMessage = callback; break;
            case 'position': state.onPositionUpdate = callback; break;
            case 'connection': state.onConnectionChange = callback; break;
            case 'node': state.onNodeUpdate = callback; break;
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    return {
        init,
        destroy,
        
        // Connection
        connectBluetooth,
        connectSerial,
        disconnect,
        getConnectionState,
        checkApiSupport,
        isConnected: () => state.connectionState === ConnectionState.CONNECTED,
        
        // Position
        broadcastPosition,
        
        // Messaging
        sendTextMessage,
        getMessages,
        
        // Sharing
        shareWaypoint,
        shareRoute,
        
        // Emergency
        sendSOS,
        sendCheckin,
        
        // Settings
        setUserName,
        setCallback,
        
        // Data access
        getNodes,
        
        // Constants
        ConnectionState,
        MessageType
    };
})();

window.MeshtasticModule = MeshtasticModule;
