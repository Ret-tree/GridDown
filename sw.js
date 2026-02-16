const CACHE_NAME = 'griddown-v6.57.54';
const TILE_CACHE_NAME = 'griddown-tiles-v1';
const STATIC_ASSETS = [
    './', 'index.html', 'manifest.json', 'favicon.ico', 'css/app.css',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
    'js/utils/helpers.js', 'js/utils/storage.js', 'js/utils/icons.js',
    'js/utils/coordinates.js', 'js/utils/events-manager.js',
    'js/core/log.js', 'js/core/error-boundary.js', 'js/core/constants.js', 'js/core/state.js', 'js/core/events.js',
    'js/modules/map.js', 'js/modules/sidebar.js', 'js/modules/panels.js',
    'js/modules/modals.js', 'js/modules/logistics.js', 'js/modules/gpx.js',
    'js/modules/kml.js', 'js/modules/routebuilder.js', 'js/modules/elevation.js', 
    'js/modules/offline.js', 'js/modules/gps.js', 'js/modules/navigation.js',
    'js/modules/hiking.js',
    'js/modules/weather.js', 'js/modules/satweather.js', 'js/modules/alerts.js', 'js/modules/airquality.js', 'js/modules/rflos.js', 'js/modules/contingency.js', 'js/modules/measure.js', 
    'js/modules/sunmoon.js', 'js/modules/celestial.js', 'js/modules/camera-sextant.js', 'js/modules/star-id.js', 'js/modules/rangefinder.js', 'js/modules/commplan.js', 'js/modules/terrain.js',
    'js/modules/nightmode.js', 'js/modules/sos.js', 'js/modules/radio.js',
    'js/modules/plansharing.js',
    'js/modules/declination.js',
    'js/modules/print.js',
    'js/modules/undo.js',
    'js/modules/meshtastic.js',
    'js/modules/meshtastic-client.js',
    'js/modules/tak.js',
    'js/modules/aprs.js',
    'js/modules/radiacode.js',
    'js/modules/rfsentinel.js',
    'js/modules/sstv.js',
    'js/modules/sarsat.js',
    'js/modules/sstv-ai.js',
    'js/modules/sstv-dsp.js',
    'js/modules/landmark.js',
    'js/modules/search.js',
    'js/modules/mobile.js',
    'js/modules/wizard.js',
    'js/modules/onboarding.js',
    'js/modules/medical.js',
    'js/modules/fieldguides.js',
    'js/modules/streamgauge.js',
    'js/modules/barometer.js',
    'js/modules/compatibility.js',
    'js/modules/networkstatus.js',
    'js/modules/update.js',
    'js/modules/storagemonitor.js',
    'js/modules/networkquality.js',
    'js/modules/qr-generator.js',
    'js/modules/team.js',
    'js/app.js'
];

// Tile server domains to cache
// NOTE: Esri domains removed for commercial licensing compliance
const TILE_DOMAINS = [
    'tile.openstreetmap.org',           // Standard OSM (ODbL license)
    'tile.opentopomap.org',             // Terrain/Topo (CC-BY-SA)
    'basemap.nationalmap.gov',          // USGS (public domain - US Government)
    'gis.blm.gov',                      // BLM (public domain - US Government)
    // Weather radar and satellite tiles (Iowa Environmental Mesonet)
    'mesonet.agron.iastate.edu'         // IEM - NEXRAD, GOES, MRMS, NWS warnings
];

// Background sync configuration
const SYNC_TAG = 'griddown-tile-sync';
const PERIODIC_SYNC_TAG = 'griddown-periodic-sync';

// Complete browser polyfill for Node.js util.types, served in place of esm.sh's
// broken "unenv" stub. The @meshtastic/core logger calls isNativeError() which
// the unenv shim throws on instead of implementing. This provides real checks.
const UTIL_TYPES_POLYFILL = `
// GridDown polyfill for node:util/types (replaces esm.sh unenv stub)
export const isNativeError = (v) => v instanceof Error;
export const isDate = (v) => v instanceof Date;
export const isRegExp = (v) => v instanceof RegExp;
export const isMap = (v) => v instanceof Map;
export const isSet = (v) => v instanceof Set;
export const isWeakMap = (v) => v instanceof WeakMap;
export const isWeakSet = (v) => v instanceof WeakSet;
export const isArrayBuffer = (v) => v instanceof ArrayBuffer;
export const isDataView = (v) => v instanceof DataView;
export const isSharedArrayBuffer = (v) => typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer;
export const isPromise = (v) => v instanceof Promise;
export const isTypedArray = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
export const isUint8Array = (v) => v instanceof Uint8Array;
export const isUint16Array = (v) => v instanceof Uint16Array;
export const isUint32Array = (v) => v instanceof Uint32Array;
export const isInt8Array = (v) => v instanceof Int8Array;
export const isInt16Array = (v) => v instanceof Int16Array;
export const isInt32Array = (v) => v instanceof Int32Array;
export const isFloat32Array = (v) => v instanceof Float32Array;
export const isFloat64Array = (v) => v instanceof Float64Array;
export const isBigInt64Array = (v) => typeof BigInt64Array !== 'undefined' && v instanceof BigInt64Array;
export const isBigUint64Array = (v) => typeof BigUint64Array !== 'undefined' && v instanceof BigUint64Array;
export const isGeneratorFunction = (v) => typeof v === 'function' && v.constructor?.name === 'GeneratorFunction';
export const isGeneratorObject = (v) => v != null && typeof v.next === 'function' && typeof v.throw === 'function';
export const isAsyncFunction = (v) => typeof v === 'function' && v.constructor?.name === 'AsyncFunction';
export const isMapIterator = (v) => Object.prototype.toString.call(v) === '[object Map Iterator]';
export const isSetIterator = (v) => Object.prototype.toString.call(v) === '[object Set Iterator]';
export const isArgumentsObject = (v) => Object.prototype.toString.call(v) === '[object Arguments]';
export const isBoxedPrimitive = (v) => v instanceof Number || v instanceof String || v instanceof Boolean || v instanceof BigInt || v instanceof Symbol;
export const isNumberObject = (v) => v instanceof Number;
export const isStringObject = (v) => v instanceof String;
export const isBooleanObject = (v) => v instanceof Boolean;
export const isSymbolObject = (v) => Object.prototype.toString.call(v) === '[object Symbol]';
export const isAnyArrayBuffer = (v) => isArrayBuffer(v) || isSharedArrayBuffer(v);
export const isProxy = (v) => false; // Cannot detect proxies in userland JS

const _all = {
    isNativeError, isDate, isRegExp, isMap, isSet, isWeakMap, isWeakSet,
    isArrayBuffer, isDataView, isSharedArrayBuffer, isPromise, isTypedArray,
    isUint8Array, isUint16Array, isUint32Array, isInt8Array, isInt16Array,
    isInt32Array, isFloat32Array, isFloat64Array, isBigInt64Array, isBigUint64Array,
    isGeneratorFunction, isGeneratorObject, isAsyncFunction, isMapIterator,
    isSetIterator, isArgumentsObject, isBoxedPrimitive, isNumberObject,
    isStringObject, isBooleanObject, isSymbolObject, isAnyArrayBuffer, isProxy
};
export default _all;
`;
const DB_NAME = 'griddown-db';
const SYNC_QUEUE_STORE = 'syncQueue';
const MAX_BATCH_SIZE = 50; // Tiles per batch in background

self.addEventListener('install', e => {
    console.log('[SW] Installing version:', CACHE_NAME);
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())  // Immediately activate new SW
    );
});

self.addEventListener('activate', e => {
    console.log('[SW] Activating version:', CACHE_NAME);
    e.waitUntil(
        caches.keys().then(keys => 
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE_NAME).map(k => {
                console.log('[SW] Deleting old cache:', k);
                return caches.delete(k);
            }))
        ).then(() => {
            // Take control of all clients immediately
            return self.clients.claim();
        }).then(() => {
            // Notify all clients about the update
            return self.clients.matchAll({ type: 'window' }).then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
                });
            });
        })
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    
    // Intercept esm.sh's broken node:util/types polyfill.
    // The @meshtastic/core logger calls util.types.isNativeError() which esm.sh's
    // "unenv" shim leaves as a stub that throws "not implemented yet!". We replace
    // the entire module with a working browser implementation before it ever evaluates.
    //
    // esm.sh resolves node:util/types through various versioned paths, e.g.:
    //   /v136/unenv@1.10.0/runtime/node/util/types.mjs
    //   /node/util/types.mjs
    //   /v135/node/.unenv/util/types/index.mjs
    // We use a broad match: any esm.sh URL whose path contains "util" AND "types"
    // and serves JavaScript. This is safe because our polyfill is a superset of the
    // real node:util/types API.
    if (url.hostname.includes('esm.sh')) {
        const p = url.pathname.toLowerCase();
        if (p.includes('util') && p.includes('types') && (p.endsWith('.mjs') || p.endsWith('.js'))) {
            console.log('[SW] Intercepting util/types polyfill:', url.pathname);
            e.respondWith(new Response(UTIL_TYPES_POLYFILL, {
                status: 200,
                headers: {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'public, max-age=86400'
                }
            }));
            return;
        }
    }
    
    // Handle tile requests from any tile server - cache first (tiles rarely change)
    if (TILE_DOMAINS.includes(url.hostname)) {
        e.respondWith(
            caches.open(TILE_CACHE_NAME).then(cache => 
                cache.match(e.request).then(cached => {
                    if (cached) return cached;
                    return fetch(e.request).then(response => {
                        if (response.ok) {
                            cache.put(e.request, response.clone());
                        }
                        return response;
                    }).catch(() => {
                        // Return a placeholder for failed tiles
                        return new Response('', { status: 503, statusText: 'Tile unavailable offline' });
                    });
                })
            )
        );
        return;
    }
    
    // For navigation requests (HTML pages) - network first, fall back to cache
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .then(response => {
                    // Update cache with fresh response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Offline - serve from cache
                    return caches.match(e.request).then(cached => cached || caches.match('index.html'));
                })
        );
        return;
    }
    
    // For app JS/CSS files - network first with cache fallback (allows updates)
    if (url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
        e.respondWith(
            fetch(e.request)
                .then(response => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, responseClone));
                    }
                    return response;
                })
                .catch(() => {
                    // Offline - serve from cache
                    return caches.match(e.request);
                })
        );
        return;
    }
    
    // For other requests - cache first with network fallback
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(response => {
                if (response.ok && e.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => new Response('Offline', { status: 503 }));
        })
    );
});

self.addEventListener('message', e => {
    const data = e.data;
    
    // Handle both string and object formats
    if (data === 'skipWaiting' || (data && data.type === 'SKIP_WAITING')) {
        self.skipWaiting();
    }
    if (data === 'getVersion' || (data && data.type === 'GET_VERSION')) {
        e.source.postMessage({ type: 'SW_VERSION', version: CACHE_NAME });
    }
});

// ========== BACKGROUND SYNC HANDLING ==========

/**
 * Handle one-time background sync for tile downloads
 */
self.addEventListener('sync', event => {
    console.log('[SW] Sync event received:', event.tag);
    
    if (event.tag === SYNC_TAG) {
        event.waitUntil(handleTileSync());
    }
});

/**
 * Handle periodic background sync for tile freshness
 */
self.addEventListener('periodicsync', event => {
    console.log('[SW] Periodic sync event:', event.tag);
    
    if (event.tag === PERIODIC_SYNC_TAG) {
        event.waitUntil(handlePeriodicSync());
    }
});

/**
 * Main tile sync handler - downloads queued tiles
 */
async function handleTileSync() {
    console.log('[SW] Starting tile sync...');
    
    try {
        // Get queue from IndexedDB
        const queue = await getQueueFromDB();
        
        if (!queue || !queue.tiles || queue.tiles.length === 0) {
            console.log('[SW] No tiles in queue');
            notifyClients({ type: 'SYNC_COMPLETE', data: { success: true, downloaded: 0 } });
            return;
        }

        const cache = await caches.open(TILE_CACHE_NAME);
        let downloadedCount = queue.downloadedCount || 0;
        let errorCount = queue.errorCount || 0;
        const totalTiles = queue.totalTiles;

        // Process tiles in batches
        while (queue.tiles.length > 0) {
            const batch = queue.tiles.splice(0, MAX_BATCH_SIZE);
            
            // Download batch in parallel
            const results = await Promise.allSettled(
                batch.map(async tile => {
                    try {
                        const response = await fetch(tile.url, { mode: 'cors' });
                        if (response.ok) {
                            await cache.put(tile.url, response);
                            return { success: true };
                        }
                        return { success: false };
                    } catch (err) {
                        return { success: false, error: err.message };
                    }
                })
            );

            // Count results
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.success) {
                    downloadedCount++;
                } else {
                    errorCount++;
                }
            });

            // Update queue in DB
            queue.downloadedCount = downloadedCount;
            queue.errorCount = errorCount;
            await saveQueueToDB(queue);

            // Notify progress
            const progress = Math.round((downloadedCount / totalTiles) * 100);
            notifyClients({
                type: 'SYNC_PROGRESS',
                data: {
                    downloaded: downloadedCount,
                    errors: errorCount,
                    total: totalTiles,
                    remaining: queue.tiles.length,
                    progress
                }
            });

            console.log(`[SW] Sync progress: ${downloadedCount}/${totalTiles} (${progress}%)`);
        }

        // Sync complete - update region status
        await updateRegionStatus(queue.regionId, {
            status: errorCount > 0 ? 'partial' : 'downloaded',
            progress: 100,
            downloadedTiles: downloadedCount,
            failedTiles: errorCount,
            lastSync: new Date().toISOString()
        });

        // Clear queue
        await clearQueueFromDB();

        // Notify completion
        notifyClients({
            type: 'SYNC_COMPLETE',
            data: {
                success: true,
                downloaded: downloadedCount,
                errors: errorCount,
                total: totalTiles,
                regionId: queue.regionId
            }
        });

        console.log('[SW] Tile sync complete:', downloadedCount, 'downloaded,', errorCount, 'errors');

    } catch (err) {
        console.error('[SW] Sync error:', err);
        notifyClients({ type: 'SYNC_ERROR', data: { error: err.message } });
        throw err; // Re-throw to trigger retry
    }
}

/**
 * Periodic sync handler - checks for stale tiles
 */
async function handlePeriodicSync() {
    console.log('[SW] Running periodic tile freshness check...');
    
    // For now, just verify cache integrity
    // Could be extended to check tile ages and refresh old ones
    
    try {
        const cache = await caches.open(TILE_CACHE_NAME);
        const keys = await cache.keys();
        console.log('[SW] Tile cache contains', keys.length, 'tiles');
        
        notifyClients({
            type: 'PERIODIC_SYNC_COMPLETE',
            data: { tileCount: keys.length }
        });
    } catch (err) {
        console.error('[SW] Periodic sync error:', err);
    }
}

// ========== IndexedDB HELPERS ==========

/**
 * Get sync queue from IndexedDB
 */
async function getQueueFromDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
        
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('settings', 'readonly');
                const store = tx.objectStore('settings');
                const getReq = store.get(SYNC_QUEUE_STORE);
                
                getReq.onsuccess = () => {
                    db.close();
                    resolve(getReq.result?.value || null);
                };
                getReq.onerror = () => {
                    db.close();
                    reject(getReq.error);
                };
            } catch (err) {
                db.close();
                reject(err);
            }
        };
    });
}

/**
 * Save sync queue to IndexedDB
 */
async function saveQueueToDB(queue) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('settings', 'readwrite');
                const store = tx.objectStore('settings');
                store.put({ key: SYNC_QUEUE_STORE, value: queue });
                
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            } catch (err) {
                db.close();
                reject(err);
            }
        };
    });
}

/**
 * Clear sync queue from IndexedDB
 */
async function clearQueueFromDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('settings', 'readwrite');
                const store = tx.objectStore('settings');
                store.delete(SYNC_QUEUE_STORE);
                
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            } catch (err) {
                db.close();
                reject(err);
            }
        };
    });
}

/**
 * Update region status in IndexedDB
 */
async function updateRegionStatus(regionId, updates) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            try {
                const tx = db.transaction('settings', 'readwrite');
                const store = tx.objectStore('settings');
                const getReq = store.get('offlineRegions');
                
                getReq.onsuccess = () => {
                    const regions = getReq.result?.value || [];
                    const regionIndex = regions.findIndex(r => r.id === regionId);
                    
                    if (regionIndex >= 0) {
                        regions[regionIndex] = { ...regions[regionIndex], ...updates };
                        store.put({ key: 'offlineRegions', value: regions });
                    }
                    
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                };
                
                getReq.onerror = () => {
                    db.close();
                    reject(getReq.error);
                };
            } catch (err) {
                db.close();
                reject(err);
            }
        };
    });
}

/**
 * Notify all clients (app instances) of sync status
 */
async function notifyClients(message) {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
        client.postMessage(message);
    });
}
