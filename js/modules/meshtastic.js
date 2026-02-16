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
        DM_READ: 'dm_read',              // DM read receipt
        // Traceroute types
        TRACEROUTE_REQUEST: 'traceroute_request',   // Request route to destination
        TRACEROUTE_REPLY: 'traceroute_reply'        // Route path response
    };
    
    // Message delivery status
    const DeliveryStatus = {
        QUEUED: 'queued',       // Queued offline, waiting for connectivity
        PENDING: 'pending',     // Queued for sending (connected)
        SENT: 'sent',           // Sent to mesh (no ACK yet)
        DELIVERED: 'delivered', // ACK received from recipient
        READ: 'read',           // Read receipt received
        FAILED: 'failed'        // Send failed or timed out
    };
    
    // =========================================================================
    // PHASE 1.5: STORE-AND-FORWARD QUEUE CONSTANTS
    // =========================================================================
    
    const QUEUE_MAX_SIZE = 50;           // Maximum queued messages
    const QUEUE_RETRY_INTERVAL = 5000;   // Check queue every 5 seconds when connected
    const QUEUE_MAX_RETRIES = 5;         // Max retry attempts per message
    const QUEUE_RETRY_BACKOFF = 2;       // Exponential backoff multiplier
    const QUEUE_STORAGE_KEY = 'meshtastic_message_queue';
    
    // =========================================================================
    // PHASE 1: DEVICE CONFIGURATION CONSTANTS
    // =========================================================================
    
    // Meshtastic Region Codes (from meshtastic/config.proto)
    const RegionCode = {
        UNSET: 0,
        US: 1,          // United States (915 MHz)
        EU_433: 2,      // European Union 433 MHz
        EU_868: 3,      // European Union 868 MHz
        CN: 4,          // China
        JP: 5,          // Japan
        ANZ: 6,         // Australia/New Zealand
        KR: 7,          // Korea
        TW: 8,          // Taiwan
        RU: 9,          // Russia
        IN: 10,         // India
        NZ_865: 11,     // New Zealand 865 MHz
        TH: 12,         // Thailand
        LORA_24: 13,    // 2.4 GHz (worldwide)
        UA_433: 14,     // Ukraine 433 MHz
        UA_868: 15,     // Ukraine 868 MHz
        MY_433: 16,     // Malaysia 433 MHz
        MY_919: 17,     // Malaysia 919 MHz
        SG_923: 18,     // Singapore 923 MHz
        PH_433: 19,     // Philippines 433 MHz
        PH_868: 20,     // Philippines 868 MHz
        PH_915: 21      // Philippines 915 MHz
    };
    
    // Human-readable region names
    const RegionNames = {
        0: 'Unset',
        1: 'US (915 MHz)',
        2: 'EU 433 MHz',
        3: 'EU 868 MHz',
        4: 'China',
        5: 'Japan',
        6: 'ANZ (Australia/NZ)',
        7: 'Korea',
        8: 'Taiwan',
        9: 'Russia',
        10: 'India',
        11: 'NZ 865 MHz',
        12: 'Thailand',
        13: 'LoRa 2.4 GHz',
        14: 'Ukraine 433',
        15: 'Ukraine 868',
        16: 'Malaysia 433',
        17: 'Malaysia 919',
        18: 'Singapore 923',
        19: 'Philippines 433',
        20: 'Philippines 868',
        21: 'Philippines 915'
    };
    
    // Modem Presets (from meshtastic/config.proto)
    const ModemPreset = {
        LONG_FAST: 0,       // Long range, fast (default)
        LONG_SLOW: 1,       // Long range, slow (best range)
        VERY_LONG_SLOW: 2,  // Very long range, very slow
        MEDIUM_SLOW: 3,     // Medium range, slow
        MEDIUM_FAST: 4,     // Medium range, fast
        SHORT_SLOW: 5,      // Short range, slow
        SHORT_FAST: 6,      // Short range, fast (high throughput)
        LONG_MODERATE: 7    // Long range, moderate speed
    };
    
    // Human-readable modem preset names with details
    const ModemPresetInfo = {
        0: { name: 'Long Fast', range: 'Long', speed: 'Fast', description: 'Default - good balance' },
        1: { name: 'Long Slow', range: 'Very Long', speed: 'Slow', description: 'Maximum range, slower messages' },
        2: { name: 'Very Long Slow', range: 'Extreme', speed: 'Very Slow', description: 'Best range, slowest speed' },
        3: { name: 'Medium Slow', range: 'Medium', speed: 'Slow', description: 'Balanced' },
        4: { name: 'Medium Fast', range: 'Medium', speed: 'Fast', description: 'Faster messages, less range' },
        5: { name: 'Short Slow', range: 'Short', speed: 'Slow', description: 'Dense areas' },
        6: { name: 'Short Fast', range: 'Short', speed: 'Very Fast', description: 'High throughput, short range' },
        7: { name: 'Long Moderate', range: 'Long', speed: 'Moderate', description: 'Long range with better speed' }
    };
    
    // TX Power Levels (dBm) - device-dependent but common values
    const TxPowerLevels = [1, 2, 5, 7, 10, 12, 14, 17, 20, 22, 27, 30];
    
    // Hop Limit range
    const HOP_LIMIT_MIN = 1;
    const HOP_LIMIT_MAX = 7;
    const HOP_LIMIT_DEFAULT = 3;
    
    // Firmware version checking
    const MIN_RECOMMENDED_FIRMWARE = '2.3.0';
    const LATEST_STABLE_FIRMWARE = '2.5.6';
    
    // Signal quality thresholds
    const SignalQuality = {
        EXCELLENT: { snr: 10, rssi: -70 },
        GOOD: { snr: 5, rssi: -85 },
        FAIR: { snr: 0, rssi: -100 },
        POOR: { snr: -5, rssi: -115 }
    };
    
    // =========================================================================
    // PHASE 2: QUICK SETUP & FIELD UX CONSTANTS
    // =========================================================================
    
    // Scenario Presets - optimized settings for different use cases
    const ScenarioPresets = {
        SAR: {
            id: 'sar',
            name: 'Search & Rescue',
            icon: '🔍',
            description: 'Maximum range for wilderness SAR operations',
            settings: {
                modemPreset: ModemPreset.LONG_SLOW,
                hopLimit: 5,
                positionBroadcastSecs: 120,  // 2 min - frequent updates
                isRouter: false
            },
            cannedMessages: ['Found subject', 'Need medical', 'Grid clear', 'Returning to CP', 'At assignment', 'Copy all'],
            color: '#f59e0b'  // Amber
        },
        FIELD_EXERCISE: {
            id: 'field_exercise',
            name: 'Field Exercise',
            icon: '🎯',
            description: 'Training and practice scenarios',
            settings: {
                modemPreset: ModemPreset.LONG_FAST,
                hopLimit: 4,
                positionBroadcastSecs: 300,  // 5 min
                isRouter: false
            },
            cannedMessages: ['In position', 'Moving', 'Checkpoint', 'Complete', 'Standing by', 'Roger'],
            color: '#3b82f6'  // Blue
        },
        EVENT: {
            id: 'event',
            name: 'Event Coverage',
            icon: '🎪',
            description: 'Festivals, races, public events',
            settings: {
                modemPreset: ModemPreset.MEDIUM_FAST,
                hopLimit: 3,
                positionBroadcastSecs: 180,  // 3 min
                isRouter: false
            },
            cannedMessages: ['All clear', 'Need assist', 'Break time', 'Shift change', 'Medical needed', 'Copy'],
            color: '#8b5cf6'  // Purple
        },
        LOW_PROFILE: {
            id: 'low_profile',
            name: 'Low Profile',
            icon: '🤫',
            description: 'Minimal transmissions, battery saving',
            settings: {
                modemPreset: ModemPreset.LONG_MODERATE,
                hopLimit: 2,
                positionBroadcastSecs: 900,  // 15 min - minimal
                isRouter: false
            },
            cannedMessages: ['OK', 'Moving', 'Hold', 'RTB', 'Copy'],
            color: '#6b7280'  // Gray
        },
        EMERGENCY: {
            id: 'emergency',
            name: 'Emergency',
            icon: '🚨',
            description: 'Crisis response, max reliability',
            settings: {
                modemPreset: ModemPreset.VERY_LONG_SLOW,
                hopLimit: 7,  // Maximum
                positionBroadcastSecs: 60,   // 1 min - very frequent
                isRouter: false
            },
            cannedMessages: ['SOS', 'Need evac', 'Injured', 'Safe', 'Send help', 'Location sent'],
            color: '#ef4444'  // Red
        },
        CUSTOM: {
            id: 'custom',
            name: 'Custom',
            icon: '⚙️',
            description: 'User-defined settings',
            settings: null,  // Uses current device settings
            cannedMessages: ['OK', 'Copy', 'Moving', 'At rally', 'RTB', 'Need assist'],
            color: '#22c55e'  // Green
        }
    };
    
    // Default canned messages (fallback)
    const DefaultCannedMessages = [
        { id: 'ok', text: 'OK', icon: '✓', shortcut: '1' },
        { id: 'copy', text: 'Copy', icon: '📋', shortcut: '2' },
        { id: 'moving', text: 'Moving', icon: '🚶', shortcut: '3' },
        { id: 'at_rally', text: 'At rally point', icon: '📍', shortcut: '4' },
        { id: 'rtb', text: 'RTB', icon: '🏠', shortcut: '5' },
        { id: 'need_assist', text: 'Need assistance', icon: '🆘', shortcut: '6' },
        { id: 'holding', text: 'Holding position', icon: '⏸️', shortcut: '7' },
        { id: 'complete', text: 'Task complete', icon: '✅', shortcut: '8' }
    ];
    
    // First-run wizard steps
    const WizardSteps = {
        WELCOME: 'welcome',
        NAME: 'name',
        REGION: 'region',
        PAIR: 'pair',
        SCENARIO: 'scenario',
        COMPLETE: 'complete'
    };
    
    // Mesh health thresholds
    const MeshHealthThresholds = {
        NODES_EXCELLENT: 5,    // 5+ nodes = excellent
        NODES_GOOD: 3,         // 3-4 nodes = good
        NODES_FAIR: 1,         // 1-2 nodes = fair
        UPDATE_STALE: 300000,  // 5 minutes
        UPDATE_OLD: 600000     // 10 minutes
    };
    
    // =========================================================================
    // TIMING CONSTANTS
    // =========================================================================
    
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
    const MAX_LORA_PAYLOAD = 228; // Conservative LoRa text payload limit
    // DM text limit: encrypted text (base64) + JSON envelope must fit in LoRa payload.
    // Envelope ~100 bytes, leaving ~128 base64 chars = ~96 raw bytes - 28 AES-GCM overhead = ~68.
    const MAX_DM_TEXT_SIZE = 65;
    
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
        usingRealClient: false, // true when connected via MeshtasticClient (real library)
        autoReconnect: false,      // Persist: attempt reconnect on page load
        lastConnectionType: null,  // Persist: 'bluetooth' or 'serial' (for reconnect)
        lastBleDeviceName: null,   // Persist: BLE device name (for reconnect matching)
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
        
        // Phase 1: Device Configuration
        deviceConfig: {
            region: RegionCode.UNSET,
            modemPreset: ModemPreset.LONG_FAST,
            txPower: 0,           // 0 = use device default
            hopLimit: HOP_LIMIT_DEFAULT,
            isRouter: false,
            positionBroadcastSecs: 900,   // 15 minutes default
            gpsUpdateInterval: 30,         // seconds
            // Firmware info
            firmwareVersion: null,
            hwModel: null,
            hwModelName: null,
            hasGPS: false,
            hasBluetooth: true,
            hasWifi: false,
            numBands: 1,
            // Config loaded flag
            configLoaded: false
        },
        
        // Team tracking
        nodes: new Map(), // nodeNum -> nodeInfo (now includes SNR/RSSI)
        messages: [],     // Message history (all channels)
        
        // Channel management
        channels: [...DEFAULT_CHANNELS], // Available channels
        activeChannelId: 'primary',      // Currently selected channel
        
        // Message state tracking
        messageStates: new Map(),        // messageId -> { status, sentAt, ackAt, retries }
        channelReadState: new Map(),     // channelId -> { lastReadAt, lastReadMessageId }
        pendingAcks: new Map(),          // messageId -> { timeout, message }
        packetIdToMessageId: new Map(),  // Meshtastic packetId -> GridDown messageId (for ACK bridging)
        
        // Phase 1.5: Store-and-Forward Queue
        outboundQueue: [],               // Messages waiting to be sent
        queueProcessorInterval: null,    // Interval for processing queue
        lastQueueProcessTime: 0,         // Timestamp of last queue process
        meshConnectivityStatus: 'unknown', // 'connected', 'partial', 'disconnected', 'unknown'
        
        // Phase 2: Quick Setup & Field UX
        activeScenario: 'custom',        // Current scenario preset ID
        customCannedMessages: [],        // User-customized canned messages
        wizardCompleted: false,          // Has user completed first-run wizard
        meshHealthCache: null,           // Cached mesh health status
        lastHealthUpdate: 0,             // Timestamp of last health calculation
        
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
        
        // Traceroute tracking
        traceroutes: new Map(),          // requestId -> { targetNodeId, startedAt, status, route, hops, rtt }
        activeTraceroute: null,          // Currently displayed traceroute requestId
        tracerouteHistory: [],           // Array of completed traceroutes for history
        _pendingTracerouteTarget: null,  // nodeNum of pending native traceroute
        _pendingTracerouteRequestId: null, // requestId of pending native traceroute
        
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
        
        // Load saved settings then attempt auto-reconnect if previously connected
        loadSettings().then(() => {
            if (state.autoReconnect && state.lastConnectionType) {
                attemptAutoReconnect();
            }
        });
        
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
            
            // Phase 1.5: Load outbound message queue
            await loadOutboundQueue();
            
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
            
            // Phase 2: Load wizard and scenario settings
            const phase2Settings = await Storage.Settings.get('meshtastic_phase2');
            if (phase2Settings) {
                state.wizardCompleted = phase2Settings.wizardCompleted || false;
                state.activeScenario = phase2Settings.activeScenario || 'custom';
                state.customCannedMessages = phase2Settings.customCannedMessages || [];
            }
            
            // Load traceroute history
            const savedTraceroutes = await Storage.Settings.get('meshtastic_traceroute_history');
            if (savedTraceroutes && Array.isArray(savedTraceroutes)) {
                state.tracerouteHistory = savedTraceroutes.slice(0, 20);
            }
            
            // Load auto-reconnect state
            const reconnectState = await Storage.Settings.get('meshtastic_reconnect');
            if (reconnectState) {
                state.autoReconnect = reconnectState.autoReconnect || false;
                state.lastConnectionType = reconnectState.lastConnectionType || null;
                state.lastBleDeviceName = reconnectState.lastBleDeviceName || null;
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
            
            // Phase 2: Save wizard and scenario settings
            await Storage.Settings.set('meshtastic_phase2', {
                wizardCompleted: state.wizardCompleted,
                activeScenario: state.activeScenario,
                customCannedMessages: state.customCannedMessages
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
     * Save auto-reconnect state (separate from main settings for clarity)
     */
    async function saveReconnectState() {
        try {
            await Storage.Settings.set('meshtastic_reconnect', {
                autoReconnect: state.autoReconnect,
                lastConnectionType: state.lastConnectionType,
                lastBleDeviceName: state.lastBleDeviceName
            });
        } catch (e) {
            console.warn('Could not save reconnect state:', e);
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
     * Attempt silent auto-reconnect to previously connected device.
     * Called from init() after loadSettings() completes.
     * 
     * BLE: Uses navigator.bluetooth.getDevices() (Chrome 85+) — no user gesture.
     * Serial: Uses navigator.serial.getPorts() — no user gesture.
     * If silent reconnect fails, shows toast prompting user to reconnect manually.
     */
    async function attemptAutoReconnect() {
        if (!state.autoReconnect || !state.lastConnectionType) {
            return;
        }
        
        console.log(`[Meshtastic] Auto-reconnect: attempting ${state.lastConnectionType} (device: ${state.lastBleDeviceName || 'unknown'})`);
        
        if (state.lastConnectionType === 'bluetooth') {
            await attemptBleReconnect();
        } else if (state.lastConnectionType === 'serial') {
            // Serial auto-reconnect not yet implemented — getPorts() could enable
            // this in the future, but transport library integration needs work
            console.log('[Meshtastic] Auto-reconnect: Serial reconnect not yet supported');
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Meshtastic serial: tap Connect to restore', 'info');
            }
        }
    }
    
    /**
     * Attempt BLE reconnect using getDevices() API (no user gesture required).
     * Uses MeshtasticClient.reconnectBLE() which probes previously paired devices.
     */
    async function attemptBleReconnect() {
        // Check browser API support
        if (!navigator.bluetooth?.getDevices) {
            console.log('[Meshtastic] Auto-reconnect: getDevices() not available');
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Meshtastic: tap Connect to restore BLE', 'info');
            }
            return;
        }
        
        // Need MeshtasticClient with reconnectBLE
        if (typeof MeshtasticClient === 'undefined' || !MeshtasticClient.reconnectBLE) {
            console.log('[Meshtastic] Auto-reconnect: MeshtasticClient.reconnectBLE not available');
            return;
        }
        
        // Wait for MeshtasticClient libraries to load (may still be loading on page init)
        if (!MeshtasticClient.isReady || !MeshtasticClient.isReady()) {
            console.log('[Meshtastic] Auto-reconnect: Waiting for MeshtasticClient libraries...');
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Library load timeout')), 15000);
                    window.addEventListener('meshtastic-client-ready', () => {
                        clearTimeout(timeout);
                        resolve();
                    }, { once: true });
                    // Check again in case it became ready while we were setting up listener
                    if (MeshtasticClient.isReady && MeshtasticClient.isReady()) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            } catch (e) {
                console.warn('[Meshtastic] Auto-reconnect: Libraries not available:', e.message);
                return;
            }
        }
        
        setConnectionState(ConnectionState.CONNECTING);
        
        try {
            // Setup callbacks before reconnecting
            setupMeshtasticClientCallbacks();
            
            // Attempt silent reconnect
            const result = await MeshtasticClient.reconnectBLE(state.lastBleDeviceName);
            
            // Success — mirror the connectBluetooth() success path
            state.connectionType = 'bluetooth';
            state.myNodeNum = result.nodeNum;
            state.usingRealClient = true;
            
            const selfNode = result.nodeNum ? 
                (MeshtasticClient.getNodes().find(n => n.num === result.nodeNum)) : null;
            state.myNodeId = selfNode?.id || result.nodeInfo?.user?.id || nodeNumToId(result.nodeNum);
            if (selfNode?.longName || result.nodeInfo?.user?.longName) {
                state.longName = selfNode?.longName || result.nodeInfo?.user?.longName;
            }
            if (selfNode?.shortName || result.nodeInfo?.user?.shortName) {
                state.shortName = selfNode?.shortName || result.nodeInfo?.user?.shortName;
            }
            
            if (result.config) {
                syncDeviceConfigFromClient(result.config);
            }
            
            setConnectionState(ConnectionState.CONNECTED);
            startPositionBroadcast();
            
            // Update stored device name in case it was resolved during reconnect
            state.lastBleDeviceName = MeshtasticClient.getLastBleDeviceName?.() || state.lastBleDeviceName;
            saveReconnectState();
            
            console.log('[Meshtastic] ✅ Auto-reconnect successful');
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Meshtastic reconnected', 'success');
            }
            
        } catch (error) {
            console.warn('[Meshtastic] Auto-reconnect failed:', error.message);
            setConnectionState(ConnectionState.DISCONNECTED);
            
            // Don't clear autoReconnect — next refresh should try again
            // (device may just be temporarily out of range)
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Meshtastic: tap Connect to restore BLE', 'info');
            }
        }
    }
    
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
            // Use MeshtasticClient for real device communication if available
            if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isReady && MeshtasticClient.isReady()) {
                console.log('Using MeshtasticClient for real device communication');
                
                // Setup callbacks before connecting
                setupMeshtasticClientCallbacks();
                
                // Connect via real client
                const result = await MeshtasticClient.connectBLE();
                
                state.connectionType = 'bluetooth';
                state.myNodeNum = result.nodeNum;
                state.usingRealClient = true;
                
                // Resolve our own identity from the device's node database
                // The onMyNodeInfo event provides nodeNum but not user details,
                // while onNodeInfoPacket populates the nodes map with longName/shortName
                const selfNode = result.nodeNum ? 
                    (MeshtasticClient.getNodes().find(n => n.num === result.nodeNum)) : null;
                state.myNodeId = selfNode?.id || result.nodeInfo?.user?.id || nodeNumToId(result.nodeNum);
                if (selfNode?.longName || result.nodeInfo?.user?.longName) {
                    state.longName = selfNode?.longName || result.nodeInfo?.user?.longName;
                }
                if (selfNode?.shortName || result.nodeInfo?.user?.shortName) {
                    state.shortName = selfNode?.shortName || result.nodeInfo?.user?.shortName;
                }
                
                // Sync device config from real device
                if (result.config) {
                    syncDeviceConfigFromClient(result.config);
                }
                
                setConnectionState(ConnectionState.CONNECTED);
                
                // Start position broadcasting
                startPositionBroadcast();
                
                // Save auto-reconnect state for page reload recovery
                state.autoReconnect = true;
                state.lastConnectionType = 'bluetooth';
                state.lastBleDeviceName = MeshtasticClient.getLastBleDeviceName?.() || null;
                saveReconnectState();
                
                return true;
            }
            
            // Fallback: Use basic BLE connection (original implementation)
            console.log('MeshtasticClient not available, using basic BLE');
            
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
            
            // Save auto-reconnect state (basic BLE path)
            state.autoReconnect = true;
            state.lastConnectionType = 'bluetooth';
            state.lastBleDeviceName = state.device?.name || null;
            saveReconnectState();
            
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
            // Use MeshtasticClient for real device communication if available
            if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isReady && MeshtasticClient.isReady()) {
                console.log('Using MeshtasticClient for real Serial communication');
                
                // Setup callbacks before connecting
                setupMeshtasticClientCallbacks();
                
                // Connect via real client
                const result = await MeshtasticClient.connectSerial();
                
                state.connectionType = 'serial';
                state.myNodeNum = result.nodeNum;
                state.usingRealClient = true;
                
                // Resolve our own identity (same as BLE path)
                const selfNode = result.nodeNum ? 
                    (MeshtasticClient.getNodes().find(n => n.num === result.nodeNum)) : null;
                state.myNodeId = selfNode?.id || result.nodeInfo?.user?.id || nodeNumToId(result.nodeNum);
                if (selfNode?.longName || result.nodeInfo?.user?.longName) {
                    state.longName = selfNode?.longName || result.nodeInfo?.user?.longName;
                }
                if (selfNode?.shortName || result.nodeInfo?.user?.shortName) {
                    state.shortName = selfNode?.shortName || result.nodeInfo?.user?.shortName;
                }
                
                // Sync device config from real device
                if (result.config) {
                    syncDeviceConfigFromClient(result.config);
                }
                
                setConnectionState(ConnectionState.CONNECTED);
                
                // Start position broadcasting
                startPositionBroadcast();
                
                // Save auto-reconnect state for page reload recovery
                state.autoReconnect = true;
                state.lastConnectionType = 'serial';
                state.lastBleDeviceName = null;
                saveReconnectState();
                
                return true;
            }
            
            // Fallback: Use basic serial connection (original implementation)
            console.log('MeshtasticClient not available, using basic Serial');
            
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
            
            // Save auto-reconnect state (basic serial path)
            state.autoReconnect = true;
            state.lastConnectionType = 'serial';
            state.lastBleDeviceName = null;
            saveReconnectState();
            
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
        
        // User explicitly disconnected — don't auto-reconnect on next load
        state.autoReconnect = false;
        saveReconnectState();
        
        // Use MeshtasticClient if it's managing the connection
        if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isConnected && MeshtasticClient.isConnected()) {
            await MeshtasticClient.disconnect();
        }
        
        // Also handle legacy/fallback connections
        if (state.connectionType === 'bluetooth' && state.device?.gatt?.connected) {
            state.device.gatt.disconnect();
        }
        
        if (state.connectionType === 'serial') {
            if (state.reader) {
                try {
                    await state.reader.cancel();
                    state.reader.releaseLock();
                } catch (e) { /* ignore */ }
            }
            if (state.writer) {
                try {
                    await state.writer.close();
                } catch (e) { /* ignore */ }
            }
            if (state.port) {
                try {
                    await state.port.close();
                } catch (e) { /* ignore */ }
            }
        }
        
        state.device = null;
        state.port = null;
        state.reader = null;
        state.writer = null;
        state.characteristic = null;
        state.usingRealClient = false;
        state.packetIdToMessageId.clear();
        
        setConnectionState(ConnectionState.DISCONNECTED);
    }
    
    /**
     * Setup callbacks to sync MeshtasticClient events with GridDown state
     */
    function setupMeshtasticClientCallbacks() {
        if (typeof MeshtasticClient === 'undefined') return;
        
        // Config received from device
        MeshtasticClient.setCallback('onConfigReceived', (config) => {
            console.log('[Meshtastic] Real device config received:', config);
            syncDeviceConfigFromClient(config);
            Events.emit('meshtastic:config_loaded', state.deviceConfig);
        });
        
        // Node updates from mesh
        MeshtasticClient.setCallback('onNodeUpdate', (node) => {
            handleNodeInfoFromClient(node);
        });
        
        // Position updates from mesh
        MeshtasticClient.setCallback('onPosition', (position) => {
            handlePositionFromClient(position);
        });
        
        // Messages from mesh
        MeshtasticClient.setCallback('onMessage', (message) => {
            handleMessageFromClient(message);
        });
        
        // Transport-level ACK/NACK - bridge to GridDown delivery status tracking
        MeshtasticClient.setCallback('onAck', (ack) => {
            handleTransportAck(ack);
        });
        
        // Native firmware traceroute response
        MeshtasticClient.setCallback('onTraceroute', (data) => {
            console.log('[Meshtastic] Native traceroute response:', data);
            handleNativeTracerouteResponse(data);
        });
        
        // Channel updates from device — sync device channels into GridDown state
        MeshtasticClient.setCallback('onChannelUpdate', (deviceChannels) => {
            syncChannelsFromDevice(deviceChannels);
        });
        
        // Disconnect event
        MeshtasticClient.setCallback('onDisconnect', () => {
            console.log('[Meshtastic] Device disconnected');
            state.usingRealClient = false;
            setConnectionState(ConnectionState.DISCONNECTED);
            stopPositionBroadcast();
        });
    }
    
    /**
     * Sync device config from MeshtasticClient to GridDown state
     */
    function syncDeviceConfigFromClient(config) {
        if (!config) return;
        
        state.deviceConfig.region = config.region ?? state.deviceConfig.region;
        state.deviceConfig.modemPreset = config.modemPreset ?? state.deviceConfig.modemPreset;
        state.deviceConfig.txPower = config.txPower ?? state.deviceConfig.txPower;
        state.deviceConfig.hopLimit = config.hopLimit ?? state.deviceConfig.hopLimit;
        state.deviceConfig.firmwareVersion = config.firmwareVersion ?? state.deviceConfig.firmwareVersion;
        state.deviceConfig.hwModel = config.hwModel ?? state.deviceConfig.hwModel;
        state.deviceConfig.hwModelName = config.hwModelName || getHwModelName(config.hwModel);
        state.deviceConfig.usePreset = config.usePreset ?? state.deviceConfig.usePreset;
        state.deviceConfig.bandwidth = config.bandwidth ?? state.deviceConfig.bandwidth;
        state.deviceConfig.spreadFactor = config.spreadFactor ?? state.deviceConfig.spreadFactor;
        state.deviceConfig.codingRate = config.codingRate ?? state.deviceConfig.codingRate;
        state.deviceConfig.txEnabled = config.txEnabled ?? state.deviceConfig.txEnabled;
        state.deviceConfig.channelNum = config.channelNum ?? state.deviceConfig.channelNum;
        state.deviceConfig.positionBroadcastSecs = config.positionBroadcastSecs ?? state.deviceConfig.positionBroadcastSecs;
        state.deviceConfig.gpsUpdateInterval = config.gpsUpdateInterval ?? state.deviceConfig.gpsUpdateInterval;
        state.deviceConfig.configLoaded = true;
        
        // Save to storage
        saveDeviceConfig();
        
        console.log('[Meshtastic] Device config synced:', state.deviceConfig);
    }
    
    /**
     * Sync channels from the real Meshtastic device into GridDown state.
     * Replaces the hardcoded defaults with the actual device channel configuration
     * so that channel indices in sendText() match the device.
     *
     * Device channels use:  index (0-7), role (0=DISABLED, 1=PRIMARY, 2=SECONDARY), name, psk
     * GridDown channels use: id (string), index, name, psk, isDefault, isPrivate
     */
    function syncChannelsFromDevice(deviceChannels) {
        if (!deviceChannels || !Array.isArray(deviceChannels)) return;
        
        const synced = [];
        
        for (let i = 0; i < deviceChannels.length; i++) {
            const dc = deviceChannels[i];
            if (!dc || dc.role === 0) continue; // Skip disabled/null slots
            
            const name = dc.name || (dc.role === 1 ? 'Primary' : `Channel ${dc.index}`);
            const id = dc.role === 1 ? 'primary' : `device-ch${dc.index}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            
            synced.push({
                id,
                index: dc.index,
                name,
                psk: dc.psk || null,
                isDefault: dc.role === 1,
                isPrivate: !!dc.psk,
                fromDevice: true  // Flag so we know this came from device sync
            });
        }
        
        if (synced.length === 0) return; // No valid channels — keep existing
        
        // Preserve any custom channels that are local-only (not from device) and
        // not conflicting with device channel indices
        const deviceIndices = new Set(synced.map(c => c.index));
        const localOnly = state.channels.filter(c => !c.fromDevice && !c.isDefault && !deviceIndices.has(c.index));
        
        state.channels = [...synced, ...localOnly];
        
        // Ensure active channel still exists
        if (!state.channels.find(c => c.id === state.activeChannelId)) {
            state.activeChannelId = synced[0]?.id || 'primary';
        }
        
        // Initialize read state for new channels
        state.channels.forEach(channel => {
            if (!state.channelReadState.has(channel.id)) {
                state.channelReadState.set(channel.id, {
                    lastReadAt: Date.now(),
                    lastReadMessageId: null
                });
            }
        });
        
        saveSettings();
        Events.emit('meshtastic:channels_synced', { channels: state.channels });
        console.log(`[Meshtastic] Synced ${synced.length} channels from device:`, synced.map(c => `[${c.index}] ${c.name}`).join(', '));
    }
    
    /**
     * Handle node info from MeshtasticClient
     */
    function handleNodeInfoFromClient(clientNode) {
        const nodeId = clientNode.id || nodeNumToId(clientNode.num) || 'unknown';
        
        let node = state.nodes.get(nodeId);
        if (!node) {
            node = { id: nodeId };
            state.nodes.set(nodeId, node);
        }
        
        node.num = clientNode.num;
        node.name = clientNode.longName || node.name;
        node.shortName = clientNode.shortName || node.shortName;
        node.hwModel = clientNode.hwModel;
        node.hwModelName = getHwModelName(clientNode.hwModel);
        node.firmwareVersion = clientNode.firmwareVersion;
        node.lastSeen = clientNode.lastHeard ? clientNode.lastHeard.getTime() : Date.now();
        node.status = 'active';
        
        // Signal quality
        if (clientNode.snr !== undefined) {
            node.snr = clientNode.snr;
            node.lastSnr = clientNode.snr;
        }
        if (clientNode.rssi !== undefined) {
            node.rssi = clientNode.rssi;
            node.lastRssi = clientNode.rssi;
        }
        node.signalQuality = calculateSignalQuality(node.snr, node.rssi);
        
        // Battery/telemetry
        node.batteryLevel = clientNode.batteryLevel;
        node.voltage = clientNode.voltage;
        
        // Position if available — guard against 0,0 (no GPS fix)
        if (clientNode.latitude !== undefined && clientNode.longitude !== undefined &&
            (clientNode.latitude !== 0 || clientNode.longitude !== 0)) {
            node.lat = clientNode.latitude;
            node.lon = clientNode.longitude;
            node.alt = clientNode.altitude;
        }
        
        updateTeamMembers();
        
        if (state.onNodeUpdate) {
            state.onNodeUpdate(node);
        }
        Events.emit('meshtastic:nodeinfo', { node });
    }
    
    /**
     * Handle position from MeshtasticClient
     */
    function handlePositionFromClient(position) {
        const nodeId = position.node?.id || nodeNumToId(position.from) || 'unknown';
        
        let node = state.nodes.get(nodeId);
        if (!node) {
            node = { id: nodeId };
            state.nodes.set(nodeId, node);
        }
        
        // Guard: Don't overwrite a valid position with 0,0 (GPS fix lost / not acquired).
        // Only update lat/lon when we have a real fix.
        const hasValidPosition = position.lat && position.lon &&
            (Math.abs(position.lat) > 0.0001 || Math.abs(position.lon) > 0.0001);
        
        if (hasValidPosition) {
            node.lat = position.lat;
            node.lon = position.lon;
            node.alt = position.alt;
        }
        
        node.lastSeen = Date.now();
        node.status = 'active';
        
        // Sync signal quality from position.node if available
        if (position.node) {
            if (position.node.snr !== undefined) {
                node.snr = position.node.snr;
                node.lastSnr = position.node.snr;
            }
            if (position.node.rssi !== undefined) {
                node.rssi = position.node.rssi;
                node.lastRssi = position.node.rssi;
            }
            node.signalQuality = calculateSignalQuality(node.snr, node.rssi);
        }
        
        updateTeamMembers();
        
        if (state.onPositionUpdate) {
            state.onPositionUpdate(node);
        }
        Events.emit('meshtastic:position', { node });
    }
    
    /**
     * Convert a numeric node number (from Meshtastic library) to a GridDown hex string ID.
     * E.g., 1882261175 → "!702F3AB7"
     */
    function nodeNumToId(nodeNum) {
        if (typeof nodeNum === 'string') return nodeNum; // already a string ID
        if (typeof nodeNum === 'number') return `!${nodeNum.toString(16).padStart(8, '0')}`;
        return nodeNum;
    }
    
    /**
     * Get a node by its ID (string hex ID or numeric nodeNum)
     * Nodes are keyed in state.nodes by their string ID (e.g. "!abcd1234")
     */
    function getNodeById(nodeId) {
        if (!nodeId) return null;
        
        // Direct lookup by string ID
        let node = state.nodes.get(nodeId);
        if (node) return node;
        
        // If numeric, convert to string ID and try again
        if (typeof nodeId === 'number') {
            node = state.nodes.get(nodeNumToId(nodeId));
            if (node) return node;
        }
        
        // If string that looks numeric (no ! prefix), try as hex nodeNum
        if (typeof nodeId === 'string' && !nodeId.startsWith('!')) {
            const asNum = parseInt(nodeId, 16);
            if (!isNaN(asNum)) {
                node = state.nodes.get(`!${asNum.toString(16).padStart(8, '0')}`);
                if (node) return node;
            }
        }
        
        return null;
    }
    
    /**
     * Handle message from MeshtasticClient.
     * Text messages from the real Meshtastic library can be:
     * - Plain text from a human user
     * - JSON-encoded GridDown protocol messages (ACK, DM, waypoint, traceroute, etc.)
     *   sent by other GridDown instances via sendViaRealClient()
     */
    function handleMessageFromClient(message) {
        const fromId = nodeNumToId(message.from);
        const toId = nodeNumToId(message.to);
        const text = message.text || '';
        
        // Try to parse as a GridDown protocol message (JSON with "type" or compacted "t" field)
        try {
            if (text.startsWith('{') && (text.includes('"type"') || text.includes('"t"'))) {
                let parsed = JSON.parse(text);
                
                // Expand compacted messages back to verbose field names
                if (isCompactedMessage(parsed)) {
                    parsed = expandMessage(parsed);
                    console.log('[Meshtastic] Expanded compacted message, type:', parsed.type);
                }
                
                if (parsed.type && typeof parsed.type === 'string') {
                    // Normalize node IDs in the parsed message
                    if (parsed.from && typeof parsed.from === 'number') {
                        parsed.from = nodeNumToId(parsed.from);
                    }
                    if (parsed.to && typeof parsed.to === 'number') {
                        parsed.to = nodeNumToId(parsed.to);
                    }
                    // Add metadata from the Meshtastic packet if not present
                    if (!parsed.from) parsed.from = fromId;
                    if (!parsed.channelIndex && message.channel !== undefined) {
                        parsed.channelIndex = message.channel;
                    }
                    
                    // Reconstruct fields that may have been stripped for payload savings
                    if (!parsed.fromName && parsed.from) {
                        const senderNode = state.nodes.get(parsed.from);
                        parsed.fromName = senderNode?.shortName || senderNode?.name || parsed.from;
                    }
                    if (!parsed.timestamp) {
                        parsed.timestamp = Date.now();
                    }
                    
                    // Dispatch through the protocol handler
                    console.log('[Meshtastic] Received GridDown protocol message:', parsed.type);
                    processReceivedData_fromClient(parsed);
                    return;
                }
            }
        } catch (e) {
            // Not valid JSON — treat as plain text below
        }
        
        // Plain text message — route through handleTextMessage for ACK and notification
        const msg = {
            id: message.id || `msg_${Date.now()}`,
            type: MessageType.TEXT,
            from: fromId,
            to: toId,
            channelId: 'primary', // Default channel for real client messages
            channelIndex: message.channel || 0,
            text: text,
            timestamp: message.timestamp || Date.now(),
            isSent: false,
            deliveryStatus: DeliveryStatus.DELIVERED
        };
        
        // Resolve sender name from nodes map
        const fromNode = state.nodes.get(fromId);
        if (fromNode) {
            msg.fromName = fromNode.shortName || fromNode.name;
        } else {
            msg.fromName = fromId;
        }
        
        handleTextMessage(msg);
    }
    
    /**
     * Dispatch a parsed GridDown protocol message received via the real Meshtastic client.
     * Uses the same dispatch table as processReceivedData() from the legacy path.
     */
    function processReceivedData_fromClient(message) {
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
            case MessageType.PUBLIC_KEY:
                handlePublicKeyReceived(message);
                break;
            case MessageType.KEY_REQUEST:
                handleKeyRequest(message);
                break;
            case MessageType.KEY_RESPONSE:
                handleKeyResponse(message);
                break;
            case MessageType.DM:
                handleDirectMessage(message);
                break;
            case MessageType.DM_ACK:
                handleDMAck(message);
                break;
            case MessageType.DM_READ:
                handleDMReadReceipt(message);
                break;
            case MessageType.TRACEROUTE_REQUEST:
            case MessageType.TRACEROUTE_REPLY:
                // Native firmware traceroute handles this now — ignore legacy JSON messages
                break;
            default:
                console.warn('[Meshtastic] Unknown GridDown protocol type:', message.type);
                // Treat as text message fallback
                handleTextMessage({
                    ...message,
                    text: message.text || JSON.stringify(message)
                });
        }
        
        if (state.onMessage) {
            state.onMessage(message);
        }
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
        
        // Phase 1.5: Handle queue processor based on connection state
        if (newState === ConnectionState.CONNECTED && oldState !== ConnectionState.CONNECTED) {
            // Just connected - start queue processor to send pending messages
            console.log('[Queue] Connection established, starting queue processor');
            startQueueProcessor();
            
            // Update mesh connectivity status
            checkMeshConnectivity();
            
            // Refresh team members so self position appears on map immediately
            updateTeamMembers();
        } else if (newState !== ConnectionState.CONNECTED && oldState === ConnectionState.CONNECTED) {
            // Disconnected - stop queue processor
            console.log('[Queue] Connection lost, stopping queue processor');
            stopQueueProcessor();
            state.meshConnectivityStatus = 'disconnected';
        }
        
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
        
        // Route through MeshtasticClient when using the real Meshtastic library
        if (state.usingRealClient && typeof MeshtasticClient !== 'undefined') {
            return sendViaRealClient(data);
        }
        
        // Legacy path: direct BLE characteristic / serial write
        const encoded = encodeMessage(data);
        
        if (state.connectionType === 'bluetooth') {
            await state.characteristic.toRadio.writeValue(encoded);
        } else if (state.connectionType === 'serial') {
            await state.writer.write(encoded);
        }
    }
    
    // =========================================================================
    // MESSAGE COMPACTION — fits GridDown protocol messages within LoRa payload
    // =========================================================================
    
    // Field name mappings: verbose → compact (single/double char)
    const COMPACT_FIELDS = {
        type: 't', from: 'f', fromName: 'fn', to: 'o', timestamp: 'ts',
        text: 'tx', channelIndex: 'ci', encrypted: 'en', id: 'i',
        // Waypoint/location
        waypoint: 'w', lat: 'la', lon: 'lo', altitude: 'al', notes: 'no',
        icon: 'ic', expire: 'ex', name: 'n',
        // SOS/Checkin
        emergency: 'em', details: 'd', situation: 'si', injuries: 'ij',
        people: 'pe', supplies: 'su', message: 'mg', status: 'st',
        // DM/PKI
        encryptedText: 'et', publicKey: 'pk',
        // Traceroute
        requestId: 'ri', route: 'r', hopCount: 'hc', maxHops: 'mh',
        isOrigin: 'io', hopNumber: 'hn', nodeName: 'nn', nodeId: 'ni',
        // Route sharing
        routeId: 'rd', data: 'da', chunk: 'ch', totalChunks: 'tc',
        points: 'pt', distance: 'di', duration: 'du', terrain: 'te'
    };
    
    // Reverse mapping: compact → verbose
    const EXPAND_FIELDS = {};
    for (const [verbose, compact] of Object.entries(COMPACT_FIELDS)) {
        EXPAND_FIELDS[compact] = verbose;
    }
    
    /**
     * Recursively compact an object's field names for transmission.
     * Replaces verbose keys with short aliases to reduce JSON payload size.
     */
    function compactMessage(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(item => compactMessage(item));
        if (typeof obj !== 'object') return obj;
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const compactKey = COMPACT_FIELDS[key] || key;
            result[compactKey] = compactMessage(value);
        }
        return result;
    }
    
    /**
     * Recursively expand compacted field names back to verbose form.
     * Used on the receive side to restore standard GridDown message format.
     */
    function expandMessage(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(item => expandMessage(item));
        if (typeof obj !== 'object') return obj;
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            const expandedKey = EXPAND_FIELDS[key] || key;
            result[expandedKey] = expandMessage(value);
        }
        return result;
    }
    
    /**
     * Check if a JSON payload is a compacted GridDown message.
     * Compacted messages use 't' instead of 'type' as the discriminator.
     */
    function isCompactedMessage(parsed) {
        return parsed && typeof parsed === 'object' && parsed.t && !parsed.type;
    }
    
    /**
     * Recursively remove empty string values from an object to save payload bytes.
     * Preserves false, 0, null (which are semantically meaningful).
     */
    function removeEmptyStrings(obj) {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(item => removeEmptyStrings(item));
        if (typeof obj !== 'object') return obj;
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === '') continue; // Skip empty strings
            result[key] = removeEmptyStrings(value);
        }
        return result;
    }
    
    /**
     * Truncate the longest string values in a nested object to reduce payload size.
     * Targets user-provided content (SOS details, waypoint notes) rather than
     * protocol fields (node IDs, message types).
     * @param {object} obj - Object to mutate in place
     * @param {number} excess - Number of bytes to shed
     */
    function truncateNestedStrings(obj, excess) {
        if (!obj || typeof obj !== 'object' || excess <= 0) return;
        
        // Collect all string values with their paths, sorted longest first
        const strings = [];
        function collectStrings(o, path) {
            for (const [key, val] of Object.entries(o)) {
                if (typeof val === 'string' && val.length > 4) {
                    // Skip protocol fields that must not be truncated
                    if (['t', 'f', 'o', 'i', 'et', 'pk', 'ri', 'type', 'from', 'to', 'id',
                         'encryptedText', 'publicKey', 'requestId'].includes(key)) continue;
                    strings.push({ obj: o, key, len: val.length, path: path + '.' + key });
                } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                    collectStrings(val, path + '.' + key);
                }
            }
        }
        collectStrings(obj, '');
        
        // Sort longest first — truncate the biggest strings first
        strings.sort((a, b) => b.len - a.len);
        
        let remaining = excess;
        for (const entry of strings) {
            if (remaining <= 0) break;
            const current = entry.obj[entry.key];
            // Trim proportionally but leave at least 10 chars + ellipsis
            const trimBy = Math.min(remaining + 3, current.length - 10); // +3 for "..."
            if (trimBy > 3) {
                entry.obj[entry.key] = current.substring(0, current.length - trimBy) + '...';
                remaining -= (trimBy - 3); // net savings = trimBy minus the 3 chars we added
            }
        }
    }
    
    /**
     * Send data through the real MeshtasticClient library
     * Routes to the appropriate API method based on message type
     */
    async function sendViaRealClient(data) {
        const type = data.type;
        const griddownMessageId = data.id || null; // GridDown's app-level message ID
        
        // Resolve destination: null/undefined/broadcast → 0xFFFFFFFF, node ID string → node number
        let destination = 0xFFFFFFFF; // broadcast
        if (data.to) {
            if (typeof data.to === 'number') {
                destination = data.to;
            } else if (typeof data.to === 'string' && data.to.startsWith('!')) {
                destination = parseInt(data.to.slice(1), 16) || 0xFFFFFFFF;
            }
        }
        
        const channelIndex = data.channelIndex || 0;
        let result;
        
        switch (type) {
            case MessageType.POSITION:
                // Use dedicated position API (fire-and-forget, no ACK tracking)
                await MeshtasticClient.sendPosition(
                    data.lat || data.latitude || 0,
                    data.lon || data.longitude || 0,
                    data.alt || data.altitude || 0
                );
                break;
                
            case MessageType.TEXT:
                // Send plain text content via the mesh
                result = await MeshtasticClient.sendMessage(
                    data.text || '',
                    destination,
                    channelIndex
                );
                break;
                
            default: {
                // All other GridDown protocol messages (ACK, waypoints, DMs, etc.)
                // are sent as JSON-encoded text messages over the mesh
                let payload = JSON.stringify(data);
                
                // Level 1: Compact field names if over limit
                if (payload.length > MAX_LORA_PAYLOAD) {
                    const compacted = compactMessage(data);
                    payload = JSON.stringify(compacted);
                    console.log(`[Meshtastic] L1 compact ${type}: ${JSON.stringify(data).length} → ${payload.length} bytes`);
                }
                
                // Level 2: Strip reconstructable fields (fromName, timestamp, empty values)
                // Receiver reconstructs fromName from node map, timestamp from arrival time
                if (payload.length > MAX_LORA_PAYLOAD) {
                    let obj = JSON.parse(payload);
                    delete obj.fn; // fromName — receiver looks up from node map
                    delete obj.ts; // timestamp — receiver uses arrival time
                    // Remove empty string values anywhere in the object
                    obj = removeEmptyStrings(obj);
                    payload = JSON.stringify(obj);
                    console.log(`[Meshtastic] L2 strip ${type}: → ${payload.length} bytes`);
                }
                
                // Level 3: Truncate long string values in nested objects (SOS details, waypoint notes)
                if (payload.length > MAX_LORA_PAYLOAD) {
                    const obj = JSON.parse(payload);
                    const excess = payload.length - MAX_LORA_PAYLOAD;
                    truncateNestedStrings(obj, excess);
                    payload = JSON.stringify(obj);
                    console.log(`[Meshtastic] L3 truncate ${type}: → ${payload.length} bytes`);
                }
                
                // Final size check — warn if still too large after all optimization
                if (payload.length > MAX_LORA_PAYLOAD) {
                    console.warn(`[Meshtastic] ${type} payload (${payload.length} bytes) exceeds LoRa limit (${MAX_LORA_PAYLOAD}). Message may be truncated by firmware.`);
                }
                
                result = await MeshtasticClient.sendMessage(
                    payload,
                    destination,
                    channelIndex
                );
                break;
            }
        }
        
        // Bridge Meshtastic packetId → GridDown messageId for ACK tracking
        if (result?.packetId && griddownMessageId) {
            state.packetIdToMessageId.set(result.packetId, griddownMessageId);
            
            // Auto-expire the mapping after 2 minutes to prevent memory leaks
            setTimeout(() => {
                state.packetIdToMessageId.delete(result.packetId);
            }, 120000);
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
        let message = decodeMessage(data);
        if (!message) return;
        
        // Expand compacted messages (from GridDown devices using real client path)
        if (isCompactedMessage(message)) {
            message = expandMessage(message);
        }
        
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
            // Traceroute types — native firmware handles routing now
            case MessageType.TRACEROUTE_REQUEST:
            case MessageType.TRACEROUTE_REPLY:
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
     * Only broadcasts phone/tablet GPS when the Meshtastic device lacks its own GPS.
     * Devices with GPS already broadcast their own position — sending from the phone
     * creates duplicate mesh traffic and can overwhelm the BLE link with GATT errors.
     */
    function startPositionBroadcast() {
        if (state.positionInterval) return;
        
        // Check if device has its own GPS enabled — if so, let the device handle it
        if (state.usingRealClient) {
            const devConfig = state.deviceConfig || {};
            if (devConfig.gpsEnabled !== false) {
                console.log('[Meshtastic] Device GPS enabled — skipping phone position broadcast (device handles its own)');
                return;
            }
        }
        
        // Reset failure counter
        state._positionBroadcastFailures = 0;
        
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
        state._positionBroadcastFailures = 0;
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
            state._positionBroadcastFailures = 0; // Reset on success
            console.log('Position broadcast sent');
            
        } catch (e) {
            state._positionBroadcastFailures = (state._positionBroadcastFailures || 0) + 1;
            console.warn(`Failed to broadcast position (attempt ${state._positionBroadcastFailures}):`, e);
            
            // Stop after 3 consecutive failures to avoid flooding BLE with failing packets
            if (state._positionBroadcastFailures >= 3) {
                console.warn('[Meshtastic] Position broadcast stopped after 3 consecutive failures — BLE transport may be congested');
                stopPositionBroadcast();
            }
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
        
        // Update position — guard against 0,0 (no GPS fix)
        if (message.lat && message.lon &&
            (Math.abs(message.lat) > 0.0001 || Math.abs(message.lon) > 0.0001)) {
            node.lat = message.lat;
            node.lon = message.lon;
            node.alt = message.alt;
            node.accuracy = message.accuracy;
        }
        node.lastSeen = Date.now();
        node.status = 'active';
        
        // Phase 1: Capture signal quality from packet (SNR/RSSI)
        if (message.snr !== undefined) {
            node.snr = message.snr;
            node.lastSnr = message.snr;
        }
        if (message.rssi !== undefined) {
            node.rssi = message.rssi;
            node.lastRssi = message.rssi;
        }
        // Calculate signal quality rating
        node.signalQuality = calculateSignalQuality(node.snr, node.rssi);
        
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
        node.hwModelName = message.hwModelName || getHwModelName(message.hwModel);
        node.macAddr = message.macAddr;
        node.lastSeen = Date.now();
        
        // Phase 1: Capture firmware version and device capabilities
        if (message.firmwareVersion) {
            node.firmwareVersion = message.firmwareVersion;
        }
        if (message.hasGPS !== undefined) {
            node.hasGPS = message.hasGPS;
        }
        
        // Phase 1: Capture signal quality
        if (message.snr !== undefined) {
            node.snr = message.snr;
            node.lastSnr = message.snr;
        }
        if (message.rssi !== undefined) {
            node.rssi = message.rssi;
            node.lastRssi = message.rssi;
        }
        node.signalQuality = calculateSignalQuality(node.snr, node.rssi);
        
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
    
    // =========================================================================
    // PHASE 1: HELPER FUNCTIONS
    // =========================================================================
    
    /**
     * Calculate signal quality rating from SNR and RSSI
     * @param {number} snr - Signal-to-Noise Ratio in dB
     * @param {number} rssi - Received Signal Strength Indicator in dBm
     * @returns {string} 'excellent', 'good', 'fair', 'poor', or 'unknown'
     */
    function calculateSignalQuality(snr, rssi) {
        if (snr === undefined && rssi === undefined) {
            return 'unknown';
        }
        
        // Use SNR as primary indicator if available (more reliable for LoRa)
        if (snr !== undefined) {
            if (snr >= SignalQuality.EXCELLENT.snr) return 'excellent';
            if (snr >= SignalQuality.GOOD.snr) return 'good';
            if (snr >= SignalQuality.FAIR.snr) return 'fair';
            return 'poor';
        }
        
        // Fall back to RSSI
        if (rssi !== undefined) {
            if (rssi >= SignalQuality.EXCELLENT.rssi) return 'excellent';
            if (rssi >= SignalQuality.GOOD.rssi) return 'good';
            if (rssi >= SignalQuality.FAIR.rssi) return 'fair';
            return 'poor';
        }
        
        return 'unknown';
    }
    
    /**
     * Get signal quality icon based on rating
     */
    function getSignalQualityIcon(quality) {
        switch (quality) {
            case 'excellent': return '📶';
            case 'good': return '📶';
            case 'fair': return '📶';
            case 'poor': return '📶';
            default: return '❓';
        }
    }
    
    /**
     * Get signal quality color
     */
    function getSignalQualityColor(quality) {
        switch (quality) {
            case 'excellent': return '#22c55e'; // Green
            case 'good': return '#84cc16';      // Lime
            case 'fair': return '#f59e0b';      // Amber
            case 'poor': return '#ef4444';      // Red
            default: return '#6b7280';          // Gray
        }
    }
    
    /**
     * Format signal quality for display
     */
    function formatSignalQuality(node) {
        const parts = [];
        if (node.snr !== undefined) {
            parts.push(`SNR: ${node.snr.toFixed(1)} dB`);
        }
        if (node.rssi !== undefined) {
            parts.push(`RSSI: ${node.rssi} dBm`);
        }
        if (parts.length === 0) {
            return 'No signal data';
        }
        return parts.join(' • ');
    }
    
    /**
     * Get hardware model name from model number
     */
    function getHwModelName(hwModel) {
        const models = {
            0: 'Unknown',
            1: 'TLORA_V2',
            2: 'TLORA_V1',
            3: 'TLORA_V2_1_1P6',
            4: 'TBEAM',
            5: 'HELTEC_V2_0',
            6: 'TBEAM_V0P7',
            7: 'T_ECHO',
            8: 'TLORA_V1_1P3',
            9: 'RAK4631',
            10: 'HELTEC_V2_1',
            11: 'HELTEC_V1',
            12: 'LILYGO_TBEAM_S3_CORE',
            13: 'RAK11200',
            14: 'NANO_G1',
            15: 'TLORA_V2_1_1P8',
            16: 'TLORA_T3_S3',
            17: 'NANO_G1_EXPLORER',
            18: 'NANO_G2_ULTRA',
            19: 'LORA_TYPE',
            20: 'WIPHONE',
            21: 'WIO_WM1110',
            22: 'RAK2560',
            23: 'HELTEC_HRU_3601',
            25: 'HELTEC_V3',
            26: 'HELTEC_WSL_V3',
            39: 'RAK_WISMESHTAP',
            40: 'STATION_G1',
            43: 'RAK_WISMESH_POCKET',
            44: 'STATION_G2',
            // Add more as needed
            255: 'Custom Hardware'
        };
        return models[hwModel] || `Model ${hwModel}`;
    }
    
    // =========================================================================
    // DEVICE CAPABILITY DATABASE
    // =========================================================================
    
    /**
     * Device capabilities database
     * Defines what each Meshtastic hardware model supports
     */
    const DeviceCapabilities = {
        // RAK Devices
        RAK4631: {
            hwModel: 9,
            name: 'RAK WisBlock',
            displayName: 'RAK WisBlock 4631',
            bluetooth: true,
            serial: true,
            gps: false,  // Optional module
            wifi: false,
            battery: true,
            screen: false,  // Optional
            portable: true,
            notes: 'Modular system - capabilities depend on installed modules'
        },
        RAK11200: {
            hwModel: 13,
            name: 'RAK WisBlock ESP32',
            displayName: 'RAK WisBlock 11200',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: true,
            screen: false,
            portable: true,
            notes: 'ESP32-based WisBlock core'
        },
        RAK2560: {
            hwModel: 22,
            name: 'RAK Tracker',
            displayName: 'RAK WisNode Tracker',
            bluetooth: true,
            serial: false,
            gps: true,
            wifi: false,
            battery: true,
            screen: false,
            portable: true,
            notes: 'Compact tracker with GPS'
        },
        RAK_WISMESHTAP: {
            hwModel: 39,
            name: 'WisMesh Tap',
            displayName: 'RAK WisMesh Tap',
            bluetooth: true,
            serial: false,
            gps: false,
            wifi: false,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Compact touchscreen device - Bluetooth only'
        },
        RAK_WISMESH_POCKET: {
            hwModel: 43,
            name: 'WisMesh Pocket',
            displayName: 'RAK WisMesh Pocket',
            bluetooth: true,
            serial: false,  // USB is charging only
            gps: true,
            wifi: false,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Consumer portable device - Bluetooth only (USB is for charging)'
        },
        
        // LilyGo T-Beam
        TBEAM: {
            hwModel: 4,
            name: 'T-Beam',
            displayName: 'LilyGo T-Beam',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: true,
            battery: true,
            screen: false,  // Optional OLED
            portable: true,
            notes: 'Popular development board with GPS'
        },
        TBEAM_V0P7: {
            hwModel: 6,
            name: 'T-Beam v0.7',
            displayName: 'LilyGo T-Beam v0.7',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: true,
            battery: true,
            screen: false,
            portable: true,
            notes: 'Older T-Beam revision'
        },
        LILYGO_TBEAM_S3_CORE: {
            hwModel: 12,
            name: 'T-Beam S3',
            displayName: 'LilyGo T-Beam S3 Core',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: true,
            battery: true,
            screen: false,
            portable: true,
            notes: 'ESP32-S3 based T-Beam'
        },
        
        // LilyGo T-Echo
        T_ECHO: {
            hwModel: 7,
            name: 'T-Echo',
            displayName: 'LilyGo T-Echo',
            bluetooth: true,
            serial: false,  // nRF52 - no native USB serial
            gps: true,
            wifi: false,
            battery: true,
            screen: true,  // E-ink
            portable: true,
            notes: 'E-ink display, nRF52 based - Bluetooth only'
        },
        
        // LilyGo T-LoRa
        TLORA_V2: {
            hwModel: 1,
            name: 'T-LoRa V2',
            displayName: 'LilyGo T-LoRa V2',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: false,  // No built-in battery
            screen: true,
            portable: false,
            notes: 'Development board with OLED'
        },
        TLORA_V1: {
            hwModel: 2,
            name: 'T-LoRa V1',
            displayName: 'LilyGo T-LoRa V1',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: false,
            screen: true,
            portable: false,
            notes: 'Original T-LoRa board'
        },
        TLORA_T3_S3: {
            hwModel: 16,
            name: 'T3 S3',
            displayName: 'LilyGo T3 S3',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: true,
            screen: true,
            portable: true,
            notes: 'ESP32-S3 with display'
        },
        
        // Heltec
        HELTEC_V1: {
            hwModel: 11,
            name: 'Heltec V1',
            displayName: 'Heltec LoRa32 V1',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: false,
            screen: true,
            portable: false,
            notes: 'Original Heltec board'
        },
        HELTEC_V2_0: {
            hwModel: 5,
            name: 'Heltec V2',
            displayName: 'Heltec LoRa32 V2',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Popular development board'
        },
        HELTEC_V2_1: {
            hwModel: 10,
            name: 'Heltec V2.1',
            displayName: 'Heltec LoRa32 V2.1',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Updated V2 with improvements'
        },
        HELTEC_V3: {
            hwModel: 25,
            name: 'Heltec V3',
            displayName: 'Heltec LoRa32 V3',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Latest Heltec with ESP32-S3'
        },
        HELTEC_WSL_V3: {
            hwModel: 26,
            name: 'Heltec Wireless Stick Lite V3',
            displayName: 'Heltec WSL V3',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: false,
            screen: false,
            portable: false,
            notes: 'Compact stick form factor'
        },
        
        // Station devices
        STATION_G1: {
            hwModel: 40,
            name: 'Station G1',
            displayName: 'Meshtastic Station G1',
            bluetooth: true,
            serial: true,
            gps: false,
            wifi: true,
            battery: false,
            screen: true,
            portable: false,
            notes: 'Base station device'
        },
        STATION_G2: {
            hwModel: 44,
            name: 'Station G2',
            displayName: 'Meshtastic Station G2',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: true,
            battery: false,
            screen: true,
            portable: false,
            notes: 'Advanced base station with GPS'
        },
        
        // Nano devices
        NANO_G1: {
            hwModel: 14,
            name: 'Nano G1',
            displayName: 'B&Q Nano G1',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: false,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Compact device with GPS'
        },
        NANO_G1_EXPLORER: {
            hwModel: 17,
            name: 'Nano G1 Explorer',
            displayName: 'B&Q Nano G1 Explorer',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: false,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Enhanced Nano with more features'
        },
        NANO_G2_ULTRA: {
            hwModel: 18,
            name: 'Nano G2 Ultra',
            displayName: 'B&Q Nano G2 Ultra',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: false,
            battery: true,
            screen: true,
            portable: true,
            notes: 'Latest Nano generation'
        },
        
        // Seeed
        WIO_WM1110: {
            hwModel: 21,
            name: 'Wio WM1110',
            displayName: 'Seeed Wio WM1110',
            bluetooth: true,
            serial: true,
            gps: true,
            wifi: false,
            battery: true,
            screen: false,
            portable: true,
            notes: 'Seeed tracker module'
        },
        
        // Default/Unknown
        UNKNOWN: {
            hwModel: 0,
            name: 'Unknown',
            displayName: 'Unknown Device',
            bluetooth: true,
            serial: true,  // Assume both available for unknown
            gps: false,
            wifi: false,
            battery: false,
            screen: false,
            portable: false,
            notes: 'Unknown device - capabilities uncertain'
        }
    };
    
    /**
     * Get device capabilities by hardware model number
     */
    function getDeviceCapabilities(hwModel) {
        // Find by hwModel number
        for (const [key, device] of Object.entries(DeviceCapabilities)) {
            if (device.hwModel === hwModel) {
                return { ...device, id: key };
            }
        }
        // Return unknown with the model number
        return { 
            ...DeviceCapabilities.UNKNOWN, 
            id: 'UNKNOWN',
            hwModel: hwModel,
            displayName: `Unknown Device (Model ${hwModel})`
        };
    }
    
    /**
     * Get device capabilities for the currently connected device
     */
    function getConnectedDeviceCapabilities() {
        const hwModel = state.deviceConfig.hwModel;
        if (hwModel === null || hwModel === undefined) {
            return null;
        }
        return getDeviceCapabilities(hwModel);
    }
    
    /**
     * Check if current device supports serial connection
     */
    function deviceSupportsSerial() {
        const caps = getConnectedDeviceCapabilities();
        return caps ? caps.serial : true; // Assume true if unknown
    }
    
    /**
     * Check if current device supports Bluetooth connection
     */
    function deviceSupportsBluetooth() {
        const caps = getConnectedDeviceCapabilities();
        return caps ? caps.bluetooth : true; // Assume true if unknown
    }
    
    /**
     * Get connection recommendation for a device type
     */
    function getConnectionRecommendation(hwModel) {
        const caps = hwModel !== undefined 
            ? getDeviceCapabilities(hwModel) 
            : getConnectedDeviceCapabilities();
        
        if (!caps) {
            return {
                recommended: 'bluetooth',
                reason: 'Bluetooth is recommended for most devices',
                serialSupported: true,
                bluetoothSupported: true
            };
        }
        
        if (caps.bluetooth && !caps.serial) {
            return {
                recommended: 'bluetooth',
                reason: `${caps.displayName} only supports Bluetooth (USB is for charging)`,
                serialSupported: false,
                bluetoothSupported: true,
                deviceName: caps.displayName,
                notes: caps.notes
            };
        }
        
        if (caps.serial && !caps.bluetooth) {
            return {
                recommended: 'serial',
                reason: `${caps.displayName} only supports Serial/USB connection`,
                serialSupported: true,
                bluetoothSupported: false,
                deviceName: caps.displayName,
                notes: caps.notes
            };
        }
        
        // Both supported - recommend based on use case
        if (caps.portable) {
            return {
                recommended: 'bluetooth',
                reason: `${caps.displayName} supports both - Bluetooth recommended for portable use`,
                serialSupported: true,
                bluetoothSupported: true,
                deviceName: caps.displayName,
                notes: caps.notes
            };
        }
        
        return {
            recommended: 'serial',
            reason: `${caps.displayName} supports both - Serial recommended for base stations`,
            serialSupported: true,
            bluetoothSupported: true,
            deviceName: caps.displayName,
            notes: caps.notes
        };
    }
    
    /**
     * Get common device presets for connection help
     */
    function getCommonDevices() {
        return [
            { name: 'WisMesh Pocket', bluetooth: true, serial: false, icon: '📱' },
            { name: 'WisMesh Tap', bluetooth: true, serial: false, icon: '📱' },
            { name: 'T-Echo', bluetooth: true, serial: false, icon: '📱' },
            { name: 'T-Beam', bluetooth: true, serial: true, icon: '📡' },
            { name: 'Heltec V3', bluetooth: true, serial: true, icon: '📡' },
            { name: 'RAK WisBlock', bluetooth: true, serial: true, icon: '🔧' },
            { name: 'Station G2', bluetooth: true, serial: true, icon: '🏠' }
        ];
    }
    
    /**
     * Detect device from Bluetooth device name
     * Returns likely device type based on name patterns
     */
    function detectDeviceFromName(deviceName) {
        if (!deviceName) return null;
        
        const lower = deviceName.toLowerCase();
        
        // RAK devices
        if (lower.includes('wismesh') || lower.includes('rak')) {
            if (lower.includes('pocket')) {
                return getDeviceCapabilities(43); // RAK_WISMESH_POCKET
            }
            if (lower.includes('tap')) {
                return getDeviceCapabilities(39); // RAK_WISMESHTAP
            }
            return getDeviceCapabilities(9); // RAK4631 as default RAK
        }
        
        // LilyGo devices
        if (lower.includes('tbeam') || lower.includes('t-beam')) {
            return getDeviceCapabilities(4); // TBEAM
        }
        if (lower.includes('techo') || lower.includes('t-echo')) {
            return getDeviceCapabilities(7); // T_ECHO
        }
        if (lower.includes('tlora') || lower.includes('t-lora')) {
            return getDeviceCapabilities(1); // TLORA_V2
        }
        
        // Heltec
        if (lower.includes('heltec')) {
            return getDeviceCapabilities(25); // HELTEC_V3 as default
        }
        
        // Station
        if (lower.includes('station')) {
            return getDeviceCapabilities(44); // STATION_G2
        }
        
        // Nano
        if (lower.includes('nano')) {
            return getDeviceCapabilities(18); // NANO_G2_ULTRA
        }
        
        // Generic Meshtastic
        if (lower.includes('meshtastic')) {
            // Can't determine specific device
            return null;
        }
        
        return null;
    }
    
    /**
     * Compare firmware versions
     * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
     */
    function compareFirmwareVersions(a, b) {
        if (!a || !b) return 0;
        
        const partsA = a.replace(/[^\d.]/g, '').split('.').map(Number);
        const partsB = b.replace(/[^\d.]/g, '').split('.').map(Number);
        
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA < numB) return -1;
            if (numA > numB) return 1;
        }
        return 0;
    }
    
    /**
     * Check if firmware version needs update
     */
    function checkFirmwareStatus(version) {
        if (!version) {
            return { status: 'unknown', message: 'Firmware version unknown' };
        }
        
        const cmpRecommended = compareFirmwareVersions(version, MIN_RECOMMENDED_FIRMWARE);
        const cmpLatest = compareFirmwareVersions(version, LATEST_STABLE_FIRMWARE);
        
        if (cmpRecommended < 0) {
            return {
                status: 'outdated',
                message: `Firmware ${version} is outdated. Minimum recommended: ${MIN_RECOMMENDED_FIRMWARE}`,
                color: '#ef4444'
            };
        } else if (cmpLatest < 0) {
            return {
                status: 'update_available',
                message: `Update available: ${LATEST_STABLE_FIRMWARE} (current: ${version})`,
                color: '#f59e0b'
            };
        } else {
            return {
                status: 'current',
                message: `Firmware ${version} is up to date`,
                color: '#22c55e'
            };
        }
    }
    
    // =========================================================================
    // PHASE 1: CHANNEL URL IMPORT/EXPORT
    // =========================================================================
    
    /**
     * Parse a Meshtastic channel URL
     * Format: meshtastic://channel?<base64_encoded_channel_set>
     * or: https://meshtastic.org/e/#<base64_encoded_channel_set>
     * 
     * @param {string} url - The channel URL to parse
     * @returns {object|null} Parsed channel data or null if invalid
     */
    function parseChannelUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }
        
        try {
            let base64Data = null;
            
            // Handle meshtastic:// scheme
            if (url.startsWith('meshtastic://')) {
                const match = url.match(/meshtastic:\/\/[^?]*\?(.+)/);
                if (match) {
                    base64Data = match[1];
                }
            }
            // Handle web URL format
            else if (url.includes('meshtastic.org/e/#')) {
                const match = url.match(/meshtastic\.org\/e\/#(.+)/);
                if (match) {
                    base64Data = match[1];
                }
            }
            // Handle raw base64
            else if (/^[A-Za-z0-9+/=_-]+$/.test(url)) {
                base64Data = url;
            }
            
            if (!base64Data) {
                console.warn('Could not extract channel data from URL');
                return null;
            }
            
            // URL-safe base64 to standard base64
            base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
            
            // Decode base64
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Parse protobuf-like structure (simplified)
            // In a full implementation, this would use actual protobuf parsing
            // For now, we extract what we can from the binary data
            const channelData = parseChannelProtobuf(bytes);
            
            return channelData;
        } catch (e) {
            console.error('Error parsing channel URL:', e);
            return null;
        }
    }
    
    /**
     * Parse channel data from protobuf bytes (simplified)
     * Real implementation would use protobuf.js
     */
    function parseChannelProtobuf(bytes) {
        // This is a simplified parser for demonstration
        // In production, use proper protobuf parsing
        
        // The ChannelSet protobuf contains:
        // - repeated Channel settings
        // - LoRaConfig lora_config
        
        // For now, return a placeholder that can be used
        // The actual parsing would require protobuf definitions
        
        return {
            raw: bytes,
            // Try to extract PSK if present (field 1 in Channel)
            psk: extractPsk(bytes),
            // Estimated settings
            isValid: bytes.length > 10,
            byteLength: bytes.length
        };
    }
    
    /**
     * Extract PSK from channel bytes (simplified)
     */
    function extractPsk(bytes) {
        // PSK is typically a 32-byte key
        // In protobuf, it's encoded with field tag + length prefix
        // This is a simplified extraction
        if (bytes.length >= 34) {
            const pskBytes = bytes.slice(2, 34);
            return Array.from(pskBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        return null;
    }
    
    /**
     * Generate a channel URL from channel settings
     * @param {object} channel - Channel settings object
     * @returns {string} Meshtastic channel URL
     */
    function generateChannelUrl(channel) {
        if (!channel) {
            return null;
        }
        
        try {
            // Build channel protobuf (simplified)
            const channelBytes = buildChannelProtobuf(channel);
            
            // Convert to URL-safe base64
            let base64 = btoa(String.fromCharCode.apply(null, channelBytes));
            base64 = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            
            // Return both URL formats
            return {
                meshtastic: `meshtastic://channel?${base64}`,
                web: `https://meshtastic.org/e/#${base64}`,
                qrData: base64
            };
        } catch (e) {
            console.error('Error generating channel URL:', e);
            return null;
        }
    }
    
    /**
     * Build channel protobuf bytes (simplified)
     */
    function buildChannelProtobuf(channel) {
        // This is a simplified builder
        // Real implementation would use protobuf.js
        
        const bytes = [];
        
        // Channel name (field 2, string)
        if (channel.name) {
            bytes.push(0x12); // field 2, wire type 2 (length-delimited)
            const nameBytes = new TextEncoder().encode(channel.name);
            bytes.push(nameBytes.length);
            bytes.push(...nameBytes);
        }
        
        // PSK (field 1, bytes) - if not default
        // Handle PSK in multiple formats: Uint8Array, hex string, base64, or ArrayBuffer
        if (channel.psk) {
            let pskBytes;
            if (channel.psk instanceof Uint8Array) {
                pskBytes = channel.psk;
            } else if (channel.psk instanceof ArrayBuffer) {
                pskBytes = new Uint8Array(channel.psk);
            } else if (typeof channel.psk === 'string') {
                // Determine if hex string or base64
                if (/^[0-9a-fA-F]+$/.test(channel.psk)) {
                    pskBytes = hexToBytes(channel.psk);
                } else {
                    // Assume base64
                    try {
                        const decoded = atob(channel.psk);
                        pskBytes = new Uint8Array(decoded.length);
                        for (let i = 0; i < decoded.length; i++) {
                            pskBytes[i] = decoded.charCodeAt(i);
                        }
                    } catch (e) {
                        console.warn('[Meshtastic] Could not decode PSK:', e);
                        pskBytes = null;
                    }
                }
            }
            
            if (pskBytes && pskBytes.length > 0) {
                bytes.push(0x0a); // field 1, wire type 2
                bytes.push(pskBytes.length);
                bytes.push(...pskBytes);
            }
        }
        
        return new Uint8Array(bytes);
    }
    
    /**
     * Convert hex string to byte array
     */
    function hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }
    
    /**
     * Import a channel from URL
     */
    async function importChannelFromUrl(url) {
        const channelData = parseChannelUrl(url);
        
        if (!channelData || !channelData.isValid) {
            throw new Error('Invalid channel URL');
        }
        
        // Find next available index
        const maxIndex = Math.max(...state.channels.map(c => c.index), -1);
        const newIndex = maxIndex + 1;
        if (newIndex > 7) {
            throw new Error('Maximum of 8 channels (device limit)');
        }
        
        // Create channel in GridDown
        const channel = {
            id: `imported_${Date.now()}`,
            index: newIndex,
            name: channelData.name || `Imported ${newIndex}`,
            psk: channelData.psk ? hashPSK(channelData.psk) : null,
            pskRaw: channelData.psk, // Keep raw for device push
            isDefault: false,
            isPrivate: true,
            importedAt: Date.now(),
            sourceUrl: url
        };
        
        // Add to channels
        state.channels.push(channel);
        
        // Push to device
        pushChannelToDevice(channel);
        
        // Save settings
        await saveSettings();
        
        // Notify listeners
        if (state.onChannelChange) {
            state.onChannelChange(channel);
        }
        
        Events.emit('meshtastic:channel_imported', { channel });
        
        return channel;
    }
    
    /**
     * Export channel as URL
     */
    function exportChannelAsUrl(channelId) {
        const channel = state.channels.find(c => c.id === channelId);
        if (!channel) {
            return null;
        }
        
        return generateChannelUrl(channel);
    }
    
    // =========================================================================
    // PHASE 1: DEVICE CONFIGURATION FUNCTIONS
    // =========================================================================
    
    /**
     * Get current device configuration
     */
    function getDeviceConfig() {
        // If connected via MeshtasticClient, sync config first
        if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isConnected && MeshtasticClient.isConnected()) {
            const clientConfig = MeshtasticClient.getConfig();
            if (clientConfig) {
                syncDeviceConfigFromClient(clientConfig);
            }
        }
        return { ...state.deviceConfig };
    }
    
    /**
     * Set device region
     * @param {number} region - Region code from RegionCode enum
     */
    async function setRegion(region) {
        if (!Object.values(RegionCode).includes(region)) {
            throw new Error(`Invalid region code: ${region}`);
        }
        
        state.deviceConfig.region = region;
        
        // If connected, send to device
        if (state.connectionState === ConnectionState.CONNECTED) {
            await sendConfigToDevice({ region });
        }
        
        await saveDeviceConfig();
        Events.emit('meshtastic:config_changed', { region });
        
        return state.deviceConfig;
    }
    
    /**
     * Set modem preset
     * @param {number} preset - Modem preset from ModemPreset enum
     */
    async function setModemPreset(preset) {
        if (!Object.values(ModemPreset).includes(preset)) {
            throw new Error(`Invalid modem preset: ${preset}`);
        }
        
        state.deviceConfig.modemPreset = preset;
        
        if (state.connectionState === ConnectionState.CONNECTED) {
            await sendConfigToDevice({ modemPreset: preset });
        }
        
        await saveDeviceConfig();
        Events.emit('meshtastic:config_changed', { modemPreset: preset });
        
        return state.deviceConfig;
    }
    
    /**
     * Set TX power
     * @param {number} power - Transmit power in dBm (0 = device default)
     */
    async function setTxPower(power) {
        if (power !== 0 && !TxPowerLevels.includes(power)) {
            // Allow any value between min and max for flexibility
            if (power < 1 || power > 30) {
                throw new Error(`Invalid TX power: ${power}. Must be 0 (default) or 1-30 dBm`);
            }
        }
        
        state.deviceConfig.txPower = power;
        
        if (state.connectionState === ConnectionState.CONNECTED) {
            await sendConfigToDevice({ txPower: power });
        }
        
        await saveDeviceConfig();
        Events.emit('meshtastic:config_changed', { txPower: power });
        
        return state.deviceConfig;
    }
    
    /**
     * Set hop limit
     * @param {number} hopLimit - Number of hops (1-7)
     */
    async function setHopLimit(hopLimit) {
        if (hopLimit < HOP_LIMIT_MIN || hopLimit > HOP_LIMIT_MAX) {
            throw new Error(`Invalid hop limit: ${hopLimit}. Must be ${HOP_LIMIT_MIN}-${HOP_LIMIT_MAX}`);
        }
        
        state.deviceConfig.hopLimit = hopLimit;
        
        if (state.connectionState === ConnectionState.CONNECTED) {
            await sendConfigToDevice({ hopLimit });
        }
        
        await saveDeviceConfig();
        Events.emit('meshtastic:config_changed', { hopLimit });
        
        return state.deviceConfig;
    }
    
    /**
     * Set all LoRa radio config in a single write + reboot.
     * Use this instead of calling setRegion/setModemPreset/setTxPower/setHopLimit
     * individually when changing multiple params — writes once to flash and reboots
     * the device so changes take effect on the radio hardware.
     * 
     * @param {Object} config
     * @param {number} [config.region] - Region code
     * @param {number} [config.modemPreset] - Modem preset
     * @param {number} [config.txPower] - TX power in dBm (0 = device default)
     * @param {number} [config.hopLimit] - Hop limit (1-7)
     * @returns {Object} Updated device config
     */
    async function setRadioConfig(config) {
        // Validate all params before writing anything
        if (config.region !== undefined && !Object.values(RegionCode).includes(config.region)) {
            throw new Error(`Invalid region code: ${config.region}`);
        }
        if (config.modemPreset !== undefined && !Object.values(ModemPreset).includes(config.modemPreset)) {
            throw new Error(`Invalid modem preset: ${config.modemPreset}`);
        }
        if (config.txPower !== undefined && config.txPower !== 0 && (config.txPower < 1 || config.txPower > 30)) {
            throw new Error(`Invalid TX power: ${config.txPower}. Must be 0 (default) or 1-30 dBm`);
        }
        if (config.hopLimit !== undefined && (config.hopLimit < HOP_LIMIT_MIN || config.hopLimit > HOP_LIMIT_MAX)) {
            throw new Error(`Invalid hop limit: ${config.hopLimit}. Must be ${HOP_LIMIT_MIN}-${HOP_LIMIT_MAX}`);
        }
        
        // Update local state
        if (config.region !== undefined) state.deviceConfig.region = config.region;
        if (config.modemPreset !== undefined) state.deviceConfig.modemPreset = config.modemPreset;
        if (config.txPower !== undefined) state.deviceConfig.txPower = config.txPower;
        if (config.hopLimit !== undefined) state.deviceConfig.hopLimit = config.hopLimit;
        
        // Write to device with reboot
        if (state.connectionState === ConnectionState.CONNECTED) {
            await sendConfigToDevice({ ...config, _reboot: true });
        }
        
        await saveDeviceConfig();
        Events.emit('meshtastic:config_changed', config);
        
        return state.deviceConfig;
    }
    
    /**
     * Send configuration to connected device
     * Uses MeshtasticClient for real device communication when available
     */
    async function sendConfigToDevice(config) {
        // Use MeshtasticClient for real device communication if available
        if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isConnected && MeshtasticClient.isConnected()) {
            console.log('[Meshtastic] Sending real config to device:', config);
            
            try {
                // === Non-reboot config FIRST ===
                // Owner and position config don't trigger reboot, so write them
                // before any LoRa changes that will disconnect the device.
                if (config.longName !== undefined || config.shortName !== undefined) {
                    await MeshtasticClient.setOwner(
                        config.longName || state.longName,
                        config.shortName || state.shortName
                    );
                }
                if (config.positionBroadcastSecs !== undefined || config.gpsEnabled !== undefined) {
                    await MeshtasticClient.setPositionConfig(
                        config.positionBroadcastSecs,
                        config.gpsUpdateInterval,
                        config.gpsEnabled
                    );
                }
                
                // === LoRa config LAST (triggers reboot) ===
                // Batch LoRa config changes into a single write if multiple LoRa params present
                const loraParams = {};
                let hasLoRa = false;
                for (const key of ['region', 'modemPreset', 'txPower', 'hopLimit']) {
                    if (config[key] !== undefined) {
                        loraParams[key] = config[key];
                        hasLoRa = true;
                    }
                }
                
                if (hasLoRa && MeshtasticClient.setLoRaConfig) {
                    // Single write via batch function
                    // Only reboot if explicitly requested (e.g. from setRadioConfig batch call)
                    const autoReboot = config._reboot === true;
                    await MeshtasticClient.setLoRaConfig(loraParams, autoReboot);
                    // After this, device may be rebooting — don't try any more writes
                } else if (hasLoRa) {
                    // Fallback: individual writes (no batch available)
                    if (config.region !== undefined) {
                        await MeshtasticClient.setRegion(config.region);
                    }
                    if (config.modemPreset !== undefined) {
                        await MeshtasticClient.setModemPreset(config.modemPreset);
                    }
                    if (config.txPower !== undefined) {
                        await MeshtasticClient.setTxPower(config.txPower);
                    }
                    if (config.hopLimit !== undefined) {
                        await MeshtasticClient.setHopLimit(config.hopLimit);
                    }
                    // LoRa changes require reboot to take effect
                    if (config._reboot === true && MeshtasticClient.rebootDevice) {
                        await MeshtasticClient.rebootDevice(2);
                    }
                }
                
                console.log('[Meshtastic] Config sent successfully');
                return true;
            } catch (error) {
                // BLE disconnect during config write = device rebooted (expected for LoRa changes)
                const msg = (error.message || '').toLowerCase();
                if (msg.includes('disconnect') || msg.includes('gatt') || msg.includes('bluetooth') ||
                    msg.includes('not connected') || msg.includes('network error')) {
                    console.log('[Meshtastic] Config write: BLE disconnected (device rebooting — expected)');
                    return true;
                }
                console.error('[Meshtastic] Failed to send config:', error);
                throw error;
            }
        }
        
        // Fallback: Log that config would be sent (for offline/simulation mode)
        console.log('[Meshtastic] Config queued (will send when connected):', config);
        return true;
    }
    
    /**
     * Request device config from connected device
     * Uses MeshtasticClient for real device communication when available
     */
    async function requestDeviceConfig() {
        if (state.connectionState !== ConnectionState.CONNECTED) {
            throw new Error('Not connected to device');
        }
        
        // Use MeshtasticClient for real config request
        if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isConnected && MeshtasticClient.isConnected()) {
            console.log('[Meshtastic] Requesting real device config...');
            
            try {
                await MeshtasticClient.requestConfig();
                
                // Config will be received via callback and synced
                // Give it a moment to arrive
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const clientConfig = MeshtasticClient.getConfig();
                if (clientConfig) {
                    syncDeviceConfigFromClient(clientConfig);
                }
                
                state.deviceConfig.configLoaded = true;
                Events.emit('meshtastic:config_loaded', state.deviceConfig);
                return state.deviceConfig;
            } catch (error) {
                console.error('[Meshtastic] Failed to request config:', error);
                throw error;
            }
        }
        
        // Fallback: Return cached config
        console.log('[Meshtastic] Using cached config (MeshtasticClient not available)');
        state.deviceConfig.configLoaded = true;
        Events.emit('meshtastic:config_loaded', state.deviceConfig);
        return state.deviceConfig;
    }
    
    /**
     * Save device config to storage
     */
    async function saveDeviceConfig() {
        try {
            await Storage.Settings.set('meshtastic_device_config', state.deviceConfig);
        } catch (e) {
            console.warn('Could not save device config:', e);
        }
    }
    
    /**
     * Load device config from storage
     */
    async function loadDeviceConfig() {
        try {
            const saved = await Storage.Settings.get('meshtastic_device_config');
            if (saved) {
                state.deviceConfig = { ...state.deviceConfig, ...saved };
            }
        } catch (e) {
            console.warn('Could not load device config:', e);
        }
    }
    
    /**
     * Get firmware status for a node
     */
    function getNodeFirmwareStatus(nodeId) {
        const node = state.nodes.get(nodeId);
        if (!node || !node.firmwareVersion) {
            return { status: 'unknown', message: 'No firmware info' };
        }
        return checkFirmwareStatus(node.firmwareVersion);
    }
    
    /**
     * Get my device's firmware status
     */
    function getMyFirmwareStatus() {
        return checkFirmwareStatus(state.deviceConfig.firmwareVersion);
    }
    
    /**
     * Get all region options for UI
     */
    function getRegionOptions() {
        return Object.entries(RegionCode).map(([key, value]) => ({
            value,
            label: RegionNames[value] || key,
            key
        }));
    }
    
    /**
     * Get all modem preset options for UI
     */
    function getModemPresetOptions() {
        return Object.entries(ModemPreset).map(([key, value]) => ({
            value,
            label: ModemPresetInfo[value]?.name || key,
            ...ModemPresetInfo[value]
        }));
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
        
        // Get self position from:
        // 1. Self node in state.nodes (Meshtastic device's own GPS — set during connection)
        // 2. GPSModule (phone/tablet GPS or manual position)
        let selfLat = 0, selfLon = 0, selfAlt = undefined, selfAccuracy = undefined;
        
        // Check Meshtastic device's own position first (most direct after connection)
        if (state.myNodeId) {
            const selfNode = state.nodes.get(state.myNodeId);
            if (selfNode && selfNode.lat && selfNode.lon &&
                (Math.abs(selfNode.lat) > 0.0001 || Math.abs(selfNode.lon) > 0.0001)) {
                selfLat = selfNode.lat;
                selfLon = selfNode.lon;
                selfAlt = selfNode.alt;
            }
        }
        
        // Fall back to GPSModule position (phone GPS or manual position)
        if (selfLat === 0 && selfLon === 0 && typeof GPSModule !== 'undefined') {
            const gpsPos = GPSModule.getPosition();
            if (gpsPos && gpsPos.lat && gpsPos.lon) {
                selfLat = gpsPos.lat;
                selfLon = gpsPos.lon;
                selfAlt = gpsPos.altitude;
                selfAccuracy = gpsPos.accuracy;
            }
        }
        
        // Add self first
        members.push({
            id: state.myNodeId || 'self',
            name: `${state.longName} (You)`,
            shortName: state.shortName,
            status: 'active',
            lastUpdate: 'Now',
            lat: selfLat,
            lon: selfLon,
            alt: selfAlt,
            accuracy: selfAccuracy,
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
        // When using the real Meshtastic client, node info is synced automatically
        // during device configuration. Requesting a config refresh will re-sync.
        if (state.usingRealClient && typeof MeshtasticClient !== 'undefined') {
            try {
                await MeshtasticClient.requestConfig();
            } catch (e) {
                console.warn('[Meshtastic] Failed to request config refresh:', e);
            }
            return;
        }
        
        // Legacy path
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
     * @param {boolean} forceQueue - Force message to queue even if connected
     */
    async function sendTextMessage(text, to = null, channelId = null, forceQueue = false) {
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
        
        // Store locally first (so it appears in UI immediately)
        addMessageToHistory(message, true);
        
        // Check if we should queue the message
        const isConnected = checkMeshConnectivity();
        const shouldQueue = forceQueue || !isConnected || state.meshConnectivityStatus === 'disconnected';
        
        if (shouldQueue) {
            // Queue the message for later delivery
            console.log(`[Queue] Connectivity: ${state.meshConnectivityStatus}, queuing message`);
            
            state.messageStates.set(messageId, {
                status: DeliveryStatus.QUEUED,
                sentAt: null,
                ackAt: null,
                retries: 0,
                queuedAt: Date.now()
            });
            
            const queued = addToOutboundQueue(message);
            if (!queued) {
                // Queue is full
                updateMessageStatus(messageId, DeliveryStatus.FAILED);
                throw new Error('Message queue is full');
            }
            
            return message;
        }
        
        // Set initial delivery status as pending (about to send)
        state.messageStates.set(messageId, {
            status: DeliveryStatus.PENDING,
            sentAt: Date.now(),
            ackAt: null,
            retries: 0
        });
        
        try {
            // Send to mesh
            await sendToDevice(message);
            
            // Update status to SENT
            updateMessageStatus(messageId, DeliveryStatus.SENT);
            
            // Set up ACK timeout
            setupAckTimeout(messageId, message);
            
        } catch (e) {
            console.error('Failed to send message:', e);
            
            // On failure, queue for retry instead of marking as failed immediately
            console.log('[Queue] Send failed, queuing for retry');
            const queued = addToOutboundQueue(message);
            
            if (!queued) {
                // Queue full - mark as failed
                updateMessageStatus(messageId, DeliveryStatus.FAILED);
                throw e;
            }
            
            // Message is now queued - don't throw error to caller
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
     * Handle transport-level ACK/NACK from Meshtastic radio
     * Bridges the real radio's delivery confirmation into GridDown's
     * app-level delivery status tracking system.
     */
    function handleTransportAck(ack) {
        const messageId = state.packetIdToMessageId.get(ack.packetId);
        if (!messageId) return; // Not a tracked GridDown message
        
        // Clean up the mapping
        state.packetIdToMessageId.delete(ack.packetId);
        
        if (ack.success) {
            // Radio confirmed delivery — update status and cancel timeout
            console.log(`[Meshtastic] Transport ACK for message ${messageId} (packet ${ack.packetId})`);
            updateMessageStatus(messageId, DeliveryStatus.DELIVERED);
            
            // Cancel the pending ACK timeout since we got a real confirmation
            const pending = state.pendingAcks.get(messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                state.pendingAcks.delete(messageId);
            }
            
            Events.emit('meshtastic:transport_ack', { messageId, packetId: ack.packetId });
        } else {
            // Radio reported delivery failure
            console.warn(`[Meshtastic] Transport NACK for message ${messageId} (error: ${ack.errorReason})`);
            
            // Don't immediately mark as FAILED — mesh networks can be flaky
            // Leave it in SENT state so the queue retry system can handle it
            Events.emit('meshtastic:transport_nack', { 
                messageId, 
                packetId: ack.packetId, 
                errorReason: ack.errorReason 
            });
        }
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
    // PHASE 1.5: STORE-AND-FORWARD QUEUE
    // =========================================================================
    
    /**
     * Load outbound queue from storage
     */
    async function loadOutboundQueue() {
        try {
            const savedQueue = await Storage.Settings.get(QUEUE_STORAGE_KEY);
            if (savedQueue && Array.isArray(savedQueue)) {
                state.outboundQueue = savedQueue;
                console.log(`[Queue] Loaded ${savedQueue.length} queued messages`);
                
                // Update message states for queued messages
                savedQueue.forEach(queuedMsg => {
                    if (queuedMsg.id) {
                        state.messageStates.set(queuedMsg.id, {
                            status: DeliveryStatus.QUEUED,
                            sentAt: null,
                            ackAt: null,
                            retries: queuedMsg.retries || 0,
                            queuedAt: queuedMsg.queuedAt || Date.now()
                        });
                    }
                });
                
                // Emit queue status event
                Events.emit('meshtastic:queue_loaded', { count: savedQueue.length });
            }
        } catch (e) {
            console.error('[Queue] Failed to load queue:', e);
        }
    }
    
    /**
     * Save outbound queue to storage
     */
    async function saveOutboundQueue() {
        try {
            await Storage.Settings.set(QUEUE_STORAGE_KEY, state.outboundQueue);
        } catch (e) {
            console.error('[Queue] Failed to save queue:', e);
        }
    }
    
    /**
     * Check mesh connectivity status
     * Returns true if we can likely send messages
     */
    function checkMeshConnectivity() {
        // Not connected to device at all
        if (state.connectionState !== ConnectionState.CONNECTED) {
            state.meshConnectivityStatus = 'disconnected';
            return false;
        }
        
        // Check if MeshtasticClient is available and connected
        if (typeof MeshtasticClient !== 'undefined' && 
            MeshtasticClient.isConnected && 
            !MeshtasticClient.isConnected()) {
            state.meshConnectivityStatus = 'disconnected';
            return false;
        }
        
        // Check if we have any nodes in the mesh (besides ourselves)
        const otherNodes = Array.from(state.nodes.values()).filter(n => {
            // Exclude our own node
            if (n.id === state.myNodeId || n.num === state.myNodeNum) return false;
            // Check if node was seen recently (within 30 minutes)
            const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
            return n.lastSeen && n.lastSeen > thirtyMinutesAgo;
        });
        
        if (otherNodes.length === 0) {
            state.meshConnectivityStatus = 'partial';
            // Still allow sending - messages may be relayed later
            return true;
        }
        
        state.meshConnectivityStatus = 'connected';
        return true;
    }
    
    /**
     * Add message to outbound queue
     * @param {Object} message - Message to queue
     * @returns {boolean} - True if added, false if queue full
     */
    function addToOutboundQueue(message) {
        if (state.outboundQueue.length >= QUEUE_MAX_SIZE) {
            console.warn('[Queue] Queue full, cannot add message');
            Events.emit('meshtastic:queue_full', { queueSize: state.outboundQueue.length });
            return false;
        }
        
        const queuedMessage = {
            ...message,
            queuedAt: Date.now(),
            retries: 0,
            nextRetryAt: Date.now()
        };
        
        state.outboundQueue.push(queuedMessage);
        
        // Update message status
        state.messageStates.set(message.id, {
            status: DeliveryStatus.QUEUED,
            sentAt: null,
            ackAt: null,
            retries: 0,
            queuedAt: queuedMessage.queuedAt
        });
        
        // Save queue
        saveOutboundQueue();
        
        console.log(`[Queue] Message ${message.id} queued (${state.outboundQueue.length} in queue)`);
        
        // Emit events
        Events.emit('meshtastic:message_queued', { 
            messageId: message.id, 
            queueSize: state.outboundQueue.length 
        });
        Events.emit('meshtastic:message_status', { 
            messageId: message.id, 
            status: DeliveryStatus.QUEUED 
        });
        
        return true;
    }
    
    /**
     * Remove message from outbound queue
     * @param {string} messageId - ID of message to remove
     */
    function removeFromOutboundQueue(messageId) {
        const index = state.outboundQueue.findIndex(m => m.id === messageId);
        if (index !== -1) {
            state.outboundQueue.splice(index, 1);
            saveOutboundQueue();
            console.log(`[Queue] Message ${messageId} removed from queue`);
        }
    }
    
    /**
     * Process the outbound queue - try to send queued messages
     * Called periodically when connected
     */
    async function processOutboundQueue() {
        // Don't process if not connected
        if (!checkMeshConnectivity() && state.meshConnectivityStatus === 'disconnected') {
            return;
        }
        
        // Don't process if queue is empty
        if (state.outboundQueue.length === 0) {
            return;
        }
        
        const now = Date.now();
        state.lastQueueProcessTime = now;
        
        console.log(`[Queue] Processing ${state.outboundQueue.length} queued messages`);
        
        // Process messages that are ready for retry
        const messagesToProcess = state.outboundQueue.filter(msg => {
            return msg.nextRetryAt <= now && msg.retries < QUEUE_MAX_RETRIES;
        });
        
        for (const queuedMsg of messagesToProcess) {
            try {
                // Update status to pending
                updateMessageStatus(queuedMsg.id, DeliveryStatus.PENDING);
                
                // Try to send
                await sendToDevice(queuedMsg);
                
                // Success - update status and remove from queue
                updateMessageStatus(queuedMsg.id, DeliveryStatus.SENT);
                removeFromOutboundQueue(queuedMsg.id);
                
                // Set up ACK timeout
                setupAckTimeout(queuedMsg.id, queuedMsg);
                
                console.log(`[Queue] Successfully sent queued message ${queuedMsg.id}`);
                Events.emit('meshtastic:queue_message_sent', { messageId: queuedMsg.id });
                
                // Small delay between messages to avoid flooding
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (e) {
                console.error(`[Queue] Failed to send message ${queuedMsg.id}:`, e);
                
                // Increment retry count
                queuedMsg.retries++;
                
                if (queuedMsg.retries >= QUEUE_MAX_RETRIES) {
                    // Max retries reached - mark as failed and remove
                    updateMessageStatus(queuedMsg.id, DeliveryStatus.FAILED);
                    removeFromOutboundQueue(queuedMsg.id);
                    Events.emit('meshtastic:queue_message_failed', { 
                        messageId: queuedMsg.id,
                        reason: 'max_retries'
                    });
                } else {
                    // Schedule next retry with exponential backoff
                    const backoffMs = QUEUE_RETRY_INTERVAL * Math.pow(QUEUE_RETRY_BACKOFF, queuedMsg.retries);
                    queuedMsg.nextRetryAt = now + backoffMs;
                    
                    // Keep as queued
                    updateMessageStatus(queuedMsg.id, DeliveryStatus.QUEUED);
                    
                    console.log(`[Queue] Message ${queuedMsg.id} retry ${queuedMsg.retries}/${QUEUE_MAX_RETRIES} in ${backoffMs}ms`);
                }
                
                // Save updated queue
                saveOutboundQueue();
            }
        }
        
        // Check for messages that have exceeded max retries
        const failedMessages = state.outboundQueue.filter(msg => msg.retries >= QUEUE_MAX_RETRIES);
        failedMessages.forEach(msg => {
            updateMessageStatus(msg.id, DeliveryStatus.FAILED);
            removeFromOutboundQueue(msg.id);
        });
    }
    
    /**
     * Start the queue processor interval
     */
    function startQueueProcessor() {
        if (state.queueProcessorInterval) {
            return; // Already running
        }
        
        console.log('[Queue] Starting queue processor');
        
        // Process immediately on start
        processOutboundQueue();
        
        // Then process periodically
        state.queueProcessorInterval = setInterval(() => {
            processOutboundQueue();
        }, QUEUE_RETRY_INTERVAL);
        
        // Also track with EventManager for cleanup
        if (meshEvents) {
            meshEvents.setInterval(processOutboundQueue, QUEUE_RETRY_INTERVAL);
        }
    }
    
    /**
     * Stop the queue processor interval
     */
    function stopQueueProcessor() {
        if (state.queueProcessorInterval) {
            clearInterval(state.queueProcessorInterval);
            state.queueProcessorInterval = null;
            console.log('[Queue] Stopped queue processor');
        }
    }
    
    /**
     * Get queue status and statistics
     */
    function getQueueStatus() {
        const queue = state.outboundQueue;
        const now = Date.now();
        
        return {
            count: queue.length,
            maxSize: QUEUE_MAX_SIZE,
            isEmpty: queue.length === 0,
            isFull: queue.length >= QUEUE_MAX_SIZE,
            meshStatus: state.meshConnectivityStatus,
            messages: queue.map(msg => ({
                id: msg.id,
                text: msg.text?.substring(0, 50) + (msg.text?.length > 50 ? '...' : ''),
                queuedAt: msg.queuedAt,
                waitTime: now - msg.queuedAt,
                retries: msg.retries,
                nextRetryAt: msg.nextRetryAt,
                status: state.messageStates.get(msg.id)?.status || DeliveryStatus.QUEUED
            })),
            stats: {
                totalQueued: queue.length,
                pendingRetry: queue.filter(m => m.retries > 0).length,
                oldestMessage: queue.length > 0 ? Math.min(...queue.map(m => m.queuedAt)) : null,
                averageWaitTime: queue.length > 0 
                    ? queue.reduce((sum, m) => sum + (now - m.queuedAt), 0) / queue.length 
                    : 0
            }
        };
    }
    
    /**
     * Clear all queued messages
     * @param {boolean} markAsFailed - Whether to mark messages as failed
     */
    function clearOutboundQueue(markAsFailed = false) {
        if (markAsFailed) {
            state.outboundQueue.forEach(msg => {
                updateMessageStatus(msg.id, DeliveryStatus.FAILED);
            });
        }
        
        const count = state.outboundQueue.length;
        state.outboundQueue = [];
        saveOutboundQueue();
        
        console.log(`[Queue] Cleared ${count} queued messages`);
        Events.emit('meshtastic:queue_cleared', { count, markedFailed: markAsFailed });
        
        return count;
    }
    
    /**
     * Retry a specific queued message immediately
     * @param {string} messageId - ID of message to retry
     */
    async function retryQueuedMessage(messageId) {
        const queuedMsg = state.outboundQueue.find(m => m.id === messageId);
        if (!queuedMsg) {
            console.warn('[Queue] Message not found in queue:', messageId);
            return false;
        }
        
        // Reset retry timing for immediate send
        queuedMsg.nextRetryAt = 0;
        
        // Process queue (will pick up this message)
        await processOutboundQueue();
        
        return true;
    }
    
    /**
     * Cancel a queued message
     * @param {string} messageId - ID of message to cancel
     */
    function cancelQueuedMessage(messageId) {
        const index = state.outboundQueue.findIndex(m => m.id === messageId);
        if (index === -1) {
            return false;
        }
        
        // Remove from queue
        state.outboundQueue.splice(index, 1);
        saveOutboundQueue();
        
        // Update status
        updateMessageStatus(messageId, DeliveryStatus.FAILED);
        
        console.log(`[Queue] Cancelled message ${messageId}`);
        Events.emit('meshtastic:queue_message_cancelled', { messageId });
        
        return true;
    }
    
    // =========================================================================
    // PHASE 2: QUICK SETUP & FIELD UX
    // =========================================================================
    
    /**
     * Get all scenario presets
     */
    function getScenarioPresets() {
        return Object.values(ScenarioPresets);
    }
    
    /**
     * Get a specific scenario preset by ID
     */
    function getScenarioPreset(scenarioId) {
        return ScenarioPresets[scenarioId.toUpperCase()] || ScenarioPresets.CUSTOM;
    }
    
    /**
     * Get the active scenario
     */
    function getActiveScenario() {
        return getScenarioPreset(state.activeScenario);
    }
    
    /**
     * Apply a scenario preset to the device
     * @param {string} scenarioId - ID of the scenario to apply
     * @param {boolean} applyToDevice - Whether to send settings to device
     */
    async function applyScenarioPreset(scenarioId, applyToDevice = true) {
        const scenario = getScenarioPreset(scenarioId);
        if (!scenario) {
            console.error('[Phase2] Scenario not found:', scenarioId);
            return false;
        }
        
        console.log(`[Phase2] Applying scenario: ${scenario.name}`);
        state.activeScenario = scenario.id;
        
        // Apply settings if not custom and device connected
        if (scenario.settings && applyToDevice && state.connectionState === ConnectionState.CONNECTED) {
            try {
                // Batch LoRa config changes into single write + reboot
                const loraConfig = {};
                if (scenario.settings.modemPreset !== undefined) loraConfig.modemPreset = scenario.settings.modemPreset;
                if (scenario.settings.hopLimit !== undefined) loraConfig.hopLimit = scenario.settings.hopLimit;
                
                if (Object.keys(loraConfig).length > 0) {
                    await setRadioConfig(loraConfig);
                }
                
                // Update local config for position broadcast (non-LoRa, no reboot needed)
                if (scenario.settings.positionBroadcastSecs !== undefined) {
                    state.deviceConfig.positionBroadcastSecs = scenario.settings.positionBroadcastSecs;
                }
                
                console.log(`[Phase2] Scenario ${scenario.name} applied to device`);
            } catch (e) {
                console.error('[Phase2] Failed to apply scenario settings:', e);
            }
        }
        
        // Save scenario selection
        await saveSettings();
        
        // Emit event
        Events.emit('meshtastic:scenario_changed', { scenario });
        
        return true;
    }
    
    /**
     * Get canned messages for the active scenario
     */
    function getCannedMessages() {
        // Check for custom messages first
        if (state.customCannedMessages && state.customCannedMessages.length > 0) {
            return state.customCannedMessages;
        }
        
        // Get from active scenario
        const scenario = getActiveScenario();
        if (scenario && scenario.cannedMessages) {
            return scenario.cannedMessages.map((text, index) => ({
                id: `canned_${index}`,
                text: text,
                icon: getCannedMessageIcon(text),
                shortcut: String(index + 1)
            }));
        }
        
        return DefaultCannedMessages;
    }
    
    /**
     * Get icon for a canned message based on content
     */
    function getCannedMessageIcon(text) {
        const lower = text.toLowerCase();
        if (lower.includes('ok') || lower.includes('copy') || lower.includes('roger')) return '✓';
        if (lower.includes('moving') || lower.includes('en route')) return '🚶';
        if (lower.includes('rally') || lower.includes('position') || lower.includes('checkpoint')) return '📍';
        if (lower.includes('rtb') || lower.includes('return')) return '🏠';
        if (lower.includes('help') || lower.includes('assist') || lower.includes('sos') || lower.includes('emergency')) return '🆘';
        if (lower.includes('hold') || lower.includes('wait') || lower.includes('standing')) return '⏸️';
        if (lower.includes('complete') || lower.includes('done') || lower.includes('clear')) return '✅';
        if (lower.includes('medical') || lower.includes('injured')) return '🏥';
        if (lower.includes('found') || lower.includes('located')) return '🔍';
        if (lower.includes('safe') || lower.includes('secure')) return '🛡️';
        return '💬';
    }
    
    /**
     * Set custom canned messages
     */
    function setCustomCannedMessages(messages) {
        state.customCannedMessages = messages.map((text, index) => ({
            id: `custom_${index}`,
            text: text,
            icon: getCannedMessageIcon(text),
            shortcut: String(index + 1)
        }));
        saveSettings();
        Events.emit('meshtastic:canned_messages_updated', { messages: state.customCannedMessages });
    }
    
    /**
     * Send a canned message
     */
    async function sendCannedMessage(messageId) {
        const messages = getCannedMessages();
        const msg = messages.find(m => m.id === messageId);
        if (msg) {
            return await sendTextMessage(msg.text);
        }
        return null;
    }
    
    /**
     * Send a canned message by shortcut number (1-8)
     */
    async function sendCannedByShortcut(shortcut) {
        const messages = getCannedMessages();
        const msg = messages.find(m => m.shortcut === String(shortcut));
        if (msg) {
            return await sendTextMessage(msg.text);
        }
        return null;
    }
    
    /**
     * Calculate mesh health status
     */
    function getMeshHealth() {
        const now = Date.now();
        
        // Use cached value if recent
        if (state.meshHealthCache && (now - state.lastHealthUpdate) < 10000) {
            return state.meshHealthCache;
        }
        
        const nodes = Array.from(state.nodes.values());
        const activeNodes = nodes.filter(n => {
            if (n.id === state.myNodeId || n.num === state.myNodeNum) return false;
            return n.lastSeen && (now - n.lastSeen) < MeshHealthThresholds.UPDATE_STALE;
        });
        
        const recentNodes = nodes.filter(n => {
            if (n.id === state.myNodeId || n.num === state.myNodeNum) return false;
            return n.lastSeen && (now - n.lastSeen) < 60000; // Within 1 minute
        });
        
        // Calculate signal quality distribution
        let excellentCount = 0, goodCount = 0, fairCount = 0, poorCount = 0;
        activeNodes.forEach(n => {
            const quality = calculateSignalQuality(n.snr, n.rssi);
            switch (quality) {
                case 'excellent': excellentCount++; break;
                case 'good': goodCount++; break;
                case 'fair': fairCount++; break;
                default: poorCount++; break;
            }
        });
        
        // Determine overall health
        let overallHealth = 'unknown';
        let healthScore = 0;
        
        if (state.connectionState !== ConnectionState.CONNECTED) {
            overallHealth = 'disconnected';
            healthScore = 0;
        } else if (activeNodes.length >= MeshHealthThresholds.NODES_EXCELLENT) {
            overallHealth = excellentCount >= 2 ? 'excellent' : 'good';
            healthScore = 90 + Math.min(10, activeNodes.length * 2);
        } else if (activeNodes.length >= MeshHealthThresholds.NODES_GOOD) {
            overallHealth = 'good';
            healthScore = 70 + activeNodes.length * 5;
        } else if (activeNodes.length >= MeshHealthThresholds.NODES_FAIR) {
            overallHealth = 'fair';
            healthScore = 40 + activeNodes.length * 15;
        } else {
            overallHealth = 'poor';
            healthScore = activeNodes.length > 0 ? 20 : 10;
        }
        
        // Calculate average signal quality
        let avgSnr = 0, avgRssi = 0;
        if (activeNodes.length > 0) {
            avgSnr = activeNodes.reduce((sum, n) => sum + (n.snr || 0), 0) / activeNodes.length;
            avgRssi = activeNodes.reduce((sum, n) => sum + (n.rssi || -100), 0) / activeNodes.length;
        }
        
        const health = {
            status: overallHealth,
            score: Math.min(100, Math.round(healthScore)),
            totalNodes: nodes.length,
            activeNodes: activeNodes.length,
            recentNodes: recentNodes.length,
            signalDistribution: {
                excellent: excellentCount,
                good: goodCount,
                fair: fairCount,
                poor: poorCount
            },
            averageSignal: {
                snr: Math.round(avgSnr * 10) / 10,
                rssi: Math.round(avgRssi)
            },
            queueStatus: getQueueStatus(),
            lastUpdate: now,
            isConnected: state.connectionState === ConnectionState.CONNECTED,
            scenario: getActiveScenario()
        };
        
        // Cache the result
        state.meshHealthCache = health;
        state.lastHealthUpdate = now;
        
        return health;
    }
    
    /**
     * Get mesh health color
     */
    function getMeshHealthColor(status) {
        switch (status) {
            case 'excellent': return '#22c55e';  // Green
            case 'good': return '#84cc16';       // Lime
            case 'fair': return '#f59e0b';       // Amber
            case 'poor': return '#ef4444';       // Red
            case 'disconnected': return '#6b7280'; // Gray
            default: return '#6b7280';
        }
    }
    
    /**
     * Check if first-run wizard has been completed
     */
    function isWizardCompleted() {
        return state.wizardCompleted;
    }
    
    /**
     * Mark wizard as completed
     */
    async function completeWizard() {
        state.wizardCompleted = true;
        await saveSettings();
        Events.emit('meshtastic:wizard_completed');
    }
    
    /**
     * Reset wizard status (for testing)
     */
    async function resetWizard() {
        state.wizardCompleted = false;
        await saveSettings();
    }
    
    /**
     * Generate channel QR code data for team onboarding
     * Returns data that can be encoded into a QR code
     */
    function generateTeamOnboardingQR() {
        const channel = getActiveChannel();
        const scenario = getActiveScenario();
        
        // Build Meshtastic-compatible channel URL
        let url = `https://meshtastic.org/e/#`;
        
        // Encode channel settings
        const channelConfig = {
            name: channel?.name || 'GridDown',
            psk: channel?.psk || '',  // Base64 encoded PSK
            uplink: false,
            downlink: false
        };
        
        // Add scenario info as comment
        const teamInfo = {
            team: state.longName || 'Team',
            scenario: scenario.id,
            timestamp: Date.now()
        };
        
        return {
            url: url + btoa(JSON.stringify(channelConfig)),
            channelName: channel?.name,
            scenario: scenario,
            teamInfo: teamInfo,
            rawConfig: channelConfig
        };
    }
    
    /**
     * Parse team onboarding QR code and join
     */
    async function joinFromQR(qrData) {
        try {
            // Parse the QR data
            let config;
            if (qrData.startsWith('https://meshtastic.org/e/#')) {
                const encoded = qrData.replace('https://meshtastic.org/e/#', '');
                config = JSON.parse(atob(encoded));
            } else if (qrData.startsWith('{')) {
                config = JSON.parse(qrData);
            } else {
                throw new Error('Invalid QR code format');
            }
            
            // Find next available index
            const maxIndex = Math.max(...state.channels.map(c => c.index), -1);
            const newIndex = maxIndex + 1;
            if (newIndex > 7) {
                throw new Error('Maximum of 8 channels (device limit)');
            }
            
            // Create channel from config
            const channel = {
                id: `imported_${Date.now()}`,
                index: newIndex,
                name: config.name || 'Imported',
                psk: config.psk ? hashPSK(config.psk) : null,
                pskRaw: config.psk || null,
                isDefault: false,
                isPrivate: !!config.psk
            };
            
            // Add the channel
            state.channels.push(channel);
            setActiveChannel(channel.id);
            
            // Push to device
            pushChannelToDevice(channel);
            
            // Apply scenario if present
            if (config.scenario) {
                await applyScenarioPreset(config.scenario, false);
            }
            
            await saveSettings();
            
            Events.emit('meshtastic:team_joined', { channel, config });
            
            return { success: true, channel };
        } catch (e) {
            console.error('[Phase2] Failed to join from QR:', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get wizard steps
     */
    function getWizardSteps() {
        return Object.values(WizardSteps);
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
        
        if (newIndex > 7) {
            throw new Error('Maximum of 8 channels (device limit)');
        }
        
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
        
        // Push to device if connected
        pushChannelToDevice(channel);
        
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
        
        // Disable on device if connected
        if (state.usingRealClient && typeof MeshtasticClient !== 'undefined' && MeshtasticClient.isConnected && MeshtasticClient.isConnected()) {
            try {
                MeshtasticClient.setChannel(channel.index, {
                    role: 0, // DISABLED
                    name: '',
                    psk: null
                });
                console.log(`[Meshtastic] Disabled channel ${channel.index} on device`);
            } catch (e) {
                console.warn(`[Meshtastic] Failed to disable channel on device:`, e);
            }
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
    
    /**
     * Push a GridDown channel to the connected Meshtastic device.
     * Converts GridDown channel format → device setChannel() format.
     * Non-blocking: logs warning on failure rather than throwing.
     */
    function pushChannelToDevice(channel) {
        if (!state.usingRealClient || typeof MeshtasticClient === 'undefined') return;
        if (!MeshtasticClient.isConnected || !MeshtasticClient.isConnected()) return;
        
        try {
            // Encode PSK: raw string → TextEncoder, otherwise null for default/public
            let pskBytes = null;
            if (channel.pskRaw && typeof channel.pskRaw === 'string') {
                pskBytes = new TextEncoder().encode(channel.pskRaw);
            } else if (channel.psk && channel.psk instanceof Uint8Array) {
                pskBytes = channel.psk;
            }
            
            MeshtasticClient.setChannel(channel.index, {
                role: channel.isDefault ? 1 : 2,  // 1=PRIMARY, 2=SECONDARY
                name: channel.name,
                psk: pskBytes
            });
            console.log(`[Meshtastic] Pushed channel [${channel.index}] "${channel.name}" to device`);
        } catch (e) {
            console.warn(`[Meshtastic] Failed to push channel to device:`, e);
        }
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
        
        // DMs have a tighter text limit than channel messages because the plaintext
        // is encrypted (adding AES-GCM overhead) and base64-encoded before being
        // wrapped in a JSON envelope — all of which must fit in the LoRa payload.
        if (text.length > MAX_DM_TEXT_SIZE) {
            text = text.substring(0, MAX_DM_TEXT_SIZE);
            console.log(`[Meshtastic] DM text truncated to ${MAX_DM_TEXT_SIZE} chars (LoRa payload limit)`);
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
                id: waypoint.id ? waypoint.id.substring(0, 16) : `wp-${Date.now()}`,
                name: waypoint.name ? waypoint.name.substring(0, 20) : 'Waypoint',
                type: waypoint.type,
                lat: waypoint.lat || (37.4215 + (waypoint.y - 50) * 0.002),
                lon: waypoint.lon || (-119.1892 + (waypoint.x - 50) * 0.004),
                notes: waypoint.notes ? waypoint.notes.substring(0, 40) : '',
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
     * Send a quick location pin to mesh (streamlined for Drop Pin → Send workflow)
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {string} label - Optional label for the pin
     * @param {string} toNodeId - Optional recipient node ID (null = broadcast)
     * @param {number} channelId - Optional channel index
     */
    async function sendLocation(lat, lon, label = null, toNodeId = null, channelId = null) {
        // Generate a compact label if not provided
        const pinLabel = label || `Pin ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        
        // Format coordinates for text message (works on all Meshtastic devices)
        const latDir = lat >= 0 ? 'N' : 'S';
        const lonDir = lon >= 0 ? 'E' : 'W';
        const coordText = `📍 ${pinLabel}\n${Math.abs(lat).toFixed(6)}°${latDir}, ${Math.abs(lon).toFixed(6)}°${lonDir}`;
        
        // Also send as waypoint for rich display on compatible devices
        const waypointMessage = {
            type: MessageType.WAYPOINT,
            from: state.myNodeId,
            fromName: state.shortName,
            to: toNodeId,  // null = broadcast
            waypoint: {
                id: `pin-${Date.now()}`,
                name: pinLabel,
                type: 'pin',
                lat: lat,
                lon: lon,
                notes: '',
                icon: '📍',
                expire: Date.now() + (24 * 60 * 60 * 1000) // Expire in 24 hours
            },
            timestamp: Date.now()
        };
        
        try {
            // Send as text message first (universal compatibility)
            const textMsg = await sendTextMessage(coordText, toNodeId, channelId);
            
            // Then send as waypoint for rich devices
            await sendToDevice(waypointMessage);
            
            const recipientName = toNodeId 
                ? (getNodeById(toNodeId)?.name || 'selected node')
                : 'all';
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`📍 Location sent to ${recipientName}`, 'success');
            }
            
            Events.emit('meshtastic:location_sent', { 
                lat, lon, label: pinLabel, 
                to: toNodeId, 
                broadcast: !toNodeId 
            });
            
            return { success: true, textMessage: textMsg, waypointMessage };
        } catch (e) {
            console.error('[Meshtastic] Failed to send location:', e);
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Failed to send location: ' + e.message, 'error');
            }
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get list of mesh nodes for recipient selection
     */
    function getNodesForRecipientSelection() {
        const nodes = [];
        const now = Date.now();
        
        state.nodes.forEach((node, id) => {
            // Skip self
            if (id === state.myNodeId || node.num === state.myNodeNum) return;
            
            // Include nodes seen within last hour
            if (node.lastSeen && (now - node.lastSeen) < 3600000) {
                nodes.push({
                    id: id,
                    num: node.num,
                    name: node.longName || node.shortName || `Node ${id}`,
                    shortName: node.shortName,
                    lastSeen: node.lastSeen,
                    signalQuality: calculateSignalQuality(node.snr, node.rssi),
                    isActive: (now - node.lastSeen) < 300000 // Active within 5 min
                });
            }
        });
        
        // Sort by most recently seen
        nodes.sort((a, b) => b.lastSeen - a.lastSeen);
        
        return nodes;
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
    // TRACEROUTE FUNCTIONALITY
    // =========================================================================
    
    const TRACEROUTE_TIMEOUT = 30000;  // 30 seconds timeout
    const TRACEROUTE_MAX_HOPS = 10;    // Maximum hops to track
    
    /**
     * Request traceroute to a destination node.
     * Uses Meshtastic's native firmware-level RouteDiscovery (portnum 70)
     * which sends compact protobuf packets handled at the routing layer.
     * Works with ALL Meshtastic nodes, not just GridDown ones.
     * 
     * @param {string} targetNodeId - Node ID to trace route to (e.g. "!702f3ab7")
     * @returns {Promise<Object>} - Traceroute tracking object
     */
    async function requestTraceroute(targetNodeId) {
        if (state.connectionState !== ConnectionState.CONNECTED) {
            throw new Error('Not connected to Meshtastic');
        }
        
        if (!targetNodeId) {
            throw new Error('Target node ID required');
        }
        
        // Get target node info
        const targetNode = getNodeById(targetNodeId);
        const targetName = targetNode?.name || targetNode?.longName || `Node ${targetNodeId}`;
        
        // Convert string node ID to numeric nodeNum for the native API
        let targetNodeNum = targetNode?.num;
        if (!targetNodeNum && typeof targetNodeId === 'string' && targetNodeId.startsWith('!')) {
            targetNodeNum = parseInt(targetNodeId.slice(1), 16);
        }
        if (!targetNodeNum) {
            throw new Error('Cannot resolve node number for ' + targetNodeId);
        }
        
        // Generate unique request ID for tracking
        const requestId = `tr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        // Initialize traceroute tracking
        const traceroute = {
            requestId,
            targetNodeId,
            targetNodeNum,
            targetName,
            startedAt: Date.now(),
            status: 'pending',
            route: [
                {
                    nodeId: state.myNodeId,
                    nodeName: state.longName || state.shortName,
                    hopNumber: 0,
                    isOrigin: true
                }
            ],
            hops: 0,
            rtt: null,
            error: null
        };
        
        state.traceroutes.set(requestId, traceroute);
        state.activeTraceroute = requestId;
        
        // Also track by target nodeNum so we can match async responses
        state._pendingTracerouteTarget = targetNodeNum;
        state._pendingTracerouteRequestId = requestId;
        
        try {
            // Use native firmware traceroute (protobuf, not JSON text)
            if (typeof MeshtasticClient !== 'undefined' && MeshtasticClient.traceRoute) {
                console.log(`[Traceroute] Sending native traceroute to ${targetName} (${targetNodeNum})`);
                await MeshtasticClient.traceRoute(targetNodeNum);
            } else {
                throw new Error('Native traceroute not available');
            }
            
            traceroute.status = 'in_progress';
            Events.emit('meshtastic:traceroute_started', { requestId, targetNodeId, targetName });
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`🔍 Tracing route to ${targetName}...`, 'info');
            }
            
            // Set timeout
            const timeoutId = setTimeout(() => {
                const tr = state.traceroutes.get(requestId);
                if (tr && tr.status === 'in_progress') {
                    tr.status = 'timeout';
                    tr.error = 'Traceroute timed out';
                    state._pendingTracerouteTarget = null;
                    state._pendingTracerouteRequestId = null;
                    Events.emit('meshtastic:traceroute_timeout', { requestId, targetNodeId });
                    
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast(`⏱️ Traceroute to ${targetName} timed out`, 'warning');
                    }
                }
            }, TRACEROUTE_TIMEOUT);
            
            traceroute.timeoutId = timeoutId;
            
            return { requestId, traceroute };
            
        } catch (e) {
            traceroute.status = 'error';
            traceroute.error = e.message;
            state._pendingTracerouteTarget = null;
            state._pendingTracerouteRequestId = null;
            Events.emit('meshtastic:traceroute_error', { requestId, error: e.message });
            throw e;
        }
    }
    
    /**
     * Handle native firmware traceroute response.
     * Called when the onTraceroute callback fires from MeshtasticClient.
     * The firmware's RouteDiscovery contains route[] (array of node nums
     * that relayed the packet) and optionally snrTowards[]/snrBack[].
     */
    function handleNativeTracerouteResponse(data) {
        const requestId = state._pendingTracerouteRequestId;
        const traceroute = requestId ? state.traceroutes.get(requestId) : null;
        
        if (!traceroute || traceroute.status !== 'in_progress') {
            console.log('[Traceroute] Received response but no pending traceroute');
            return;
        }
        
        // Clear timeout
        if (traceroute.timeoutId) {
            clearTimeout(traceroute.timeoutId);
        }
        
        // Clear pending state
        state._pendingTracerouteTarget = null;
        state._pendingTracerouteRequestId = null;
        
        // Calculate RTT
        const rtt = Date.now() - traceroute.startedAt;
        
        // Build complete route: origin → relay nodes → destination
        // data.route contains intermediate relay node nums (NOT including origin or destination)
        const routeNodeNums = data.route || [];
        const allNodeNums = [
            state.myNodeNum || parseInt((state.myNodeId || '').replace('!', ''), 16),
            ...routeNodeNums,
            traceroute.targetNodeNum
        ];
        
        const completeRoute = allNodeNums.map((nodeNum, index) => {
            // Look up node by numeric ID
            const nodeId = `!${nodeNum.toString(16).padStart(8, '0')}`;
            const node = getNodeById(nodeId) || getNodeById(nodeNum);
            
            return {
                nodeId: nodeId,
                nodeNum: nodeNum,
                nodeName: node?.name || node?.longName || node?.shortName || `Node ${nodeId}`,
                hopNumber: index,
                isOrigin: index === 0,
                isDestination: index === allNodeNums.length - 1,
                signalQuality: node?.signalQuality,
                snr: data.snrTowards?.[index] ?? node?.snr,
                rssi: node?.rssi,
                lastSeen: node?.lastSeen
            };
        });
        
        // Update traceroute
        traceroute.status = 'completed';
        traceroute.route = completeRoute;
        traceroute.hops = routeNodeNums.length + 1; // relay hops + final hop to destination
        traceroute.rtt = rtt;
        traceroute.completedAt = Date.now();
        traceroute.snrTowards = data.snrTowards;
        traceroute.snrBack = data.snrBack;
        
        // Add to history
        state.tracerouteHistory.unshift({
            ...traceroute,
            timeoutId: undefined
        });
        if (state.tracerouteHistory.length > 20) {
            state.tracerouteHistory = state.tracerouteHistory.slice(0, 20);
        }
        
        // Persist traceroute history
        Storage.Settings.set('meshtastic_traceroute_history', state.tracerouteHistory);
        
        Events.emit('meshtastic:traceroute_complete', { 
            requestId, 
            route: completeRoute, 
            hops: traceroute.hops,
            rtt 
        });
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(
                `✓ Route found: ${traceroute.hops} hop${traceroute.hops !== 1 ? 's' : ''} (${rtt}ms)`, 
                'success'
            );
        }
        
        return traceroute;
    }
    
    /**
     * Get active traceroute result
     */
    function getActiveTraceroute() {
        if (!state.activeTraceroute) return null;
        return state.traceroutes.get(state.activeTraceroute);
    }
    
    /**
     * Get traceroute by request ID
     */
    function getTraceroute(requestId) {
        return state.traceroutes.get(requestId);
    }
    
    /**
     * Get traceroute history
     */
    function getTracerouteHistory() {
        return [...state.tracerouteHistory];
    }
    
    /**
     * Clear traceroute history
     */
    function clearTracerouteHistory() {
        state.tracerouteHistory = [];
        Storage.Settings.set('meshtastic_traceroute_history', []);
        Events.emit('meshtastic:traceroute_history_cleared');
    }
    
    /**
     * Get nodes available for traceroute
     * Returns nodes that have been seen recently
     */
    function getNodesForTraceroute() {
        const nodes = [];
        const now = Date.now();
        
        state.nodes.forEach((node, id) => {
            // Skip self
            if (id === state.myNodeId || node.num === state.myNodeNum) return;
            
            // Include nodes seen within last hour
            if (node.lastSeen && (now - node.lastSeen) < 3600000) {
                nodes.push({
                    id: id,
                    num: node.num,
                    name: node.longName || node.shortName || `Node ${id}`,
                    shortName: node.shortName,
                    lastSeen: node.lastSeen,
                    signalQuality: calculateSignalQuality(node.snr, node.rssi),
                    snr: node.snr,
                    rssi: node.rssi,
                    hopAway: node.hopAway || null,
                    isActive: (now - node.lastSeen) < 300000
                });
            }
        });
        
        // Sort by most recently seen
        nodes.sort((a, b) => b.lastSeen - a.lastSeen);
        
        return nodes;
    }
    
    /**
     * Format traceroute for display
     */
    function formatTracerouteDisplay(traceroute) {
        if (!traceroute) return null;
        
        const statusIcons = {
            pending: '⏳',
            in_progress: '🔄',
            completed: '✅',
            timeout: '⏱️',
            error: '❌'
        };
        
        return {
            requestId: traceroute.requestId,
            targetName: traceroute.targetName,
            status: traceroute.status,
            statusIcon: statusIcons[traceroute.status] || '❓',
            hops: traceroute.hops,
            rtt: traceroute.rtt ? `${traceroute.rtt}ms` : null,
            route: traceroute.route.map((hop, index) => ({
                ...hop,
                displayName: hop.nodeName,
                hopLabel: hop.isOrigin ? 'Origin' : hop.isDestination ? 'Destination' : `Hop ${hop.hopNumber}`,
                signalBadge: hop.signalQuality || null
            })),
            startedAt: traceroute.startedAt,
            completedAt: traceroute.completedAt,
            duration: traceroute.completedAt 
                ? traceroute.completedAt - traceroute.startedAt 
                : Date.now() - traceroute.startedAt,
            error: traceroute.error
        };
    }

    // =========================================================================
    // TELEMETRY EXPORT
    // =========================================================================
    
    /**
     * Export nodes to CSV format
     * @returns {string} CSV content
     */
    function exportNodesCSV() {
        const nodes = Array.from(state.nodes.values());
        const now = Date.now();
        
        // CSV header
        const headers = [
            'Node ID',
            'Name',
            'Short Name',
            'Hardware Model',
            'Firmware Version',
            'Latitude',
            'Longitude',
            'Altitude (m)',
            'SNR (dB)',
            'RSSI (dBm)',
            'Signal Quality',
            'Battery Level (%)',
            'Voltage (V)',
            'Last Seen',
            'Status',
            'Minutes Ago'
        ];
        
        const rows = nodes.map(node => {
            const minutesAgo = node.lastSeen ? Math.round((now - node.lastSeen) / 60000) : '';
            const lastSeenDate = node.lastSeen ? new Date(node.lastSeen).toISOString() : '';
            
            return [
                node.id || '',
                `"${(node.name || node.longName || '').replace(/"/g, '""')}"`,
                node.shortName || '',
                node.hwModelName || '',
                node.firmwareVersion || '',
                node.lat !== undefined ? node.lat.toFixed(6) : '',
                node.lon !== undefined ? node.lon.toFixed(6) : '',
                node.alt !== undefined ? Math.round(node.alt) : '',
                node.snr !== undefined ? node.snr.toFixed(1) : '',
                node.rssi !== undefined ? node.rssi : '',
                node.signalQuality || '',
                node.batteryLevel !== undefined ? node.batteryLevel : '',
                node.voltage !== undefined ? node.voltage.toFixed(2) : '',
                lastSeenDate,
                node.status || '',
                minutesAgo
            ].join(',');
        });
        
        return [headers.join(','), ...rows].join('\n');
    }
    
    /**
     * Export messages to CSV format
     * @param {string|null} channelId - Optional channel filter
     * @returns {string} CSV content
     */
    function exportMessagesCSV(channelId = null) {
        let messages = channelId ? getMessages(channelId) : getMessages();
        
        // CSV header
        const headers = [
            'Timestamp',
            'From Node',
            'From Name',
            'To Node',
            'Channel',
            'Type',
            'Content',
            'Status',
            'Is Sent',
            'RTT (ms)'
        ];
        
        const rows = messages.map(msg => {
            const timestamp = new Date(msg.timestamp || msg.receivedAt).toISOString();
            const content = (msg.text || msg.content || '').replace(/"/g, '""').replace(/\n/g, ' ');
            
            return [
                timestamp,
                msg.from || '',
                `"${(msg.fromName || '').replace(/"/g, '""')}"`,
                msg.to || 'broadcast',
                msg.channelId || 'primary',
                msg.type || 'text',
                `"${content}"`,
                msg.status || '',
                msg.isSent ? 'Yes' : 'No',
                msg.rtt || ''
            ].join(',');
        });
        
        return [headers.join(','), ...rows].join('\n');
    }
    
    /**
     * Export mesh health report
     * @returns {Object} Health report data
     */
    function exportMeshHealthReport() {
        const health = getMeshHealth();
        const nodes = Array.from(state.nodes.values());
        const now = Date.now();
        
        return {
            generatedAt: new Date().toISOString(),
            reportType: 'Mesh Health Report',
            summary: {
                overallStatus: health.status,
                healthScore: health.score,
                totalNodes: health.totalNodes,
                activeNodes: health.activeNodes,
                recentNodes: health.recentNodes,
                isConnected: health.isConnected,
                scenario: health.scenario?.name || 'Custom'
            },
            signalQuality: {
                distribution: health.signalDistribution,
                averageSNR: health.averageSignal.snr,
                averageRSSI: health.averageSignal.rssi
            },
            messageQueue: health.queueStatus,
            nodes: nodes.map(node => ({
                id: node.id,
                name: node.name || node.longName,
                shortName: node.shortName,
                hardware: node.hwModelName,
                firmware: node.firmwareVersion,
                position: node.lat !== undefined ? {
                    lat: node.lat,
                    lon: node.lon,
                    alt: node.alt
                } : null,
                signal: {
                    snr: node.snr,
                    rssi: node.rssi,
                    quality: node.signalQuality
                },
                battery: {
                    level: node.batteryLevel,
                    voltage: node.voltage
                },
                lastSeen: node.lastSeen ? new Date(node.lastSeen).toISOString() : null,
                minutesAgo: node.lastSeen ? Math.round((now - node.lastSeen) / 60000) : null,
                status: node.status
            })),
            deviceConfig: {
                region: state.deviceConfig.region,
                modemPreset: state.deviceConfig.modemPreset,
                hopLimit: state.deviceConfig.hopLimit,
                txPower: state.deviceConfig.txPower,
                firmwareVersion: state.deviceConfig.firmwareVersion,
                hwModel: state.deviceConfig.hwModelName
            }
        };
    }
    
    /**
     * Export comprehensive telemetry report as JSON
     * @returns {Object} Full telemetry report
     */
    function exportFullTelemetryReport() {
        const now = Date.now();
        const nodes = Array.from(state.nodes.values());
        const messages = getMessages();
        const health = getMeshHealth();
        const tracerouteHist = getTracerouteHistory();
        
        return {
            meta: {
                exportedAt: new Date().toISOString(),
                reportType: 'Full Telemetry Export',
                version: '1.0',
                griddownVersion: '6.55.0'
            },
            myNode: {
                id: state.myNodeId,
                num: state.myNodeNum,
                longName: state.longName,
                shortName: state.shortName
            },
            connection: {
                state: state.connectionState,
                type: state.connectionType
            },
            meshHealth: health,
            nodes: nodes.map(node => ({
                id: node.id,
                num: node.num,
                name: node.name || node.longName,
                shortName: node.shortName,
                hardware: {
                    model: node.hwModel,
                    modelName: node.hwModelName,
                    firmware: node.firmwareVersion
                },
                position: {
                    lat: node.lat,
                    lon: node.lon,
                    alt: node.alt
                },
                signal: {
                    snr: node.snr,
                    rssi: node.rssi,
                    quality: node.signalQuality
                },
                power: {
                    batteryLevel: node.batteryLevel,
                    voltage: node.voltage
                },
                timing: {
                    lastSeen: node.lastSeen,
                    lastSeenISO: node.lastSeen ? new Date(node.lastSeen).toISOString() : null,
                    minutesAgo: node.lastSeen ? Math.round((now - node.lastSeen) / 60000) : null
                },
                status: node.status
            })),
            messages: messages.map(msg => ({
                id: msg.id,
                type: msg.type,
                from: msg.from,
                fromName: msg.fromName,
                to: msg.to,
                channelId: msg.channelId,
                content: msg.text || msg.content,
                timestamp: msg.timestamp,
                timestampISO: msg.timestamp ? new Date(msg.timestamp).toISOString() : null,
                status: msg.status,
                isSent: msg.isSent,
                rtt: msg.rtt
            })),
            traceroutes: tracerouteHist.map(tr => ({
                requestId: tr.requestId,
                targetNodeId: tr.targetNodeId,
                targetName: tr.targetName,
                status: tr.status,
                hops: tr.hops,
                rtt: tr.rtt,
                route: tr.route,
                startedAt: tr.startedAt ? new Date(tr.startedAt).toISOString() : null,
                completedAt: tr.completedAt ? new Date(tr.completedAt).toISOString() : null
            })),
            deviceConfig: { ...state.deviceConfig },
            channels: state.channels.map(ch => ({
                id: ch.id,
                name: ch.name,
                index: ch.index,
                isDefault: ch.isDefault,
                isPrivate: ch.isPrivate
            })),
            statistics: {
                totalMessages: messages.length,
                sentMessages: messages.filter(m => m.isSent).length,
                receivedMessages: messages.filter(m => !m.isSent).length,
                totalNodes: nodes.length,
                nodesWithPosition: nodes.filter(n => n.lat !== undefined).length,
                nodesWithSignal: nodes.filter(n => n.snr !== undefined || n.rssi !== undefined).length,
                traceroutesCompleted: tracerouteHist.filter(tr => tr.status === 'completed').length
            }
        };
    }
    
    /**
     * Download data as a file
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} type - MIME type
     */
    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Export and download nodes as CSV
     */
    function downloadNodesCSV() {
        const csv = exportNodesCSV();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadFile(csv, `griddown-nodes-${timestamp}.csv`, 'text/csv');
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('📊 Nodes exported to CSV', 'success');
        }
        
        Events.emit('meshtastic:telemetry_exported', { type: 'nodes_csv' });
    }
    
    /**
     * Export and download messages as CSV
     * @param {string|null} channelId - Optional channel filter
     */
    function downloadMessagesCSV(channelId = null) {
        const csv = exportMessagesCSV(channelId);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const channelSuffix = channelId ? `-${channelId}` : '';
        downloadFile(csv, `griddown-messages${channelSuffix}-${timestamp}.csv`, 'text/csv');
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('💬 Messages exported to CSV', 'success');
        }
        
        Events.emit('meshtastic:telemetry_exported', { type: 'messages_csv', channelId });
    }
    
    /**
     * Export and download full telemetry report as JSON
     */
    function downloadTelemetryReport() {
        const report = exportFullTelemetryReport();
        const json = JSON.stringify(report, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadFile(json, `griddown-telemetry-${timestamp}.json`, 'application/json');
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('📋 Full telemetry report exported', 'success');
        }
        
        Events.emit('meshtastic:telemetry_exported', { type: 'full_report' });
    }
    
    /**
     * Export and download mesh health report as JSON
     */
    function downloadHealthReport() {
        const report = exportMeshHealthReport();
        const json = JSON.stringify(report, null, 2);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadFile(json, `griddown-health-${timestamp}.json`, 'application/json');
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast('🏥 Mesh health report exported', 'success');
        }
        
        Events.emit('meshtastic:telemetry_exported', { type: 'health_report' });
    }
    
    /**
     * Get export summary (for UI display)
     */
    function getExportSummary() {
        const nodes = Array.from(state.nodes.values());
        const messages = getMessages();
        const traceroutes = getTracerouteHistory();
        
        return {
            nodesCount: nodes.length,
            nodesWithPosition: nodes.filter(n => n.lat !== undefined).length,
            messagesCount: messages.length,
            traceroutesCount: traceroutes.length,
            hasData: nodes.length > 0 || messages.length > 0
        };
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
        
        // Truncate detail fields to fit within LoRa payload after compaction.
        // SOS strips fromName and alt to maximize space for details.
        // Receiver resolves sender name from node ID via state.nodes.
        const truncate = (s, max) => s && s.length > max ? s.substring(0, max) : s;
        
        const message = {
            type: MessageType.SOS,
            from: state.myNodeId,
            lat: position?.latitude,
            lon: position?.longitude,
            emergency: true,
            details: {
                situation: truncate(details.situation || 'Emergency', 20),
                injuries: truncate(details.injuries || 'Unknown', 20),
                people: details.people || 1,
                supplies: truncate(details.supplies || 'Unknown', 20),
                message: truncate(details.message || '', 35)
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
        
        // Resolve sender name: use fromName if present, otherwise look up from nodes
        const senderNode = message.from ? state.nodes.get(message.from) : null;
        const senderName = message.fromName || senderNode?.longName || senderNode?.name || message.from || 'Unknown';
        
        // Create emergency waypoint
        if (message.lat && message.lon) {
            const waypoint = {
                id: `sos-${message.from}-${Date.now()}`,
                name: `🆘 SOS: ${senderName}`,
                type: 'hazard',
                lat: message.lat,
                lon: message.lon,
                x: lonToX(message.lon),
                y: latToY(message.lat),
                notes: `EMERGENCY from ${senderName}\n` +
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
            ModalsModule.showToast(`🆘 SOS FROM ${senderName}!`, 'error');
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
    // RESET / FACTORY RESET
    // =========================================================================
    
    /**
     * Factory reset the connected Meshtastic device.
     * Erases all device settings (region, channels, PSKs, owner, position config)
     * and restores firmware defaults. Device will reboot automatically.
     * Also clears GridDown's cached device config to force a clean re-sync.
     *
     * Requires active BLE/Serial connection.
     * @returns {{ success: boolean, error?: string }}
     */
    async function factoryResetDevice() {
        if (!state.usingRealClient || typeof MeshtasticClient === 'undefined') {
            return { success: false, error: 'Not connected via real client' };
        }
        if (!MeshtasticClient.isConnected || !MeshtasticClient.isConnected()) {
            return { success: false, error: 'Device not connected' };
        }
        
        try {
            console.log('[Meshtastic] Factory reset — sending reset command to device...');
            
            await MeshtasticClient.factoryResetDevice();
            
            // Clear GridDown's cached device config so it re-syncs cleanly on reconnect
            state.deviceConfig = {
                region: RegionCode.UNSET,
                modemPreset: ModemPreset.LONG_FAST,
                txPower: 0,
                hopLimit: HOP_LIMIT_DEFAULT,
                isRouter: false,
                positionBroadcastSecs: 900,
                gpsUpdateInterval: 30,
                gpsEnabled: true,
                configLoaded: false
            };
            state.channels = [...DEFAULT_CHANNELS];
            await Storage.Settings.remove('meshtastic_device_config');
            
            // Device will disconnect as it reboots
            state.usingRealClient = false;
            setConnectionState(ConnectionState.DISCONNECTED);
            stopPositionBroadcast();
            
            console.log('[Meshtastic] Factory reset complete — device rebooting to defaults');
            Events.emit('meshtastic:factory_reset', { type: 'device' });
            
            return { success: true };
        } catch (e) {
            console.error('[Meshtastic] Factory reset failed:', e);
            return { success: false, error: e?.message || String(e) };
        }
    }
    
    /**
     * Reset all GridDown-side Meshtastic app state.
     * Clears PKI keys, DM conversations, message history, outbound queue,
     * channel read state, wizard state, and cached device config.
     * Does NOT touch the Meshtastic device hardware.
     *
     * Use cases: handing a tablet to a new operator, clearing stale state
     * after team changes, troubleshooting persistent app-level issues.
     *
     * @returns {{ success: boolean, cleared: string[] }}
     */
    async function resetAppState() {
        const cleared = [];
        
        try {
            // PKI keys
            state.myKeyPair = null;
            state.peerPublicKeys = new Map();
            state.pendingKeyRequests = new Map();
            await Storage.Settings.remove('meshtastic_keypair');
            await Storage.Settings.remove('meshtastic_peer_keys');
            cleared.push('PKI keys');
            
            // DM conversations
            state.dmConversations = new Map();
            state.dmUnreadCounts = new Map();
            state.pendingDMs = new Map();
            state.activeDMContact = null;
            cleared.push('DM conversations');
            
            // Message history and states
            state.messages = {};
            state.messageStates = new Map();
            state.pendingAcks = new Map();
            state.packetIdToMessageId = new Map();
            await Storage.Settings.remove('meshtastic_messages');
            await Storage.Settings.remove('meshtastic_dm_conversations');
            cleared.push('Message history');
            
            // Outbound queue
            state.outboundQueue = [];
            state._queueProcessing = false;
            cleared.push('Outbound queue');
            
            // Channels — restore defaults
            state.channels = [...DEFAULT_CHANNELS];
            state.activeChannelId = 'primary';
            state.channelReadState = new Map();
            state.channels.forEach(ch => {
                state.channelReadState.set(ch.id, {
                    lastReadAt: Date.now(),
                    lastReadMessageId: null
                });
            });
            cleared.push('Channels');
            
            // Wizard state
            state.wizardCompleted = false;
            cleared.push('Setup wizard');
            
            // Cached device config
            state.deviceConfig.configLoaded = false;
            await Storage.Settings.remove('meshtastic_device_config');
            cleared.push('Device config cache');
            
            // Node map — keep nodes but clear stale metadata
            for (const [, node] of state.nodes) {
                delete node.lastCheckin;
                delete node.verified;
                delete node.keyFingerprint;
            }
            cleared.push('Node metadata');
            
            // Traceroutes
            state.traceroutes = new Map();
            state.activeTraceroute = null;
            cleared.push('Traceroute history');
            
            // Persist the cleaned state
            await saveSettings();
            
            // Update UI
            updateTeamMembers();
            Events.emit('meshtastic:app_reset', { cleared });
            
            console.log('[Meshtastic] App state reset. Cleared:', cleared.join(', '));
            return { success: true, cleared };
        } catch (e) {
            console.error('[Meshtastic] App state reset error:', e);
            return { success: false, cleared, error: e?.message || String(e) };
        }
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
        
        // Push to device hardware if connected
        if (state.connectionState === ConnectionState.CONNECTED &&
            typeof MeshtasticClient !== 'undefined' &&
            MeshtasticClient.isConnected && MeshtasticClient.isConnected() &&
            typeof MeshtasticClient.setOwner === 'function') {
            MeshtasticClient.setOwner(state.longName, state.shortName).catch(err => {
                console.warn('[Meshtastic] Could not push owner to device:', err.message);
            });
        }
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
        
        // Phase 1.5: Store-and-Forward Queue
        getQueueStatus,
        clearOutboundQueue,
        retryQueuedMessage,
        cancelQueuedMessage,
        processOutboundQueue,
        checkMeshConnectivity,
        
        // Phase 2: Quick Setup & Field UX
        getScenarioPresets,
        getScenarioPreset,
        getActiveScenario,
        applyScenarioPreset,
        getCannedMessages,
        setCustomCannedMessages,
        sendCannedMessage,
        sendCannedByShortcut,
        getMeshHealth,
        getMeshHealthColor,
        isWizardCompleted,
        completeWizard,
        resetWizard,
        generateTeamOnboardingQR,
        joinFromQR,
        getWizardSteps,
        ScenarioPresets,
        DefaultCannedMessages,
        WizardSteps,
        
        // Device Detection & Capabilities
        getDeviceCapabilities,
        getConnectedDeviceCapabilities,
        deviceSupportsSerial,
        deviceSupportsBluetooth,
        getConnectionRecommendation,
        getCommonDevices,
        detectDeviceFromName,
        DeviceCapabilities,
        
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
        sendLocation,
        getNodesForRecipientSelection,
        
        // Traceroute
        requestTraceroute,
        getActiveTraceroute,
        getTraceroute,
        getTracerouteHistory,
        clearTracerouteHistory,
        getNodesForTraceroute,
        formatTracerouteDisplay,
        
        // Telemetry Export
        exportNodesCSV,
        exportMessagesCSV,
        exportMeshHealthReport,
        exportFullTelemetryReport,
        downloadNodesCSV,
        downloadMessagesCSV,
        downloadTelemetryReport,
        downloadHealthReport,
        getExportSummary,
        
        // Emergency
        sendSOS,
        sendCheckin,
        
        // Reset
        factoryResetDevice,
        resetAppState,
        
        // Settings
        setUserName,
        setCallback,
        
        // Data access
        getNodes,
        
        // Demo/Training API - allows external tools to inject simulated nodes
        injectDemoNodes: (demoNodes) => {
            // Only allow in demo mode for security
            if (!window.__GRIDDOWN_DEMO_MODE__ && !window.__SCENEFORGE_DEMO_MODE__) {
                console.warn('[Meshtastic] injectDemoNodes requires demo mode to be enabled');
                return false;
            }
            if (!Array.isArray(demoNodes)) return false;
            for (const n of demoNodes) {
                if (n.nodeNum || n.id) {
                    const nodeNum = n.nodeNum || parseInt(n.id, 16) || Date.now();
                    n._injected = true;
                    n._injectedAt = Date.now();
                    state.nodes.set(nodeNum, n);
                }
            }
            console.log(`[Meshtastic] Injected ${demoNodes.length} demo nodes`);
            return true;
        },
        
        // Clear only injected demo nodes
        clearDemoNodes: () => {
            let cleared = 0;
            for (const [nodeNum, node] of state.nodes) {
                if (node._injected) {
                    state.nodes.delete(nodeNum);
                    cleared++;
                }
            }
            console.log(`[Meshtastic] Cleared ${cleared} demo nodes`);
            return cleared;
        },
        
        // Inject demo messages (for training scenarios)
        injectDemoMessages: (demoMessages, channelId = 0) => {
            if (!window.__GRIDDOWN_DEMO_MODE__ && !window.__SCENEFORGE_DEMO_MODE__) {
                console.warn('[Meshtastic] injectDemoMessages requires demo mode to be enabled');
                return false;
            }
            if (!Array.isArray(demoMessages)) return false;
            
            if (!state.messages[channelId]) {
                state.messages[channelId] = [];
            }
            
            for (const msg of demoMessages) {
                msg._injected = true;
                msg._injectedAt = Date.now();
                state.messages[channelId].push(msg);
            }
            console.log(`[Meshtastic] Injected ${demoMessages.length} demo messages to channel ${channelId}`);
            return true;
        },
        
        // =========================================================
        // PHASE 1: Device Configuration
        // =========================================================
        getDeviceConfig,
        setRegion,
        setModemPreset,
        setTxPower,
        setHopLimit,
        setRadioConfig,
        requestDeviceConfig,
        getRegionOptions,
        getModemPresetOptions,
        
        // Phase 1: Channel URL Import/Export
        parseChannelUrl,
        generateChannelUrl,
        importChannelFromUrl,
        exportChannelAsUrl,
        
        // Phase 1: Signal Quality
        calculateSignalQuality,
        getSignalQualityIcon,
        getSignalQualityColor,
        formatSignalQuality,
        
        // Phase 1: Firmware
        checkFirmwareStatus,
        getNodeFirmwareStatus,
        getMyFirmwareStatus,
        getHwModelName,
        
        // Constants
        ConnectionState,
        MessageType,
        DeliveryStatus,
        RegionCode,
        RegionNames,
        ModemPreset,
        ModemPresetInfo,
        SignalQuality,
        TxPowerLevels,
        HOP_LIMIT_MIN,
        HOP_LIMIT_MAX,
        MIN_RECOMMENDED_FIRMWARE,
        LATEST_STABLE_FIRMWARE
    };
})();

window.MeshtasticModule = MeshtasticModule;
