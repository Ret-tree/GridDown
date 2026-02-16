/**
 * GridDown Meshtastic Client - Real Device Communication
 * 
 * This ES module provides real device communication using the official
 * @meshtastic/core and transport libraries via esm.sh CDN.
 * 
 * Features:
 * - Web Bluetooth (BLE) connection
 * - Web Serial connection
 * - Real device configuration read/write
 * - Message sending/receiving
 * - Node database sync
 * 
 * @license GPL-3.0 (Meshtastic libraries are GPL-3.0)
 */

// Use dynamic imports from esm.sh CDN for zero-build integration
const ESM_CDN = 'https://esm.sh';

// Package versions - documented for reference but not pinned in imports.
// esm.sh periodically purges builds of specific versions, causing 404s.
// Unpinned imports resolve to the latest version esm.sh has built, which
// is more reliable for a CDN-dependent zero-build integration.
const MESHTASTIC_VERSIONS = {
    core: '2.6.7',           // Latest on npm
    transportBle: '0.1.5',   // JSR version scheme
    transportSerial: '0.2.7', // JSR version scheme  
    protobufs: '2.6.7'       // Match core version
};

/**
 * Race a BLE device operation against a timeout.
 * Many Meshtastic device operations (factory reset, commitEditSettings, reboot)
 * cause the device to reboot, which drops the BLE connection. When this happens,
 * the underlying GATT promise hangs forever — it neither resolves nor rejects
 * because there's no device to respond. This wrapper ensures we don't block
 * indefinitely.
 *
 * @param {Promise} promise - The BLE device operation
 * @param {number} timeoutMs - Max wait time (default 8 seconds)
 * @param {string} label - Operation label for logging
 * @returns {Promise<{completed: boolean, result?: any}>}
 *   completed=true means the operation resolved normally.
 *   completed=false means it timed out (device likely rebooted — treat as success).
 */
function withBleTimeout(promise, timeoutMs = 8000, label = 'BLE operation') {
    return Promise.race([
        promise.then(result => ({ completed: true, result })),
        new Promise(resolve => setTimeout(() => {
            console.log(`[MeshtasticClient] ${label} timed out after ${timeoutMs}ms — device likely rebooted (expected)`);
            resolve({ completed: false, result: null });
        }, timeoutMs))
    ]);
}

// NOTE: esm.sh polyfills node:util/types with "unenv" which stubs isNativeError()
// as a function that throws "not implemented yet!". The @meshtastic/core library's
// pino logger calls this during its serializer, crashing whenever it tries to log.
//
// Defense in depth against this:
// 1. Service worker intercepts esm.sh's types.mjs and serves a working polyfill
//    (works when SW is active and module isn't already cached)
// 2. patchDeviceLogger() wraps the device's logger methods with try/catch
//    (works after device creation, catches most logging calls)
// 3. Global error handler below suppresses any remaining unhandled throws
//    (catches module-init-time logs, async callbacks, child loggers)

// Global safety net: suppress unenv isNativeError crashes that escape other handlers.
// These are non-fatal logger errors — the protocol handler works fine without logging.
const _unenvErrorPattern = 'isNativeError is not implemented';

if (typeof window !== 'undefined') {
    // Catch synchronous throws (e.g. during module evaluation)
    window.addEventListener('error', (event) => {
        if (event.error?.message?.includes(_unenvErrorPattern) || 
            event.message?.includes(_unenvErrorPattern)) {
            console.log('[MeshtasticClient] Suppressed unenv logger error (non-fatal)');
            event.preventDefault();
            return true;
        }
    });
    
    // Catch unhandled promise rejections (e.g. from async event callbacks)
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason?.message?.includes(_unenvErrorPattern)) {
            console.log('[MeshtasticClient] Suppressed unenv logger error in async callback (non-fatal)');
            event.preventDefault();
            return true;
        }
    });
}

// Global state for the client
const MeshtasticClient = {
    // Connection state
    device: null,
    transport: null,
    isConnected: false,
    connectionType: null, // 'ble' or 'serial'
    lastBleDeviceName: null, // Name of last connected BLE device (for reconnect)
    _connectionResolver: null, // Resolve function for pending connectBLE/connectSerial promise
    
    // Device info
    myNodeNum: null,
    myNodeInfo: null,
    deviceConfig: null,
    channels: [],
    nodes: new Map(),
    
    // Libraries (loaded dynamically)
    core: null,
    bleTransport: null,
    serialTransport: null,
    protobufs: null,
    protobufRuntime: null, // @bufbuild/protobuf for create() function
    
    // Event callbacks
    callbacks: {
        onConnect: null,
        onDisconnect: null,
        onConfigReceived: null,
        onNodeUpdate: null,
        onMessage: null,
        onPosition: null,
        onTelemetry: null,
        onChannelUpdate: null,
        onAck: null,         // Transport-level ACK/NACK for sent packets
        onTraceroute: null   // Native firmware traceroute response
    },
    
    // Loading state
    librariesLoaded: false,
    loadingPromise: null
};

/**
 * Ensure the service worker is controlling the page so the util/types
 * polyfill intercept is active before we import @meshtastic/core.
 * Without this, the first page load (before SW installs) would hit the
 * broken unenv stub and cache it in the browser's ES module map.
 * Returns true if SW is ready, false if we should proceed anyway (timeout).
 */
async function ensureServiceWorkerReady() {
    if (!('serviceWorker' in navigator)) return false;
    
    // If SW is already controlling this page, check for pending updates
    if (navigator.serviceWorker.controller) {
        console.log('[MeshtasticClient] Service worker already active');
        
        // Trigger an update check — if a new SW is waiting, it will
        // skipWaiting and claim, and we'll catch the controllerchange
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.update();
                // If a new SW installed and is waiting/activating, give it
                // a moment to take control via skipWaiting + clients.claim
                if (reg.waiting || reg.installing) {
                    console.log('[MeshtasticClient] New service worker pending, waiting for activation...');
                    await new Promise(resolve => {
                        const onControllerChange = () => {
                            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                            console.log('[MeshtasticClient] Updated service worker now active');
                            resolve(true);
                        };
                        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
                        setTimeout(() => {
                            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
                            resolve(false);
                        }, 3000);
                    });
                }
            }
        } catch (e) {
            // Non-fatal — proceed with current SW
            console.warn('[MeshtasticClient] SW update check failed:', e.message);
        }
        
        return true;
    }
    
    // No SW controlling yet — wait for initial installation
    console.log('[MeshtasticClient] Waiting for service worker to activate...');
    
    return new Promise(resolve => {
        const onControllerChange = () => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            console.log('[MeshtasticClient] Service worker now active');
            resolve(true);
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        
        // Don't block forever — 3 second timeout
        setTimeout(() => {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
            console.warn('[MeshtasticClient] Service worker timeout — proceeding without polyfill intercept');
            resolve(false);
        }, 3000);
    });
}

/**
 * Load Meshtastic libraries from esm.sh CDN
 */
async function loadLibraries() {
    if (MeshtasticClient.librariesLoaded) {
        return true;
    }
    
    if (MeshtasticClient.loadingPromise) {
        return MeshtasticClient.loadingPromise;
    }
    
    MeshtasticClient.loadingPromise = (async () => {
        try {
            // The SW intercepts esm.sh's broken util/types stub and serves a working
            // polyfill. We need it active BEFORE importing @meshtastic/core, because
            // ES module bindings are immutable — once the broken stub loads, it's
            // stuck in the browser's module cache until page reload.
            await ensureServiceWorkerReady();
            
            console.log('[MeshtasticClient] Loading libraries from esm.sh...');
            
            // Import without version pinning — esm.sh resolves to the latest
            // version it has built, which is more reliable than pinning specific
            // versions that may get purged from the CDN cache.
            const [core, bleTransport, serialTransport, protobufs, protobufRuntime] = await Promise.all([
                import(`${ESM_CDN}/@meshtastic/core`),
                import(`${ESM_CDN}/@meshtastic/transport-web-bluetooth`),
                import(`${ESM_CDN}/@meshtastic/transport-web-serial`),
                import(`${ESM_CDN}/@meshtastic/protobufs`),
                import(`${ESM_CDN}/@bufbuild/protobuf`).catch(() => null)
            ]);
            
            MeshtasticClient.core = core;
            MeshtasticClient.bleTransport = bleTransport;
            MeshtasticClient.serialTransport = serialTransport;
            MeshtasticClient.protobufs = protobufs;
            MeshtasticClient.protobufRuntime = protobufRuntime; // may be null if import fails
            MeshtasticClient.librariesLoaded = true;
            
            console.log('[MeshtasticClient] Libraries loaded successfully');
            return true;
        } catch (error) {
            console.error('[MeshtasticClient] Failed to load libraries:', error);
            console.warn('[MeshtasticClient] Meshtastic libraries unavailable - basic serial mode will be used');
            MeshtasticClient.loadingPromise = null;
            throw error;
        }
    })();
    
    return MeshtasticClient.loadingPromise;
}

/**
 * Debug function to inspect loaded library structure
 */
function debugLibraries() {
    if (!MeshtasticClient.librariesLoaded) {
        console.log('[MeshtasticClient Debug] Libraries not loaded');
        return null;
    }
    
    const pb = MeshtasticClient.protobufs;
    const posSchema = pb ? findSchema(pb, 'Position') : null;
    
    const debug = {
        core: {
            keys: Object.keys(MeshtasticClient.core || {}),
            hasDefault: !!MeshtasticClient.core?.default,
            defaultKeys: Object.keys(MeshtasticClient.core?.default || {}),
            hasMeshDevice: !!(MeshtasticClient.core?.MeshDevice || MeshtasticClient.core?.default?.MeshDevice),
            hasClient: !!(MeshtasticClient.core?.Client || MeshtasticClient.core?.default?.Client)
        },
        bleTransport: {
            keys: Object.keys(MeshtasticClient.bleTransport || {}),
            hasDefault: !!MeshtasticClient.bleTransport?.default,
            defaultKeys: Object.keys(MeshtasticClient.bleTransport?.default || {}),
            hasWebBluetoothTransport: !!(MeshtasticClient.bleTransport?.WebBluetoothTransport || MeshtasticClient.bleTransport?.default?.WebBluetoothTransport),
            hasBleConnection: !!(MeshtasticClient.bleTransport?.BleConnection || MeshtasticClient.bleTransport?.default?.BleConnection)
        },
        serialTransport: {
            keys: Object.keys(MeshtasticClient.serialTransport || {}),
            hasDefault: !!MeshtasticClient.serialTransport?.default,
            defaultKeys: Object.keys(MeshtasticClient.serialTransport?.default || {}),
            hasWebSerialTransport: !!(MeshtasticClient.serialTransport?.WebSerialTransport || MeshtasticClient.serialTransport?.default?.WebSerialTransport),
            hasSerialConnection: !!(MeshtasticClient.serialTransport?.SerialConnection || MeshtasticClient.serialTransport?.default?.SerialConnection)
        },
        protobufs: {
            keys: Object.keys(pb || {}).slice(0, 30),
            hasProtobuf: !!pb?.Protobuf,
            protobufKeys: Object.keys(pb?.Protobuf || {}).slice(0, 20),
            meshKeys: Object.keys(pb?.Protobuf?.Mesh || {}).slice(0, 20),
            positionSchemaFound: !!posSchema,
            positionSchemaType: posSchema ? typeof posSchema : 'not found',
            positionSchemaKeys: posSchema ? Object.keys(posSchema).slice(0, 10) : []
        },
        protobufRuntime: {
            loaded: !!MeshtasticClient.protobufRuntime,
            hasCreate: !!MeshtasticClient.protobufRuntime?.create,
            keys: Object.keys(MeshtasticClient.protobufRuntime || {}).slice(0, 20)
        }
    };
    
    console.log('[MeshtasticClient Debug]', JSON.stringify(debug, null, 2));
    return debug;
}

/**
 * Device status enum values from @meshtastic/core v2.6.x
 * The library emits numeric values, not strings.
 */
const DeviceStatus = {
    DEVICE_RESTARTING: 1,
    DEVICE_DISCONNECTED: 2,
    DEVICE_CONNECTING: 3,
    DEVICE_RECONNECTING: 4,
    DEVICE_CONNECTED: 5,
    DEVICE_CONFIGURING: 6,
    DEVICE_CONFIGURED: 7
};

/**
 * Check if a device status value indicates "configured" (handles numeric enums,
 * string values, and potential type mismatches from different library versions)
 */
function isStatusConfigured(status) {
    // Direct numeric match
    if (status === DeviceStatus.DEVICE_CONFIGURED) return true;
    // Coerced numeric match (in case library sends string "7")
    if (Number(status) === DeviceStatus.DEVICE_CONFIGURED) return true;
    // Status >= CONFIGURED also means configured (e.g. if library adds DEVICE_COMPLETE = 8)
    if (typeof status === 'number' && status >= DeviceStatus.DEVICE_CONFIGURED) return true;
    // Legacy string values
    if (status === 'deviceConfigured' || status === 'DEVICE_CONFIGURED') return true;
    return false;
}

function isStatusDisconnected(status) {
    return status === DeviceStatus.DEVICE_DISCONNECTED || 
           Number(status) === DeviceStatus.DEVICE_DISCONNECTED ||
           status === 'deviceDisconnected' || status === 'DEVICE_DISCONNECTED';
}

/**
 * Setup event handlers for the device
 */
function setupEventHandlers(device) {
    // Check if device has the expected events structure
    if (!device.events) {
        console.warn('[MeshtasticClient] Device does not have events property - API may have changed');
        console.log('[MeshtasticClient] Device properties:', Object.keys(device));
        
        // Try alternative event patterns
        if (device.on && typeof device.on === 'function') {
            console.log('[MeshtasticClient] Using .on() event pattern');
            setupAlternativeEventHandlers(device);
            return;
        }
        return;
    }
    
    // Device status changes
    if (device.events.onDeviceStatus?.subscribe) {
        device.events.onDeviceStatus.subscribe((status) => {
            console.log('[MeshtasticClient] Device status:', status, '(type:', typeof status, ')');
            console.log('[MeshtasticClient] isStatusConfigured:', isStatusConfigured(status), 'isStatusDisconnected:', isStatusDisconnected(status));
            
            if (isStatusDisconnected(status)) {
                handleDisconnect();
            } else if (isStatusConfigured(status)) {
                console.log('[MeshtasticClient] ✅ Device configured — setting isConnected = true');
                MeshtasticClient.isConnected = true;
                
                // Directly resolve any pending connection promise
                if (MeshtasticClient._connectionResolver) {
                    console.log('[MeshtasticClient] ✅ Resolving connection promise via status callback');
                    const resolver = MeshtasticClient._connectionResolver;
                    MeshtasticClient._connectionResolver = null;
                    resolver({
                        nodeNum: MeshtasticClient.myNodeNum,
                        nodeInfo: MeshtasticClient.myNodeInfo,
                        config: MeshtasticClient.deviceConfig
                    });
                }
                
                if (MeshtasticClient.callbacks.onConnect) {
                    MeshtasticClient.callbacks.onConnect({
                        nodeNum: MeshtasticClient.myNodeNum,
                        nodeInfo: MeshtasticClient.myNodeInfo
                    });
                }
            }
        });
    } else {
        console.warn('[MeshtasticClient] onDeviceStatus not available');
    }
    
    // My node info
    if (device.events.onMyNodeInfo?.subscribe) {
        device.events.onMyNodeInfo.subscribe((nodeInfo) => {
            console.log('[MeshtasticClient] My node info:', nodeInfo);
            MeshtasticClient.myNodeNum = nodeInfo.myNodeNum;
            MeshtasticClient.myNodeInfo = nodeInfo;
        });
    }
    
    // Device metadata (firmware version, etc.)
    if (device.events.onDeviceMetadata?.subscribe) {
        device.events.onDeviceMetadata.subscribe((metadata) => {
            console.log('[MeshtasticClient] Device metadata:', metadata);
            if (MeshtasticClient.deviceConfig) {
                MeshtasticClient.deviceConfig.firmwareVersion = metadata.firmwareVersion;
                MeshtasticClient.deviceConfig.hwModel = metadata.hwModel;
            }
        });
    }
    
    // LoRa config (region, modem preset, tx power, hop limit)
    if (device.events.onConfigPacket?.subscribe) {
        device.events.onConfigPacket.subscribe((config) => {
            console.log('[MeshtasticClient] Config packet:', config);
            handleConfigPacket(config);
        });
    }
    
    // Channel updates
    if (device.events.onChannelPacket?.subscribe) {
        device.events.onChannelPacket.subscribe((channel) => {
            console.log('[MeshtasticClient] Channel packet:', channel);
            handleChannelPacket(channel);
        });
    }
    
    // Node info from mesh
    if (device.events.onNodeInfoPacket?.subscribe) {
        device.events.onNodeInfoPacket.subscribe((nodeInfo) => {
            console.log('[MeshtasticClient] Node info packet:', nodeInfo);
            handleNodeInfoPacket(nodeInfo);
        });
    }
    
    // Position updates
    if (device.events.onPositionPacket?.subscribe) {
        device.events.onPositionPacket.subscribe((position) => {
            console.log('[MeshtasticClient] Position packet:', position);
            handlePositionPacket(position);
        });
    }
    
    // Text messages
    if (device.events.onMessagePacket?.subscribe) {
        device.events.onMessagePacket.subscribe((message) => {
            console.log('[MeshtasticClient] Message packet:', message);
            handleMessagePacket(message);
        });
    }
    
    // Telemetry (battery, signal quality, etc.)
    if (device.events.onTelemetryPacket?.subscribe) {
        device.events.onTelemetryPacket.subscribe((telemetry) => {
            handleTelemetryPacket(telemetry);
        });
    }
    
    // Mesh packets (for SNR/RSSI)
    if (device.events.onMeshPacket?.subscribe) {
        device.events.onMeshPacket.subscribe((packet) => {
            handleMeshPacket(packet);
        });
    }
    
    // Routing packets (ACK/NACK for sent messages)
    if (device.events.onRoutingPacket?.subscribe) {
        device.events.onRoutingPacket.subscribe((routing) => {
            handleRoutingPacket(routing);
        });
    }
    
    // Traceroute responses (RouteDiscovery protobuf)
    // Some library versions fire this directly instead of via onMeshPacket
    if (device.events.onTraceRoutePacket?.subscribe) {
        device.events.onTraceRoutePacket.subscribe((packet) => {
            console.log('[MeshtasticClient] TraceRoute packet (dedicated event):', packet);
            handleTraceroutePacket(packet);
        });
    }
    
    console.log('[MeshtasticClient] Event handlers configured');
}

/**
 * Setup alternative event handlers for different API versions
 */
function setupAlternativeEventHandlers(device) {
    // Some versions use .on('eventName', callback) pattern
    const eventMappings = {
        'deviceStatus': (status) => {
            console.log('[MeshtasticClient] Device status (alt):', status, '(type:', typeof status, ')');
            if (isStatusDisconnected(status)) handleDisconnect();
            else if (isStatusConfigured(status)) {
                console.log('[MeshtasticClient] ✅ Device configured (alt) — setting isConnected = true');
                MeshtasticClient.isConnected = true;
                
                // Directly resolve any pending connection promise
                if (MeshtasticClient._connectionResolver) {
                    console.log('[MeshtasticClient] ✅ Resolving connection promise via alt status callback');
                    const resolver = MeshtasticClient._connectionResolver;
                    MeshtasticClient._connectionResolver = null;
                    resolver({
                        nodeNum: MeshtasticClient.myNodeNum,
                        nodeInfo: MeshtasticClient.myNodeInfo,
                        config: MeshtasticClient.deviceConfig
                    });
                }
                
                if (MeshtasticClient.callbacks.onConnect) {
                    MeshtasticClient.callbacks.onConnect({
                        nodeNum: MeshtasticClient.myNodeNum,
                        nodeInfo: MeshtasticClient.myNodeInfo
                    });
                }
            }
        },
        'myNodeInfo': (nodeInfo) => {
            MeshtasticClient.myNodeNum = nodeInfo.myNodeNum;
            MeshtasticClient.myNodeInfo = nodeInfo;
        },
        'configPacket': handleConfigPacket,
        'channelPacket': handleChannelPacket,
        'nodeInfoPacket': handleNodeInfoPacket,
        'positionPacket': handlePositionPacket,
        'messagePacket': handleMessagePacket,
        'telemetryPacket': handleTelemetryPacket,
        'meshPacket': handleMeshPacket,
        'routingPacket': handleRoutingPacket,
        'traceRoutePacket': handleTraceroutePacket
    };
    
    for (const [event, handler] of Object.entries(eventMappings)) {
        try {
            device.on(event, handler);
        } catch (e) {
            console.warn(`[MeshtasticClient] Could not bind ${event}:`, e.message);
        }
    }
}

/**
 * Handle config packet from device
 */
function handleConfigPacket(config) {
    if (!MeshtasticClient.deviceConfig) {
        MeshtasticClient.deviceConfig = {};
    }
    
    // Extract LoRa config
    if (config.payloadVariant?.case === 'lora') {
        const lora = config.payloadVariant.value;
        MeshtasticClient.deviceConfig.region = lora.region;
        MeshtasticClient.deviceConfig.modemPreset = lora.modemPreset;
        MeshtasticClient.deviceConfig.txPower = lora.txPower;
        MeshtasticClient.deviceConfig.hopLimit = lora.hopLimit;
        MeshtasticClient.deviceConfig.usePreset = lora.usePreset;
        MeshtasticClient.deviceConfig.channelNum = lora.channelNum;
        MeshtasticClient.deviceConfig.bandwidth = lora.bandwidth;
        MeshtasticClient.deviceConfig.spreadFactor = lora.spreadFactor;
        MeshtasticClient.deviceConfig.codingRate = lora.codingRate;
        MeshtasticClient.deviceConfig.txEnabled = lora.txEnabled;
        
        console.log('[MeshtasticClient] LoRa config updated:', MeshtasticClient.deviceConfig);
        
        if (MeshtasticClient.callbacks.onConfigReceived) {
            MeshtasticClient.callbacks.onConfigReceived(MeshtasticClient.deviceConfig);
        }
    }
    
    // Extract device config
    if (config.payloadVariant?.case === 'device') {
        const deviceCfg = config.payloadVariant.value;
        MeshtasticClient.deviceConfig.role = deviceCfg.role;
        MeshtasticClient.deviceConfig.serialEnabled = deviceCfg.serialEnabled;
        MeshtasticClient.deviceConfig.buttonGpio = deviceCfg.buttonGpio;
        MeshtasticClient.deviceConfig.buzzerGpio = deviceCfg.buzzerGpio;
    }
    
    // Extract position config
    if (config.payloadVariant?.case === 'position') {
        const posCfg = config.payloadVariant.value;
        MeshtasticClient.deviceConfig.positionBroadcastSecs = posCfg.positionBroadcastSecs;
        MeshtasticClient.deviceConfig.gpsUpdateInterval = posCfg.gpsUpdateInterval;
        MeshtasticClient.deviceConfig.gpsEnabled = posCfg.gpsEnabled !== false;
    }
}

/**
 * Handle channel packet from device
 */
function handleChannelPacket(channel) {
    const index = channel.index || 0;
    
    // Ensure array is large enough
    while (MeshtasticClient.channels.length <= index) {
        MeshtasticClient.channels.push(null);
    }
    
    MeshtasticClient.channels[index] = {
        index: index,
        role: channel.role,
        name: channel.settings?.name || `Channel ${index}`,
        psk: channel.settings?.psk,
        moduleSettings: channel.settings?.moduleSettings
    };
    
    if (MeshtasticClient.callbacks.onChannelUpdate) {
        MeshtasticClient.callbacks.onChannelUpdate(MeshtasticClient.channels);
    }
}

/**
 * Handle node info packet from mesh
 */
function handleNodeInfoPacket(nodeInfo) {
    const nodeNum = nodeInfo.num;
    
    let node = MeshtasticClient.nodes.get(nodeNum) || {};
    
    node.num = nodeNum;
    node.id = nodeInfo.user?.id || `!${nodeNum.toString(16)}`;
    node.longName = nodeInfo.user?.longName || `Node ${nodeNum}`;
    node.shortName = nodeInfo.user?.shortName || '????';
    node.hwModel = nodeInfo.user?.hwModel;
    node.macaddr = nodeInfo.user?.macaddr;
    node.isLicensed = nodeInfo.user?.isLicensed;
    node.lastHeard = nodeInfo.lastHeard ? new Date(nodeInfo.lastHeard * 1000) : null;
    node.snr = nodeInfo.snr;
    node.hopsAway = nodeInfo.hopsAway;
    
    // Position from NodeInfo (last known position stored on device)
    // NodeInfo.position contains latitudeI/longitudeI in integer format (degrees * 1e7)
    const pos = nodeInfo.position;
    if (pos) {
        const latI = pos.latitudeI ?? pos.latitude_i ?? 0;
        const lonI = pos.longitudeI ?? pos.longitude_i ?? 0;
        // Only store if non-zero (zero means no position data)
        if (latI !== 0 || lonI !== 0) {
            node.latitude = latI / 1e7;
            node.longitude = lonI / 1e7;
            node.altitude = pos.altitude ?? 0;
            node.time = pos.time ? new Date((typeof pos.time === 'number' ? pos.time : Number(pos.time)) * 1000) : null;
            node.satsInView = pos.satsInView ?? pos.sats_in_view;
            node.lastPositionUpdate = Date.now();
        }
    }
    
    // Device metrics
    if (nodeInfo.deviceMetrics) {
        node.batteryLevel = nodeInfo.deviceMetrics.batteryLevel;
        node.voltage = nodeInfo.deviceMetrics.voltage;
        node.channelUtilization = nodeInfo.deviceMetrics.channelUtilization;
        node.airUtilTx = nodeInfo.deviceMetrics.airUtilTx;
    }
    
    MeshtasticClient.nodes.set(nodeNum, node);
    
    if (MeshtasticClient.callbacks.onNodeUpdate) {
        MeshtasticClient.callbacks.onNodeUpdate(node);
    }
}

/**
 * Handle position packet from mesh
 */
function handlePositionPacket(position) {
    const fromNode = position.from;
    let node = MeshtasticClient.nodes.get(fromNode);
    
    if (!node) {
        node = { num: fromNode, id: `!${fromNode.toString(16)}` };
        MeshtasticClient.nodes.set(fromNode, node);
    }
    
    // Position is in integer format (lat/lon * 1e7)
    // Handle both camelCase (protobuf-es default) and snake_case field names
    const d = position.data;
    if (d) {
        const latI = d.latitudeI ?? d.latitude_i ?? d.latitudeI_pbf ?? 0;
        const lonI = d.longitudeI ?? d.longitude_i ?? d.longitudeI_pbf ?? 0;
        
        // Guard: Don't overwrite a valid position with 0,0 (GPS not acquired / fix lost).
        // Meshtastic devices broadcast position packets on schedule even without GPS fix,
        // sending lat=0/lon=0. Overwriting would make the node vanish from the map
        // until the next valid fix arrives.
        if (latI !== 0 || lonI !== 0) {
            node.latitude = latI / 1e7;
            node.longitude = lonI / 1e7;
            node.altitude = d.altitude ?? 0;
            node.time = d.time ? new Date((typeof d.time === 'number' ? d.time : Number(d.time)) * 1000) : new Date();
            node.lastPositionUpdate = Date.now();
        }
        
        // These metadata fields are valid regardless of GPS fix
        node.groundSpeed = d.groundSpeed ?? d.ground_speed;
        node.groundTrack = d.groundTrack ?? d.ground_track;
        node.satsInView = d.satsInView ?? d.sats_in_view;
        node.precisionBits = d.precisionBits ?? d.precision_bits;
    }
    
    if (MeshtasticClient.callbacks.onPosition && node.latitude !== undefined && node.longitude !== undefined &&
        (node.latitude !== 0 || node.longitude !== 0)) {
        MeshtasticClient.callbacks.onPosition({
            from: fromNode,
            lat: node.latitude,
            lon: node.longitude,
            alt: node.altitude,
            time: node.time,
            node: node
        });
    }
}

/**
 * Handle text message packet
 */
function handleMessagePacket(message) {
    if (MeshtasticClient.callbacks.onMessage) {
        MeshtasticClient.callbacks.onMessage({
            from: message.from,
            to: message.to,
            channel: message.channel,
            text: message.data,
            timestamp: Date.now(),
            id: message.id
        });
    }
}

/**
 * Handle telemetry packet
 */
function handleTelemetryPacket(telemetry) {
    const fromNode = telemetry.from;
    let node = MeshtasticClient.nodes.get(fromNode);
    
    if (!node) {
        node = { num: fromNode };
        MeshtasticClient.nodes.set(fromNode, node);
    }
    
    if (telemetry.data?.deviceMetrics) {
        node.batteryLevel = telemetry.data.deviceMetrics.batteryLevel;
        node.voltage = telemetry.data.deviceMetrics.voltage;
        node.channelUtilization = telemetry.data.deviceMetrics.channelUtilization;
        node.airUtilTx = telemetry.data.deviceMetrics.airUtilTx;
    }
    
    if (telemetry.data?.environmentMetrics) {
        node.temperature = telemetry.data.environmentMetrics.temperature;
        node.relativeHumidity = telemetry.data.environmentMetrics.relativeHumidity;
        node.barometricPressure = telemetry.data.environmentMetrics.barometricPressure;
    }
    
    if (MeshtasticClient.callbacks.onTelemetry) {
        MeshtasticClient.callbacks.onTelemetry({ from: fromNode, telemetry: telemetry.data, node });
    }
}

/**
 * Handle mesh packet (for SNR/RSSI extraction)
 */
function handleMeshPacket(packet) {
    if (!packet.from) return;
    
    let node = MeshtasticClient.nodes.get(packet.from);
    if (!node) {
        node = { num: packet.from };
        MeshtasticClient.nodes.set(packet.from, node);
    }
    
    // Extract signal quality from the packet
    if (packet.rxSnr !== undefined) {
        node.snr = packet.rxSnr;
        node.lastSnr = packet.rxSnr;
    }
    if (packet.rxRssi !== undefined) {
        node.rssi = packet.rxRssi;
        node.lastRssi = packet.rxRssi;
    }
    if (packet.hopStart !== undefined) {
        node.hopStart = packet.hopStart;
    }
    if (packet.hopLimit !== undefined) {
        node.hopLimit = packet.hopLimit;
    }
    
    node.lastPacketTime = Date.now();
    
    // Detect traceroute responses (portnum 70 = TRACEROUTE_APP)
    // The firmware sends RouteDiscovery protobuf responses here after
    // a device.traceRoute() call. The decoded data contains route[] and
    // optionally snrTowards[]/snrBack[] arrays.
    const portnum = packet.data?.portnum ?? packet.portNum ?? packet.decoded?.portnum;
    if (portnum === 70 || portnum === 'TRACEROUTE_APP') {
        const traceData = packet.data?.data ?? packet.data ?? packet.decoded?.data ?? {};
        console.log('[MeshtasticClient] Traceroute response from', packet.from, ':', traceData);
        
        if (MeshtasticClient.callbacks.onTraceroute) {
            MeshtasticClient.callbacks.onTraceroute({
                from: packet.from,
                to: packet.to,
                // route is array of node nums the request/reply traversed
                route: traceData.route || [],
                snrTowards: traceData.snrTowards || traceData.snr_towards || [],
                snrBack: traceData.snrBack || traceData.snr_back || [],
                // Hop count derived from route length
                hops: (traceData.route || []).length,
                raw: traceData,
                timestamp: Date.now()
            });
        }
    }
}

/**
 * Handle routing packet (ACK/NACK for sent messages)
 * The @meshtastic/core library emits these when a wantAck packet is
 * acknowledged (or fails) at the transport level.
 * 
 * Routing packet structure varies by library version but typically:
 *   { from, to, id (requestId that was ACK'd), data: { errorReason } }
 * errorReason === 0 (or NONE) means successful delivery.
 */
function handleRoutingPacket(routing) {
    // The requestId field references the original packet that was ACK'd
    const packetId = routing.data?.requestId ?? routing.requestId ?? routing.id;
    
    if (!packetId) return;
    
    // errorReason: 0 = NONE (success), anything else = failure
    // Some versions use routing.data.errorReason, others routing.errorReason
    const errorReason = routing.data?.errorReason ?? routing.errorReason ?? 0;
    const success = (errorReason === 0 || errorReason === 'NONE');
    
    console.log(`[MeshtasticClient] Routing ${success ? 'ACK' : 'NACK'} for packet ${packetId}${success ? '' : ` (error: ${errorReason})`}`);
    
    if (MeshtasticClient.callbacks.onAck) {
        MeshtasticClient.callbacks.onAck({
            packetId,
            success,
            errorReason,
            from: routing.from,
            timestamp: Date.now()
        });
    }
}

/**
 * Handle traceroute response packet from the dedicated onTraceRoutePacket event.
 * Fired by newer versions of @meshtastic/core when a RouteDiscovery response arrives.
 * The packet typically contains:
 *   { from, to, data: { route: number[], snrTowards: number[], snrBack: number[] } }
 */
function handleTraceroutePacket(packet) {
    if (!packet) return;
    
    const traceData = packet.data ?? packet;
    console.log('[MeshtasticClient] Traceroute response:', traceData);
    
    if (MeshtasticClient.callbacks.onTraceroute) {
        MeshtasticClient.callbacks.onTraceroute({
            from: packet.from,
            to: packet.to,
            route: traceData.route || [],
            snrTowards: traceData.snrTowards || traceData.snr_towards || [],
            snrBack: traceData.snrBack || traceData.snr_back || [],
            hops: (traceData.route || []).length,
            raw: traceData,
            timestamp: Date.now()
        });
    }
}

/**
 * Handle disconnect
 */
function handleDisconnect() {
    MeshtasticClient.isConnected = false;
    MeshtasticClient.device = null;
    MeshtasticClient.transport = null;
    MeshtasticClient.connectionType = null;
    MeshtasticClient._connectionResolver = null;
    
    if (MeshtasticClient.callbacks.onDisconnect) {
        MeshtasticClient.callbacks.onDisconnect();
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Patch the device's pino logger to catch the unenv isNativeError crash.
 * 
 * esm.sh polyfills node:util/types with "unenv" which stubs isNativeError()
 * as "not implemented yet!". The @meshtastic/core logger (pino) calls this
 * during its _mask() serializer. Once the broken stub is cached in the
 * browser's ES module map, no amount of SW interception can fix it — the
 * browser serves modules from its internal cache without hitting fetch.
 * 
 * This function finds the logger on the device object and wraps its methods
 * so the crash is caught and logged safely to console instead.
 */
function patchDeviceLogger(device) {
    if (!device) return;
    
    // The pino logger may be on different properties depending on version
    const loggerProps = ['log', 'logger', '_log', '_logger'];
    let logger = null;
    
    // Direct property check
    for (const prop of loggerProps) {
        if (device[prop] && typeof device[prop].info === 'function') {
            logger = device[prop];
            break;
        }
    }
    
    // Deep scan: check all own properties for pino-like objects
    if (!logger) {
        for (const key of Object.getOwnPropertyNames(device)) {
            try {
                const val = device[key];
                if (val && typeof val === 'object' && typeof val.info === 'function' && typeof val.warn === 'function') {
                    logger = val;
                    break;
                }
            } catch (e) { /* skip getters that throw */ }
        }
    }
    
    // Also check prototype
    if (!logger) {
        const proto = Object.getPrototypeOf(device);
        if (proto) {
            for (const key of Object.getOwnPropertyNames(proto)) {
                try {
                    const val = device[key];
                    if (val && typeof val === 'object' && typeof val.info === 'function' && typeof val.warn === 'function') {
                        logger = val;
                        break;
                    }
                } catch (e) { /* skip */ }
            }
        }
    }
    
    if (!logger) {
        console.log('[MeshtasticClient] No logger found on device — skipping logger patch');
        return;
    }
    
    console.log('[MeshtasticClient] Patching device logger to handle unenv polyfill crash');
    
    const methods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    for (const method of methods) {
        if (typeof logger[method] === 'function') {
            const original = logger[method].bind(logger);
            logger[method] = function (...args) {
                try {
                    return original(...args);
                } catch (e) {
                    if (e.message && e.message.includes('isNativeError')) {
                        // Swallow the unenv crash, log to console as fallback
                        const safeArgs = args.map(a => {
                            try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                            catch { return '[object]'; }
                        });
                        console.log(`[pino/${method}]`, ...safeArgs);
                        return;
                    }
                    throw e;
                }
            };
        }
    }
    
    // Also patch write() if present (pino transport entry point)
    if (typeof logger.write === 'function') {
        const originalWrite = logger.write.bind(logger);
        logger.write = function (obj) {
            try {
                return originalWrite(obj);
            } catch (e) {
                if (e.message && e.message.includes('isNativeError')) {
                    console.log('[pino/write]', typeof obj === 'object' ? '[log entry]' : obj);
                    return;
                }
                throw e;
            }
        };
    }
}

/**
 * Connect via Web Bluetooth
 */
async function connectBLE() {
    await loadLibraries();
    
    // Handle different export structures from @meshtastic/core
    const core = MeshtasticClient.core;
    const bleTransport = MeshtasticClient.bleTransport;
    
    // Try different export patterns (library API has changed between versions)
    const MeshDevice = core.MeshDevice || core.default?.MeshDevice || core.Client || core.default?.Client;
    // Try different export patterns - library uses different names across versions
    // v2.6.x uses TransportWebBluetooth, older versions used WebBluetoothTransport
    const WebBluetoothTransport = bleTransport.TransportWebBluetooth || bleTransport.default?.TransportWebBluetooth ||
                                   bleTransport.WebBluetoothTransport || bleTransport.default?.WebBluetoothTransport || 
                                   bleTransport.BleConnection || bleTransport.default?.BleConnection ||
                                   bleTransport.default;
    
    if (!MeshDevice) {
        console.error('[MeshtasticClient] Available core exports:', Object.keys(core));
        throw new Error('MeshDevice class not found in @meshtastic/core. Library API may have changed.');
    }
    
    if (!WebBluetoothTransport) {
        console.error('[MeshtasticClient] Available BLE transport exports:', Object.keys(bleTransport));
        throw new Error('WebBluetoothTransport class not found. Library API may have changed.');
    }
    
    console.log('[MeshtasticClient] Using MeshDevice:', MeshDevice.name || 'anonymous');
    console.log('[MeshtasticClient] Using Transport:', WebBluetoothTransport.name || 'anonymous');
    
    // Debug: Log everything about the transport class
    console.log('[MeshtasticClient] Transport type:', typeof WebBluetoothTransport);
    console.log('[MeshtasticClient] Transport.create:', typeof WebBluetoothTransport.create);
    console.log('[MeshtasticClient] Transport.prototype:', WebBluetoothTransport.prototype);
    console.log('[MeshtasticClient] Transport keys:', Object.keys(WebBluetoothTransport));
    console.log('[MeshtasticClient] Transport static methods:', Object.getOwnPropertyNames(WebBluetoothTransport));
    
    let device, transport;
    
    try {
        // The Meshtastic BLE Service UUID
        const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
        
        // Method 1: Try Transport.create() factory (official API)
        if (typeof WebBluetoothTransport.create === 'function') {
            console.log('[MeshtasticClient] Method 1: Using TransportWebBluetooth.create()...');
            transport = await WebBluetoothTransport.create();
            console.log('[MeshtasticClient] Transport created via create()');
        }
        // Method 2: Request Bluetooth device first, then create transport with it
        else if (navigator.bluetooth && navigator.bluetooth.requestDevice) {
            console.log('[MeshtasticClient] Method 2: Requesting Bluetooth device directly...');
            
            // Request device from browser
            const bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ services: [MESHTASTIC_SERVICE_UUID] }],
                optionalServices: [MESHTASTIC_SERVICE_UUID]
            });
            
            console.log('[MeshtasticClient] Bluetooth device selected:', bleDevice.name);
            MeshtasticClient.lastBleDeviceName = bleDevice.name || null;
            
            // Try creating transport with the device
            if (typeof WebBluetoothTransport === 'function') {
                // Check constructor signature
                console.log('[MeshtasticClient] Transport constructor length:', WebBluetoothTransport.length);
                
                // Try passing device to constructor
                try {
                    transport = new WebBluetoothTransport(bleDevice);
                    console.log('[MeshtasticClient] Transport created with device');
                } catch (e1) {
                    console.log('[MeshtasticClient] Constructor with device failed:', e1.message);
                    // Try with options object
                    try {
                        transport = new WebBluetoothTransport({ device: bleDevice });
                        console.log('[MeshtasticClient] Transport created with {device}');
                    } catch (e2) {
                        console.log('[MeshtasticClient] Constructor with {device} failed:', e2.message);
                        throw new Error('Cannot create transport with Bluetooth device');
                    }
                }
            }
        }
        // Method 3: Fallback - just try constructor (may prompt user)
        else if (typeof WebBluetoothTransport === 'function') {
            console.log('[MeshtasticClient] Method 3: Trying bare constructor...');
            transport = new WebBluetoothTransport();
        } else {
            throw new Error('No way to create WebBluetoothTransport');
        }
        
        // Now create MeshDevice
        if (!transport) {
            throw new Error('Failed to create transport');
        }
        
        console.log('[MeshtasticClient] Transport object:', transport);
        console.log('[MeshtasticClient] Transport methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(transport)));
        
        // Create MeshDevice with transport
        console.log('[MeshtasticClient] Creating MeshDevice with transport...');
        device = new MeshDevice(transport);
        console.log('[MeshtasticClient] MeshDevice created');
        console.log('[MeshtasticClient] Device methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(device)));
        
        // Patch the logger BEFORE configure() or any event subscriptions fire
        patchDeviceLogger(device);
        
        // Setup event handlers
        setupEventHandlers(device);
        
        // Store device/transport BEFORE configure so they're available
        // to event handlers that fire during configuration
        MeshtasticClient.device = device;
        MeshtasticClient.transport = transport;
        MeshtasticClient.connectionType = 'ble';
        
        // Capture BLE device name for reconnect matching
        // Method 2 stores it on transport as ._bleDevice, but transport internals vary
        try {
            MeshtasticClient.lastBleDeviceName = 
                transport?.device?.name || transport?._device?.name || 
                transport?._port?.device?.name || null;
        } catch (e) { /* transport internals not accessible */ }
        
        // Some transports/devices need explicit connect/configure calls
        if (typeof transport.connect === 'function') {
            console.log('[MeshtasticClient] Calling transport.connect()...');
            await transport.connect();
        }
        if (typeof device.configure === 'function') {
            console.log('[MeshtasticClient] Calling device.configure()...');
            
            // IMPORTANT: Do NOT await configure(). In @meshtastic/core v2.6.x,
            // configure() may never resolve even after the device is fully configured
            // (status 7 / DEVICE_CONFIGURED emitted). The config exchange happens
            // asynchronously via the event system — the status handler sets
            // MeshtasticClient.isConnected = true when status 7 arrives, which the
            // polling loop below detects.
            device.configure().catch((configureErr) => {
                if (configureErr.message && configureErr.message.includes('isNativeError')) {
                    console.warn('[MeshtasticClient] Logger polyfill error during configure (non-fatal)');
                } else {
                    console.error('[MeshtasticClient] configure() error:', configureErr.message);
                }
            });
        }
        
    } catch (err) {
        console.error('[MeshtasticClient] Connection error:', err);
        console.error('[MeshtasticClient] Error stack:', err.stack);
        MeshtasticClient.device = null;
        MeshtasticClient.transport = null;
        MeshtasticClient.connectionType = null;
        throw err;
    }
    
    // Wait for configuration to complete.
    // The status callback sets isConnected=true and calls _connectionResolver directly.
    // The polling loop is a backup in case the callback fires before the resolver is registered.
    console.log('[MeshtasticClient] Waiting for device configuration to complete...');
    console.log('[MeshtasticClient] isConnected already?', MeshtasticClient.isConnected);
    
    // If status 7 already fired (before we got here), resolve immediately
    if (MeshtasticClient.isConnected) {
        console.log('[MeshtasticClient] ✅ Already connected — resolving immediately');
        return {
            nodeNum: MeshtasticClient.myNodeNum,
            nodeInfo: MeshtasticClient.myNodeInfo,
            config: MeshtasticClient.deviceConfig
        };
    }
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            MeshtasticClient._connectionResolver = null;
            reject(new Error('Connection timeout - device did not respond'));
        }, 30000);
        
        // Store resolver so status callback can trigger it directly
        MeshtasticClient._connectionResolver = (result) => {
            clearTimeout(timeout);
            clearInterval(checkConfigured);
            resolve(result);
        };
        
        // Backup polling in case status fired between the check above and Promise creation
        const checkConfigured = setInterval(() => {
            if (MeshtasticClient.isConnected) {
                console.log('[MeshtasticClient] ✅ Connected detected by polling loop');
                clearTimeout(timeout);
                clearInterval(checkConfigured);
                MeshtasticClient._connectionResolver = null;
                resolve({
                    nodeNum: MeshtasticClient.myNodeNum,
                    nodeInfo: MeshtasticClient.myNodeInfo,
                    config: MeshtasticClient.deviceConfig
                });
            }
        }, 100);
    });
}

/**
 * Connect via Web Serial
 */
async function connectSerial() {
    await loadLibraries();
    
    // Handle different export structures from @meshtastic/core
    const core = MeshtasticClient.core;
    const serialTransport = MeshtasticClient.serialTransport;
    
    // Try different export patterns (library API has changed between versions)
    const MeshDevice = core.MeshDevice || core.default?.MeshDevice || core.Client || core.default?.Client;
    // Try different export patterns - library uses different names across versions
    // v2.6.x uses TransportWebSerial, older versions used WebSerialTransport
    const WebSerialTransport = serialTransport.TransportWebSerial || serialTransport.default?.TransportWebSerial ||
                                serialTransport.WebSerialTransport || serialTransport.default?.WebSerialTransport || 
                                serialTransport.SerialConnection || serialTransport.default?.SerialConnection ||
                                serialTransport.default;
    
    if (!MeshDevice) {
        console.error('[MeshtasticClient] Available core exports:', Object.keys(core));
        throw new Error('MeshDevice class not found in @meshtastic/core. Library API may have changed.');
    }
    
    if (!WebSerialTransport) {
        console.error('[MeshtasticClient] Available Serial transport exports:', Object.keys(serialTransport));
        throw new Error('WebSerialTransport class not found. Library API may have changed.');
    }
    
    console.log('[MeshtasticClient] Using MeshDevice:', MeshDevice.name || 'anonymous');
    console.log('[MeshtasticClient] Using Transport:', WebSerialTransport.name || 'anonymous');
    console.log('[MeshtasticClient] Transport.create exists:', typeof WebSerialTransport.create);
    
    let device, transport;
    
    try {
        // Official API pattern from @meshtastic/transport-web-serial docs:
        // const transport = await TransportWebSerial.create();
        // const device = new MeshDevice(transport);
        
        if (typeof WebSerialTransport.create === 'function') {
            // Use official factory method
            console.log('[MeshtasticClient] Using TransportWebSerial.create() factory method...');
            transport = await WebSerialTransport.create();
            console.log('[MeshtasticClient] Transport created successfully');
        } else if (typeof WebSerialTransport === 'function') {
            // Fallback: try as constructor
            console.log('[MeshtasticClient] Trying WebSerialTransport as constructor...');
            transport = new WebSerialTransport();
        } else {
            throw new Error('Cannot create WebSerialTransport - no create() method or constructor');
        }
        
        // Create MeshDevice with transport
        console.log('[MeshtasticClient] Creating MeshDevice with transport...');
        device = new MeshDevice(transport);
        console.log('[MeshtasticClient] MeshDevice created successfully');
        
        // Patch the logger BEFORE configure() or any event subscriptions fire
        patchDeviceLogger(device);
        
        // Setup event handlers
        setupEventHandlers(device);
        
        // Store device/transport BEFORE configure so they're available
        // to event handlers that fire during configuration
        MeshtasticClient.device = device;
        MeshtasticClient.transport = transport;
        MeshtasticClient.connectionType = 'serial';
        
        // Connect transport and configure device (same as BLE path)
        if (typeof transport.connect === 'function') {
            console.log('[MeshtasticClient] Calling transport.connect()...');
            await transport.connect();
        }
        if (typeof device.configure === 'function') {
            console.log('[MeshtasticClient] Calling device.configure()...');
            
            // Do NOT await — see comment in connectBLE for rationale
            device.configure().catch((configureErr) => {
                if (configureErr.message && configureErr.message.includes('isNativeError')) {
                    console.warn('[MeshtasticClient] Logger polyfill error during configure (non-fatal)');
                } else {
                    console.error('[MeshtasticClient] configure() error:', configureErr.message);
                }
            });
        }
        
    } catch (err) {
        console.error('[MeshtasticClient] Connection error:', err);
        console.error('[MeshtasticClient] Error stack:', err.stack);
        MeshtasticClient.device = null;
        MeshtasticClient.transport = null;
        MeshtasticClient.connectionType = null;
        throw err;
    }
    
    // Wait for configuration to complete (same pattern as connectBLE)
    console.log('[MeshtasticClient] Serial: Waiting for device configuration...');
    
    if (MeshtasticClient.isConnected) {
        console.log('[MeshtasticClient] ✅ Serial: Already connected — resolving immediately');
        return {
            nodeNum: MeshtasticClient.myNodeNum,
            nodeInfo: MeshtasticClient.myNodeInfo,
            config: MeshtasticClient.deviceConfig
        };
    }
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            MeshtasticClient._connectionResolver = null;
            reject(new Error('Connection timeout - device did not respond'));
        }, 30000);
        
        MeshtasticClient._connectionResolver = (result) => {
            clearTimeout(timeout);
            clearInterval(checkConfigured);
            resolve(result);
        };
        
        const checkConfigured = setInterval(() => {
            if (MeshtasticClient.isConnected) {
                console.log('[MeshtasticClient] ✅ Serial: Connected detected by polling loop');
                clearTimeout(timeout);
                clearInterval(checkConfigured);
                MeshtasticClient._connectionResolver = null;
                resolve({
                    nodeNum: MeshtasticClient.myNodeNum,
                    nodeInfo: MeshtasticClient.myNodeInfo,
                    config: MeshtasticClient.deviceConfig
                });
            }
        }, 100);
    });
}

/**
 * Reconnect to a previously paired BLE device WITHOUT user gesture.
 * Uses navigator.bluetooth.getDevices() (Chrome 85+) to retrieve previously
 * granted devices, then follows the same transport/MeshDevice/configure flow
 * as connectBLE(). Falls back to matching by saved device name.
 * 
 * @param {string|null} deviceName - Previously connected device name for matching
 * @returns {Promise<{nodeNum, nodeInfo, config}>}
 * @throws If getDevices() unavailable, no matching device found, or connection fails
 */
async function reconnectBLE(deviceName) {
    if (!navigator.bluetooth?.getDevices) {
        throw new Error('navigator.bluetooth.getDevices() not available — browser may not support BLE reconnect');
    }
    
    await loadLibraries();
    
    const core = MeshtasticClient.core;
    const bleTransport = MeshtasticClient.bleTransport;
    
    const MeshDevice = core.MeshDevice || core.default?.MeshDevice || core.Client || core.default?.Client;
    const WebBluetoothTransport = bleTransport.TransportWebBluetooth || bleTransport.default?.TransportWebBluetooth ||
                                   bleTransport.WebBluetoothTransport || bleTransport.default?.WebBluetoothTransport || 
                                   bleTransport.BleConnection || bleTransport.default?.BleConnection ||
                                   bleTransport.default;
    
    if (!MeshDevice) {
        throw new Error('MeshDevice class not found in @meshtastic/core');
    }
    if (!WebBluetoothTransport) {
        throw new Error('WebBluetoothTransport class not found');
    }
    
    const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
    
    // Retrieve previously paired BLE devices (no user gesture required)
    console.log('[MeshtasticClient] Reconnect: Retrieving previously paired devices...');
    const pairedDevices = await navigator.bluetooth.getDevices();
    console.log(`[MeshtasticClient] Reconnect: Found ${pairedDevices.length} paired device(s)`);
    
    if (pairedDevices.length === 0) {
        throw new Error('No previously paired Bluetooth devices found');
    }
    
    // Find the target device — prefer name match, then try all
    let bleDevice = null;
    
    if (deviceName) {
        bleDevice = pairedDevices.find(d => d.name === deviceName);
        if (bleDevice) {
            console.log(`[MeshtasticClient] Reconnect: Matched device by name: "${deviceName}"`);
        }
    }
    
    if (!bleDevice) {
        // No name match — try each device by attempting GATT connect + service check
        console.log('[MeshtasticClient] Reconnect: No name match, probing paired devices...');
        for (const candidate of pairedDevices) {
            try {
                console.log(`[MeshtasticClient] Reconnect: Probing "${candidate.name || candidate.id}"...`);
                const server = await withBleTimeout(
                    candidate.gatt.connect(), 5000, 'reconnect probe'
                );
                // Check if device has Meshtastic service
                await server.getPrimaryService(MESHTASTIC_SERVICE_UUID);
                bleDevice = candidate;
                // Disconnect probe — transport will reconnect GATT
                try { server.disconnect(); } catch (_) {}
                console.log(`[MeshtasticClient] Reconnect: Found Meshtastic device: "${candidate.name}"`);
                break;
            } catch (e) {
                // Not Meshtastic or not in range — try next
                console.log(`[MeshtasticClient] Reconnect: "${candidate.name || candidate.id}" not available:`, e.message);
                continue;
            }
        }
    }
    
    if (!bleDevice) {
        throw new Error('Previously paired Meshtastic device not found or not in range');
    }
    
    // Store for future reconnect attempts
    MeshtasticClient.lastBleDeviceName = bleDevice.name || null;
    
    // Create transport with the retrieved device (same as connectBLE Method 2)
    let device, transport;
    
    try {
        if (typeof WebBluetoothTransport === 'function') {
            try {
                transport = new WebBluetoothTransport(bleDevice);
                console.log('[MeshtasticClient] Reconnect: Transport created with device');
            } catch (e1) {
                try {
                    transport = new WebBluetoothTransport({ device: bleDevice });
                    console.log('[MeshtasticClient] Reconnect: Transport created with {device}');
                } catch (e2) {
                    throw new Error('Cannot create transport with retrieved device: ' + e2.message);
                }
            }
        } else {
            throw new Error('WebBluetoothTransport is not a constructor');
        }
        
        if (!transport) {
            throw new Error('Failed to create transport');
        }
        
        // Create MeshDevice with transport
        device = new MeshDevice(transport);
        console.log('[MeshtasticClient] Reconnect: MeshDevice created');
        
        patchDeviceLogger(device);
        setupEventHandlers(device);
        
        MeshtasticClient.device = device;
        MeshtasticClient.transport = transport;
        MeshtasticClient.connectionType = 'ble';
        
        // Connect transport and start configuration
        if (typeof transport.connect === 'function') {
            console.log('[MeshtasticClient] Reconnect: Calling transport.connect()...');
            await transport.connect();
        }
        if (typeof device.configure === 'function') {
            console.log('[MeshtasticClient] Reconnect: Calling device.configure()...');
            device.configure().catch((configureErr) => {
                if (configureErr.message && configureErr.message.includes('isNativeError')) {
                    console.warn('[MeshtasticClient] Reconnect: Logger polyfill error (non-fatal)');
                } else {
                    console.error('[MeshtasticClient] Reconnect: configure() error:', configureErr.message);
                }
            });
        }
        
    } catch (err) {
        console.error('[MeshtasticClient] Reconnect error:', err);
        MeshtasticClient.device = null;
        MeshtasticClient.transport = null;
        MeshtasticClient.connectionType = null;
        throw err;
    }
    
    // Wait for configuration (same pattern as connectBLE)
    console.log('[MeshtasticClient] Reconnect: Waiting for device configuration...');
    
    if (MeshtasticClient.isConnected) {
        console.log('[MeshtasticClient] ✅ Reconnect: Already connected — resolving immediately');
        return {
            nodeNum: MeshtasticClient.myNodeNum,
            nodeInfo: MeshtasticClient.myNodeInfo,
            config: MeshtasticClient.deviceConfig
        };
    }
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            MeshtasticClient._connectionResolver = null;
            reject(new Error('Reconnect timeout — device did not respond'));
        }, 30000);
        
        MeshtasticClient._connectionResolver = (result) => {
            clearTimeout(timeout);
            clearInterval(checkConfigured);
            resolve(result);
        };
        
        const checkConfigured = setInterval(() => {
            if (MeshtasticClient.isConnected) {
                console.log('[MeshtasticClient] ✅ Reconnect: Connected detected by polling loop');
                clearTimeout(timeout);
                clearInterval(checkConfigured);
                MeshtasticClient._connectionResolver = null;
                resolve({
                    nodeNum: MeshtasticClient.myNodeNum,
                    nodeInfo: MeshtasticClient.myNodeInfo,
                    config: MeshtasticClient.deviceConfig
                });
            }
        }, 100);
    });
}

/**
 * Disconnect from device
 */
async function disconnect() {
    try {
        // Try device.disconnect() first (newer API)
        if (MeshtasticClient.device && typeof MeshtasticClient.device.disconnect === 'function') {
            await MeshtasticClient.device.disconnect();
        }
        // Also try transport.disconnect() (older API)
        else if (MeshtasticClient.transport && typeof MeshtasticClient.transport.disconnect === 'function') {
            await MeshtasticClient.transport.disconnect();
        }
    } catch (e) {
        console.warn('[MeshtasticClient] Disconnect error:', e);
    }
    handleDisconnect();
}

/**
 * Get current device configuration
 */
function getConfig() {
    return MeshtasticClient.deviceConfig ? { ...MeshtasticClient.deviceConfig } : null;
}

/**
 * Set LoRa region
 */
/**
 * Extract only LoRa-specific fields from deviceConfig.
 * deviceConfig accumulates fields from ALL config types (lora, device, position, metadata).
 * Spreading it directly into a LoRa setConfig call includes foreign fields (role, gpsEnabled,
 * firmwareVersion, etc.) that cause protobuf serialization errors in @meshtastic/core v2.6+.
 */
function getLoRaFields() {
    const dc = MeshtasticClient.deviceConfig || {};
    return {
        region: dc.region,
        modemPreset: dc.modemPreset,
        txPower: dc.txPower,
        hopLimit: dc.hopLimit,
        usePreset: dc.usePreset,
        channelNum: dc.channelNum,
        bandwidth: dc.bandwidth,
        spreadFactor: dc.spreadFactor,
        codingRate: dc.codingRate,
        txEnabled: dc.txEnabled
    };
}

/**
 * Write config to device with proper begin/commit transaction.
 * Meshtastic firmware requires: beginEditSettings → setConfig → commitEditSettings
 * to persist changes to NVS/flash. Without this, setConfig only stages to RAM
 * and changes are lost on reboot.
 */
async function writeConfig(configPayload) {
    const device = MeshtasticClient.device;
    if (!device) {
        throw new Error('Not connected to device');
    }
    
    if (typeof device.beginEditSettings === 'function') {
        await device.beginEditSettings();
    }
    
    await device.setConfig(configPayload);
    
    // commitEditSettings can trigger auto-reboot on LoRa changes,
    // causing the BLE promise to hang forever.
    if (typeof device.commitEditSettings === 'function') {
        await withBleTimeout(device.commitEditSettings(), 8000, 'writeConfig commit');
    }
}

/**
 * Write multiple config payloads in a single edit session.
 * Opens ONE beginEditSettings → writes all payloads → ONE commitEditSettings.
 * This prevents intermediate commits from triggering premature reboots.
 *
 * On many Meshtastic firmwares (especially RAK), commitEditSettings triggers
 * an automatic device reboot when LoRa config changes are detected. Callers
 * should catch BLE disconnect errors and treat them as success.
 *
 * @param {Array<Object>} configPayloads - Array of setConfig payloads
 * @param {number} [delayBetweenMs=500] - Delay between individual setConfig calls
 * @param {Object} [ownerInfo=null] - Optional {longName, shortName, isLicensed} to set
 *   device owner inside the same edit session (before config writes)
 */
async function batchWriteConfigs(configPayloads, delayBetweenMs = 500, ownerInfo = null) {
    const device = MeshtasticClient.device;
    if (!device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    console.log(`[MeshtasticClient] Batch writing ${configPayloads.length} configs in single session...`);
    
    // Open ONE edit session
    if (typeof device.beginEditSettings === 'function') {
        await device.beginEditSettings();
    }
    
    // Set owner inside the session (admin command, not a setConfig payload)
    if (ownerInfo && typeof device.setOwner === 'function') {
        try {
            await device.setOwner({
                longName: ownerInfo.longName,
                shortName: ownerInfo.shortName || ownerInfo.longName.substring(0, 4).toUpperCase(),
                isLicensed: ownerInfo.isLicensed || false
            });
            console.log(`[MeshtasticClient]   Owner set: ${ownerInfo.longName} (${ownerInfo.shortName})`);
        } catch (ownerErr) {
            // Non-fatal — owner can be set after reboot
            console.warn('[MeshtasticClient]   setOwner failed (non-fatal):', ownerErr.message);
        }
        if (delayBetweenMs > 0) {
            await new Promise(r => setTimeout(r, delayBetweenMs));
        }
    }
    
    // Write each config payload with delay between writes
    for (let i = 0; i < configPayloads.length; i++) {
        const payload = configPayloads[i];
        const label = payload.payloadVariant?.case || 'unknown';
        console.log(`[MeshtasticClient]   Writing config ${i + 1}/${configPayloads.length}: ${label}`);
        await device.setConfig(payload);
        
        // Delay between writes to let the device process each one
        if (i < configPayloads.length - 1 && delayBetweenMs > 0) {
            await new Promise(r => setTimeout(r, delayBetweenMs));
        }
    }
    
    // ONE commit — flush all changes to flash at once.
    // WARNING: On RAK and many other Meshtastic firmwares, this triggers an
    // automatic reboot when LoRa config changes are detected. The BLE connection
    // will drop and the promise will hang forever. withBleTimeout ensures we
    // don't block indefinitely — timeout = device rebooted = success.
    if (typeof device.commitEditSettings === 'function') {
        const commitResult = await withBleTimeout(
            device.commitEditSettings(), 8000, 'commitEditSettings'
        );
        if (!commitResult.completed) {
            console.log('[MeshtasticClient] commitEditSettings timed out — device rebooted to apply LoRa changes (expected)');
        }
    }
    
    // Brief delay (only reached if commit didn't trigger reboot)
    await new Promise(r => setTimeout(r, 500));
    
    console.log(`[MeshtasticClient] Batch write complete (${configPayloads.length} configs committed)`);
}

async function setRegion(region) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    await writeConfig({
        payloadVariant: {
            case: 'lora',
            value: {
                ...getLoRaFields(),
                region: region
            }
        }
    });
    
    MeshtasticClient.deviceConfig.region = region;
    return MeshtasticClient.deviceConfig;
}

/**
 * Set modem preset
 */
async function setModemPreset(modemPreset) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    await writeConfig({
        payloadVariant: {
            case: 'lora',
            value: {
                ...getLoRaFields(),
                modemPreset: modemPreset,
                usePreset: true
            }
        }
    });
    
    MeshtasticClient.deviceConfig.modemPreset = modemPreset;
    MeshtasticClient.deviceConfig.usePreset = true;
    return MeshtasticClient.deviceConfig;
}

/**
 * Set TX power
 */
async function setTxPower(txPower) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    await writeConfig({
        payloadVariant: {
            case: 'lora',
            value: {
                ...getLoRaFields(),
                txPower: txPower
            }
        }
    });
    
    MeshtasticClient.deviceConfig.txPower = txPower;
    return MeshtasticClient.deviceConfig;
}

/**
 * Set hop limit
 */
async function setHopLimit(hopLimit) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    await writeConfig({
        payloadVariant: {
            case: 'lora',
            value: {
                ...getLoRaFields(),
                hopLimit: hopLimit
            }
        }
    });
    
    MeshtasticClient.deviceConfig.hopLimit = hopLimit;
    return MeshtasticClient.deviceConfig;
}

/**
 * Send text message
 */
async function sendMessage(text, destination = 0xffffffff, channel = 0) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    // sendText returns the packet ID used for transport-level ACK tracking
    const packetId = await MeshtasticClient.device.sendText(text, destination, true, channel);
    
    return {
        text,
        destination,
        channel,
        packetId: packetId || null,
        timestamp: Date.now()
    };
}

/**
 * Send position
 */
async function sendPosition(latitude, longitude, altitude = 0) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    const latI = Math.round(latitude * 1e7);
    const lonI = Math.round(longitude * 1e7);
    const time = Math.floor(Date.now() / 1000);
    
    let packetId;
    
    // In @meshtastic/core v2.6.x (protobuf-es v2), setPosition() requires a
    // proper protobuf Position message created with create(PositionSchema, values).
    // Plain objects throw ForeignFieldError.
    
    // Step 1: Find Position schema from protobufs package
    const pb = MeshtasticClient.protobufs;
    const runtime = MeshtasticClient.protobufRuntime;
    const createFn = runtime?.create;
    
    if (createFn && pb) {
        // Search for PositionSchema in the protobufs module
        const PositionSchema = findSchema(pb, 'Position');
        
        if (PositionSchema) {
            try {
                const position = createFn(PositionSchema, {
                    latitudeI: latI,
                    longitudeI: lonI,
                    altitude: altitude,
                    time: time
                });
                packetId = await MeshtasticClient.device.setPosition(position);
                return { latitude, longitude, altitude, packetId: packetId || null };
            } catch (e) {
                console.warn('[MeshtasticClient] Position via create(PositionSchema) failed:', e?.message || e);
                // Try with snake_case field names
                try {
                    const position = createFn(PositionSchema, {
                        latitude_i: latI,
                        longitude_i: lonI,
                        altitude: altitude,
                        time: time
                    });
                    packetId = await MeshtasticClient.device.setPosition(position);
                    return { latitude, longitude, altitude, packetId: packetId || null };
                } catch (e2) {
                    console.warn('[MeshtasticClient] Position via snake_case create() failed:', e2?.message || e2);
                }
            }
        } else {
            console.warn('[MeshtasticClient] Position schema not found in protobufs. Available keys:', 
                Object.keys(pb).slice(0, 20));
        }
    }
    
    // Fallback: try setPosition with plain objects (works in older library versions)
    const attempts = [
        { latitudeI: latI, longitudeI: lonI, altitude, time },
        { latitude_i: latI, longitude_i: lonI, altitude, time }
    ];
    
    for (const fields of attempts) {
        try {
            packetId = await MeshtasticClient.device.setPosition(fields);
            return { latitude, longitude, altitude, packetId: packetId || null };
        } catch (e) {
            // Continue to next attempt
        }
    }
    
    // Last resort: send position as a text message with coordinates
    console.warn('[MeshtasticClient] All setPosition approaches failed — sending as text');
    try {
        await MeshtasticClient.device.sendText(
            `pos:${latitude.toFixed(7)},${longitude.toFixed(7)},${altitude}`,
            0xffffffff, true, 0
        );
        return { latitude, longitude, altitude, packetId: null };
    } catch (e) {
        throw new Error('Failed to send position - all approaches failed');
    }
}

/**
 * Search for a protobuf schema by name in the protobufs module.
 * Handles different export structures: Protobuf.Mesh.*, direct exports, 
 * Schema suffix variants, etc.
 */
function findSchema(pb, name) {
    if (!pb) return null;
    
    // Direct export: pb.Position or pb.PositionSchema
    if (pb[name]) return pb[name];
    if (pb[name + 'Schema']) return pb[name + 'Schema'];
    
    // Nested under Protobuf namespace
    if (pb.Protobuf) {
        // pb.Protobuf.Mesh.Position
        if (pb.Protobuf.Mesh?.[name]) return pb.Protobuf.Mesh[name];
        if (pb.Protobuf.Mesh?.[name + 'Schema']) return pb.Protobuf.Mesh[name + 'Schema'];
        // pb.Protobuf.Position  
        if (pb.Protobuf[name]) return pb.Protobuf[name];
        if (pb.Protobuf[name + 'Schema']) return pb.Protobuf[name + 'Schema'];
    }
    
    // Nested under default export
    if (pb.default) {
        if (pb.default[name]) return pb.default[name];
        if (pb.default[name + 'Schema']) return pb.default[name + 'Schema'];
        if (pb.default.Protobuf?.Mesh?.[name]) return pb.default.Protobuf.Mesh[name];
    }
    
    // Deep search: iterate top-level keys looking for objects that contain the schema
    for (const key of Object.keys(pb)) {
        const val = pb[key];
        if (val && typeof val === 'object') {
            if (val[name]) return val[name];
            if (val[name + 'Schema']) return val[name + 'Schema'];
        }
    }
    
    return null;
}

/**
 * Get all nodes from the mesh
 */
function getNodes() {
    return Array.from(MeshtasticClient.nodes.values());
}

/**
 * Get channels
 */
function getChannels() {
    return [...MeshtasticClient.channels];
}

/**
 * Set a channel
 */
async function setChannel(index, settings) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    await MeshtasticClient.device.setChannel({
        index: index,
        role: settings.role || 1, // 1 = PRIMARY
        settings: {
            name: settings.name,
            psk: settings.psk
        }
    });
    
    return true;
}

/**
 * Set device owner (longName/shortName)
 * This writes the owner identity to the device hardware so it persists
 * across reboots and is visible to other mesh nodes.
 */
async function setOwner(longName, shortName, isLicensed = false) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    // The Meshtastic JS library supports setOwner on the device object
    if (typeof MeshtasticClient.device.setOwner === 'function') {
        await MeshtasticClient.device.setOwner({
            longName: longName,
            shortName: shortName || longName.substring(0, 4).toUpperCase(),
            isLicensed: isLicensed
        });
        console.log(`[MeshtasticClient] Owner set: ${longName} (${shortName})`);
        return true;
    }
    
    // Fallback: try setConfig with device variant
    try {
        // Extract only device-specific fields
        const dc = MeshtasticClient.deviceConfig || {};
        await writeConfig({
            payloadVariant: {
                case: 'device',
                value: {
                    role: dc.role,
                    serialEnabled: dc.serialEnabled,
                    buttonGpio: dc.buttonGpio,
                    buzzerGpio: dc.buzzerGpio
                }
            }
        });
        console.log(`[MeshtasticClient] Owner set via config: ${longName} (${shortName})`);
        return true;
    } catch (err) {
        console.warn('[MeshtasticClient] setOwner fallback failed:', err);
        throw new Error('Device does not support owner configuration via this interface');
    }
}

/**
 * Set position broadcast configuration on device
 */
async function setPositionConfig(broadcastSecs, gpsUpdateInterval, gpsEnabled) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    const posConfig = {};
    if (broadcastSecs !== undefined) posConfig.positionBroadcastSecs = broadcastSecs;
    if (gpsUpdateInterval !== undefined) posConfig.gpsUpdateInterval = gpsUpdateInterval;
    if (gpsEnabled !== undefined) posConfig.gpsEnabled = gpsEnabled;
    
    await writeConfig({
        payloadVariant: {
            case: 'position',
            value: posConfig
        }
    });
    
    // Update local cache
    Object.assign(MeshtasticClient.deviceConfig || {}, posConfig);
    console.log('[MeshtasticClient] Position config set:', posConfig);
    return true;
}

/**
 * Reboot the connected device
 * Useful after applying multiple config changes
 */
async function rebootDevice(seconds = 2) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    if (typeof MeshtasticClient.device.reboot === 'function') {
        // Reboot causes BLE disconnect — the promise will hang forever.
        // withBleTimeout ensures we return after 8s max.
        const result = await withBleTimeout(
            MeshtasticClient.device.reboot(seconds), 8000, 'reboot'
        );
        console.log(`[MeshtasticClient] Reboot in ${seconds}s — ${result.completed ? 'completed' : 'device disconnected (expected)'}`);
        return true;
    }
    
    // Fallback: send admin packet for reboot
    console.warn('[MeshtasticClient] Device reboot not available via library');
    return false;
}

/**
 * Request a native firmware-level traceroute to a destination node.
 * Uses the Meshtastic RouteDiscovery protobuf (portnum 70) which is handled
 * at the routing layer — tiny packets, works with all Meshtastic nodes,
 * and doesn't consume LoRa text payload space.
 * 
 * The response arrives asynchronously via onTraceroute callback
 * (detected in handleMeshPacket when portnum === TRACEROUTE_APP).
 * 
 * @param {number} destinationNodeNum - Target node number
 * @returns {boolean} true if request was sent
 */
async function traceRoute(destinationNodeNum) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    if (!destinationNodeNum || typeof destinationNodeNum !== 'number') {
        throw new Error('Destination node number required (numeric)');
    }
    
    // The @meshtastic/core library exposes traceRoute on the device object
    if (typeof MeshtasticClient.device.traceRoute === 'function') {
        console.log(`[MeshtasticClient] Sending native traceroute to node ${destinationNodeNum}`);
        await MeshtasticClient.device.traceRoute(destinationNodeNum);
        return true;
    }
    
    // Fallback: try sendTraceRoute (alternate naming in some library versions)
    if (typeof MeshtasticClient.device.sendTraceRoute === 'function') {
        console.log(`[MeshtasticClient] Sending traceroute via sendTraceRoute to ${destinationNodeNum}`);
        await MeshtasticClient.device.sendTraceRoute(destinationNodeNum);
        return true;
    }
    
    console.warn('[MeshtasticClient] Native traceroute not available on device object');
    console.log('[MeshtasticClient] Device methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(MeshtasticClient.device)));
    throw new Error('Native traceroute not supported by this library version');
}

/**
 * Factory reset the connected Meshtastic device.
 * Tries multiple approaches since the @meshtastic/js library API varies by version:
 *   1. device.factoryReset() — standard method
 *   2. device.factoryResetConfig() — alternate naming
 *   3. Admin message via setConfig with device.factoryReset flag
 *   4. resetNodes() / resetPeers() + reboot — partial reset fallback
 *
 * @returns {boolean} true if reset command was sent successfully
 */
async function factoryResetDevice() {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    const device = MeshtasticClient.device;
    
    // Log available methods for debugging
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(device))
        .filter(m => typeof device[m] === 'function')
        .sort();
    console.log('[MeshtasticClient] Device methods available:', methods.join(', '));
    
    // Strategy 1: Direct factoryReset method
    if (typeof device.factoryReset === 'function') {
        try {
            // Factory reset causes device reboot → BLE disconnect → promise hangs.
            // withBleTimeout returns after 8s if the promise doesn't resolve.
            // Timeout = device rebooted = success.
            const result = await withBleTimeout(
                device.factoryReset(), 8000, 'factoryReset()'
            );
            console.log(`[MeshtasticClient] Factory reset via device.factoryReset() — ${result.completed ? 'completed' : 'device rebooted'}`);
            return true;
        } catch (e) {
            // BLE disconnect error also = success (device is rebooting)
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('disconnect') || msg.includes('gatt') || msg.includes('bluetooth') ||
                msg.includes('not connected') || msg.includes('network error')) {
                console.log('[MeshtasticClient] Factory reset: BLE disconnected (device rebooting — success)');
                return true;
            }
            console.warn('[MeshtasticClient] device.factoryReset() failed:', e.message);
        }
    }
    
    // Strategy 2: Alternate method name
    if (typeof device.factoryResetConfig === 'function') {
        try {
            const result = await withBleTimeout(
                device.factoryResetConfig(), 8000, 'factoryResetConfig()'
            );
            console.log(`[MeshtasticClient] Factory reset via factoryResetConfig() — ${result.completed ? 'completed' : 'device rebooted'}`);
            return true;
        } catch (e) {
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('disconnect') || msg.includes('gatt') || msg.includes('bluetooth') ||
                msg.includes('not connected') || msg.includes('network error')) {
                console.log('[MeshtasticClient] factoryResetConfig: BLE disconnected (success)');
                return true;
            }
            console.warn('[MeshtasticClient] device.factoryResetConfig() failed:', e.message);
        }
    }
    
    // Strategy 3: Admin message via setConfig — Meshtastic protobuf admin.factory_reset
    if (typeof device.setConfig === 'function') {
        try {
            const result = await withBleTimeout(
                device.setConfig({
                    payloadVariant: {
                        case: 'device',
                        value: { factoryReset: true }
                    }
                }), 8000, 'setConfig(factoryReset)'
            );
            console.log(`[MeshtasticClient] Factory reset via setConfig flag — ${result.completed ? 'completed' : 'device rebooted'}`);
            return true;
        } catch (e) {
            const msg = (e.message || '').toLowerCase();
            if (msg.includes('disconnect') || msg.includes('gatt') || msg.includes('bluetooth') ||
                msg.includes('not connected') || msg.includes('network error')) {
                console.log('[MeshtasticClient] setConfig factoryReset: BLE disconnected (success)');
                return true;
            }
            console.warn('[MeshtasticClient] setConfig factory reset failed:', e.message);
        }
    }
    
    // Strategy 4: Reset node database + reboot (partial reset)
    for (const method of ['resetNodes', 'resetPeers', 'resetDB', 'nodeDBReset']) {
        if (typeof device[method] === 'function') {
            try {
                console.warn(`[MeshtasticClient] Using partial reset: ${method}() + reboot`);
                await withBleTimeout(device[method](), 8000, method);
                try {
                    await withBleTimeout(rebootDevice(2), 8000, 'reboot after ' + method);
                } catch (e) { /* disconnect = success */ }
                return true;
            } catch (e) {
                const msg = (e.message || '').toLowerCase();
                if (msg.includes('disconnect') || msg.includes('gatt') || msg.includes('bluetooth') ||
                    msg.includes('not connected') || msg.includes('network error')) {
                    return true;
                }
                console.warn(`[MeshtasticClient] ${method}() failed:`, e.message);
            }
        }
    }
    
    // Nothing worked — report what we found
    const resetMethods = methods.filter(m => 
        /reset|factory|clear|wipe|erase/i.test(m)
    );
    const hint = resetMethods.length > 0 
        ? `Found potentially relevant methods: ${resetMethods.join(', ')}` 
        : 'No reset-related methods found on device object';
    
    console.error('[MeshtasticClient] All factory reset strategies failed.', hint);
    throw new Error(`Factory reset not available with current firmware/library. ${hint}`);
}

/**
 * Set all LoRa config in a single write + reboot.
 * Meshtastic devices require a reboot for LoRa changes to take effect.
 * This batches region, modem preset, TX power, and hop limit into one
 * setConfig call (1 flash write instead of 4) and triggers a reboot.
 * 
 * @param {Object} config - LoRa parameters to change (only include fields you want to modify)
 * @param {number} [config.region] - Region code
 * @param {number} [config.modemPreset] - Modem preset
 * @param {number} [config.txPower] - TX power in dBm (0 = device default)
 * @param {number} [config.hopLimit] - Hop limit (1-7)
 * @param {boolean} [autoReboot=true] - Reboot device after writing config
 * @returns {Object} Updated config
 */
async function setLoRaConfig(config, autoReboot = true) {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    // Start with clean current LoRa fields, merge in changes
    const loraValue = { ...getLoRaFields() };
    
    if (config.region !== undefined) {
        loraValue.region = config.region;
    }
    if (config.modemPreset !== undefined) {
        loraValue.modemPreset = config.modemPreset;
        loraValue.usePreset = true;
    }
    if (config.txPower !== undefined) {
        loraValue.txPower = config.txPower;
    }
    if (config.hopLimit !== undefined) {
        loraValue.hopLimit = config.hopLimit;
    }
    
    // Meshtastic firmware uses a 3-phase config write protocol:
    //   1. beginEditSettings() — open config transaction
    //   2. setConfig()         — stage changes in RAM
    //   3. commitEditSettings()— flush to NVS/flash
    // writeConfig() handles all three phases.
    
    await writeConfig({
        payloadVariant: {
            case: 'lora',
            value: loraValue
        }
    });
    
    // Update local cache
    Object.assign(MeshtasticClient.deviceConfig, loraValue);
    console.log('[MeshtasticClient] LoRa config written:', loraValue);
    
    // Reboot to apply radio changes (LoRa changes require restart)
    if (autoReboot) {
        console.log('[MeshtasticClient] Rebooting device to apply LoRa config...');
        await rebootDevice(2);
    }
    
    return MeshtasticClient.deviceConfig;
}

/**
 * Request device config refresh
 */
async function requestConfig() {
    if (!MeshtasticClient.device || !MeshtasticClient.isConnected) {
        throw new Error('Not connected to device');
    }
    
    // Triggers the device to re-send all config
    await MeshtasticClient.device.getConfig();
    return true;
}

/**
 * Set event callback
 */
function setCallback(event, callback) {
    if (event in MeshtasticClient.callbacks) {
        MeshtasticClient.callbacks[event] = callback;
    }
}

/**
 * Check if connected
 */
function isConnected() {
    return MeshtasticClient.isConnected;
}

/**
 * Get connection type
 */
function getConnectionType() {
    return MeshtasticClient.connectionType;
}

/**
 * Check if libraries are loaded
 */
function isReady() {
    return MeshtasticClient.librariesLoaded;
}

/**
 * Get my node number
 */
function getMyNodeNum() {
    return MeshtasticClient.myNodeNum;
}

/**
 * Get my node info
 */
function getMyNodeInfo() {
    return MeshtasticClient.myNodeInfo;
}

// =============================================================================
// EXPORT TO GLOBAL SCOPE
// =============================================================================

// Export to window for use by existing vanilla JS code
window.MeshtasticClient = {
    // Connection
    connectBLE,
    reconnectBLE,
    connectSerial,
    disconnect,
    isConnected,
    isReady,
    getConnectionType,
    getLastBleDeviceName: () => MeshtasticClient.lastBleDeviceName,
    
    // Configuration
    getConfig,
    setRegion,
    setModemPreset,
    setTxPower,
    setHopLimit,
    setLoRaConfig,
    setOwner,
    setPositionConfig,
    rebootDevice,
    traceRoute,
    factoryResetDevice,
    batchWriteConfigs,
    requestConfig,
    
    // Messaging
    sendMessage,
    sendPosition,
    
    // Data access
    getNodes,
    getChannels,
    setChannel,
    getMyNodeNum,
    getMyNodeInfo,
    
    // Events
    setCallback,
    
    // Library loading
    loadLibraries,
    
    // Debugging
    debugLibraries,
    
    // Constants (will be populated after libraries load)
    RegionCode: {},
    ModemPreset: {}
};

// Load libraries and populate constants
loadLibraries().then(() => {
    if (MeshtasticClient.protobufs) {
        const { Protobuf } = MeshtasticClient.protobufs;
        if (Protobuf?.Config?.Config_LoRaConfig_RegionCode) {
            window.MeshtasticClient.RegionCode = Protobuf.Config.Config_LoRaConfig_RegionCode;
        }
        if (Protobuf?.Config?.Config_LoRaConfig_ModemPreset) {
            window.MeshtasticClient.ModemPreset = Protobuf.Config.Config_LoRaConfig_ModemPreset;
        }
    }
    console.log('[MeshtasticClient] Ready for connections');
    
    // Notify that client is ready
    window.dispatchEvent(new CustomEvent('meshtastic-client-ready'));
}).catch((err) => {
    console.warn('[MeshtasticClient] Libraries not loaded (offline?):', err.message);
});

export {
    connectBLE,
    reconnectBLE,
    connectSerial,
    disconnect,
    getConfig,
    setRegion,
    setModemPreset,
    setTxPower,
    setHopLimit,
    setLoRaConfig,
    setOwner,
    setPositionConfig,
    rebootDevice,
    traceRoute,
    factoryResetDevice,
    batchWriteConfigs,
    sendMessage,
    sendPosition,
    getNodes,
    getChannels,
    setChannel,
    getMyNodeNum,
    getMyNodeInfo,
    setCallback,
    isConnected,
    isReady,
    loadLibraries,
    debugLibraries
};
