# GridDown Architecture

**Version:** 6.57.x  
**Last Updated:** February 2025

## Overview

GridDown is a tactical navigation Progressive Web Application (PWA) built with vanilla JavaScript, optimized for offline-first operation in infrastructure-denied environments. The application follows a modular IIFE (Immediately Invoked Function Expression) pattern with 59 specialized modules.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              index.html                                      │
│                          (App Shell / Entry Point)                           │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                               app.js                                         │
│                      (Initialization & Bootstrap)                            │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
┌───────────────┐       ┌─────────────────┐       ┌───────────────┐
│     CORE      │       │     MODULES     │       │     UTILS     │
│   (4 files)   │       │   (59 modules)  │       │   (5 files)   │
├───────────────┤       ├─────────────────┤       ├───────────────┤
│ state.js      │◄──────│ Communication   │──────►│ coordinates.js│
│ events.js     │◄──────│ Navigation      │──────►│ storage.js    │
│ constants.js  │◄──────│ Hardware        │──────►│ helpers.js    │
│ history.js    │◄──────│ UI/System       │──────►│ icons.js      │
└───────────────┘       └─────────────────┘       │ events-mgr.js │
                                                  └───────────────┘
```

## Module Categories (59 Total)

### Communication & Mesh Networking (8 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMMUNICATION LAYER                           │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   MESHTASTIC    │      APRS       │         TAK/CoT             │
│  ┌───────────┐  │  ┌───────────┐  │  ┌───────────────────────┐  │
│  │meshtastic │  │  │  aprs.js  │  │  │       tak.js          │  │
│  │   .js     │  │  │           │  │  │                       │  │
│  │  (6,912)  │  │  │  (1,819)  │  │  │      (1,473)          │  │
│  └─────┬─────┘  │  └───────────┘  │  └───────────────────────┘  │
│        │        │                 │              │               │
│  ┌─────▼─────┐  │                 │              ▼               │
│  │meshtastic │  │                 │    ┌─────────────────┐      │
│  │-client.js │  │                 │    │  ATAK / WinTAK  │      │
│  │  (1,075)  │  │                 │    │   (External)    │      │
│  └───────────┘  │                 │    └─────────────────┘      │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `meshtastic.js` | 6,912 | Full Meshtastic integration: nodes, channels, DMs, PKI, traceroute, telemetry export |
| `meshtastic-client.js` | 1,075 | Bridge to official @meshtastic/core library via esm.sh |
| `aprs.js` | 1,819 | APRS packet radio: Bluetooth TNC, AX.25 parsing, Mic-E decoding |
| `tak.js` | 1,473 | Cursor on Target (CoT) bridge for ATAK/WinTAK interoperability |
| `commplan.js` | 1,119 | Communication planning: schedules, frequencies, check-in windows |
| `plansharing.js` | 1,120 | AES-256 encrypted plan sharing via QR codes |
| `team.js` | 1,352 | Team management: members, roles, check-ins, status tracking |
| `sos.js` | 1,736 | Emergency beacon: SOS alerts, check-ins, distress signals |

### Navigation & Mapping (9 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                     NAVIGATION LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      map.js (4,032)                      │    │
│  │         Canvas-based tile renderer, 15+ layers           │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│     ┌───────────┬───────────┼───────────┬───────────┐           │
│     ▼           ▼           ▼           ▼           ▼           │
│ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐     │
│ │terrain │ │measure │ │elevation │ │offline │ │routebldr │     │
│ │(1,354) │ │(1,146) │ │  (739)   │ │(1,114) │ │  (858)   │     │
│ └────────┘ └────────┘ └──────────┘ └────────┘ └──────────┘     │
│                                                                  │
│     ┌───────────┬───────────┬───────────┐                       │
│     ▼           ▼           ▼           ▼                       │
│ ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐                  │
│ │  gps   │ │navigatn│ │contngcy  │ │ rflos  │                  │
│ │(1,354) │ │(1,205) │ │ (1,095)  │ │ (847)  │                  │
│ └────────┘ └────────┘ └──────────┘ └────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `map.js` | 4,032 | Core map engine: canvas rendering, tile caching, layer management |
| `navigation.js` | 1,205 | Turn-by-turn navigation with voice guidance |
| `gps.js` | 1,354 | GPS input: Web Serial, Bluetooth, Geolocation API, NMEA parsing |
| `terrain.js` | 1,354 | Terrain analysis: slope, aspect, viewsheds, cross-sections |
| `elevation.js` | 739 | Elevation profiles via Open-Meteo API |
| `measure.js` | 1,146 | Measurement tools: distance, area, bearing, coordinates |
| `offline.js` | 1,114 | Offline tile management: download regions, storage quota |
| `routebuilder.js` | 858 | Interactive route creation and editing |
| `contingency.js` | 1,095 | Bail-out analysis: escape routes, safe zones |
| `rflos.js` | 847 | RF line-of-sight analysis for radio planning |

### Celestial Navigation (4 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                   CELESTIAL NAVIGATION                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  celestial.js (7,194)                    │    │
│  │    Sight reduction, intercept method, fix plotting       │    │
│  │    Nautical Almanac data, GHA/Dec calculations           │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│   ┌───────────┐       ┌───────────┐       ┌───────────┐        │
│   │ sunmoon   │       │  star-id  │       │camera-sxt │        │
│   │  (1,005)  │       │   (948)   │       │   (766)   │        │
│   │           │       │           │       │           │        │
│   │ Rise/Set  │       │ Star ID   │       │ Camera    │        │
│   │ Twilight  │       │ from sky  │       │ sextant   │        │
│   │ Lunar     │       │ image     │       │ altitude  │        │
│   └───────────┘       └───────────┘       └───────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `celestial.js` | 7,194 | Full celestial navigation: sight reduction, LOP plotting, running fix |
| `sunmoon.js` | 1,005 | Astronomical calculations: rise/set, twilight, lunar phase |
| `star-id.js` | 948 | Star identification from camera images |
| `camera-sextant.js` | 766 | Camera-based celestial body altitude measurement |

### Hardware Integration (5 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HARDWARE LAYER                                │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Web Serial  │  │Web Bluetooth │  │  Sensors API │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│    ┌────┴────┐       ┌────┴────┐       ┌────┴────┐              │
│    ▼         ▼       ▼         ▼       ▼         ▼              │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │sarsat│ │rfsentl│ │radiac│ │mesht.│ │baromr│ │rangef│         │
│ │(1018)│ │(1660) │ │(1554)│ │client│ │ (743)│ │ (897)│         │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
│    │         │         │        │        │        │             │
│    ▼         ▼         ▼        ▼        ▼        ▼             │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│ │SDR   │ │RF Snt│ │Radia │ │Mesht │ │Device│ │Laser │         │
│ │Dongle│ │Pro   │ │Code  │ │Node  │ │Barom │ │Range │         │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `radiacode.js` | 1,554 | RadiaCode radiation detector via Bluetooth LE |
| `rfsentinel.js` | 1,660 | RF Sentinel Pro SDR: spectrum analysis, FPV drone detection |
| `sarsat.js` | 1,018 | SARSAT beacon detection: PLB/ELT/EPIRB via SDR |
| `barometer.js` | 743 | Device barometer: pressure altitude, weather trends |
| `rangefinder.js` | 897 | Laser rangefinder integration |

### Weather & Environment (6 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                  ENVIRONMENTAL DATA                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│    │  weather.js │    │ satweather  │    │   alerts    │       │
│    │    (833)    │    │    (780)    │    │    (664)    │       │
│    │             │    │             │    │             │       │
│    │ Open-Meteo  │    │ GOES/JPSS   │    │ NWS Alerts  │       │
│    │ Forecasts   │    │ Satellite   │    │ Warnings    │       │
│    └─────────────┘    └─────────────┘    └─────────────┘       │
│                                                                  │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│    │ airquality  │    │ streamgauge │    │ declination │       │
│    │   (1,302)   │    │    (702)    │    │    (382)    │       │
│    │             │    │             │    │             │       │
│    │ EPA AirNow  │    │ USGS Water  │    │  WMM2025    │       │
│    │ AQI Data    │    │ Levels      │    │ Mag Decl    │       │
│    └─────────────┘    └─────────────┘    └─────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `weather.js` | 833 | Weather forecasts via Open-Meteo API |
| `satweather.js` | 780 | Satellite imagery: GOES-East/West, JPSS polar orbiters |
| `airquality.js` | 1,302 | EPA AirNow: AQI monitoring, forecasts, station map |
| `streamgauge.js` | 702 | USGS water services: stream levels, flood warnings |
| `alerts.js` | 664 | NWS weather alerts and warnings |
| `declination.js` | 382 | Magnetic declination using WMM2025 model |

### Reference & Field Guides (5 modules)

| Module | Lines | Purpose |
|--------|-------|---------|
| `radio.js` | 885 | Radio frequency reference: FRS, GMRS, MURS, CB, HAM bands |
| `fieldguides.js` | 1,875 | Survival guides: knots, signals, navigation, first aid |
| `medical.js` | 1,892 | Medical reference: triage, conditions, treatments |
| `hiking.js` | 1,485 | Trail planning: Naismith's rule, pace calculations |
| `logistics.js` | 720 | Resource planning: fuel, water, food calculations |

### SSTV - Slow Scan Television (3 modules)

```
┌─────────────────────────────────────────────────────────────────┐
│                      SSTV SYSTEM                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    sstv.js (1,586)                       │    │
│  │         Robot, Scottie, Martin mode encode/decode        │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│              ┌──────────────┴──────────────┐                    │
│              ▼                             ▼                    │
│        ┌───────────┐                 ┌───────────┐              │
│        │ sstv-dsp  │                 │ sstv-ai   │              │
│        │   (580)   │                 │   (587)   │              │
│        │           │                 │           │              │
│        │ DSP/FFT   │                 │ AI image  │              │
│        │ routines  │                 │ enhance   │              │
│        └───────────┘                 └───────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Module | Lines | Purpose |
|--------|-------|---------|
| `sstv.js` | 1,586 | SSTV encode/decode: Robot36, Scottie, Martin modes |
| `sstv-dsp.js` | 580 | Digital signal processing for SSTV |
| `sstv-ai.js` | 587 | AI-assisted image enhancement for received images |

### Import/Export (3 modules)

| Module | Lines | Purpose |
|--------|-------|---------|
| `gpx.js` | 648 | GPX file import/export for routes and waypoints |
| `kml.js` | 742 | KML/KMZ import/export for Google Earth compatibility |
| `print.js` | 1,202 | PDF generation and print layouts |

### UI & System (16 modules)

| Module | Lines | Purpose |
|--------|-------|---------|
| `panels.js` | 21,467 | Main UI rendering: all panel content and interactions |
| `modals.js` | 1,328 | Modal dialog management |
| `sidebar.js` | 265 | Navigation sidebar |
| `search.js` | 3,462 | Global search (Ctrl+K): unified search across all data |
| `wizard.js` | 1,176 | Setup wizards: CoT bridge, Meshtastic, etc. |
| `onboarding.js` | 594 | First-run tour and feature introduction |
| `nightmode.js` | 435 | Red-light night mode for dark adaptation |
| `mobile.js` | 727 | Mobile-specific UI adaptations |
| `undo.js` | 769 | Undo/redo system with action history |
| `update.js` | 347 | Version update notifications |
| `compatibility.js` | 911 | Browser capability detection and warnings |
| `storagemonitor.js` | 389 | Storage quota monitoring and warnings |
| `networkstatus.js` | 397 | Online/offline status detection |
| `networkquality.js` | 344 | Connection quality assessment |
| `landmark.js` | 515 | Landmark database and search |

---

## Core Layer

### State (`js/core/state.js`)

Single source of truth for application state using a centralized store pattern.

```javascript
// State structure (simplified)
{
    // UI State
    activePanel: 'map',
    sidebarCollapsed: false,
    
    // Map State
    mapCenter: { lat: 37.7749, lon: -122.4194 },
    zoom: 12,
    baseLayer: 'osm',
    overlays: { terrain: true, weather: false },
    
    // Data
    waypoints: [...],
    routes: [...],
    selectedWaypoint: null,
    selectedRoute: null,
    
    // Hardware
    gpsConnected: false,
    meshtasticConnected: false,
    
    // Settings
    units: 'imperial',
    coordinateFormat: 'DMS'
}
```

### Events (`js/core/events.js`)

Pub/sub event system for decoupled module communication.

```javascript
// Usage
Events.emit('waypoint:created', waypoint);
Events.on('waypoint:created', (wp) => updateMap(wp));
```

### Constants (`js/core/constants.js`)

Static configuration: waypoint types, vehicle profiles, default values.

### History (`js/core/history.js`)

Undo/redo stack management for user actions.

---

## Utility Layer

### Coordinates (`js/utils/coordinates.js`)

Multi-format coordinate conversion: DD, DMS, DDM, UTM, MGRS, USNG, Maidenhead.

### Storage (`js/utils/storage.js`)

Persistence abstraction with fallback chain:
1. IndexedDB (preferred)
2. localStorage (fallback)
3. In-memory (last resort)

### Icons (`js/utils/icons.js`)

SVG icon library (82 icons) with consistent styling.

### Helpers (`js/utils/helpers.js`)

Pure utility functions: formatting, validation, calculations.

### Events Manager (`js/utils/events-manager.js`)

DOM event delegation and cleanup management.

---

## Data Flow

```
┌─────────────┐
│ User Action │
└──────┬──────┘
       │
       ▼
┌──────────────┐     ┌─────────────────┐
│ Event Emitted│────►│ Module Handlers │
└──────┬───────┘     └────────┬────────┘
       │                      │
       ▼                      ▼
┌──────────────┐     ┌─────────────────┐
│ State Update │◄────│ Process/Validate│
└──────┬───────┘     └─────────────────┘
       │
       ▼
┌──────────────────┐
│ Notify Subscribers│
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│ UI Re-render │
└──────────────┘
```

---

## Hardware Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER APIs                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Web Bluetooth  │   Web Serial    │    Geolocation / Sensors    │
│  (BLE devices)  │  (USB devices)  │    (Built-in hardware)      │
└────────┬────────┴────────┬────────┴─────────────┬───────────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   HARDWARE MODULES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BLE Devices:              Serial Devices:    Sensors:          │
│  • Meshtastic nodes        • External GPS     • Barometer       │
│  • RadiaCode detector      • TNC (APRS)       • Accelerometer   │
│  • Bluetooth GPS           • SDR hardware     • Compass         │
│                            • Serial GPS                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         │                 │                      │
         ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                   APPLICATION STATE                              │
│  • GPS position          • Mesh nodes         • Sensor data     │
│  • Device status         • APRS stations      • Telemetry       │
└─────────────────────────────────────────────────────────────────┘
```

### Platform Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Web Bluetooth | ✅ | ✅ | ❌ | ❌ |
| Web Serial | ✅ | ✅ | ❌ | ❌ |
| Geolocation | ✅ | ✅ | ✅ | ✅ |
| Barometer | ✅* | ✅* | ❌ | ❌ |

*Android only

---

## External Integrations

### TAK/CoT Bridge

```
┌─────────────────┐         ┌─────────────────┐
│    GridDown     │◄───────►│   CoT Server    │
│                 │  XML    │  (TAK Server)   │
│  Position TX    │◄───────►│                 │
│  Track RX       │         │  ATAK clients   │
│  Marker sync    │         │  WinTAK clients │
└─────────────────┘         └─────────────────┘
```

### Meshtastic Mesh

```
┌─────────────────┐         ┌─────────────────┐
│    GridDown     │◄──BLE──►│ Meshtastic Node │
│                 │         │                 │
│  • Positions    │         │    ┌─────┐      │
│  • Messages     │◄──RF───►│◄──►│Node │      │
│  • Traceroute   │         │    └─────┘      │
│  • Telemetry    │         │    ┌─────┐      │
│                 │◄──RF───►│◄──►│Node │      │
└─────────────────┘         │    └─────┘      │
                            └─────────────────┘
```

---

## Offline Strategy

### Service Worker (`sw.js`)

```javascript
// Cache strategy
STATIC_ASSETS  → Cache-first (app shell, JS, CSS)
TILE_REQUESTS  → Network-first with cache fallback
API_REQUESTS   → Network-only (weather, elevation)
```

### Storage Hierarchy

| Type | Storage | Purpose |
|------|---------|---------|
| App Shell | Cache API | HTML, JS, CSS, icons |
| Map Tiles | IndexedDB | Downloaded offline regions |
| User Data | IndexedDB | Waypoints, routes, settings |
| Settings | localStorage | Quick access preferences |
| Session | Memory | Temporary UI state |

### Offline Capabilities

- ✅ Full map viewing (downloaded tiles)
- ✅ Waypoint/route management
- ✅ GPS tracking
- ✅ Meshtastic communication
- ✅ Celestial navigation
- ✅ Field guides and references
- ⚠️ Weather (cached only)
- ❌ Elevation profiles (requires API)

---

## Module Pattern

All modules follow the IIFE pattern:

```javascript
const ModuleName = (function() {
    'use strict';
    
    // Private state
    const state = {
        initialized: false,
        // ...
    };
    
    // Private functions
    function privateHelper() { /* ... */ }
    
    // Initialization
    function init() {
        if (state.initialized) return;
        // Setup subscriptions
        // Initialize UI
        state.initialized = true;
    }
    
    // Cleanup
    function destroy() {
        // Remove listeners
        // Clear state
        state.initialized = false;
    }
    
    // Public API
    return {
        init,
        destroy,
        // Exposed methods
        publicMethod: () => { /* ... */ }
    };
})();

// Register globally
window.ModuleName = ModuleName;
```

---

## Adding New Features

### New Module

1. Create `js/modules/newmodule.js` following IIFE pattern
2. Add `<script src="js/modules/newmodule.js"></script>` to `index.html`
3. Call `NewModule.init()` in `app.js`
4. Add to service worker cache list in `sw.js`

### New Panel

1. Add panel ID to `js/core/constants.js` NAV_ITEMS
2. Add render case in `js/modules/panels.js`
3. Add sidebar button if needed

### New Hardware Integration

1. Create module with connection/disconnect methods
2. Implement feature detection in `compatibility.js`
3. Add UI controls in relevant panel
4. Handle graceful degradation for unsupported browsers

---

## Performance Considerations

- **Canvas rendering** for smooth 60fps map interaction
- **Debounced handlers** for resize, scroll, input events
- **Lazy rendering** - panels render only when active
- **Tile caching** - aggressive caching of map tiles
- **Module lazy-loading** - heavy modules init on demand
- **CSS transforms** for animations (GPU accelerated)
- **Event delegation** to minimize listeners

---

## Security Model

- **No eval()** - all code is static
- **No external scripts** at runtime (CDN loaded at build)
- **Sanitized innerHTML** - user input escaped
- **Demo mode gating** - injection APIs require flag
- **Local-only storage** - no cloud sync without consent
- **Optional permissions** - camera, location, bluetooth requested on use

---

*Architecture Document v6.57.x - February 2025*
