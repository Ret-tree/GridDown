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
        ACK: 'ack',
        // PKI message types
        PUBLIC_KEY: 'public_key',       // Broadcasting/sharing public key
        KEY_REQUEST: 'key_request',     // Requesting someone's public key
        KEY_RESPONSE: 'key_response',   // Response to key request
        // Direct Message types
        DM: 'dm',                        // Encrypted direct message
        DM_ACK: 'dm_ack',                // DM delivery acknowledgment
        DM_READ: 'dm_read'               // DM read receipt
    };
    
    // Message delivery status
    const DeliveryStatus = {
        PENDING: 'pending',     // Queued for sending
        SENT: 'sent',           // Sent to mesh (no ACK yet)
        DELIVERED: 'delivered', // ACK received from recipient
        READ: 'read',           // Read receipt received
        FAILED: 'failed'        // Send failed or timed out
    };
    
    // Position update interval (ms)
    const POSITION_BROADCAST_INTERVAL = 60000; // 1 minute
    const STALE_THRESHOLD = 300000; // 5 minutes
    const OFFLINE_THRESHOLD = 900000; // 15 minutes
    const ACK_TIMEOUT = 30000; // 30 seconds to wait for ACK
    const KEY_REQUEST_TIMEOUT = 60000; // 60 seconds to wait for key response
    
    // Retry configuration
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [5000, 15000, 30000]; // Exponential backoff: 5s, 15s, 30s
    
    // Message size limits (Meshtastic has ~237 byte payload limit)
    const MAX_MESSAGE_SIZE = 200;
    const MAX_CHUNK_SIZE = 180;
    
    // Default Meshtastic channels (US region presets)
    // These use the publicly known default PSK - NOT secure for private comms
    const DEFAULT_CHANNELS = [
        {
            id: 'primary',
            index: 0,
            name: 'Primary',
            psk: null, // Default Meshtastic PSK (public)
            isDefault: true,
            isPrivate: false
        },
        {
            id: 'longfast',
            index: 1,
            name: 'LongFast',
            psk: null,
            isDefault: true,
            isPrivate: false
        },
        {
            id: 'longslow',
            index: 2,
            name: 'LongSlow',
            psk: null,
            isDefault: true,
            isPrivate: false
        }
    ];

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
        messages: [],     // Message history (all channels)
        
        // Channel management
        channels: [...DEFAULT_CHANNELS], // Available channels
        activeChannelId: 'primary',      // Currently selected channel
        
        // Message state tracking
        messageStates: new Map(),        // messageId -> { status, sentAt, ackAt, retries }
        channelReadState: new Map(),     // channelId -> { lastReadAt, lastReadMessageId }
        pendingAcks: new Map(),          // messageId -> { timeout, message }
        
        // PKI (Public Key Infrastructure) for DM encryption
        myKeyPair: null,                 // { publicKey, privateKey, createdAt }
        peerPublicKeys: new Map(),       // nodeId -> { publicKey, sharedSecret, receivedAt, verified }
        pendingKeyRequests: new Map(),   // nodeId -> { requestedAt, callback }
        
        // Direct Messages
        dmConversations: new Map(),      // nodeId -> [messages]
        activeDMContact: null,           // Currently viewing DM thread (nodeId or null)
        dmUnreadCounts: new Map(),       // nodeId -> unread count
        pendingDMs: new Map(),           // nodeId -> [queued messages awaiting key]
        
        // Batch 3: Read receipts
        readReceiptsEnabled: true,       // Whether to send read receipts
        
        // Batch 3: Message retry tracking
        pendingRetries: new Map(),       // messageId -> { message, retryCount, nextRetryAt, timeout }
        
        // Batch 3: Deleted messages
        deletedMessageIds: new Set(),    // Messages deleted by user (hidden from view)
        
        // Intervals (no longer needed - using EventManager)
        positionInterval: null,
        statusInterval: null,
        
        // Callbacks
        onMessage: null,
        onPositionUpdate: null,
        onConnectionChange: null,
        onNodeUpdate: null,
        onChannelChange: null,
        onUnreadChange: null,
        onDMReceived: null,
        onKeyExchange: null,
        onReadReceipt: null
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
                state.activeChannelId = saved.activeChannelId || 'primary';
                
                // Load custom channels (merge with defaults)
                if (saved.customChannels && Array.isArray(saved.customChannels)) {
                    // Keep default channels and add custom ones
                    state.channels = [
                        ...DEFAULT_CHANNELS,
                        ...saved.customChannels.filter(c => !c.isDefault)
                    ];
                }
                
                // Load channel read state
                if (saved.channelReadState) {
                    state.channelReadState = new Map(Object.entries(saved.channelReadState));
                }
                
                // Load DM unread counts
                if (saved.dmUnreadCounts) {
                    state.dmUnreadCounts = new Map(Object.entries(saved.dmUnreadCounts));
                }
            }
            
            // Initialize read state for any channels that don't have it
            state.channels.forEach(channel => {
                if (!state.channelReadState.has(channel.id)) {
                    state.channelReadState.set(channel.id, {
                        lastReadAt: Date.now(),
                        lastReadMessageId: null
                    });
                }
            });
            
            // Load persisted messages
            const savedMessages = await Storage.Settings.get('meshtastic_messages');
            if (savedMessages && Array.isArray(savedMessages)) {
                state.messages = savedMessages.slice(-100); // Keep last 100
                
                // Rebuild message states from saved messages
                savedMessages.forEach(msg => {
                    if (msg.id && msg.deliveryStatus) {
                        state.messageStates.set(msg.id, {
                            status: msg.deliveryStatus,
                            sentAt: msg.timestamp,
                            ackAt: msg.ackAt || null
                        });
                    }
                });
            }
            
            // Load PKI key pair
            const savedKeyPair = await Storage.Settings.get('meshtastic_keypair');
            if (savedKeyPair && savedKeyPair.publicKey && savedKeyPair.privateKey) {
                state.myKeyPair = savedKeyPair;
                console.log('Loaded existing PKI key pair');
            }
            
            // Load peer public keys
            const savedPeerKeys = await Storage.Settings.get('meshtastic_peer_keys');
            if (savedPeerKeys) {
                state.peerPublicKeys = new Map(Object.entries(savedPeerKeys));
            }
            
            // Load DM conversations
            const savedDMs = await Storage.Settings.get('meshtastic_dm_conversations');
            if (savedDMs) {
                Object.entries(savedDMs).forEach(([nodeId, messages]) => {
                    state.dmConversations.set(nodeId, messages.slice(-50)); // Keep last 50 per contact
                });
            }
            
            // Batch 3: Load read receipts setting
            const savedPrefs = await Storage.Settings.get('meshtastic_preferences');
            if (savedPrefs) {
                state.readReceiptsEnabled = savedPrefs.readReceiptsEnabled !== false; // Default true
            }
            
            // Batch 3: Load deleted message IDs
            const savedDeleted = await Storage.Settings.get('meshtastic_deleted');
            if (savedDeleted && Array.isArray(savedDeleted)) {
                state.deletedMessageIds = new Set(savedDeleted);
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
            // Convert Map to object for storage
            const channelReadStateObj = {};
            state.channelReadState.forEach((value, key) => {
                channelReadStateObj[key] = value;
            });
            
            const dmUnreadCountsObj = {};
            state.dmUnreadCounts.forEach((value, key) => {
                dmUnreadCountsObj[key] = value;
            });
            
            await Storage.Settings.set('meshtastic', {
                longName: state.longName,
                shortName: state.shortName,
                nodeId: state.myNodeId,
                activeChannelId: state.activeChannelId,
                customChannels: state.channels.filter(c => !c.isDefault),
                channelReadState: channelReadStateObj,
                dmUnreadCounts: dmUnreadCountsObj
            });
            
            // Batch 3: Save preferences
            await Storage.Settings.set('meshtastic_preferences', {
                readReceiptsEnabled: state.readReceiptsEnabled
            });
        } catch (e) {
            console.warn('Could not save Meshtastic settings:', e);
        }
    }
    
    /**
     * Batch 3: Save deleted message IDs (debounced)
     */
    let _saveDeletedTimeout = null;
    async function saveDeletedMessages() {
        if (_saveDeletedTimeout) clearTimeout(_saveDeletedTimeout);
        _saveDeletedTimeout = setTimeout(async () => {
            try {
                await Storage.Settings.set('meshtastic_deleted', [...state.deletedMessageIds]);
            } catch (e) {
                console.warn('Could not save deleted messages:', e);
            }
        }, 1000);
    }
    
    /**
     * Save PKI key pair to storage
     */
    async function saveKeyPair() {
        if (!state.myKeyPair) return;
        try {
            await Storage.Settings.set('meshtastic_keypair', state.myKeyPair);
        } catch (e) {
            console.warn('Could not save PKI key pair:', e);
        }
    }
    
    /**
     * Save peer public keys to storage
     */
    async function savePeerKeys() {
        try {
            const peerKeysObj = {};
            state.peerPublicKeys.forEach((value, key) => {
                peerKeysObj[key] = value;
            });
            await Storage.Settings.set('meshtastic_peer_keys', peerKeysObj);
        } catch (e) {
            console.warn('Could not save peer keys:', e);
        }
    }
    
    /**
     * Save DM conversations to storage (debounced)
     */
    let _saveDMsTimeout = null;
    async function saveDMConversations() {
        if (_saveDMsTimeout) clearTimeout(_saveDMsTimeout);
        _saveDMsTimeout = setTimeout(async () => {
            try {
                const dmsObj = {};
                state.dmConversations.forEach((messages, nodeId) => {
                    dmsObj[nodeId] = messages.slice(-50); // Keep last 50 per contact
                });
                await Storage.Settings.set('meshtastic_dm_conversations', dmsObj);
            } catch (e) {
                console.warn('Could not save DM conversations:', e);
            }
        }, 1000);
    }
    
    /**
     * Save messages to storage (debounced)
     */
    let _saveMessagesTimeout = null;
    async function saveMessages() {
        // Debounce to avoid excessive writes
        if (_saveMessagesTimeout) clearTimeout(_saveMessagesTimeout);
        _saveMessagesTimeout = setTimeout(async () => {
            try {
                // Save messages with delivery status
                const messagesToSave = state.messages.map(msg => ({
                    ...msg,
                    deliveryStatus: state.messageStates.get(msg.id)?.status || DeliveryStatus.SENT
                }));
                await Storage.Settings.set('meshtastic_messages', messagesToSave.slice(-100));
            } catch (e) {
                console.warn('Could not save Meshtastic messages:', e);
            }
        }, 1000);
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
            // PKI message types
            case MessageType.PUBLIC_KEY:
                handlePublicKeyReceived(message);
                break;
            case MessageType.KEY_REQUEST:
                handleKeyRequest(message);
                break;
            case MessageType.KEY_RESPONSE:
                handleKeyResponse(message);
                break;
            // Direct Message types
            case MessageType.DM:
                handleDirectMessage(message);
                break;
            case MessageType.DM_ACK:
                handleDMAck(message);
                break;
            case MessageType.DM_READ:
                handleDMReadReceipt(message);
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
     * Send text message to current channel or specific recipient
     * @param {string} text - Message content
     * @param {string|null} to - Recipient node ID (null for channel broadcast)
     * @param {string|null} channelId - Channel to send on (defaults to active channel)
     */
    async function sendTextMessage(text, to = null, channelId = null) {
        if (!text || text.length === 0) return;
        
        // Truncate if needed
        if (text.length > MAX_MESSAGE_SIZE) {
            text = text.substring(0, MAX_MESSAGE_SIZE);
        }
        
        const channel = channelId ? getChannel(channelId) : getActiveChannel();
        const messageId = generateMessageId();
        
        const message = {
            type: MessageType.TEXT,
            from: state.myNodeId,
            fromName: state.shortName,
            to: to, // null = channel broadcast
            channelId: channel?.id || state.activeChannelId,
            channelIndex: channel?.index || 0,
            text: text,
            timestamp: Date.now(),
            id: messageId,
            // Include PSK hash for encrypted channels (not the actual PSK)
            encrypted: channel?.isPrivate || false
        };
        
        // Set initial delivery status
        state.messageStates.set(messageId, {
            status: DeliveryStatus.PENDING,
            sentAt: Date.now(),
            ackAt: null,
            retries: 0
        });
        
        // Store locally
        addMessageToHistory(message, true);
        
        try {
            // Send to mesh
            await sendToDevice(message);
            
            // Update status to SENT
            updateMessageStatus(messageId, DeliveryStatus.SENT);
            
            // Set up ACK timeout
            setupAckTimeout(messageId, message);
            
        } catch (e) {
            console.error('Failed to send message:', e);
            updateMessageStatus(messageId, DeliveryStatus.FAILED);
            throw e;
        }
        
        return message;
    }
    
    /**
     * Set up ACK timeout for message delivery confirmation
     */
    function setupAckTimeout(messageId, message) {
        const timeout = setTimeout(() => {
            const msgState = state.messageStates.get(messageId);
            // If still in SENT state (no ACK received), keep it as SENT
            // We don't mark as FAILED because mesh networks may have delays
            if (msgState && msgState.status === DeliveryStatus.SENT) {
                // Could retry here if needed
                console.log(`No ACK received for message ${messageId} within timeout`);
            }
            state.pendingAcks.delete(messageId);
        }, ACK_TIMEOUT);
        
        state.pendingAcks.set(messageId, { timeout, message });
    }
    
    /**
     * Update message delivery status
     */
    function updateMessageStatus(messageId, status) {
        const msgState = state.messageStates.get(messageId);
        if (msgState) {
            msgState.status = status;
            if (status === DeliveryStatus.DELIVERED) {
                msgState.ackAt = Date.now();
            }
            state.messageStates.set(messageId, msgState);
        } else {
            state.messageStates.set(messageId, {
                status,
                sentAt: Date.now(),
                ackAt: status === DeliveryStatus.DELIVERED ? Date.now() : null,
                retries: 0
            });
        }
        
        // Save messages (debounced)
        saveMessages();
        
        // Emit status change event
        Events.emit('meshtastic:message_status', { messageId, status });
    }
    
    /**
     * Get message delivery status
     */
    function getMessageStatus(messageId) {
        return state.messageStates.get(messageId)?.status || DeliveryStatus.SENT;
    }
    
    /**
     * Handle received text message
     */
    function handleTextMessage(message) {
        // Avoid duplicates
        if (state.messages.some(m => m.id === message.id)) return;
        
        // Ensure channel ID is set (default to primary if not specified)
        message.channelId = message.channelId || 'primary';
        
        addMessageToHistory(message, false);
        
        // Track unread if not from current channel or panel not visible
        const isCurrentChannel = message.channelId === state.activeChannelId;
        if (!isCurrentChannel) {
            // Message is on a different channel, increment unread
            incrementUnreadCount(message.channelId);
        }
        
        // Send ACK back for text messages
        sendMessageAck(message.id, message.from);
        
        // Show notification
        if (typeof ModalsModule !== 'undefined') {
            const channelName = getChannel(message.channelId)?.name || message.channelId;
            ModalsModule.showToast(`📨 [${channelName}] ${message.fromName}: ${message.text.substring(0, 50)}${message.text.length > 50 ? '...' : ''}`, 'info');
        }
        
        Events.emit('meshtastic:message', { message });
    }
    
    /**
     * Send acknowledgment for received message
     */
    async function sendMessageAck(messageId, toNodeId) {
        if (state.connectionState !== ConnectionState.CONNECTED) return;
        
        const ack = {
            type: MessageType.ACK,
            originalMessageId: messageId,
            from: state.myNodeId,
            to: toNodeId,
            timestamp: Date.now()
        };
        
        try {
            await sendToDevice(ack);
        } catch (e) {
            console.warn('Failed to send ACK:', e);
        }
    }
    
    /**
     * Add message to history
     */
    function addMessageToHistory(message, isSent) {
        const fullMessage = {
            ...message,
            isSent,
            receivedAt: Date.now(),
            channelId: message.channelId || state.activeChannelId // Ensure channel is set
        };
        
        state.messages.push(fullMessage);
        
        // Limit history
        if (state.messages.length > 100) {
            state.messages = state.messages.slice(-100);
        }
        
        // Save messages (debounced)
        saveMessages();
        
        Events.emit('meshtastic:messages_updated', { messages: state.messages });
    }
    
    /**
     * Get message history, optionally filtered by channel
     * @param {string|null} channelId - Filter by channel (null for all)
     */
    function getMessages(channelId = null) {
        if (channelId === null) {
            return [...state.messages];
        }
        return state.messages.filter(m => m.channelId === channelId);
    }
    
    /**
     * Get messages for the active channel
     */
    function getActiveChannelMessages() {
        return getMessages(state.activeChannelId);
    }
    
    /**
     * Generate unique message ID
     */
    function generateMessageId() {
        return `${state.myNodeId || 'local'}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }
    
    // =========================================================================
    // CHANNEL MANAGEMENT
    // =========================================================================
    
    /**
     * Get all available channels
     */
    function getChannels() {
        return [...state.channels];
    }
    
    /**
     * Get channel by ID
     */
    function getChannel(channelId) {
        return state.channels.find(c => c.id === channelId);
    }
    
    /**
     * Get the currently active channel
     */
    function getActiveChannel() {
        return getChannel(state.activeChannelId) || state.channels[0];
    }
    
    /**
     * Set the active channel
     */
    function setActiveChannel(channelId) {
        const channel = getChannel(channelId);
        if (!channel) {
            console.warn('Channel not found:', channelId);
            return false;
        }
        
        state.activeChannelId = channelId;
        
        // Mark channel as read when switching to it
        markChannelAsRead(channelId);
        
        // Save settings
        saveSettings();
        
        // Emit change event
        Events.emit('meshtastic:channel_change', { channelId, channel });
        
        if (state.onChannelChange) {
            state.onChannelChange(channel);
        }
        
        return true;
    }
    
    /**
     * Create a new private channel with custom PSK
     * @param {string} name - Channel display name
     * @param {string} psk - Pre-shared key (will be hashed)
     * @returns {object} The created channel
     */
    function createChannel(name, psk) {
        if (!name || name.trim().length === 0) {
            throw new Error('Channel name is required');
        }
        
        // Generate channel ID from name
        const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
        
        // Find next available index (after defaults)
        const maxIndex = Math.max(...state.channels.map(c => c.index), -1);
        const newIndex = maxIndex + 1;
        
        // Hash the PSK for storage (we don't store raw PSK)
        const pskHash = psk ? hashPSK(psk) : null;
        
        const channel = {
            id,
            index: newIndex,
            name: name.trim(),
            psk: pskHash,
            pskRaw: psk, // Keep raw PSK in memory for this session (needed for actual encryption)
            isDefault: false,
            isPrivate: !!psk,
            createdAt: Date.now()
        };
        
        state.channels.push(channel);
        
        // Initialize read state
        state.channelReadState.set(id, {
            lastReadAt: Date.now(),
            lastReadMessageId: null
        });
        
        // Save settings
        saveSettings();
        
        // Emit event
        Events.emit('meshtastic:channel_created', { channel });
        
        return channel;
    }
    
    /**
     * Import a channel from a shared configuration
     * @param {object} config - Channel configuration (from QR code or share)
     */
    function importChannel(config) {
        if (!config || !config.name) {
            throw new Error('Invalid channel configuration');
        }
        
        // Check for duplicate
        const existing = state.channels.find(c => 
            c.name === config.name && c.psk === config.psk
        );
        if (existing) {
            return existing; // Return existing channel
        }
        
        return createChannel(config.name, config.psk);
    }
    
    /**
     * Delete a custom channel
     */
    function deleteChannel(channelId) {
        const channel = getChannel(channelId);
        if (!channel) return false;
        
        if (channel.isDefault) {
            throw new Error('Cannot delete default channels');
        }
        
        // Remove channel
        state.channels = state.channels.filter(c => c.id !== channelId);
        
        // Remove read state
        state.channelReadState.delete(channelId);
        
        // If this was the active channel, switch to primary
        if (state.activeChannelId === channelId) {
            state.activeChannelId = 'primary';
        }
        
        // Save settings
        saveSettings();
        
        // Emit event
        Events.emit('meshtastic:channel_deleted', { channelId });
        
        return true;
    }
    
    /**
     * Export channel configuration for sharing
     */
    function exportChannel(channelId) {
        const channel = getChannel(channelId);
        if (!channel) return null;
        
        return {
            name: channel.name,
            psk: channel.pskRaw || null, // Include raw PSK for sharing
            isPrivate: channel.isPrivate
        };
    }
    
    /**
     * Simple hash function for PSK (for storage identification, not encryption)
     */
    function hashPSK(psk) {
        let hash = 0;
        for (let i = 0; i < psk.length; i++) {
            const char = psk.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return 'psk-' + Math.abs(hash).toString(16);
    }
    
    // =========================================================================
    // UNREAD MESSAGE TRACKING
    // =========================================================================
    
    /**
     * Get unread message count for a channel
     */
    function getUnreadCount(channelId) {
        const readState = state.channelReadState.get(channelId);
        if (!readState) return 0;
        
        const channelMessages = getMessages(channelId).filter(m => !m.isSent);
        const unreadMessages = channelMessages.filter(m => 
            m.receivedAt > readState.lastReadAt
        );
        
        return unreadMessages.length;
    }
    
    /**
     * Get total unread count across all channels
     */
    function getTotalUnreadCount() {
        let total = 0;
        state.channels.forEach(channel => {
            total += getUnreadCount(channel.id);
        });
        return total;
    }
    
    /**
     * Get unread counts for all channels
     */
    function getAllUnreadCounts() {
        const counts = {};
        state.channels.forEach(channel => {
            counts[channel.id] = getUnreadCount(channel.id);
        });
        return counts;
    }
    
    /**
     * Mark channel as read (all messages up to now)
     */
    function markChannelAsRead(channelId) {
        const channelMessages = getMessages(channelId);
        const lastMessage = channelMessages[channelMessages.length - 1];
        
        state.channelReadState.set(channelId, {
            lastReadAt: Date.now(),
            lastReadMessageId: lastMessage?.id || null
        });
        
        // Save settings
        saveSettings();
        
        // Emit event
        Events.emit('meshtastic:unread_change', { 
            channelId, 
            unreadCount: 0,
            totalUnread: getTotalUnreadCount()
        });
        
        if (state.onUnreadChange) {
            state.onUnreadChange(channelId, 0);
        }
    }
    
    /**
     * Increment unread count (internal use)
     */
    function incrementUnreadCount(channelId) {
        // Read state is timestamp-based, so we don't need to increment
        // Just emit the event with new count
        const count = getUnreadCount(channelId);
        
        Events.emit('meshtastic:unread_change', { 
            channelId, 
            unreadCount: count,
            totalUnread: getTotalUnreadCount()
        });
        
        if (state.onUnreadChange) {
            state.onUnreadChange(channelId, count);
        }
    }

    // =========================================================================
    // PKI (PUBLIC KEY INFRASTRUCTURE)
    // =========================================================================
    
    /**
     * Check if Web Crypto API is available
     */
    function isCryptoAvailable() {
        return typeof crypto !== 'undefined' && 
               crypto.subtle && 
               typeof crypto.subtle.generateKey === 'function';
    }
    
    /**
     * Generate a new ECDH key pair for DM encryption
     * Uses Curve25519 via Web Crypto API (P-256 as fallback since Curve25519 not universally supported)
     */
    async function generateKeyPair() {
        if (!isCryptoAvailable()) {
            throw new Error('Web Crypto API not available');
        }
        
        try {
            // Generate ECDH key pair (P-256 curve - widely supported)
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'ECDH',
                    namedCurve: 'P-256'
                },
                true, // extractable
                ['deriveBits']
            );
            
            // Export keys for storage
            const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
            const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
            
            state.myKeyPair = {
                publicKey: arrayBufferToBase64(publicKeyRaw),
                privateKey: JSON.stringify(privateKeyJwk), // Store as JWK string
                publicKeyObj: keyPair.publicKey,
                privateKeyObj: keyPair.privateKey,
                createdAt: Date.now()
            };
            
            // Save to storage
            await saveKeyPair();
            
            console.log('Generated new PKI key pair');
            Events.emit('meshtastic:keypair_generated', { publicKey: state.myKeyPair.publicKey });
            
            return state.myKeyPair.publicKey;
            
        } catch (e) {
            console.error('Failed to generate key pair:', e);
            throw e;
        }
    }
    
    /**
     * Get or generate my public key
     */
    async function getMyPublicKey() {
        if (!state.myKeyPair) {
            await generateKeyPair();
        }
        return state.myKeyPair.publicKey;
    }
    
    /**
     * Ensure key objects are loaded (after loading from storage)
     */
    async function ensureKeyObjects() {
        if (state.myKeyPair && !state.myKeyPair.privateKeyObj) {
            try {
                // Re-import the private key from JWK
                const privateKeyJwk = JSON.parse(state.myKeyPair.privateKey);
                state.myKeyPair.privateKeyObj = await crypto.subtle.importKey(
                    'jwk',
                    privateKeyJwk,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    true,
                    ['deriveBits']
                );
                
                // Re-import the public key from raw
                const publicKeyRaw = base64ToArrayBuffer(state.myKeyPair.publicKey);
                state.myKeyPair.publicKeyObj = await crypto.subtle.importKey(
                    'raw',
                    publicKeyRaw,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    true,
                    []
                );
            } catch (e) {
                console.warn('Could not restore key objects, regenerating:', e);
                await generateKeyPair();
            }
        }
    }
    
    /**
     * Broadcast public key to mesh network
     */
    async function broadcastPublicKey() {
        const publicKey = await getMyPublicKey();
        
        const message = {
            type: MessageType.PUBLIC_KEY,
            from: state.myNodeId,
            fromName: state.shortName,
            publicKey: publicKey,
            timestamp: Date.now()
        };
        
        await sendToDevice(message);
        console.log('Broadcast public key to mesh');
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('🔑 Public key broadcast', 'info');
        }
    }
    
    /**
     * Request public key from a specific node
     */
    async function requestPublicKey(nodeId) {
        const message = {
            type: MessageType.KEY_REQUEST,
            from: state.myNodeId,
            fromName: state.shortName,
            to: nodeId,
            timestamp: Date.now()
        };
        
        // Set up timeout for response
        const timeout = setTimeout(() => {
            const pending = state.pendingKeyRequests.get(nodeId);
            if (pending) {
                state.pendingKeyRequests.delete(nodeId);
                console.warn(`Key request to ${nodeId} timed out`);
                Events.emit('meshtastic:key_request_timeout', { nodeId });
            }
        }, KEY_REQUEST_TIMEOUT);
        
        state.pendingKeyRequests.set(nodeId, {
            requestedAt: Date.now(),
            timeout
        });
        
        await sendToDevice(message);
        console.log('Requested public key from:', nodeId);
    }
    
    /**
     * Handle received public key
     */
    function handlePublicKeyReceived(message) {
        const nodeId = message.from;
        const publicKey = message.publicKey;
        
        if (!publicKey) {
            console.warn('Received PUBLIC_KEY message without key');
            return;
        }
        
        // Store the public key
        state.peerPublicKeys.set(nodeId, {
            publicKey: publicKey,
            sharedSecret: null, // Will be derived when needed
            receivedAt: Date.now(),
            verified: false
        });
        
        // Save to storage
        savePeerKeys();
        
        console.log('Received public key from:', nodeId);
        Events.emit('meshtastic:public_key_received', { nodeId, publicKey });
        
        if (state.onKeyExchange) {
            state.onKeyExchange(nodeId, 'received');
        }
        
        // Check if we have pending DMs for this node
        processPendingDMs(nodeId);
        
        if (typeof ModalsModule !== 'undefined') {
            const node = state.nodes.get(nodeId);
            const name = node?.name || nodeId?.slice(-4) || 'Unknown';
            ModalsModule.showToast(`🔑 Key received from ${name}`, 'success');
        }
    }
    
    /**
     * Handle key request - send our public key
     */
    async function handleKeyRequest(message) {
        // Only respond if the request is for us
        if (message.to && message.to !== state.myNodeId) return;
        
        const publicKey = await getMyPublicKey();
        
        const response = {
            type: MessageType.KEY_RESPONSE,
            from: state.myNodeId,
            fromName: state.shortName,
            to: message.from,
            publicKey: publicKey,
            timestamp: Date.now()
        };
        
        await sendToDevice(response);
        console.log('Sent public key to:', message.from);
    }
    
    /**
     * Handle key response
     */
    function handleKeyResponse(message) {
        // Clear pending request timeout
        const pending = state.pendingKeyRequests.get(message.from);
        if (pending) {
            clearTimeout(pending.timeout);
            state.pendingKeyRequests.delete(message.from);
        }
        
        // Process as regular public key
        handlePublicKeyReceived(message);
    }
    
    /**
     * Derive shared secret with a peer using ECDH
     */
    async function deriveSharedSecret(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        if (!peerData || !peerData.publicKey) {
            throw new Error(`No public key for node ${nodeId}`);
        }
        
        // Return cached if available
        if (peerData.sharedSecret) {
            return peerData.sharedSecret;
        }
        
        await ensureKeyObjects();
        
        try {
            // Import peer's public key
            const peerPublicKeyRaw = base64ToArrayBuffer(peerData.publicKey);
            const peerPublicKey = await crypto.subtle.importKey(
                'raw',
                peerPublicKeyRaw,
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            );
            
            // Derive shared bits
            const sharedBits = await crypto.subtle.deriveBits(
                {
                    name: 'ECDH',
                    public: peerPublicKey
                },
                state.myKeyPair.privateKeyObj,
                256 // 256 bits = 32 bytes
            );
            
            // Derive AES key from shared bits
            const sharedKey = await crypto.subtle.importKey(
                'raw',
                sharedBits,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            // Cache the shared secret
            peerData.sharedSecret = sharedKey;
            state.peerPublicKeys.set(nodeId, peerData);
            
            console.log('Derived shared secret with:', nodeId);
            return sharedKey;
            
        } catch (e) {
            console.error('Failed to derive shared secret:', e);
            throw e;
        }
    }
    
    /**
     * Encrypt a message for a specific node
     */
    async function encryptForNode(nodeId, plaintext) {
        const sharedKey = await deriveSharedSecret(nodeId);
        
        // Generate random IV (12 bytes for AES-GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // Encode plaintext
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        
        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            sharedKey,
            data
        );
        
        // Combine IV + ciphertext for transmission
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        
        return arrayBufferToBase64(combined);
    }
    
    /**
     * Decrypt a message from a specific node
     */
    async function decryptFromNode(nodeId, encryptedBase64) {
        const sharedKey = await deriveSharedSecret(nodeId);
        
        // Decode combined IV + ciphertext
        const combined = base64ToArrayBuffer(encryptedBase64);
        const combinedArray = new Uint8Array(combined);
        
        // Extract IV (first 12 bytes)
        const iv = combinedArray.slice(0, 12);
        const ciphertext = combinedArray.slice(12);
        
        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            sharedKey,
            ciphertext
        );
        
        // Decode to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }
    
    /**
     * Check if we can send encrypted DM to a node
     */
    function canSendDMTo(nodeId) {
        return state.peerPublicKeys.has(nodeId);
    }
    
    /**
     * Get nodes we can DM (have their public key)
     */
    function getDMCapableNodes() {
        const nodes = [];
        state.peerPublicKeys.forEach((data, nodeId) => {
            const nodeInfo = state.nodes.get(nodeId);
            nodes.push({
                id: nodeId,
                name: nodeInfo?.name || `Node-${nodeId?.slice(-4) || 'Unknown'}`,
                shortName: nodeInfo?.shortName || '???',
                status: nodeInfo?.status || 'unknown',
                hasKey: true,
                keyReceivedAt: data.receivedAt
            });
        });
        return nodes;
    }
    
    // Utility functions for base64/ArrayBuffer conversion
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // =========================================================================
    // DIRECT MESSAGES
    // =========================================================================
    
    /**
     * Send encrypted direct message to a specific node
     */
    async function sendDirectMessage(nodeId, text) {
        if (!text || text.length === 0) return;
        
        // Truncate if needed
        if (text.length > MAX_MESSAGE_SIZE) {
            text = text.substring(0, MAX_MESSAGE_SIZE);
        }
        
        const messageId = generateMessageId();
        
        // Check if we have their public key
        if (!canSendDMTo(nodeId)) {
            console.log('No public key for', nodeId, '- requesting key and queueing message');
            
            // Queue the message
            const pending = state.pendingDMs.get(nodeId) || [];
            pending.push({
                id: messageId,
                text: text,
                timestamp: Date.now()
            });
            state.pendingDMs.set(nodeId, pending);
            
            // Request their public key
            await requestPublicKey(nodeId);
            
            // Add to conversation as pending
            addDMToConversation(nodeId, {
                id: messageId,
                from: state.myNodeId,
                fromName: state.shortName,
                to: nodeId,
                text: text,
                timestamp: Date.now(),
                isSent: true,
                encrypted: true,
                status: DeliveryStatus.PENDING
            });
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('🔑 Requesting encryption key...', 'info');
            }
            
            return { id: messageId, status: 'pending_key' };
        }
        
        try {
            // Encrypt the message
            const encryptedText = await encryptForNode(nodeId, text);
            
            const message = {
                type: MessageType.DM,
                from: state.myNodeId,
                fromName: state.shortName,
                to: nodeId,
                encryptedText: encryptedText,
                timestamp: Date.now(),
                id: messageId
            };
            
            // Set initial delivery status
            state.messageStates.set(messageId, {
                status: DeliveryStatus.PENDING,
                sentAt: Date.now(),
                ackAt: null
            });
            
            // Add to conversation
            addDMToConversation(nodeId, {
                id: messageId,
                from: state.myNodeId,
                fromName: state.shortName,
                to: nodeId,
                text: text, // Store decrypted locally
                timestamp: Date.now(),
                isSent: true,
                encrypted: true,
                status: DeliveryStatus.PENDING
            });
            
            // Send to mesh
            await sendToDevice(message);
            
            // Update status to SENT
            updateMessageStatus(messageId, DeliveryStatus.SENT);
            
            // Set up ACK timeout
            setupDMAckTimeout(messageId, nodeId);
            
            return { id: messageId, status: 'sent' };
            
        } catch (e) {
            console.error('Failed to send DM:', e);
            updateMessageStatus(messageId, DeliveryStatus.FAILED);
            throw e;
        }
    }
    
    /**
     * Process pending DMs after receiving a public key
     */
    async function processPendingDMs(nodeId) {
        const pending = state.pendingDMs.get(nodeId);
        if (!pending || pending.length === 0) return;
        
        console.log(`Processing ${pending.length} pending DMs for ${nodeId}`);
        
        for (const msg of pending) {
            try {
                // Encrypt and send the queued message
                const encryptedText = await encryptForNode(nodeId, msg.text);
                
                const message = {
                    type: MessageType.DM,
                    from: state.myNodeId,
                    fromName: state.shortName,
                    to: nodeId,
                    encryptedText: encryptedText,
                    timestamp: msg.timestamp,
                    id: msg.id
                };
                
                await sendToDevice(message);
                updateMessageStatus(msg.id, DeliveryStatus.SENT);
                setupDMAckTimeout(msg.id, nodeId);
                
            } catch (e) {
                console.error('Failed to send pending DM:', e);
                updateMessageStatus(msg.id, DeliveryStatus.FAILED);
            }
        }
        
        // Clear pending queue
        state.pendingDMs.delete(nodeId);
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`📤 Sent ${pending.length} queued message(s)`, 'success');
        }
    }
    
    /**
     * Set up ACK timeout for DM
     */
    function setupDMAckTimeout(messageId, nodeId) {
        const timeout = setTimeout(() => {
            const msgState = state.messageStates.get(messageId);
            if (msgState && msgState.status === DeliveryStatus.SENT) {
                console.log(`No ACK received for DM ${messageId} - scheduling retry`);
                
                // Find the original message for retry
                const conversation = state.dmConversations.get(nodeId);
                const originalMessage = conversation?.find(m => m.id === messageId);
                
                if (originalMessage) {
                    // Schedule retry with exponential backoff
                    scheduleRetry(messageId, originalMessage, nodeId);
                } else {
                    // Can't retry - mark as failed
                    updateMessageStatus(messageId, DeliveryStatus.FAILED);
                }
            }
            state.pendingAcks.delete(messageId);
        }, ACK_TIMEOUT);
        
        state.pendingAcks.set(messageId, { timeout, nodeId });
    }
    
    /**
     * Handle received encrypted DM
     */
    async function handleDirectMessage(message) {
        const fromNodeId = message.from;
        
        // Check if we have their public key
        if (!state.peerPublicKeys.has(fromNodeId)) {
            console.warn('Received DM but no public key for sender:', fromNodeId);
            // Request their key
            await requestPublicKey(fromNodeId);
            
            // Store encrypted message temporarily
            const pending = state.pendingDMs.get(fromNodeId) || [];
            pending.push({
                encrypted: true,
                raw: message,
                receivedAt: Date.now()
            });
            state.pendingDMs.set(fromNodeId, pending);
            return;
        }
        
        try {
            // Decrypt the message
            const decryptedText = await decryptFromNode(fromNodeId, message.encryptedText);
            
            const dmMessage = {
                id: message.id,
                from: fromNodeId,
                fromName: message.fromName,
                to: state.myNodeId,
                text: decryptedText,
                timestamp: message.timestamp,
                receivedAt: Date.now(),
                isSent: false,
                encrypted: true
            };
            
            // Add to conversation
            addDMToConversation(fromNodeId, dmMessage);
            
            // Send ACK
            await sendDMAck(message.id, fromNodeId);
            
            // Update unread count if not viewing this conversation
            if (state.activeDMContact !== fromNodeId) {
                incrementDMUnreadCount(fromNodeId);
            }
            
            // Show notification
            if (typeof ModalsModule !== 'undefined') {
                const name = message.fromName || fromNodeId?.slice(-4) || 'Unknown';
                ModalsModule.showToast(`🔐 DM from ${name}: ${decryptedText.substring(0, 40)}${decryptedText.length > 40 ? '...' : ''}`, 'info');
            }
            
            Events.emit('meshtastic:dm_received', { message: dmMessage });
            
            if (state.onDMReceived) {
                state.onDMReceived(dmMessage);
            }
            
        } catch (e) {
            console.error('Failed to decrypt DM:', e);
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('🔐 Received encrypted message (decryption failed)', 'error');
            }
        }
    }
    
    /**
     * Send DM acknowledgment
     */
    async function sendDMAck(messageId, toNodeId) {
        const ack = {
            type: MessageType.DM_ACK,
            originalMessageId: messageId,
            from: state.myNodeId,
            to: toNodeId,
            timestamp: Date.now()
        };
        
        try {
            await sendToDevice(ack);
        } catch (e) {
            console.warn('Failed to send DM ACK:', e);
        }
    }
    
    /**
     * Handle DM acknowledgment
     */
    function handleDMAck(message) {
        const originalMessageId = message.originalMessageId;
        
        if (originalMessageId) {
            const pending = state.pendingAcks.get(originalMessageId);
            if (pending) {
                clearTimeout(pending.timeout);
                state.pendingAcks.delete(originalMessageId);
            }
            
            updateMessageStatus(originalMessageId, DeliveryStatus.DELIVERED);
            
            // Update the message in conversation
            updateDMStatus(message.from, originalMessageId, DeliveryStatus.DELIVERED);
            
            console.log(`DM ACK received for message ${originalMessageId}`);
        }
        
        Events.emit('meshtastic:dm_ack', { message });
    }
    
    /**
     * Add message to DM conversation
     */
    function addDMToConversation(nodeId, message) {
        let conversation = state.dmConversations.get(nodeId);
        if (!conversation) {
            conversation = [];
            state.dmConversations.set(nodeId, conversation);
        }
        
        // Avoid duplicates
        if (conversation.some(m => m.id === message.id)) return;
        
        conversation.push(message);
        
        // Limit history
        if (conversation.length > 50) {
            state.dmConversations.set(nodeId, conversation.slice(-50));
        }
        
        // Save (debounced)
        saveDMConversations();
        
        Events.emit('meshtastic:dm_updated', { nodeId, messages: conversation });
    }
    
    /**
     * Update DM message status in conversation
     */
    function updateDMStatus(nodeId, messageId, status) {
        const conversation = state.dmConversations.get(nodeId);
        if (!conversation) return;
        
        const msg = conversation.find(m => m.id === messageId);
        if (msg) {
            msg.status = status;
            Events.emit('meshtastic:dm_updated', { nodeId, messages: conversation });
        }
    }
    
    /**
     * Get DM conversation with a specific node
     */
    function getDMConversation(nodeId) {
        return state.dmConversations.get(nodeId) || [];
    }
    
    /**
     * Get all DM contacts (nodes with conversation history)
     */
    function getDMContacts() {
        const contacts = [];
        
        // Add nodes with conversations
        state.dmConversations.forEach((messages, nodeId) => {
            const nodeInfo = state.nodes.get(nodeId);
            const lastMessage = messages[messages.length - 1];
            const unread = state.dmUnreadCounts.get(nodeId) || 0;
            
            contacts.push({
                id: nodeId,
                name: nodeInfo?.name || `Node-${nodeId?.slice(-4) || 'Unknown'}`,
                shortName: nodeInfo?.shortName || '???',
                status: nodeInfo?.status || 'unknown',
                hasKey: state.peerPublicKeys.has(nodeId),
                lastMessage: lastMessage?.text?.substring(0, 30) || '',
                lastMessageTime: lastMessage?.timestamp || 0,
                unreadCount: unread
            });
        });
        
        // Sort by last message time (most recent first)
        contacts.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        
        return contacts;
    }
    
    /**
     * Set active DM contact (viewing their conversation)
     */
    function setActiveDMContact(nodeId) {
        state.activeDMContact = nodeId;
        
        // Mark as read
        if (nodeId) {
            markDMAsRead(nodeId);
            
            // Batch 3: Send read receipts for unread messages
            sendReadReceiptsForContact(nodeId);
        }
        
        Events.emit('meshtastic:active_dm_changed', { nodeId });
    }
    
    /**
     * Clear active DM contact (return to channel view)
     */
    function clearActiveDMContact() {
        state.activeDMContact = null;
        Events.emit('meshtastic:active_dm_changed', { nodeId: null });
    }
    
    /**
     * Get active DM contact
     */
    function getActiveDMContact() {
        return state.activeDMContact;
    }
    
    /**
     * Get DM unread count for a node
     */
    function getDMUnreadCount(nodeId) {
        return state.dmUnreadCounts.get(nodeId) || 0;
    }
    
    /**
     * Get total DM unread count
     */
    function getTotalDMUnreadCount() {
        let total = 0;
        state.dmUnreadCounts.forEach(count => {
            total += count;
        });
        return total;
    }
    
    /**
     * Mark DM conversation as read
     */
    function markDMAsRead(nodeId) {
        state.dmUnreadCounts.set(nodeId, 0);
        saveSettings();
        
        Events.emit('meshtastic:dm_unread_change', { 
            nodeId, 
            unreadCount: 0,
            totalDMUnread: getTotalDMUnreadCount()
        });
    }
    
    /**
     * Increment DM unread count
     */
    function incrementDMUnreadCount(nodeId) {
        const current = state.dmUnreadCounts.get(nodeId) || 0;
        state.dmUnreadCounts.set(nodeId, current + 1);
        saveSettings();
        
        Events.emit('meshtastic:dm_unread_change', { 
            nodeId, 
            unreadCount: current + 1,
            totalDMUnread: getTotalDMUnreadCount()
        });
    }

    // =========================================================================
    // BATCH 3: READ RECEIPTS
    // =========================================================================
    
    /**
     * Send read receipt for a message
     */
    async function sendDMReadReceipt(messageId, toNodeId) {
        if (!state.readReceiptsEnabled) return;
        
        const receipt = {
            type: MessageType.DM_READ,
            originalMessageId: messageId,
            from: state.myNodeId,
            to: toNodeId,
            timestamp: Date.now()
        };
        
        try {
            await sendToDevice(receipt);
            console.log('Sent read receipt for:', messageId);
        } catch (e) {
            console.warn('Failed to send read receipt:', e);
        }
    }
    
    /**
     * Handle incoming read receipt
     */
    function handleDMReadReceipt(message) {
        const originalMessageId = message.originalMessageId;
        
        if (originalMessageId) {
            // Update message status to READ
            updateMessageStatus(originalMessageId, DeliveryStatus.READ);
            
            // Update the message in conversation
            updateDMStatus(message.from, originalMessageId, DeliveryStatus.READ);
            
            console.log(`Read receipt received for message ${originalMessageId}`);
            
            Events.emit('meshtastic:dm_read', { 
                messageId: originalMessageId, 
                readBy: message.from,
                readAt: message.timestamp 
            });
            
            if (state.onReadReceipt) {
                state.onReadReceipt(originalMessageId, message.from);
            }
        }
    }
    
    /**
     * Send read receipts for all unread messages from a contact
     * Called when opening a DM conversation
     */
    async function sendReadReceiptsForContact(nodeId) {
        if (!state.readReceiptsEnabled) return;
        
        const conversation = state.dmConversations.get(nodeId) || [];
        const unreadMessages = conversation.filter(msg => 
            !msg.isSent && !msg.readReceiptSent
        );
        
        for (const msg of unreadMessages) {
            await sendDMReadReceipt(msg.id, nodeId);
            msg.readReceiptSent = true;
        }
        
        // Persist the update
        if (unreadMessages.length > 0) {
            saveDMConversations();
        }
    }
    
    /**
     * Get/set read receipts enabled state
     */
    function isReadReceiptsEnabled() {
        return state.readReceiptsEnabled;
    }
    
    function setReadReceiptsEnabled(enabled) {
        state.readReceiptsEnabled = enabled;
        saveSettings();
        Events.emit('meshtastic:settings_changed', { readReceiptsEnabled: enabled });
    }

    // =========================================================================
    // BATCH 3: MESSAGE RETRY LOGIC
    // =========================================================================
    
    /**
     * Schedule a retry for a failed message
     */
    function scheduleRetry(messageId, message, nodeId) {
        const existingRetry = state.pendingRetries.get(messageId);
        const retryCount = existingRetry ? existingRetry.retryCount + 1 : 1;
        
        if (retryCount > MAX_RETRIES) {
            console.log(`Max retries (${MAX_RETRIES}) reached for message ${messageId}`);
            updateMessageStatus(messageId, DeliveryStatus.FAILED);
            state.pendingRetries.delete(messageId);
            
            Events.emit('meshtastic:message_failed', { 
                messageId, 
                reason: 'max_retries',
                retries: MAX_RETRIES
            });
            return false;
        }
        
        const delay = RETRY_DELAYS[retryCount - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        const nextRetryAt = Date.now() + delay;
        
        // Clear existing timeout if any
        if (existingRetry?.timeout) {
            clearTimeout(existingRetry.timeout);
        }
        
        const timeout = setTimeout(async () => {
            await executeRetry(messageId);
        }, delay);
        
        state.pendingRetries.set(messageId, {
            message,
            nodeId,
            retryCount,
            nextRetryAt,
            timeout
        });
        
        console.log(`Scheduled retry ${retryCount}/${MAX_RETRIES} for message ${messageId} in ${delay/1000}s`);
        
        Events.emit('meshtastic:retry_scheduled', { 
            messageId, 
            retryCount, 
            maxRetries: MAX_RETRIES,
            nextRetryAt
        });
        
        return true;
    }
    
    /**
     * Execute a retry for a pending message
     */
    async function executeRetry(messageId) {
        const retry = state.pendingRetries.get(messageId);
        if (!retry) return;
        
        console.log(`Executing retry ${retry.retryCount}/${MAX_RETRIES} for message ${messageId}`);
        
        try {
            // Re-send the message
            if (retry.message.type === MessageType.DM) {
                // Re-encrypt and send DM
                const encryptedText = await encryptForNode(retry.nodeId, retry.message.text);
                const outgoingMessage = {
                    type: MessageType.DM,
                    from: state.myNodeId,
                    fromName: state.shortName,
                    to: retry.nodeId,
                    encryptedText: encryptedText,
                    timestamp: retry.message.timestamp,
                    id: messageId
                };
                await sendToDevice(outgoingMessage);
            } else {
                // Re-send regular message
                await sendToDevice(retry.message);
            }
            
            // Update status to SENT
            updateMessageStatus(messageId, DeliveryStatus.SENT);
            
            // Set up new ACK timeout
            setupDMAckTimeout(messageId, retry.nodeId);
            
            Events.emit('meshtastic:retry_sent', { 
                messageId, 
                retryCount: retry.retryCount 
            });
            
        } catch (e) {
            console.error(`Retry failed for message ${messageId}:`, e);
            
            // Schedule another retry if we haven't reached max
            if (retry.retryCount < MAX_RETRIES) {
                scheduleRetry(messageId, retry.message, retry.nodeId);
            } else {
                updateMessageStatus(messageId, DeliveryStatus.FAILED);
                state.pendingRetries.delete(messageId);
            }
        }
    }
    
    /**
     * Manually retry a failed message
     */
    async function retryMessage(messageId) {
        const msgState = state.messageStates.get(messageId);
        if (!msgState || msgState.status !== DeliveryStatus.FAILED) {
            console.warn('Cannot retry message - not in FAILED state');
            return false;
        }
        
        // Find the original message
        let originalMessage = null;
        let nodeId = null;
        
        // Check DM conversations
        for (const [contactId, messages] of state.dmConversations) {
            const msg = messages.find(m => m.id === messageId);
            if (msg) {
                originalMessage = msg;
                nodeId = contactId;
                break;
            }
        }
        
        // Check channel messages
        if (!originalMessage) {
            originalMessage = state.messages.find(m => m.id === messageId);
        }
        
        if (!originalMessage) {
            console.warn('Original message not found for retry');
            return false;
        }
        
        // Reset retry count and schedule immediate retry
        state.pendingRetries.delete(messageId);
        
        // Update status to pending
        updateMessageStatus(messageId, DeliveryStatus.PENDING);
        
        // Execute retry immediately
        state.pendingRetries.set(messageId, {
            message: originalMessage,
            nodeId,
            retryCount: 0,
            nextRetryAt: Date.now(),
            timeout: null
        });
        
        await executeRetry(messageId);
        return true;
    }
    
    /**
     * Cancel a pending retry
     */
    function cancelRetry(messageId) {
        const retry = state.pendingRetries.get(messageId);
        if (retry?.timeout) {
            clearTimeout(retry.timeout);
        }
        state.pendingRetries.delete(messageId);
    }
    
    /**
     * Get retry info for a message
     */
    function getRetryInfo(messageId) {
        return state.pendingRetries.get(messageId) || null;
    }

    // =========================================================================
    // BATCH 3: KEY VERIFICATION
    // =========================================================================
    
    /**
     * Generate key fingerprint for verification
     * Returns a short, human-readable fingerprint for comparing keys
     */
    function generateKeyFingerprint(publicKey) {
        // Simple fingerprint: take first 16 chars of base64 and format
        const short = publicKey.substring(0, 16);
        
        // Format as 4 groups of 4 chars
        const formatted = short.match(/.{1,4}/g).join(' ');
        
        return formatted.toUpperCase();
    }
    
    /**
     * Get my public key fingerprint
     */
    async function getMyKeyFingerprint() {
        const publicKey = await getMyPublicKey();
        return generateKeyFingerprint(publicKey);
    }
    
    /**
     * Get a peer's key fingerprint
     */
    function getPeerKeyFingerprint(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        if (!peerData || !peerData.publicKey) {
            return null;
        }
        return generateKeyFingerprint(peerData.publicKey);
    }
    
    /**
     * Mark a peer's key as verified
     */
    function markKeyAsVerified(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        if (!peerData) {
            console.warn('Cannot verify key - no key found for node:', nodeId);
            return false;
        }
        
        peerData.verified = true;
        peerData.verifiedAt = Date.now();
        state.peerPublicKeys.set(nodeId, peerData);
        savePeerKeys();
        
        Events.emit('meshtastic:key_verified', { nodeId });
        
        if (typeof ModalsModule !== 'undefined') {
            const node = state.nodes.get(nodeId);
            const name = node?.name || nodeId?.slice(-4) || 'Unknown';
            ModalsModule.showToast(`✅ Key verified for ${name}`, 'success');
        }
        
        return true;
    }
    
    /**
     * Mark a peer's key as unverified
     */
    function markKeyAsUnverified(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        if (!peerData) return false;
        
        peerData.verified = false;
        peerData.verifiedAt = null;
        state.peerPublicKeys.set(nodeId, peerData);
        savePeerKeys();
        
        Events.emit('meshtastic:key_unverified', { nodeId });
        return true;
    }
    
    /**
     * Check if a peer's key is verified
     */
    function isKeyVerified(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        return peerData?.verified === true;
    }
    
    /**
     * Get verification status for a peer
     */
    function getKeyVerificationStatus(nodeId) {
        const peerData = state.peerPublicKeys.get(nodeId);
        if (!peerData) {
            return { hasKey: false, verified: false };
        }
        return {
            hasKey: true,
            verified: peerData.verified === true,
            verifiedAt: peerData.verifiedAt || null,
            fingerprint: generateKeyFingerprint(peerData.publicKey)
        };
    }

    // =========================================================================
    // BATCH 3: MESSAGE MANAGEMENT
    // =========================================================================
    
    /**
     * Delete a message (hide from view)
     */
    function deleteMessage(messageId, isDM = false, nodeId = null) {
        state.deletedMessageIds.add(messageId);
        saveDeletedMessages();
        
        // Remove from conversation if DM
        if (isDM && nodeId) {
            const conversation = state.dmConversations.get(nodeId);
            if (conversation) {
                const index = conversation.findIndex(m => m.id === messageId);
                if (index !== -1) {
                    conversation.splice(index, 1);
                    state.dmConversations.set(nodeId, conversation);
                    saveDMConversations();
                }
            }
        }
        
        // Remove from channel messages
        const msgIndex = state.messages.findIndex(m => m.id === messageId);
        if (msgIndex !== -1) {
            state.messages.splice(msgIndex, 1);
            saveMessages();
        }
        
        Events.emit('meshtastic:message_deleted', { messageId, isDM, nodeId });
        
        return true;
    }
    
    /**
     * Check if a message is deleted
     */
    function isMessageDeleted(messageId) {
        return state.deletedMessageIds.has(messageId);
    }
    
    /**
     * Copy message text to clipboard
     */
    async function copyMessageText(messageId, isDM = false, nodeId = null) {
        let message = null;
        
        // Find in DM conversations
        if (isDM && nodeId) {
            const conversation = state.dmConversations.get(nodeId);
            message = conversation?.find(m => m.id === messageId);
        }
        
        // Find in channel messages
        if (!message) {
            message = state.messages.find(m => m.id === messageId);
        }
        
        if (!message || !message.text) {
            return false;
        }
        
        try {
            await navigator.clipboard.writeText(message.text);
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Message copied to clipboard', 'success');
            }
            
            return true;
        } catch (e) {
            console.warn('Failed to copy to clipboard:', e);
            return false;
        }
    }
    
    /**
     * Get message details for context menu
     */
    function getMessageDetails(messageId, isDM = false, nodeId = null) {
        let message = null;
        
        // Find in DM conversations
        if (isDM && nodeId) {
            const conversation = state.dmConversations.get(nodeId);
            message = conversation?.find(m => m.id === messageId);
        }
        
        // Find in channel messages
        if (!message) {
            message = state.messages.find(m => m.id === messageId);
        }
        
        if (!message) return null;
        
        const msgState = state.messageStates.get(messageId);
        const retryInfo = state.pendingRetries.get(messageId);
        
        return {
            ...message,
            deliveryStatus: msgState?.status || null,
            canRetry: msgState?.status === DeliveryStatus.FAILED,
            isRetrying: retryInfo !== undefined,
            retryCount: retryInfo?.retryCount || 0,
            nextRetryAt: retryInfo?.nextRetryAt || null
        };
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
     * Handle acknowledgment - update message delivery status
     */
    function handleAck(message) {
        const originalMessageId = message.originalMessageId;
        
        if (originalMessageId) {
            // Clear pending ACK timeout
            const pending = state.pendingAcks.get(originalMessageId);
            if (pending) {
                clearTimeout(pending.timeout);
                state.pendingAcks.delete(originalMessageId);
            }
            
            // Update delivery status to DELIVERED
            updateMessageStatus(originalMessageId, DeliveryStatus.DELIVERED);
            
            console.log(`ACK received for message ${originalMessageId}`);
        }
        
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
            nodeName: state.longName,
            shortName: state.shortName,
            activeChannelId: state.activeChannelId
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
            case 'channel': state.onChannelChange = callback; break;
            case 'unread': state.onUnreadChange = callback; break;
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
        getActiveChannelMessages,
        getMessageStatus,
        
        // Channels
        getChannels,
        getChannel,
        getActiveChannel,
        setActiveChannel,
        createChannel,
        importChannel,
        deleteChannel,
        exportChannel,
        
        // Unread tracking (channels)
        getUnreadCount,
        getTotalUnreadCount,
        getAllUnreadCounts,
        markChannelAsRead,
        
        // PKI (Public Key Infrastructure)
        generateKeyPair,
        getMyPublicKey,
        broadcastPublicKey,
        requestPublicKey,
        canSendDMTo,
        getDMCapableNodes,
        isCryptoAvailable,
        
        // Direct Messages
        sendDirectMessage,
        getDMConversation,
        getDMContacts,
        setActiveDMContact,
        clearActiveDMContact,
        getActiveDMContact,
        getDMUnreadCount,
        getTotalDMUnreadCount,
        markDMAsRead,
        
        // Batch 3: Read Receipts
        isReadReceiptsEnabled,
        setReadReceiptsEnabled,
        sendDMReadReceipt,
        
        // Batch 3: Message Retry
        retryMessage,
        cancelRetry,
        getRetryInfo,
        
        // Batch 3: Key Verification
        getMyKeyFingerprint,
        getPeerKeyFingerprint,
        markKeyAsVerified,
        markKeyAsUnverified,
        isKeyVerified,
        getKeyVerificationStatus,
        
        // Batch 3: Message Management
        deleteMessage,
        isMessageDeleted,
        copyMessageText,
        getMessageDetails,
        
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
        MessageType,
        DeliveryStatus
    };
})();

window.MeshtasticModule = MeshtasticModule;
