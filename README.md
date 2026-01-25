# GridDown

**Professional-Grade Offline Tactical Navigation & Planning**

GridDown is a feature-rich Progressive Web App (PWA) designed for operational planning in challenging environments where connectivity cannot be assumed. Built for preppers, survivalists, emergency responders, SAR teams, and tactical users who need reliable offline-first functionality.

![GridDown Screenshot](docs/screenshot.png)

## 🎯 Core Philosophy

- **Offline-First**: Every feature works without internet after initial setup
- **Paper Backup**: Comprehensive print/PDF export when electronics fail
- **Field-Ready**: Designed for real-world tactical and emergency scenarios
- **Self-Reliant**: No cloud dependencies, no accounts required

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

### 📥 Offline Maps
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

### Real Device Connection (v6.6.0)
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

## 🏥 Medical Reference

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

### Terrain Analysis
- **Slope analysis** with trafficability assessment
- Aspect (direction slope faces)
- **Viewshed calculation** for observation posts
- Solar exposure scoring for camp site selection
- Flood risk assessment
- Cover and concealment analysis

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
- Comprehensive ARIA attributes
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
cd GridDown/griddown

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
- Firebase Hosting
- Any web server (Apache, Nginx, etc.)

---

## 📁 Project Structure

```
griddown/
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
        ├── radiacode.js    # Gamma spectrometer (NEW)
        ├── team.js         # Team management (NEW)
        ├── medical.js      # Medical reference (NEW)
        ├── sos.js          # Emergency features
        ├── measure.js      # Distance/area tool
        ├── search.js       # Location search
        ├── print.js        # Print/PDF export
        ├── plansharing.js  # Encrypted sharing
        ├── nightmode.js    # Night vision modes
        ├── onboarding.js   # First-run tour
        └── undo.js         # Undo/redo
```

---

## 🌐 Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 80+ | Full support including Web Bluetooth |
| Edge | 80+ | Full support including Web Bluetooth |
| Opera | 67+ | Full support including Web Bluetooth |
| Firefox | 75+ | No Web Bluetooth (APRS/Meshtastic/RadiaCode unavailable) |
| Safari | 13.1+ | No Web Bluetooth |
| Chrome Android | 80+ | Full support |
| Safari iOS | 13+ | Limited - no Web Bluetooth |

**Note**: Web Bluetooth features (APRS, Meshtastic, RadiaCode) require Chrome, Edge, or Opera.

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

---

## 🙏 Acknowledgments

- Built with **vanilla JavaScript** for maximum portability and offline reliability
- Map tiles from OpenStreetMap, USGS, USFS, and Esri
- Weather and elevation data from [Open-Meteo](https://open-meteo.com/)
- RadiaCode BLE protocol from [cdump/radiacode](https://github.com/cdump/radiacode) and [mkgeiger/RadiaCode](https://github.com/mkgeiger/RadiaCode) (MIT)
- Icons inspired by Lucide/Feather icon sets

---

## 📈 Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

**Current Version: 6.6.0** (January 2025)

---

<p align="center">
  <strong>GridDown</strong> - When the grid goes down, you don't.
</p>
