const CACHE_NAME = 'griddown-v6.13.0';
const TILE_CACHE_NAME = 'griddown-tiles-v1';
const STATIC_ASSETS = [
    './', 'index.html', 'manifest.json', 'favicon.ico', 'css/app.css',
    'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
    'js/utils/helpers.js', 'js/utils/storage.js', 'js/utils/icons.js',
    'js/utils/coordinates.js', 'js/utils/events-manager.js',
    'js/core/constants.js', 'js/core/state.js', 'js/core/events.js',
    'js/core/history.js',
    'js/modules/map.js', 'js/modules/sidebar.js', 'js/modules/panels.js',
    'js/modules/modals.js', 'js/modules/logistics.js', 'js/modules/gpx.js',
    'js/modules/kml.js', 'js/modules/routebuilder.js', 'js/modules/elevation.js', 
    'js/modules/offline.js', 'js/modules/gps.js', 'js/modules/navigation.js',
    'js/modules/weather.js', 'js/modules/satweather.js', 'js/modules/rflos.js', 'js/modules/contingency.js', 'js/modules/measure.js', 
    'js/modules/sunmoon.js', 'js/modules/commplan.js', 'js/modules/terrain.js',
    'js/modules/nightmode.js', 'js/modules/sos.js', 'js/modules/radio.js',
    'js/modules/plansharing.js',
    'js/modules/declination.js',
    'js/modules/print.js',
    'js/modules/undo.js',
    'js/modules/meshtastic.js',
    'js/modules/aprs.js',
    'js/modules/radiacode.js',
    'js/modules/search.js',
    'js/modules/onboarding.js',
    'js/modules/medical.js',
    'js/modules/fieldguides.js',
    'js/modules/streamgauge.js',
    'js/modules/barometer.js',
    'js/modules/team.js',
    'js/app.js'
];

// Tile server domains to cache
const TILE_DOMAINS = [
    'tile.openstreetmap.org',           // Standard OSM
    'tile.opentopomap.org',             // Terrain/Topo
    'server.arcgisonline.com',          // Esri (satellite, labels, hillshade)
    'basemap.nationalmap.gov',          // USGS (topo, imagery, hydro)
    'apps.fs.usda.gov',                 // USFS (topo, roads, trails, recreation)
    'gis.blm.gov',                      // BLM (surface management, grazing)
    // Weather radar and satellite tiles (Iowa Environmental Mesonet)
    'mesonet.agron.iastate.edu'         // IEM - NEXRAD, GOES, MRMS, NWS warnings
];

// Background sync configuration
const SYNC_TAG = 'griddown-tile-sync';
const PERIODIC_SYNC_TAG = 'griddown-periodic-sync';
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
    if (e.data === 'skipWaiting') {
        self.skipWaiting();
    }
    if (e.data === 'getVersion') {
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
