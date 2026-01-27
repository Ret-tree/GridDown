/**
 * GridDown Satellite Weather Imagery Module
 * 
 * Provides weather satellite imagery from NOAA GOES and NASA Earth observation satellites.
 * Uses NASA GIBS (Global Imagery Browse Services) WMTS API - free, no key required.
 * 
 * LICENSING: All imagery is PUBLIC DOMAIN (US Government work)
 * - NOAA GOES data: Open to the public, can be used as desired
 * - NASA GIBS: Free and open access
 * - Attribution requested: "Imagery from NASA GIBS / NOAA"
 * 
 * Features:
 * - Multiple satellite products (GeoColor, Infrared, Water Vapor, etc.)
 * - Regional and full-disk views
 * - Animation support (recent frames)
 * - Offline caching via IndexedDB
 * - Integration with GridDown map layers
 */
const SatWeatherModule = (function() {
    'use strict';

    // ==================== CONFIGURATION ====================
    
    // NASA GIBS WMTS endpoints (free, no authentication required)
    const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
    
    // NOAA STAR direct image URLs (for static full images)
    const NOAA_STAR_BASE = 'https://cdn.star.nesdis.noaa.gov';
    
    // Cache configuration
    const CACHE_DURATION = 15 * 60 * 1000;  // 15 minutes for live data
    const OFFLINE_CACHE_DURATION = 24 * 60 * 60 * 1000;  // 24 hours for offline
    const MAX_CACHED_FRAMES = 24;  // Animation frames to cache
    
    // Available satellite products - all using IEM tile services
    // IEM services are reliable and free for use
    const PRODUCTS = {
        // === NEXRAD Radar (via Iowa Environmental Mesonet) ===
        // Free US Government data - no license restrictions
        nexrad_composite: {
            id: 'nexrad_composite',
            name: 'NEXRAD Radar',
            description: 'US composite weather radar',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png',
            maxZoom: 8,
            category: 'radar',
            updateInterval: 5,  // 5 minutes
            coverage: 'conus',
            attribution: '© Iowa Environmental Mesonet, NOAA NWS'
        },
        
        // === MRMS Precipitation (via IEM) ===
        mrms_precip: {
            id: 'mrms_precip',
            name: '1-Hour Precip',
            description: 'Multi-Radar Multi-Sensor 1-hour precipitation',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-n1p-900913/{z}/{x}/{y}.png',
            maxZoom: 8,
            category: 'precipitation',
            updateInterval: 5,
            coverage: 'conus',
            attribution: '© Iowa Environmental Mesonet, NOAA MRMS'
        },
        
        // === NWS Warnings (via IEM) ===
        nws_warnings: {
            id: 'nws_warnings',
            name: 'NWS Warnings',
            description: 'Active watches, warnings, advisories',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/wwa-900913/{z}/{x}/{y}.png',
            maxZoom: 10,
            category: 'alerts',
            updateInterval: 2,
            coverage: 'conus',
            attribution: '© Iowa Environmental Mesonet, NOAA NWS'
        },
        
        // === GOES West Satellite (via IEM - still operational) ===
        goes_ir: {
            id: 'goes_west_ir',
            name: 'GOES Infrared',
            description: 'GOES West infrared (day/night)',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-west-ir-900913/{z}/{x}/{y}.png',
            maxZoom: 8,
            category: 'infrared',
            updateInterval: 15,
            coverage: 'west_conus',
            attribution: '© Iowa Environmental Mesonet, NOAA GOES'
        },
        
        goes_wv: {
            id: 'goes_west_wv',
            name: 'GOES Water Vapor',
            description: 'GOES West water vapor channel',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-west-wv-900913/{z}/{x}/{y}.png',
            maxZoom: 8,
            category: 'moisture',
            updateInterval: 15,
            coverage: 'west_conus',
            attribution: '© Iowa Environmental Mesonet, NOAA GOES'
        },
        
        goes_vis: {
            id: 'goes_west_vis',
            name: 'GOES Visible',
            description: 'GOES West visible (daytime only)',
            source: 'iem',
            format: 'png',
            urlTemplate: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-west-vis-900913/{z}/{x}/{y}.png',
            maxZoom: 8,
            category: 'visible',
            updateInterval: 15,
            coverage: 'west_conus',
            attribution: '© Iowa Environmental Mesonet, NOAA GOES'
        }
    };
    
    // Product categories for UI organization
    const CATEGORIES = {
        visible: { name: 'Visible/Color', icon: '☀️', description: 'Daytime visible imagery' },
        infrared: { name: 'Infrared', icon: '🌡️', description: 'Cloud temperatures, night viewing' },
        moisture: { name: 'Water Vapor', icon: '💧', description: 'Atmospheric moisture' },
        precipitation: { name: 'Precipitation', icon: '🌧️', description: 'Rain/snow estimates' },
        radar: { name: 'Weather Radar', icon: '📡', description: 'NEXRAD precipitation radar' },
        alerts: { name: 'NWS Alerts', icon: '⚠️', description: 'Watches, warnings, advisories' }
    };
    
    // Regional sectors (for NOAA STAR direct images)
    const REGIONS = {
        conus: { name: 'CONUS', description: 'Continental US', sat: 'GOES19' },
        fulldisk_east: { name: 'Full Disk East', description: 'Western Hemisphere', sat: 'GOES19' },
        fulldisk_west: { name: 'Full Disk West', description: 'Pacific', sat: 'GOES18' },
        northeast: { name: 'Northeast', description: 'US Northeast', sat: 'GOES19' },
        southeast: { name: 'Southeast', description: 'US Southeast', sat: 'GOES19' },
        greatplains: { name: 'Great Plains', description: 'US Central', sat: 'GOES19' },
        southwest: { name: 'Southwest', description: 'US Southwest', sat: 'GOES18' },
        northwest: { name: 'Northwest', description: 'US Northwest', sat: 'GOES18' },
        caribbean: { name: 'Caribbean', description: 'Caribbean/Gulf', sat: 'GOES19' },
        atlantic: { name: 'Atlantic', description: 'Tropical Atlantic', sat: 'GOES19' },
        pacific: { name: 'Pacific', description: 'Eastern Pacific', sat: 'GOES18' }
    };

    // ==================== STATE ====================
    
    let initialized = false;
    let activeProduct = null;
    let activeLayers = new Map();  // Map layer references
    let animationFrames = [];
    let animationIndex = 0;
    let animationInterval = null;
    let isAnimating = false;
    let subscribers = new Set();
    let lastUpdate = null;
    let autoRefreshInterval = null;

    // ==================== INITIALIZATION ====================
    
    function init() {
        if (initialized) {
            console.debug('SatWeatherModule already initialized');
            return;
        }
        
        loadSettings();
        initialized = true;
        console.log('SatWeatherModule initialized');
        console.log('Available products:', Object.keys(PRODUCTS).length);
    }
    
    function destroy() {
        stopAnimation();
        stopAutoRefresh();
        clearAllLayers();
        subscribers.clear();
        initialized = false;
        console.log('SatWeatherModule destroyed');
    }

    // ==================== SETTINGS ====================
    
    async function loadSettings() {
        try {
            const settings = await Storage.Settings.get('satweather_settings');
            if (settings) {
                activeProduct = settings.activeProduct || null;
            }
        } catch (e) {
            console.warn('Could not load satellite weather settings:', e);
        }
    }
    
    async function saveSettings() {
        try {
            await Storage.Settings.set('satweather_settings', {
                activeProduct
            });
        } catch (e) {
            console.warn('Could not save satellite weather settings:', e);
        }
    }

    // ==================== GIBS TILE LAYER ====================
    
    /**
     * Get WMTS tile URL for a GIBS product
     */
    function getGibsTileUrl(productKey, date = null) {
        const product = PRODUCTS[productKey];
        if (!product || product.source !== 'gibs') return null;
        
        // Use today's date if not specified
        const dateStr = date || getTodayDateString();
        
        // WMTS REST pattern for GIBS
        // {z}/{y}/{x} will be filled by the mapping library
        return `${GIBS_BASE}/${product.id}/default/${dateStr}/${product.tileMatrixSet}/{z}/{y}/{x}.${product.format}`;
    }
    
    /**
     * Get today's date in YYYY-MM-DD format (UTC)
     */
    function getTodayDateString() {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }
    
    /**
     * Get date string for N hours ago
     */
    function getDateStringHoursAgo(hours) {
        const date = new Date(Date.now() - hours * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }
    
    /**
     * Get tile URL based on product source
     */
    function getTileUrl(productKey) {
        const product = PRODUCTS[productKey];
        if (!product) return null;
        
        if (product.source === 'gibs') {
            return getGibsTileUrl(productKey);
        } else if (product.source === 'iem') {
            // IEM tiles use direct XYZ URL template with cache buster
            const timestamp = Math.floor(Date.now() / (product.updateInterval * 60 * 1000));
            return product.urlTemplate + `?_t=${timestamp}`;
        }
        
        return null;
    }
    
    /**
     * Add satellite/weather layer to the map
     */
    function addSatelliteLayer(productKey, opacity = 0.7) {
        const product = PRODUCTS[productKey];
        if (!product) {
            console.error('Unknown satellite product:', productKey);
            return false;
        }
        
        // Remove existing layer for this product
        removeSatelliteLayer(productKey);
        
        const tileUrl = getTileUrl(productKey);
        if (!tileUrl) {
            console.error('Could not generate tile URL for:', productKey);
            return false;
        }
        
        // Determine attribution based on source
        let attribution = 'NASA GIBS / NOAA';
        if (product.source === 'iem') {
            attribution = product.attribution || '© Iowa Environmental Mesonet, NOAA NWS';
        }
        
        // Create layer info for MapModule
        const layerInfo = {
            id: `satweather_${productKey}`,
            name: product.name,
            type: 'tiles',
            url: tileUrl,
            opacity: opacity,
            maxZoom: product.maxZoom,
            attribution: attribution,
            zIndex: product.category === 'radar' ? 55 : 50  // Radar above satellite
        };
        
        // Add to map via MapModule if available
        if (typeof MapModule !== 'undefined' && MapModule.addCustomTileLayer) {
            MapModule.addCustomTileLayer(layerInfo);
            activeLayers.set(productKey, layerInfo);
            activeProduct = productKey;
            saveSettings();
            notifySubscribers('layer:add', { product: productKey });
            console.log('Added weather layer:', product.name);
            return true;
        } else {
            console.warn('MapModule.addCustomTileLayer not available');
            return false;
        }
    }
    
    /**
     * Remove satellite layer from map
     */
    function removeSatelliteLayer(productKey) {
        if (!activeLayers.has(productKey)) return false;
        
        const layerInfo = activeLayers.get(productKey);
        
        if (typeof MapModule !== 'undefined' && MapModule.removeCustomTileLayer) {
            MapModule.removeCustomTileLayer(layerInfo.id);
        }
        
        activeLayers.delete(productKey);
        
        if (activeProduct === productKey) {
            activeProduct = null;
            saveSettings();
        }
        
        notifySubscribers('layer:remove', { product: productKey });
        return true;
    }
    
    /**
     * Clear all satellite layers
     */
    function clearAllLayers() {
        for (const productKey of activeLayers.keys()) {
            removeSatelliteLayer(productKey);
        }
    }
    
    /**
     * Set layer opacity
     */
    function setLayerOpacity(productKey, opacity) {
        if (!activeLayers.has(productKey)) return false;
        
        if (typeof MapModule !== 'undefined' && MapModule.setLayerOpacity) {
            MapModule.setLayerOpacity(`satweather_${productKey}`, opacity);
            return true;
        }
        return false;
    }

    // ==================== NOAA STAR STATIC IMAGES ====================
    
    /**
     * Get direct image URL from NOAA STAR
     * These are full static images (not tiles) for specific regions
     */
    function getNoaaStarImageUrl(region, band = 'GEOCOLOR', size = '1200x1200') {
        const regionConfig = REGIONS[region];
        if (!regionConfig) return null;
        
        // NOAA STAR URL pattern
        // Example: https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/GEOCOLOR/latest.jpg
        return `${NOAA_STAR_BASE}/${regionConfig.sat}/ABI/${region.toUpperCase()}/${band}/latest.jpg`;
    }
    
    /**
     * Fetch static satellite image for offline caching
     */
    async function fetchStaticImage(region, band = 'GEOCOLOR') {
        const url = getNoaaStarImageUrl(region, band);
        if (!url) return null;
        
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const blob = await response.blob();
            const timestamp = Date.now();
            
            // Cache the image
            await cacheImage(region, band, blob, timestamp);
            
            return {
                url: URL.createObjectURL(blob),
                timestamp,
                region,
                band
            };
        } catch (e) {
            console.error('Failed to fetch satellite image:', e);
            return null;
        }
    }

    // ==================== CACHING ====================
    
    const imageCache = new Map();
    
    async function cacheImage(region, band, blob, timestamp) {
        const key = `${region}_${band}`;
        
        // Memory cache
        imageCache.set(key, { blob, timestamp });
        
        // IndexedDB cache for offline
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                await Storage.Settings.set(`satimage_${key}`, {
                    data: await blobToBase64(blob),
                    timestamp,
                    region,
                    band
                });
            }
        } catch (e) {
            console.warn('Could not cache satellite image to IndexedDB:', e);
        }
    }
    
    async function getCachedImage(region, band) {
        const key = `${region}_${band}`;
        
        // Check memory cache first
        if (imageCache.has(key)) {
            const cached = imageCache.get(key);
            if (Date.now() - cached.timestamp < CACHE_DURATION) {
                return {
                    url: URL.createObjectURL(cached.blob),
                    timestamp: cached.timestamp,
                    region,
                    band,
                    fromCache: true
                };
            }
        }
        
        // Check IndexedDB cache
        try {
            if (typeof Storage !== 'undefined' && Storage.Settings) {
                const stored = await Storage.Settings.get(`satimage_${key}`);
                if (stored && Date.now() - stored.timestamp < OFFLINE_CACHE_DURATION) {
                    const blob = base64ToBlob(stored.data);
                    return {
                        url: URL.createObjectURL(blob),
                        timestamp: stored.timestamp,
                        region,
                        band,
                        fromCache: true
                    };
                }
            }
        } catch (e) {
            console.warn('Could not retrieve cached satellite image:', e);
        }
        
        return null;
    }
    
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    function base64ToBlob(base64) {
        const parts = base64.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const data = atob(parts[1]);
        const array = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            array[i] = data.charCodeAt(i);
        }
        return new Blob([array], { type: mime });
    }

    // ==================== ANIMATION ====================
    
    /**
     * Start animation loop through recent frames
     */
    async function startAnimation(productKey, frameCount = 12, intervalMs = 500) {
        if (isAnimating) stopAnimation();
        
        const product = PRODUCTS[productKey];
        if (!product) return false;
        
        // Build frame URLs for past hours
        animationFrames = [];
        for (let i = frameCount - 1; i >= 0; i--) {
            const hoursAgo = i * (product.updateInterval / 60);
            const dateStr = getDateStringHoursAgo(hoursAgo);
            animationFrames.push({
                date: dateStr,
                url: getGibsTileUrl(productKey, dateStr)
            });
        }
        
        animationIndex = 0;
        isAnimating = true;
        
        // Start animation interval
        animationInterval = setInterval(() => {
            if (!isAnimating) return;
            
            animationIndex = (animationIndex + 1) % animationFrames.length;
            const frame = animationFrames[animationIndex];
            
            // Update layer URL
            updateLayerDate(productKey, frame.date);
            
            notifySubscribers('animation:frame', {
                product: productKey,
                frameIndex: animationIndex,
                totalFrames: animationFrames.length,
                date: frame.date
            });
        }, intervalMs);
        
        notifySubscribers('animation:start', { product: productKey });
        return true;
    }
    
    /**
     * Stop animation
     */
    function stopAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
            animationInterval = null;
        }
        isAnimating = false;
        animationFrames = [];
        animationIndex = 0;
        notifySubscribers('animation:stop', {});
    }
    
    /**
     * Update layer to show specific date
     */
    function updateLayerDate(productKey, dateStr) {
        if (!activeLayers.has(productKey)) return;
        
        const newUrl = getGibsTileUrl(productKey, dateStr);
        
        if (typeof MapModule !== 'undefined' && MapModule.updateTileLayerUrl) {
            MapModule.updateTileLayerUrl(`satweather_${productKey}`, newUrl);
        }
    }

    // ==================== AUTO REFRESH ====================
    
    function startAutoRefresh(intervalMinutes = 10) {
        stopAutoRefresh();
        
        autoRefreshInterval = setInterval(() => {
            if (activeProduct && activeLayers.has(activeProduct)) {
                // Force refresh by updating URL with current date
                const newUrl = getGibsTileUrl(activeProduct);
                if (typeof MapModule !== 'undefined' && MapModule.updateTileLayerUrl) {
                    MapModule.updateTileLayerUrl(`satweather_${activeProduct}`, newUrl);
                }
                lastUpdate = new Date();
                notifySubscribers('refresh', { product: activeProduct });
            }
        }, intervalMinutes * 60 * 1000);
    }
    
    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }

    // ==================== SUBSCRIBERS ====================
    
    function subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
    }
    
    function notifySubscribers(event, data) {
        subscribers.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {
                console.error('Subscriber error:', e);
            }
        });
    }

    // ==================== PUBLIC API ====================
    
    return {
        init,
        destroy,
        
        // Layer management
        addSatelliteLayer,
        removeSatelliteLayer,
        clearAllLayers,
        setLayerOpacity,
        
        // Static images
        fetchStaticImage,
        getCachedImage,
        getNoaaStarImageUrl,
        
        // Animation
        startAnimation,
        stopAnimation,
        isAnimating: () => isAnimating,
        
        // Auto refresh
        startAutoRefresh,
        stopAutoRefresh,
        
        // Subscription
        subscribe,
        
        // Getters
        getProducts: () => ({ ...PRODUCTS }),
        getProduct: (key) => PRODUCTS[key] ? { ...PRODUCTS[key] } : null,
        getCategories: () => ({ ...CATEGORIES }),
        getRegions: () => ({ ...REGIONS }),
        getActiveProduct: () => activeProduct,
        getActiveLayers: () => [...activeLayers.keys()],
        getLastUpdate: () => lastUpdate,
        
        // Utilities
        getGibsTileUrl,
        getTodayDateString,
        
        // Constants
        PRODUCTS,
        CATEGORIES,
        REGIONS
    };
})();

window.SatWeatherModule = SatWeatherModule;
