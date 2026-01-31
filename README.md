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
- Connect to Meshtastic devices via **Web Bluetooth/Serial**
- Off-grid text messaging
- Position sharing across mesh network
- Node discovery and management

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

### Supported Modes (12 Total)

| Mode | Resolution | Time | Color Mode | VIS Code |
|------|------------|------|------------|----------|
| Robot 36 | 320×240 | 36s | YCrCb | 0x08 |
| Robot 72 | 320×240 | 72s | YCrCb | 0x0C |
| Martin M1 | 320×256 | 114s | GBR | 0x2C |
| Martin M2 | 160×256 | 58s | GBR | 0x28 |
| Scottie S1 | 320×256 | 110s | GBR | 0x3C |
| Scottie S2 | 160×256 | 71s | GBR | 0x38 |
| PD-90 | 320×256 | 90s | YCrCb | 0x63 |
| PD-120 | 640×496 | 126s | YCrCb | 0x5F |
| PD-180 | 640×496 | 180s | YCrCb | 0x60 |
| PD-240 | 640×496 | 240s | YCrCb | 0x62 |
| PD-290 | 800×616 | 290s | YCrCb | 0x64 |
| Wraase SC2-180 | 320×256 | 180s | RGB | 0x55 |

### Receive Features
- **Auto VIS code detection** - Automatically identifies transmission mode
- **Real-time decode progress** with live preview
- **Signal strength meter** for tuning assistance
- **Image history** with timestamps, mode info, and PNG export
- **Annotate & Retransmit** - Open received images in editor for markup

### Transmit Features
- **Camera capture** - Take photo and transmit
- **Gallery import** - Send existing images
- **Map view capture** - Transmit your current tactical view
- **Automatic callsign overlay** for legal compliance
- **Grid square auto-calculation** from GPS position
- **Mode-specific scaling** - Images auto-resized to mode dimensions

### DSP Processing (NEW in v6.19.4)
- **Waterfall Display** - Real-time FFT spectrogram with 4 colormaps (Viridis, Plasma, Thermal, Grayscale)
- **Frequency markers** - Visual indicators for SYNC, BLACK, VIS, WHITE frequencies
- **Auto-Slant Correction** - Fixes image skew from sample rate mismatches
- **Frequency Drift Compensation** - Tracks and corrects transmitter frequency drift (±50 Hz)
- **Signal Quality Analysis** - Guidance for optimal signal levels

### Image Annotation (NEW in v6.19.7)
- **Drawing Tools** - Pen, Arrow, Circle, Rectangle, Text, Eraser
- **Customization** - Color picker and line width (Thin/Medium/Thick/Bold)
- **Undo/Clear** - 20-level undo history
- **Auto-Flatten** - Annotations automatically merged before transmission
- **Touch Support** - Full mobile/tablet drawing support

### Expandable Views (NEW in v6.19.6)
- **Full-screen waterfall** - 800×300 expanded display with live updates
- **Full-screen image preview** - Large format during active decode
- **Keyboard shortcut** - Press Escape to close

### AI Enhancement (NEW in v6.19.2)
- **2× and 4× AI upscaling** using Real-CUGAN/Real-ESRGAN models
- **Denoising** for radio interference removal
- **OCR text extraction** - Automatically detect callsigns, grid squares, coordinates
- **Lightweight architecture** - Models downloaded separately (~2-17MB each)
- **WebGPU acceleration** when available (WASM fallback)

### Hardware Requirements
- Any amateur radio with audio output (receive)
- Audio interface for transmit (Digirig, SignaLink, direct cable)
- See [Hardware Compatibility Guide](docs/HARDWARE_GUIDE.md) for detailed setup

### Legal Requirements
- Valid amateur radio license required for transmitting
- Callsign verification before TX enabled
- 10-minute identification reminder
- Automatic callsign overlay option

---

## 🆘 SARSAT Beacon Receiver (NEW in v6.19.9)

Monitor COSPAS-SARSAT 406 MHz emergency beacons with an external Raspberry Pi-based SDR receiver.

### Beacon Types Supported
| Type | Full Name | Use Case | Icon |
|------|-----------|----------|------|
| **PLB** | Personal Locator Beacon | Hikers, adventurers, individuals | 🚶 |
| **ELT** | Emergency Locator Transmitter | Aviation emergencies | ✈️ |
| **EPIRB** | Emergency Position-Indicating Radio Beacon | Maritime vessels | ⚓ |
| **SSAS** | Ship Security Alert System | Maritime security | 🚨 |

### Features
- **Real-time beacon tracking** with map display
- **Emergency alerts** with pulsing visual indicators and audio alerts
- **Country identification** from 200+ MID codes
- **GPS position extraction** from long-format messages
- **Test beacon filtering** - distinguish training from real emergencies
- **Auto-waypoint creation** for beacons with coordinates
- **Position history** tracking with track tails

### Connection Methods
- **WebSocket** - Connect to Raspberry Pi receiver over network
- **Web Serial** - Direct USB connection to receiver hardware

### Hardware Requirements
- Raspberry Pi 4 or 5
- RTL-SDR Blog V4 (or compatible SDR)
- 406 MHz antenna (quarter-wave whip, ~18.5 cm)
- Optional: 406 MHz bandpass filter and LNA

### Protocol Details
| Parameter | Value |
|-----------|-------|
| Frequency | 406.025 - 406.040 MHz |
| Modulation | BPSK @ 400 bps |
| Message Length | 112 bits (short) / 144 bits (long) |
| Error Correction | BCH codes |

### Important Notice
This is a **supplementary monitoring tool** for situational awareness. Always contact official search and rescue services in emergencies. Receiving 406 MHz signals is legal; transmitting is strictly prohibited except by certified beacons.

---

## 🥾 Field Guides (NEW in v6.13)

Comprehensive offline reference library with **600+ entries** covering:

### Categories
- **Foraging**: 150+ edible plants, mushrooms, and wild foods
- **Medicinal Plants**: 100+ species with preparation methods
- **Wildlife**: Mammals, birds, reptiles, and insects
- **Hazards**: Dangerous plants, animals, and environmental risks
- **Survival Skills**: Fire, shelter, water, navigation techniques
- **Knots & Lashing**: 50+ knot tutorials with use cases

### Features
- Full-text search across all guides
- Favorites system for quick access
- Offline-first with IndexedDB storage
- Regional filtering (North America, Europe, etc.)
- Seasonal availability indicators
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

### Barometric Altimeter (NEW in v6.14)
- Uses device pressure sensor when available
- Calibrate to known elevation or GPS
- Pressure trend monitoring
- Altitude history graph

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
- Recommends optimal browser for full functionality
- Graceful degradation for unsupported features

---

## 🆘 SOS & Emergency

- Emergency contact management with quick-dial
- Quick-access emergency information card
- **Signal mirror** sun angle calculator
- International distress signal reference
- Emergency frequencies quick reference

---

## 📄 Print & Export

### Document Types
- **Full operational plan** - Complete mission package
- **Route cards** - Turn-by-turn directions for each leg
- **Waypoint lists** - Grouped by type with coordinates
- **Communication plan** - Frequencies, call signs, schedule
- **Quick reference card** - Pocket-sized essential info

### Data Formats
- **GPX** import/export (GPS Exchange Format)
- **KML/KMZ** support for Google Earth
- **GeoJSON** for radiation tracks
- **Encrypted .gdplan** format with AES-256-GCM

### Plan Sharing
- Export entire plans with optional passphrase protection
- Package includes waypoints, routes, and logistics config
- Secure sharing between team members

---

## ⚙️ Additional Features

### Night Mode
- **Standard dark theme** for normal use
- **Red light mode** preserves night vision
- **Blackout mode** minimal screen glow

### Accessibility (WCAG 2.1)
- Comprehensive ARIA attributes (417 attributes)
- Skip-to-content navigation
- Keyboard navigation support
- Reduced motion option
- Screen reader compatible

### 🔍 Global Search System (NEW in v6.40-6.44)

Unified search across all app features with **Ctrl+K** (desktop) or FAB button (mobile).

**8 Search Categories**:
| Category | Icon | Examples |
|----------|------|----------|
| Actions | ⚡ | Add waypoint, Start navigation, Toggle night mode |
| Celestial | ⭐ | Stars (Polaris, Sirius), Planets (Mars, Venus), Sun/Moon |
| Landmarks | 🏔️ | 3,100+ peaks, summits, and geographic features |
| Waypoints | 📍 | Your saved waypoints |
| Routes | 🛣️ | Your saved routes |
| Team | 👥 | Team members and rally points |
| Help | ❓ | 20 searchable help topics |
| Settings | ⚙️ | 15 quick-toggle settings |

**Features**:
- Fuzzy matching with typo tolerance
- Category filtering with Tab/Shift+Tab
- Favorites system (Ctrl+D to favorite, max 20)
- Recent searches history
- Keyboard navigation (↑/↓/Enter/Esc)

### ❓ Situation Wizard (NEW in v6.46)

Decision tree that guides users to relevant features based on their situation. Designed for stress scenarios where users can't remember feature names.

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
        ├── radiacode.js    # Gamma spectrometer
        ├── rfsentinel.js   # RF Sentinel integration
        ├── sstv.js         # SSTV encode/decode
        ├── sstv-ai.js      # SSTV AI enhancement
        ├── sstv-dsp.js     # SSTV DSP (waterfall, slant, drift)
        ├── sarsat.js       # SARSAT PLB/ELT/EPIRB beacon receiver
        ├── team.js         # Team management
        ├── medical.js      # Medical reference
        ├── fieldguides.js  # Offline field guides
        ├── streamgauge.js  # USGS water data
        ├── barometer.js    # Barometric altimeter
        ├── rflos.js        # RF line-of-sight
        ├── celestial.js    # Celestial navigation (8-phase) (NEW)
        ├── star-id.js      # Star identification
        ├── camera-sextant.js # Camera-based sextant
        ├── sos.js          # Emergency features
        ├── measure.js      # Distance/area tool
        ├── search.js       # Global search system (NEW)
        ├── landmark.js     # Landmark database (NEW)
        ├── wizard.js       # Situation wizard (NEW)
        ├── mobile.js       # Mobile enhancements (NEW)
        ├── print.js        # Print/PDF export
        ├── plansharing.js  # Encrypted sharing
        ├── nightmode.js    # Night vision modes
        ├── alerts.js       # Alert system
        ├── airquality.js   # EPA AirNow integration
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
| Chrome Android | 80+ | ✅ Full support |
| Safari iOS | 13+ | ⚠️ Limited - no Web Bluetooth |

**Note**: Web Bluetooth features (APRS, Meshtastic, RadiaCode, RF Sentinel via BLE) require Chrome, Edge, or Opera.

---

## 🔧 Troubleshooting

### GPS / Location Issues

**Safari/iOS Console Message**: `CoreLocationProvider: kCLErrorLocationUnknown`

This is **NOT a GridDown bug** - it's an iOS/macOS system message that appears when:
- Location services are disabled in device settings
- Device is indoors with poor GPS signal  
- Device is in airplane mode
- GPS hardware hasn't acquired satellites yet

**Solutions**:
1. Enable Location Services: Settings → Privacy → Location Services
2. Grant location permission to your browser
3. Move outdoors or near a window for better GPS signal
4. Wait 30-60 seconds for GPS to acquire satellites
5. Use "Set Manual Position" if GPS is unavailable

**Firefox/Android**: If location fails, check that location permission is granted in browser settings.

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

GridDown is a supplementary tool, not a substitute for professional emergency services or proper training. See [DISCLAIMER.md](DISCLAIMER.md) for complete safety and liability information.

---

## 🙏 Acknowledgments

- Built with **vanilla JavaScript** for maximum portability and offline reliability
- Map tiles from OpenStreetMap, USGS, USFS, Esri, and OpenTopoMap
- Satellite imagery from [NASA GIBS](https://earthdata.nasa.gov/gibs) (Global Imagery Browse Services)
- Weather radar from NOAA/NWS via [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu/)
- Air quality data from [EPA AirNow](https://www.airnow.gov/) (US, Canada, Mexico)
- Weather and elevation data from [Open-Meteo](https://open-meteo.com/)
- Stream gauge data from [USGS National Water Information System](https://waterservices.usgs.gov/)
- Geocoding from [OpenStreetMap Nominatim](https://nominatim.org/)
- **APRS®** (Automatic Packet Reporting System) - Copyright © [Bob Bruninga, WB4APR](http://www.aprs.org/) (SK). APRS is a registered trademark. Special thanks to [TAPR](https://tapr.org/) (Tucson Amateur Packet Radio) for their contributions to amateur radio.
- RadiaCode BLE protocol from [cdump/radiacode](https://github.com/cdump/radiacode) and [mkgeiger/RadiaCode](https://github.com/mkgeiger/RadiaCode) (MIT)
- Icons inspired by Lucide/Feather icon sets
- MQTT.js for browser-based MQTT over WebSocket

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for complete data source licensing information.

---

## 📈 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

**Current Version: 6.47.0** (January 2025)

### Recent Highlights
- **v6.47.0** - Documentation update - Added DISCLAIMER.md, TERMS_OF_SERVICE.md, updated README
- **v6.46.0** - Situation Wizard - Decision tree for stress-friendly feature discovery
- **v6.45.0** - Mobile Enhancements - FAB, battery/connection status, PWA install prompt
- **v6.44.0** - Search Favorites and Help/Settings search integration
- **v6.43.0** - Landmark pack search with 3,100+ public domain locations
- **v6.42.0** - Contextual search suggestions based on time/location
- **v6.40.0** - Global Search System with fuzzy matching (Ctrl+K)
- **v6.23.0** - Air Quality Index (AQI) integration via EPA AirNow
- **v6.22.9** - NASA GIBS satellite imagery integration
- **v6.21.0** - Comprehensive accessibility improvements (ARIA attributes)
- **v6.20.0** - Modular architecture refactoring
- **v6.19.9** - SARSAT 406 MHz beacon receiver integration
- **v6.19.0** - SSTV encode/decode with 12 modes
- **v6.18.0** - RF Sentinel multi-protocol RF detection

### Documentation
- [User Guide](docs/GridDown_User_Guide.docx) - Comprehensive user manual
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
