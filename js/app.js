/**
 * GridDown PWA - Main Application Entry Point
 */
const App = (function() {
    'use strict';
    
    // App-level scoped event manager
    let appEvents = null;

    async function init() {
        // Install log-level controller first (silences debug output in production)
        if (typeof Log !== 'undefined') {
            Log.init();
        }
        
        // Install global error boundary before anything else
        if (typeof ErrorBoundary !== 'undefined') {
            ErrorBoundary.init();
        }
        
        console.log('GridDown initializing...');
        updateLoadingStatus('Loading storage...');

        try {
            // Create app-level event manager
            appEvents = EventManager.createScopedManager(EventManager.SCOPES.APP);
            
            // Initialize storage
            await Storage.init();
            
            // Request persistent storage to prevent OS from evicting cached map tiles
            if (navigator.storage && navigator.storage.persist) {
                try {
                    const persisted = await navigator.storage.persist();
                    console.log(`Persistent storage: ${persisted ? 'granted' : 'denied'}`);
                } catch (e) {
                    // Non-critical — gracefully degrade
                }
            }
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
            
            // Initialize storage monitor
            if (typeof StorageMonitorModule !== 'undefined') {
                StorageMonitorModule.init();
                console.log('Storage monitor initialized');
            }
            
            // Initialize network quality monitor
            if (typeof NetworkQualityModule !== 'undefined') {
                NetworkQualityModule.init();
                console.log('Network quality module initialized');
            }
            
            updateLoadingStatus('Rendering UI...');

            // Initialize modules
            SidebarModule.init();
            MapModule.init();
            PanelsModule.init();
            ModalsModule.init();
            await ElevationModule.init();
            
            // Initialize hiking module (time estimates, daylight tracking)
            if (typeof HikingModule !== 'undefined') {
                HikingModule.init();
            }
            
            await OfflineModule.init();
            await GPSModule.init();
            WeatherModule.init();
            
            // Initialize alert system
            if (typeof AlertModule !== 'undefined') {
                AlertModule.init();
            }
            
            // Initialize air quality module
            if (typeof AirQualityModule !== 'undefined') {
                AirQualityModule.init();
            }
            
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
            CelestialModule.init();
            
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
                
                // Traceroute events — refresh team panel to update widget
                Events.on('meshtastic:traceroute_complete', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                Events.on('meshtastic:traceroute_timeout', () => {
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
            
            // Initialize Team module (after Meshtastic so mesh event handlers work)
            if (typeof TeamModule !== 'undefined') {
                try {
                    await TeamModule.init();
                    console.log('Team module initialized');
                } catch (e) {
                    console.warn('Team module init failed:', e);
                }
            }
            
            // Initialize CoT Bridge module (TAKModule)
            if (typeof TAKModule !== 'undefined') {
                TAKModule.init();
                console.log('CoT Bridge module initialized');
                
                // Setup event listeners to refresh panels on CoT events
                Events.on('tak:connection_changed', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('tak:positions_updated', () => {
                    if (State.get('activePanel') === 'team') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('tak:markers_updated', () => {
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
            
            // Initialize AtlasRF module
            if (typeof AtlasRFModule !== 'undefined') {
                AtlasRFModule.init();
                console.log('AtlasRF module initialized');
                
                // Setup event listeners for AtlasRF events
                Events.on('atlasrf:connecting', () => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('atlasrf:connected', () => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('atlasrf:disconnected', () => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                    MapModule.render();
                });
                
                Events.on('atlasrf:error', () => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('atlasrf:track:new', () => {
                    MapModule.render();
                });
                
                // Throttled panel re-render for track updates.
                // Track batches arrive every ~500ms from atlasrf.js EventBus,
                // but renderAtlasRF() rebuilds entire panel HTML via template
                // literals. 2-second throttle keeps counts feeling live without
                // DOM thrashing on constrained hardware (Pi, tablets).
                let rfPanelRenderTimer = null;
                const throttledRFPanelRender = () => {
                    if (rfPanelRenderTimer) return;
                    rfPanelRenderTimer = setTimeout(() => {
                        rfPanelRenderTimer = null;
                        if (State.get('activePanel') === 'atlasrf') {
                            PanelsModule.render();
                        }
                    }, 2000);
                };
                
                Events.on('atlasrf:track:new', throttledRFPanelRender);
                Events.on('atlasrf:track:update', throttledRFPanelRender);
                Events.on('atlasrf:track:batch', throttledRFPanelRender);
                Events.on('atlasrf:track:lost', throttledRFPanelRender);
                
                Events.on('atlasrf:emergency:squawk', (data) => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                    // Route emergency squawk to GridDown alert system
                    if (typeof AlertModule !== 'undefined') {
                        const info = data.info || {};
                        AlertModule.trigger({
                            source: 'atlasrf',
                            severity: info.severity === 'critical' ? 'emergency' : 'critical',
                            title: `Squawk ${data.squawk || '????'} (${info.name || 'EMERGENCY'})`,
                            message: `Aircraft: ${data.track?.callsign || data.track?.id?.slice(0, 10) || 'Unknown'}`,
                            persistent: true,
                            sound: true,
                            data: data
                        });
                    }
                });
                
                Events.on('atlasrf:emergency:ais', (data) => {
                    if (State.get('activePanel') === 'atlasrf') {
                        PanelsModule.render();
                    }
                    // Route AIS emergency to GridDown alert system
                    if (typeof AlertModule !== 'undefined') {
                        AlertModule.trigger({
                            source: 'atlasrf',
                            severity: 'emergency',
                            title: `AIS ${data.deviceType || 'Emergency'} Device`,
                            message: `MMSI: ${data.track?.mmsi || 'Unknown'}`,
                            persistent: true,
                            sound: true,
                            data: data
                        });
                    }
                });
                
                // Route AtlasRF general alerts to GridDown alert system
                Events.on('atlasrf:alert', (data) => {
                    if (typeof AlertModule !== 'undefined') {
                        const severityMap = { critical: 'critical', high: 'warning', medium: 'caution', low: 'info' };
                        AlertModule.trigger({
                            source: 'atlasrf',
                            severity: severityMap[data.severity] || 'info',
                            title: data.title || data.type || 'AtlasRF Alert',
                            message: data.message || data.description || '',
                            persistent: data.severity === 'critical',
                            sound: data.severity === 'critical' || data.severity === 'high',
                            data: data
                        });
                    }
                });
                
                // Route AtlasRF correlation events to alert system (non-compliant drones)
                Events.on('atlasrf:correlation:new', (data) => {
                    if (data.non_compliant && typeof AlertModule !== 'undefined') {
                        AlertModule.trigger({
                            source: 'atlasrf',
                            severity: 'warning',
                            title: 'Non-Compliant Drone Detected',
                            message: data.description || `Drone without Remote ID at ${data.distance_nm || '?'} nm`,
                            persistent: false,
                            sound: true,
                            data: data
                        });
                    }
                });
                
                // Bridge FIS-B weather updates to GridDown weather module
                Events.on('atlasrf:weather:updated', (fisBData) => {
                    if (typeof WeatherModule !== 'undefined' && WeatherModule.handleAtlasRFWeather) {
                        WeatherModule.handleAtlasRFWeather(fisBData);
                    }
                });
                
                // Bridge FIS-B specific pushes  
                Events.on('atlasrf:weather:fisb', (fisBData) => {
                    if (typeof WeatherModule !== 'undefined' && WeatherModule.handleAtlasRFWeather) {
                        WeatherModule.handleAtlasRFWeather(fisBData);
                    }
                });
                
                // Bridge current weather conditions
                Events.on('atlasrf:weather:conditions', (conditions) => {
                    if (typeof WeatherModule !== 'undefined' && WeatherModule.handleAtlasRFConditions) {
                        WeatherModule.handleAtlasRFConditions(conditions);
                    }
                });
            }
            
            // Initialize SARSAT module (PLB/ELT beacon receiver)
            if (typeof SarsatModule !== 'undefined') {
                SarsatModule.init();
                console.log('SARSAT module initialized');
                
                // Setup event listeners for SARSAT events
                Events.on('sarsat:connected', () => {
                    if (State.get('activePanel') === 'sarsat') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('sarsat:disconnected', () => {
                    if (State.get('activePanel') === 'sarsat') {
                        PanelsModule.render();
                    }
                });
                
                Events.on('sarsat:beacon_received', (data) => {
                    MapModule.render();
                    if (State.get('activePanel') === 'sarsat') {
                        PanelsModule.render();
                    }
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

    return { init, destroy, getResourceStats };
})();
window.App = App;
