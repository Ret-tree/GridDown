/**
 * GridDown Global Search Module
 * Quick search across waypoints, routes, team members, frequencies, and more
 * Keyboard-driven with fuzzy matching support
 */
const SearchModule = (function() {
    'use strict';

    // Search configuration
    const CONFIG = {
        minQueryLength: 1,
        maxResults: 20,
        debounceMs: 150,
        recentSearchesMax: 10
    };

    // Search categories with icons and colors
    const CATEGORIES = {
        action: {
            id: 'action',
            name: 'Actions',
            icon: '⚡',
            color: '#22c55e',
            shortcut: 'a'
        },
        celestial: {
            id: 'celestial',
            name: 'Celestial',
            icon: '⭐',
            color: '#fbbf24',
            shortcut: 's'
        },
        landmark: {
            id: 'landmark',
            name: 'Landmarks',
            icon: '🏔️',
            color: '#8b5cf6',
            shortcut: 'l'
        },
        waypoint: {
            id: 'waypoint',
            name: 'Waypoints',
            icon: '📍',
            color: '#f97316',
            shortcut: 'w'
        },
        route: {
            id: 'route',
            name: 'Routes',
            icon: '🛣️',
            color: '#3b82f6',
            shortcut: 'r'
        },
        team: {
            id: 'team',
            name: 'Team Members',
            icon: '👥',
            color: '#22c55e',
            shortcut: 't'
        },
        frequency: {
            id: 'frequency',
            name: 'Radio Frequencies',
            icon: '📻',
            color: '#8b5cf6',
            shortcut: 'f'
        },
        location: {
            id: 'location',
            name: 'Coordinates',
            icon: '🎯',
            color: '#ec4899',
            shortcut: 'c'
        },
        help: {
            id: 'help',
            name: 'Help',
            icon: '❓',
            color: '#06b6d4',
            shortcut: 'h'
        },
        settings: {
            id: 'settings',
            name: 'Settings',
            icon: '⚙️',
            color: '#6b7280',
            shortcut: 'g'
        }
    };

    // Help topics searchable in the app
    const HELP_TOPICS = [
        // Navigation & GPS
        { id: 'help-gps', name: 'GPS & Location', keywords: ['gps', 'location', 'position', 'coordinates', 'accuracy'], icon: '📍', description: 'How GPS positioning works in GridDown', content: 'GridDown uses your device GPS for positioning. In GPS-denied environments, use celestial navigation or rangefinder resection.', panel: 'gps' },
        { id: 'help-offline', name: 'Offline Maps', keywords: ['offline', 'maps', 'download', 'cache', 'tiles'], icon: '🗺️', description: 'Download maps for offline use', content: 'Download map tiles before going off-grid. Select regions and download for offline access.', panel: 'offline' },
        { id: 'help-navigation', name: 'Route Navigation', keywords: ['navigation', 'route', 'navigate', 'directions', 'turn'], icon: '🧭', description: 'Navigate along a route', content: 'Create a route, then tap Start Navigation. Follow turn-by-turn guidance with distance and bearing.', panel: 'navigation' },
        
        // Celestial Navigation
        { id: 'help-celestial', name: 'Celestial Navigation', keywords: ['celestial', 'stars', 'navigation', 'sextant', 'astronomy'], icon: '⭐', description: 'Navigate using stars and celestial bodies', content: 'Use the star chart, camera sextant, and noon sight tools to determine position without GPS.', panel: 'celestial' },
        { id: 'help-star-id', name: 'Star Identification', keywords: ['star', 'identify', 'recognition', 'constellation'], icon: '✨', description: 'Identify stars using your camera', content: 'Point camera at sky, tap a star to identify it. Works offline using built-in star catalog.', panel: 'celestial' },
        { id: 'help-resection', name: 'Rangefinder Resection', keywords: ['resection', 'rangefinder', 'triangulation', 'position', 'fix'], icon: '📐', description: 'Determine position using known landmarks', content: 'Take bearings to 2-3 known landmarks (peaks, towers) to calculate your position without GPS.', panel: 'navigation' },
        
        // Communication
        { id: 'help-radio', name: 'Radio Frequencies', keywords: ['radio', 'frequency', 'channel', 'communication', 'ham'], icon: '📻', description: 'Managing radio frequencies', content: 'Store and organize radio frequencies for your team. Supports ham, GMRS, FRS, MURS bands.', panel: 'radio' },
        { id: 'help-meshtastic', name: 'Meshtastic Integration', keywords: ['meshtastic', 'mesh', 'lora', 'radio', 'messaging'], icon: '📡', description: 'Connect to Meshtastic mesh network', content: 'Connect via Bluetooth to share positions and messages over LoRa mesh network.', panel: 'team' },
        { id: 'help-aprs', name: 'APRS Tracking', keywords: ['aprs', 'packet', 'amateur', 'tracking'], icon: '📶', description: 'Amateur radio position reporting', content: 'View APRS stations and send position reports (requires amateur radio license).', panel: 'team' },
        
        // Emergency
        { id: 'help-sos', name: 'Emergency SOS', keywords: ['sos', 'emergency', 'help', 'rescue', 'distress'], icon: '🆘', description: 'Send emergency distress signal', content: 'Activate SOS to flash screen/light, sound alarm, and prepare emergency message with coordinates.', panel: 'sos' },
        { id: 'help-sarsat', name: 'SARSAT Beacons', keywords: ['sarsat', 'beacon', 'elt', 'plb', 'epirb', 'emergency'], icon: '🔔', description: 'Detect emergency beacons', content: 'With SDR hardware, detect 406 MHz emergency beacon signals from ELTs, PLBs, and EPIRBs.', panel: 'sarsat' },
        
        // Tools
        { id: 'help-measure', name: 'Distance Measurement', keywords: ['measure', 'distance', 'length', 'ruler'], icon: '📏', description: 'Measure distances on the map', content: 'Tap Measure tool, then tap points on map to measure distance. Shows both metric and imperial.', panel: 'map' },
        { id: 'help-bearing', name: 'Compass Bearing', keywords: ['bearing', 'compass', 'direction', 'azimuth', 'heading'], icon: '🧭', description: 'Get compass bearing to a point', content: 'Tap a waypoint or map location to see bearing and distance from your position.', panel: 'gps' },
        { id: 'help-waypoints', name: 'Waypoints', keywords: ['waypoint', 'marker', 'point', 'save', 'location'], icon: '📍', description: 'Create and manage waypoints', content: 'Tap map to add waypoint, or use search to create at specific coordinates. Organize by type and color.', panel: 'waypoints' },
        
        // Weather
        { id: 'help-weather', name: 'Weather Information', keywords: ['weather', 'forecast', 'temperature', 'conditions', 'wind', 'rain', 'snow'], icon: '🌤️', description: 'View weather forecasts and conditions', content: 'Weather data from Open-Meteo when online. Shows current conditions, 7-day forecast, hourly data, wind, dewpoint, UV index, and route weather analysis.', panel: 'weather' },
        { id: 'help-barometer', name: 'Barometer', keywords: ['barometer', 'pressure', 'altitude', 'weather', 'storm', 'altimeter'], icon: '🌡️', description: 'Track atmospheric pressure and barometric altitude', content: 'Monitor pressure trends to predict weather changes. Also provides barometric altitude more accurate than GPS.', panel: 'gps' },
        { id: 'help-wind', name: 'Wind Indicator', keywords: ['wind', 'direction', 'speed', 'gusts', 'beaufort', 'breeze', 'gale'], icon: '💨', description: 'Real-time wind conditions on map', content: 'Wind speed, direction arrow, and gust alerts displayed on the map. Color-coded by Beaufort scale. Updates when weather data is fetched.', panel: 'weather' },
        { id: 'help-dewpoint', name: 'Dewpoint & UV Index', keywords: ['dewpoint', 'dew', 'uv', 'ultraviolet', 'humidity', 'fog', 'condensation'], icon: '💧', description: 'Dewpoint and UV index readings', content: 'Dewpoint indicates fog risk and condensation potential. UV index shows sun exposure risk.', panel: 'weather' },
        { id: 'help-aqi', name: 'Air Quality', keywords: ['air', 'quality', 'aqi', 'pollution', 'smoke', 'pm2.5', 'ozone'], icon: '🌬️', description: 'EPA AirNow air quality index', content: 'AQI readings for US, Canada, and Mexico. Shows pollutant levels, health guidance, and map overlay.', panel: 'weather' },
        { id: 'help-satellite', name: 'Satellite & Radar Imagery', keywords: ['satellite', 'radar', 'nexrad', 'goes', 'imagery', 'storm', 'clouds'], icon: '🛰️', description: 'Weather satellite and radar overlays', content: 'NEXRAD radar for US precipitation, NASA VIIRS daily satellite imagery. Toggle overlays on the map.', panel: 'weather' },
        { id: 'help-streamgauge', name: 'Stream Gauges', keywords: ['stream', 'gauge', 'water', 'level', 'river', 'flow', 'usgs', 'flood'], icon: '💧', description: 'USGS real-time water level monitoring', content: 'View nearby stream gauge data including flow rate, water level, and temperature.', panel: 'weather' },
        
        // Hiking & Terrain
        { id: 'help-hiking', name: 'Hiking Mode', keywords: ['hiking', 'hike', 'trail', 'trek', 'walking', 'pace', 'naismith'], icon: '🥾', description: 'Track hikes with time and distance', content: 'Start a hike to track distance, duration, and pace. Uses Naismith and Tobler formulas for time estimates.', panel: 'navigation' },
        { id: 'help-terrain', name: 'Terrain Analysis', keywords: ['terrain', 'slope', 'elevation', 'cover', 'concealment', 'trafficability', 'site'], icon: '⛰️', description: 'Analyze terrain slope, cover, and suitability', content: 'Slope classification, trafficability assessment, solar exposure, flood risk, and cover/concealment analysis.', panel: 'terrain' },
        
        // Dead Reckoning & Inertial Nav
        { id: 'help-deadreckoning', name: 'Dead Reckoning', keywords: ['dead', 'reckoning', 'dr', 'inertial', 'pedestrian', 'step', 'imu'], icon: '📐', description: 'Navigate without GPS using step counting', content: 'Pedestrian dead reckoning uses device sensors to estimate position from last known fix.', panel: 'celestial' },
        
        // Coordinates
        { id: 'help-coords', name: 'Coordinate Converter', keywords: ['coordinate', 'convert', 'converter', 'mgrs', 'utm', 'decimal', 'dms', 'degrees'], icon: '🎯', description: 'Convert between coordinate formats', content: 'Convert between decimal degrees, DMS, UTM, and MGRS formats. Copy to clipboard or navigate to coordinates.', panel: 'coords' },
        
        // Planning & Logistics
        { id: 'help-logistics', name: 'Logistics Planning', keywords: ['logistics', 'supply', 'food', 'water', 'fuel', 'weight', 'pack', 'gear'], icon: '📦', description: 'Plan supplies and logistics', content: 'Calculate food, water, fuel, and gear requirements for trips. Weight budgets and resupply planning.', panel: 'logistics' },
        { id: 'help-contingency', name: 'Contingency Planning', keywords: ['contingency', 'planning', 'bailout', 'bail', 'emergency', 'plan', 'alternate', 'escape'], icon: '🛡️', description: 'Create contingency and bail-out plans', content: 'Define bail-out points, alternate routes, and emergency procedures for trip planning.', panel: 'contingency' },
        
        // Field References
        { id: 'help-medical', name: 'Medical Reference', keywords: ['medical', 'first', 'aid', 'injury', 'treatment', 'emergency', 'health'], icon: '🏥', description: 'Field medical reference guide', content: 'Quick reference for common field injuries and medical emergencies. Not a substitute for professional medical training.', panel: 'medical' },
        { id: 'help-fieldguides', name: 'Field Guides', keywords: ['field', 'guide', 'plant', 'animal', 'identification', 'reference', 'knots', 'survival'], icon: '📖', description: 'Offline field reference guides', content: 'Reference materials for field identification, knots, survival skills, and other outdoor knowledge.', panel: 'fieldguides' },
        
        // Hardware & SDR
        { id: 'help-sstv', name: 'SSTV Image Transmission', keywords: ['sstv', 'slow', 'scan', 'television', 'image', 'picture', 'transmit'], icon: '📺', description: 'Send and receive images over radio', content: 'Slow Scan Television for transmitting images over amateur radio. Receive, transmit, and enhance SSTV images.', panel: 'sstv' },
        { id: 'help-rfsentinel', name: 'RF Sentinel', keywords: ['rf', 'sentinel', 'spectrum', 'sdr', 'signal', 'detection', 'drone', 'fpv'], icon: '📡', description: 'RF spectrum monitoring and drone detection', content: 'Connect RF Sentinel Pro SDR hardware for spectrum monitoring. Detects FPV drone signals and other RF activity.', panel: 'rfsentinel' },
        { id: 'help-radiacode', name: 'Radiation Monitoring', keywords: ['radiation', 'radiacode', 'geiger', 'nuclear', 'dosimeter', 'cpm', 'microsievert'], icon: '☢️', description: 'RadiaCode radiation detector integration', content: 'Connect RadiaCode device via Bluetooth to monitor ambient radiation levels. Map overlay shows readings.', panel: 'team' },
        { id: 'help-tak', name: 'TAK/ATAK Bridge', keywords: ['tak', 'atak', 'wintak', 'cot', 'cursor', 'target', 'military', 'tactical'], icon: '🎖️', description: 'Cursor on Target integration', content: 'Bridge to ATAK/WinTAK tactical systems via Cursor on Target (CoT) protocol. Share positions and markers.', panel: 'team' },
        { id: 'help-compass', name: 'Compass & Declination', keywords: ['compass', 'declination', 'magnetic', 'true', 'north', 'variation'], icon: '🧭', description: 'Magnetic declination and compass corrections', content: 'GridDown calculates magnetic declination using WMM model. Displayed on the map bar. Click for details or to adjust.' },
        { id: 'help-track', name: 'Track Recording & Export', keywords: ['track', 'record', 'gpx', 'breadcrumb', 'trail', 'log', 'gps', 'trace'], icon: '📍', description: 'Record GPS tracks and export as GPX', content: 'Record your movement as a GPS track. Export as GPX file for use in other apps.', panel: 'gps' },
        { id: 'help-device-setup', name: 'Meshtastic Device Setup', keywords: ['meshtastic', 'setup', 'device', 'configure', 'bluetooth', 'lora', 'region', 'firmware'], icon: '📱', description: 'Configure new Meshtastic devices', content: 'Step-by-step wizard to set up a new Meshtastic device: name, region, modem preset, TX power. No Meshtastic app needed.', panel: 'team' },
        
        // Data
        { id: 'help-import', name: 'Import GPX/KML', keywords: ['import', 'gpx', 'kml', 'file', 'data'], icon: '📥', description: 'Import routes and waypoints', content: 'Import GPX or KML files to load routes and waypoints from other apps.', panel: 'routes' },
        { id: 'help-export', name: 'Export Data', keywords: ['export', 'save', 'backup', 'gpx', 'share'], icon: '📤', description: 'Export your data', content: 'Export waypoints and routes as GPX files to share or backup.', panel: 'routes' },
        
        // General (no panel - informational only)
        { id: 'help-keyboard', name: 'Keyboard Shortcuts', keywords: ['keyboard', 'shortcut', 'hotkey', 'keys'], icon: '⌨️', description: 'View all keyboard shortcuts', content: 'Ctrl+K: Search, N: North, G: GPS, L: Layers, M: Measure, +/-: Zoom' },
        { id: 'help-night-mode', name: 'Night Mode', keywords: ['night', 'dark', 'red', 'mode', 'vision'], icon: '🌙', description: 'Preserve night vision', content: 'Red-tinted display to preserve dark adaptation. Activate via settings or search "night mode".' }
    ];

    // Settings options searchable in the app
    const SETTINGS_OPTIONS = [
        // Display
        { id: 'setting-night-mode', name: 'Night Mode', keywords: ['night', 'dark', 'mode', 'red', 'vision'], icon: '🌙', description: 'Toggle red night mode display', action: 'toggleNightMode', type: 'toggle' },
        { id: 'setting-units', name: 'Units (Metric/Imperial)', keywords: ['units', 'metric', 'imperial', 'miles', 'kilometers'], icon: '📏', description: 'Switch between metric and imperial', action: 'toggleUnits', type: 'toggle' },
        { id: 'setting-coord-format', name: 'Coordinate Format', keywords: ['coordinate', 'format', 'dms', 'decimal', 'degrees'], icon: '🎯', description: 'Change coordinate display format', action: 'cycleCoordFormat', type: 'cycle' },
        
        // Map
        { id: 'setting-map-layer', name: 'Map Layer', keywords: ['map', 'layer', 'satellite', 'terrain', 'topo'], icon: '🗺️', description: 'Change map layer style', action: 'changeMapLayer', type: 'select' },
        { id: 'setting-offline-maps', name: 'Offline Maps', keywords: ['offline', 'download', 'maps', 'cache'], icon: '📥', description: 'Manage downloaded map tiles', action: 'openOfflineMaps', panel: 'offline' },
        
        // Location
        { id: 'setting-gps-accuracy', name: 'GPS Accuracy Display', keywords: ['gps', 'accuracy', 'precision', 'circle'], icon: '📍', description: 'Show/hide GPS accuracy circle', action: 'toggleGpsAccuracy', type: 'toggle' },
        { id: 'setting-track-position', name: 'Track Position', keywords: ['track', 'position', 'follow', 'gps'], icon: '🎯', description: 'Auto-center map on position', action: 'toggleTrackPosition', type: 'toggle' },
        
        // Notifications
        { id: 'setting-notifications', name: 'Notifications', keywords: ['notification', 'alert', 'sound', 'vibrate'], icon: '🔔', description: 'Configure notification settings', action: 'openNotificationSettings', type: 'panel' },
        { id: 'setting-sounds', name: 'Sound Effects', keywords: ['sound', 'audio', 'mute', 'volume'], icon: '🔊', description: 'Toggle sound effects', action: 'toggleSounds', type: 'toggle' },
        
        // Privacy
        { id: 'setting-clear-data', name: 'Clear All Data', keywords: ['clear', 'delete', 'reset', 'data', 'privacy'], icon: '🗑️', description: 'Delete all stored data', action: 'clearAllData', type: 'danger' },
        { id: 'setting-export-data', name: 'Export All Data', keywords: ['export', 'backup', 'save', 'data'], icon: '📤', description: 'Export all data as backup', action: 'exportAllData', type: 'action' },
        
        // Hardware
        { id: 'setting-bluetooth', name: 'Bluetooth Devices', keywords: ['bluetooth', 'device', 'connect', 'hardware'], icon: '📶', description: 'Manage Bluetooth connections', action: 'openBluetoothSettings', type: 'panel' },
        { id: 'setting-radiacode', name: 'Radiacode Detector', keywords: ['radiacode', 'radiation', 'detector', 'geiger'], icon: '☢️', description: 'Configure radiation detector', action: 'openRadiacodeSettings', panel: 'team' },
        
        // About
        { id: 'setting-version', name: 'App Version', keywords: ['version', 'about', 'info', 'update'], icon: 'ℹ️', description: 'View app version and check for updates', action: 'showAbout', type: 'info' },
        { id: 'setting-privacy', name: 'Privacy Policy', keywords: ['privacy', 'policy', 'data', 'legal'], icon: '🔒', description: 'View privacy policy', action: 'showPrivacy', type: 'info' }
    ];

    // Action commands available in search
    const ACTION_COMMANDS = [
        // Waypoint actions
        { id: 'add-waypoint', name: 'Add Waypoint', keywords: ['add', 'waypoint', 'new', 'create', 'point', 'marker'], icon: '📍', description: 'Create a new waypoint at current location', panel: 'waypoints', action: 'addWaypoint' },
        { id: 'add-waypoint-here', name: 'Add Waypoint Here', keywords: ['add', 'waypoint', 'here', 'current', 'location'], icon: '📍', description: 'Create waypoint at map center', panel: 'waypoints', action: 'addWaypointHere' },
        
        // Route actions
        { id: 'new-route', name: 'Create Route', keywords: ['new', 'route', 'create', 'build', 'path'], icon: '🛣️', description: 'Start building a new route', panel: 'routes', action: 'newRoute' },
        { id: 'start-navigation', name: 'Start Navigation', keywords: ['start', 'navigation', 'navigate', 'go', 'begin'], icon: '🧭', description: 'Begin navigating a route', panel: 'navigation', action: 'startNavigation' },
        { id: 'stop-navigation', name: 'Stop Navigation', keywords: ['stop', 'navigation', 'end', 'cancel'], icon: '⏹️', description: 'Stop current navigation', panel: 'navigation', action: 'stopNavigation' },
        
        // Measurement & Tools
        { id: 'measure-distance', name: 'Measure Distance', keywords: ['measure', 'distance', 'length', 'ruler'], icon: '📏', description: 'Measure distance on map', panel: 'map', action: 'measureDistance' },
        { id: 'take-bearing', name: 'Take Bearing', keywords: ['bearing', 'compass', 'direction', 'azimuth'], icon: '🧭', description: 'Get compass bearing', panel: 'gps', action: 'takeBearing' },
        { id: 'find-position', name: 'Find My Position', keywords: ['find', 'position', 'gps', 'location', 'where'], icon: '📡', description: 'Get current GPS position', panel: 'gps', action: 'findPosition' },
        { id: 'rangefinder-resection', name: 'Rangefinder Resection', keywords: ['rangefinder', 'resection', 'triangulation', 'position', 'fix', 'gps-denied'], icon: '📐', description: 'Calculate position from landmarks', panel: 'navigation', action: 'rangefinderResection' },
        
        // Celestial
        { id: 'star-chart', name: 'View Star Chart', keywords: ['star', 'chart', 'sky', 'map', 'celestial'], icon: '🌌', description: 'Open the star chart', panel: 'celestial', action: 'starChart' },
        { id: 'star-id', name: 'Star Identification', keywords: ['star', 'identify', 'id', 'camera', 'find'], icon: '🔭', description: 'Identify stars with camera', panel: 'celestial', action: 'starId' },
        { id: 'camera-sextant', name: 'Camera Sextant', keywords: ['camera', 'sextant', 'altitude', 'measure', 'angle'], icon: '📷', description: 'Measure altitude with camera', panel: 'celestial', action: 'cameraSextant' },
        { id: 'celestial-observation', name: 'Start Observation', keywords: ['observation', 'sight', 'celestial', 'observe'], icon: '👁️', description: 'Begin celestial observation', panel: 'celestial', action: 'startObservation' },
        
        // Offline & Maps
        { id: 'download-maps', name: 'Download Offline Maps', keywords: ['download', 'offline', 'maps', 'cache', 'save'], icon: '💾', description: 'Download maps for offline use', panel: 'offline', action: 'downloadMaps' },
        { id: 'change-map-layer', name: 'Change Map Layer', keywords: ['map', 'layer', 'satellite', 'topo', 'terrain', 'change'], icon: '🗺️', description: 'Switch map base layer', panel: 'map', action: 'changeMapLayer' },
        
        // Weather
        { id: 'check-weather', name: 'Check Weather', keywords: ['weather', 'forecast', 'rain', 'temperature', 'conditions'], icon: '🌤️', description: 'View weather information', panel: 'weather', action: 'checkWeather' },
        { id: 'satellite-weather', name: 'Satellite Weather', keywords: ['satellite', 'weather', 'radar', 'goes', 'imagery'], icon: '🛰️', description: 'View satellite weather imagery', panel: 'weather', action: 'satelliteWeather' },
        
        // Communication
        { id: 'comm-plan', name: 'Communication Plan', keywords: ['comm', 'communication', 'radio', 'plan', 'frequencies'], icon: '📻', description: 'View communication plan', panel: 'radio', action: 'commPlan' },
        { id: 'sos-emergency', name: 'Emergency SOS', keywords: ['sos', 'emergency', 'help', 'rescue', 'distress'], icon: '🆘', description: 'Open emergency SOS panel', panel: 'sos', action: 'emergencySOS' },
        
        // Hiking
        { id: 'start-hike', name: 'Start Hiking', keywords: ['start', 'hike', 'hiking', 'trail', 'walk'], icon: '🥾', description: 'Begin recording a hike', panel: 'navigation', action: 'startHike' },
        { id: 'stop-hike', name: 'Stop Hiking', keywords: ['stop', 'hike', 'end', 'finish'], icon: '🏁', description: 'End current hike', panel: 'navigation', action: 'stopHike' },
        
        // View actions
        { id: 'center-position', name: 'Center on My Position', keywords: ['center', 'position', 'me', 'current', 'location'], icon: '🎯', description: 'Center map on GPS position', panel: null, action: 'centerOnPosition' },
        { id: 'reset-bearing', name: 'Reset Map North', keywords: ['reset', 'north', 'bearing', 'rotation', 'map'], icon: '🧭', description: 'Reset map to north up', panel: null, action: 'resetBearing' },
        
        // Settings
        { id: 'toggle-dark-mode', name: 'Toggle Night Mode', keywords: ['dark', 'night', 'mode', 'theme', 'light'], icon: '🌙', description: 'Switch between light and dark mode', panel: null, action: 'toggleNightMode' },
        { id: 'keyboard-shortcuts', name: 'Keyboard Shortcuts', keywords: ['keyboard', 'shortcuts', 'keys', 'hotkeys', 'help'], icon: '⌨️', description: 'View all keyboard shortcuts', panel: null, action: 'showKeyboardShortcuts' },
        
        // Help
        { id: 'situation-wizard', name: 'Situation Wizard', keywords: ['help', 'wizard', 'situation', 'lost', 'emergency', 'what', 'do', 'guide'], icon: '❓', description: "Get help based on your situation", panel: null, action: 'openWizard' },
        { id: 'im-lost', name: "I'm Lost", keywords: ['lost', 'help', 'position', 'where', 'am', 'i'], icon: '🧭', description: 'Help finding your position', panel: null, action: 'openWizardLost' },
        { id: 'need-help', name: 'I Need Help', keywords: ['help', 'emergency', 'sos', 'rescue', 'stuck'], icon: '🆘', description: 'Emergency assistance guide', panel: null, action: 'openWizardEmergency' }
    ];

    // Navigation star catalog for celestial search
    const NAVIGATION_STARS = [
        { name: 'Polaris', constellation: 'Ursa Minor', magnitude: 2.0, description: 'North Star - latitude reference', keywords: ['north', 'pole', 'latitude'] },
        { name: 'Sirius', constellation: 'Canis Major', magnitude: -1.5, description: 'Brightest star in sky', keywords: ['bright', 'dog'] },
        { name: 'Canopus', constellation: 'Carina', magnitude: -0.7, description: 'Second brightest star', keywords: ['southern'] },
        { name: 'Arcturus', constellation: 'Boötes', magnitude: -0.05, description: 'Bright orange star', keywords: ['orange', 'spring'] },
        { name: 'Vega', constellation: 'Lyra', magnitude: 0.0, description: 'Summer triangle star', keywords: ['summer', 'blue'] },
        { name: 'Capella', constellation: 'Auriga', magnitude: 0.1, description: 'Winter star', keywords: ['winter', 'yellow'] },
        { name: 'Rigel', constellation: 'Orion', magnitude: 0.1, description: 'Orion\'s foot', keywords: ['orion', 'blue', 'winter'] },
        { name: 'Procyon', constellation: 'Canis Minor', magnitude: 0.4, description: 'Little Dog Star', keywords: ['winter'] },
        { name: 'Betelgeuse', constellation: 'Orion', magnitude: 0.4, description: 'Orion\'s shoulder - red giant', keywords: ['orion', 'red', 'winter'] },
        { name: 'Aldebaran', constellation: 'Taurus', magnitude: 0.9, description: 'Bull\'s eye - orange', keywords: ['taurus', 'orange', 'winter'] },
        { name: 'Spica', constellation: 'Virgo', magnitude: 1.0, description: 'Spring star', keywords: ['spring', 'blue'] },
        { name: 'Antares', constellation: 'Scorpius', magnitude: 1.1, description: 'Scorpion\'s heart - red', keywords: ['scorpion', 'red', 'summer'] },
        { name: 'Fomalhaut', constellation: 'Piscis Austrinus', magnitude: 1.2, description: 'Autumn star', keywords: ['autumn', 'fall', 'southern'] },
        { name: 'Deneb', constellation: 'Cygnus', magnitude: 1.3, description: 'Summer triangle star', keywords: ['summer', 'swan'] },
        { name: 'Regulus', constellation: 'Leo', magnitude: 1.4, description: 'Lion\'s heart', keywords: ['lion', 'spring'] },
        { name: 'Dubhe', constellation: 'Ursa Major', magnitude: 1.8, description: 'Big Dipper pointer star', keywords: ['dipper', 'pointer'] },
        { name: 'Merak', constellation: 'Ursa Major', magnitude: 2.4, description: 'Big Dipper pointer star', keywords: ['dipper', 'pointer'] },
        { name: 'Altair', constellation: 'Aquila', magnitude: 0.8, description: 'Summer triangle star', keywords: ['summer', 'eagle'] }
    ];

    // Planets for celestial search
    const PLANETS = [
        { name: 'Venus', type: 'planet', description: 'Morning/Evening star - brightest planet', keywords: ['morning', 'evening', 'bright'] },
        { name: 'Mars', type: 'planet', description: 'The red planet', keywords: ['red'] },
        { name: 'Jupiter', type: 'planet', description: 'Largest planet - very bright', keywords: ['bright', 'large', 'giant'] },
        { name: 'Saturn', type: 'planet', description: 'Ringed planet', keywords: ['rings'] }
    ];

    // Other celestial objects
    const OTHER_CELESTIAL = [
        { name: 'Sun', type: 'sun', description: 'Our star - use for noon sight, shadow stick', keywords: ['noon', 'shadow', 'solar'] },
        { name: 'Moon', type: 'moon', description: 'Excellent for observation - easy to find', keywords: ['lunar', 'phase'] }
    ];

    // State
    let isOpen = false;
    let query = '';
    let results = [];
    let selectedIndex = 0;
    let activeCategory = null; // null = all categories
    let recentSearches = [];
    let recentActions = []; // Track recently used actions
    let favorites = []; // Pinned/favorite items
    let searchContainer = null;
    let searchInputEl = null;
    let debounceTimer = null;
    let initialized = false;
    let searchEvents = null; // EventManager scoped manager
    let suggestionsMode = false; // Whether showing suggestions vs results
    let suggestions = []; // Current contextual suggestions

    /**
     * Initialize the search module
     */
    function init() {
        // Prevent double initialization
        if (initialized) {
            console.debug('SearchModule already initialized');
            return;
        }
        
        // Create scoped event manager
        searchEvents = EventManager.createScopedManager(EventManager.SCOPES.SEARCH);
        
        createSearchUI();
        loadRecentSearches();
        loadRecentActions();
        loadFavorites();
        setupKeyboardShortcuts();
        
        initialized = true;
        console.log('Search module initialized (Ctrl+K to open)');
    }

    /**
     * Create the search UI elements
     */
    function createSearchUI() {
        // Create search overlay container
        searchContainer = document.createElement('div');
        searchContainer.id = 'global-search';
        searchContainer.className = 'global-search';
        searchContainer.setAttribute('role', 'dialog');
        searchContainer.setAttribute('aria-modal', 'true');
        searchContainer.setAttribute('aria-label', 'Global search');
        searchContainer.setAttribute('aria-hidden', 'true');
        searchContainer.innerHTML = `
            <div class="global-search__backdrop" role="presentation"></div>
            <div class="global-search__dialog" role="search">
                <div class="global-search__header">
                    <div class="global-search__input-wrapper">
                        <span class="global-search__icon" aria-hidden="true">🔍</span>
                        <input type="text" 
                               id="global-search-input" 
                               class="global-search__input" 
                               placeholder="Search waypoints, routes, frequencies..."
                               autocomplete="off"
                               spellcheck="false"
                               role="combobox"
                               aria-expanded="false"
                               aria-autocomplete="list"
                               aria-controls="search-results-list"
                               aria-activedescendant=""
                               aria-label="Search query">
                        <div class="global-search__category-badge" id="search-category-badge" style="display:none" aria-live="polite"></div>
                        <kbd class="global-search__kbd" aria-hidden="true">ESC</kbd>
                    </div>
                    <div class="global-search__filters" id="search-filters" role="tablist" aria-label="Search category filters">
                        <button class="global-search__filter global-search__filter--active" data-category="" role="tab" aria-selected="true" aria-controls="search-results-list">
                            All
                        </button>
                        ${Object.values(CATEGORIES).map(cat => `
                            <button class="global-search__filter" data-category="${cat.id}" title="Press ${cat.shortcut} to filter" role="tab" aria-selected="false" aria-controls="search-results-list">
                                <span aria-hidden="true">${cat.icon}</span> ${cat.name}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="global-search__body" id="search-results" role="tabpanel">
                    <div class="global-search__empty" id="search-empty">
                        <div class="global-search__suggestions" id="search-suggestions" role="group" aria-label="Suggestions"></div>
                        <div class="global-search__recent" id="search-recent" role="group" aria-label="Recent searches"></div>
                        <div class="global-search__quick-actions" id="search-quick-actions" role="group" aria-label="Quick actions"></div>
                        <div class="global-search__tips" role="group" aria-label="Keyboard shortcuts">
                            <div class="global-search__tip">
                                <kbd aria-hidden="true">↑</kbd><kbd aria-hidden="true">↓</kbd> <span class="sr-only">Arrow keys to</span>Navigate
                            </div>
                            <div class="global-search__tip">
                                <kbd aria-hidden="true">Enter</kbd> Select
                            </div>
                            <div class="global-search__tip">
                                <kbd aria-hidden="true">Tab</kbd> Next category
                            </div>
                        </div>
                    </div>
                    <div class="global-search__results" id="search-results-list" role="listbox" aria-label="Search results"></div>
                </div>
                <div class="global-search__footer">
                    <span class="global-search__hint" aria-hidden="true">
                        <kbd>Ctrl</kbd>+<kbd>K</kbd> to search anywhere
                    </span>
                    <span class="global-search__count" id="search-count" role="status" aria-live="polite"></span>
                </div>
            </div>
        `;
        
        document.body.appendChild(searchContainer);
        
        // Setup event delegation on stable containers
        setupSearchDelegation();
        
        // Bind events
        const backdrop = searchContainer.querySelector('.global-search__backdrop');
        searchInputEl = searchContainer.querySelector('#global-search-input');
        const filters = searchContainer.querySelectorAll('.global-search__filter');
        
        backdrop.addEventListener('click', close);
        
        searchInputEl.addEventListener('input', (e) => {
            query = e.target.value;
            debouncedSearch();
        });
        
        searchInputEl.addEventListener('keydown', handleInputKeydown);
        
        filters.forEach(btn => {
            btn.addEventListener('click', () => {
                setCategory(btn.dataset.category || null);
            });
        });
    }

    /**
     * Setup event delegation on stable search containers.
     * Replaces per-render addEventListener calls that leaked on every keystroke.
     */
    function setupSearchDelegation() {
        const body = searchContainer.querySelector('#search-results');
        if (!body) return;

        // --- Click delegation on the search body (covers results, suggestions, recent, quick actions) ---
        body.addEventListener('click', (e) => {
            const target = e.target;

            // Search result favorite toggle (must be checked before item click)
            const favBtn = target.closest('.global-search__item-fav');
            if (favBtn) {
                e.stopPropagation();
                const idx = parseInt(favBtn.dataset.favIndex);
                if (results[idx]) {
                    toggleFavorite(results[idx]);
                    renderResults();
                }
                return;
            }

            // Search result item click
            const resultItem = target.closest('#search-results-list .global-search__item');
            if (resultItem) {
                selectedIndex = parseInt(resultItem.dataset.index);
                activateSelected();
                return;
            }

            // Suggestion item click
            const suggestionItem = target.closest('#search-suggestions .global-search__item');
            if (suggestionItem) {
                selectedIndex = parseInt(suggestionItem.dataset.index);
                activateSuggestion();
                return;
            }

            // Quick action button
            const quickAction = target.closest('.global-search__quick-action-btn');
            if (quickAction) {
                const actionId = quickAction.dataset.action;
                const action = ACTION_COMMANDS.find(a => a.action === actionId);
                if (action) {
                    executeAction(action);
                    close();
                }
                return;
            }

            // Favorite remove button
            const removeBtn = target.closest('.global-search__favorite-remove');
            if (removeBtn) {
                e.stopPropagation();
                removeFavorite(removeBtn.dataset.removeId);
                renderRecentSearches();
                return;
            }

            // Favorite item click
            const favItem = target.closest('.global-search__favorite-item');
            if (favItem) {
                const idx = parseInt(favItem.dataset.favoriteIndex);
                if (favorites[idx]) {
                    activateFavorite(favorites[idx]);
                }
                return;
            }

            // Recent search item
            const recentItem = target.closest('.global-search__recent-item');
            if (recentItem) {
                query = recentItem.dataset.query;
                searchInputEl.value = query;
                performSearch();
                return;
            }

            // Clear favorites
            if (target.closest('#clear-favorites')) {
                if (confirm('Clear all favorites?')) {
                    favorites = [];
                    saveFavorites();
                    renderRecentSearches();
                }
                return;
            }

            // Clear recent
            if (target.closest('#clear-recent')) {
                clearRecentSearches();
                return;
            }
        });

        // --- Mouseenter delegation for hover-to-select ---
        body.addEventListener('mouseover', (e) => {
            const resultItem = e.target.closest('#search-results-list .global-search__item');
            if (resultItem) {
                selectedIndex = parseInt(resultItem.dataset.index);
                updateSelection();
                return;
            }

            const suggestionItem = e.target.closest('#search-suggestions .global-search__item');
            if (suggestionItem) {
                selectedIndex = parseInt(suggestionItem.dataset.index);
                updateSuggestionSelection();
                return;
            }
        });
    }

    /**
     * Setup global keyboard shortcuts
     */
    function setupKeyboardShortcuts() {
        const keydownHandler = (e) => {
            // Ctrl+K or Cmd+K to open search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                toggle();
                return;
            }
            
            // Forward slash to open search (when not in input)
            if (e.key === '/' && !isInputFocused()) {
                e.preventDefault();
                open();
                return;
            }
            
            // Escape to close
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                close();
                return;
            }
        };
        
        searchEvents.on(document, 'keydown', keydownHandler);
    }

    /**
     * Handle keydown in search input
     */
    function handleInputKeydown(e) {
        // Ctrl+D to toggle favorite on selected result
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            toggleSelectedFavorite();
            return;
        }
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                selectNext();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                selectPrevious();
                break;
                
            case 'Enter':
                e.preventDefault();
                activateSelected();
                break;
                
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    cycleCategoryBackward();
                } else {
                    cycleCategoryForward();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                if (query) {
                    clearQuery();
                } else {
                    close();
                }
                break;
                
            default:
                // Category shortcuts (when query is empty and key matches)
                if (!query && e.key.length === 1) {
                    const cat = Object.values(CATEGORIES).find(c => c.shortcut === e.key.toLowerCase());
                    if (cat && activeCategory !== cat.id) {
                        e.preventDefault();
                        setCategory(cat.id);
                    }
                }
        }
    }

    /**
     * Toggle favorite status on currently selected result
     */
    function toggleSelectedFavorite() {
        if (results.length === 0 || selectedIndex >= results.length) return;
        
        const result = results[selectedIndex];
        toggleFavorite(result);
        
        // Re-render to update UI
        renderResults();
    }

    /**
     * Open the search dialog
     */
    function open() {
        if (isOpen) return;
        
        isOpen = true;
        searchContainer.classList.add('global-search--open');
        searchContainer.setAttribute('aria-hidden', 'false');
        
        // Focus input
        const input = searchInputEl;
        input.value = query;
        input.focus();
        input.select();
        
        // Show recent searches if no query
        if (!query) {
            renderRecentSearches();
        }
        
        // Trap focus inside dialog
        document.body.style.overflow = 'hidden';
        
        // Emit event
        Events.emit('search:open');
    }

    /**
     * Close the search dialog
     */
    function close() {
        if (!isOpen) return;
        
        isOpen = false;
        searchContainer.classList.remove('global-search--open');
        searchContainer.setAttribute('aria-hidden', 'true');
        
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Reset aria-expanded
        const input = searchInputEl;
        if (input) {
            input.setAttribute('aria-expanded', 'false');
        }
        
        // Emit event
        Events.emit('search:close');
    }

    /**
     * Toggle search dialog
     */
    function toggle() {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }

    /**
     * Clear the search query
     */
    function clearQuery() {
        query = '';
        const input = searchInputEl;
        input.value = '';
        results = [];
        selectedIndex = 0;
        renderResults();
        renderRecentSearches();
    }

    /**
     * Set active category filter
     */
    function setCategory(categoryId) {
        activeCategory = categoryId;
        
        // Update filter buttons with ARIA states
        const filters = searchContainer.querySelectorAll('.global-search__filter');
        filters.forEach(btn => {
            const isActive = (btn.dataset.category || null) === categoryId;
            btn.classList.toggle('global-search__filter--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        
        // Update category badge
        const badge = searchContainer.querySelector('#search-category-badge');
        if (categoryId && CATEGORIES[categoryId]) {
            const cat = CATEGORIES[categoryId];
            badge.innerHTML = `${cat.icon} ${cat.name}`;
            badge.style.display = 'flex';
            badge.style.background = cat.color + '22';
            badge.style.color = cat.color;
        } else {
            badge.style.display = 'none';
        }
        
        // Re-search with new filter
        performSearch();
    }

    /**
     * Cycle to next category
     */
    function cycleCategoryForward() {
        const categories = [null, ...Object.keys(CATEGORIES)];
        const currentIndex = categories.indexOf(activeCategory);
        const nextIndex = (currentIndex + 1) % categories.length;
        setCategory(categories[nextIndex]);
    }

    /**
     * Cycle to previous category
     */
    function cycleCategoryBackward() {
        const categories = [null, ...Object.keys(CATEGORIES)];
        const currentIndex = categories.indexOf(activeCategory);
        const prevIndex = (currentIndex - 1 + categories.length) % categories.length;
        setCategory(categories[prevIndex]);
    }

    /**
     * Debounced search
     */
    function debouncedSearch() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(performSearch, CONFIG.debounceMs);
    }

    /**
     * Perform the search
     */
    function performSearch() {
        if (query.length < CONFIG.minQueryLength) {
            results = [];
            suggestionsMode = true;
            renderResults();
            renderSuggestions();
            return;
        }
        
        suggestionsMode = false;
        const searchResults = [];
        const lowerQuery = query.toLowerCase().trim();
        
        // Check if query looks like coordinates
        const coordMatch = parseCoordinateQuery(lowerQuery);
        if (coordMatch) {
            searchResults.push({
                id: 'coord-' + Date.now(),
                category: 'location',
                title: `Go to ${coordMatch.display}`,
                subtitle: 'Navigate to coordinates',
                icon: '🎯',
                data: coordMatch,
                score: 100
            });
        }
        
        // Search waypoints
        if (!activeCategory || activeCategory === 'waypoint') {
            const waypoints = State.get('waypoints') || [];
            waypoints.forEach(wp => {
                const score = calculateMatchScore(wp, lowerQuery, ['name', 'notes', 'type']);
                if (score > 0) {
                    const typeInfo = Constants.WAYPOINT_TYPES[wp.type] || Constants.WAYPOINT_TYPES.custom;
                    searchResults.push({
                        id: 'wp-' + wp.id,
                        category: 'waypoint',
                        title: wp.name,
                        subtitle: `${typeInfo.label}${wp.notes ? ' • ' + truncate(wp.notes, 40) : ''}`,
                        icon: typeInfo.icon,
                        color: typeInfo.color,
                        data: wp,
                        score: score
                    });
                }
            });
        }
        
        // Search routes
        if (!activeCategory || activeCategory === 'route') {
            const routes = State.get('routes') || [];
            routes.filter(r => !r.isBuilding).forEach(route => {
                const score = calculateMatchScore(route, lowerQuery, ['name', 'notes']);
                if (score > 0) {
                    searchResults.push({
                        id: 'route-' + route.id,
                        category: 'route',
                        title: route.name,
                        subtitle: `${route.distance || '?'} mi • ${route.duration || '?'} • ${route.points?.length || 0} points`,
                        icon: '🛣️',
                        color: '#3b82f6',
                        data: route,
                        score: score
                    });
                }
            });
        }
        
        // Search team members
        if (!activeCategory || activeCategory === 'team') {
            const team = State.get('teamMembers') || [];
            team.forEach(member => {
                const score = calculateMatchScore(member, lowerQuery, ['name', 'callsign']);
                if (score > 0) {
                    searchResults.push({
                        id: 'team-' + member.id,
                        category: 'team',
                        title: member.name || member.callsign || 'Unknown',
                        subtitle: `${member.status || 'Unknown'} • Last: ${member.lastUpdate || 'N/A'}`,
                        icon: '👤',
                        color: member.status === 'active' ? '#22c55e' : '#f59e0b',
                        data: member,
                        score: score
                    });
                }
            });
        }
        
        // Search radio frequencies
        if ((!activeCategory || activeCategory === 'frequency') && typeof RadioModule !== 'undefined') {
            try {
                const freqResults = RadioModule.searchAll ? RadioModule.searchAll(lowerQuery) : [];
                freqResults.slice(0, 10).forEach(freq => {
                    const freqVal = freq.freq || freq.frequency;
                    searchResults.push({
                        id: 'freq-' + (freqVal || freq.channel),
                        category: 'frequency',
                        title: freq.name || (freq.channel ? `Ch ${freq.channel}` : `${freqVal} MHz`),
                        subtitle: `${freqVal} MHz • ${freq._category || freq.category || freq.service || 'Radio'}`,
                        icon: '📻',
                        color: '#8b5cf6',
                        data: freq,
                        score: 50
                    });
                });
            } catch (e) {
                console.warn('Radio search failed:', e);
            }
        }
        
        // Search action commands
        if (!activeCategory || activeCategory === 'action') {
            ACTION_COMMANDS.forEach(action => {
                const nameMatch = action.name.toLowerCase().includes(lowerQuery);
                const keywordMatch = action.keywords.some(kw => kw.includes(lowerQuery) || lowerQuery.includes(kw));
                const descMatch = action.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || keywordMatch || descMatch) {
                    let score = 0;
                    if (nameMatch) score = action.name.toLowerCase().startsWith(lowerQuery) ? 90 : 70;
                    else if (keywordMatch) score = 60;
                    else if (descMatch) score = 40;
                    
                    searchResults.push({
                        id: 'action-' + action.id,
                        category: 'action',
                        title: action.name,
                        subtitle: action.description,
                        icon: action.icon,
                        color: '#22c55e',
                        data: action,
                        score: score
                    });
                }
            });
        }
        
        // Search celestial bodies
        if (!activeCategory || activeCategory === 'celestial') {
            // Search stars
            NAVIGATION_STARS.forEach(star => {
                const nameMatch = star.name.toLowerCase().includes(lowerQuery);
                const constMatch = star.constellation.toLowerCase().includes(lowerQuery);
                const keywordMatch = star.keywords.some(kw => kw.includes(lowerQuery));
                const descMatch = star.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || constMatch || keywordMatch || descMatch) {
                    let score = 0;
                    if (nameMatch) score = star.name.toLowerCase().startsWith(lowerQuery) ? 85 : 65;
                    else if (constMatch) score = 55;
                    else if (keywordMatch) score = 45;
                    else if (descMatch) score = 35;
                    
                    // Get current position if CelestialModule is available
                    let positionInfo = '';
                    if (typeof CelestialModule !== 'undefined') {
                        try {
                            const pos = CelestialModule.getStarPosition(star.name, new Date());
                            if (pos && !pos.error) {
                                const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
                                const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                                if (altAz.altitude > 0) {
                                    positionInfo = ` • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`;
                                } else {
                                    positionInfo = ' • Below horizon';
                                }
                            }
                        } catch (e) { }
                    }
                    
                    searchResults.push({
                        id: 'star-' + star.name,
                        category: 'celestial',
                        title: star.name,
                        subtitle: `${star.constellation} • Mag ${star.magnitude}${positionInfo}`,
                        icon: star.magnitude < 1 ? '⭐' : '✦',
                        color: '#fbbf24',
                        data: { ...star, type: 'star' },
                        score: score
                    });
                }
            });
            
            // Search planets
            PLANETS.forEach(planet => {
                const nameMatch = planet.name.toLowerCase().includes(lowerQuery);
                const keywordMatch = planet.keywords.some(kw => kw.includes(lowerQuery));
                const descMatch = planet.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || keywordMatch || descMatch || lowerQuery === 'planet' || lowerQuery === 'planets') {
                    let score = 0;
                    if (nameMatch) score = planet.name.toLowerCase().startsWith(lowerQuery) ? 85 : 65;
                    else if (lowerQuery === 'planet' || lowerQuery === 'planets') score = 55;
                    else if (keywordMatch) score = 45;
                    else if (descMatch) score = 35;
                    
                    // Get current position if CelestialModule is available
                    let positionInfo = '';
                    if (typeof CelestialModule !== 'undefined') {
                        try {
                            const pos = CelestialModule.getPlanetPosition(planet.name.toLowerCase(), new Date());
                            if (pos && !pos.error) {
                                const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
                                const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                                if (altAz.altitude > 0) {
                                    positionInfo = ` • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`;
                                } else {
                                    positionInfo = ' • Below horizon';
                                }
                            }
                        } catch (e) { }
                    }
                    
                    searchResults.push({
                        id: 'planet-' + planet.name,
                        category: 'celestial',
                        title: planet.name,
                        subtitle: `Planet${positionInfo} • ${planet.description}`,
                        icon: '🪐',
                        color: '#fbbf24',
                        data: { ...planet, type: 'planet' },
                        score: score
                    });
                }
            });
            
            // Search Sun and Moon
            OTHER_CELESTIAL.forEach(body => {
                const nameMatch = body.name.toLowerCase().includes(lowerQuery);
                const keywordMatch = body.keywords.some(kw => kw.includes(lowerQuery));
                const descMatch = body.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || keywordMatch || descMatch) {
                    let score = 0;
                    if (nameMatch) score = 80;
                    else if (keywordMatch) score = 50;
                    else if (descMatch) score = 35;
                    
                    // Get current position
                    let positionInfo = '';
                    if (typeof CelestialModule !== 'undefined') {
                        try {
                            const pos = body.type === 'sun' 
                                ? CelestialModule.getSunPosition(new Date())
                                : CelestialModule.getMoonPosition(new Date());
                            if (pos && !pos.error) {
                                const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
                                const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                                if (altAz.altitude > 0) {
                                    positionInfo = ` • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`;
                                } else {
                                    positionInfo = ' • Below horizon';
                                }
                            }
                        } catch (e) { }
                    }
                    
                    searchResults.push({
                        id: 'celestial-' + body.name,
                        category: 'celestial',
                        title: body.name,
                        subtitle: `${body.description}${positionInfo}`,
                        icon: body.type === 'sun' ? '☀️' : '🌙',
                        color: body.type === 'sun' ? '#fbbf24' : '#a5b4fc',
                        data: body,
                        score: score
                    });
                }
            });
        }
        
        // Search landmarks (peaks, towers, benchmarks from landmark packs)
        if (!activeCategory || activeCategory === 'landmark') {
            if (typeof LandmarkModule !== 'undefined') {
                try {
                    // Get user's current location for distance calculation
                    const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : null;
                    
                    const landmarkResults = LandmarkModule.search(lowerQuery, {
                        limit: 15,
                        nearLat: mapState?.lat,
                        nearLon: mapState?.lon
                    });
                    
                    landmarkResults.forEach(landmark => {
                        // Calculate distance if we have user location
                        let distanceInfo = '';
                        if (mapState && landmark.lat && landmark.lon) {
                            const dist = haversineDistanceKm(mapState.lat, mapState.lon, landmark.lat, landmark.lon);
                            if (dist < 1) {
                                distanceInfo = ` • ${(dist * 1000).toFixed(0)}m`;
                            } else if (dist < 100) {
                                distanceInfo = ` • ${dist.toFixed(1)}km`;
                            } else {
                                distanceInfo = ` • ${Math.round(dist)}km`;
                            }
                        }
                        
                        // Build subtitle with elevation and source
                        let subtitle = '';
                        if (landmark.elevation) {
                            subtitle += `${landmark.elevation.toLocaleString()}m`;
                        }
                        if (landmark.source) {
                            subtitle += subtitle ? ` • ${landmark.source}` : landmark.source;
                        }
                        subtitle += distanceInfo;
                        
                        searchResults.push({
                            id: 'landmark-' + landmark.id,
                            category: 'landmark',
                            title: landmark.name,
                            subtitle: subtitle || 'Landmark',
                            icon: landmark.typeInfo?.icon || '🏔️',
                            color: landmark.typeInfo?.color || '#8b5cf6',
                            data: landmark,
                            score: landmark.score || 50
                        });
                    });
                } catch (e) {
                    console.warn('Landmark search error:', e);
                }
            }
        }
        
        // Search help topics
        if (!activeCategory || activeCategory === 'help') {
            HELP_TOPICS.forEach(topic => {
                const nameMatch = topic.name.toLowerCase().includes(lowerQuery);
                const keywordMatch = topic.keywords.some(kw => kw.includes(lowerQuery));
                const descMatch = topic.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || keywordMatch || descMatch || lowerQuery === 'help') {
                    let score = 0;
                    if (nameMatch) score = topic.name.toLowerCase().startsWith(lowerQuery) ? 75 : 55;
                    else if (lowerQuery === 'help') score = 50;
                    else if (keywordMatch) score = 45;
                    else if (descMatch) score = 35;
                    
                    // Show panel destination in subtitle for navigable help entries
                    const panelLabel = topic.panel ? 
                        (Constants.NAV_ITEMS.find(n => n.id === topic.panel) || {}).label : null;
                    const subtitle = panelLabel ? 
                        `${topic.description} → ${panelLabel}` : topic.description;
                    
                    searchResults.push({
                        id: topic.id,
                        category: 'help',
                        title: topic.name,
                        subtitle: subtitle,
                        icon: topic.icon,
                        color: '#06b6d4',
                        data: topic,
                        score: score
                    });
                }
            });
        }
        
        // Search settings options
        if (!activeCategory || activeCategory === 'settings') {
            SETTINGS_OPTIONS.forEach(setting => {
                const nameMatch = setting.name.toLowerCase().includes(lowerQuery);
                const keywordMatch = setting.keywords.some(kw => kw.includes(lowerQuery));
                const descMatch = setting.description.toLowerCase().includes(lowerQuery);
                
                if (nameMatch || keywordMatch || descMatch || lowerQuery === 'settings' || lowerQuery === 'setting') {
                    let score = 0;
                    if (nameMatch) score = setting.name.toLowerCase().startsWith(lowerQuery) ? 75 : 55;
                    else if (lowerQuery === 'settings' || lowerQuery === 'setting') score = 50;
                    else if (keywordMatch) score = 45;
                    else if (descMatch) score = 35;
                    
                    searchResults.push({
                        id: setting.id,
                        category: 'settings',
                        title: setting.name,
                        subtitle: setting.description,
                        icon: setting.icon,
                        color: '#6b7280',
                        data: setting,
                        score: score
                    });
                }
            });
        }
        
        // Sort by score and limit results
        results = searchResults
            .sort((a, b) => b.score - a.score)
            .slice(0, CONFIG.maxResults);
        
        selectedIndex = 0;
        renderResults();
    }

    // ==================== FUZZY MATCHING SYSTEM ====================

    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} a - First string
     * @param {string} b - Second string
     * @returns {number} Edit distance
     */
    function levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        
        // Use two-row optimization for memory efficiency
        let prevRow = new Array(b.length + 1);
        let currRow = new Array(b.length + 1);
        
        // Initialize first row
        for (let j = 0; j <= b.length; j++) {
            prevRow[j] = j;
        }
        
        for (let i = 1; i <= a.length; i++) {
            currRow[0] = i;
            
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                currRow[j] = Math.min(
                    prevRow[j] + 1,      // deletion
                    currRow[j - 1] + 1,  // insertion
                    prevRow[j - 1] + cost // substitution
                );
            }
            
            // Swap rows
            [prevRow, currRow] = [currRow, prevRow];
        }
        
        return prevRow[b.length];
    }

    /**
     * Check if query matches initials of words in text
     * "ec" matches "Eagle Creek", "bc" matches "Base Camp"
     * @param {string} text - Text to match against
     * @param {string} query - Query (potential initials)
     * @returns {boolean} Whether initials match
     */
    function matchesInitials(text, query) {
        if (query.length < 2 || query.length > 6) return false;
        
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 2) return false;
        
        // Get first letter of each word
        const initials = words.map(w => w[0].toLowerCase()).join('');
        
        // Check if query matches initials exactly or as prefix
        if (initials === query || initials.startsWith(query)) {
            return true;
        }
        
        // Also check first N letters of each word for longer queries
        if (query.length >= words.length) {
            const charsPerWord = Math.ceil(query.length / words.length);
            const extendedInitials = words.map(w => 
                w.substring(0, charsPerWord).toLowerCase()
            ).join('');
            
            if (extendedInitials.startsWith(query)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Calculate word boundary match score
     * Checks if query matches at word boundaries (camelCase, snake_case, spaces)
     * @param {string} text - Text to match against
     * @param {string} query - Search query
     * @returns {number} Score (0-100)
     */
    function wordBoundaryScore(text, query) {
        // Split text into words (handle camelCase, snake_case, spaces)
        const words = text
            .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
            .replace(/[_-]/g, ' ')                  // snake_case, kebab-case
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 0);
        
        if (words.length === 0) return 0;
        
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        if (queryWords.length === 0) return 0;
        
        let matchedWords = 0;
        let totalScore = 0;
        
        for (const qWord of queryWords) {
            let bestWordScore = 0;
            
            for (const word of words) {
                let wordScore = 0;
                
                if (word === qWord) {
                    wordScore = 100;  // Exact word match
                } else if (word.startsWith(qWord)) {
                    wordScore = 80 - (word.length - qWord.length);  // Prefix match
                } else if (word.includes(qWord)) {
                    wordScore = 50;  // Contains
                } else {
                    // Levenshtein for short words
                    const dist = levenshteinDistance(word, qWord);
                    const maxLen = Math.max(word.length, qWord.length);
                    if (dist <= 2 && dist < maxLen * 0.4) {
                        wordScore = 30 - (dist * 10);  // Typo tolerance
                    }
                }
                
                bestWordScore = Math.max(bestWordScore, wordScore);
            }
            
            if (bestWordScore > 0) {
                matchedWords++;
                totalScore += bestWordScore;
            }
        }
        
        // Require all query words to match for multi-word queries
        if (queryWords.length > 1 && matchedWords < queryWords.length) {
            return 0;
        }
        
        // Average score with bonus for matching all words
        const avgScore = totalScore / queryWords.length;
        const allWordsBonus = (matchedWords === queryWords.length) ? 10 : 0;
        
        return Math.min(100, avgScore + allWordsBonus);
    }

    /**
     * Calculate fuzzy match score using multiple strategies
     * @param {string} text - Text to match against
     * @param {string} query - Search query
     * @returns {object} {score: number, matchType: string}
     */
    function fuzzyScore(text, query) {
        if (!text || !query) return { score: 0, matchType: 'none' };
        
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase().trim();
        
        if (lowerQuery.length === 0) return { score: 0, matchType: 'none' };
        
        // 1. Exact match (100 points)
        if (lowerText === lowerQuery) {
            return { score: 100, matchType: 'exact' };
        }
        
        // 2. Starts with (90 points, minus length difference penalty)
        if (lowerText.startsWith(lowerQuery)) {
            const lengthPenalty = Math.min(10, (lowerText.length - lowerQuery.length) / 2);
            return { score: 90 - lengthPenalty, matchType: 'prefix' };
        }
        
        // 3. Word starts with query (85 points) - "eagle" matches "Eagle Creek"
        const words = lowerText.split(/\s+/);
        for (const word of words) {
            if (word.startsWith(lowerQuery)) {
                const lengthPenalty = Math.min(5, (word.length - lowerQuery.length) / 2);
                return { score: 85 - lengthPenalty, matchType: 'word-prefix' };
            }
        }
        
        // 4. Typo tolerance on individual words (check early for better UX)
        // "bsaecamp" should find "basecamp" with good score
        const typoResult = checkTypoMatch(words, lowerQuery);
        if (typoResult.score > 0) {
            return typoResult;
        }
        
        // 5. Word boundary match for multi-word queries (up to 80 points)
        const wbScore = wordBoundaryScore(lowerText, lowerQuery);
        if (wbScore > 50) {
            return { score: Math.min(80, wbScore), matchType: 'word-boundary' };
        }
        
        // 6. Initials match (70 points)
        if (matchesInitials(lowerText, lowerQuery)) {
            return { score: 70, matchType: 'initials' };
        }
        
        // 7. Contains (55 points, minus position penalty)
        const containsIdx = lowerText.indexOf(lowerQuery);
        if (containsIdx !== -1) {
            const positionPenalty = Math.min(15, containsIdx / 2);
            return { score: 55 - positionPenalty, matchType: 'contains' };
        }
        
        // 8. Subsequence match (characters in order) with quality score
        const subseqResult = subsequenceMatch(lowerText, lowerQuery);
        if (subseqResult.matched) {
            const score = 25 + (subseqResult.quality * 20);  // 25-45 points
            return { score: score, matchType: 'subsequence' };
        }
        
        // 9. Word boundary with lower threshold (15-35 points)
        if (wbScore > 15) {
            return { score: wbScore, matchType: 'partial-word' };
        }
        
        return { score: 0, matchType: 'none' };
    }

    /**
     * Check for typo matches against words in text
     * @param {Array} words - Words in text
     * @param {string} query - Search query
     * @returns {object} {score: number, matchType: string}
     */
    function checkTypoMatch(words, query) {
        // Only check typos for reasonable length queries
        if (query.length < 3 || query.length > 15) {
            return { score: 0, matchType: 'none' };
        }
        
        let bestScore = 0;
        
        for (const word of words) {
            // Skip very short words
            if (word.length < 3) continue;
            
            const dist = levenshteinDistance(word, query);
            const maxLen = Math.max(word.length, query.length);
            const minLen = Math.min(word.length, query.length);
            
            // Calculate allowed distance based on word length
            // Longer words can have more typos
            let maxAllowedDist;
            if (minLen <= 4) {
                maxAllowedDist = 1;
            } else if (minLen <= 6) {
                maxAllowedDist = 2;
            } else {
                maxAllowedDist = 3;
            }
            
            // Check if it's a reasonable typo match
            if (dist <= maxAllowedDist && dist < maxLen * 0.4) {
                // Score based on similarity ratio
                const similarity = 1 - (dist / maxLen);
                const score = Math.round(35 + (similarity * 40));  // 35-75 points
                
                if (score > bestScore) {
                    bestScore = score;
                }
            }
        }
        
        if (bestScore > 0) {
            return { score: bestScore, matchType: 'typo' };
        }
        
        return { score: 0, matchType: 'none' };
    }

    /**
     * Calculate haversine distance in kilometers
     * @param {number} lat1 - First latitude
     * @param {number} lon1 - First longitude  
     * @param {number} lat2 - Second latitude
     * @param {number} lon2 - Second longitude
     * @returns {number} Distance in kilometers
     */
    function haversineDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Check if query is a subsequence of text (characters in order)
     * Returns quality score based on how compact the match is
     * @param {string} text - Text to search in
     * @param {string} query - Query pattern
     * @returns {object} {matched: boolean, quality: number 0-1}
     */
    function subsequenceMatch(text, query) {
        if (query.length > text.length) {
            return { matched: false, quality: 0 };
        }
        
        let queryIdx = 0;
        let firstMatchIdx = -1;
        let lastMatchIdx = -1;
        
        for (let i = 0; i < text.length && queryIdx < query.length; i++) {
            if (text[i] === query[queryIdx]) {
                if (firstMatchIdx === -1) firstMatchIdx = i;
                lastMatchIdx = i;
                queryIdx++;
            }
        }
        
        if (queryIdx !== query.length) {
            return { matched: false, quality: 0 };
        }
        
        // Quality = how compact the match is (query length / span)
        const span = lastMatchIdx - firstMatchIdx + 1;
        const quality = query.length / span;
        
        // Bonus for starting at word boundary
        const startsAtBoundary = firstMatchIdx === 0 || 
            /\s/.test(text[firstMatchIdx - 1]) ||
            /[A-Z]/.test(text[firstMatchIdx]);
        
        const finalQuality = startsAtBoundary ? Math.min(1, quality + 0.2) : quality;
        
        return { matched: true, quality: finalQuality };
    }

    /**
     * Calculate match score for an item using enhanced fuzzy matching
     * @param {object} item - Item to score
     * @param {string} query - Search query
     * @param {Array} fields - Fields to search in
     * @returns {number} Match score (0-100)
     */
    function calculateMatchScore(item, query, fields) {
        let maxScore = 0;
        let bestMatchType = 'none';
        
        for (const field of fields) {
            const value = item[field];
            if (!value) continue;
            
            const result = fuzzyScore(String(value), query);
            
            if (result.score > maxScore) {
                maxScore = result.score;
                bestMatchType = result.matchType;
            }
        }
        
        // Store match type for potential UI use
        item._matchType = bestMatchType;
        
        return maxScore;
    }

    /**
     * Legacy fuzzy match function (kept for compatibility)
     * @deprecated Use fuzzyScore instead
     */
    function fuzzyMatch(str, pattern) {
        const result = subsequenceMatch(str.toLowerCase(), pattern.toLowerCase());
        return result.matched;
    }

    /**
     * Parse coordinate query (various formats)
     */
    function parseCoordinateQuery(query) {
        // Decimal degrees: 37.4215, -119.1892 or 37.4215 -119.1892
        const ddMatch = query.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
        if (ddMatch) {
            const lat = parseFloat(ddMatch[1]);
            const lon = parseFloat(ddMatch[2]);
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                return {
                    lat,
                    lon,
                    display: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`
                };
            }
        }
        
        // DMS format: 37°25'17.4"N 119°11'21.1"W
        const dmsMatch = query.match(/(\d+)[°](\d+)['](\d+\.?\d*)["]?\s*([NSns])\s*(\d+)[°](\d+)['](\d+\.?\d*)["]?\s*([EWew])/);
        if (dmsMatch) {
            let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
            let lon = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
            if (dmsMatch[4].toLowerCase() === 's') lat = -lat;
            if (dmsMatch[8].toLowerCase() === 'w') lon = -lon;
            return {
                lat,
                lon,
                display: `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
            };
        }
        
        return null;
    }

    /**
     * Render search results
     */
    function renderResults() {
        const emptyEl = searchContainer.querySelector('#search-empty');
        const resultsEl = searchContainer.querySelector('#search-results-list');
        const countEl = searchContainer.querySelector('#search-count');
        
        if (results.length === 0) {
            emptyEl.style.display = 'block';
            resultsEl.style.display = 'none';
            countEl.textContent = query ? 'No results' : '';
            return;
        }
        
        emptyEl.style.display = 'none';
        resultsEl.style.display = 'block';
        countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
        
        // Group results by category
        const grouped = {};
        results.forEach((result, index) => {
            if (!grouped[result.category]) {
                grouped[result.category] = [];
            }
            grouped[result.category].push({ ...result, index });
        });
        
        let html = '';
        
        for (const [categoryId, items] of Object.entries(grouped)) {
            const category = CATEGORIES[categoryId];
            html += `
                <div class="global-search__group">
                    <div class="global-search__group-header">
                        ${category?.icon || '📋'} ${category?.name || categoryId}
                    </div>
                    ${items.map(item => {
                        const isFav = isFavorite(item.id);
                        return `
                        <div class="global-search__item ${item.index === selectedIndex ? 'global-search__item--selected' : ''} ${isFav ? 'global-search__item--favorited' : ''}"
                             data-index="${item.index}" data-item-id="${escapeHtml(item.id)}">
                            <span class="global-search__item-icon" style="color:${item.color || '#fff'}">${item.icon}</span>
                            <div class="global-search__item-content">
                                <div class="global-search__item-title">${highlightMatch(item.title, query)}${isFav ? ' <span class="global-search__fav-badge">★</span>' : ''}</div>
                                <div class="global-search__item-subtitle">${item.subtitle}</div>
                            </div>
                            <div class="global-search__item-actions">
                                <button class="global-search__item-fav" data-fav-index="${item.index}" title="${isFav ? 'Remove from favorites (Ctrl+D)' : 'Add to favorites (Ctrl+D)'}">${isFav ? '★' : '☆'}</button>
                                <kbd class="global-search__item-action">↵</kbd>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        resultsEl.innerHTML = html;
        
        // Event listeners handled by setupSearchDelegation()
        
        // Scroll selected into view
        scrollSelectedIntoView();
    }

    /**
     * Render recent searches
     */
    function renderRecentSearches() {
        const recentEl = searchContainer.querySelector('#search-recent');
        
        if (query) {
            recentEl.innerHTML = '';
            return;
        }
        
        // Build combined favorites + recent searches UI
        let html = '';
        
        // Favorites section (always shown if favorites exist)
        if (favorites.length > 0) {
            html += `
                <div class="global-search__favorites-section">
                    <div class="global-search__recent-header">
                        ⭐ Favorites
                        <button class="global-search__recent-clear" id="clear-favorites">Clear All</button>
                    </div>
                    <div class="global-search__favorites-list">
                        ${favorites.slice(0, 8).map((fav, idx) => `
                            <div class="global-search__favorite-item" data-favorite-id="${escapeHtml(fav.id)}" data-favorite-index="${idx}">
                                <span class="global-search__favorite-icon" style="color:${fav.color || '#fff'}">${fav.icon || '⭐'}</span>
                                <div class="global-search__favorite-content">
                                    <div class="global-search__favorite-title">${escapeHtml(fav.title)}</div>
                                    <div class="global-search__favorite-subtitle">${escapeHtml(fav.subtitle || fav.category)}</div>
                                </div>
                                <button class="global-search__favorite-remove" data-remove-id="${escapeHtml(fav.id)}" title="Remove from favorites">×</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Recent searches section
        if (recentSearches.length > 0) {
            html += `
                <div class="global-search__recent-section">
                    <div class="global-search__recent-header">
                        🕐 Recent Searches
                        <button class="global-search__recent-clear" id="clear-recent">Clear</button>
                    </div>
                    <div class="global-search__recent-list">
                        ${recentSearches.map(search => `
                            <button class="global-search__recent-item" data-query="${escapeHtml(search)}">
                                ${escapeHtml(search)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        recentEl.innerHTML = html;
        
        // Event listeners handled by setupSearchDelegation()
    }

    /**
     * Activate a favorite item
     */
    function activateFavorite(favorite) {
        // Reconstruct result object from favorite
        const result = {
            id: favorite.id,
            category: favorite.category,
            title: favorite.title,
            subtitle: favorite.subtitle,
            icon: favorite.icon,
            color: favorite.color,
            data: favorite.data
        };
        
        // Use the same activation logic as regular results
        switch (result.category) {
            case 'action':
                executeAction(result.data);
                break;
            case 'celestial':
                navigateToCelestial(result.data);
                break;
            case 'landmark':
                navigateToLandmark(result.data);
                break;
            case 'waypoint':
                navigateToWaypoint(result.data);
                break;
            case 'route':
                navigateToRoute(result.data);
                break;
            case 'team':
                navigateToTeamMember(result.data);
                break;
            case 'frequency':
                showFrequencyDetails(result.data);
                break;
            case 'help':
                showHelpTopic(result.data);
                break;
            case 'settings':
                executeSetting(result.data);
                break;
        }
        
        close();
    }

    // ==================== CONTEXTUAL SUGGESTIONS ====================

    /**
     * Gather and render all contextual suggestions when search is empty
     */
    function renderSuggestions() {
        if (query) {
            // Clear suggestions when typing
            clearSuggestionContainers();
            suggestionsMode = false;
            return;
        }
        
        suggestionsMode = true;
        suggestions = [];
        
        // Gather all suggestions
        const celestialSuggestions = getCelestialSuggestions();
        const navigationSuggestions = getNavigationSuggestions();
        const alertSuggestions = getAlertSuggestions();
        const recentActionSuggestions = getRecentActionSuggestions();
        
        // Combine suggestions (limit total)
        suggestions = [
            ...alertSuggestions.slice(0, 2),
            ...celestialSuggestions.slice(0, 3),
            ...navigationSuggestions.slice(0, 2),
            ...recentActionSuggestions.slice(0, 3)
        ];
        
        // Render suggestions
        renderSuggestionsUI();
        renderQuickActions();
        renderRecentSearches();
        
        // Reset selection
        selectedIndex = 0;
        if (suggestions.length > 0) {
            updateSuggestionSelection();
        }
    }

    /**
     * Clear suggestion containers
     */
    function clearSuggestionContainers() {
        const suggestionsEl = searchContainer.querySelector('#search-suggestions');
        const quickActionsEl = searchContainer.querySelector('#search-quick-actions');
        if (suggestionsEl) suggestionsEl.innerHTML = '';
        if (quickActionsEl) quickActionsEl.innerHTML = '';
    }

    /**
     * Get visible celestial body suggestions
     */
    function getCelestialSuggestions() {
        const suggestions = [];
        
        if (typeof CelestialModule === 'undefined') return suggestions;
        
        try {
            const now = new Date();
            const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
            
            // Check a few bright stars
            const starsToCheck = ['Sirius', 'Vega', 'Arcturus', 'Capella', 'Polaris', 'Betelgeuse'];
            
            for (const starName of starsToCheck) {
                try {
                    const pos = CelestialModule.getStarPosition(starName, now);
                    if (pos && !pos.error) {
                        const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                        if (altAz.altitude > 15) { // Only suggest if well above horizon
                            const starInfo = NAVIGATION_STARS.find(s => s.name === starName);
                            suggestions.push({
                                id: 'suggest-star-' + starName,
                                type: 'celestial',
                                title: starName,
                                subtitle: `Now visible • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`,
                                icon: starInfo && starInfo.magnitude < 1 ? '⭐' : '✦',
                                color: '#fbbf24',
                                data: { ...starInfo, type: 'star', altitude: altAz.altitude },
                                score: 50 + altAz.altitude // Higher altitude = more visible
                            });
                        }
                    }
                } catch (e) { }
            }
            
            // Check planets
            const planetsToCheck = ['venus', 'jupiter', 'mars', 'saturn'];
            for (const planet of planetsToCheck) {
                try {
                    const pos = CelestialModule.getPlanetPosition(planet, now);
                    if (pos && !pos.error) {
                        const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                        if (altAz.altitude > 10) {
                            const planetName = planet.charAt(0).toUpperCase() + planet.slice(1);
                            const planetInfo = PLANETS.find(p => p.name === planetName);
                            suggestions.push({
                                id: 'suggest-planet-' + planet,
                                type: 'celestial',
                                title: planetName,
                                subtitle: `Planet visible • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`,
                                icon: '🪐',
                                color: '#fbbf24',
                                data: { ...planetInfo, type: 'planet', altitude: altAz.altitude },
                                score: 60 + altAz.altitude
                            });
                        }
                    }
                } catch (e) { }
            }
            
            // Check Moon
            try {
                const moonPos = CelestialModule.getMoonPosition(now);
                if (moonPos && !moonPos.error) {
                    const altAz = CelestialModule.calculateAltAz(moonPos.GHA, moonPos.dec, mapState.lat, mapState.lon);
                    if (altAz.altitude > 5) {
                        suggestions.push({
                            id: 'suggest-moon',
                            type: 'celestial',
                            title: 'Moon',
                            subtitle: `Now visible • Alt ${altAz.altitude.toFixed(0)}° Az ${altAz.azimuth.toFixed(0)}°`,
                            icon: '🌙',
                            color: '#a5b4fc',
                            data: { name: 'Moon', type: 'moon', altitude: altAz.altitude },
                            score: 70 + altAz.altitude
                        });
                    }
                }
            } catch (e) { }
            
            // Sort by visibility score and return top items
            suggestions.sort((a, b) => b.score - a.score);
            
        } catch (e) {
            console.warn('Error getting celestial suggestions:', e);
        }
        
        return suggestions;
    }

    /**
     * Get active navigation suggestions
     */
    function getNavigationSuggestions() {
        const suggestions = [];
        
        // Check for active route navigation
        if (typeof NavigationModule !== 'undefined') {
            try {
                const navState = NavigationModule.getState ? NavigationModule.getState() : null;
                if (navState && navState.active && navState.route) {
                    const route = navState.route;
                    const progress = navState.progress || 0;
                    const remaining = navState.remainingDistance || '?';
                    
                    suggestions.push({
                        id: 'suggest-nav-active',
                        type: 'navigation',
                        title: `Continue: ${route.name || 'Active Route'}`,
                        subtitle: `${Math.round(progress * 100)}% complete • ${remaining} remaining`,
                        icon: '🧭',
                        color: '#3b82f6',
                        data: { action: 'continueNavigation', route },
                        score: 100 // High priority
                    });
                }
            } catch (e) { }
        }
        
        // Check for active hike
        if (typeof HikingModule !== 'undefined') {
            try {
                const hikeState = HikingModule.getState ? HikingModule.getState() : null;
                if (hikeState && hikeState.active) {
                    const duration = hikeState.duration || '0:00';
                    const distance = hikeState.distance || '0.0';
                    
                    suggestions.push({
                        id: 'suggest-hike-active',
                        type: 'navigation',
                        title: 'Active Hike',
                        subtitle: `${duration} elapsed • ${distance} mi traveled`,
                        icon: '🥾',
                        color: '#22c55e',
                        data: { action: 'viewHike' },
                        score: 95
                    });
                }
            } catch (e) { }
        }
        
        // Check for GPS-denied mode suggestion
        if (typeof GPSModule !== 'undefined') {
            try {
                const gpsState = GPSModule.getState ? GPSModule.getState() : null;
                if (gpsState && (!gpsState.available || gpsState.accuracy > 100)) {
                    suggestions.push({
                        id: 'suggest-resection',
                        type: 'action',
                        title: 'GPS signal weak',
                        subtitle: 'Use rangefinder resection to fix position',
                        icon: '📐',
                        color: '#f59e0b',
                        data: { action: 'rangefinderResection' },
                        score: 85
                    });
                }
            } catch (e) { }
        }
        
        return suggestions;
    }

    /**
     * Get alert suggestions (weather, emergencies, etc.)
     */
    function getAlertSuggestions() {
        const suggestions = [];
        
        // Check for weather alerts
        if (typeof WeatherModule !== 'undefined') {
            try {
                const weatherState = WeatherModule.getState ? WeatherModule.getState() : null;
                if (weatherState && weatherState.alerts && weatherState.alerts.length > 0) {
                    const alert = weatherState.alerts[0];
                    suggestions.push({
                        id: 'suggest-weather-alert',
                        type: 'alert',
                        title: `⚠️ ${alert.event || 'Weather Alert'}`,
                        subtitle: alert.headline || 'Tap to view details',
                        icon: '🌤️',
                        color: '#ef4444',
                        data: { action: 'viewWeatherAlert', alert },
                        score: 110 // Highest priority
                    });
                }
            } catch (e) { }
        }
        
        // Check for low battery warning (if available)
        if (typeof navigator !== 'undefined' && navigator.getBattery) {
            try {
                // Note: This is async, so we'd need to cache the result
                // For now, skip this to avoid complexity
            } catch (e) { }
        }
        
        // Check for offline status
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            suggestions.push({
                id: 'suggest-offline',
                type: 'alert',
                title: '📵 Offline Mode',
                subtitle: 'No internet connection - using cached data',
                icon: '📵',
                color: '#f59e0b',
                data: { action: 'viewOfflineStatus' },
                score: 80
            });
        }
        
        return suggestions;
    }

    /**
     * Get recent action suggestions
     */
    function getRecentActionSuggestions() {
        return recentActions.slice(0, 5).map((action, index) => ({
            id: 'suggest-recent-' + action.id,
            type: 'recent-action',
            title: action.name,
            subtitle: `Used ${formatTimeAgo(action.usedAt)}`,
            icon: action.icon,
            color: '#6b7280',
            data: action,
            score: 40 - index * 5 // More recent = higher score
        }));
    }

    /**
     * Format relative time
     */
    function formatTimeAgo(timestamp) {
        if (!timestamp) return 'recently';
        
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
        return `${Math.floor(diff / 86400000)} days ago`;
    }

    /**
     * Render suggestions UI
     */
    function renderSuggestionsUI() {
        const suggestionsEl = searchContainer.querySelector('#search-suggestions');
        
        if (suggestions.length === 0) {
            suggestionsEl.innerHTML = '';
            return;
        }
        
        // Group suggestions by type
        const alertItems = suggestions.filter(s => s.type === 'alert');
        const celestialItems = suggestions.filter(s => s.type === 'celestial');
        const navItems = suggestions.filter(s => s.type === 'navigation' || s.type === 'action');
        const recentItems = suggestions.filter(s => s.type === 'recent-action');
        
        let html = '';
        let itemIndex = 0;
        
        // Alerts section
        if (alertItems.length > 0) {
            html += `<div class="global-search__suggestion-group">
                <div class="global-search__group-header">⚠️ Alerts</div>
                ${alertItems.map(item => renderSuggestionItem(item, itemIndex++)).join('')}
            </div>`;
        }
        
        // Celestial section
        if (celestialItems.length > 0) {
            html += `<div class="global-search__suggestion-group">
                <div class="global-search__group-header">⭐ Now Visible</div>
                ${celestialItems.map(item => renderSuggestionItem(item, itemIndex++)).join('')}
            </div>`;
        }
        
        // Navigation section
        if (navItems.length > 0) {
            html += `<div class="global-search__suggestion-group">
                <div class="global-search__group-header">🧭 Navigation</div>
                ${navItems.map(item => renderSuggestionItem(item, itemIndex++)).join('')}
            </div>`;
        }
        
        // Recent actions section
        if (recentItems.length > 0) {
            html += `<div class="global-search__suggestion-group">
                <div class="global-search__group-header">🕐 Recent</div>
                ${recentItems.map(item => renderSuggestionItem(item, itemIndex++)).join('')}
            </div>`;
        }
        
        suggestionsEl.innerHTML = html;
        
        // Event listeners handled by setupSearchDelegation()
    }

    /**
     * Render a single suggestion item
     */
    function renderSuggestionItem(item, index) {
        return `
            <div class="global-search__item ${index === selectedIndex ? 'global-search__item--selected' : ''}"
                 data-index="${index}" data-suggestion-id="${item.id}">
                <span class="global-search__item-icon" style="color:${item.color || '#fff'}">${item.icon}</span>
                <div class="global-search__item-content">
                    <div class="global-search__item-title">${escapeHtml(item.title)}</div>
                    <div class="global-search__item-subtitle">${escapeHtml(item.subtitle)}</div>
                </div>
                <kbd class="global-search__item-action">↵</kbd>
            </div>
        `;
    }

    /**
     * Render quick action buttons
     */
    function renderQuickActions() {
        const quickActionsEl = searchContainer.querySelector('#search-quick-actions');
        
        // Define quick action buttons
        const quickActions = [
            { id: 'add-waypoint', name: 'Add Waypoint', icon: '📍', action: 'addWaypoint' },
            { id: 'measure-distance', name: 'Measure', icon: '📏', action: 'measureDistance' },
            { id: 'take-bearing', name: 'Compass', icon: '🧭', action: 'takeBearing' },
            { id: 'star-chart', name: 'Stars', icon: '⭐', action: 'starChart' }
        ];
        
        quickActionsEl.innerHTML = `
            <div class="global-search__quick-actions-grid">
                ${quickActions.map(qa => `
                    <button class="global-search__quick-action-btn" data-action="${qa.action}" title="${qa.name}">
                        <span class="global-search__quick-action-icon">${qa.icon}</span>
                        <span class="global-search__quick-action-label">${qa.name}</span>
                    </button>
                `).join('')}
            </div>
        `;
        
        // Event listeners handled by setupSearchDelegation()
    }

    /**
     * Update suggestion selection highlighting
     */
    function updateSuggestionSelection() {
        const items = searchContainer.querySelectorAll('#search-suggestions .global-search__item');
        items.forEach((item) => {
            item.classList.toggle('global-search__item--selected', parseInt(item.dataset.index) === selectedIndex);
        });
        
        // Scroll into view
        const selected = searchContainer.querySelector('#search-suggestions .global-search__item--selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /**
     * Activate the selected suggestion
     */
    function activateSuggestion() {
        if (suggestions.length === 0 || selectedIndex >= suggestions.length) return;
        
        const suggestion = suggestions[selectedIndex];
        
        // Handle based on suggestion type
        switch (suggestion.type) {
            case 'celestial':
                navigateToCelestial(suggestion.data);
                break;
                
            case 'navigation':
            case 'action':
                if (suggestion.data.action) {
                    const action = ACTION_COMMANDS.find(a => a.action === suggestion.data.action);
                    if (action) {
                        executeAction(action);
                    } else {
                        // Handle special navigation actions
                        handleSpecialAction(suggestion.data.action, suggestion.data);
                    }
                }
                break;
                
            case 'alert':
                handleAlertAction(suggestion.data);
                break;
                
            case 'recent-action':
                executeAction(suggestion.data);
                break;
        }
        
        close();
    }

    /**
     * Handle special navigation/alert actions
     */
    function handleSpecialAction(action, data) {
        switch (action) {
            case 'continueNavigation':
                State.UI.setActivePanel('navigation');
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'navigation' });
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Resuming navigation', 'info', 2000);
                }
                break;
                
            case 'viewHike':
                State.UI.setActivePanel('navigation');
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'navigation' });
                break;
                
            case 'viewOfflineStatus':
                State.UI.setActivePanel('offline');
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'offline' });
                break;
        }
    }

    /**
     * Handle alert-specific actions
     */
    function handleAlertAction(data) {
        if (data.action === 'viewWeatherAlert') {
            State.UI.setActivePanel('weather');
            Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'weather' });
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`Weather Alert: ${data.alert?.event || 'Active'}`, 'warning', 3000);
            }
        }
    }

    /**
     * Track action usage for recent actions
     */
    function trackActionUsage(action) {
        // Remove if already exists
        recentActions = recentActions.filter(a => a.id !== action.id);
        
        // Add to front with timestamp
        recentActions.unshift({
            ...action,
            usedAt: Date.now()
        });
        
        // Limit to 10 recent actions
        recentActions = recentActions.slice(0, 10);
        
        // Persist to localStorage
        saveRecentActions();
    }

    /**
     * Save recent actions to localStorage
     */
    function saveRecentActions() {
        try {
            localStorage.setItem('griddown_recent_actions', JSON.stringify(recentActions));
        } catch (e) {
            console.warn('Failed to save recent actions:', e);
        }
    }

    /**
     * Load recent actions from localStorage
     */
    function loadRecentActions() {
        try {
            const saved = localStorage.getItem('griddown_recent_actions');
            if (saved) {
                recentActions = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load recent actions:', e);
            recentActions = [];
        }
    }

    /**
     * Highlight matching text
     */
    function highlightMatch(text, query) {
        if (!query || !text) return escapeHtml(text || '');
        
        const escaped = escapeHtml(text);
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        const index = lowerText.indexOf(lowerQuery);
        
        if (index === -1) return escaped;
        
        const before = escapeHtml(text.substring(0, index));
        const match = escapeHtml(text.substring(index, index + query.length));
        const after = escapeHtml(text.substring(index + query.length));
        
        return `${before}<mark class="global-search__highlight">${match}</mark>${after}`;
    }

    /**
     * Select next result
     */
    function selectNext() {
        if (results.length === 0 && !suggestionsMode) return;
        
        const itemCount = suggestionsMode ? suggestions.length : results.length;
        if (itemCount === 0) return;
        
        selectedIndex = (selectedIndex + 1) % itemCount;
        
        if (suggestionsMode) {
            updateSuggestionSelection();
        } else {
            updateSelection();
        }
    }

    /**
     * Select previous result
     */
    function selectPrevious() {
        if (results.length === 0 && !suggestionsMode) return;
        
        const itemCount = suggestionsMode ? suggestions.length : results.length;
        if (itemCount === 0) return;
        
        selectedIndex = (selectedIndex - 1 + itemCount) % itemCount;
        
        if (suggestionsMode) {
            updateSuggestionSelection();
        } else {
            updateSelection();
        }
    }

    /**
     * Update selection highlighting
     */
    function updateSelection() {
        const items = searchContainer.querySelectorAll('.global-search__item');
        items.forEach((item, i) => {
            item.classList.toggle('global-search__item--selected', parseInt(item.dataset.index) === selectedIndex);
        });
        scrollSelectedIntoView();
    }

    /**
     * Scroll selected item into view
     */
    function scrollSelectedIntoView() {
        const selected = searchContainer.querySelector('.global-search__item--selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    /**
     * Activate the selected result
     */
    function activateSelected() {
        // If in suggestions mode, use suggestion activation
        if (suggestionsMode && suggestions.length > 0) {
            activateSuggestion();
            return;
        }
        
        if (results.length === 0 || selectedIndex >= results.length) return;
        
        const result = results[selectedIndex];
        
        // Save to recent searches
        addRecentSearch(query);
        
        // Handle based on category
        switch (result.category) {
            case 'action':
                executeAction(result.data);
                break;
                
            case 'celestial':
                navigateToCelestial(result.data);
                break;
                
            case 'landmark':
                navigateToLandmark(result.data);
                break;
                
            case 'waypoint':
                navigateToWaypoint(result.data);
                break;
                
            case 'route':
                navigateToRoute(result.data);
                break;
                
            case 'team':
                navigateToTeamMember(result.data);
                break;
                
            case 'frequency':
                showFrequencyDetails(result.data);
                break;
                
            case 'location':
                navigateToCoordinates(result.data);
                break;
                
            case 'help':
                showHelpTopic(result.data);
                break;
                
            case 'settings':
                executeSetting(result.data);
                break;
        }
        
        close();
    }

    /**
     * Navigate to a waypoint
     */
    function navigateToWaypoint(waypoint) {
        // Select the waypoint
        State.Waypoints.select(waypoint);
        
        // Center map on waypoint
        const lat = waypoint.lat || (37.4215 + (waypoint.y - 50) * 0.002);
        const lon = waypoint.lon || (-119.1892 + (waypoint.x - 50) * 0.004);
        
        if (typeof MapModule !== 'undefined' && MapModule.setCenter) {
            MapModule.setCenter(lat, lon, 15);
        }
        
        // Switch to waypoints panel
        State.UI.setActivePanel('waypoints');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'waypoints' });
        
        // Show toast
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`Showing: ${waypoint.name}`, 'success');
        }
        
        // Emit event
        Events.emit('search:navigate', { type: 'waypoint', data: waypoint });
    }

    /**
     * Navigate to a landmark and show action options
     */
    function navigateToLandmark(landmark) {
        // Center map on landmark
        if (typeof MapModule !== 'undefined' && MapModule.setCenter) {
            MapModule.setCenter(landmark.lat, landmark.lon, 14);
        }
        
        // Show landmark action modal
        showLandmarkActionModal(landmark);
        
        // Emit event
        Events.emit('search:navigate', { type: 'landmark', data: landmark });
    }

    /**
     * Show action modal for a landmark
     */
    function showLandmarkActionModal(landmark) {
        const typeInfo = landmark.typeInfo || { icon: '🏔️', label: 'Landmark' };
        const elevationStr = landmark.elevation ? `${landmark.elevation.toLocaleString()}m` : '';
        
        // Create modal content
        const modalHtml = `
            <div class="landmark-action-modal">
                <div class="landmark-action-modal__header">
                    <span class="landmark-action-modal__icon">${typeInfo.icon}</span>
                    <div class="landmark-action-modal__info">
                        <h3 class="landmark-action-modal__name">${escapeHtml(landmark.name)}</h3>
                        <div class="landmark-action-modal__details">
                            ${elevationStr ? `<span>${elevationStr}</span>` : ''}
                            ${landmark.source ? `<span>• ${escapeHtml(landmark.source)}</span>` : ''}
                        </div>
                        <div class="landmark-action-modal__coords">
                            ${landmark.lat.toFixed(5)}°, ${landmark.lon.toFixed(5)}°
                        </div>
                    </div>
                </div>
                <div class="landmark-action-modal__actions">
                    <button class="landmark-action-btn" data-action="show-map">
                        <span class="landmark-action-btn__icon">🗺️</span>
                        <span class="landmark-action-btn__label">Show on Map</span>
                    </button>
                    <button class="landmark-action-btn" data-action="add-resection">
                        <span class="landmark-action-btn__icon">📐</span>
                        <span class="landmark-action-btn__label">Add to Resection</span>
                    </button>
                    <button class="landmark-action-btn" data-action="save-waypoint">
                        <span class="landmark-action-btn__icon">📍</span>
                        <span class="landmark-action-btn__label">Save as Waypoint</span>
                    </button>
                    <button class="landmark-action-btn" data-action="copy-coords">
                        <span class="landmark-action-btn__icon">📋</span>
                        <span class="landmark-action-btn__label">Copy Coordinates</span>
                    </button>
                </div>
                <div class="landmark-action-modal__legal">
                    Data source: ${escapeHtml(landmark.source || 'Unknown')} (Public Domain)
                </div>
            </div>
        `;
        
        // Show modal using ModalsModule or create simple overlay
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showCustomModal) {
            const modal = ModalsModule.showCustomModal(modalHtml, {
                title: 'Landmark',
                width: '320px'
            });
            
            // Bind action buttons
            modal.querySelectorAll('.landmark-action-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    handleLandmarkAction(btn.dataset.action, landmark);
                    ModalsModule.closeModal();
                });
            });
        } else {
            // Fallback: just show on map and toast
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`${typeInfo.icon} ${landmark.name} • ${elevationStr}`, 'info', 4000);
            }
        }
    }

    /**
     * Handle landmark action button clicks
     */
    function handleLandmarkAction(action, landmark) {
        switch (action) {
            case 'show-map':
                // Already centered, just ensure map is visible
                if (typeof MapModule !== 'undefined') {
                    // Add a temporary marker
                    MapModule.addTemporaryMarker?.(landmark.lat, landmark.lon, {
                        title: landmark.name,
                        icon: landmark.typeInfo?.icon || '🏔️'
                    });
                }
                break;
                
            case 'add-resection':
                if (typeof LandmarkModule !== 'undefined') {
                    const added = LandmarkModule.addToResection(landmark.id);
                    if (added) {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Added ${landmark.name} to resection`, 'success');
                        }
                        // Open celestial panel with rangefinder section
                        State.UI.setActivePanel('celestial');
                        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'celestial' });
                        
                        // Scroll to resection widget after a brief delay
                        setTimeout(() => {
                            const resectionEl = document.getElementById('resection-widget');
                            if (resectionEl) {
                                resectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 300);
                    }
                } else {
                    // Direct add to RangefinderModule if available
                    if (typeof RangefinderModule !== 'undefined') {
                        RangefinderModule.addLandmark({
                            id: landmark.id,
                            name: landmark.name,
                            position: { lat: landmark.lat, lon: landmark.lon },
                            elevation: landmark.elevation,
                            source: 'landmark_pack',
                            icon: landmark.typeInfo?.icon || '🏔️'
                        });
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Added ${landmark.name} to resection`, 'success');
                        }
                    }
                }
                break;
                
            case 'save-waypoint':
                if (typeof LandmarkModule !== 'undefined') {
                    const wp = LandmarkModule.saveAsWaypoint(landmark.id);
                    if (wp) {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Saved ${landmark.name} as waypoint`, 'success');
                        }
                        // Open waypoints panel
                        State.UI.setActivePanel('waypoints');
                        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'waypoints' });
                    }
                } else {
                    // Direct add to waypoints
                    const newWaypoint = {
                        id: `wp_${Date.now()}`,
                        name: landmark.name,
                        lat: landmark.lat,
                        lon: landmark.lon,
                        type: 'custom',
                        elevation: landmark.elevation,
                        notes: `From ${landmark.source}`,
                        icon: landmark.typeInfo?.icon || '🏔️',
                        createdAt: new Date().toISOString()
                    };
                    
                    if (typeof State !== 'undefined' && State.Waypoints) {
                        State.Waypoints.add(newWaypoint);
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast(`Saved ${landmark.name} as waypoint`, 'success');
                        }
                    }
                }
                break;
                
            case 'copy-coords':
                const coordStr = `${landmark.lat.toFixed(6)}, ${landmark.lon.toFixed(6)}`;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(coordStr).then(() => {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast('Coordinates copied!', 'success');
                        }
                    }).catch(() => {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast('Could not copy coordinates', 'error');
                        }
                    });
                }
                break;
        }
    }

    /**
     * Show help topic content
     */
    function showHelpTopic(topic) {
        // If topic has a panel, navigate directly to it
        if (topic.panel) {
            State.UI.setActivePanel(topic.panel);
            Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: topic.panel });
            if (Helpers.isMobile()) State.UI.openPanel();
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast(`${topic.icon} ${topic.name}: ${topic.content}`, 'info', 3000);
            }
            Events.emit('search:help', { topic });
            return;
        }
        
        // No panel — show informational modal
        const modalHtml = `
            <div class="help-topic-modal">
                <div class="help-topic-modal__header">
                    <span class="help-topic-modal__icon">${topic.icon}</span>
                    <h3 class="help-topic-modal__title">${escapeHtml(topic.name)}</h3>
                </div>
                <div class="help-topic-modal__content">
                    <p class="help-topic-modal__description">${escapeHtml(topic.description)}</p>
                    <div class="help-topic-modal__body">
                        ${escapeHtml(topic.content)}
                    </div>
                </div>
                <div class="help-topic-modal__keywords">
                    ${topic.keywords.map(kw => `<span class="help-topic-modal__tag">${escapeHtml(kw)}</span>`).join('')}
                </div>
            </div>
        `;
        
        if (typeof ModalsModule !== 'undefined' && ModalsModule.showCustomModal) {
            ModalsModule.showCustomModal(modalHtml, {
                title: 'Help',
                width: '400px'
            });
        } else if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`${topic.icon} ${topic.name}: ${topic.description}`, 'info', 5000);
        }
        
        Events.emit('search:help', { topic });
    }

    /**
     * Execute a setting action
     */
    function executeSetting(setting) {
        // Track as recent action
        trackActionUsage({
            id: setting.id,
            name: setting.name,
            icon: setting.icon,
            action: setting.action
        });
        
        // Handle panel navigation
        if (setting.panel) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('open');
            State.UI.setActivePanel(setting.panel);
            Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: setting.panel });
            return;
        }
        
        // Handle setting actions
        switch (setting.action) {
            case 'toggleNightMode':
                if (typeof NightModeModule !== 'undefined') {
                    NightModeModule.toggle();
                    const isEnabled = document.body.classList.contains('night-mode');
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast(`Night mode ${isEnabled ? 'enabled' : 'disabled'}`, 'success');
                    }
                }
                break;
                
            case 'toggleUnits':
                // Toggle between metric and imperial
                const currentUnits = localStorage.getItem('griddown_units') || 'metric';
                const newUnits = currentUnits === 'metric' ? 'imperial' : 'metric';
                localStorage.setItem('griddown_units', newUnits);
                Events.emit('settings:units', { units: newUnits });
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`Units: ${newUnits}`, 'success');
                }
                break;
                
            case 'cycleCoordFormat':
                const formats = ['decimal', 'dms', 'ddm'];
                const currentFormat = localStorage.getItem('griddown_coord_format') || 'decimal';
                const currentIdx = formats.indexOf(currentFormat);
                const newFormat = formats[(currentIdx + 1) % formats.length];
                localStorage.setItem('griddown_coord_format', newFormat);
                Events.emit('settings:coordFormat', { format: newFormat });
                if (typeof ModalsModule !== 'undefined') {
                    const formatNames = { decimal: 'Decimal Degrees', dms: 'DMS (° \' ")', ddm: 'Degrees Decimal Minutes' };
                    ModalsModule.showToast(`Coordinates: ${formatNames[newFormat]}`, 'success');
                }
                break;
                
            case 'changeMapLayer':
                // Open map panel (layers are in map panel)
                State.UI.setActivePanel('map');
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'map' });
                break;
                
            case 'openOfflineMaps':
                State.UI.setActivePanel('offline');
                Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'offline' });
                break;
                
            case 'toggleGpsAccuracy':
                const showAccuracy = localStorage.getItem('griddown_show_gps_accuracy') !== 'false';
                localStorage.setItem('griddown_show_gps_accuracy', !showAccuracy);
                Events.emit('settings:gpsAccuracy', { show: !showAccuracy });
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`GPS accuracy circle ${!showAccuracy ? 'shown' : 'hidden'}`, 'success');
                }
                break;
                
            case 'toggleTrackPosition':
                const tracking = localStorage.getItem('griddown_track_position') !== 'false';
                localStorage.setItem('griddown_track_position', !tracking);
                Events.emit('settings:trackPosition', { enabled: !tracking });
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`Position tracking ${!tracking ? 'enabled' : 'disabled'}`, 'success');
                }
                break;
                
            case 'toggleSounds':
                const soundsOn = localStorage.getItem('griddown_sounds') !== 'false';
                localStorage.setItem('griddown_sounds', !soundsOn);
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`Sounds ${!soundsOn ? 'enabled' : 'disabled'}`, 'success');
                }
                break;
                
            case 'clearAllData':
                if (confirm('Are you sure you want to delete all data? This cannot be undone.')) {
                    localStorage.clear();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('All data cleared. Reloading...', 'warning', 2000);
                    }
                    setTimeout(() => window.location.reload(), 2000);
                }
                break;
                
            case 'exportAllData':
                exportAllData();
                break;
                
            case 'showAbout':
                const version = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '6.43.0';
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`GridDown v${version}`, 'info', 3000);
                }
                break;
                
            case 'showPrivacy':
                // Could open privacy policy modal or link
                window.open('PRIVACY.md', '_blank');
                break;
                
            default:
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`${setting.icon} ${setting.name}`, 'info');
                }
        }
        
        Events.emit('search:setting', { setting });
    }

    /**
     * Export all user data as JSON
     */
    function exportAllData() {
        try {
            const data = {
                exportDate: new Date().toISOString(),
                version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '6.43.0',
                waypoints: State.get('waypoints') || [],
                routes: State.get('routes') || [],
                team: State.get('team') || [],
                frequencies: State.get('frequencies') || [],
                settings: {
                    units: localStorage.getItem('griddown_units'),
                    coordFormat: localStorage.getItem('griddown_coord_format'),
                    theme: localStorage.getItem('griddown_theme')
                }
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `griddown-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Data exported successfully', 'success');
            }
        } catch (e) {
            console.error('Export failed:', e);
            if (typeof ModalsModule !== 'undefined') {
                ModalsModule.showToast('Export failed', 'error');
            }
        }
    }

    // ==================== FAVORITES SYSTEM ====================

    /**
     * Add item to favorites
     * @param {object} item - Item to favorite (must have id, category, title)
     */
    function addFavorite(item) {
        if (!item || !item.id) return false;
        
        // Check if already favorited
        if (favorites.some(f => f.id === item.id)) {
            return false;
        }
        
        const favorite = {
            id: item.id,
            category: item.category,
            title: item.title,
            subtitle: item.subtitle,
            icon: item.icon,
            color: item.color,
            data: item.data,
            favoritedAt: Date.now()
        };
        
        favorites.unshift(favorite);
        
        // Limit favorites
        if (favorites.length > 20) {
            favorites = favorites.slice(0, 20);
        }
        
        saveFavorites();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`★ Added to favorites`, 'success', 1500);
        }
        
        return true;
    }

    /**
     * Remove item from favorites
     * @param {string} itemId - ID of item to remove
     */
    function removeFavorite(itemId) {
        const index = favorites.findIndex(f => f.id === itemId);
        if (index === -1) return false;
        
        favorites.splice(index, 1);
        saveFavorites();
        
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`Removed from favorites`, 'info', 1500);
        }
        
        return true;
    }

    /**
     * Check if item is favorited
     * @param {string} itemId - ID to check
     */
    function isFavorite(itemId) {
        return favorites.some(f => f.id === itemId);
    }

    /**
     * Toggle favorite status
     * @param {object} item - Item to toggle
     */
    function toggleFavorite(item) {
        if (isFavorite(item.id)) {
            return removeFavorite(item.id);
        } else {
            return addFavorite(item);
        }
    }

    /**
     * Get all favorites
     */
    function getFavorites() {
        return [...favorites];
    }

    /**
     * Save favorites to localStorage
     */
    function saveFavorites() {
        try {
            localStorage.setItem('griddown_search_favorites', JSON.stringify(favorites));
        } catch (e) {
            console.warn('Failed to save favorites:', e);
        }
    }

    /**
     * Load favorites from localStorage
     */
    function loadFavorites() {
        try {
            const saved = localStorage.getItem('griddown_search_favorites');
            if (saved) {
                favorites = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load favorites:', e);
            favorites = [];
        }
    }

    /**
     * Execute an action command
     */
    function executeAction(action) {
        // Track action usage for suggestions
        trackActionUsage(action);
        
        // Open sidebar if there's a target panel
        if (action.panel) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('open');
            State.UI.setActivePanel(action.panel);
            Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: action.panel });
        }
        
        // Execute the specific action
        switch (action.action) {
            case 'addWaypoint':
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.openWaypointModal();
                }
                break;
                
            case 'addWaypointHere':
                if (typeof MapModule !== 'undefined') {
                    const mapState = MapModule.getMapState();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.openWaypointModal(null, {
                            lat: mapState.lat,
                            lon: mapState.lon
                        });
                    }
                }
                break;
                
            case 'newRoute':
                if (typeof RouteBuilderModule !== 'undefined') {
                    RouteBuilderModule.startBuilding();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Route building started. Click on map to add points.', 'info', 3000);
                    }
                }
                break;
                
            case 'startNavigation':
                // Just open navigation panel - user selects route
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Select a route to begin navigation', 'info', 2000);
                }
                break;
                
            case 'stopNavigation':
                if (typeof NavigationModule !== 'undefined') {
                    NavigationModule.stopNavigation();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Navigation stopped', 'info', 2000);
                    }
                    if (typeof MapModule !== 'undefined') {
                        MapModule.render();
                    }
                }
                break;
                
            case 'measureDistance':
                if (typeof MeasureModule !== 'undefined') {
                    MeasureModule.toggle();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Click on map to measure distances', 'info', 3000);
                    }
                }
                break;
                
            case 'takeBearing':
                // Open GPS panel for compass
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('View compass bearing in GPS panel', 'info', 2000);
                }
                break;
                
            case 'findPosition':
                if (typeof GPSModule !== 'undefined') {
                    GPSModule.requestPosition();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Acquiring GPS position...', 'info', 2000);
                    }
                }
                break;
                
            case 'rangefinderResection':
                // Scroll to resection widget in navigation panel
                setTimeout(() => {
                    const widget = document.getElementById('resection-widget');
                    if (widget) {
                        widget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 300);
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Add landmarks and enter distances to calculate position', 'info', 3000);
                }
                break;
                
            case 'starChart':
                // Switch to observe tab in celestial panel
                setTimeout(() => {
                    if (typeof PanelsModule !== 'undefined') {
                        PanelsModule.render();
                    }
                }, 100);
                break;
                
            case 'starId':
                // Start star ID mode
                setTimeout(() => {
                    const startBtn = document.getElementById('star-id-start');
                    if (startBtn) startBtn.click();
                }, 300);
                break;
                
            case 'cameraSextant':
                // Start camera sextant
                setTimeout(() => {
                    const sextantBtn = document.getElementById('camera-sextant-start');
                    if (sextantBtn) sextantBtn.click();
                }, 300);
                break;
                
            case 'startObservation':
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Select a celestial body to observe', 'info', 2000);
                }
                break;
                
            case 'downloadMaps':
                // Open offline panel
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Select a region to download for offline use', 'info', 3000);
                }
                break;
                
            case 'changeMapLayer':
                // This would ideally open a layer selector modal
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast('Use map controls to change layers', 'info', 2000);
                }
                break;
                
            case 'checkWeather':
                if (typeof WeatherModule !== 'undefined' && WeatherModule.getMapCenterWeather) {
                    WeatherModule.getMapCenterWeather().catch(() => {});
                }
                break;
                
            case 'satelliteWeather':
                // Switch to satellite weather section
                setTimeout(() => {
                    const satSection = document.querySelector('[data-weather-tab="satellite"]');
                    if (satSection) satSection.click();
                }, 300);
                break;
                
            case 'commPlan':
                // Already opened radio panel
                break;
                
            case 'emergencySOS':
                if (typeof SOSModule !== 'undefined' && SOSModule.open) {
                    SOSModule.open();
                }
                break;
                
            case 'startHike':
                if (typeof HikingModule !== 'undefined') {
                    // Open hike config modal via navigation panel
                    setTimeout(() => {
                        const startBtn = document.getElementById('start-hike-btn');
                        if (startBtn) startBtn.click();
                    }, 300);
                }
                break;
                
            case 'stopHike':
                if (typeof HikingModule !== 'undefined') {
                    const summary = HikingModule.stopHike();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Hike stopped', 'success', 2000);
                    }
                }
                break;
                
            case 'centerOnPosition':
                if (typeof GPSModule !== 'undefined' && typeof MapModule !== 'undefined') {
                    const pos = GPSModule.getPosition();
                    if (pos && pos.lat && pos.lon) {
                        MapModule.setCenter(pos.lat, pos.lon);
                        MapModule.render();
                    } else {
                        if (typeof ModalsModule !== 'undefined') {
                            ModalsModule.showToast('No GPS position available', 'warning', 2000);
                        }
                    }
                }
                break;
                
            case 'resetBearing':
                if (typeof MapModule !== 'undefined' && MapModule.resetBearing) {
                    MapModule.resetBearing();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast('Map reset to north', 'success', 1500);
                    }
                }
                break;
                
            case 'toggleNightMode':
                if (typeof NightModeModule !== 'undefined') {
                    NightModeModule.toggle();
                    const isNight = NightModeModule.isActive();
                    if (typeof ModalsModule !== 'undefined') {
                        ModalsModule.showToast(isNight ? 'Night mode enabled' : 'Night mode disabled', 'success', 1500);
                    }
                } else {
                    document.body.classList.toggle('night-mode');
                }
                break;
                
            case 'showKeyboardShortcuts':
                showKeyboardShortcutsModal();
                break;
                
            case 'openWizard':
                if (typeof SituationWizard !== 'undefined') {
                    SituationWizard.open();
                }
                break;
                
            case 'openWizardLost':
                if (typeof SituationWizard !== 'undefined') {
                    SituationWizard.open();
                    setTimeout(() => SituationWizard.navigateTo('lost'), 100);
                }
                break;
                
            case 'openWizardEmergency':
                if (typeof SituationWizard !== 'undefined') {
                    SituationWizard.open();
                    setTimeout(() => SituationWizard.navigateTo('emergency'), 100);
                }
                break;
                
            default:
                console.warn('Unknown action:', action.action);
                if (typeof ModalsModule !== 'undefined') {
                    ModalsModule.showToast(`Action: ${action.name}`, 'info', 2000);
                }
        }
        
        // Emit event
        Events.emit('search:action', { action: action.action, data: action });
    }

    /**
     * Show keyboard shortcuts modal
     */
    function showKeyboardShortcutsModal() {
        const shortcuts = [
            { key: 'Ctrl+K', desc: 'Open search' },
            { key: 'Esc', desc: 'Close search / Cancel' },
            { key: '↑/↓', desc: 'Navigate results' },
            { key: 'Enter', desc: 'Select result' },
            { key: 'Tab', desc: 'Next category' },
            { key: 'Shift+Tab', desc: 'Previous category' },
            { key: '+/-', desc: 'Zoom in/out' },
            { key: 'N', desc: 'Reset map north' },
            { key: 'L', desc: 'Toggle layers' },
            { key: 'G', desc: 'Go to GPS position' },
            { key: 'M', desc: 'Toggle measurement' }
        ];
        
        const modal = document.createElement('div');
        modal.id = 'shortcuts-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
        modal.innerHTML = `
            <div style="background:var(--color-bg-elevated, #1f2937);border-radius:16px;max-width:400px;width:100%;max-height:80vh;overflow:hidden">
                <div style="padding:16px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:16px;font-weight:600">⌨️ Keyboard Shortcuts</div>
                    <button id="shortcuts-close" style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-size:18px">✕</button>
                </div>
                <div style="padding:16px;max-height:60vh;overflow-y:auto">
                    ${shortcuts.map(s => `
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                            <kbd style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:4px;font-family:monospace;font-size:12px">${s.key}</kbd>
                            <span style="color:rgba(255,255,255,0.7);font-size:13px">${s.desc}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('#shortcuts-close');
        closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        // Close on Esc
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * Navigate to a celestial body
     */
    function navigateToCelestial(body) {
        // Open celestial panel
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('open');
        State.UI.setActivePanel('celestial');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'celestial' });
        
        // Get position info for the body
        let positionInfo = null;
        const mapState = typeof MapModule !== 'undefined' ? MapModule.getMapState() : { lat: 37.4215, lon: -119.1892 };
        
        if (typeof CelestialModule !== 'undefined') {
            try {
                let pos = null;
                
                if (body.type === 'star') {
                    pos = CelestialModule.getStarPosition(body.name, new Date());
                } else if (body.type === 'planet') {
                    pos = CelestialModule.getPlanetPosition(body.name.toLowerCase(), new Date());
                } else if (body.type === 'sun') {
                    pos = CelestialModule.getSunPosition(new Date());
                } else if (body.type === 'moon') {
                    pos = CelestialModule.getMoonPosition(new Date());
                }
                
                if (pos && !pos.error) {
                    const altAz = CelestialModule.calculateAltAz(pos.GHA, pos.dec, mapState.lat, mapState.lon);
                    positionInfo = {
                        altitude: altAz.altitude,
                        azimuth: altAz.azimuth,
                        visible: altAz.altitude > 0
                    };
                }
            } catch (e) {
                console.warn('Error getting celestial position:', e);
            }
        }
        
        // Show detailed toast with position
        if (typeof ModalsModule !== 'undefined') {
            let message = body.name;
            if (positionInfo) {
                if (positionInfo.visible) {
                    message += ` - Alt ${positionInfo.altitude.toFixed(1)}°, Az ${positionInfo.azimuth.toFixed(1)}°`;
                } else {
                    message += ' - Currently below horizon';
                }
            }
            ModalsModule.showToast(message, 'success', 3000);
        }
        
        // If CelestialModule has a selectBody function, use it
        if (typeof CelestialModule !== 'undefined' && CelestialModule.selectBody) {
            CelestialModule.selectBody(body.name, body.type);
        }
        
        // Emit event
        Events.emit('search:celestial', { body: body, position: positionInfo });
    }

    /**
     * Navigate to a route
     */
    function navigateToRoute(route) {
        // Select the route
        State.Routes.select(route);
        
        // Center map on route midpoint
        if (route.points && route.points.length > 0) {
            const midIndex = Math.floor(route.points.length / 2);
            const midPoint = route.points[midIndex];
            const lat = midPoint.lat || (37.4215 + ((midPoint.y || 50) - 50) * 0.002);
            const lon = midPoint.lon || (-119.1892 + ((midPoint.x || 50) - 50) * 0.004);
            
            if (typeof MapModule !== 'undefined' && MapModule.setCenter) {
                MapModule.setCenter(lat, lon, 12);
            }
        }
        
        // Switch to routes panel
        State.UI.setActivePanel('routes');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'routes' });
        
        // Show toast
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`Showing: ${route.name}`, 'success');
        }
        
        // Emit event
        Events.emit('search:navigate', { type: 'route', data: route });
    }

    /**
     * Navigate to a team member
     */
    function navigateToTeamMember(member) {
        // Center map on team member
        if (member.lat && member.lon) {
            if (typeof MapModule !== 'undefined' && MapModule.setCenter) {
                MapModule.setCenter(member.lat, member.lon, 15);
            }
        }
        
        // Switch to team panel
        State.UI.setActivePanel('team');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'team' });
        
        // Show toast
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`Showing: ${member.name || member.callsign}`, 'success');
        }
        
        // Emit event
        Events.emit('search:navigate', { type: 'team', data: member });
    }

    /**
     * Show frequency details
     */
    function showFrequencyDetails(freq) {
        // Switch to radio panel
        State.UI.setActivePanel('radio');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'radio' });
        
        // Show toast with frequency info
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`${freq.name || 'Frequency'}: ${freq.freq || freq.frequency} MHz`, 'info');
        }
        
        // Emit event
        Events.emit('search:navigate', { type: 'frequency', data: freq });
    }

    /**
     * Navigate to coordinates
     */
    function navigateToCoordinates(coords) {
        if (typeof MapModule !== 'undefined' && MapModule.setCenter) {
            MapModule.setCenter(coords.lat, coords.lon, 15);
        }
        
        // Switch to map panel
        State.UI.setActivePanel('map');
        Events.emit(Events.EVENTS.PANEL_CHANGE, { panel: 'map' });
        
        // Show toast
        if (typeof ModalsModule !== 'undefined') {
            ModalsModule.showToast(`Navigated to ${coords.display}`, 'success');
        }
        
        // Emit event
        Events.emit('search:navigate', { type: 'location', data: coords });
    }

    /**
     * Add to recent searches
     */
    function addRecentSearch(searchQuery) {
        if (!searchQuery || searchQuery.length < 2) return;
        
        // Remove if already exists
        recentSearches = recentSearches.filter(s => s.toLowerCase() !== searchQuery.toLowerCase());
        
        // Add to beginning
        recentSearches.unshift(searchQuery);
        
        // Limit
        recentSearches = recentSearches.slice(0, CONFIG.recentSearchesMax);
        
        // Save
        saveRecentSearches();
    }

    /**
     * Load recent searches from storage
     */
    async function loadRecentSearches() {
        try {
            const saved = await Storage.Settings.get('recentSearches');
            if (Array.isArray(saved)) {
                recentSearches = saved;
            }
        } catch (e) {
            console.warn('Could not load recent searches:', e);
        }
    }

    /**
     * Save recent searches to storage
     */
    function saveRecentSearches() {
        try {
            Storage.Settings.set('recentSearches', recentSearches);
        } catch (e) {
            console.warn('Could not save recent searches:', e);
        }
    }

    /**
     * Clear recent searches
     */
    function clearRecentSearches() {
        recentSearches = [];
        saveRecentSearches();
        renderRecentSearches();
    }

    // Utility functions
    function isInputFocused() {
        const active = document.activeElement;
        return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    
    /**
     * Cleanup all event listeners
     */
    function destroy() {
        // Clear all search-scoped event listeners
        if (searchEvents) {
            searchEvents.clear();
            searchEvents = null;
        }
        
        // Remove search container from DOM
        if (searchContainer && searchContainer.parentNode) {
            searchContainer.parentNode.removeChild(searchContainer);
        }
        searchContainer = null;
        initialized = false;
    }

    // Public API
    return {
        init,
        open,
        close,
        toggle,
        isOpen: () => isOpen,
        setCategory,
        destroy,
        search: (q) => {
            query = q;
            if (isOpen) {
                searchInputEl.value = q;
            }
            performSearch();
        }
    };
})();

window.SearchModule = SearchModule;
