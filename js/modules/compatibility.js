/**
 * GridDown Browser Compatibility Module
 * Detects browser capabilities and alerts users about compatibility
 * 
 * Full support: Chrome on Android
 * Partial support: Chrome Desktop, Edge, Samsung Internet
 * Limited support: Safari, Firefox
 */
const CompatibilityModule = (function() {
    'use strict';

    // ==================== CONSTANTS ====================
    
    const STORAGE_KEY = 'griddown_compat_dismissed';
    const STORAGE_KEY_VERSION = 'griddown_compat_version';
    const CURRENT_COMPAT_VERSION = '1'; // Increment to re-show after major changes
    
    // Feature requirements for GridDown
    const FEATURES = {
        serviceWorker: {
            name: 'Offline Support',
            icon: '📴',
            required: true,
            description: 'Required for offline functionality'
        },
        indexedDB: {
            name: 'Local Storage',
            icon: '💾',
            required: true,
            description: 'Required for storing maps and data'
        },
        geolocation: {
            name: 'GPS Location',
            icon: '📍',
            required: true,
            description: 'Required for navigation'
        },
        webBluetooth: {
            name: 'Bluetooth Devices',
            icon: '📡',
            required: false,
            description: 'Meshtastic, Radiacode, sensors'
        },
        webSerial: {
            name: 'Serial Devices',
            icon: '🔌',
            required: false,
            description: 'APRS TNC, external GPS'
        },
        barometer: {
            name: 'Barometer Sensor',
            icon: '📊',
            required: false,
            description: 'Pressure-based altitude'
        },
        notifications: {
            name: 'Notifications',
            icon: '🔔',
            required: false,
            description: 'Alerts and warnings'
        },
        wakeLock: {
            name: 'Screen Wake Lock',
            icon: '🔆',
            required: false,
            description: 'Prevent sleep during navigation'
        }
    };

    // ==================== STATE ====================
    
    let browserInfo = null;
    let featureSupport = {};
    let compatibilityLevel = 'unknown'; // 'full', 'partial', 'limited', 'unsupported'
    let isInitialized = false;

    // ==================== DETECTION ====================
    
    /**
     * Detect browser type and version
     */
    function detectBrowser() {
        const ua = navigator.userAgent;
        const platform = navigator.platform || '';
        const vendor = navigator.vendor || '';
        
        let browser = 'Unknown';
        let version = '';
        let os = 'Unknown';
        let isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
        
        // Detect OS
        if (/Android/i.test(ua)) {
            os = 'Android';
            const match = ua.match(/Android\s+([\d.]+)/);
            if (match) os = `Android ${match[1]}`;
        } else if (/iPhone|iPad|iPod/i.test(ua)) {
            os = 'iOS';
            const match = ua.match(/OS\s+([\d_]+)/);
            if (match) os = `iOS ${match[1].replace(/_/g, '.')}`;
        } else if (/Windows/i.test(ua)) {
            os = 'Windows';
        } else if (/Mac OS X/i.test(ua)) {
            os = 'macOS';
        } else if (/Linux/i.test(ua)) {
            os = 'Linux';
        } else if (/CrOS/i.test(ua)) {
            os = 'Chrome OS';
        }
        
        // Detect browser (order matters - more specific first)
        if (/SamsungBrowser/i.test(ua)) {
            browser = 'Samsung Internet';
            const match = ua.match(/SamsungBrowser\/([\d.]+)/);
            if (match) version = match[1];
        } else if (/Edg/i.test(ua)) {
            browser = 'Edge';
            const match = ua.match(/Edg\/([\d.]+)/);
            if (match) version = match[1];
        } else if (/OPR|Opera/i.test(ua)) {
            browser = 'Opera';
            const match = ua.match(/(?:OPR|Opera)\/([\d.]+)/);
            if (match) version = match[1];
        } else if (/Firefox/i.test(ua)) {
            browser = 'Firefox';
            const match = ua.match(/Firefox\/([\d.]+)/);
            if (match) version = match[1];
        } else if (/Chrome/i.test(ua) && /Google Inc/i.test(vendor)) {
            browser = 'Chrome';
            const match = ua.match(/Chrome\/([\d.]+)/);
            if (match) version = match[1];
        } else if (/Safari/i.test(ua) && /Apple/i.test(vendor)) {
            browser = 'Safari';
            const match = ua.match(/Version\/([\d.]+)/);
            if (match) version = match[1];
        }
        
        browserInfo = {
            browser,
            version,
            os,
            isMobile,
            userAgent: ua,
            isAndroid: /Android/i.test(ua),
            isIOS: /iPhone|iPad|iPod/i.test(ua),
            isChrome: browser === 'Chrome',
            isSafari: browser === 'Safari',
            isFirefox: browser === 'Firefox',
            isEdge: browser === 'Edge',
            isSamsungInternet: browser === 'Samsung Internet'
        };
        
        return browserInfo;
    }
    
    /**
     * Check support for each feature
     */
    function checkFeatures() {
        featureSupport = {
            serviceWorker: 'serviceWorker' in navigator,
            indexedDB: 'indexedDB' in window,
            geolocation: 'geolocation' in navigator,
            webBluetooth: 'bluetooth' in navigator,
            webSerial: 'serial' in navigator,
            barometer: 'Barometer' in window,
            notifications: 'Notification' in window,
            wakeLock: 'wakeLock' in navigator,
            canvas: !!document.createElement('canvas').getContext,
            fetch: 'fetch' in window,
            localStorage: 'localStorage' in window
        };
        
        return featureSupport;
    }
    
    /**
     * Determine overall compatibility level
     */
    function determineCompatibility() {
        if (!browserInfo) detectBrowser();
        if (Object.keys(featureSupport).length === 0) checkFeatures();
        
        // Check required features first
        const hasRequired = featureSupport.serviceWorker && 
                           featureSupport.indexedDB && 
                           featureSupport.geolocation;
        
        if (!hasRequired) {
            compatibilityLevel = 'unsupported';
            return compatibilityLevel;
        }
        
        // Full support: Chrome on Android with all features
        if (browserInfo.isChrome && browserInfo.isAndroid &&
            featureSupport.webBluetooth && featureSupport.webSerial) {
            compatibilityLevel = 'full';
            return compatibilityLevel;
        }
        
        // Partial support: Has some advanced features
        if (featureSupport.webBluetooth || featureSupport.webSerial) {
            compatibilityLevel = 'partial';
            return compatibilityLevel;
        }
        
        // Limited support: Only basic features
        compatibilityLevel = 'limited';
        return compatibilityLevel;
    }
    
    /**
     * Get compatibility summary
     */
    function getSummary() {
        if (!browserInfo) detectBrowser();
        if (Object.keys(featureSupport).length === 0) checkFeatures();
        if (compatibilityLevel === 'unknown') determineCompatibility();
        
        const supported = [];
        const unsupported = [];
        
        for (const [key, feature] of Object.entries(FEATURES)) {
            if (featureSupport[key]) {
                supported.push({ key, ...feature });
            } else {
                unsupported.push({ key, ...feature });
            }
        }
        
        return {
            browser: browserInfo,
            level: compatibilityLevel,
            supported,
            unsupported,
            recommendation: getRecommendation()
        };
    }
    
    /**
     * Get recommendation based on current browser
     */
    function getRecommendation() {
        if (!browserInfo) detectBrowser();
        
        if (compatibilityLevel === 'full') {
            return {
                status: 'optimal',
                icon: '✅',
                title: 'Fully Compatible',
                message: 'Your browser supports all GridDown features.',
                action: null
            };
        }
        
        if (compatibilityLevel === 'unsupported') {
            return {
                status: 'unsupported',
                icon: '❌',
                title: 'Browser Not Supported',
                message: 'Please use a modern browser with offline support.',
                action: 'Use Chrome, Edge, or Safari'
            };
        }
        
        if (browserInfo.isIOS) {
            return {
                status: 'limited',
                icon: '⚠️',
                title: 'Limited on iOS',
                message: 'iOS Safari restricts Bluetooth and Serial access. Core mapping works, but hardware integrations (Meshtastic, APRS, sensors) are unavailable.',
                action: 'For full features, use Chrome on Android'
            };
        }
        
        if (browserInfo.isFirefox) {
            return {
                status: 'limited',
                icon: '⚠️',
                title: 'Limited on Firefox',
                message: 'Firefox does not support Web Bluetooth or Web Serial. Hardware integrations are unavailable.',
                action: 'For full features, use Chrome'
            };
        }
        
        if (browserInfo.isSafari && !browserInfo.isIOS) {
            return {
                status: 'limited',
                icon: '⚠️',
                title: 'Limited on Safari',
                message: 'Safari has limited Web Bluetooth support and no Web Serial. Some hardware features unavailable.',
                action: 'For full features, use Chrome'
            };
        }
        
        if (browserInfo.isChrome && !browserInfo.isMobile) {
            return {
                status: 'partial',
                icon: '🔶',
                title: 'Partial Support',
                message: 'Chrome Desktop supports Bluetooth and Serial, but barometer sensor requires a mobile device.',
                action: 'For field use, install on Android device'
            };
        }
        
        if (browserInfo.isSamsungInternet) {
            return {
                status: 'partial',
                icon: '🔶',
                title: 'Partial Support',
                message: 'Samsung Internet has good PWA support but limited Web Bluetooth.',
                action: 'For best results, use Chrome'
            };
        }
        
        return {
            status: 'partial',
            icon: '🔶',
            title: 'Partial Support',
            message: 'Some advanced features may be unavailable.',
            action: 'For full features, use Chrome on Android'
        };
    }

    // ==================== UI ====================
    
    /**
     * Check if banner should be shown
     */
    function shouldShowBanner() {
        try {
            const dismissed = localStorage.getItem(STORAGE_KEY);
            const version = localStorage.getItem(STORAGE_KEY_VERSION);
            
            // Show if never dismissed or version changed
            if (!dismissed || version !== CURRENT_COMPAT_VERSION) {
                return true;
            }
            
            return false;
        } catch (e) {
            return true; // Show if localStorage fails
        }
    }
    
    /**
     * Dismiss the banner
     */
    function dismissBanner() {
        try {
            localStorage.setItem(STORAGE_KEY, 'true');
            localStorage.setItem(STORAGE_KEY_VERSION, CURRENT_COMPAT_VERSION);
        } catch (e) {
            console.warn('Failed to save dismissal:', e);
        }
        
        const banner = document.getElementById('compat-banner');
        if (banner) {
            banner.style.animation = 'slideUp 0.3s ease-out forwards';
            setTimeout(() => banner.remove(), 300);
        }
    }
    
    /**
     * Show compatibility banner
     */
    function showBanner() {
        if (!shouldShowBanner()) return;
        
        const summary = getSummary();
        const rec = summary.recommendation;
        
        // Don't show banner for full compatibility
        if (summary.level === 'full') return;
        
        // Create banner element
        const banner = document.createElement('div');
        banner.id = 'compat-banner';
        banner.innerHTML = `
            <style>
                #compat-banner {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                    border-top: 1px solid rgba(255,255,255,0.1);
                    padding: 16px;
                    z-index: 10000;
                    animation: slideIn 0.3s ease-out;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                
                @keyframes slideIn {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                
                @keyframes slideUp {
                    from { transform: translateY(0); opacity: 1; }
                    to { transform: translateY(100%); opacity: 0; }
                }
                
                #compat-banner .banner-content {
                    max-width: 600px;
                    margin: 0 auto;
                }
                
                #compat-banner .banner-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 8px;
                }
                
                #compat-banner .banner-icon {
                    font-size: 24px;
                }
                
                #compat-banner .banner-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: ${rec.status === 'limited' ? '#fbbf24' : rec.status === 'unsupported' ? '#ef4444' : '#60a5fa'};
                }
                
                #compat-banner .banner-browser {
                    font-size: 11px;
                    color: rgba(255,255,255,0.5);
                    margin-left: auto;
                }
                
                #compat-banner .banner-message {
                    font-size: 13px;
                    color: rgba(255,255,255,0.8);
                    line-height: 1.5;
                    margin-bottom: 12px;
                }
                
                #compat-banner .banner-features {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                
                #compat-banner .feature-tag {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                }
                
                #compat-banner .feature-tag.supported {
                    background: rgba(34,197,94,0.15);
                    color: #22c55e;
                }
                
                #compat-banner .feature-tag.unsupported {
                    background: rgba(239,68,68,0.15);
                    color: #ef4444;
                }
                
                #compat-banner .banner-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                
                #compat-banner .banner-btn {
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 500;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                #compat-banner .banner-btn-primary {
                    background: #3b82f6;
                    color: white;
                }
                
                #compat-banner .banner-btn-primary:hover {
                    background: #2563eb;
                }
                
                #compat-banner .banner-btn-secondary {
                    background: rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.8);
                }
                
                #compat-banner .banner-btn-secondary:hover {
                    background: rgba(255,255,255,0.15);
                }
                
                #compat-banner .banner-details {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    display: none;
                }
                
                #compat-banner .banner-details.show {
                    display: block;
                }
            </style>
            
            <div class="banner-content">
                <div class="banner-header">
                    <span class="banner-icon">${rec.icon}</span>
                    <span class="banner-title">${rec.title}</span>
                    <span class="banner-browser">${summary.browser.browser} on ${summary.browser.os}</span>
                </div>
                
                <div class="banner-message">${rec.message}</div>
                
                <div class="banner-features">
                    ${summary.unsupported.filter(f => !f.required).slice(0, 4).map(f => `
                        <span class="feature-tag unsupported">
                            <span>${f.icon}</span>
                            <span>${f.name}</span>
                            <span>✗</span>
                        </span>
                    `).join('')}
                </div>
                
                <div class="banner-actions">
                    <button class="banner-btn banner-btn-secondary" id="compat-dismiss">
                        Continue Anyway
                    </button>
                    <button class="banner-btn banner-btn-secondary" id="compat-details-toggle">
                        Show Details
                    </button>
                </div>
                
                <div class="banner-details" id="compat-details">
                    <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:rgba(255,255,255,0.7)">Feature Support</div>
                    <div class="banner-features">
                        ${summary.supported.map(f => `
                            <span class="feature-tag supported">
                                <span>${f.icon}</span>
                                <span>${f.name}</span>
                                <span>✓</span>
                            </span>
                        `).join('')}
                        ${summary.unsupported.map(f => `
                            <span class="feature-tag unsupported">
                                <span>${f.icon}</span>
                                <span>${f.name}</span>
                                <span>✗</span>
                            </span>
                        `).join('')}
                    </div>
                    ${rec.action ? `
                        <div style="margin-top:12px;padding:10px;background:rgba(59,130,246,0.1);border-radius:6px;font-size:12px;color:#60a5fa">
                            💡 ${rec.action}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Event handlers
        document.getElementById('compat-dismiss').onclick = dismissBanner;
        
        document.getElementById('compat-details-toggle').onclick = () => {
            const details = document.getElementById('compat-details');
            const btn = document.getElementById('compat-details-toggle');
            if (details.classList.contains('show')) {
                details.classList.remove('show');
                btn.textContent = 'Show Details';
            } else {
                details.classList.add('show');
                btn.textContent = 'Hide Details';
            }
        };
    }
    
    /**
     * Show feature-specific warning modal
     */
    function showFeatureWarning(featureKey) {
        const feature = FEATURES[featureKey];
        if (!feature || featureSupport[featureKey]) return;
        
        const rec = getRecommendation();
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'compat-modal';
        modal.innerHTML = `
            <style>
                #compat-modal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    padding: 20px;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                
                #compat-modal .modal-content {
                    background: #1e293b;
                    border-radius: 16px;
                    max-width: 400px;
                    width: 100%;
                    padding: 24px;
                    animation: modalIn 0.2s ease-out;
                }
                
                @keyframes modalIn {
                    from { transform: scale(0.9); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                
                #compat-modal .modal-icon {
                    font-size: 48px;
                    text-align: center;
                    margin-bottom: 16px;
                }
                
                #compat-modal .modal-title {
                    font-size: 18px;
                    font-weight: 600;
                    text-align: center;
                    margin-bottom: 8px;
                    color: #fbbf24;
                }
                
                #compat-modal .modal-message {
                    font-size: 14px;
                    color: rgba(255,255,255,0.8);
                    text-align: center;
                    line-height: 1.5;
                    margin-bottom: 16px;
                }
                
                #compat-modal .modal-browser {
                    padding: 12px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                
                #compat-modal .modal-browser-label {
                    font-size: 10px;
                    color: rgba(255,255,255,0.5);
                    margin-bottom: 4px;
                }
                
                #compat-modal .modal-browser-value {
                    font-size: 13px;
                    color: rgba(255,255,255,0.8);
                }
                
                #compat-modal .modal-rec {
                    padding: 12px;
                    background: rgba(59,130,246,0.1);
                    border-radius: 8px;
                    font-size: 13px;
                    color: #60a5fa;
                    text-align: center;
                    margin-bottom: 16px;
                }
                
                #compat-modal .modal-btn {
                    width: 100%;
                    padding: 12px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    border: none;
                    cursor: pointer;
                    background: #3b82f6;
                    color: white;
                }
                
                #compat-modal .modal-btn:hover {
                    background: #2563eb;
                }
            </style>
            
            <div class="modal-content">
                <div class="modal-icon">${feature.icon}</div>
                <div class="modal-title">${feature.name} Not Available</div>
                <div class="modal-message">
                    This feature requires ${featureKey === 'webBluetooth' ? 'Web Bluetooth API' : 
                                          featureKey === 'webSerial' ? 'Web Serial API' :
                                          featureKey === 'barometer' ? 'Barometer Sensor API' : 
                                          'an API'} which is not supported by your current browser.
                </div>
                
                <div class="modal-browser">
                    <div class="modal-browser-label">YOUR BROWSER</div>
                    <div class="modal-browser-value">${browserInfo.browser} ${browserInfo.version} on ${browserInfo.os}</div>
                </div>
                
                ${rec.action ? `
                    <div class="modal-rec">💡 ${rec.action}</div>
                ` : ''}
                
                <button class="modal-btn" id="compat-modal-close">Got It</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close handlers
        document.getElementById('compat-modal-close').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }
    
    /**
     * Check if a specific feature is supported and show warning if not
     * Returns true if supported, false if not
     */
    function requireFeature(featureKey, showWarning = true) {
        if (Object.keys(featureSupport).length === 0) checkFeatures();
        
        const supported = featureSupport[featureKey];
        
        if (!supported && showWarning) {
            showFeatureWarning(featureKey);
        }
        
        return supported;
    }

    // ==================== INITIALIZATION ====================
    
    /**
     * Initialize the module
     */
    function init() {
        if (isInitialized) return;
        
        detectBrowser();
        checkFeatures();
        determineCompatibility();
        
        isInitialized = true;
        
        console.log('CompatibilityModule initialized:', {
            browser: `${browserInfo.browser} ${browserInfo.version}`,
            os: browserInfo.os,
            level: compatibilityLevel
        });
        
        // Show banner after short delay (let app load first)
        setTimeout(() => {
            showBanner();
        }, 1000);
        
        return true;
    }

    // ==================== PUBLIC API ====================
    
    return {
        init,
        
        // Detection
        detectBrowser,
        checkFeatures,
        getSummary,
        getRecommendation,
        
        // State
        getBrowserInfo: () => ({ ...browserInfo }),
        getFeatureSupport: () => ({ ...featureSupport }),
        getCompatibilityLevel: () => compatibilityLevel,
        isSupported: (feature) => featureSupport[feature] || false,
        
        // UI
        showBanner,
        dismissBanner,
        showFeatureWarning,
        requireFeature,
        
        // Reset (for testing)
        reset: () => {
            try {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(STORAGE_KEY_VERSION);
            } catch (e) {}
        }
    };
})();

if (typeof window !== 'undefined') {
    window.CompatibilityModule = CompatibilityModule;
}
