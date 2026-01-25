# Changelog

All notable changes to GridDown will be documented in this file.

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
