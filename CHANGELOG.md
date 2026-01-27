# Changelog

All notable changes to GridDown will be documented in this file.

## [6.13.0] - 2025-01-27

### Added
- **Barometric Altimeter** - High-precision altitude and weather prediction:
  
  **Altitude Features**:
  - Real-time barometric altitude (±1-3m accuracy vs GPS ±10-50m)
  - Display in feet and meters
  - Works indoors and in canyons where GPS struggles
  - Low power consumption

  **Weather Prediction**:
  - Pressure trend analysis over 3-6 hours
  - Weather tendency indicator with icons
  - Rate of change display (hPa/hour)
  - Storm warning for rapid pressure drops
  - Historical pressure chart

  **Calibration Options**:
  - Sync to GPS altitude (one-click)
  - Manual altitude entry
  - Adjustable sea-level reference (QNH)
  - Persistent calibration storage

  **Trend Classifications**:
  - ⛈️ Storm approaching (rapid fall >2 hPa/hr)
  - 🌧️ Weather deteriorating (slow fall)
  - ➡️ Stable conditions
  - 🌤️ Weather improving (slow rise)
  - ☀️ High pressure building (rapid rise)

### Technical
- New module: `js/modules/barometer.js` (~700 lines)
- Generic Sensor API (Chrome Android)
- 1Hz sensor polling with 1-minute history intervals
- 6-hour pressure history with SVG mini-chart
- LocalStorage persistence for calibration and history

### Platform Support
- ✅ Android Chrome (Samsung Tab Active, most Android devices)
- ❌ iOS Safari (Apple restricts barometer API to native apps)

## [6.12.0] - 2025-01-27

### Added
- **USGS Stream Gauge Integration** - Real-time water level monitoring:
  
  **Data Features**:
  - Real-time streamflow (cubic feet per second)
  - Gauge height / water level (feet)
  - Water temperature (where available)
  - Station metadata and USGS site numbers
  - Direct links to USGS Water Data website

  **Map Integration**:
  - Stream gauge markers displayed on map
  - Click markers to view station details
  - Toggle map visibility on/off
  - Visual water drop icons for gauge locations

  **Weather Panel Integration**:
  - New "💧 USGS Stream Gauges" section in Weather panel
  - List of nearby gauges sorted by flow rate
  - Detailed station view with all measurements
  - "Navigate Here" button for routing to gauge locations
  - "Show on Map" button to center map on station

  **Offline Support**:
  - Cached station data (24-hour retention)
  - Graceful fallback when offline
  - Last-known readings available without network

### Technical
- New module: `js/modules/streamgauge.js` (~600 lines)
- USGS National Water Information System (NWIS) API integration
- No API key required (public domain US government data)
- Bounding box queries for efficient regional data loading
- 15-minute cache refresh interval

### Data Source
USGS NWIS - Public domain data from ~10,000+ monitoring stations nationwide.
Real-time provisional data subject to revision.

## [6.11.0] - 2025-01-27

### Added
- **Offline Field Guides** - Comprehensive survival reference database:
  
  **Survival Skills**:
  - Fire starting (fire triangle, bow drill, ferro rod, flint & steel)
  - Water (finding sources, purification methods, solar still construction)
  - Shelter (priorities, debris hut, tarp configurations, snow shelter/quinzee)
  - Navigation (compass basics, navigation without compass, STOP protocol when lost)
  - Signaling (ground-to-air signals, signal mirror, signal fire)

  **Knots Reference**:
  - Essential knots (bowline, clove hitch, taut line, sheet bend, trucker's hitch, prusik)
  - Hitches (two half hitches, timber hitch)
  - Lashings (square lashing, diagonal lashing, tripod lashing)
  - ASCII art diagrams for each knot

  **Edible Plants Database**:
  - Common edibles (dandelion, cattail, clover, plantain, chickweed)
  - Nuts & seeds (acorns with leaching instructions, pine nuts)
  - Berries (blackberry/raspberry, safety rules)
  - Universal edibility test procedure

- **Field Guides UI Features**:
  - Category/subcategory navigation
  - Full-text search across all guides
  - Bookmark system with persistent storage
  - Detailed content with tips and warnings
  - ASCII diagrams for knots and shelters

### Technical
- New module: `js/modules/fieldguides.js` (~1900 lines)
- Added to navigation as "📚 Field Guides" panel
- Integrated with existing bookmark/search patterns
- All content bundled offline - no external dependencies

### Content Sources
All content is original educational material based on widely-published survival knowledge.
Includes appropriate safety disclaimers for plant identification.

## [6.10.0] - 2025-01-27

### Added
- **RF Line-of-Sight Analysis Tool** - Comprehensive radio path analysis:
  - **Point-to-point LOS analysis** between two map locations
  - **Fresnel zone calculation** with clearance percentage
  - **Earth curvature correction** using 4/3 atmospheric refraction model
  - **Free-space path loss** estimation in dB
  - **Obstruction detection** with visual markers

- **Interactive Map Integration**:
  - Click-to-select point A and point B on map
  - Visual path overlay with status colors (green=clear, yellow=marginal, red=obstructed)
  - Obstruction markers displayed on map path
  - Antenna markers at endpoints

- **Elevation Profile Chart**:
  - Terrain profile visualization
  - Fresnel zone ellipse overlay
  - LOS line with earth curvature
  - Obstruction highlighting
  - Distance and elevation scales

- **Frequency Presets** for common radio services:
  - Meshtastic US (915 MHz), EU (868 MHz)
  - 2m Amateur (146 MHz), 70cm (446 MHz)
  - GMRS (462 MHz), FRS (467 MHz)
  - MURS (151 MHz), Marine VHF (156.8 MHz)
  - CB Radio (27 MHz)
  - Custom frequency input

- **Analysis Results Display**:
  - Distance in km and bearing
  - Fresnel zone clearance percentage
  - Free-space and estimated path loss
  - Status indicator (Clear/Marginal/Obstructed)

### Technical
- New module: `js/modules/rflos.js` (~450 lines)
- Integration with existing ElevationModule for terrain data
- Added to Radio Reference panel as "📡 LOS" tab
- Map click interception for point selection
- Real-time map overlay rendering

### Data Sources
- **Elevation**: Copernicus DEM GLO-90 via Open-Meteo API (free, commercial use OK)
- **Calculations**: Published physics formulas (Fresnel zone, FSPL, earth curvature)
- No proprietary algorithms or GPL dependencies

## [6.9.0] - 2025-01-27

### Added
- **Weather Radar & Satellite Overlays** - Live weather data on map:
  - **NEXRAD Radar** - US composite weather radar reflectivity (5-min refresh)
  - **GOES Infrared** - GOES West infrared satellite imagery (day/night)
  - **MRMS Precipitation** - Multi-Radar Multi-Sensor 1-hour precipitation estimates
  - **NWS Warnings** - Active watches, warnings, and advisories overlay
  - One-click toggle buttons in Weather panel
  - Per-layer opacity slider control
  - Tiles cached by service worker for offline viewing

- **Custom Tile Layer API** - MapModule extension for overlay management:
  - `addCustomTileLayer()` - Add XYZ tile overlays
  - `removeCustomTileLayer()` - Remove overlays
  - `setCustomLayerOpacity()` - Adjust transparency
  - Supports `{z}/{x}/{y}` URL templates
  - Automatic tile caching and error handling

### Enhanced
- **Weather Panel** - New "Satellite & Radar Imagery" section with:
  - 4 quick-toggle overlay buttons (Radar, Infrared, Precip, Warnings)
  - Active layer indicator with name display
  - Opacity control slider (10-100%)
  - Clear button to remove overlay
  - Data source attribution

### Data Sources (All Iowa Environmental Mesonet / NOAA)
All data comes from Iowa Environmental Mesonet - free for use with attribution:
- **NEXRAD Radar**: `mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913`
- **MRMS Precipitation**: `mesonet.agron.iastate.edu/cache/tile.py/1.0.0/q2-n1p-900913`
- **NWS Warnings**: `mesonet.agron.iastate.edu/cache/tile.py/1.0.0/wwa-900913`
- **GOES West IR**: `mesonet.agron.iastate.edu/cache/tile.py/1.0.0/goes-west-ir-900913`

### Technical
- Added weather tile domain to service worker cache:
  - `mesonet.agron.iastate.edu` (Iowa Environmental Mesonet)
- SatWeatherModule initialization added to app.js
- satweather.js added to index.html and service worker cache
- Custom tile layers render between base map and markers (zIndex 50-55)
- Service worker cache version updated to v6.9.0

---

## [6.8.0] - 2025-01-25

### Added
- **SOS Emergency Broadcast** - Real radio transmission when SOS activated:
  - **Meshtastic Integration** - Broadcasts SOS via mesh network using `sendSOS()`
  - **APRS Integration** - Transmits emergency beacon with position and distress symbol
  - **Initial Burst** - Sends 3 rapid broadcasts (5 second intervals) on activation
  - **Repeat Broadcasts** - Continues broadcasting every 60 seconds until cancelled
  - **All-Clear Signal** - Sends cancellation message when SOS deactivated
  - **Broadcast Counter** - Shows number of transmissions and last broadcast time

### Enhanced
- **SOS Panel UI** - Now shows radio connection status:
  - Real-time Meshtastic/APRS connection indicators
  - Warning when no radios connected
  - Broadcast count and timing during active SOS
  - Clear indication of which radios will transmit

### Technical
- `sendEmergencySignal()` now integrates with MeshtasticModule and APRSModule
- `sendViaMeshtastic()` uses MeshtasticModule.sendSOS() for proper mesh broadcast
- `sendViaAPRS()` sets emergency symbol (/!) and status before beacon
- `sendAllClear()` broadcasts cancellation via all connected radios
- New state tracking: broadcastCount, lastBroadcast, broadcastInterval
- Automatic cleanup of broadcast interval on SOS cancellation

---

## [6.7.0] - 2025-01-25

### Added
- **Manual Position Entry** - Set your position without GPS:
  - Enter coordinates in any format: DD, DMS, DDM, UTM, MGRS
  - Auto-detection of coordinate format with live preview
  - Optional location name and altitude
  - Persists across sessions
  - "Prefer Manual" option to use manual even when GPS available

### Enhanced
- **My Position Section** - New Team panel section with:
  - Current position display with source indicator
  - One-click GPS start/stop
  - Manual position entry modal
  - Quick format toggle showing DD, DMS, UTM, MGRS
  - Center map on position button
  - Visual distinction: purple for manual, green for GPS

- **GPSModule** - Extended position management:
  - `setManualPosition(lat, lon, options)` - Set position directly
  - `setManualPositionFromString(coordString)` - Parse any format
  - `getManualPosition()` - Retrieve manual position
  - `clearManualPosition()` - Clear manual position
  - `isUsingManualPosition()` - Check if using manual
  - `setPreferManual(prefer)` - Toggle manual preference
  - `getPositionSource()` - Get human-readable source description
  - `getCurrentPosition()` - Now checks existing position (including manual) first

- **Manual Position Support Throughout App**:
  - **Map** - Locate button centers on manual position when GPS unavailable
  - **APRS** - Station distance/bearing calculations use manual position
  - **Meshtastic** - Position broadcasts use manual position as fallback
  - **SOS/Emergency** - Position tracking and Get Position button support manual
  - **RadiaCode** - Radiation tracks use manual position for geotagging
  - **Team Rally Points** - Use GPS button supports manual position

### Fixed
- RadiaCode module now correctly uses `getPosition()` for synchronous position access
- APRS station distance display works with manual position
- Map locate button shows appropriate message for manual vs GPS position

### Technical
- Position priority: GPS (if active) → Manual (if set) → None
- Manual position saved to IndexedDB via gpsPreferences
- Leverages existing Coordinates.parse() for multi-format support
- All modules updated to check `GPSModule.getPosition()` before falling back to browser geolocation
- Service worker cache version updated to v6.7.0

### Files Updated
- `js/modules/gps.js` - Core manual position support
- `js/modules/panels.js` - Position UI section and handlers
- `js/modules/map.js` - Locate button manual support
- `js/modules/aprs.js` - Distance calculations with manual
- `js/modules/meshtastic.js` - Position broadcast with manual
- `js/modules/sos.js` - Emergency position tracking with manual
- `js/modules/radiacode.js` - Fixed to use getPosition()

## [6.6.0] - 2025-01-25

### Added
- **RadiaCode Integration** - Full gamma spectrometer/dosimeter support:
  - Web Bluetooth connection to RadiaCode 101/102/103/110 devices
  - Real-time dose rate (μSv/h) and count rate (CPS) display
  - Live radiation level indicator with color-coded alerts
  - Track recording with GPS-tagged radiation readings
  - Automatic threshold-based alerting system
  - Spectrum viewer with peak detection
  - Isotope identification from gamma spectrum (14 isotopes)
  - GeoJSON export for radiation tracks
  - Map visualization with color-coded radiation overlay
  - Offline storage for readings and tracks

- **Demo Mode** - Test RadiaCode features without hardware:
  - Simulated radiation readings with realistic variation
  - Demo spectrum with natural isotope peaks (K-40, Bi-214, Pb-214)
  - Full UI functionality for testing and demonstrations
  - Periodic elevated readings to test alert system
  - Works on all browsers (no Web Bluetooth required)

### Enhanced
- **Team Panel** - Added RadiaCode section with:
  - Connection status and device info
  - Large dose rate display with alert level badge
  - Recording controls for radiation tracks
  - Track history with statistics
  - Quick spectrum viewer access
  - Demo mode indicator (purple theme)
  - Reference radiation levels guide

### Technical
- RadiaCode BLE protocol from mkgeiger/RadiaCode Arduino library (MIT)
  - Service UUID: `e63215e5-7003-49d8-96b0-b024798fb901`
  - Write Characteristic: `e63215e6-7003-49d8-96b0-b024798fb901`
  - Notify Characteristic: `e63215e7-7003-49d8-96b0-b024798fb901`
  - 18-byte chunked writes (BLE MTU limitation)
  - 4-byte little-endian size header on responses
  - 30-second timeout for large responses (spectrum data)
- New RadiaCodeModule with 1100+ lines of functionality
- Haversine-based distance calculations for track distance
- 1024-channel spectrum analysis with peak detection
- Isotope library with 14 common isotopes (K-40, Cs-137, Co-60, I-131, etc.)
- Multi-level alert system: normal, elevated, warning, alarm
- Audio alerts via Web Audio API
- IndexedDB storage for tracks and settings
- Canvas-based map rendering for radiation overlays
- Service worker cache version updated to v6.6.0
- Credits: Protocol based on cdump/radiacode and mkgeiger/RadiaCode (MIT)

## [6.5.1] - 2025-01-25

### Added
- **APRS Distance/Bearing Display** - Station list now shows:
  - Distance to each APRS station (miles or feet)
  - Compass bearing and degrees from your position
  - Stations sorted by distance (nearest first) when GPS enabled
  - "Enable GPS" prompt when position unavailable

### Enhanced
- **APRS Station Cards** - Improved layout with:
  - Larger icons (36px)
  - Distance/bearing on right side
  - Station status text display
  - Speed indicator for moving stations
  - Better visual hierarchy

### Technical
- Added to APRSModule: calculateDistance(), calculateBearing(), bearingToCompass()
- Added getDistanceToStation() and getStationsWithDistance() functions
- Stations auto-sort by distance when GPS position available
- Increased visible stations from 20 to 25
- Service worker cache version updated to v6.5.1

## [6.5.0] - 2025-01-25

### Added
- **Team Management System** - Comprehensive team coordination features:
  - Team health dashboard showing active/stale/offline member counts
  - Distance and bearing display from your position to each team member
  - Distance and bearing to rally points with real-time GPS updates
  - Enhanced member detail modal with larger format and navigation info
  - Comm plan management with scheduled check-ins
  - Check-in time scheduler (daily, hourly, one-time)
  - Next check-in countdown display
  - Emergency code word configuration
  - Signal plan notes field

### Enhanced
- **Team Member Cards** - Redesigned with:
  - Larger role icons with status indicators
  - Distance (mi/ft) and compass bearing when GPS enabled
  - Last seen timestamps
  - Quick navigation to member location
  - "YOU" badge for self-identification

- **Rally Point Cards** - Improved with:
  - Distance and bearing from current position
  - Color-coded borders by rally type
  - Larger, more visible design

- **Comm Plan Section** - Expanded with:
  - Edit button for leaders/co-leaders
  - Frequency badges (primary, backup)
  - Emergency word highlight
  - Next check-in countdown
  - Full comm plan editing modal

### Technical
- Added distance/bearing calculation functions to TeamModule
- Added getDistanceToMember(), getDistanceToRally(), getMembersWithDistance()
- Added comm plan management: updateCommPlan(), addCheckInTime(), removeCheckInTime(), getNextCheckIn()
- Added member status tracking: getMemberStatus(), updateAllMemberStatuses(), getTeamHealth()
- Service worker cache version updated to v6.5.0
- Team.js now included in STATIC_ASSETS for proper caching

## [6.4.1] - 2025-01-25

### Fixed
- **Quick Reference button now working** - Added missing `getQuickReferences()` function to Medical module
- Quick Reference tables include: Vital Signs, CPR Guidelines, Rule of 9s (Burns), Glasgow Coma Scale, Hemorrhage Classification, Pain Medication Dosing, Allergy Medication Dosing, Hypothermia Stages, Altitude Illness

### Technical
- Service worker cache version updated to v6.4.1

## [6.4.0] - 2025-01-25

### Fixed
- **Medical Reference module now fully integrated** - Added compatibility adapter methods to connect the comprehensive medical database (50+ protocols) with the UI layer
- Medical module initialization properly called in app.js

### Enhanced
- **Medical Protocol categories now render correctly** - getCategories(), getMedCategories(), getProtocol() methods added
- **Medication reference accessible** - getAllMedications(), getMedicationsByCategory() methods for drug lookup
- **Protocol transformation** - Converts internal protocol format to UI-friendly steps with titles and warnings

### Technical
- Added MedicalModule.init() call to application bootstrap sequence
- Service worker cache version updated to v6.4.0
- Medical module now properly exposes public API for panels.js consumption

## [6.2.2] - 2025-01-23

### Fixed
- **Toast notifications no longer stack on rapid clicks** - New toasts now replace existing ones instead of piling up
- Toast duration reduced from 1500ms to 1200ms with smooth fade-out animation

### Changed
- Version number now consistent across manifest.json, service worker, and UI

## [6.2.1] - 2025-01-23

### Fixed
- Toast notification timing improved with fade-out animation

## [6.2.0] - 2025-01-22

### Added
- Comprehensive ARIA accessibility attributes across all modules
- Skip-to-content link for keyboard navigation
- Focus indicators for all interactive elements
- Reduced motion support for users who prefer it

### Fixed
- Screen reader compatibility improvements

## [6.1.0] - 2025-01-22

### Added
- **Onboarding tour** for first-time users with 9-step walkthrough
- Welcome modal with feature highlights
- Progress indicators and keyboard navigation (Esc/Enter/Arrow keys)

## [6.0.0] - 2025-01-21

### Added
- **Search panel** with location geocoding via Nominatim
- **Coordinate tools** - Parse any format, convert between DD/DMS/DDM/UTM/MGRS
- **Distance calculator** between two coordinates
- Night mode toggle in sidebar (red light and blackout modes)
- Measurement tool for distance and area on map

### Changed
- Major UI refinements across all panels
- Improved mobile responsiveness

## [5.2.0] - 2025-01-21

### Added
- **Print/PDF export module** with multiple document types:
  - Full operational plan
  - Route cards with turn-by-turn directions
  - Waypoint lists grouped by type
  - Communication plan reference
  - Quick reference card

## [5.1.0] - 2025-01-21

### Added
- **Encrypted plan sharing** (.gdplan format) with AES-256-GCM encryption
- Import/export plans with optional passphrase protection
- Plan package includes waypoints, routes, and logistics config

## [5.0.0] - 2025-01-20

### Added
- **Turn-by-turn navigation** with active guidance
- Voice announcements for upcoming turns
- Off-route detection and alerts
- Breadcrumb trail recording
- Compass bearing display

## [4.0.0] - 2025-01-20

### Added
- **Communication plan module** with frequency management
- **Radio frequency database** - FRS, GMRS, MURS, Marine, Amateur bands
- Channel assignment for team coordination
- NATO phonetic alphabet reference
- **APRS integration** for position reporting
- **Meshtastic support** for mesh networking

## [3.6.0] - 2025-01-19

### Added
- **Terrain analysis panel** with comprehensive site evaluation:
  - Slope analysis with trafficability assessment
  - Viewshed calculation
  - Solar exposure scoring
  - Flood risk assessment
  - Cover and concealment analysis

## [3.5.0] - 2025-01-19

### Added
- **Weather integration** with Open-Meteo API
- Current conditions and 7-day forecast
- Weather alerts and warnings
- Automatic logistics adjustment for temperature

## [3.4.0] - 2025-01-18

### Added
- **Sun/Moon calculator** with rise/set times
- Moon phase display
- Golden hour and blue hour times
- Twilight phases (civil, nautical, astronomical)

## [3.3.0] - 2025-01-18

### Added
- **Magnetic declination module** with worldwide coverage
- Auto-calculation based on location
- True vs magnetic bearing conversion
- Annual change rate display

## [3.2.0] - 2025-01-17

### Added
- **Elevation profiles** for routes
- Grade percentage calculations
- Steep section identification
- Elevation data from Open-Meteo API

## [3.1.0] - 2025-01-17

### Added
- **KML/KMZ import and export** for Google Earth compatibility
- Automatic format detection on import

## [3.0.0] - 2025-01-16

### Added
- **Contingency planning module**
- Bail-out point analysis with distance calculations
- Checkpoint generation at configurable intervals
- Risk assessment framework

## [2.5.0] - 2025-01-15

### Added
- **SOS/Emergency module**
- Emergency contact management
- Signal mirror angle calculator
- Distress signal reference

## [2.4.0] - 2025-01-15

### Added
- **Undo/Redo system** for all operations
- Keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)
- History tracking for waypoints, routes, and settings

## [2.3.0] - 2025-01-14

### Added
- **Offline map download** by drawing polygons
- Multiple zoom level selection
- Download progress tracking
- Storage usage dashboard

## [2.2.0] - 2025-01-13

### Added
- **Multiple map sources** - 15+ tile providers
- Layer switching button on map
- USGS Topo, USFS, BLM, Satellite imagery support

## [2.1.0] - 2025-01-12

### Added
- **GPS tracking** with real-time position updates
- Track recording
- Speed and heading display

## [2.0.0] - 2025-01-11

### Added
- **Logistics calculator** with comprehensive analysis
- Vehicle profiles (4x4, Jeep, ATV, Motorcycle)
- Personnel profiles with water/calorie calculations
- What-if scenario analysis

### Changed
- Complete UI redesign with improved dark theme

## [1.3.0] - 2025-01-10

### Added
- **Route builder** with click-to-create interface
- Terrain type selection per segment
- Auto-calculation of distance and time

## [1.2.0] - 2025-01-09

### Added
- **GPX import/export** with full GPX 1.1 support
- Waypoint, route, and track parsing

## [1.1.0] - 2025-01-08

### Added
- Real OpenStreetMap tile integration
- Tile caching via service worker
- Offline tile access

## [1.0.0] - 2025-01-07

### Added
- Initial release
- Basic map with procedural terrain
- Waypoint management (7 types)
- Route display
- IndexedDB persistence
- PWA with offline support
