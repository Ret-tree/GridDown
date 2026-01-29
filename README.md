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
        ├── rfsentinel.js   # RF Sentinel integration (NEW)
        ├── team.js         # Team management
        ├── medical.js      # Medical reference
        ├── fieldguides.js  # Offline field guides (NEW)
        ├── streamgauges.js # USGS water data (NEW)
        ├── barometer.js    # Barometric altimeter (NEW)
        ├── rflos.js        # RF line-of-sight (NEW)
        ├── sos.js          # Emergency features
        ├── measure.js      # Distance/area tool
        ├── search.js       # Location search
        ├── print.js        # Print/PDF export
        ├── plansharing.js  # Encrypted sharing
        ├── nightmode.js    # Night vision modes
        ├── onboarding.js   # First-run tour
        ├── undo.js         # Undo/redo
        ├── networkstatus.js    # Offline indicator (NEW)
        ├── networkquality.js   # Connection quality (NEW)
        ├── storagemonitor.js   # Storage quota (NEW)
        ├── update.js           # Update notifications (NEW)
        └── compatibility.js    # Browser detection (NEW)
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

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Escape` | Close modal/panel |
| `+` / `-` | Zoom in/out |
| `N` | Reset map to north |

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

MIT License - See [LICENSE](LICENSE) for details.

## 🔒 Privacy

GridDown collects no personal data and operates offline-first. See [PRIVACY.md](PRIVACY.md) for details.

---

## 🙏 Acknowledgments

- Built with **vanilla JavaScript** for maximum portability and offline reliability
- Map tiles from OpenStreetMap, USGS, USFS, and Esri
- Weather and elevation data from [Open-Meteo](https://open-meteo.com/)
- RadiaCode BLE protocol from [cdump/radiacode](https://github.com/cdump/radiacode) and [mkgeiger/RadiaCode](https://github.com/mkgeiger/RadiaCode) (MIT)
- Icons inspired by Lucide/Feather icon sets
- MQTT.js for browser-based MQTT over WebSocket

---

## 📈 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

**Current Version: 6.18.5** (January 2025)

### Recent Highlights
- **v6.18.5** - Settings version display fix, About section branding
- **v6.18.4** - Pre-launch polish, privacy policy
- **v6.18.3** - Modal accessibility fix, offline mode console cleanup
- **v6.18.2** - Touch support for offline map region drawing
- **v6.18.1** - MQTT connection support for RF Sentinel
- **v6.18.0** - RF Sentinel integration with multi-protocol RF detection
- **v6.17.x** - Storage quota monitoring, network quality indicator, map layer audit
- **v6.16.0** - Update notifications, feature-specific browser warnings
- **v6.15.0** - Offline status indicator with duration tracking
- **v6.14.0** - Barometric altimeter with pressure trends
- **v6.13.0** - Offline field guides (600+ entries)
- **v6.12.0** - RF Line-of-Sight analysis
- **v6.11.0** - USGS stream gauge integration

---

<p align="center">
  <strong>GridDown</strong> - When the grid goes down, you don't.
</p>
