/**
 * GridDown PWA - Main Application Entry Point
 */
const App = (function() {
    'use strict';
    
    // App-level scoped event manager
    let appEvents = null;

    async function init() {
        console.log('GridDown initializing...');
        updateLoadingStatus('Loading storage...');

        try {
            // Create app-level event manager
            appEvents = EventManager.createScopedManager(EventManager.SCOPES.APP);
            
            // Initialize storage
            await Storage.init();
            updateLoadingStatus('Loading data...');

            // Initialize state
            await State.init();
            
            // Load coordinate format preference
            if (typeof Coordinates !== 'undefined') {
                await Coordinates.loadPreference();
            }
            
            // Initialize browser compatibility check (early)
            if (typeof CompatibilityModule !== 'undefined') {
                CompatibilityModule.init();
                console.log('Compatibility module initialized');
            }
            
            // Initialize network status monitoring (early)
            if (typeof NetworkStatusModule !== 'undefined') {
                NetworkStatusModule.init();
                console.log('Network status module initialized');
            }
            
            // Initialize update checker (early)
            if (typeof UpdateModule !== 'undefined') {
                UpdateModule.init();
                console.log('Update module initialized');
            }
            
            updateLoadingStatus('Rendering UI...');

            // Initialize modules
            SidebarModule.init();
            MapModule.init();
            PanelsModule.init();
            ModalsModule.init();
            await ElevationModule.init();
            await OfflineModule.init();
            await GPSModule.init();
            WeatherModule.init();
            
            // Initialize satellite weather imagery module
            if (typeof SatWeatherModule !== 'undefined') {
                SatWeatherModule.init();
            }
            
            // Initialize RF Line-of-Sight analysis module
            if (typeof RFLOSModule !== 'undefined') {
                RFLOSModule.init();
            }
            
            ContingencyModule.init();
            MeasureModule.init();
            SunMoonModule.init();
            
            // Initialize history/undo system
            if (typeof HistoryModule !== 'undefined') {
                HistoryModule.initKeyboardShortcuts();
                console.log('History module initialized');
            }
            
            // Initialize undo/redo module
            if (typeof UndoModule !== 'undefined') {
                UndoModule.init();
                console.log('Undo module initialized (Ctrl+Z to undo, Ctrl+Shift+Z to redo)');
            }
            
            // Initialize communication plan module
            if (typeof CommPlanModule !== 'undefined') {
                await CommPlanModule.init();
            }
            
            // Initialize navigation module
            if (typeof NavigationModule !== 'undefined') {
                await NavigationModule.init();
            }
            
            // Initialize night mode module
            if (typeof NightModeModule !== 'undefined') {
                await NightModeModule.init();
            }
            
            // Initialize SOS/Emergency module
            if (typeof SOSModule !== 'undefined') {
                await SOSModule.init();
            }
            
            // Initialize Radio Reference module
            if (typeof RadioModule !== 'undefined') {
                await RadioModule.init();
            }
            
            // Initialize Medical Reference module
            if (typeof MedicalModule !== 'undefined') {
                MedicalModule.init();
                console.log('Medical reference module initialized');
            }
            
            // Initialize Field Guides module
            if (typeof FieldGuidesModule !== 'undefined') {
                FieldGuidesModule.init();
                console.log('Field guides module initialized');
            }
            
            // Initialize Stream Gauge module
            if (typeof StreamGaugeModule !== 'undefined') {
                StreamGaugeModule.init();
                console.log('Stream gauge module initialized');
            }
            
            // Initialize Barometer module
            if (typeof BarometerModule !== 'undefined') {
                BarometerModule.init();
                console.log('Barometer module initialized');
            }
            
            // Initialize Meshtastic module
            if (typeof MeshtasticModule !== 'undefined') {
                MeshtasticModule.init();
                console.log('Meshtastic module initialized');
                
                // Setup event listeners to refresh Team panel on mesh events
                Events.on('meshtastic:connection', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('meshtastic:position', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                    // Also refresh map to show team positions
                    MapModule.render();
                });
                
                Events.on('meshtastic:messages_updated', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('meshtastic:waypoint', () => {
                    // Refresh waypoints panel if visible
                    if (State.get('activePanel') === 'waypoints') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('meshtastic:route', () => {
                    // Refresh routes panel if visible
                    if (State.get('activePanel') === 'routes') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('meshtastic:sos_received', (data) => {
                    // Show prominent SOS alert
                    alert(`🆘 EMERGENCY SOS FROM ${data.message?.fromName || 'Unknown'}!\n\nCheck the map for their location.`);
                    MapModule.render();
                });
            }
            
            // Initialize APRS module
            if (typeof APRSModule !== 'undefined') {
                APRSModule.init();
                console.log('APRS module initialized');
                
                // Setup event listeners to refresh panels on APRS events
                Events.on('aprs:connection', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('aprs:position', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('aprs:packet', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('aprs:station', () => {
                    MapModule.render();
                });
            }
            
            // Initialize Global Search module
            if (typeof SearchModule !== 'undefined') {
                SearchModule.init();
                console.log('Search module initialized (Ctrl+K to search)');
            }
            
            // Initialize Onboarding module (shows tour on first run)
            if (typeof OnboardingModule !== 'undefined') {
                await OnboardingModule.init();
                console.log('Onboarding module initialized');
            }

            // Setup auto-save with tracked interval
            appEvents.setInterval(() => State.persist(), 30000);
            
            // Setup background sync event listeners
            setupSyncListeners();
            
            // Setup service worker update listener
            setupServiceWorkerListener();

            // Hide loading screen
            setTimeout(() => {
                document.getElementById('loading-screen').classList.add('loading-screen--hidden');
                State.UI.setLoading(false);
                Events.emit(Events.EVENTS.APP_READY);
                console.log('GridDown ready!');
            }, 500);

        } catch (error) {
            console.error('Initialization failed:', error);
            updateLoadingStatus('Error: ' + error.message);
        }
    }

    function updateLoadingStatus(text) {
        const el = document.getElementById('loading-status');
        if (el) el.textContent = text;
    }
    
    /**
     * Setup listener for service worker messages (updates, etc.)
     */
    function setupServiceWorkerListener() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_UPDATED') {
                    console.log('Service worker updated to:', event.data.version);
                    // Show update notification
                    showUpdateNotification();
                }
            });
            
            // Also detect when a new service worker is waiting
            navigator.serviceWorker.ready.then(registration => {
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available
                                console.log('New app version available');
                                showUpdateNotification();
                            }
                        });
                    }
                });
            });
        }
    }
    
    /**
     * Show notification that app has been updated
     */
    function showUpdateNotification() {
        // Create update banner
        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #f97316, #ea580c);
            color: white;
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: inherit;
            font-size: 14px;
        `;
        banner.innerHTML = `
            <span>🔄 App updated!</span>
            <button id="refresh-btn" style="
                background: white;
                color: #ea580c;
                border: none;
                padding: 6px 14px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
            ">Refresh Now</button>
            <button id="dismiss-btn" style="
                background: transparent;
                color: white;
                border: 1px solid rgba(255,255,255,0.4);
                padding: 6px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
            ">Later</button>
        `;
        document.body.appendChild(banner);
        
        document.getElementById('refresh-btn').onclick = () => {
            window.location.reload();
        };
        
        document.getElementById('dismiss-btn').onclick = () => {
            banner.remove();
        };
        
        // Auto-dismiss after 30 seconds
        setTimeout(() => {
            if (document.getElementById('update-banner')) {
                banner.remove();
            }
        }, 30000);
    }
    
    /**
     * Setup listeners for background sync events from service worker
     */
    function setupSyncListeners() {
        // Listen for sync progress updates
        Events.on('offline:syncProgress', (data) => {
            console.log('Sync progress:', data);
            // Refresh offline panel if visible
            if (State.get('activePanel') === 'offline') {
                PanelsModule.render();
            }
        });
        
        // Listen for sync completion
        Events.on('offline:syncComplete', (data) => {
            console.log('Sync complete:', data);
            if (data.errors > 0) {
                ModalsModule.showToast(
                    `Download complete: ${data.downloaded.toLocaleString()} tiles (${data.errors} failed)`, 
                    'warning'
                );
            } else {
                ModalsModule.showToast(
                    `Download complete: ${data.downloaded.toLocaleString()} tiles`, 
                    'success'
                );
            }
            // Refresh offline panel
            if (State.get('activePanel') === 'offline') {
                PanelsModule.render();
            }
        });
        
        // Listen for sync errors
        Events.on('offline:syncError', (data) => {
            console.error('Sync error:', data);
            ModalsModule.showToast('Background download failed: ' + data.error, 'error');
        });
        
        // Listen for pending sync notification (on app start)
        Events.on('offline:pendingSync', (data) => {
            console.log('Pending sync found:', data);
            // Show a toast offering to resume
            ModalsModule.showToast(
                `Resuming download: "${data.regionName}" (${data.remaining.toLocaleString()} tiles remaining)`, 
                'info'
            );
        });
    }
    
    /**
     * Cleanup all app resources
     * Useful for testing or when unloading the app
     */
    function destroy() {
        console.log('GridDown shutting down...');
        
        // Clear app-level event listeners and intervals
        if (appEvents) {
            appEvents.clear();
            appEvents = null;
        }
        
        // Destroy modules in reverse order
        if (typeof SearchModule !== 'undefined') SearchModule.destroy?.();
        if (typeof OnboardingModule !== 'undefined') OnboardingModule.destroy?.();
        if (typeof MapModule !== 'undefined') MapModule.destroy?.();
        if (typeof NavigationModule !== 'undefined') NavigationModule.destroy?.();
        if (typeof MeshtasticModule !== 'undefined') MeshtasticModule.destroy?.();
        if (typeof APRSModule !== 'undefined') APRSModule.destroy?.();
        
        // Clear all remaining EventManager scopes
        EventManager.clearAll();
        
        console.log('GridDown destroyed');
    }
    
    /**
     * Get stats about tracked event listeners and resources
     * Useful for debugging memory leaks
     */
    function getResourceStats() {
        return EventManager.getStats();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, destroy, getResourceStats, showUpdateNotification };
})();
window.App = App;
