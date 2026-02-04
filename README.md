# GridDown

**Professional-Grade Offline Tactical Navigation & Planning**

GridDown is a feature-rich Progressive Web App (PWA) designed for operational planning in challenging environments where connectivity cannot be assumed. Built for preppers, survivalists, emergency responders, SAR teams, and tactical users who need reliable offline-first functionality.

![GridDown Screenshot](docs/screenshot.png)

## 🎯 Core Philosophy

- **Offline-First**: Every feature works without internet after initial setup
- **Paper Backup**: Comprehensive print/PDF export when electronics fail
- **Field-Ready**: Designed for real-world tactical and emergency scenarios
- **Self-Reliant**: No cloud dependencies, no accounts required
- **Infrastructure Independent**: Works when the grid goes down

---

## ✨ Key Features

### 🗺️ Interactive Mapping
- Real map tiles from **15+ sources**: OpenStreetMap, USGS Topo, USFS, ESRI Satellite, and more
- Pan, zoom, and rotation with touch gesture support
- Real-time coordinate display in multiple formats (DD, DMS, DDM, UTM, MGRS)
- Grid overlay and distance scale
- Location search with geocoding

### 📍 Waypoint System
- **7 structured waypoint types**: Water, Fuel, Camp, Resupply, Hazard, Bail-out, Custom
- Type-specific fields (flow rate for water, hours for resupply, etc.)
- Photo attachments, notes, and verification timestamps
- Filter, search, and bulk import/export

### 🛣️ Route Planning & Navigation
- Click-to-create route builder with drag reordering
- Terrain-aware segment classification (highway/road/trail/technical)
- Auto-calculated distance, duration, and elevation
- Visual **elevation profiles** with grade analysis
- **Turn-by-turn navigation** with voice guidance
- Off-route alerts and breadcrumb tracking
- Compass bearing display

### 🔥 Offline Maps
- Download entire regions by drawing polygons
- Multiple zoom level selection (10-17)
- Storage management dashboard with usage stats
- Background tile caching
- **Works completely offline** after download

### ⛽ Logistics Calculator
- **4 vehicle profiles**: 4x4 Truck, Jeep/SUV, ATV/UTV, Motorcycle
- **4 personnel profiles**: Fit Adult, Average Adult, Child, Elderly
- Terrain-aware fuel consumption calculations
- Water and calorie requirements with hot weather adjustment
- Critical resupply point identification
- What-if scenario analysis ("What if this cache is empty?")

### 🚨 Contingency Planning
- Bail-out point analysis with distance calculations
- Checkpoint generation along routes at configurable intervals
- Alternative route comparison
- Risk assessment and mitigation planning

---

## 📡 RF Sentinel Integration (NEW in v6.18)

Connect to [RF Sentinel](https://github.com/yourrepo/rf-sentinel) for comprehensive off-grid situational awareness using software-defined radio.

### Multi-Protocol RF Detection
| Detection Type | Frequency | Symbol | Description |
|----------------|-----------|--------|-------------|
| **Aircraft** | ADS-B 1090 MHz | ✈️ Blue | Commercial and GA aircraft |
| **Ships** | AIS 162 MHz | 🚢 Cyan | Maritime vessels |
| **Drones** | Remote ID 2.4 GHz | 🛸 Amber | UAVs with Remote ID |
| **FPV Drones** | Various RF | 🎮 Red | FPV/analog drones via passive RF monitoring |
| **Radiosondes** | 400 MHz | 🎈 Purple | Weather balloons |
| **APRS** | 144.39 MHz | 📻 Green | Amateur radio stations |

### Connection Methods
- **Auto (recommended)** - Tries WebSocket first, falls back to REST
- **WebSocket** - Real-time push updates via native WebSocket
- **MQTT** - Pub/sub via MQTT over WebSocket (requires Mosquitto broker)
- **REST Polling** - Periodic fetch every 5 seconds

### Off-Grid Weather via FIS-B
- Switch weather source from Internet (NWS/IEM) to RF Sentinel FIS-B
- Receives METARs, TAFs, SIGMETs, TFRs, PIREPs via 978 MHz UAT
- Stale data detection with 15-minute threshold
- True infrastructure-independent weather intelligence

### Emergency Detection
- **Aircraft Squawk Codes**: 7500 (Hijack), 7600 (Radio Fail), 7700 (Emergency)
- **AIS Emergency Devices**: SART, MOB, EPIRB
- Visual alerts with pulsing red indicators on map
- Toast notifications for critical emergencies

### FPV Drone Detection (NEW in v6.57)
- Dedicated FPV Drone Detections panel with protocol/frequency/signal info
- Displays both Remote ID and passively detected FPV drones
- Signal strength, frequency band, and protocol identification

### Map Rendering
- Track symbols with heading rotation
- Age-based alpha fade for stale tracks
- Labels shown at zoom level 10+
- Maximum 500 tracks for performance
- Individual layer toggles for each detection type

---

## 📻 Communication & Coordination

### Radio Frequency Database
- Complete channel references: **FRS, GMRS, MURS, Marine VHF, Amateur bands**
- Communication plan generator
- Channel/frequency quick reference cards
- NATO phonetic alphabet reference

### APRS Integration

*APRS® is a registered trademark of APRS Software and Bob Bruninga, WB4APR (SK). See [ATTRIBUTIONS.md](ATTRIBUTIONS.md).*

- Connect to APRS TNC devices (Mobilinkd, etc.) via **Web Bluetooth**
- Real-time position reporting and tracking
- **Distance and bearing** to each station from your position
- Station list sorted by proximity
- Speed and heading display for moving stations

### Meshtastic Mesh Networking

Connect to Meshtastic devices via **Web Bluetooth** or **Web Serial** for comprehensive off-grid mesh communication.

#### Connection & Setup
- **Device type selector** with capability detection for 20+ hardware models (T-Beam, Heltec, RAK WisMesh, T-Echo, etc.)
- **Setup Wizard** guides first-time users through device connection and configuration
- Automatic detection of Bluetooth-only vs Serial-capable devices
- Connected device info card with firmware version and update status

#### Scenario Presets
One-tap configuration optimized for your situation:

| Scenario | Modem | Hop Limit | Use Case |
|----------|-------|-----------|----------|
| Search & Rescue | Long Fast | 5 | Wide area coverage |
| Community Network | Long Slow | 7 | Maximum range |
| Backcountry Hiking | Medium | 3 | Small groups |
| Emergency Comms | Long Fast | 7 | Crisis communication |
| Event Coordination | Short Fast | 2 | Dense, close groups |

#### Messaging
- **Channel messaging** with multiple channel support (Primary, LongFast, custom encrypted)
- **Encrypted Direct Messages** with end-to-end PKI encryption (ECDH + AES-256-GCM)
- **Canned messages** with one-tap quick-send (8 configurable presets)
- **Message delivery tracking**: Pending → Sent → Delivered → Read
- **Offline message queue** — compose messages offline, auto-send when mesh connectivity returns
- **Unread indicators** per channel and per DM contact

#### Device Configuration
- **Region selection** with 22 region codes matching Meshtastic protobuf
- **Modem preset selection** (Long Fast, Long Slow, Medium, Short Fast, etc.)
- **TX Power adjustment** (1–30 dBm)
- **Hop limit configuration** (1–7 hops)
- **Channel URL import/export** — share `meshtastic://` URLs or QR codes
- **Firmware version checking** with update status

#### Map Integration
- **Drop Pin → Send to Mesh** — right-click (or long-press) anywhere on the map to instantly share a location
- **Waypoint sharing** over mesh network
- **Route sharing** with team members
- Node positions displayed on map with live updates

#### Mesh Network Tools
- **Traceroute visualization** — trace the path messages take through the mesh to identify relay nodes
- **Mesh health dashboard** with score (Excellent/Good/Fair/Poor) and node signal distribution
- **Signal quality display** — SNR/RSSI per node with color-coded indicators
- **Telemetry export** — CSV node lists, message history, JSON health reports, full telemetry dumps

#### Security & Privacy
- **End-to-end encrypted DMs** using Web Crypto API (ECDH P-256 + AES-256-GCM)
- **Key verification** with human-readable fingerprints for out-of-band comparison
- **Read receipts** (optional, user-controlled)
- **Message retry** with exponential backoff for failed sends
- Private keys never leave the device

#### Team Onboarding
- **QR code generation** for instant team join
- **Channel URL sharing** for team setup
- **Setup Wizard** walks new users through connection → scenario → channel configuration

### Team Management
- Team roster with roles (Leader, Co-Leader, Navigator, Medic, etc.)
- **Team health dashboard**: Active/Stale/Offline member status
- **Distance and bearing** to each team member
- Rally point management with proximity display
- Comm plan with scheduled check-ins
- Emergency code word configuration
- Next check-in countdown timer

---

## ☢️ RadiaCode Gamma Spectrometer Integration

### Real Device Connection
- **Web Bluetooth** connection to RadiaCode 101/102/103/110 devices
- Real-time **dose rate** (μSv/h) and **count rate** (CPS) display
- Live radiation level indicator with color-coded alerts
- Track recording with GPS-tagged radiation readings
- Automatic threshold-based alerting system (Normal → Elevated → Warning → Alarm)

### Spectrum Analysis
- **1024-channel gamma spectrum** viewer
- Peak detection with statistical significance
- **Isotope identification** from 14 common isotopes:
  - K-40, Cs-137, Co-60, I-131, Ra-226, Th-232, Am-241
  - Tc-99m, Bi-214, Pb-214, Ba-133, Na-22, Eu-152
- Energy calibration display

### Radiation Mapping
- GPS-tagged radiation tracks
- **Map overlay** with color-coded dose rates
- GeoJSON export for external analysis
- Track statistics (distance, duration, min/max/avg dose)

### Demo Mode
- Test all RadiaCode features **without hardware**
- Simulated readings with realistic variation
- Demo spectrum with natural isotope peaks
- Works on all browsers (no Web Bluetooth required)

---

## 📺 SSTV (Slow Scan Television) (NEW in v6.19)

Transmit and receive images over amateur radio using industry-standard SSTV modes. Full-featured codec with real-time DSP processing and AI enhancement.

### Supported Modes (12)
| Mode | Resolution | Time | Quality |
|------|-----------|------|---------|
| Robot 36 | 320×240 | 36s | Basic |
| Robot 72 | 320×240 | 72s | Good |
| Scottie 1 | 320×256 | 110s | High |
| Scottie 2 | 320×256 | 71s | Good |
| Scottie DX | 320×256 | 269s | Highest |
| Martin 1 | 320×256 | 114s | High |
| Martin 2 | 320×256 | 58s | Good |
| PD 90 | 320×256 | 90s | High |
| PD 120 | 640×496 | 126s | High-Res |
| PD 160 | 512×400 | 160s | High-Res |
| PD 180 | 640×496 | 180s | Highest |
| PD 240 | 640×496 | 248s | Highest |

### Features
- **Decode**: Live audio decode with progress display and waterfall visualization
- **Encode**: Camera capture, gallery selection, or map screenshot
- **DSP**: Goertzel frequency detection, slant correction, drift compensation
- **AI Enhancement**: On-device image enhancement (WebGPU/WASM)
- **Legal Compliance**: Mandatory callsign for TX, license acknowledgment workflow
- **Image History**: Store and manage received images in IndexedDB

---

## 🎯 CoT Bridge (Cursor on Target) (NEW in v6.57)

Bidirectional integration with CoT-compatible tactical applications (ATAK, WinTAK, iTAK) through the GridDown CoT Bridge.

### Features
- **WebSocket connection** to CoT Bridge for real-time data exchange
- **Receive CoT positions** (PLI) displayed as team members on the map
- **Receive markers** displayed as waypoints
- **Receive GeoChat messages** in the team panel
- **Bidirectional position sharing** — send your GPS position to the CoT network (requires explicit user consent)
- **Auto-reconnect** with progressive backoff on disconnect
- **TAK team colors** (Cyan, Green, Yellow, Red, Blue, etc.)
- **Setup Wizard** for guided bridge configuration

### Privacy
- Position sharing requires explicit opt-in with privacy warning
- Callsign and team color configurable
- Sharing interval adjustable (default 30 seconds)
- All communication flows through your own CoT Bridge — no third-party servers

---

## 🔭 Celestial Navigation (NEW in v6.27-6.38)

Complete 8-phase celestial navigation system for GPS-denied positioning using stars, sun, moon, and planets. All algorithms run offline with no external dependencies.

### Celestial Almanac
- **58 navigation stars** with SHA, Declination, magnitude
- **Sun/Moon/Planet positions** (Venus, Mars, Jupiter, Saturn) with GHA/Dec
- GHA Aries calculation
- Daily almanac generation

### Observation & Sight Reduction
- Altitude corrections (refraction, dip, semi-diameter, parallax)
- Device sensor integration for crude altitude measurement
- Sight reduction to Line of Position (LOP)
- Emergency position fix from 2+ observations

### Star Chart & Tools
- Interactive star chart for current time/location
- **AR Star Identification** — point camera at sky to identify stars and planets
- **Camera Sextant** — measure celestial body altitude with phone sensors (±1-2° accuracy)
- Sun compass, Polaris finder, moon navigation

### Training Mode
- Shadow stick method with step-by-step timer
- Solar noon calculator
- Watch method navigation
- Hand measurement reference
- Horizon distance calculator

---

## 🧭 GPS-Denied Navigation

### Pedestrian Dead Reckoning (PDR) (NEW in v6.35)
- Navigate without GPS using device motion sensors
- Step detection and stride length calibration
- Heading from device compass with drift correction
- Works in tunnels, buildings, and during GPS jamming

### Rangefinder Resection (NEW in v6.36)
- Calculate position from 2-3 known landmarks
- Measure distances with any rangefinder device
- **Landmark database** with 3,100+ public domain locations (peaks, towers, dams)
- Searchable landmark packs from USGS/GNIS databases

---

## 🚨 SARSAT Beacon Receiver (NEW in v6.19.9)

Integration for COSPAS-SARSAT 406 MHz beacon detection using external Raspberry Pi-based SDR receiver.

- Support for **PLB** (Personal Locator Beacon), **ELT** (Aviation), **EPIRB** (Maritime), and **SSAS** (Ship Security)
- WebSocket and Web Serial connection to SDR receiver
- Real-time beacon tracking with map display and pulsing emergency indicators
- Country code decoding for 200+ countries
- Auto-waypoint creation for received beacons with GPS position
- Alert sounds for emergency beacons

---

## 🌿 Offline Field Guides

### Survival Skills Reference
- Fire starting, water purification, shelter construction
- Navigation without instruments, STOP protocol
- Ground-to-air signals, signal mirror, signal fire

### Knots Reference
- Essential knots with ASCII art diagrams
- Hitches and lashings for camp construction

### Edible Plants Database
- Common edibles with seasonal availability
- Universal edibility test procedure
- Nutritional and toxicity information

---

## 🥼 Medical Reference

### Protocol Database (50+ Protocols)
- **Trauma**: Hemorrhage control, fractures, burns, head injury
- **Medical**: Cardiac, respiratory, diabetic emergencies
- **Environmental**: Heat/cold injuries, altitude sickness, drowning
- **Toxicology**: Poisoning, envenomation, overdose
- Step-by-step treatment procedures with warnings

### Quick Reference Tables
- Vital signs by age
- CPR guidelines (adult/child/infant)
- Rule of 9s for burns
- Glasgow Coma Scale
- Hemorrhage classification
- Medication dosing charts

### Medication Database
- Common field medications with dosing
- Contraindications and warnings
- Category-based organization

---

## 🌤️ Environmental Data

### Weather Integration
- Current conditions from Open-Meteo API
- 7-day forecast with temperature and precipitation
- Weather alerts and warnings
- Automatic logistics adjustment for temperature
- **Off-grid weather via RF Sentinel FIS-B** (NEW)

### Air Quality Index (AQI) (NEW in v6.23-6.24)

Real-time air quality monitoring powered by EPA AirNow API.

- **AQI display** with EPA-standard color coding and health guidance (Good through Hazardous)
- **Primary pollutant** identification (PM2.5, O3, PM10, etc.)
- **AQI map overlay** — station markers across the map with color-coded badges, dynamic loading as you pan
- **AQI at waypoints/routes** — see air quality alongside weather for any waypoint or route point
- **Automated monitoring & alerts** — configurable background checks at your location and saved waypoints
- **Threshold configuration** — Caution (101+), Warning (151+), Critical (201+), Emergency (301+)
- **Sensitive Groups mode** — lowers alert thresholds by 50 points for vulnerable individuals
- **Forecast alerts** — next-day AQI forecast warnings from AirNow API
- Coverage: United States, Canada, Mexico (graceful fallback for international users)

### Sun/Moon Calculator
- Rise and set times for current location
- Moon phase display with illumination percentage
- Golden hour and blue hour times
- Twilight phases (civil, nautical, astronomical)
- Lunar calendar for planning

### Magnetic Declination
- Worldwide declination calculation
- Auto-update based on current position
- True vs magnetic bearing conversion
- Annual change rate display

### Barometric Altimeter (NEW in v6.13-6.14)

High-precision altitude measurement and weather prediction using device pressure sensors.

- **Barometric altitude** with ±1-3m accuracy (vs GPS ±10-50m)
- Display in feet and meters; works indoors and in canyons where GPS struggles
- Calibrate to known elevation, GPS, or manual entry
- **Pressure trend monitoring** with 6-hour history graph
- **Barometric weather prediction** with 5 trend classifications:
  - Steady (±0.5 hPa/3hr) — No significant change expected
  - Slow Rise — Generally improving conditions
  - Rapid Rise (>2 hPa/3hr) — Brief clearing, possible instability
  - Slow Fall — Deteriorating conditions approaching
  - Rapid Fall (>2 hPa/3hr) — Storm likely within 6-12 hours
- Low power consumption compared to continuous GPS

### Terrain Analysis
- **Slope analysis** with trafficability assessment
- Aspect (direction slope faces)
- **Viewshed calculation** for observation posts
- **RF Line-of-Sight** analysis (NEW in v6.12)
- Solar exposure scoring for camp site selection
- Flood risk assessment
- Cover and concealment analysis

### USGS Stream Gauges (NEW in v6.11)
- Real-time water level data from 10,000+ gauges
- Current flow rate (CFS) and gauge height
- Flood stage indicators
- Historical data trends

---

## 📊 System Monitoring (NEW in v6.15-6.17)

### Offline Status Indicator
- Persistent banner when offline with duration counter
- "Back online" notification when connection restored
- Real-time connectivity verification

### Network Quality Indicator
- Signal strength bars (Excellent/Good/Fair/Poor)
- Connection type detection (4G/3G/2G/WiFi)
- Latency measurement
- Tile download time estimation

### Storage Quota Warning
- Browser storage usage monitoring
- Warning at 80%, 90%, 95% thresholds
- Visual progress bar with remaining space
- Quick link to manage offline tiles

### Update Notifications
- Automatic new version detection
- "Refresh Now" button for instant update
- Non-intrusive toast notification

### Browser Compatibility Detection
- Feature-specific warnings (Web Bluetooth, Web Serial, etc.)
- Browser and OS identification
- Compatibility level rating (Full/Partial/Limited)

---

## ⚙️ Settings & Tools

### 🔍 Global Search System (NEW in v6.40-6.44)

Unified search across all app features with **Ctrl+K** (desktop) or FAB button (mobile).

- **Fuzzy matching** across waypoints, routes, celestial bodies, landmarks, actions, help topics, and settings
- **Category filtering** with Tab/Shift+Tab cycling
- **Contextual suggestions** based on time of day, location, and recent activity
- **Favorites system** — pin frequently used items for instant access (Ctrl+D)
- **Recent searches** with history management
- **20 help topics** and **15 settings** searchable from the command palette

### ❓ Situation Wizard (NEW in v6.46)

Stress-friendly decision tree that guides users to the right feature without remembering names.

Designed for stress scenarios where users can't remember feature names.

**Access**: Press **F1** or **Ctrl+/** anywhere, or tap "Help Me" in mobile FAB menu.

**Decision Tree (33 nodes)**:
```
What's your situation?
├── 🧭 Lost / Need Position
│   ├── GPS Working → Locate instructions
│   ├── Can See Landmarks → Resection guide
│   ├── Can See Sky → Celestial navigation
│   └── None of These → Dead reckoning
├── 🆘 Emergency
│   ├── Need Rescue → SOS panel
│   ├── Medical → First aid reference
│   ├── Need to Signal → Mirror/strobe
│   └── Need Shelter → Weather + terrain
├── 📡 Communication (Meshtastic/Radio/APRS)
├── 🗺️ Navigation Help
├── 📋 Trip Planning
└── 🌤️ Weather / Environment
```

**Solution screens include**: Step-by-step instructions, Quick Action buttons, Expert tips.

### 📱 Mobile Enhancements (NEW in v6.45)

Mobile-specific features that gracefully degrade on desktop:

| Feature | Description |
|---------|-------------|
| **Floating Action Button** | Quick access to Search, Help, Waypoint, Compass, SOS |
| **PWA Install Prompt** | Smart banner prompts installation after 30 seconds |
| **Battery Status** | Real-time battery percentage with low-battery warnings |
| **Connection Status** | Online/offline indicator with toast notifications |
| **Enhanced Haptics** | Tactile feedback patterns for buttons, alerts, navigation |

### Measurement Tools
- Distance measurement between points
- Area calculation for polygons
- Bearing and azimuth display

### Other Features
- **Onboarding tour** for new users (9-step walkthrough)
- **Undo/Redo** support for all operations (Ctrl+Z/Ctrl+Shift+Z)
- Location search with geocoding
- Coordinate conversion between all formats
- **Night vision modes** (red light and blackout)
- **Accessibility** — comprehensive ARIA attributes, skip navigation, reduced motion, screen reader support

---

## 🖨️ Export & Printing

### Print Documents
- Full operational plan with cover page
- Route cards with turn-by-turn directions
- Waypoint lists grouped by type
- Communication plan reference
- Quick reference card

### Data Export
- **GPX/KML** import and export
- Radiation track **GeoJSON** export
- Mesh telemetry **CSV and JSON** export
- **Encrypted plan sharing** (.gdplan format) with AES-256-GCM encryption

---

## 🚀 Installation

### Option 1: Run Locally

```bash
git clone https://github.com/BlackDotTechnology/GridDown.git
cd GridDown

# Serve with any static server
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

### Option 2: Install as PWA

1. Visit the hosted app URL
2. Click "Install" when prompted (or browser menu → "Install App")
3. App will be available offline from your home screen

### Option 3: Deploy to Hosting

Upload contents to any static hosting:
- GitHub Pages
- Netlify / Vercel
- Cloudflare Pages
- Firebase Hosting
- Any web server (Apache, Nginx, etc.)

---

## 📁 Project Structure

```
GridDown/
├── index.html              # App entry point
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline caching)
├── css/
│   └── app.css             # All styles
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── js/
    ├── app.js              # Application bootstrap
    ├── core/
    │   ├── constants.js    # Configuration & type definitions
    │   ├── state.js        # Centralized state management
    │   ├── events.js       # Pub/sub event system
    │   └── history.js      # Undo/redo support
    ├── utils/
    │   ├── helpers.js      # Utility functions
    │   ├── storage.js      # IndexedDB persistence
    │   ├── icons.js        # SVG icon library
    │   ├── coordinates.js  # Coordinate parsing/formatting
    │   └── events-manager.js
    └── modules/
        ├── map.js          # Map rendering & interaction
        ├── panels.js       # UI panel content
        ├── modals.js       # Modal dialogs & toasts
        ├── sidebar.js      # Navigation sidebar
        ├── routebuilder.js # Route creation
        ├── logistics.js    # Resource calculations
        ├── contingency.js  # Bail-out planning
        ├── offline.js      # Tile downloading
        ├── gpx.js          # GPX import/export
        ├── kml.js          # KML/KMZ support
        ├── gps.js          # GPS tracking
        ├── navigation.js   # Turn-by-turn guidance
        ├── elevation.js    # Elevation profiles
        ├── terrain.js      # Terrain analysis
        ├── weather.js      # Weather integration
        ├── sunmoon.js      # Astronomical calculations
        ├── declination.js  # Magnetic declination
        ├── radio.js        # Frequency database
        ├── commplan.js     # Communication planning
        ├── aprs.js         # APRS integration
        ├── meshtastic.js   # Mesh networking
        ├── meshtastic-client.js # Real device communication
        ├── radiacode.js    # Gamma spectrometer
        ├── rfsentinel.js   # RF Sentinel integration
        ├── sstv.js         # SSTV encode/decode
        ├── sstv-ai.js      # SSTV AI enhancement
        ├── sstv-dsp.js     # SSTV DSP (waterfall, slant, drift)
        ├── sarsat.js       # SARSAT PLB/ELT/EPIRB beacon receiver
        ├── tak.js          # CoT Bridge integration
        ├── team.js         # Team management
        ├── medical.js      # Medical reference
        ├── fieldguides.js  # Offline field guides
        ├── streamgauge.js  # USGS water data
        ├── barometer.js    # Barometric altimeter
        ├── airquality.js   # EPA AirNow integration
        ├── rflos.js        # RF line-of-sight
        ├── celestial.js    # Celestial navigation (8-phase)
        ├── star-id.js      # Star identification
        ├── camera-sextant.js # Camera-based sextant
        ├── sos.js          # Emergency features
        ├── measure.js      # Distance/area tool
        ├── search.js       # Global search system
        ├── landmark.js     # Landmark database
        ├── wizard.js       # Situation wizard
        ├── mobile.js       # Mobile enhancements
        ├── print.js        # Print/PDF export
        ├── plansharing.js  # Encrypted sharing
        ├── nightmode.js    # Night vision modes
        ├── alerts.js       # Alert system
        ├── satweather.js   # Satellite weather imagery
        ├── onboarding.js   # First-run tour
        ├── undo.js         # Undo/redo
        ├── networkstatus.js    # Offline indicator
        ├── networkquality.js   # Connection quality
        ├── storagemonitor.js   # Storage quota
        ├── update.js           # Update notifications
        └── compatibility.js    # Browser detection
```

---

## 🌐 Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 80+ | ✅ Full support including Web Bluetooth |
| Edge | 80+ | ✅ Full support including Web Bluetooth |
| Opera | 67+ | ✅ Full support including Web Bluetooth |
| Firefox | 75+ | ⚠️ No Web Bluetooth (APRS/Meshtastic/RadiaCode unavailable) |
| Safari | 13.1+ | ⚠️ No Web Bluetooth |
| Chrome Android | 80+ | ✅ Full support + barometer sensor |
| Safari iOS | 13+ | ⚠️ Limited - no Web Bluetooth |

**Note**: Web Bluetooth features (APRS, Meshtastic, RadiaCode, RF Sentinel via BLE) require Chrome, Edge, or Opera.

---

## 🔢 Stats

- **45+ JavaScript modules**
- **~80,000+ lines of code**
- Fully offline-capable PWA
- Zero external dependencies at runtime
- No accounts, no telemetry, no cloud

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` | Open global search |
| `F1` or `Ctrl+/` | Open situation wizard |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+D` | Toggle favorite (in search) |
| `Escape` | Close modal/panel/search |
| `+` / `-` | Zoom in/out |
| `N` | Reset map to north |
| `Tab` | Next search category |
| `Shift+Tab` | Previous search category |

---

## 🐛 Troubleshooting

### GPS Not Working
1. Enable Location Services in device settings
2. Grant location permission when prompted
3. Move outdoors for better satellite reception
4. Check that browser has location access

### Offline Maps Not Loading

If cached tiles don't appear offline:
1. Ensure tiles were downloaded while online
2. Check storage quota (Settings → Storage)
3. Clear browser cache and re-download tiles
4. Try a different map layer

### Web Bluetooth Connection Failed

For APRS, Meshtastic, or RadiaCode:
1. Ensure Bluetooth is enabled on your device
2. Use Chrome, Edge, or Opera (Firefox/Safari don't support Web Bluetooth)
3. Device must be in pairing mode
4. Stay within Bluetooth range (~10m)

---

## 📊 Data Formats

### Waypoint
```json
{
    "id": "abc123xyz",
    "name": "Basecamp Alpha",
    "type": "camp",
    "lat": 37.4215,
    "lon": -119.1892,
    "elevation": 2450,
    "notes": "Good cover, near creek",
    "verified": true,
    "lastVerified": "2025-01-15T10:30:00Z"
}
```

### Route
```json
{
    "id": "route123",
    "name": "Sierra Traverse",
    "points": [
        { "lat": 37.42, "lon": -119.19, "terrain": "road" },
        { "lat": 37.45, "lon": -119.15, "terrain": "trail" }
    ],
    "distance": "45.2",
    "duration": "6h 30m",
    "elevation": "3200"
}
```

### Radiation Track
```json
{
    "id": "track_1706234567890",
    "name": "Survey Alpha",
    "startTime": 1706234567890,
    "points": [
        {
            "lat": 37.4215,
            "lon": -119.1892,
            "doseRate": 0.12,
            "countRate": 35,
            "timestamp": 1706234567890
        }
    ],
    "stats": {
        "minDose": 0.08,
        "maxDose": 0.45,
        "avgDose": 0.14,
        "distance": 2.3
    }
}
```

### RF Sentinel Track
```json
{
    "id": "ac_A1B2C3",
    "type": "aircraft",
    "lat": 37.7749,
    "lon": -122.4194,
    "altitude": 35000,
    "heading": 270,
    "speed": 450,
    "callsign": "UAL123",
    "squawk": "1200",
    "lastSeen": 1706234567890
}
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a Pull Request

---

## 📜 License

GridDown is dual-licensed:
- **Community License (GPL v3)** - Free for personal, educational, and non-commercial use
- **Commercial License** - Required for business use and hardware bundling

See [LICENSE](LICENSE) for complete details.

## 🔒 Privacy

GridDown collects no personal data and operates offline-first. See [PRIVACY.md](PRIVACY.md) for details.

## ⚠️ Disclaimer

GridDown is a supplementary tool, not a substitute for professional emergency services or proper training. See [DISCLAIMER.md](DISCLAIMER.md) for safety and liability information.

---

## 🙏 Acknowledgments

- OpenStreetMap contributors for map data
- USGS for topographic data and stream gauge API
- Open-Meteo for weather API
- NASA GIBS for satellite imagery
- EPA AirNow for air quality data
- Iowa Environmental Mesonet for NEXRAD radar
- Bob Bruninga, WB4APR (SK), creator of APRS®. APRS is a registered trademark. Special thanks to [TAPR](https://tapr.org/) (Tucson Amateur Packet Radio) for their contributions to amateur radio.
- RadiaCode BLE protocol from [cdump/radiacode](https://github.com/cdump/radiacode) and [mkgeiger/RadiaCode](https://github.com/mkgeiger/RadiaCode) (MIT)
- Icons inspired by Lucide/Feather icon sets
- MQTT.js for browser-based MQTT over WebSocket

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for complete data source licensing information.

---

## 📈 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

**Current Version: 6.57.3** (February 2025)

### Recent Highlights
- **v6.57.3** - FPV Drone Detections panel - View passively detected FPV drones with protocol/frequency/signal info
- **v6.57.2** - RF Sentinel FPV drone support - Receive both Remote ID and FPV/RF drones
- **v6.57.1** - CoT Bridge Setup Wizard - Guided setup for bridge connection
- **v6.57.0** - CoT Bridge - Bidirectional Cursor on Target integration with ATAK/WinTAK
- **v6.56.0** - Meshtastic waypoint/route sharing over mesh
- **v6.55.0** - Meshtastic telemetry export (CSV, JSON health reports)
- **v6.54.0** - Meshtastic traceroute visualization
- **v6.53.0** - Drop Pin → Send to Mesh
- **v6.52.0** - Encrypted direct messages with PKI
- **v6.51.0** - Meshtastic Quick Setup & Field UX
- **v6.50.0** - Offline message queue (store-and-forward)
- **v6.49.0** - Meshtastic setup wizard, scenario presets, canned messages
- **v6.48.0** - Meshtastic device type selector with capability detection
- **v6.46.0** - Situation Wizard - Decision tree for stress-friendly feature discovery
- **v6.45.0** - Mobile Enhancements - FAB, battery/connection status, PWA install prompt
- **v6.44.0** - Search Favorites and Help/Settings search integration
- **v6.43.0** - Landmark pack search with 3,100+ public domain locations
- **v6.40.0** - Global Search System with fuzzy matching (Ctrl+K)
- **v6.24.0** - AQI monitoring & automated alerts with forecast
- **v6.23.0** - Air Quality Index (AQI) integration via EPA AirNow
- **v6.22.9** - NASA GIBS satellite imagery integration
- **v6.19.9** - SARSAT 406 MHz beacon receiver integration
- **v6.19.0** - SSTV encode/decode with 12 modes
- **v6.18.0** - RF Sentinel multi-protocol RF detection

### Documentation
- [User Guide (DOCX)](docs/GridDown_User_Guide.docx) - Comprehensive user manual
- [User Guide (Markdown)](docs/GridDown_User_Guide.md) - Markdown version
- [Hardware Compatibility Guide](docs/HARDWARE_GUIDE.md) - Radios, cables, and accessories
- [Architecture Overview](docs/ARCHITECTURE.md) - Technical documentation
- [Privacy Policy](PRIVACY.md) - Data handling practices
- [Terms of Service](TERMS_OF_SERVICE.md) - Usage terms and conditions
- [Disclaimer](DISCLAIMER.md) - Safety and liability information
- [Security Policy](SECURITY.md) - Vulnerability reporting
- [Attributions](ATTRIBUTIONS.md) - Third-party data sources and licensing

---

<p align="center">
  <strong>GridDown</strong> - When the grid goes down, you don't.
</p>
