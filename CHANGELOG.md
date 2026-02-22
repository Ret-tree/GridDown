# Changelog

All notable changes to GridDown will be documented in this file.

## [6.57.75] - 2025-02-21

### Added — RF LOS Phase 5: Viewshed / Coverage Map
- **js/modules/rflos.js** — Full radial coverage analysis from a single transmitter location:
  - **Mode toggle**: "📏 Path Analysis" vs "📡 Coverage Map" buttons switch between point-to-point and viewshed modes. All existing path analysis features remain unchanged.
  - **Transmitter selection**: GPS button or click-to-place on map, with configurable antenna height.
  - **Radius slider**: 1–50 km coverage radius with live label update.
  - **Resolution selector**: Coarse (20°, 18 radials), Medium (10°, 36 radials), Fine (5°, 72 radials). Higher resolution = more accuracy, longer computation.
  - **`analyzeViewshed()`**: Collects all sample points across all radials, fetches elevations in a single batched call (leveraging ElevationModule's built-in 100-point batching and caching), then analyzes LOS clearance and Fresnel zone status per sample.
  - **Map overlay**: Semi-transparent color-coded dots for each sample — green (clear), yellow (marginal), red (blocked). Transmitter shown as purple TX marker.
  - **Coverage results panel**: Overall coverage percentage with progress bar, breakdown by clear/marginal/blocked counts, transmitter elevation, frequency, resolution details, and color legend.
  - **Per-radial data**: Each radial tracks azimuth, LOS reach distance, and per-sample status for downstream analysis.
  - **Progress events**: `viewshedProgress` events emitted during computation with percent and message for UI feedback.

### Added — Module Integration (Meshtastic, Waypoints, Route Builder)
- **js/modules/rflos.js** — Automatic source detection and one-tap import from external modules:
  - **`getImportSources()`**: Scans for available point sources at render time:
    - **Meshtastic nodes** (via `MeshtasticModule.getNodes()`): Filters nodes with valid GPS positions (excludes 0,0). Shows node short name as label.
    - **Waypoints** (via `State.get('waypoints')`): All waypoints with lat/lon. Shows waypoint name as label.
    - **Route Builder** (via `RouteBuilderModule.getState()`): Current route points if 2+ exist. Shows as "Route Pt N".
  - **Import UI**: Blue "Import from:" bar appears when sources are available, with buttons for each source showing point count. Buttons are context-aware — in viewshed mode, import sets the viewshed center; in relay mode with 3+ points, import creates a full relay chain; otherwise imports as A/B endpoints.
  - **`importFromSource(sourceId, mode)`**: Supports three modes:
    - `'endpoints'`: First point → A, last point → B.
    - `'relays'`: First → A, last → B, middle points → relay chain. Auto-enables relay mode.
    - `'viewshed'`: First point → viewshed center. Auto-enables viewshed mode.
  - **Practical examples**: If a user has 3 Meshtastic nodes positioned, clicking "📻 Mesh Nodes (3)" instantly populates A→R1→B relay chain. If they have two waypoints placed, clicking "📌 Waypoints (2)" sets up A and B for immediate LOS analysis. Works across all three sources and all three import modes.

### Changed
- **js/modules/rflos.js** — Clear button now also clears viewshed results and center. `isSelecting()` returns true when selecting viewshed center. `getState()` includes all viewshed fields (viewshedMode, viewshedCenter, viewshedRadius, viewshedResolution, viewshedAntennaHeight, viewshedResult, viewshedComputing).

## [6.57.74] - 2025-02-21

### Added — RF LOS Phase 3: Link Budget Calculator
- **js/modules/rflos.js** — Full link budget calculator integrated into the RF LOS panel:
  - **Extended radio presets** with TX power (dBm), TX antenna gain (dBi), RX antenna gain (dBi), and RX sensitivity (dBm) for all 10 radio types: Meshtastic US (+22 dBm, -136 dBm sens), Meshtastic EU (+14 dBm), 2m/70cm Amateur (+37 dBm, 5W), GMRS (+37 dBm, 3 dBi gain), FRS (+30 dBm, integral antenna), MURS, Marine VHF, CB Radio.
  - **Collapsible Link Budget input section** between frequency selector and Analyze button. Collapsed by default showing TX power summary; expands to reveal editable TX Power, TX Antenna Gain, RX Antenna Gain, and RX Sensitivity fields. All inputs pre-populated from the selected radio preset and auto-update on preset change.
  - **Link budget chain display** in analysis results: `TX Power + TX Gain = EIRP → − Path Loss + RX Gain = RX Signal → vs RX Sensitivity = Margin`. Color-coded green/red border based on link viability.
  - **Margin indicator**: shows `✅ +14.2 dB margin` or `❌ -3.1 dB margin` with clear pass/fail.
  - **`computeLinkBudget(totalPathLoss)`** function computes EIRP, received signal strength, and link margin from current state. Consumes the real diffraction-based path loss from Phase 2 for accurate predictions.
  - Analysis result object now includes `linkBudget` field with: txPower, txGain, rxGain, rxSens, eirp, rxSignal, margin, viable.
  - `getState()` now returns link budget parameters (txPower, txAntennaGain, rxAntennaGain, rxSensitivity).
  - `computeLinkBudget` exposed in `utils` for external use and testing.

## [6.57.73] - 2025-02-21

### Added — RF LOS Phase 1: GPS as Point A
- **js/modules/rflos.js** — Added "📡 GPS" button next to Point A's "Select" button. One-tap pulls current position from `GPSModule.getPosition()` (supports internal GPS, serial GPS, manual position, and INS). Automatically sets antenna height to 1.5m (handheld height) when using GPS. Alerts user if no GPS position is available. Eliminates the most common friction: two-tap map click dance when checking LOS from current location.

### Added — RF LOS Phase 2: Knife-Edge Diffraction (Deygout Method)
- **js/modules/rflos.js** — Replaced rough obstruction loss estimate (`obstructions × 6 dB, capped at 30`) with physically correct knife-edge diffraction model:
  - **ITU-R P.526-15 formula**: `J(v) = 6.9 + 20·log10(√((v−0.1)² + 1) + v − 0.1)` — continuous, monotonic, no piecewise discontinuities. Returns 0 dB for v ≤ −0.78 (well below LOS), ~6 dB at grazing (v=0), increasing asymptotically in deep shadow.
  - **Fresnel-Kirchhoff v parameter**: `v = h × √(2(d1+d2) / (λ×d1×d2))` — computed per-obstacle with proper height above LOS line, distance from each endpoint, and wavelength.
  - **Deygout method**: Recursive multi-obstacle diffraction. Finds the dominant obstacle (highest v), computes its loss, then recursively evaluates sub-paths on each side. Recursion capped at depth 3.
  - **Analysis results** now include `diffraction` object: method, total loss, obstacle count, per-obstacle details (index, v parameter, height above LOS, individual loss, distance, elevation, isDominant flag).
  - **Path loss** split into `freeSpace`, `diffraction`, and `estimated` (sum of both) for clear link budget visibility.
  - **Profile renderer** updated: dominant obstacle shown as amber diamond with v-parameter label; secondary obstacles as small amber triangles. Diffraction loss shown in profile header.
  - **Results panel** updated: shows diffraction loss row when non-zero, total path loss row, and expandable knife-edge detail box listing each obstacle with distance, elevation, v parameter, and individual loss. Dominant obstacle marked with ▸.
  - **Frequency dependence**: higher frequencies produce higher v values for the same geometry, correctly yielding more diffraction loss (verified: 27 MHz < 150 MHz < 915 MHz).
  - New utility functions exposed for testing: `fresnelKirchhoffV()`, `knifeEdgeLoss()`, `findDominantObstacle()`, `deygoutDiffraction()`.

### Fixed
- **js/modules/rflos.js** — Removed dead `rflos.js.pre-phase12` backup file from repo.

## [6.57.72] - 2025-02-21

### Added
- **scripts/griddown-server.py** — Custom HTTP server that serves `sw.js` and `manifest.json` with `Cache-Control: no-cache, no-store, must-revalidate` headers. This fixes the root cause of users needing to manually clear browser cache after updates: the default Python HTTP server sends no Cache-Control headers, allowing the browser to heuristically cache `sw.js` for hours. The browser would then compare the stale cached `sw.js` against itself, never detect the new `CACHE_NAME`, and never trigger the service worker install/activate lifecycle. All existing update infrastructure (skipWaiting, clients.claim, cache purge, update toast) was unreachable without this fix.

### Changed
- **scripts/griddown-aliases.sh** — All server aliases (`gd`, `gd-bg`, `gd-start`, `gd-stop`, `gd-status`, `gd-restart`, `gd-shutdown`) now use `griddown-server.py` instead of `python3 -m http.server 8080`. Process matching updated from `http.server 8080` to `griddown-server` for pkill/pgrep.
- **scripts/termux-setup.sh** — Boot script template now launches `griddown-server.py`. Added `chmod +x` for `griddown-server.py` in permission repair step.
- **sw.js** — Message handler now responds on `MessageChannel` port when provided (`e.ports[0]`), falling back to `e.source`. This fixes the version query from `UpdateModule.handleWaitingWorker()` which sends `GET_VERSION` via a `MessageChannel` — previously the response went to the window's general message handler instead of the port callback, causing the version display in the update toast to always fall through to the generic "new version" label.
- **js/modules/update.js** — Single source of truth for all service worker update detection, UI notification, and activation. Consolidated from three duplicate implementations previously spread across `update.js`, `app.js`, and `index.html`.
- **js/app.js** — Removed dead `showUpdateNotification` export (function was never defined, would throw if called).

### Removed
- **js/modules/update.js.bak** — Stale backup of previous update module.
- **js/modules/atlasrf.js.bak** — Stale backup.

## [6.57.71] - 2025-02-21

### Added
- **GridDown Termux Setup Guide** (PDF, 13 pages) — Complete documentation for self-hosting GridDown on Samsung Galaxy Tab Active5 Pro using Termux. Covers F-Droid installation, repository cloning, local Python HTTP server, PWA installation, one-command GitHub updates via shell alias, autostart on boot with Termux:Boot, AtlasRF USB-C OTG integration, Android wake lock and battery optimization settings, three network architecture patterns (single-device, tablet+Pi, GitHub Pages), troubleshooting table, and quick reference card.
- **scripts/termux-setup.sh** — One-command Termux environment setup. Installs all shell aliases to ~/.bashrc via source link, optionally creates Termux:Boot autostart script, verifies environment (Python, Git, rtl-sdr). Idempotent and safe to re-run after updates. Colored terminal output with step-by-step progress.
- **scripts/griddown-aliases.sh** — 15 shell aliases for Termux: gd, gd-bg, gd-stop, gd-status, gd-restart, gd-start (wake lock + server), gd-shutdown (stop + unlock), griddown-update, gd-version, gd-log, gd-force-update, gd-size, gd-clean, wl/wlu (wake lock shortcuts). Sourced from ~/.bashrc so aliases auto-update when GridDown is updated from GitHub.

## [6.57.70] - 2025-02-21

### Fixed
- **ROOT CAUSE: Tile grid offset from GPS marker and all features when map is rotated** — When bearing ≠ 0, `render()` expands the viewport 1.5× to cover rotated corners and passes `rotatedWidth/rotatedHeight` to tile rendering functions. These functions centered the tile grid at `expandedWidth/2` (960px on a 1280px canvas), while `latLonToPixel` (used by GPS marker, waypoints, routes, and all other features) centers at `canvasWidth/2` (640px). This created a **377-pixel offset** between tiles and everything else. The offset rotated with the map, causing the GPS marker to appear hundreds of pixels from its correct position on the tiles at any non-zero bearing. Fixed both `renderTilesForLayer` and `renderCustomTileLayer` to center the tile grid at the actual canvas center, using the expanded dimensions only for tile coverage count. Also fixed `showTileLoadingIndicator` positioning.

## [6.57.69] - 2025-02-21

### Fixed
- **Map position shifts to different location during two-finger rotation** — Root cause: the pinch-center anchor math (designed for zoom) was also running during rotation. It shifts lat/lon so the geo point under the user's fingers stays stationary while zoom changes — correct for pinch-zoom, but during rotation this means the map rotates around the FINGER midpoint instead of the SCREEN center. With fingers 200px from screen center and 90° rotation, the map center drifted 300+ meters (300+ pixels at z17), showing a completely different location. Fixed by splitting the gesture math into two paths: rotation-dominant (zoomLocked) rotates around the canvas center with zero lat/lon change, matching Google/Apple Maps behavior. Zoom-dominant continues using pinch-center anchoring.
- **CSS visual feedback rotated around wrong center** — The GPU-composited CSS transform between RAF frames was also rotating around the pinch center, producing 200+ pixel GPS marker wobble between repaint frames on 120Hz displays. Fixed with three CSS paths: rotation-dominant uses `rotate()` at canvas center, pure-zoom uses `scale()` at pinch center, combined uses a 2D affine matrix decomposing scale@pinch + rotate@canvas + translate.

## [6.57.68] - 2025-02-21

### Added
- **Sidebar navigation labels on tablet** — Icon labels now visible on both tablet orientations: landscape sidebar (64px wide, 7px labels with ellipsis truncation) and portrait bottom bar (scrollable with 7px labels). Follows iOS/Android bottom navigation pattern where icons always have labels. Active item label at full opacity, inactive at 70%.
- **Auto-scroll active nav item into view** — In portrait bottom bar (horizontal scroll), newly activated panel auto-scrolls its icon to center for orientation in the 22-item navigation.

## [6.57.67] - 2025-02-21

### Fixed
- **GPS marker drift and map blur during two-finger rotation** — During pure rotation gestures (no intentional pinching), finger distance inevitably fluctuates 10-30% on a 10" tablet. This caused: (1) frame-by-frame tile blur as `Math.floor(zoom)` dropped to one level below, rendering coarser tiles scaled up 1.5-1.8×, (2) wrong zoom snap at gesture end when distance changed >30% crossing the 0.5 rounding boundary, and (3) anchor math computing lat/lon for the wrong zoom level, shifting the GPS marker off-position. Fixed with a dual-axis gesture lock system: rotation lock prevents accidental bearing changes during zoom (existing), and new zoom lock pins zoom to the initial integer value when rotation is the dominant gesture. Zoom only releases if distance changes >40%, indicating deliberate combined zoom+rotate.

## [6.57.66] - 2025-02-21

### Fixed
- **GPS marker drift during pinch-to-zoom at high zoom levels** — Rotation snap-back was applied AFTER zoom snap, causing the zoom anchor math to compute lat/lon for the wrong bearing. At zoom 17+, the error was large enough to make the GPS marker appear off-position. Reordered: bearing snap-back now runs BEFORE zoom snap in both touchEnd paths (all-fingers-up and 2→1 finger transition), ensuring anchor math uses the final bearing.
- **Accidental map rotation during pinch-to-zoom** — Rotation lock threshold was 15° which was too easily triggered by natural finger rotation on high-sensitivity touchscreens (Samsung glove mode, 120Hz digitizers). Increased to 25°. Rotation snap-back threshold increased from 20° to 45° so only truly deliberate rotation (> 45°) persists after a gesture.
- **Overzoom tile rendering showed wrong map content** — When zooming past a tile server's maxZoom (e.g., zoom 18 on OpenTopo maxZoom 17), the parent tile lookup used child-grid coordinates, requesting non-existent tiles. Fixed to compute correct parent tile coordinates and sub-region extraction.
- **Tile loading flood during pinch gestures** — Every render frame during a pinch fired tile requests for intermediate zoom levels, flooding the browser's 6-connection-per-domain limit and delaying final-zoom tile loads. Tile loading and prefetch now suppressed during active gestures; tiles load only at the final zoom level after gesture ends.

## [6.57.65] - 2025-02-21

### Fixed
- **Touch tap interactions broken on touchscreen devices** — `e.preventDefault()` on `touchstart` suppressed browser-synthesized `click` events, preventing all tap actions (clicking waypoints, measure points, route builder, stream gauge markers, overlay markers). Added delayed single-tap click synthesis in `handleTouchEnd` with proper double-tap conflict resolution.
- **Long press context menu failing on Samsung Galaxy Tab Active5 Pro** — Movement threshold was 5px, too tight for high-sensitivity touchscreen digitizers and Samsung glove mode. Finger micro-jitter would cancel the long press timer before the 600ms hold duration. Increased threshold to 15px.

## [6.57.64] - 2025-02-21

### Added — SARSAT: GPIO Status LED Driver

**Feature 10: Pi CPU Temperature Monitoring + GPIO Status LED**

Adds a two-LED (red + green) GPIO indicator for field-visible receiver state. Five distinct visual states from two LEDs by combining colors and blink patterns.

**Hardware:** 2× 5mm LEDs (red + green), 2× 220Ω resistors, jumper wires. Total cost under $2.
- GPIO 17 (pin 11) → 220Ω → Red LED → GND (pin 14)
- GPIO 27 (pin 13) → 220Ω → Green LED → GND (pin 14)

**LED States:**

| State | Red | Green | Meaning |
|---|---|---|---|
| OFF | — | — | Receiver not running |
| STARTING | — | blink | Initializing SDR |
| RUNNING | — | solid | Normal operation |
| BEACON | — | flash | Beacon decoded (1.5s flash, returns to RUNNING) |
| EMERGENCY | blink | — | Non-test emergency beacon detected (fast 200ms blink) |
| WARNING | solid | solid | CPU temp > 75°C (amber = both LEDs, auto-recovers at 70°C) |
| FAULT | solid | — | SDR error or receive failure (auto-recovers) |
| SEARCHING | — | slow blink | Scanning for signals (1s on/off) |

**Implementation:**
- `StatusLED` class (190 lines): GPIO initialization with RPi.GPIO, daemon background thread at 50Hz tick rate for blink patterns, graceful no-op fallback on non-Pi hardware
- Transient states: BEACON flash auto-returns to previous steady state after 1.5s
- Temperature hysteresis: WARNING triggers at 75°C, recovers at 70°C (no flutter)
- Heartbeat includes `ledState: {state, gpioAvailable, pins}` for remote monitoring
- GridDown panel shows LED state with colored emoji indicator (🟢 Running, 🔴 EMERGENCY, 🟡 Warning)

**CLI:**
- `--led` — Enable GPIO status LED (off by default)
- `--led-pins R,G` — Custom GPIO pins in BCM numbering (default: 17,27)

**Example:** `python3 sarsat_receiver_robust.py --websocket 8406 --led`

### Technical
- Modified: `sarsat_receiver_robust.py` (v2.1→v2.2, +263 lines) — Added `threading` import. `ReceiverConfig`: +3 fields (led_enabled, led_pin_red, led_pin_green). New `StatusLED` class with 8 states, daemon blink thread, GPIO init/cleanup, to_status_dict(). `SarsatReceiver`: LED init, STARTING→RUNNING on start(), OFF+stop on stop(), FAULT/recovery in run() error handler, BEACON/EMERGENCY flash in _process_samples(), WARNING/recovery based on CPU temp in get_status(). Heartbeat: +ledState field. CLI: +2 args (--led, --led-pins)
- Modified: `js/modules/panels.js` — New `_ledStateDisplay()` helper (8 states → emoji + colored label). LED state row in receiver health grid
- Modified: `sw.js` — Cache version bump to v6.57.64

## [6.57.63] - 2025-02-21

### Enhanced — SARSAT: SNR/Signal Display, Multi-Frequency Status, Beacon Replay

**Feature 6: SNR/Noise Floor Display**
- Receiver health grid now shows "Last SNR" and "Last RSSI" from the most recent signal detection, color-coded by quality (green ≥15 dB, lime ≥10, amber ≥5, red <5)
- Beacon list cards now display SNR, RSSI, frequency, and receive count in a compact signal row beneath each beacon's header
- Emergency beacon cards also show signal metrics for situational awareness during active alerts
- Python receiver now tracks `_last_detection_snr` and `_last_detection_rssi`, broadcast in every heartbeat as `lastDetectionSnr` and `lastDetectionRssi`
- sarsat.js now stores `beacon.snr` from incoming messages alongside the existing rssi and frequency fields

**Feature 7: Multi-Frequency Status** *(implemented in v6.57.61)*
- Collapsible "Frequency Channels" section shows all 4 monitored frequencies (406.025, .028, .037, .040 MHz)
- Each frequency displays detection and decode counts; current active frequency marked with ◀ and bold text

**Feature 9: Beacon Replay on Connect** *(implemented in v6.57.62)*
- GridDown auto-sends `get_recent_beacons` 500ms after WebSocket connect to populate beacon list from receiver's persistent database
- Replayed beacons processed silently — no toast notifications, alert sounds, or waypoint creation for historical data

### Technical
- Modified: `sarsat_receiver_robust.py` — Added `_last_detection_snr`/`_last_detection_rssi` state fields, populated in `_process_samples`, included in `get_status()` heartbeat
- Modified: `js/modules/sarsat.js` — Store `beacon.snr` from incoming message data
- Modified: `js/modules/panels.js` — Last SNR/RSSI rows in health grid (color-coded), signal info row in beacon list cards (SNR/RSSI/freq/count), signal info in emergency beacon cards
- Modified: `sw.js` — Cache version bump to v6.57.63

## [6.57.62] - 2025-02-21

### Enhanced — SARSAT: mDNS Discovery, WiFi AP Mode, and Persistent Beacon Logging

**Feature 3: mDNS/Avahi Service Advertisement**
- New `sarsat-receiver.service` Avahi service definition file advertises the receiver as `_sarsat._tcp` on port 8406 with TXT records for version, product name, and protocol type
- Install via `sudo python3 sarsat_receiver_robust.py --install-mdns` or manually with `sudo cp sarsat-receiver.service /etc/avahi/services/`
- New `install_mdns_service()` Python function handles Avahi detection, root check, service file generation, and daemon restart
- Enables GridDown network discovery to find SARSAT receivers automatically without knowing IP addresses
- Verify with: `avahi-browse -r _sarsat._tcp`

**Feature 4: WiFi Access Point Setup Script**
- New `setup_ap.sh` — complete WiFi AP configuration for field deployment without existing infrastructure
- Default AP: SSID `SARSAT-RX-01`, password `griddown406`, IP `192.168.4.1`
- Configurable via flags: `--ssid`, `--password`, `--no-password` (open network), `--channel`, `--ip`, `--country`
- Installs and configures hostapd (AP), dnsmasq (DHCP + DNS), and iptables (NAT for internet sharing via ethernet)
- DNS aliases: `sarsat-rx.local`, `sarsat.local`, `griddown-sarsat.local` all resolve to AP IP
- DHCP range: 192.168.4.10-50 with 12h leases
- Backs up all original configs to `~/.griddown-ap-backup/` before modifying
- `--remove` flag cleanly restores original WiFi configuration
- NAT forwarding shares ethernet internet with WiFi clients when cable is connected
- Post-setup verification with status display showing SSID, password, IP, WebSocket URL, and internet status

**Feature 5: Persistent Beacon Logging (SQLite)**
- New `BeaconLogger` class: SQLite database for persistent beacon storage across receiver sessions
- Default database location: `~/griddown/sarsat_beacons.db` (configurable via `--db-path`, disable with `--no-db`)
- Schema: `beacons` table with full beacon fields plus session_id, created_at, and indexes on timestamp, hex_id, and session
- WAL journal mode and NORMAL synchronous for performance in field conditions
- Each receiver run gets a unique session_id for grouping
- Methods: `log_beacon()`, `get_recent(hours, limit)`, `get_session_beacons()`, `get_count()`
- `get_count()` returns `{total, session, last24h}` — included in every heartbeat status broadcast
- New `SarsatReceiver.get_beacon_log()` method: returns database beacons as GridDown-compatible dicts with in-memory fallback
- New WebSocket command `get_beacon_log` with configurable `hours` (0.1-8760) and `limit` (1-2000) parameters
- Updated `get_recent_beacons` command: now pulls from database (cross-session) instead of in-memory list
- On WebSocket client connect, GridDown automatically sends `get_recent_beacons` to populate beacon list from receiver's database
- Replayed beacons tagged with `replay: true` are processed silently — no toast notifications, no alert sounds, no waypoint creation for historical beacons
- Beacon log stats displayed in connected panel: "3 this session · 7 last 24h · 42 total"

### Technical
- Modified: `sarsat_receiver_robust.py` (v2.0→v2.1) — +3 imports (sqlite3, os, uuid), +1 config field (db_path), +BeaconLogger class (195 lines, 10 methods), SarsatReceiver: beacon_logger init with None support, log_beacon in _process_samples, beaconLog in status heartbeat, get_beacon_log() method, logger.close() in stop(). WebSocket: get_beacon_log command with hours/limit params, get_recent_beacons updated to use database. New install_mdns_service() function. CLI: +3 args (--db-path, --no-db, --install-mdns)
- Modified: `js/modules/sarsat.js` — Auto-request beacon replay on WebSocket connect (500ms delay). processBeaconMessage: isReplay flag, skip stats/toasts/alerts/waypoints for replayed beacons. New requestBeaconLog(hours, limit) function and public API export
- Modified: `js/modules/panels.js` — Beacon log stats row in connected state (session/24h/total counts)
- New: `sarsat-receiver.service` — Avahi mDNS service definition for _sarsat._tcp
- New: `setup_ap.sh` — WiFi AP configuration script (314 lines)
- Modified: `sw.js` — Cache version bump to v6.57.62

## [6.57.61] - 2025-02-21

### Enhanced — SARSAT: Receiver Status Heartbeat & Remote Control Protocol
Implements a bidirectional communication protocol between the GridDown app and the Raspberry Pi SARSAT receiver, enabling real-time receiver health monitoring and remote control from the tablet.

**Status Heartbeat (Receiver → GridDown):**
- Receiver broadcasts a comprehensive status message every 15 seconds (configurable via `--heartbeat` CLI flag) to all connected GridDown clients
- Status includes: SDR connected state, uptime, noise floor (dBm, rolling EMA), gain, sample rate, PPM correction, signals detected, syncs found, messages decoded, BCH corrections, last detection time, per-frequency channel stats (detections/decodes per channel), active beacon count, Pi CPU temperature, and Unix timestamp
- GridDown displays receiver health in the connected panel: SDR status, uptime, noise floor, gain, CPU temp (with heat warnings at 65°C/75°C), last signal time, and per-frequency channel breakdown
- Signal quality progress bar derived from noise floor level (Excellent/Good/Fair/Poor)
- Heartbeat timeout detection: if no status received within 45 seconds (3× heartbeat interval), receiver marked offline with visual indicator. Fires `sarsat:receiver_offline` event
- Welcome status sent immediately on client connect with `welcome: true` flag
- Panel auto-rerenders on each heartbeat to keep stats live

**Bidirectional Commands (GridDown → Receiver):**
- New command protocol: GridDown sends `{"cmd": "...", "requestId": "..."}`, receiver responds with `{"msgType": "response", "cmd": "...", "requestId": "...", ...}`
- `get_status` — Request immediate status (bypasses heartbeat interval)
- `get_config` — Returns full receiver configuration
- `set_gain` — Remote gain adjustment (auto or specific dB). Gain dropdown in panel UI with common RTL-SDR values (Auto, 10/20/30/40/49.6 dB). Applies to live SDR immediately
- `set_frequency` — Remote primary frequency change (validates within 405-407 MHz band). Adds new frequency to monitoring cycle
- `self_test` — Triggers full DSP self-test on the receiver. Test button in panel UI with async result reporting and 30s safety timeout
- `get_recent_beacons` — Replays all beacons from current session to the requesting client (for late-joining team members)
- Command timeout handling (10s default) with Promise-based API and requestId correlation
- Pending commands automatically rejected on disconnect

**Message Routing:**
- `handleIncomingData` now routes JSON messages by `msgType` field: `status` → heartbeat handler, `beacon` → beacon processor, `response` → command response handler
- Backward compatible: messages without `msgType` but with `hexId` still route to beacon processor (supports legacy/serial format)

**Python Receiver (`sarsat_receiver_robust.py`):**
- `SarsatReceiver` class: Added noise floor tracking (rolling EMA), per-frequency detection/decode stats, recent beacon buffer (replay on connect), CPU temperature reading from sysfs, comprehensive `get_status()` method
- Remote control methods: `set_gain()`, `set_frequency()`, `get_config_dict()`, `get_recent_beacons()` with input validation and error responses
- `websocket_server_main`: Complete rewrite — bidirectional message handling replaces silent `async for _ in websocket: pass`. Heartbeat loop runs as concurrent asyncio task. Welcome status on connect. Command router with per-command handlers. Dead client cleanup on broadcast
- New `--heartbeat SECONDS` CLI argument (default: 15)

### Technical
- Modified: `js/modules/sarsat.js` — New state fields: receiverStatus, lastStatusTime, statusTimeoutTimer, receiverOnline, pendingCommands, commandIdCounter. New functions: _routeMessage, _handleStatus, _handleCommandResponse, _resetStatusTimeout, _clearStatusTimeout, sendCommand, requestStatus, requestConfig, setRemoteGain, setRemoteFrequency, triggerSelfTest, requestRecentBeacons. Updated handleIncomingData with msgType routing. Updated onDisconnected/destroy to clean up status timers and pending commands. 10 new public API methods
- Modified: `js/modules/panels.js` — Connected state completely rebuilt with: receiver health grid (SDR/uptime/noise floor/gain/CPU temp/last signal), signal quality bar with color coding, per-frequency channel stats in collapsible details, remote gain dropdown, self-test button with async result listener. New helpers: _formatUptime, _signalQualityLabel, _signalQualityPercent, _signalQualityColor. New event listeners: sarsat:status_update, sarsat:receiver_offline
- Modified: `sarsat_receiver_robust.py` — SarsatReceiver: +8 new instance fields, +7 new methods. websocket_server_main: complete rewrite (+120 lines). ReceiverConfig: +1 new field (heartbeat_interval). New CLI argument --heartbeat
- Modified: `sw.js` — Cache version bump to v6.57.61
- Zero impact on other panels or modules

## [6.57.60] - 2025-02-21

### Enhanced — SARSAT Panel: WiFi-First Receiver Connection
Major overhaul of the SARSAT beacon receiver panel connection UX, shifting from wired serial as the primary transport to WiFi/WebSocket for Raspberry Pi-based receivers.

**New Features:**
- **Network Discovery** — "Scan Network" button probes common hostnames and IPs (sarsat-rx.local, raspberrypi.local, 192.168.4.1, etc.) for SARSAT WebSocket servers. Shows reachable receivers with latency, click to populate address field.
- **Saved Receivers** — Successfully connected receivers are automatically saved with name, URL, and last-connected timestamp. One-tap reconnect from the saved list. Remove individual entries with ✕ button.
- **Auto-Reconnect** — When a WebSocket connection drops unexpectedly (Pi reboot, WiFi blip), GridDown automatically attempts reconnection up to 12 times over 60 seconds. User-initiated disconnects do not trigger auto-reconnect. New "Auto-reconnect on connection loss" setting toggle.
- **Smart URL Input** — Auto-prefixes `ws://` if omitted, auto-appends `:8406` if no port specified. Monospace font for address field. Placeholder shows expected format.
- **WiFi and USB SVG Icons** — Added proper `wifi` and `usb` icons to the icon library (previously fell back to alert icon).

**UI Improvements:**
- Connection card header renamed from "PLB/ELT Receiver" to "406 MHz Receiver"
- Receiver address field promoted to prominent position with inline Connect button
- USB Serial demoted to secondary option below saved receivers (hidden on devices without Web Serial API)
- Connected state shows receiver name/hostname with full URL, stats in compact 2-column grid
- Reconnecting state shows attempt counter in status badge
- Discovery results display in green-tinted cards with latency badges
- Fixed disconnect button icon from missing 'x' to correct 'close' icon

**Architecture:**
- SARSAT module (`sarsat.js`): Added saved receivers management (save/remove/rename with IndexedDB persistence), network discovery via parallel WebSocket probes, auto-reconnect with exponential backoff, connection URL tracking
- Panel (`panels.js`): New saved receiver list with click-to-connect, discovery results UI, auto-reconnect checkbox, smart URL normalization
- Icons (`icons.js`): Added `wifi` and `usb` SVG icons

### Technical
- Modified: `js/modules/sarsat.js` — New sections: Saved Receivers (save/remove/rename/persist), Network Discovery (parallel WebSocket probing), Auto-Reconnect (attempt loop with configurable max). Updated connectWebSocket() to track URL and auto-save. Updated onDisconnected() to trigger reconnect for non-user disconnects. New public API: discoverReceivers, getSavedReceivers, saveReceiver, removeReceiver, renameReceiver, getConnectionUrl, isReconnecting, getReconnectAttempts, setAutoReconnect, getAutoReconnect, isDiscovering, getDiscoveryResults
- Modified: `js/modules/panels.js` — Complete rewrite of renderSarsat() and attachSarsatHandlers(). Added _formatTimeSince() and _extractFriendlyUrl() helpers. New handler bindings for scan, saved receiver click, remove receiver, auto-reconnect toggle, discovery item click
- Modified: `js/utils/icons.js` — Added wifi and usb SVG icon definitions
- Modified: `sw.js` — Cache version bump to v6.57.60
- Zero impact on other panels or modules

## [6.57.54] - 2025-02-16

### Enhanced — Tablet Landscape Layout (Phase 3: Tablet Support)
- **Tablet landscape overlay layout** — New CSS tier at `@media (min-width: 1025px) and (max-width: 1366px) and (pointer: coarse)` targets 10-12" tablets in landscape orientation (Tab Active5 Pro at ~1280px, iPad Pro, etc.). Sidebar stays vertical but slims from 72px to 56px. Panels become slide-over overlays instead of pushing the map, maximizing tactical map area to ~96% of screen width. Panel slides in from behind the sidebar with 0.3s cubic-bezier animation and drop shadow.
- **CRITICAL FIX: Helpers.isMobile() breakpoint mismatch** — `Helpers.isMobile()` in helpers.js still checked `(max-width: 768px)` despite Phase 1 updating CSS to 1024px. This caused panels to be completely invisible on the Tab Active5 Pro at 800px portrait because CSS applied overlay positioning (`translateX(-100%)`) but JS never added the `panel--open` class. Fixed to `(max-width: 1366px) and (pointer: coarse), (max-width: 768px)` matching all CSS overlay panel states.
- **Slim sidebar for landscape** — Sidebar narrows to 56px with hidden nav labels, dividers, and status labels. Logo shrinks to 36px. Nav items remain 44×44 for reliable touch targeting. Settings button and status dots preserved.
- **Overlay panel behavior** — Panels position fixed to the right of the sidebar, overlaying the map with `box-shadow: 4px 0 24px` when open. Width set to 340px. Map area is never compressed — panels slide on top.
- **Map overlay element repositioning** — Offline toggle and wind indicator shift right by `var(--sidebar-width)` to clear the sidebar. Nav HUD positioned bottom-left with responsive width `clamp(280px, 40vw, 400px)`. Measure results panel stays bottom-right.
- **FAB and mobile status hidden in landscape** — Sidebar provides navigation in landscape, making the FAB redundant. Mobile status indicators hidden since sidebar status remains visible.

### Technical
- Modified: `css/app.css` — added ~170-line `@media (min-width: 1025px) and (max-width: 1366px) and (pointer: coarse)` section. Customizes sidebar, panel, and map overlay positioning for tablet landscape.
- Modified: `js/utils/helpers.js` — `isMobile()` updated from `(max-width: 768px)` to `(max-width: 1366px) and (pointer: coarse), (max-width: 768px)`. Fixes panel visibility on tablets and correctly gates overlay behavior for Phase 3.
- Modified: `sw.js` — cache version bump to v6.57.54
- Desktop impact: ZERO — `pointer: coarse` never matches on desktop. The `(max-width: 768px)` fallback in isMobile() is identical to previous behavior.

## [6.57.53] - 2025-02-16

### Enhanced — Touch Targets for Glove Use (Phase 2: Tablet Support)
- **All interactive elements meet 48px minimum touch targets on touch devices** — Comprehensive `@media (pointer: coarse)` CSS section ensures reliable tap accuracy with gloves on rugged tablets like the Samsung Galaxy Tab Active5 Pro. Desktop users with mouse/trackpad (`pointer: fine`) see zero visual changes.
- **Base button class** (`.btn`) — min-height raised to 44px on touch devices
- **Map control buttons** — increased from 44×44 to 48×48 with larger SVG icons (22px)
- **Toggle switches** — enlarged from 40×22 to 52×28 with proportionally larger slider knob for reliable glove taps
- **Modal close buttons** — enlarged from 24×24 to 44×44 with active state feedback
- **Settings rows** — min-height 48px, selects get 44px min-height with larger text
- **Celestial navigation tabs** — min-height 48px with increased padding, overriding inline styles
- **Waypoint/route action buttons** — edit, delete, elevation profile buttons enlarged to 44×44 minimum despite inline `padding:6px` styles
- **SSTV, APRS, CoT/TAK, GPS action buttons** — all enlarged to 44px minimum height
- **Form inputs and textareas** — min-height 44px on touch devices
- **Layer buttons, cards, vehicle buttons, type buttons, coord format buttons** — all meet 48px minimum
- **300ms tap delay eliminated** — `touch-action: manipulation` on body element
- **Tap highlight removed** — `-webkit-tap-highlight-color: transparent` for cleaner visual feedback

### Technical
- Modified: `css/app.css` — added ~240-line `@media (pointer: coarse)` section at end of file. Uses `!important` only for elements with inline styles in panels.js (celestial tabs, waypoint buttons, route buttons, etc.) that cannot be overridden otherwise. All rules scoped to touch devices.
- Modified: `sw.js` — cache version bump to v6.57.53
- Desktop impact: ZERO — `pointer: coarse` never matches on desktop Chrome with mouse/trackpad

## [6.57.52] - 2025-02-16

### Enhanced — Tablet Support (Phase 1: Breakpoint & Detection)
- **Responsive breakpoints updated for tablet devices** — All 11 `@media (max-width: 768px)` rules updated to support tablets like the Samsung Galaxy Tab Active5 Pro (10.1" at 1920×1200). Layout rules use `@media (max-width: 1024px) and (pointer: coarse), (max-width: 768px)` which activates on touch devices up to 1024px wide while preserving the 768px fallback for narrow desktop windows. Mobile-only UI (FAB, status bar, install banner) uses `@media (max-width: 1024px) and (pointer: coarse)` without fallback — these never appear on desktop regardless of window size.
- **FAB breakpoint raised to 1024px** — `MobileModule.CONFIG.fabBreakpoint` updated from 768 to 1024 so the Floating Action Button appears on tablets. The existing `checkIsMobile()` dual-check (touch support AND width) prevents desktop activation.
- **Orientation change listener** — Added `orientationchange` event listener alongside existing `resize` handler with 100ms debounce for viewport dimension updates. Ensures mobile UI state updates correctly when tablets rotate between portrait and landscape in field use.
- **Persistent storage request** — Added `navigator.storage.persist()` call during app initialization to prevent Android from evicting cached map tiles and offline data under storage pressure. Non-critical — gracefully degrades if denied.

### Technical
- Modified: `css/app.css` — 8 layout media queries updated to compound `(max-width: 1024px) and (pointer: coarse), (max-width: 768px)`, 3 mobile-only queries to `(max-width: 1024px) and (pointer: coarse)`
- Modified: `js/modules/mobile.js` — `fabBreakpoint: 1024`, added `orientationchange` listener with debounce
- Modified: `js/app.js` — added `navigator.storage.persist()` after `Storage.init()`
- Modified: `sw.js` — cache version bump to v6.57.52
- Desktop impact: ZERO — `pointer: coarse` never matches on desktop Chrome with mouse/trackpad

## [6.57.51] - 2025-02-15

### Fixed
- **AtlasRF panel track counts not updating in real-time** — Track counts ("Aircraft: 0, Ships: 0, Drones: 0") in the AtlasRF panel were stale while tracks rendered fine on the map. Root cause: `atlasrf:track:new`, `atlasrf:track:update`, and `atlasrf:track:batch` events only triggered `MapModule.render()` (or had no handler at all), but never called `PanelsModule.render()`. Counts only refreshed on connection events or when navigating away and back.
  - Added throttled `PanelsModule.render()` on all four track events (new/update/batch/lost) with 2-second trailing-edge throttle. Fast enough to feel live, light enough to avoid DOM thrashing from 500ms batch arrivals on constrained hardware (Pi, tablets).
  - Panel render gated by `State.get('activePanel') === 'atlasrf'` — no wasted renders when viewing other panels.

### Technical
- Modified: `js/app.js` — added `rfPanelRenderTimer` throttle variable, `throttledRFPanelRender` function, 4 new `Events.on()` listeners for `atlasrf:track:new`, `atlasrf:track:update`, `atlasrf:track:batch`, `atlasrf:track:lost`

## [6.57.50] - 2025-02-15

### Added
- **Phase 5: Waypoint Weather Monitoring & Threshold Configuration UI** — Completes the audible weather alerts system with waypoint coverage and user-configurable alert thresholds.

  **Waypoint Monitoring**
  - `checkWeatherAtWaypoints()` — iterates all saved waypoints, fetches weather from Open-Meteo for each, routes through `processWeatherAlerts()` with waypoint name for location context in alert messages. Includes NWS fallback per waypoint when AtlasRF is disconnected.
  - Separate polling timer from current-position monitoring (default: 60 min vs 30 min) to reduce API load — waypoints change less frequently than user position.
  - 1-second throttle between waypoint requests to avoid rate limiting.
  - Wired into `startWeatherMonitoring()` with 5-second initial delay to avoid overlapping with position check, then periodic polling via `waypointMonitoringTimer`.
  - `checkWeatherNow()` fires waypoint check (non-blocking) alongside position check.
  - `setWaypointMonitoring(enabled)` — toggle waypoint monitoring on/off, restarts monitoring if active.
  - `weather:monitoring:waypoints` event emitted with results array for other modules.

  **Threshold Configuration**
  - `getAlertThresholds()` / `setAlertThresholds(thresholds)` — get/set the thresholds that `processWeatherAlerts()` uses for Phase 1 condition checks. Merges partial updates, persists to IndexedDB.
  - Configurable thresholds: Extreme Heat (default ≥100°F), Heat (≥90°F), Cold (≤32°F), Extreme Cold (≤10°F), Extreme Wind gusts (≥50 mph), High Wind (≥30 mph), Poor Visibility (≤1 mi).
  - Thresholds persist across page refreshes via `_saveWeatherMonitoringState()` / `_restoreWeatherMonitoringState()`.

  **Weather Panel UI**
  - Waypoint status indicator in monitoring card: shows waypoint count, monitoring status (on/off), interval, and last check time.
  - Waypoint monitoring checkbox toggle with toast feedback.
  - Alert Thresholds configuration section with 7 numeric inputs organized in a 2-column grid: Temperature (4 fields with severity color dots), Wind (2 fields), Visibility (1 field). "Save Thresholds" button with success toast.
  - Updated monitoring-off description to mention waypoint coverage.

### Technical
- Modified: `js/modules/weather.js` — added `waypointMonitoringTimer`, `waypointMonitoringLastCheck`, `waypointIntervalMs`, `waypointMonitoring` state; 4 new functions (checkWeatherAtWaypoints, getAlertThresholds, setAlertThresholds, setWaypointMonitoring); updated startWeatherMonitoring to create waypoint timer, stopWeatherMonitoring to clear it, checkWeatherNow to include waypoints, getWeatherMonitoringSettings to expose waypoint/threshold data; updated save/restore to persist waypoint settings and custom thresholds; 4 new public API exports
- Modified: `js/modules/panels.js` — waypoint status display, waypoint monitoring checkbox, threshold configuration inputs (7 fields), "Save Thresholds" button, 2 new event handlers (save-wx-thresholds, wx-waypoint-monitoring)
- weather.js: 2329 lines (was 1198 before Phase 1). 28 new functions across Phases 1-5. 11 AlertModule.trigger calls.

## [6.57.49] - 2025-02-15

### Added
- **Phase 4: NWS Weather Alerts API Fallback** — When AtlasRF is disconnected (or not providing FIS-B data), the background monitoring loop now fetches active weather alerts from the NWS Weather Alerts API (api.weather.gov) and routes them through AlertModule for audible notifications.

  **Fallback Architecture**
  - `_isAtlasRFProvidingAlerts()` — gating function checks 4 conditions: AtlasRFModule loaded, connected, weather source set to FIS-B, and FIS-B data not stale. All four must pass to suppress NWS (prevents duplicate alerting when both sources are available).
  - When AtlasRF IS providing FIS-B: Phase 3 SIGMET processing handles aviation weather alerts, NWS is skipped
  - When AtlasRF is NOT providing: NWS API fetches active alerts for user's GPS position as fallback
  - Both Phase 1 threshold alerts (Open-Meteo) and NWS alerts are combined in monitoring results

  **NWS API Integration**
  - `fetchNWSAlerts(lat, lon)` — fetches from `api.weather.gov/alerts/active?point={lat},{lon}` with proper User-Agent header (required by NWS), GeoJSON accept header, 15-second timeout
  - 10-minute response cache with ~5mi position tolerance to avoid redundant fetches
  - Graceful handling: HTTP 404 for non-US locations returns empty array (NWS is US-only), network timeouts logged at debug level (expected when offline), errors don't break monitoring loop
  - Query parameters: `status=actual&message_type=alert,update` filters to real alerts only

  **NWS Alert Classification**
  - CRITICAL: Extreme severity + specific life-threat events (Tornado Warning, Flash Flood Emergency, Tsunami Warning, Extreme Wind Warning, Hurricane Warning) → persistent banner + sound + push
  - WARNING: Severe severity + all warning products (Severe Thunderstorm, Flood, Winter Storm, Fire, Wind, Heat, Hurricane/Tropical) → sound + toast + push. Context-specific icons (⛈️🌊❄️🔥💨🌡️🌀)
  - CAUTION: Moderate/Minor severity + watches/advisories → toast only (watches also get push notifications)
  - Full NWS metadata preserved in alert data: event, severity, urgency, certainty, headline, instruction, effective, expires, senderName

  **Deduplication**
  - Alert ID-based dedup using NWS `properties.id` field (globally unique per alert)
  - Expiration tracking from NWS `properties.expires` field, defaults to 4 hours
  - Expired entries purged on each processing cycle
  - Prevents re-alerting on repeated monitoring checks for same active alerts

  **Weather Panel UI Updates**
  - Alert source indicator in monitoring status card: "📡 AtlasRF FIS-B" (green) when connected, "🌐 NWS API (N active)" (blue) when fallback is active
  - Updated threshold description to mention NWS alert types alongside Open-Meteo thresholds
  - Updated monitoring OFF description to mention NWS API fallback behavior

### Technical
- Modified: `js/modules/weather.js` — added NWS state variables (API base, User-Agent, cache duration, alerts cache, last fetch, alert count, dedup map), 5 new functions (_isAtlasRFProvidingAlerts, fetchNWSAlerts, classifyNWSAlert, processNWSAlerts, getNWSAlertStatus), wired NWS check into checkWeatherAtCurrentPosition after Phase 1 alerts, updated getWeatherMonitoringSettings to include NWS status, 3 new public API exports
- Modified: `js/modules/panels.js` — alert source indicator in monitoring status card, updated threshold/description text
- No changes to alerts.js, app.js, or atlasrf.js — uses existing AtlasRFModule public API for connection/source/stale checks

## [6.57.48] - 2025-02-15

### Added
- **Phase 3: FIS-B SIGMET Alert Processing** — SIGMETs received from AtlasRF via FIS-B (978 MHz UAT) are now classified, geographically filtered, deduplicated, and routed through AlertModule for audible alerts. Previously, SIGMETs were received and stored but never processed into notifications.

  **SIGMET Classification**
  - Convective SIGMETs (severe thunderstorms, tornadoes) → CRITICAL (sound + persistent banner + push notification)
  - Standard SIGMETs (severe turbulence, severe icing, volcanic ash, dust/sandstorms) → WARNING (sound + toast + push notification)
  - AIRMETs (moderate turbulence/icing, IFR conditions, mountain obscuration) → CAUTION (toast only, no sound)
  - Keyword-based classification with multiple field name fallbacks — handles varying AtlasRF data formats robustly
  - Sub-classification with descriptive labels: Tornado SIGMET, Severe Turbulence SIGMET, AIRMET Sierra/Tango/Zulu, etc.

  **Geographic Relevance Filtering**
  - SIGMETs are only alerted if within 100 miles of user's current GPS position or any saved waypoint
  - Position extraction from multiple field formats: direct lat/lon, center coordinates, polygon centroid ({lat,lon} objects or [lat,lon] arrays)
  - SIGMETs with no position data are conservatively treated as relevant (safety-first for missing data)
  - Haversine great-circle distance calculation for accurate radius check
  - Distance from user included in alert message when available

  **Deduplication**
  - SIGMET ID-based deduplication with expiration tracking (uses SIGMET validity period, defaults to 2 hours)
  - FIS-B rebroadcasts identical SIGMETs every few minutes — dedup cache prevents re-alerting
  - Expired entries automatically purged on each processing cycle
  - Fallback key generation from type + content hash when structured IDs are absent

  **Integration**
  - `processFisBSigmets()` called automatically from `handleAtlasRFWeather()` when SIGMETs are present
  - Event flow: AtlasRF → atlasrf.js → app.js event bridge → handleAtlasRFWeather → processFisBSigmets → AlertModule.trigger
  - `weather:sigmet:alerts` event emitted for other modules to consume
  - Also exported as public API for manual invocation

### Technical
- Modified: `js/modules/weather.js` — added SIGMET dedup state (`alertedSigmetIds` Map, `SIGMET_ALERT_RADIUS_MI` constant), 8 new functions (classifySigmet, getSigmetKey, getSigmetPosition, _haversineDistMi, isSigmetRelevant, getSigmetDescription, getSigmetExpiration, processFisBSigmets), wired call from handleAtlasRFWeather, 1 new public API export
- No changes to alerts.js, panels.js, or app.js — existing event bridge and AlertModule infrastructure already handle the alert routing

## [6.57.47] - 2025-02-15

### Added
- **Phase 2: Background Weather Monitoring** — Periodically checks weather conditions at user's current GPS position and triggers audible alerts through AlertModule when dangerous conditions are detected.
  
  **Monitoring Loop**
  - `startWeatherMonitoring()` / `stopWeatherMonitoring()` — toggle background polling
  - `checkWeatherAtCurrentPosition()` — gets GPS position (falls back to map center), fetches weather from Open-Meteo, routes current conditions through `processWeatherAlerts()` from Phase 1
  - `checkWeatherNow()` — manual immediate check, works whether monitoring is on or off
  - Configurable interval: 15, 30 (default), or 60 minutes via `setWeatherMonitoringInterval()`
  - Minimum interval guard: 5 minutes to prevent API abuse
  - `weather:monitoring:check` event emitted on each check for other modules to consume
  
  **State Persistence**
  - Monitoring enabled/disabled and interval saved to IndexedDB via Storage.Settings
  - Auto-restores on page load: `init()` calls `_restoreWeatherMonitoringState()` to resume monitoring if it was active before refresh
  - `destroy()` stops monitoring timer cleanly
  
  **Weather Panel UI**
  - New "Weather Alerts & Monitoring" section in Weather panel (above AQI section)
  - ON/OFF toggle button with visual state feedback
  - "Check Now" button for immediate weather check with loading indicator
  - Interval selector: 15 / 30 / 60 minute buttons with active state highlighting
  - When monitoring is ON: shows check interval, last check time, and last conditions summary (icon, description, temperature, wind speed, gust warning)
  - When monitoring is OFF: shows description of what monitoring does
  - Alert history panel showing recent weather alerts with severity color coding, timestamps, and clear button
  - Threshold summary shown below interval selector for user reference

### Technical
- Modified: `js/modules/weather.js` — added monitoring state variables, 8 new functions (checkWeatherAtCurrentPosition, startWeatherMonitoring, stopWeatherMonitoring, checkWeatherNow, setWeatherMonitoringInterval, isWeatherMonitoringEnabled, getWeatherMonitoringSettings, plus 2 private persistence helpers), wired into init/destroy, 6 new public API exports
- Modified: `js/modules/panels.js` — Weather Alerts & Monitoring UI section with toggle, check now, interval selector, conditions display, and alert history; 4 event handler blocks (toggle, check now, interval buttons, clear history)

## [6.57.46] - 2025-02-15

### Added
- **Phase 1: Weather → AlertModule Integration** — New `processWeatherAlerts(current, locationName)` function bridges weather threshold checks to the centralized AlertModule, enabling audible alerts, persistent banners, and push notifications for dangerous weather conditions. This is the foundational plumbing for background weather monitoring (Phase 2), FIS-B SIGMET processing (Phase 3), and NWS fallback alerts (Phase 4).

### Severity Mapping
- **CRITICAL** (sound + persistent banner + push notification): Extreme heat (≥100°F), extreme cold (≤10°F), dangerous wind gusts (≥50 mph), severe weather (WMO severity 4+: thunderstorms, heavy freezing rain, heavy snow, violent rain showers)
- **WARNING** (sound + toast + push notification): High temperature (≥90°F), cold conditions (≤32°F), high winds (≥30 mph), adverse weather (WMO severity 3: dense freezing drizzle, heavy rain, moderate snow)
- **CAUTION** (toast only, no sound): Poor visibility (<1 mile)

### Technical
- Modified: `js/modules/weather.js` — added `processWeatherAlerts()` function with 9 threshold conditions routing through `AlertModule.trigger()`, exported via public API. Uses existing `ALERT_THRESHOLDS` constants. AlertModule's built-in 60-second debounce per alert key (`source:severity:title`) prevents duplicate notifications. Guard clause handles missing AlertModule gracefully.
- Existing `generateRouteAlerts()` unchanged — continues to produce visual-only route analysis alerts as before. The two functions serve different purposes: `generateRouteAlerts()` for on-demand route analysis cards, `processWeatherAlerts()` for real-time audible/notification alerting.

## [6.57.45] - 2025-02-14

### Added
- **Meshtastic BLE auto-reconnect on page refresh** — When connected to a Meshtastic device via Bluetooth, the connection now automatically restores after page refresh or PWA restart without requiring a user gesture. Uses `navigator.bluetooth.getDevices()` (Chrome 85+) to retrieve previously paired devices and reconnect silently. Saves device name for reliable matching across sessions. If the device is out of range, shows a toast prompting manual reconnect; the next refresh will retry automatically.
- `MeshtasticClient.reconnectBLE(deviceName)` — New gesture-free BLE reconnect function that probes previously paired devices by name match, falling back to Meshtastic service UUID detection
- `MeshtasticClient.getLastBleDeviceName()` — Accessor for the last connected BLE device name
- `MeshtasticClient.lastBleDeviceName` state — Captured during BLE connection for reconnect matching
- Auto-reconnect state persistence via `meshtastic_reconnect` storage key (autoReconnect flag, lastConnectionType, lastBleDeviceName)
- Toast notifications for reconnect status: "Meshtastic reconnected" on success, "tap Connect to restore BLE" on failure
- Serial connection type tracked for future serial auto-reconnect support

### Technical
- Modified: `js/modules/meshtastic-client.js` — added `reconnectBLE()` function (follows same transport/MeshDevice/configure flow as `connectBLE()` but using `getDevices()` instead of `requestDevice()`), `lastBleDeviceName` state, device name capture in both Method 1 and Method 2 connect paths, new exports
- Modified: `js/modules/meshtastic.js` — added `autoReconnect`/`lastConnectionType`/`lastBleDeviceName` state fields, `saveReconnectState()` persistence helper, `attemptAutoReconnect()`/`attemptBleReconnect()` functions, auto-reconnect save in all 4 connect success paths (MeshtasticClient BLE, basic BLE, MeshtasticClient serial, basic serial), auto-reconnect clear in explicit `disconnect()`, `init()` chains loadSettings→attemptAutoReconnect
- Design: Unexpected disconnects (device lost/powered off) preserve autoReconnect=true so next refresh retries; only explicit user disconnect clears it. Library load wait uses `meshtastic-client-ready` event with 15s timeout fallback.

## [6.57.44] - 2025-02-14

### Added
- **AtlasRF auto-reconnect on page refresh** — When connected to an AtlasRF server (via WebSocket, MQTT, or REST), the connection now automatically restores after page refresh or PWA restart. Uses the same pattern as CoT/TAK Bridge: saves `autoReconnect: true` when connection succeeds, clears it when user explicitly disconnects. All three connection methods (WebSocket, MQTT, REST) and auto mode are supported. If the server is temporarily unreachable on refresh, the next refresh will retry.
- `atlasrf:connecting` event listener in app.js — panel re-renders to show "Connecting..." during auto-reconnect
- `atlasrf:error` event listener in app.js — panel re-renders to show "Disconnected" if auto-reconnect fails

### Technical
- Modified: `js/modules/atlasrf.js` — added `autoReconnect` to state, loadSettings, saveSettings; `init()` chains `loadSettings().then(connect)` when autoReconnect is true; `connect()` sets `autoReconnect = true`; `disconnect()` sets `autoReconnect = false` and persists
- Modified: `js/app.js` — added `atlasrf:connecting` and `atlasrf:error` event listeners

## [6.57.43] - 2025-02-14

### Fixed
- **User settings lost on page refresh** — Multiple UI states were not persisted across sessions: active panel always reset to 'map', waypoint filter reset to 'all', selected vehicle reset to 'truck', panel open/closed state reset, GPS navigation target silently disappeared, and traceroute history was wiped. All six are now saved to IndexedDB and restored on load.

### Added
- UI state persistence (active panel, panel open state, waypoint filter, vehicle type) with debounced auto-save via `Storage.Settings`
- GPS navigation target persistence — active waypoint navigation survives refresh; validates target waypoint still exists before restoring
- Traceroute history persistence — completed mesh route traces saved to `Storage.Settings` and restored on load
- Dedicated `onTraceRoutePacket` event subscription in meshtastic-client.js for firmware versions that fire traceroute responses through a dedicated event rather than generic `onMeshPacket`
- `meshtastic:traceroute_complete` and `meshtastic:traceroute_timeout` event listeners in app.js to auto-refresh team panel widget when async traceroute responses arrive

### Technical
- Modified: `js/core/state.js` — `init()` loads uiState + gpsNavTarget from Storage; subscribers auto-save on change
- Modified: `js/modules/meshtastic.js` — traceroute history load/save in loadSettings/handleNativeTracerouteResponse/clearTracerouteHistory
- Modified: `js/modules/meshtastic-client.js` — added `handleTraceroutePacket()`, `onTraceRoutePacket` subscription, alternative event mapping
- Modified: `js/app.js` — added traceroute event listeners for panel re-rendering

## [6.57.42] - 2025-02-14

### Fixed
- **Traceroute payloads exceed LoRa 228-byte limit (TOO_LARGE errors)** — The traceroute implementation was sending JSON text messages over LoRa that grew with each hop (route array, metadata, names). A 2-hop trace already hit 235 bytes, triggering firmware TOO_LARGE rejections and "Failed to forward: undefined" errors. Replaced the entire custom application-layer traceroute with Meshtastic's native firmware-level `device.traceRoute()` API (RouteDiscovery protobuf, portnum 70). Native traceroute sends compact protobuf packets handled at the routing layer — works with ALL Meshtastic nodes, not just GridDown ones.

### Changed
- `requestTraceroute()` now calls `MeshtasticClient.traceRoute(nodeNum)` instead of sending JSON text messages
- Removed `handleTracerouteRequest()`, `handleTracerouteReply()`, `sendTracerouteReply()` (firmware handles relay/reply)
- Added `handleNativeTracerouteResponse()` to process firmware RouteDiscovery responses
- Added `traceRoute()` function to meshtastic-client.js wrapping `device.traceRoute()`
- Added `onTraceroute` callback slot and detection in `handleMeshPacket()` (portnum 70)
- Legacy JSON traceroute messages silently ignored for backward compatibility

### Technical
- Modified: `js/modules/meshtastic.js` — requestTraceroute, message routing, new native handler
- Modified: `js/modules/meshtastic-client.js` — traceRoute(), onTraceroute callback, handleMeshPacket portnum detection

## [6.57.41] - 2025-02-14

### Fixed
- **Traceroute fails with "isConnected is not defined"** — `requestTraceroute()` called bare `isConnected()` which doesn't exist as a standalone function in the module scope. The module exports `isConnected` as an inline arrow function on the return object (`isConnected: () => state.connectionState === ConnectionState.CONNECTED`), but that's only accessible externally via `MeshtasticModule.isConnected()`, not from inside the IIFE. Replaced with direct state check `state.connectionState !== ConnectionState.CONNECTED`.

### Technical
- Modified: `js/modules/meshtastic.js` line 6529

## [6.57.40] - 2025-02-14

### Fixed
- **Factory Reset takes minutes to activate** — `factoryResetDevice()` tried 4 strategies sequentially. When Strategy 1 (`device.factoryReset()`) sent the reset command, the device rebooted and dropped the BLE connection. But the `await device.factoryReset()` promise hung forever — Web Bluetooth GATT promises don't reject on disconnect, they just wait for a response that never comes. After eventually timing out (browser-dependent, sometimes 30-120 seconds), it fell through to Strategy 2, 3, and 4 — each also hanging on the dead connection. Total wait: 2-8 minutes for what should be instant.
- **New Device Setup shows "Writing configuration to device..." indefinitely** — Same root cause. `batchWriteConfigs()` called `await device.commitEditSettings()` which triggered the firmware's auto-reboot for LoRa changes. The BLE connection dropped, but the promise hung forever. The catch block in `applyConfig()` that checks for disconnect errors never fired because the promise never rejected — it was stuck in limbo. The success screen never appeared even though the device had already rebooted with the correct config applied.
- **Config modal Save Configuration could also hang** — `writeConfig()` and `setLoRaConfig()` both used bare `await device.commitEditSettings()` and `await device.reboot()` which suffer from the same hanging promise issue.

### Added
- **`withBleTimeout()` helper** — Races any BLE device operation against an 8-second timeout using `Promise.race`. Returns `{completed: true, result}` if the operation resolved normally, or `{completed: false}` if it timed out. Timeout = the device rebooted and dropped BLE = treat as success. Applied to all device operations that trigger reboots: `commitEditSettings`, `reboot`, `factoryReset`, `factoryResetConfig`, `setConfig(factoryReset)`, and `resetNodes/resetPeers`.

### Technical
- `withBleTimeout(promise, timeoutMs, label)` defined at module scope in meshtastic-client.js. Uses `Promise.race` between the actual operation and a setTimeout that resolves (not rejects) after 8 seconds. Logging identifies which operation timed out.
- `writeConfig()`: `commitEditSettings` now wrapped in `withBleTimeout`. Added defensive null check for `device` reference (prevents crash if BLE disconnect handler fires between caller's connected check and writeConfig execution).
- `batchWriteConfigs()`: `commitEditSettings` now wrapped in `withBleTimeout`
- `rebootDevice()`: `device.reboot()` now wrapped in `withBleTimeout`
- `factoryResetDevice()`: All 4 strategies now wrapped in `withBleTimeout`. Each strategy also catches BLE disconnect errors (gatt/bluetooth/disconnect/network error) as success indicators. Strategies no longer fall through after a successful send — timeout OR error = device is rebooting = return true immediately.
- Modified: `js/modules/meshtastic-client.js`
- Modified: `js/modules/meshtastic.js` — Reordered `sendConfigToDevice()` to write non-reboot config (owner, position) BEFORE LoRa config (which triggers reboot). Previous order wrote LoRa first → device rebooted → then tried setOwner/setPositionConfig on the dead BLE connection. Also added BLE disconnect catch as success in the outer try/catch.

## [6.57.39] - 2025-02-14

### Fixed
- **New Device Setup wizard still reboots mid-write** — The v6.57.35 fix introduced `batchWriteConfigs()` to write all configs in one edit session, but `applyConfig()` in the wizard bypassed it entirely. It accessed `MeshtasticClient.device` directly from panels.js, which is NOT exposed on the public `window.MeshtasticClient` API — so `device` was always `undefined`. Every `device.setConfig()` and `device.beginEditSettings()` call silently failed (guarded by `if (device && ...)`), falling through to the old broken fallback path that used separate `writeConfig()` calls with individual begin/commit cycles.

### Technical
- **Root cause chain:** `MeshtasticClient.device` is the internal Meshtastic JS library connection object. It's stored as a module-private variable inside meshtastic-client.js and intentionally NOT included in `window.MeshtasticClient = { ... }`. The wizard code at line 6847 did `const device = MeshtasticClient.device` → `undefined` → all `device.*` calls skipped → fallback path triggered → `setOwner()` fallback used `writeConfig()` with its own `beginEditSettings/commitEditSettings` → commit triggered firmware auto-reboot → BLE dropped → remaining config writes failed.
- **Fix:** Wizard now calls `MeshtasticClient.batchWriteConfigs()` (the public API) with three arguments: config payloads array, delay, and new `ownerInfo` parameter. `batchWriteConfigs()` handles `device.setOwner()` + all `setConfig()` calls + `commitEditSettings()` internally using its own reference to the device object. Panels.js never touches `MeshtasticClient.device`.
- **BLE disconnect handling:** The outer try/catch treats any BLE disconnect error (GATT, Bluetooth, network, connection, abort) during the write as success — because it means the device is rebooting to apply LoRa changes, which is expected firmware behavior.
- Modified: `js/modules/panels.js` (applyConfig rewritten), `js/modules/meshtastic-client.js` (batchWriteConfigs accepts ownerInfo)

## [6.57.38] - 2025-02-14

### Fixed
- **Connected Meshtastic device never appears on map** — Two bugs worked together to prevent the user's own device from ever showing on the map:
  1. `updateTeamMembers()` hardcoded `lat: 0, lon: 0` for the self entry — it never checked the self node's actual position data in `state.nodes` (populated from the device's GPS during connection) or `GPSModule` (phone/tablet GPS).
  2. The map's team overlay filter explicitly excluded self with `!m.isMe`, so even if self somehow had valid coordinates, it would never render.

### Added
- **Self mesh node marker on map** — When connecting a Meshtastic device, your own node now appears on the map with a distinct orange marker (📡) that's visually separate from the blue GPS dot (phone position) and green team node circles (other mesh members). This gives immediate visual confirmation that the device connected and has a GPS fix.

### Technical
- `updateTeamMembers()` now resolves self position from two sources in priority order: (1) self node in `state.nodes` via `state.myNodeId` lookup — this is the Meshtastic device's own GPS position populated during the initial node info exchange, (2) `GPSModule.getPosition()` fallback — the phone/tablet's GPS or manual position. Both sources include zero-position guards.
- `setConnectionState()` now calls `updateTeamMembers()` when transitioning to `CONNECTED`, ensuring the self marker appears immediately after connection rather than waiting for the next position broadcast cycle.
- Map team overlay: Removed `!m.isMe` from the visibility filter. Self marker renders with distinct orange styling (`#f97316`), outer ring, dark inner circle, 📡 icon, and bold label — visually distinct from other nodes' green/yellow/gray circles with 👤 icon.
- Modified: `js/modules/meshtastic.js` (updateTeamMembers, setConnectionState), `js/modules/map.js` (team overlay filter + self rendering)

## [6.57.37] - 2025-02-14

### Fixed
- **Export modals don't dismiss / panel stuck after use** — Four modals (Export Telemetry, Traceroute Details, Team QR Code, New Device Setup Wizard) used CSS class `modal-overlay` which has no CSS definition. Only `modal-backdrop` has the required `position: fixed; inset: 0; z-index: 200; backdrop-filter: blur(4px)` styling. Without it, these modals rendered inline in the DOM without fixed positioning, backdrop dimming, or proper stacking — making the panel appear broken and preventing normal dismissal. Changed all four to `modal-backdrop`.
- **Export Channel URL and Show QR Code buttons in Meshtastic Configuration do not work** — Two separate issues:
  1. `buildChannelProtobuf()` called `hexToBytes(channel.psk)` but device-synced channels store PSK as `Uint8Array` (from protobuf-es), not hex strings. `hexToBytes()` called `.substr()` on the Uint8Array, threw a TypeError, caught silently by `generateChannelUrl`'s try/catch, returned null. The Export URL button had no error feedback on null — just `if (urls) { ... }` with no else clause.
  2. All clipboard operations used bare `navigator.clipboard.writeText()` without checking if `navigator.clipboard` exists. In non-secure contexts (HTTP, certain WebViews), `navigator.clipboard` is undefined, causing synchronous TypeError before the promise chain, bypassing the `.catch()` fallback.

### Technical
- `buildChannelProtobuf()` now handles PSK in four formats: `Uint8Array` (direct use), `ArrayBuffer` (wrapped), hex string (via `hexToBytes`), and base64 string (via `atob` decode). Each format is auto-detected.
- Export Channel URL button: Added `if (!urls || !urls.web)` guard with error toast. Wrapped clipboard access in `try { if (navigator.clipboard && navigator.clipboard.writeText) { ... } else { prompt() } } catch { prompt() }`.
- Show QR Code button: Applied same safe clipboard pattern to all three clipboard call sites (QR copy button, QR generation fallback, no-QR-library fallback).
- CSS class fix: `modal-overlay` → `modal-backdrop` on traceroute modal, export telemetry modal, team QR modal, and new device setup wizard modal. Element IDs unchanged so close handlers still work.
- Modified: `js/modules/panels.js`, `js/modules/meshtastic.js`

## [6.57.36] - 2025-02-14

### Fixed
- **Meshtastic nodes intermittently disappearing from map** — When a Meshtastic device broadcasts a position packet without a valid GPS fix (common during cold start, indoor operation, or momentary fix loss), the firmware sends lat=0/lon=0. This zero position was overwriting the node's last known valid position at every level of the chain: `handlePositionPacket` (client), `handlePositionFromClient`, `handleNodeInfoFromClient`, and `handlePositionUpdate` (module). The map filter correctly hides nodes at 0,0, so the device would vanish until the next valid GPS fix arrived. Added zero-position guards at all six `node.lat`/`node.longitude` assignment sites across both `meshtastic-client.js` and `meshtastic.js`. A valid last-known position is now preserved when zero-position packets arrive. The `onPosition` callback also now only fires when valid position data is available, preventing downstream handlers from receiving bogus 0,0 coordinates.

### Technical
- `handlePositionPacket` (client): Guard `if (latI !== 0 || lonI !== 0)` before writing `node.latitude`/`node.longitude`; metadata fields (satsInView, groundSpeed, etc.) still update regardless
- `handleNodeInfoPacket` (client): Already had guard — no change needed
- `handlePositionFromClient` (module): `hasValidPosition` check before writing `node.lat`/`node.lon`
- `handleNodeInfoFromClient` (module): Changed from `!== undefined` to `!== undefined && !== 0` check
- `handlePositionUpdate` (module): Added `Math.abs > 0.0001` guard
- `handleCheckin` (module): Already had `message.lat && message.lon` guard
- `onPosition` callback: Only fires when `node.latitude !== 0 || node.longitude !== 0`
- Modified: `js/modules/meshtastic-client.js`, `js/modules/meshtastic.js`

## [6.57.35] - 2025-02-14

### Fixed
- **New Device Setup reboots before finishing configuration** — The wizard wrote each config section (owner name, position broadcast, LoRa radio) as separate `beginEditSettings() → setConfig() → commitEditSettings()` transactions. The `commitEditSettings()` call flushes to NVS flash, and many Meshtastic firmware versions automatically reboot on commit — killing the BLE connection before the remaining config sections could be written. The wizard now batches position and LoRa radio config into a single edit session via new `MeshtasticClient.batchWriteConfigs()`, then issues one explicit `rebootDevice()` at the very end after all writes are committed.

### Technical
- `MeshtasticClient.batchWriteConfigs(payloads, delayMs)` — New API that opens one `beginEditSettings()`, writes all payloads with configurable inter-write delay (default 500ms), then calls one `commitEditSettings()`. Prevents intermediate flash commits from triggering premature reboots.
- Wizard `applyConfig()` rewritten: `setOwner()` runs first (separate admin command), then `batchWriteConfigs([position, lora])` writes both config sections in one session, then single `rebootDevice(2)` at the end.
- Fallback path preserved: if `batchWriteConfigs` is unavailable, falls back to individual writes with 1-second delays between them.
- Modified: `js/modules/meshtastic-client.js` (batchWriteConfigs), `js/modules/panels.js` (wizard applyConfig)

## [6.57.34] - 2025-02-14

### Fixed
- **Meshtastic Configuration modal not fully visible** — The modal used `overflow: hidden` on the outer container with a fixed max-height, clipping the footer (Save/Cancel buttons) when content exceeded the viewport. Converted to flex column layout with `max-height: 85vh` on the modal and `flex:1; min-height:0; overflow-y:auto` on the body, so the header and footer always stay visible while the body scrolls.

- **Factory Reset Device not executing** — `device.factoryReset()` doesn't exist on all firmware/library versions. Rewrote `MeshtasticClient.factoryResetDevice()` with four fallback strategies: (1) `device.factoryReset()`, (2) `device.factoryResetConfig()`, (3) admin message via `device.setConfig()` with `device.factoryReset` flag, (4) `resetNodes`/`resetPeers`/`resetDB`/`nodeDBReset` + reboot. Logs all available device methods for debugging. Error message now includes which reset-related methods were found on the device object.

- **Configuration modal persisting after Save** — The save handler's `await setRadioConfig()` could throw when device communication failed, and the `catch` block showed an error toast but never called `closeModal()`. Moved `closeModal()` and `renderTeam()` after the try/catch so the modal always closes regardless of success or failure. Also switched all close/cancel/backdrop handlers from `domCache.get()` to `document.getElementById()` with null checks for reliability.

### Technical
- Modified: `js/modules/meshtastic-client.js` (factory reset strategies), `js/modules/panels.js` (modal layout + close handlers)

## [6.57.33] - 2025-02-14

### Added
- **Factory Reset and App State Reset for Meshtastic** — Two-mode reset capability accessible from the Meshtastic Configuration modal's new "Reset" section.
  - **Reset App Data** — Clears all GridDown-side Meshtastic state: PKI key pairs, peer public keys, DM conversations, message history, outbound queue, channel read state, setup wizard, cached device config, and traceroute history. Does not touch the Meshtastic device hardware. Useful for handing a tablet to a new operator or clearing stale state after team changes.
  - **Factory Reset Device** — Sends the firmware `factoryReset()` command to the connected Meshtastic device, erasing all device settings (region, channels, PSKs, owner, position config) and restoring firmware defaults. Device reboots automatically. Clears GridDown's cached device config to force clean re-sync on reconnect. Falls back to `resetNodes()` + reboot on older firmware that lacks `factoryReset()`.
  - Both buttons require two-click confirmation (click once to arm, click again to execute) with auto-revert timeout to prevent accidental resets.
  - Factory Reset Device button is disabled when no device is connected.

### Technical
- `MeshtasticClient.factoryResetDevice()` — New client API function wrapping `device.factoryReset()` with fallback to `resetNodes()` + reboot
- `MeshtasticModule.factoryResetDevice()` — Module wrapper that sends reset command and clears cached device config, channels, connection state
- `MeshtasticModule.resetAppState()` — Comprehensive app state cleanup covering 10 state categories with per-category reporting
- UI: "Reset" danger zone section added to `openMeshConfigModal()` in panels.js with two-step confirmation pattern
- Modified: `js/modules/meshtastic-client.js`, `js/modules/meshtastic.js`, `js/modules/panels.js`

## [6.57.32] - 2025-02-14

### Fixed
- **Longitude direction reversed in mesh location shares** — `sendLocation()` displayed positive longitudes as West and negative as East (swapped). For example, a pin at -119.19°W would display as "119.19°E" in the text message. The waypoint JSON had correct raw coordinates, so GridDown-to-GridDown rendering was fine, but any standard Meshtastic client receiving the text would see the wrong hemisphere. Fixed: `lon >= 0 ? 'E' : 'W'`.

- **Channel management was local-only — never reached the Meshtastic device** — `createChannel()`, `importChannelFromUrl()`, `joinFromQR()`, and `deleteChannel()` all modified GridDown's internal channel list but never called `MeshtasticClient.setChannel()` to push changes to the connected device. Additionally, channels reported by the device during connection were stored in `MeshtasticClient.channels` but never synced into GridDown's `state.channels`. This two-way disconnect meant GridDown's hardcoded defaults (Primary/LongFast/LongSlow at indices 0/1/2) could mismatch the device's actual configuration, sending messages on wrong channel indices.
  - Added `syncChannelsFromDevice()` — replaces hardcoded defaults with device-reported channels on connect via the `onChannelUpdate` callback
  - Added `pushChannelToDevice()` — writes new channels to device hardware when creating/importing channels
  - `deleteChannel()` now disables the channel on device (sets role to DISABLED)
  - All channel creation paths enforce the 8-channel device limit (indices 0-7)

- **GridDown protocol messages exceeded Meshtastic's ~228 byte LoRa payload** — SOS (238 bytes), waypoints (226 bytes), and encrypted DMs with longer text all exceeded the LoRa text payload limit. The firmware would either silently truncate (corrupting the JSON → receiver parse failure → message lost) or throw a GATT error. SOS messages — the most safety-critical — always exceeded the limit even with empty defaults.
  - Added message compaction: `compactMessage()` recursively shortens JSON field names (e.g. `type→t`, `fromName→fn`, `timestamp→ts`, `waypoint→w`, `encryptedText→et`). Applied automatically in `sendViaRealClient()` when payload exceeds 228 bytes.
  - Added `expandMessage()` on the receive side — both the real client path (`handleMessageFromClient`) and legacy path (`processReceivedData`) detect and expand compacted messages via the `"t"` field discriminator.
  - Multi-level payload optimization in `sendViaRealClient()`: L1 compacts field names; L2 strips reconstructable fields (`fromName`, `timestamp`, empty strings) — receiver resolves sender name from `state.nodes` and uses arrival time for timestamp; L3 dynamically truncates the longest nested string values (SOS details, waypoint notes) to shed remaining excess bytes.
  - DM text limit enforced at 65 chars (`MAX_DM_TEXT_SIZE`) to account for AES-GCM encryption overhead + base64 encoding + JSON envelope.
  - All message types verified to fit within 228-byte LoRa payload across minimal, realistic, and worst-case payloads.

### Technical
- Modified: `js/modules/meshtastic.js` (all three fixes)
- New constants: `MAX_LORA_PAYLOAD` (228), `MAX_DM_TEXT_SIZE` (65)
- New functions: `compactMessage()`, `expandMessage()`, `isCompactedMessage()`, `removeEmptyStrings()`, `truncateNestedStrings()`, `syncChannelsFromDevice()`, `pushChannelToDevice()`
- Receive-side reconstruction: `handleMessageFromClient()` reconstructs `fromName` from node map and `timestamp` from arrival time when stripped by L2 optimization
- Compaction field map: 34 verbose→compact key mappings covering all GridDown protocol message types

## [6.57.31] - 2025-02-13

### Fixed
- **GATT errors and packet timeouts during position broadcast**
  - Root cause: GridDown was broadcasting the phone's GPS position every 60 seconds via `device.setPosition()`, even when the Meshtastic device has its own GPS enabled. The device was already broadcasting its own position, so GridDown's broadcasts created duplicate mesh traffic and overwhelmed the BLE link — producing `GATT operation failed for unknown reason`, `Packet timed out`, and cascading `create(PositionSchema) failed: undefined` errors.
  - Fix: `startPositionBroadcast()` now checks `MeshtasticClient.deviceConfig.gpsEnabled`. When the device has GPS enabled, phone position broadcasting is skipped entirely (the device handles it). Phone GPS is only broadcast when the device lacks GPS or has it disabled.
  - Added failure backoff: after 3 consecutive position broadcast failures, the interval is stopped to prevent flooding the BLE transport with failing packets. Counter resets on success.

- **`Position via create(PositionSchema) failed: undefined`** — The Meshtastic library's `setPosition()` rejection value has no `.message` property when packets time out. Error logging now uses `e?.message || e` to show the actual error instead of `undefined`.

- **`Blocked aria-hidden on an element because its descendant retained focus`** — The modal container in `index.html` had a static `aria-hidden="true"` attribute that conflicted with focused elements inside open modals. Removed the static attribute; when the container is empty there's nothing for assistive tech to find anyway.

### Technical
- Modified: `js/modules/meshtastic.js` (GPS-aware position broadcast, failure backoff)
- Modified: `js/modules/meshtastic-client.js` (error logging in sendPosition)
- Modified: `index.html` (removed aria-hidden from modal-container)
- Service worker cache: v6.57.30 → v6.57.31

## [6.57.30] - 2025-02-13

### Fixed
- **Meshtastic nodes missing from map — NodeInfo position extraction**
  - Root cause: `handleNodeInfoPacket` in meshtastic-client.js never extracted position data from NodeInfo packets. When a device connects, it receives NodeInfo for all known mesh nodes (which includes each node's last known GPS position stored on the device). But the handler only extracted user info, SNR, and device metrics — position was silently dropped.
  - Result: Nodes only appeared on the map after they sent a *separate* position broadcast packet (default: every 15 minutes with smart broadcasting). So on connect, most nodes showed in the team list but not on the map.
  - Fix: Extract `nodeInfo.position.latitudeI/longitudeI` (integer format, ÷1e7 for degrees) along with altitude, time, and satsInView. Handles both camelCase and snake_case protobuf field names. Zero-position guard prevents storing invalid coordinates.
  - The downstream handler in meshtastic.js (`handleNodeInfoFromClient`) already checked `clientNode.latitude` — it was just never being populated by the client layer.

### Technical
- Modified: `js/modules/meshtastic-client.js` (handleNodeInfoPacket position extraction)
- Service worker cache: v6.57.29 → v6.57.30
- Data flow: NodeInfo packet → position extraction → onNodeUpdate callback → handleNodeInfoFromClient → updateTeamMembers → State.set('teamMembers') → map re-render via State subscription

## [6.57.29] - 2025-02-13

### Fixed
- **Meshtastic config modal audit — 3 issues fixed:**
  1. **Setup wizard race condition** — `setRadioConfig` (which triggers device reboot) was called before `setPositionConfig`, so position config was racing a 2-second reboot timer. Reordered steps: device name → position broadcast → radio config (reboot-triggering step is now always last).
  2. **QR button was placeholder** — "Show QR Code" button just copied base64 text to clipboard. Now renders a visual QR code using the ISO 18004 `QRGenerator` module with scannable overlay, channel URL display, and copy button. Falls back to clipboard if QR generator unavailable.
  3. **Fallback config path missing reboot** — If `setLoRaConfig` batch function wasn't available, individual LoRa setters committed to flash via `writeConfig` but never triggered the reboot needed to apply LoRa radio changes. Added `rebootDevice(2)` to fallback path when `_reboot` flag is set.

### Technical
- Modified: `js/modules/panels.js` (wizard step reorder, QR code rendering)
- Modified: `js/modules/meshtastic.js` (fallback reboot in sendConfigToDevice)
- Service worker cache: v6.57.28 → v6.57.29

## [6.57.28] - 2025-02-13

### Fixed
- **Meshtastic config lost on reboot** — Config changes staged to RAM but never committed to NVS/flash. Meshtastic firmware uses a 3-phase write protocol: `beginEditSettings()` → `setConfig()` → `commitEditSettings()`. We were only calling phase 2, so the reboot (which correctly triggers to apply LoRa radio changes) loaded the old config from flash. Added `writeConfig()` helper that wraps all `setConfig()` calls with `beginEditSettings/commitEditSettings` transaction. All config paths now commit to flash: LoRa batch (`setLoRaConfig`), individual setters (`setRegion/setModemPreset/setTxPower/setHopLimit`), owner identity (`setOwner`), and position broadcast (`setPositionConfig`).

### Technical
- Modified: `js/modules/meshtastic-client.js` (added `writeConfig()` helper, all 7 config-writing functions updated)
- Service worker cache: v6.57.27 → v6.57.28

## [6.57.27] - 2025-02-13

### Fixed
- **Meshtastic config not programming radio** — Three bugs prevented LoRa config changes (region, modem preset, TX power, hop limit) from actually taking effect on the device:
  - `deviceConfig` contamination: All four LoRa setters spread the entire `deviceConfig` accumulator (which includes non-LoRa fields like `role`, `gpsEnabled`, `firmwareVersion`, `hwModel`) into the protobuf `lora` config message. Foreign fields cause `@meshtastic/core` v2.6+ to reject or silently drop the write. Fixed by extracting only LoRa-specific fields via new `getLoRaFields()` helper
  - No reboot after config write: Meshtastic firmware stores LoRa config to flash but doesn't apply it to the radio until reboot. `rebootDevice()` existed but was never called. Config modal now auto-reboots after writing
  - Four flash writes instead of one: Save handler made 4 separate `device.setConfig()` calls. Added `setLoRaConfig()` batch function that writes all LoRa params in a single call + triggers reboot. Config modal, setup wizard, and scenario presets all updated to use batch path
- **`setOwner` fallback contamination** — Same `deviceConfig` spreading bug in the `setOwner` fallback path, injecting LoRa/position/metadata fields into a device config protobuf message

### Added
- `MeshtasticClient.setLoRaConfig(config, autoReboot)` — Batch LoRa config write + optional reboot
- `MeshtasticModule.setRadioConfig(config)` — Validated batch LoRa config with automatic reboot

### Technical
- Modified: `js/modules/meshtastic-client.js` (config contamination fix, batch function), `js/modules/meshtastic.js` (batch routing, scenario update), `js/modules/panels.js` (config modal + wizard batch calls)
- Service worker cache: v6.57.26 → v6.57.27

## [6.57.26] - 2025-02-13

### Fixed
- **RadiaCode heatmap dead code** - Map rendering reimplemented RadiaCode tracks/position inline (130 lines) instead of calling `RadiaCodeModule.renderOnMap()`, making the heatmap toggle a no-op. Replaced with delegation call matching the AtlasRF pattern. Heatmap IDW overlay, demo mode indicator, and pulse ring hex parsing all now work end-to-end
- **Team rally point sync broken** - All three rally operations (add/update/remove) broadcast `rally_update` with empty data. Receivers checked `msg.d.rallyPoints` which was always undefined, silently dropping all rally sync. Now sends full rally array
- **Team comm plan sync missing** - `updateCommPlan()` broadcast `comm_plan` messages but `processTeamSync()` had no handler case. Comm plan changes (frequencies, check-in schedules, emergency words) never reached other team members. Added `case 'comm_plan':` handler
- **Team info sync broken** - `updateTeam()` broadcast `team_info` with empty data. Receivers checked `msg.d.name` and `msg.d.settings` which were undefined, dropping name/settings updates. Now sends name, description, and settings
- **Team hourly check-ins ignored** - `getNextCheckIn()` only handled `daily` and `once` frequencies, silently skipping `hourly` entries that `addCheckInTime()` accepted. Next check-in UI showed nothing despite hourly schedule being set
- **TeamModule not initialized** - `TeamModule.init()` was never called from `app.js`, preventing saved team state restoration on reload and disabling all Meshtastic event handlers for team sync. Added to startup sequence after MeshtasticModule

### Improved
- **Team encryption upgraded** - Replaced XOR obfuscation (32-bit djb2 hash key with zero bytes at positions 30-31) with AES-256-GCM via Web Crypto API. Uses PBKDF2 key derivation (100k iterations, SHA-256) with random salt and IV. Legacy XOR packages still importable via backward-compatible decryption path
- **Team QR codes scannable** - Replaced pseudo-QR generator (hash-derived visual pattern no scanner could read) with ISO 18004 compliant encoder. New `qr-generator.js` module (609 lines) implements byte mode, ECC level M, versions 1-13, GF(256) Reed-Solomon, all 8 mask patterns with penalty scoring. Team invite QR codes now scannable by standard readers
- **Removed hardcoded Yosemite coordinates** - Rally point waypoints included `x/y` pixel values calculated from Yosemite-area constants (37.4215°N, 119.1892°W). Dead code since `lat/lon` is always set, but removed for cleanliness

### Technical
- New module: `js/modules/qr-generator.js` (609 lines)
- Modified: `js/modules/map.js` (-130 lines), `js/modules/team.js` (audit + encryption + QR), `js/app.js` (+TeamModule.init), `index.html` (+script tag), `sw.js` (cache bump + new file)
- Service worker cache: v6.57.25 → v6.57.26

## [6.57.25] - 2025-02-13

### Fixed
- **AtlasRF REST data shape mismatch** - Track metadata (callsign, ICAO, squawk, MMSI, etc.) was buried in a nested `metadata` dict when received via REST polling, but at the top level when received via WebSocket. Tracks appeared as anonymous blips in REST mode. Now `handleTrackUpdate` flattens metadata into top-level fields so both connection modes render identically.
- **REST poll cache-busting** - Added `cache: 'no-store'` to `fetchAllTracks()` and health check fetches to prevent any browser caching of stale track data.

### Technical
- AtlasRF module v1.4.0 → v1.5.0
- Service worker cache: v6.57.24 → v6.57.25

## [6.57.24] - 2025-02-10

### Fixed
- **AtlasRF Direct Ethernet Link compatibility** — Full support for AtlasRF's Direct Ethernet Link feature (10.42.0.x subnet):
  - Aligned default port from 8000 to 8080 to match AtlasRF's actual server port across atlasrf.js CONFIG, panels.js UI placeholder, and all fallback values
  - Added protocol-aware URL construction — `getBaseUrl()`, `getWsUrl()`, and `getMqttWsUrl()` now use HTTP/WS for local hosts (.local, private IPs) and HTTPS/WSS for remote hosts, preventing mixed-content browser blocks when GridDown is served over HTTPS
  - New `shouldUseHttps()` auto-detection: uses HTTP for `atlasrf.local`, `10.42.0.x`, `192.168.x.x`, `localhost`; matches page protocol for non-local hosts
  - Added Protocol selector (Auto / HTTP / HTTPS) to AtlasRF connection panel for manual override
  - `useHttps` setting persisted in `atlasrf_settings` storage, exposed via `getUseHttps()`/`setUseHttps()` API

### Documentation
- Provided corrected AtlasRF `NETWORK_SETUP.md` with port 8000→8080 fixes and new Mode 4 (Direct Ethernet Link) section documenting the API-driven 10.42.0.x subnet feature
- Provided corrected AtlasRF `setup_network.sh` with stale `ATLASRF_PORT=8000` updated to 8080

## [6.57.23] - 2025-02-10

### Fixed
- **AtlasRF connection reliability** - Fixed issue requiring 5+ Connect button presses before connection establishes:
  - Health check now retries up to 3 attempts with 8-second timeout per attempt, accommodating slow mDNS hostname resolution (e.g. `atlasrf.local`) which can take 3-8 seconds on first lookup
  - Fixed WebSocket timeout/onclose race condition where the timeout handler called both `close()` and `reject()`, causing delayed `onclose` to fire after REST fallback was already active and clobber the connection state back to disconnected
  - Added `settled` guard flag in `connectWebSocket()` to prevent double resolve/reject from concurrent timeout and onclose events
  - `connectAuto()` now explicitly cleans up the failed WebSocket reference (`state.ws = null`) before starting REST fallback, preventing stale onclose handlers from interfering
  - WebSocket `onclose` handler now checks `state.connectionMode === 'rest'` and skips state mutation if connection has already transitioned to REST polling

## [6.57.22] - 2025-02-10

### Improved
- **AtlasRF map icons** - Upgraded all track type renderers from basic geometric shapes (chevrons, diamonds, circles) to distinct, recognizable silhouette icons:
  - Aircraft: Top-down airplane with fuselage, swept wings, and horizontal stabilizer (rotates with heading)
  - Ships: Vessel hull with pointed bow and bridge superstructure block (rotates with COG)
  - Drones (Remote ID): Quadcopter with X-arms, central body, 4 rotor circles, and direction indicator (rotates with heading)
  - Radiosondes: Weather balloon ellipse with shine highlight, tether line, and payload gondola
  - APRS: Radio tower mast with guy-wire base, antenna diamond, and signal arc emanations
- All icons maintain existing color coding, heading rotation, emergency pulse, and alpha fade on stale tracks

### Fixed
- **APRS icon alpha rendering** - Fixed compounding globalAlpha bug in renderAPRS that corrupted transparency for stale tracks. Replaced nested `(ctx.globalAlpha || n) * n / n` pattern with clean parentAlpha capture-and-restore
- **renderTrack dispatch** - Radiosonde and APRS tracks now dispatch to dedicated renderers instead of falling through to generic circle marker
- **Label offset** - Adjusted callsign label Y-offset from +20 to +22 to clear taller icon silhouettes

## [6.57.21] - 2025-02-09

### Fixed
- **Search navigation routing** - Fixed 4 broken panel mappings in global search that sent users to wrong panels or nowhere:
  - RadiaCode help topic routed to Map panel instead of Team panel where it renders
  - RadiaCode settings entry used invalid panel ID `'radiacode'` (not a real panel) instead of `'team'`
  - APRS help topic routed to Radio panel instead of Team panel where it renders
  - Map Layer settings action targeted non-existent `'layers'` panel instead of `'map'`
- All 20 panel references in search now validated against actual NAV_ITEMS panel IDs

## [6.57.20] - 2025-02-09

### Added
- **Cumulative Dose Persistence** - Dose exposure tracked across sessions via persistent dose log. Shows session dose and lifetime cumulative dose in live reading display. Session history records start/end times, dose received, and device serial. Dose accumulation uses time-integrated dose rate with 30-second auto-save. Reset button with confirmation to clear all history
- **Radiation Heatmap Layer** - IDW (inverse distance weighted) interpolation renders color-coded radiation heatmap overlay on the map from all track data points. Adaptive influence radius based on point density. Toggle on/off from RadiaCode panel. Renders as base layer under track lines and dots
- **CSV Export for Tracks** - Export radiation survey tracks as CSV with columns: timestamp, datetime_utc, latitude, longitude, altitude_m, dose_rate_uSv_h, count_rate_cps, level. Compatible with Excel, GIS tools, and data analysis workflows
- **GPX Export for Tracks** - Export tracks as GPX 1.1 with custom `griddown:` XML extensions for dose rate, count rate, and dose level per trackpoint. Compatible with GPS software and mapping tools
- **Track Detail Modal** - Export footer now shows three format buttons (CSV, GPX, GeoJSON) for one-click download in any format

## [6.57.19] - 2025-02-09

### Enhanced
- **Spectrum Viewer Upgraded** - Full rewrite of gamma spectrum chart: log/linear scale toggle, calibration-aware energy axis, gradient-filled spectrum trace, responsive hi-DPI canvas, proper Y-axis count labels, background grid
- **Peak Detection Rewritten** - Replaced flawed window-mean algorithm with Poisson-statistics background estimation from window edges. Peaks now correctly detected with significance scoring (σ > 3.0). Demo reliably finds K-40, Cs-137, Pb-214, Tl-208
- **Isotope Annotations on Chart** - Identified isotopes displayed as labeled gold markers directly on the spectrum at their energy positions, with overlap avoidance. Peaks marked with dashed red lines and keV labels
- **Isotope Display Enhanced** - Half-life shown for each match, confidence bar with color coding (green/yellow/orange), improved card layout
- **Interactive Crosshair** - Hover/tap spectrum chart shows tooltip with energy (keV), channel number, and count value at cursor position
- **Demo Spectrum Improved** - Realistic peak heights and widths (σ=8 channels matching RadiaCode CdZnTe resolution), added Cs-137 and Tl-208 peaks, lower noise floor

## [6.57.18] - 2025-02-09

### Fixed
- **Search Help Entries Now Navigate to Panels** - 37 of 40 help entries now navigate directly to their relevant panel when clicked, instead of showing an informational dead-end modal. Toast notification shows feature description. 3 purely informational entries (Keyboard Shortcuts, Night Mode, Compass/Declination) retain modal behavior
- **Removed "Found in X panel" Text Crutches** - Panel destination now handled by navigation behavior and "→ Panel" subtitle indicator, eliminating redundant text directions from help content
- **Search Result Panel Indicators** - Help entries with panel destinations show "→ Weather", "→ GPS" etc. in subtitle so users know the result is navigable before clicking

## [6.57.17] - 2025-02-09

### Fixed
- **Sidebar Scroll Reset** - Scroll position in sidebar nav preserved when clicking panels. Previously, clicking "Team" (or any panel requiring scroll to reach) would reset the sidebar to the top, forcing users to scroll back down to find where they are
- **Panel Scroll Reset on Tab Switch** - Switching tabs within panels (e.g., Celestial Observe→DR, SSTV tabs) no longer resets the panel scroll to top. Uses requestAnimationFrame to restore scroll position after innerHTML rebuild
- **Panel Scroll Reset on Internal Re-renders** - All 18 panel render functions now preserve scroll position when re-rendering due to user interactions (toggling settings, updating values, connecting devices, etc.)

### Changed
- **Sidebar Category Dividers** - Added visual grouping labels (NAVIGATE, PLAN, ENVIRONMENT, COMMS, REFERENCE, HARDWARE) to sidebar navigation. Panels reordered into logical groups. Hidden on mobile bottom nav. Stealth mode compatible
- **Panel Order Reorganized** - Navigation tools grouped together (Map→Sun/Moon), planning tools together (Waypoints→Planning), communications together (Team→Radio), hardware/SDR together (Offline→SARSAT)

## [6.57.16] - 2025-02-09

### Added
- **Wind Indicator on Map** - Real-time wind conditions HUD overlay:
  - Directional arrow showing where wind is blowing TO (rotates smoothly)
  - Wind speed in mph with Beaufort-scale color coding (green→yellow→red)
  - Gust speed shown when gusts exceed sustained speed by 5+ mph
  - 16-point cardinal direction label (N, NNE, NE, etc.)
  - Auto-updates whenever weather data is fetched
  - Positioned below offline toggle (top-left), follows stealth mode styling
  - Full ARIA support with live region updates

- **Dewpoint Display** - Added to weather panel stats grid:
  - Fetched from Open-Meteo API (dewpoint_2m parameter)
  - Useful for fog prediction, hypothermia risk, condensation on optics
  - `calcDewpoint()` utility using Magnus-Tetens approximation

- **UV Index Display** - Added to weather panel stats grid:
  - Fetched from Open-Meteo API (uv_index parameter)
  - Relevant for prolonged field ops, altitude burn risk, snow blindness

- **Cloud Cover Display** - Added to weather panel stats grid

- **Wind Direction in Hourly Forecast** - Now fetched from API for route analysis

### Enhanced
- **Weather Panel** - Expanded from 3-stat to 6-stat grid (feels like, humidity, wind+direction, dewpoint, UV index, cloud cover)
- **Weather Events** - New `weather:wind` event emitted on each fetch for module integration
- **Weather API** - `getCurrentWind()`, `windDirectionToCardinal()`, `getBeaufortScale()`, `calcDewpoint()` added to public API

### Tests
- 29 new weather tests: cardinal direction (11), Beaufort scale (8), dewpoint (6), formatWind (3), getCurrentWind (1)
- Test suite total: 253 tests, 0 failures

### Fixed
- **Global Search Help Coverage** - Expanded from 20 to 40 help entries:
  - Fixed weather entry referencing "NWS" (now correctly says Open-Meteo)
  - Added: wind indicator, dewpoint/UV, air quality, satellite/radar, stream gauges
  - Added: hiking mode, terrain analysis, dead reckoning, coordinate converter
  - Added: logistics, contingency planning, medical reference, field guides
  - Added: SSTV, AtlasRF, RadiaCode, TAK bridge, compass/declination
  - Added: track recording, Meshtastic device setup
  - Updated barometer entry to note location in GPS panel
  - All entries include relevant search keywords for discoverability

## [6.57.15] - 2025-02-09

### Added - New Device Setup UI
- **Device Setup Wizard:** 5-step modal for configuring brand-new pre-flashed Meshtastic devices directly from GridDown — no Meshtastic app needed
  - Step 1: Connect via Bluetooth or USB with auto-config detection
  - Step 2: Set device identity (longName/shortName) — written to device hardware
  - Step 3: Region selection with legal compliance warning
  - Step 4: Radio settings (modem preset, TX power, hop limit, position broadcast interval)
  - Step 5: Review & apply with progress indicator — writes all config to device in sequence
- **MeshtasticClient.setOwner():** New function writes device owner name to hardware (persists across reboots, visible to other mesh nodes)
- **MeshtasticClient.setPositionConfig():** New function sets position broadcast interval, GPS update rate, and GPS enable on device
- **MeshtasticClient.rebootDevice():** New function to reboot device after config changes
- Entry point: "📱 New Device Setup" button in team panel connection section

### Fixed - Team goto button ID mismatch
- Goto (🎯) buttons for team/mesh members now embed lat/lon/name directly in data attributes
- Handler reads coordinates from data attributes instead of looking up by member ID
- Fixes silent failure when TeamModule member IDs (mbr-*) didn't match MeshtasticModule node IDs (!XXXXXXXX)

### Improved - setUserName device sync
- `MeshtasticModule.setUserName()` now pushes owner name to device hardware when connected
- `sendConfigToDevice()` extended to handle longName, shortName, position config, and GPS settings

### Added - CSS spin animation
- `@keyframes spin` for loading spinners used across setup and connection UIs

### Expanded - Test Suite (88 → 224 tests)
- **Events module:** on/emit, off/unsubscribe, once (7 tests)
- **Log module:** setLevel/getLevel, getStats, LEVELS hierarchy, restore (6 tests)
- **ErrorBoundary module:** getErrors/clear, getStats, onError/unsubscribe, formatReport (6 tests)
- **DeclinationModule:** getDecimalYear, trueToMagnetic, magneticToTrue, formatDeclination, formatInclination, WMM calculate, getModelInfo (25 tests)
- **TerrainModule:** haversineDistance, calculateBearing, destinationPoint, getCardinalDirection, calculateSlope, classifySlope, assessTrafficability (45 tests)
- **HikingModule:** formatDuration, formatTimeFromHours, calculateNaismith, calculateTobler, estimateHikingTime, PACE_PRESETS (28 tests)
- **RadioModule:** formatFreq, calcRepeaterInput, FRS_CHANNELS, EMERGENCY_FREQUENCIES, getByCategory, searchAll, CTCSS_TONES (20 tests)
- All modules loaded via IIFE extraction with minimal browser mocks — no network or DOM required

## [6.57.14] - 2025-02-09

### Improved - Accessibility / ARIA (Audit 3.1)
- ARIA attributes increased from 159 → 281 (+77%)
- **Modal dialogs:** All 23 panels.js modals now have `role="dialog"` and `aria-modal="true"`; 26 backdrops have `role="presentation"`
- **Modal close buttons:** All 30 icon-only close buttons across panels.js now have `aria-label="Close dialog"`
- **Generic showModal():** Added accessible `ModalsModule.showModal(title, html)` function with dialog role, labelledby, focus management, and Escape-to-close
- **Settings controls:** 4 select elements (units, coord format, zoom level, log level) now have `aria-label`
- **Route actions:** Edit, delete, and elevation profile buttons now have contextual `aria-label` including route name
- **Coordinate tools:** 5 per-format copy buttons and 4 quick-action buttons now have descriptive `aria-label`
- **Comm plan:** 8 edit/delete action buttons now have contextual `aria-label` including item name
- **Map context menu:** Container has `role="menu"` + `aria-label`; 7 items have `role="menuitem"`; 7 decorative emoji icons have `aria-hidden="true"`
- **Already present (verified):** Skip-nav links, landmark roles (navigation, main, complementary), toast live region, sidebar menubar with menuitem roles, mobile FAB with aria-expanded, canvas accessible name

### Removed - Dead HistoryModule (Audit 4.6)

### Cleaned - CSS Dead Rules (Audit 3.5)
- Purged 125 unused CSS classes across 159 rule blocks (655 lines, 12.5%)
- app.css reduced from 5,240 → 4,585 lines (127.5 KB → 108.9 KB)
- Removed dead styles for: stealth selectors (12 classes), elevation profile (19), grade bars/legends (7), APRS markers (8), segment items (8), steep warnings (6), team-member markers (5), conn-status (4), and misc
- All 583 active classes retained; brace-balance verified

### Added - Log Level Controller (Audit 3.6)
- New `js/core/log.js` module — loaded first in boot sequence, before error-boundary
- Wraps console.log and console.debug to respect configurable log level
- console.warn and console.error always pass through (safety-critical)
- Levels: error → warn (default) → info → log → debug (verbose)
- Default 'warn' suppresses 353 console.log + 42 console.debug calls in production
- Override via URL param `?loglevel=debug` or Settings → Diagnostics dropdown
- Persists to localStorage as `griddown_log_level`
- Emergency escape: `Log.restore()` reverts all console methods to originals
- Settings → Diagnostics now includes: log level selector, suppression count, error count, error log viewer, report copy
- Deleted `js/core/history.js` (588 lines) — a superseded undo/redo prototype that was never integrated
- State.js records actions to `UndoModule` (in `js/modules/undo.js`), not HistoryModule
- HistoryModule's keyboard shortcuts registered a competing Ctrl+Z handler that raced with UndoModule's, producing spurious "Nothing to undo" toasts from permanently-empty stacks
- Removed from: index.html script tags, SW pre-cache list, app.js init sequence
- Ported HistoryModule's input-field guard to UndoModule: Ctrl+Z in text inputs now correctly triggers browser-native text undo instead of app-level undo

### Fixed - Unhandled Promise Chains (Audit 3.3)
- Added `.catch()` handlers to all 9 unhandled `.then()` chains across 5 files:
  - **panels.js:** 5 chains — clipboard writes (3x team URL/QR), TeamModule.generateTeamQR, SSTVEnhanceModule.init
  - **search.js:** 1 chain — landmark coordinate copy
  - **sos.js:** 1 chain — position report clipboard copy
  - **networkstatus.js:** 1 chain — connectivity check on offline toggle
  - **app.js:** 1 chain — serviceWorker.ready for update detection
- Clipboard failures now show user-facing error toasts instead of silently failing
- TeamModule QR failure now renders error message in QR container
- SSTV enhance init failure now logs warning instead of leaving module in limbo

### Added - Centralized Error Boundary (Audit 3.4)
- New `js/core/error-boundary.js` module — loaded first in boot sequence
- Captures `window.error` (sync errors in handlers/timers) and `unhandledrejection` (missed promise catches)
- Ring buffer holds last 100 errors with deduplication throttle (1s window)
- Auto-ignores benign noise: ResizeObserver loops, cross-origin script errors, chunk load failures
- Module inference from stack traces (maps errors to source module names)
- Settings → Diagnostics section with:
  - Error count display
  - "View Error Log" — modal with color-coded entries by type/module
  - "Copy Error Report" — formatted text report to clipboard
- API: `ErrorBoundary.getErrors()`, `.getStats()`, `.formatReport()`, `.onError(cb)`, `.clear()`

### Fixed - DOM Query Caching (Audit 2.4)
- **panels.js:** Added `domCache` with lazy `isConnected` validation for 67 getElementById calls across SSTV canvases (8x `sstv-tx-canvas`, 7x `sstv-annotation-canvas`), radio content (7x), zoom controls, and modal elements. Cache auto-clears on panel switch via `render()`.
- **map.js:** Cached static DOM refs (`coords-text`, `coords-format`, `declination-value`) at init. Most impactful: `coords-text` in mouse-move handler (fires ~60x/sec during map interaction).

### Verified - setTimeout Audit (Audit 2.5)
- Audited all 96 setTimeout calls across codebase. All unclearable timeouts are verified fire-and-forget one-shots (modal focus, canvas init, wizard steps, retry delays). No stacking risks remain — the actual stacking bugs were in per-render event listener attachment, fixed in v6.57.13.

### Added - PWA Manifest Fields (Audit 4.1)
- Added `lang`, `dir`, `display_override`, `prefer_related_applications`, `handle_links` fields
- Added `screenshots` entries for wide (1280×720) and narrow (750×1334) form factors — placeholder paths pending real screenshot capture
- Created `screenshots/` directory with capture instructions

### Verified - localStorage Key Consistency (Audit 4.4)
- Both non-standard keys (`airnow_api_key`, `gd_layer_expanded`) already have migration code that reads old key, writes to `griddown_*` prefix, and removes old key. Migration is self-cleaning; no action needed.

## [6.57.13] - 2025-02-09

### Added - Test Coverage & Event Delegation Refactor
- **Test suite:** 88 tests across 25 suites covering Helpers (escapeHtml, formatDistance, clamp, calcDistance, generateId), Coordinates (DD/DMS/DDM parsing, UTM roundtrip, bearing, compass), and State (get/set, subscribe, Waypoints CRUD, Routes CRUD, Map zoom clamping, Modal, withoutHistory)
- **Test runner:** `node tests/test-runner.js` — runs in Node.js with minimal browser mocks, zero dependencies

### Fixed - UTM Conversion Bug
- **Coordinates.utmToLatLon:** Central meridian `lon0` was in degrees but used in radians-based formula, producing wildly incorrect longitudes (e.g., -7046° instead of -122°). Converted to radians before use. Verified with multi-zone roundtrip tests.

### Refactored - Event Listener Delegation
- **panels.js:** 29 → 6 addEventListener calls. Extended existing delegation to cover all comm plan events (save, export, add/edit/delete channels, callsigns, check-ins, protocols, schedule toggle). Removed 190-line `bindCoordinateConverterEvents()` body (duplicate of delegation). Net: 220 lines removed.
- **search.js:** 17 → 9 addEventListener calls. Added `setupSearchDelegation()` on stable `#search-results` container. Eliminated per-render listener attachment in `renderResults()`, `renderRecentSearches()`, `renderSuggestions()`, `renderQuickActions()` — these previously leaked listeners on every keystroke.

## [6.57.12] - 2025-02-09

### Fixed - Audit Critical Items
- **SW cache:** Added `tak.js` to service worker pre-cache (was missing, broke TAK offline)
- **Version sync:** Aligned manifest.json, CHANGELOG, and RELEASE_NOTES to 6.57.12
- **Window assignments:** Added `window.` exports for CameraSextantModule, RangefinderModule, StarIDModule (referenced 48 times but never exposed to window)
- **Map re-render:** Added `teamMembers` to map State subscription (mesh nodes now trigger immediate map updates)
- **Position protobuf:** Fixed ForeignFieldError in sendPosition by using protobuf-es v2 `create()` with schema discovery
- **Position field names:** Hardened handlePositionPacket with camelCase/snake_case fallbacks

## [6.57.10] - 2025-02-09

### Changed - Meshtastic BLE Direct Device Request

Added fallback approach that requests Bluetooth device directly using Web Bluetooth API when `Transport.create()` is not available.

**Approach:**
1. First try `TransportWebBluetooth.create()` (official factory method)
2. If unavailable, request Bluetooth device directly via `navigator.bluetooth.requestDevice()`
3. Pass the device to the transport constructor

**Debug Info Added:**
- Transport static methods listing
- Transport prototype methods listing
- Device methods listing
- Constructor parameter attempts

Uses Meshtastic BLE Service UUID: `6ba1b218-15a8-461f-9fa8-5dcae273eafd`

---

## [6.57.9] - 2025-02-09

### Fixed - Meshtastic Library Factory Pattern

Fixed connection failures by using the correct library API pattern.

**Root Cause:** The @meshtastic transport libraries use a **static factory method** (`create()`), not a constructor.

**Incorrect (what we were doing):**
```javascript
const transport = new TransportWebBluetooth();  // ❌ Wrong
```

**Correct (official API from npm docs):**
```javascript
const transport = await TransportWebBluetooth.create();  // ✅ Correct
const device = new MeshDevice(transport);
```

**Changes:**
- `connectBLE()` - Now calls `TransportWebBluetooth.create()` factory method
- `connectSerial()` - Now calls `TransportWebSerial.create()` factory method
- Added fallback to constructor if `create()` is not available

This matches the official documentation at https://www.npmjs.com/package/@meshtastic/transport-web-bluetooth

---

## [6.57.8] - 2025-02-09

### Fixed - Meshtastic Connection API

Fixed `transport.connect is not a function` error caused by @meshtastic library API changes.

**Errors Fixed:**
```
TypeError: transport.connect is not a function
TypeError: Cannot read properties of undefined (reading 'device')
```

**Root Cause:** The @meshtastic/core library changed its connection pattern in recent versions:
- Old API: `new MeshDevice(transportInstance)` then `transport.connect()`
- New API: `new MeshDevice()` then `device.connect({ transport: TransportClass })`

**Solution:** Updated connection flow to support both API patterns:

```javascript
// 1. Try creating MeshDevice without transport (newer API)
device = new MeshDevice();

// 2. Connect with transport class as option
await device.connect({ 
    transport: TransportWebBluetooth,
    concurrentLogOutput: false 
});

// 3. Falls back to older API if needed
```

Changes in `meshtastic-client.js`:
- `connectBLE()` - Rewritten to try new API first, fallback to old
- `connectSerial()` - Same pattern applied
- `disconnect()` - Now tries `device.disconnect()` then `transport.disconnect()`

This ensures compatibility with both the newer @meshtastic/core@2.5+ and older versions.

---

## [6.57.7] - 2025-02-09

### Fixed - Meshtastic Transport Class Names

Fixed Bluetooth and Serial connection failures caused by @meshtastic library renaming transport classes in v2.6.x.

**Error Fixed:**
```
WebBluetoothTransport class not found. Library API may have changed.
```

**Root Cause:** The @meshtastic/transport-web-bluetooth library changed export names:
- Old: `WebBluetoothTransport`, `WebSerialTransport`
- New (v2.6.x): `TransportWebBluetooth`, `TransportWebSerial`

**Solution:** Updated detection to try both naming patterns:
```javascript
// Now tries: TransportWebBluetooth → WebBluetoothTransport → BleConnection → default
const Transport = bleTransport.TransportWebBluetooth || 
                  bleTransport.WebBluetoothTransport || 
                  bleTransport.BleConnection || 
                  bleTransport.default;
```

This ensures compatibility with both older and newer versions of the Meshtastic JavaScript libraries.

---

## [6.57.6] - 2025-02-08

### Updated - Documentation

Comprehensive documentation update to reflect v6.57.x architecture.

#### AUDIT_REPORT.md

Completely rewritten to reflect current state:

- **Module count**: 29 → 59 modules documented
- **Code statistics**: 42K → 116K lines, 468 try/catch blocks
- **Accessibility**: Marked as ✅ Pass (160+ ARIA attributes)
- **Security**: Added demo mode gating documentation
- **Platform matrix**: Updated browser/device compatibility
- **File inventory**: Complete module listing with line counts

#### ARCHITECTURE.md

Completely rewritten with:

- **Visual diagrams**: ASCII art showing module relationships
- **59 modules documented**: Organized into 9 categories
- **Hardware integration**: Web Bluetooth/Serial architecture
- **External integrations**: TAK/CoT bridge, Meshtastic mesh diagrams
- **Data flow**: User action → state → render pipeline
- **Offline strategy**: Service worker caching, storage hierarchy
- **Module pattern**: IIFE template with examples
- **Platform compatibility**: Browser feature support matrix

Module Categories:
- Communication & Mesh Networking (8)
- Navigation & Mapping (9)  
- Celestial Navigation (4)
- Hardware Integration (5)
- Weather & Environment (6)
- Reference & Field Guides (5)
- SSTV (3)
- Import/Export (3)
- UI & System (16)

---

## [6.57.5] - 2025-02-08

### Added - Demo/Training Mode APIs

Added public APIs to support external training tools like SceneForge bridge. These enable realistic training scenarios without modifying core GridDown code.

#### APRSModule

```javascript
// Inject demo APRS stations (requires demo mode)
APRSModule.injectDemoStations([
    { callsign: 'DEMO-1', lat: 34.05, lon: -118.24, symbol: '/-' },
    { callsign: 'DEMO-2', lat: 34.06, lon: -118.25, symbol: '/>' }
]);

// Clear only injected demo stations (leaves real stations)
APRSModule.clearDemoStations();
```

#### MeshtasticModule

```javascript
// Inject demo mesh nodes (requires demo mode)
MeshtasticModule.injectDemoNodes([
    { nodeNum: 0x12345678, longName: 'Demo User', shortName: 'DEMO' }
]);

// Inject demo messages
MeshtasticModule.injectDemoMessages([
    { from: 0x12345678, text: 'Check-in from sector 7', timestamp: Date.now() }
], 0);  // Channel 0

// Clear demo data
MeshtasticModule.clearDemoNodes();
```

#### MapModule

```javascript
// Check if tiles are still loading
MapModule.hasPendingTiles();      // Returns boolean
MapModule.getPendingTileCount();  // Returns number

// Wait for all tiles to load (useful for screenshots/exports)
await MapModule.waitForTiles(10000);  // 10s timeout
```

#### Security

Demo APIs require demo mode flag to be set:
```javascript
window.__GRIDDOWN_DEMO_MODE__ = true;
// or
window.__SCENEFORGE_DEMO_MODE__ = true;
```

Injected data is marked with `_injected: true` for identification.

---

## [6.57.4] - 2025-02-08

### Fixed - Meshtastic Library Constructor Compatibility

Fixed constructor errors when connecting to Meshtastic devices (reported with RAK WisMesh Pocket v2).

#### Changes

- **API Compatibility**: Updated `meshtastic-client.js` to handle different export patterns from `@meshtastic/core` library
  - Now detects `MeshDevice`, `Client`, or default exports dynamically
  - Supports both constructor and factory patterns for transport classes
  - Better error messages when library API has changed

- **Event Handler Robustness**: Made `setupEventHandlers()` more resilient
  - Added null checks for all event subscriptions
  - Falls back to `.on()` event pattern if `.events.subscribe()` not available
  - Logs available device properties when expected API is missing

- **Debugging Support**: Added `debugLibraries()` function to window.MeshtasticClient
  - Inspects loaded library structure
  - Shows available exports from core, BLE transport, and serial transport
  - Helps diagnose library compatibility issues

#### Technical Details

The `@meshtastic/core` library has evolved over versions, with different export patterns:
- Some versions: `export { MeshDevice }`
- Some versions: `export default { MeshDevice }`
- Some versions: `export { Client }` (renamed)

The fix now tries multiple patterns to find the correct constructor.

---

## [6.55.0] - 2025-02-01

### Added - Telemetry Export

This release implements comprehensive telemetry export functionality, allowing users to export mesh network data for analysis, reporting, and documentation.

#### Export Modal

Access via the **📊 Export Telemetry** button when connected:

```
┌─────────────────────────────────────────────┐
│  📊 Export Telemetry                   [×]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │   12    │ │   47    │ │    3    │       │
│  │  Nodes  │ │Messages │ │Tracerts │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  CSV EXPORTS                                │
│  ┌─────────────────────────────────────┐   │
│  │ 👥 Node List (CSV)              📥  │   │
│  │    12 nodes • Position, signal...   │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ 💬 Message History (CSV)        📥  │   │
│  │    47 messages • Timestamps...      │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  JSON REPORTS                               │
│  ┌─────────────────────────────────────┐   │
│  │ 🏥 Mesh Health Report           📥  │   │
│  │    Health score, signal dist...     │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │ 📋 Full Telemetry Report        📥  │   │
│  │    Complete export with all data    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

#### Export Formats

**Node List CSV** (`griddown-nodes-TIMESTAMP.csv`):
```csv
Node ID,Name,Short Name,Hardware Model,Firmware Version,Latitude,Longitude,Altitude (m),SNR (dB),RSSI (dBm),Signal Quality,Battery Level (%),Voltage (V),Last Seen,Status,Minutes Ago
!abc123,"Base Station",BASE,Heltec V3,2.3.0,39.740210,-104.990250,1609,8.5,-75,excellent,85,4.12,2025-02-01T12:30:00Z,active,5
```

**Message History CSV** (`griddown-messages-TIMESTAMP.csv`):
```csv
Timestamp,From Node,From Name,To Node,Channel,Type,Content,Status,Is Sent,RTT (ms)
2025-02-01T12:25:00Z,!abc123,"Base Station",broadcast,primary,text,"Team check-in",delivered,No,
```

**Mesh Health Report JSON** (`griddown-health-TIMESTAMP.json`):
```json
{
  "generatedAt": "2025-02-01T12:30:00Z",
  "reportType": "Mesh Health Report",
  "summary": {
    "overallStatus": "good",
    "healthScore": 85,
    "totalNodes": 12,
    "activeNodes": 8,
    "isConnected": true
  },
  "signalQuality": {
    "distribution": { "excellent": 3, "good": 4, "fair": 1, "poor": 0 },
    "averageSNR": 6.2,
    "averageRSSI": -82
  },
  "nodes": [...],
  "deviceConfig": {...}
}
```

**Full Telemetry Report JSON** (`griddown-telemetry-TIMESTAMP.json`):
- Complete export with all nodes, messages, traceroutes
- Device configuration and channel settings
- Statistics summary
- Version metadata

#### New Functions (MeshtasticModule)

```javascript
// CSV Exports
MeshtasticModule.exportNodesCSV()       // Returns CSV string
MeshtasticModule.exportMessagesCSV()    // Returns CSV string

// JSON Reports
MeshtasticModule.exportMeshHealthReport()    // Returns object
MeshtasticModule.exportFullTelemetryReport() // Returns object

// Download functions (trigger file download)
MeshtasticModule.downloadNodesCSV()
MeshtasticModule.downloadMessagesCSV(channelId?)
MeshtasticModule.downloadTelemetryReport()
MeshtasticModule.downloadHealthReport()

// Summary for UI
MeshtasticModule.getExportSummary()
// Returns: { nodesCount, messagesCount, traceroutesCount, hasData }
```

#### Events Emitted

- `meshtastic:telemetry_exported` - Export completed
  - Payload: `{ type: 'nodes_csv' | 'messages_csv' | 'health_report' | 'full_report' }`

#### Use Cases

**After-Action Reports:**
> Export full telemetry after a SAR exercise for documentation and analysis

**Network Analysis:**
> Export node list with signal quality to identify weak links in mesh coverage

**Backup & Archive:**
> Export complete telemetry report as backup of mesh configuration and history

**Team Debriefing:**
> Export message history to review communications timeline

**Performance Tracking:**
> Export health reports over time to track mesh network improvements

---

## [6.54.0] - 2025-02-01

### Added - Traceroute Visualization

This release implements mesh network traceroute functionality, allowing users to visualize how messages propagate through the mesh and identify the route to any node.

#### How It Works

1. **Click the 🔍 button** next to any team member in the Team panel
2. Or **open the Traceroute modal** to select a destination node
3. GridDown sends a traceroute request through the mesh
4. Each relay node adds itself to the route
5. The destination responds with the complete path
6. **Route is visualized** with hop-by-hop display

#### Traceroute Widget

When a traceroute is active or completed, a widget appears showing:

```
┌─────────────────────────────────────────────┐
│  TRACEROUTE                     ✅ COMPLETED │
│                                       245ms  │
│  Route to Sarah (3 hops)                    │
│                                             │
│  ● You (Origin)                             │
│  │                                          │
│  ● Mike                            good     │
│  │                                          │
│  ● Base Station                    excellent│
│  │                                          │
│  ● Sarah (Destination)             good     │
│                                             │
│  [📜 History]  [✕ Clear]                   │
└─────────────────────────────────────────────┘
```

Features:
- **Real-time status**: pending → in_progress → completed/timeout/error
- **RTT (Round Trip Time)** measurement
- **Hop count** display
- **Signal quality** badges for each hop
- **Visual route** with connected nodes

#### Team Card Enhancement

Each team member card now has a **🔍 traceroute button**:
- Only appears when connected to mesh
- One-click route tracing
- Shows route visualization in widget

#### Traceroute Modal

Full-featured modal for traceroute operations:
- **Node list** with signal quality and last-seen time
- **Recent traceroutes** history
- **Start traceroute** to selected node

#### New Functions (MeshtasticModule)

```javascript
// Request traceroute to a node
MeshtasticModule.requestTraceroute(targetNodeId)
// Returns: { requestId, traceroute }

// Get active traceroute
MeshtasticModule.getActiveTraceroute()
// Returns: traceroute object or null

// Get specific traceroute by ID
MeshtasticModule.getTraceroute(requestId)

// Get traceroute history (last 20)
MeshtasticModule.getTracerouteHistory()

// Clear history
MeshtasticModule.clearTracerouteHistory()

// Get nodes available for traceroute
MeshtasticModule.getNodesForTraceroute()

// Format traceroute for display
MeshtasticModule.formatTracerouteDisplay(traceroute)
// Returns: { statusIcon, hops, rtt, route: [...], ... }
```

#### New Message Types

- `TRACEROUTE_REQUEST` - Request route to destination
- `TRACEROUTE_REPLY` - Route path response

#### Traceroute State

```javascript
state.traceroutes      // Map of requestId → traceroute data
state.activeTraceroute // Currently displayed traceroute
state.tracerouteHistory // Array of completed traceroutes
```

#### Traceroute Object Structure

```javascript
{
  requestId: 'tr-1706834400000-abc123',
  targetNodeId: '!abcd1234',
  targetName: 'Sarah',
  startedAt: 1706834400000,
  status: 'completed',  // pending, in_progress, completed, timeout, error
  route: [
    { nodeId, nodeName, hopNumber, isOrigin, signalQuality },
    { nodeId, nodeName, hopNumber, signalQuality },
    { nodeId, nodeName, hopNumber, isDestination, signalQuality }
  ],
  hops: 2,
  rtt: 245,  // Round trip time in ms
  completedAt: 1706834400245,
  error: null
}
```

#### Events Emitted

- `meshtastic:traceroute_started` - Traceroute request sent
- `meshtastic:traceroute_complete` - Route found successfully
- `meshtastic:traceroute_timeout` - Request timed out (30s)
- `meshtastic:traceroute_error` - Error occurred
- `meshtastic:traceroute_history_cleared` - History cleared

#### Constants

- `TRACEROUTE_TIMEOUT`: 30 seconds
- `TRACEROUTE_MAX_HOPS`: 10 hops maximum

#### UI Components Added

- **Traceroute widget** - Route visualization panel
- **Traceroute modal** - Node selection and history
- **Traceroute button** - 🔍 on each team member card

#### Use Cases

**Network Debugging:**
> "Messages to Bob are delayed - let me trace the route to see which relay is slow"

**Mesh Optimization:**
> "I want to understand how many hops my messages take to reach the base station"

**Relay Placement:**
> "By tracing routes, I can identify where to add relay nodes"

**Signal Analysis:**
> "The traceroute shows signal quality at each hop - node 3 has poor signal"

---

## [6.53.0] - 2025-02-01

### Added - Drop Pin → Send to Mesh Workflow

This release implements the highly-requested "Drop Pin → Send" feature, allowing users to instantly share a map location with their mesh network without creating a waypoint first.

#### How It Works

1. **Right-click** (or long-press on mobile) anywhere on the map
2. Select **"📡 Send to Mesh"** from the context menu
3. Optionally add a **label** (e.g., "Rally point", "Meeting spot")
4. Choose to **Broadcast to All** or send to a **specific node**
5. Tap **Send Location** - done!

#### Context Menu Enhancement

New "Send to Mesh" option added to map right-click menu:

```
┌─────────────────────────────────┐
│  39.74021°N, 104.99025°W        │
├─────────────────────────────────┤
│  📍 Add Waypoint Here           │
│  📡 Send to Mesh          ← NEW │
│  📏 Measure From Here           │
│  🧭 Navigate To Here            │
│  ⊕  Center Map Here             │
│  ─────────────────────────────  │
│  📋 Copy Coordinates            │
│  📋 Copy as Decimal             │
└─────────────────────────────────┘
```

- Automatically disabled when not connected to mesh
- Shows "(not connected)" hint when Meshtastic offline

#### Send to Mesh Modal

```
┌─────────────────────────────────────────┐
│  📡 Send Location to Mesh          [×]  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │ 📍 Dropped Pin                   │   │
│  │    39.74021°N, 104.99025°W      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  LABEL (optional)                       │
│  ┌─────────────────────────────────┐   │
│  │ Rally point                      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  SEND TO                                │
│  ┌─────────────────────────────────┐   │
│  │ 📢 Broadcast to All      ✓      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Or send to specific node               │
│  ┌─────────────────────────────────┐   │
│  │ 👤 Sarah    2m ago  good        │   │
│  │ 👤 Mike     5m ago  fair        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [      📡 Send Location       ]        │
└─────────────────────────────────────────┘
```

Features:
- **Location preview** with coordinates
- **Optional label** for context
- **Broadcast** to entire mesh
- **Direct message** to specific node
- **Node list** with signal quality and last seen
- **Visual feedback** on send completion

#### Dual-Format Transmission

Location is sent in two formats for maximum compatibility:

1. **Text Message** (universal)
   ```
   📍 Rally point
   39.740210°N, 104.990250°W
   ```

2. **Waypoint Packet** (for rich display on compatible devices)
   - Shows as interactive pin on receiving device's map
   - Includes label, coordinates, expiration (24 hours)

#### New Functions (MeshtasticModule)

```javascript
// Send location to mesh
MeshtasticModule.sendLocation(lat, lon, label, toNodeId)

// Get nodes for recipient selection
MeshtasticModule.getNodesForRecipientSelection()
// Returns: [{ id, name, lastSeen, signalQuality, isActive }, ...]
```

#### New Functions (MapModule)

```javascript
// Open send to mesh modal (internal)
openSendToMeshModal(lat, lon)

// Check if mesh is connected
isMeshConnected()

// Show temporary pin after sending
showTemporaryPin(lat, lon, label)
```

### Events Emitted

- `meshtastic:location_sent` - Location sent successfully
  - Payload: `{ lat, lon, label, to, broadcast }`

### CSS Additions

- `.map-context-menu__item:disabled` - Disabled menu item styling
- `.map-context-menu__hint` - Hint text for disabled items
- `.recipient-btn` - Recipient selection button styles
- `.signal-badge` - Signal quality indicators

### Use Cases

**Emergency Response:**
> "I found the missing hiker at this location" → Drop pin → Send to all SAR members

**Team Coordination:**
> "We'll meet here" → Drop pin → Send to team

**Navigation Assistance:**
> "Turn left at this intersection" → Drop pin → Send to specific node

**Event Coverage:**
> "Medical station relocated here" → Drop pin → Broadcast update

---

## [6.52.0] - 2025-02-01

### Added - Device Detection & Connection Guidance

This release adds intelligent device detection and connection guidance to help users connect their Meshtastic devices correctly, with special handling for BLE-only devices like the WisMesh Pocket.

#### Device Capability Database
Comprehensive database of Meshtastic hardware models with capabilities:

| Device | Bluetooth | Serial | GPS | WiFi | Battery | Screen |
|--------|-----------|--------|-----|------|---------|--------|
| WisMesh Pocket | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| WisMesh Tap | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| T-Echo | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| T-Beam | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Heltec V3 | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| RAK WisBlock | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Station G2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

#### Device Type Selector
Pre-connection device selection buttons:
- **WisMesh Pocket** - Auto-disables Serial button
- **T-Echo** - Auto-disables Serial button  
- **T-Beam** - Both connections enabled
- **Heltec** - Both connections enabled
- **Other** - Both connections enabled (default)

#### Dynamic Connection Button State
- Serial/USB button automatically disabled when BLE-only device selected
- Visual feedback with reduced opacity and tooltip explanation
- Prevents connection attempts that will fail

#### Context-Sensitive Help Messages
- ⚠️ Warning for BLE-only devices: "WisMesh Pocket only supports Bluetooth. The USB port is for charging only."
- ℹ️ Info for dual-mode devices: "T-Beam supports both Bluetooth and Serial/USB connections."

#### Connected Device Info Card
After connection, displays:
- Device name and type
- Firmware version with update status
- Capability badges (Bluetooth, Serial, GPS, WiFi, Screen)
- Device-specific notes

#### Quick Reference Guide
Always-visible reference in connection panel:
- **Bluetooth only:** WisMesh Pocket/Tap, T-Echo, RAK Tracker
- **Both supported:** T-Beam, Heltec, Station G2, WisBlock

### New Functions (MeshtasticModule)

#### Device Capabilities
- `getDeviceCapabilities(hwModel)` - Get capabilities for any hardware model
- `getConnectedDeviceCapabilities()` - Get capabilities of connected device
- `deviceSupportsSerial()` - Check if current device supports Serial
- `deviceSupportsBluetooth()` - Check if current device supports Bluetooth
- `getConnectionRecommendation(hwModel)` - Get recommended connection method
- `getCommonDevices()` - Get list of common devices for UI
- `detectDeviceFromName(name)` - Detect device type from Bluetooth name

### New Constants
- `DeviceCapabilities` - Full database of device capabilities

### UI Components Added

#### Device Selection Panel
```
┌─────────────────────────────────────────────┐
│  SELECT YOUR DEVICE                         │
│                                             │
│  [📱 WisMesh Pocket] [📱 T-Echo] [📡 T-Beam]│
│  [📡 Heltec] [🔧 Other]                     │
│                                             │
│  ⚠️ WisMesh Pocket only supports Bluetooth. │
│     The USB port is for charging only.      │
│                                             │
│  [📶 Bluetooth]  [🔌 Serial/USB (disabled)] │
│                                             │
│  Bluetooth only: WisMesh Pocket/Tap, T-Echo │
│  Both supported: T-Beam, Heltec, WisBlock   │
└─────────────────────────────────────────────┘
```

#### Connected Device Card
```
┌─────────────────────────────────────────────┐
│  CONNECTED DEVICE                           │
│                                             │
│  📱 RAK WisMesh Pocket                      │
│     Firmware 2.5.6 • ✓ Up to date          │
│                                             │
│  [📶 Bluetooth] [📍 GPS] [🖥️ Screen]        │
│                                             │
│  Consumer portable device - Bluetooth only  │
└─────────────────────────────────────────────┘
```

### Device Database Coverage
- RAK: WisBlock 4631, WisBlock 11200, Tracker 2560, WisMesh Tap, WisMesh Pocket
- LilyGo: T-Beam (all versions), T-Echo, T-LoRa (V1, V2, T3 S3)
- Heltec: V1, V2, V2.1, V3, Wireless Stick Lite V3
- B&Q: Nano G1, G1 Explorer, G2 Ultra
- Seeed: Wio WM1110
- Stations: G1, G2

---

## [6.51.0] - 2025-02-01

### Added - Phase 2: Quick Setup & Field UX

This release implements the complete field UX package for Meshtastic, making it easy to get teams up and running quickly with optimized settings for different operational scenarios.

#### First-Run Setup Wizard
- **4-step guided setup** - Name → Region → Pair Device → Scenario
- **Identity configuration** - Set your mesh name and 4-character short ID
- **Region selection** - Required for legal radio operation
- **Device pairing** - Bluetooth or Serial/USB connection
- **Scenario selection** - Apply optimized presets in one click

#### Scenario Presets
Pre-configured settings optimized for specific use cases:

| Preset | Modem | Hop Limit | Position Interval | Use Case |
|--------|-------|-----------|-------------------|----------|
| 🔍 Search & Rescue | Long Slow | 5 | 2 min | Wilderness SAR operations |
| 🎯 Field Exercise | Long Fast | 4 | 5 min | Training and practice |
| 🎪 Event Coverage | Medium Fast | 3 | 3 min | Festivals, races, events |
| 🤫 Low Profile | Long Moderate | 2 | 15 min | Minimal transmissions |
| 🚨 Emergency | Very Long Slow | 7 | 1 min | Crisis response |
| ⚙️ Custom | (current) | (current) | (current) | User-defined |

Each preset includes:
- Optimized modem preset for range/speed tradeoff
- Appropriate hop limit for mesh topology
- Position broadcast interval tuned to scenario
- Scenario-specific canned messages

#### Canned Messages Bar
Quick-send buttons for common field communications:
- **Context-aware** - Messages change based on active scenario
- **One-tap sending** - Send "OK", "Copy", "At Rally", "RTB", etc.
- **Auto-icons** - Icons assigned based on message content
- **Customizable** - Set your own canned messages

Default Messages: OK, Copy, Moving, At rally point, RTB, Need assistance, Holding position, Task complete

SAR Messages: Found subject, Need medical, Grid clear, Returning to CP, At assignment, Copy all

#### Mesh Health Dashboard Widget
Real-time mesh network health monitoring:
- **Health score** - 0-100 numeric score with status (Excellent/Good/Fair/Poor)
- **Active node count** - Nodes seen within 5 minutes
- **Signal distribution** - Breakdown by signal quality
- **Average signal** - Mean SNR and RSSI across mesh
- **Queue status** - Shows pending outbound messages
- **Current scenario** - Displays active preset

#### Enhanced QR Team Onboarding
- **Generate team QR** - Create shareable QR code with channel + scenario
- **Scan to join** - Import channel settings from QR code or URL
- **Share URL** - Copy or share channel URL directly
- **Scenario bundling** - QR includes preset settings

### New Functions (MeshtasticModule)

#### Scenario Management
- `getScenarioPresets()` - Get all available scenario presets
- `getScenarioPreset(id)` - Get specific scenario by ID
- `getActiveScenario()` - Get currently active scenario
- `applyScenarioPreset(id, applyToDevice)` - Apply scenario settings

#### Canned Messages
- `getCannedMessages()` - Get messages for active scenario
- `setCustomCannedMessages(messages)` - Set custom messages
- `sendCannedMessage(id)` - Send a canned message by ID
- `sendCannedByShortcut(num)` - Send by shortcut number (1-8)

#### Mesh Health
- `getMeshHealth()` - Get comprehensive mesh health status
- `getMeshHealthColor(status)` - Get color for health status

#### Setup Wizard
- `isWizardCompleted()` - Check if first-run wizard completed
- `completeWizard()` - Mark wizard as completed
- `resetWizard()` - Reset wizard status
- `getWizardSteps()` - Get wizard step definitions

#### Team Onboarding
- `generateTeamOnboardingQR()` - Generate QR code data
- `joinFromQR(qrData)` - Join team from QR code or URL

### New Constants
- `ScenarioPresets` - All scenario preset definitions
- `DefaultCannedMessages` - Default canned message set
- `WizardSteps` - Wizard step definitions
- `MeshHealthThresholds` - Health calculation thresholds

### UI Components Added

#### Scenario Selector (disconnected state)
Buttons to select scenario before connecting:
- Shows all presets with icons
- Highlights active scenario
- Displays scenario description

#### Mesh Health Widget (connected state)
Dashboard showing:
- Circular health score indicator
- Active scenario badge
- Node counts and signal distribution
- Queue status indicator

#### Canned Messages Bar
Row of quick-send buttons below message input:
- 8 message slots
- Contextual icons
- Tap to send immediately

#### Team QR Modal
- QR code display (placeholder - requires QR library)
- Channel URL display
- Copy and Share buttons

#### Setup Wizard Modal
- Step indicator (1-4)
- Animated step transitions
- Device connection status
- Scenario selection grid

### Technical Details

#### Scenario Application Flow
```
User selects scenario
    ↓
applyScenarioPreset(scenarioId)
    ↓
Update state.activeScenario
    ↓
If connected & settings defined:
    ├── setModemPreset()
    ├── setHopLimit()
    └── Update positionBroadcastSecs
    ↓
Save to localStorage
    ↓
Emit 'meshtastic:scenario_changed'
```

#### Mesh Health Calculation
- **Excellent** (90-100): 5+ active nodes with good signal
- **Good** (70-89): 3-4 active nodes
- **Fair** (40-69): 1-2 active nodes
- **Poor** (10-39): Connected but no other nodes
- **Disconnected** (0): Not connected to device

### Events Emitted
- `meshtastic:scenario_changed` - Scenario preset changed
- `meshtastic:canned_messages_updated` - Custom messages set
- `meshtastic:wizard_completed` - First-run wizard completed
- `meshtastic:team_joined` - Joined team via QR/URL

---

## [6.50.0] - 2025-02-01

### Added - Phase 1.5: Store-and-Forward Queue

This release implements offline message queuing for Meshtastic, allowing messages to be composed and queued when the mesh network is unavailable, then automatically sent when connectivity is restored.

#### Store-and-Forward Queue System
- **Automatic queuing** - Messages are queued when device is disconnected or mesh is unavailable
- **Automatic retry** - Queued messages automatically send when connection is restored
- **Exponential backoff** - Failed messages retry with increasing delays to avoid flooding
- **Queue persistence** - Queued messages survive app restarts (saved to localStorage)
- **Queue management** - View queued messages, clear queue, cancel individual messages

#### Message Status Indicators
- **🕐 Queued** - Message waiting in queue (amber)
- **○ Pending** - Message about to send (gray)
- **✓ Sent** - Message sent to mesh (green)
- **✓✓ Delivered** - ACK received from recipient (green)
- **👁 Read** - Read receipt received (blue)
- **✗ Failed** - Send failed after max retries (red)

#### Queue UI Features
- **Queue status banner** - Shows count of queued messages with clear option
- **Status icons** - Each sent message shows current delivery status
- **Offline composition** - Type and queue messages even when disconnected
- **Queue button** - Send button changes to 🕐 when disconnected

### New Functions (MeshtasticModule)
- `getQueueStatus()` - Get queue count, messages, and statistics
- `clearOutboundQueue(markAsFailed)` - Clear all queued messages
- `retryQueuedMessage(messageId)` - Retry a specific queued message
- `cancelQueuedMessage(messageId)` - Cancel a queued message
- `processOutboundQueue()` - Force process the queue
- `checkMeshConnectivity()` - Check mesh network status

### New Constants
- `QUEUE_MAX_SIZE` = 50 messages
- `QUEUE_RETRY_INTERVAL` = 5 seconds
- `QUEUE_MAX_RETRIES` = 5 attempts
- `QUEUE_RETRY_BACKOFF` = 2x multiplier
- `DeliveryStatus.QUEUED` - New status for queued messages

### Changed
- `sendTextMessage()` now queues messages when disconnected instead of failing
- Message input enabled even when disconnected (for offline composition)
- Send button shows 🕐 when disconnected to indicate queuing
- Connection state changes start/stop the queue processor

### Technical Details

#### Queue Processing Flow
```
User sends message
    ↓
Check connectivity
    ↓
Connected? ─────→ Send immediately → Update status to SENT
    ↓ No
Queue message → Status = QUEUED → Save to storage
    ↓
Connection restored
    ↓
Queue processor runs (every 5s)
    ↓
Process ready messages → Send → Update status
    ↓
Success? ─────→ Remove from queue → Status = SENT
    ↓ No
Increment retries → Calculate backoff → Schedule retry
    ↓
Max retries? → Status = FAILED → Remove from queue
```

#### Events Emitted
- `meshtastic:queue_loaded` - Queue loaded from storage
- `meshtastic:message_queued` - Message added to queue
- `meshtastic:queue_full` - Queue reached max capacity
- `meshtastic:queue_message_sent` - Queued message sent successfully
- `meshtastic:queue_message_failed` - Queued message failed max retries
- `meshtastic:queue_message_cancelled` - Queued message cancelled
- `meshtastic:queue_cleared` - Queue cleared

---

## [6.49.0] - 2025-02-01

### Added - Real Meshtastic Device Integration

This release integrates the official `@meshtastic/js` library for real device communication, replacing the placeholder implementation.

#### Real Device Communication
- **@meshtastic/js integration** - Uses official Meshtastic JavaScript library via esm.sh CDN
- **Real BLE connection** - Proper Web Bluetooth communication with device protobuf protocol
- **Real Serial connection** - Proper Web Serial communication with device protobuf protocol
- **Automatic library loading** - Libraries load on-demand from CDN when connecting

#### Device Configuration (Read/Write)
- **Read real config** - Config is now read from actual device (region, modem preset, tx power, hop limit)
- **Write real config** - Configuration changes are sent to and applied on the device
- **Config sync** - Local state automatically syncs with device config

#### Real-time Data
- **Node database sync** - Receives actual node info from mesh network
- **Position updates** - Real positions from mesh nodes with SNR/RSSI
- **Message handling** - Real text messages from mesh network
- **Telemetry data** - Battery level, voltage, channel utilization from devices

### New Files
- `js/modules/meshtastic-client.js` - ES module wrapper for @meshtastic/js library

### Changed
- **connectBluetooth()** - Now uses MeshtasticClient for real BLE communication
- **connectSerial()** - Now uses MeshtasticClient for real Serial communication
- **disconnect()** - Properly disconnects via MeshtasticClient
- **setRegion()** / **setModemPreset()** / **setTxPower()** / **setHopLimit()** - Send real config to device
- **getDeviceConfig()** - Returns real device config when connected
- **requestDeviceConfig()** - Triggers real config refresh from device

### Technical Details

#### Library Integration
The official @meshtastic libraries are loaded from esm.sh CDN:
- `@meshtastic/core@2.6.7` - Core device communication
- `@meshtastic/transport-web-bluetooth@2.6.7` - Web Bluetooth transport
- `@meshtastic/transport-web-serial@2.6.7` - Web Serial transport
- `@meshtastic/protobufs@2.6.7` - Protobuf definitions

#### Callback System
New callback handlers sync MeshtasticClient events with GridDown state:
- `setupMeshtasticClientCallbacks()` - Initializes event handlers
- `syncDeviceConfigFromClient()` - Syncs config to GridDown state
- `handleNodeInfoFromClient()` - Processes node info from mesh
- `handlePositionFromClient()` - Processes position updates
- `handleMessageFromClient()` - Processes text messages

#### Graceful Fallback
If MeshtasticClient is unavailable (offline, library load failure):
- Falls back to basic BLE/Serial connection (limited functionality)
- Config changes are queued and logged for manual verification
- Users are informed to use Meshtastic app for full configuration

### Compatibility Notes
- Requires internet connection on first use to load libraries
- Libraries are cached by browser for subsequent offline use
- Compatible with Meshtastic firmware 2.3.0 and later
- Tested with RAK WisMesh Pocket, T-Beam, Heltec devices

---

## [6.48.0] - 2025-02-01

### Added - Meshtastic Phase 1 Enhancements

#### Device Configuration
- **Region selection** - Configure device region (US, EU 433/868, ANZ, Japan, etc.)
- **Modem preset selection** - Choose from Long Fast, Long Slow, Medium, Short Fast, etc.
- **TX Power adjustment** - Set transmit power from 1-30 dBm or use device default
- **Hop limit configuration** - Set hop limit from 1-7 for mesh relay depth
- **Configuration modal** - New ⚙️ Config button when connected opens settings dialog

#### Signal Quality Display
- **SNR/RSSI per node** - Signal-to-Noise Ratio and Received Signal Strength displayed
- **Signal quality rating** - Excellent/Good/Fair/Poor based on signal metrics
- **Color-coded indicators** - Visual signal strength in team position cards
- **Node signal dashboard** - Comprehensive signal view in config modal

#### Channel URL Import/Export
- **Import channel URLs** - Paste `meshtastic://` or web URLs to import channels
- **Export channel URLs** - Copy channel URL or QR data to share with team
- **Multiple URL formats** - Support for meshtastic://, web URLs, and raw base64

#### Firmware Version Checking
- **Version display** - Shows current firmware version when connected
- **Update status** - Indicates if firmware is current, outdated, or has update available
- **Hardware model detection** - Displays device hardware model (T-Beam, Heltec, RAK, etc.)
- **Capability indicators** - Shows GPS, WiFi, Bluetooth capabilities

### Changed
- **Team position cards** - Now show signal quality badge and SNR/RSSI details
- **Meshtastic connection panel** - Added Config button and Channel URL import section
- **Node info handling** - Captures firmware version, hardware model, and signal data

### Technical Details

#### New Constants Added
- `RegionCode` - 22 region codes matching Meshtastic protobuf
- `ModemPreset` - 8 modem preset options
- `SignalQuality` - Thresholds for excellent/good/fair/poor ratings
- `TxPowerLevels` - Valid TX power values
- `MIN_RECOMMENDED_FIRMWARE` / `LATEST_STABLE_FIRMWARE` - Version checking

#### New Functions Added
- `getDeviceConfig()` / `setRegion()` / `setModemPreset()` / `setTxPower()` / `setHopLimit()`
- `parseChannelUrl()` / `generateChannelUrl()` / `importChannelFromUrl()` / `exportChannelAsUrl()`
- `calculateSignalQuality()` / `formatSignalQuality()` / `getSignalQualityColor()`
- `checkFirmwareStatus()` / `getNodeFirmwareStatus()` / `getMyFirmwareStatus()`
- `getRegionOptions()` / `getModemPresetOptions()` / `getHwModelName()`

---

## [6.47.0] - 2025-01-31

### Added
- **DISCLAIMER.md** - Comprehensive safety and liability disclaimer
  - Navigation and position accuracy warnings
  - Emergency features limitations
  - Medical reference disclaimer
  - Radio compliance requirements
  - Hardware integration caveats
  - Limitation of liability
  - Assumption of risk acknowledgment
  
- **TERMS_OF_SERVICE.md** - Complete terms of service for web app usage
  - License grant details (GPL v3 / Commercial)
  - User responsibilities
  - Privacy summary
  - Third-party service attributions
  - Intellectual property provisions
  - Warranty disclaimers
  - Limitation of liability
  - Indemnification clause
  - Dispute resolution process
  - Export compliance notice

- **SECURITY.md** - Vulnerability disclosure and security policy
  - Supported versions table
  - How to report vulnerabilities (security@blackdot.tech)
  - Response timeline (48hr acknowledgment, severity-based fixes)
  - Safe harbor for security researchers
  - Scope definitions (in-scope vs out-of-scope)
  - Security architecture documentation
  - Known security considerations
  - Security best practices for users

- **APRS Attribution** - Proper crediting across all documentation
  - APRS® registered trademark of Bob Bruninga, WB4APR (SK)
  - Attribution added to: ATTRIBUTIONS.md, README.md, PRIVACY.md, DISCLAIMER.md
  - Module header comment in js/modules/aprs.js with full attribution
  - TAPR (Tucson Amateur Packet Radio) acknowledgment
  - Memorial note for Bob Bruninga (SK February 7, 2022)

### Changed
- **README.md** - Comprehensive update
  - Updated version to 6.47.0 (was incorrectly showing 6.36.0)
  - Added Global Search System documentation (Ctrl+K)
  - Added Situation Wizard documentation (F1)
  - Added Mobile Enhancements documentation (FAB, battery, connection)
  - Updated keyboard shortcuts table
  - Updated file structure with new modules
  - Updated Recent Highlights section
  - Fixed license reference (dual-license, not MIT)
  - Added links to all documentation files
  - Added APRS trademark attribution in APRS Integration section
  - Added APRS/TAPR to Acknowledgments section
  
- **PRIVACY.md** - Expanded and reorganized
  - Added Global Search privacy details
  - Added Situation Wizard privacy details
  - Added Mobile Features privacy table
  - Added Motion Sensors and Vibration permissions
  - Added feature-specific privacy sections
  - Added international users / GDPR section
  - Added third-party privacy policy links
  - Added related documents section
  - Added APRS trademark note
  
- **ATTRIBUTIONS.md** - Added APRS section
  - Full APRS attribution with copyright notice
  - TAPR acknowledgment
  - Link to aprs.org
  - Added to summary table
  - Added to commercial distribution checklist
  
- **js/modules/aprs.js** - Added attribution header
  - Full copyright notice for Bob Bruninga, WB4APR
  - Trademark acknowledgment
  - Links to APRS.org and TAPR
  - Licensing reminder for users

### Documentation Status

| Document | Lines | Status | Purpose |
|----------|-------|--------|---------|
| README.md | 845+ | ✅ Updated | Feature overview and getting started |
| LICENSE | 205 | ✅ Current | Dual license (GPL v3 / Commercial) |
| PRIVACY.md | 395 | ✅ Updated | Data handling practices |
| DISCLAIMER.md | 297 | ✅ NEW | Safety and liability |
| TERMS_OF_SERVICE.md | 369 | ✅ NEW | Usage terms and conditions |
| SECURITY.md | 280 | ✅ NEW | Vulnerability reporting |
| ATTRIBUTIONS.md | 385 | ✅ Updated | Third-party data source licensing |
| CHANGELOG.md | 3,600+ | ✅ Updated | Version history |

## [6.46.0] - 2025-01-31

### Added
- **Situation Wizard** - Decision tree that guides users to relevant features
  
  Stress-friendly guidance system with instant response (no AI delays),
  100% reliable advice (no hallucinations), and complete offline support.
  
  **Access Methods**
  - Press **F1** or **Ctrl+/** anywhere in the app
  - Mobile: FAB menu → **❓ Help Me**
  - Search: `Ctrl+K` → "help", "wizard", "I'm lost", "need help"
  
  **Decision Tree (33 nodes)**
  ```
  What's your situation?
  ├── 🧭 Lost / Need Position
  │   ├── GPS Working → Use locate button
  │   ├── Can See Landmarks → Rangefinder Resection
  │   ├── Can See Sky
  │   │   ├── Daytime → Noon Sight
  │   │   └── Nighttime → Star Navigation
  │   └── None of These → Dead Reckoning
  │
  ├── 🆘 Emergency
  │   ├── Need Rescue → SOS Panel (urgent)
  │   ├── Medical Emergency → Medical Reference
  │   ├── Need to Signal → Mirror/Strobe
  │   └── Need Shelter → Weather + Terrain
  │
  ├── 📡 Need to Communicate
  │   ├── Meshtastic/LoRa → Mesh panel
  │   ├── Ham/GMRS Radio → Radio panel + frequencies
  │   ├── APRS → APRS panel
  │   └── No Radio Equipment → SMS/Satellite tips
  │
  ├── 🗺️ Navigation Help
  │   ├── Follow a Route → Routes panel
  │   ├── Bearing to Point → Compass
  │   ├── Got Off Route → Return guidance
  │   └── Terrain Navigation → Topo maps
  │
  ├── 📋 Trip Planning
  │   ├── Build a Route → Route builder
  │   ├── Logistics/Supplies → Calculator
  │   ├── Contingency Plans → Bail-out points
  │   └── Download Offline Maps → Offline panel
  │
  └── 🌤️ Weather / Environment
      ├── Weather Forecast → Weather panel
      ├── Barometric Pressure → Barometer
      ├── Sun/Moon Times → Celestial panel
      └── Radiation Monitoring → Radiacode
  ```
  
  **Solution Screens Include**
  - Numbered step-by-step instructions
  - **Quick Action** buttons that open relevant panels
  - 💡 **Tips** section with expert advice
  - **Urgent** banner for emergencies (with animation)
  
  **Search Shortcuts**
  | Search Query | Goes To |
  |--------------|---------|
  | "help", "wizard" | Wizard root |
  | "I'm lost", "where am I" | Lost branch |
  | "need help", "emergency" | Emergency branch |
  
  **Mobile FAB Integration**
  The floating action button now includes a **❓ Help Me** option
  that opens the wizard directly.

## [6.45.0] - 2025-01-31

### Added
- **Mobile Enhancements Module**
  
  Low-risk mobile improvements that gracefully degrade on desktop.
  All features use feature detection and CSS media queries to ensure
  zero impact on desktop functionality.
  
  **Floating Action Button (FAB)**
  
  Quick access to essential actions on mobile devices:
  ```
  ┌─────────────────────────────┐
  │                         🔍  │ ← Search
  │                         📍  │ ← Add Waypoint  
  │                         🧭  │ ← Compass
  │                         🆘  │ ← Emergency SOS
  │                         ⚡  │ ← FAB Trigger
  └─────────────────────────────┘
  ```
  - Tap ⚡ to expand menu
  - Tap outside or press Escape to close
  - SOS action triggers warning haptic
  - Hidden on screens wider than 768px
  
  **PWA Install Prompt**
  
  Smart banner prompts users to install GridDown:
  - Appears 30 seconds after first use
  - Respects dismissal for 7 days
  - Detects if already installed (standalone mode)
  - Shows success toast on install
  
  **Battery Status Indicator**
  
  Real-time battery monitoring in top-right corner:
  - Shows percentage and charging status
  - 🔋 Normal | 🪫 Low (<20%) | 🔌 Charging
  - Critical warning toast at 10%
  - Updates on level/charging changes
  - Gracefully hidden if Battery API unavailable
  
  **Connection Status Indicator**
  
  Network status display:
  - 📶 Online | 📵 Offline | 📶 Slow (2G)
  - Toast notifications on connection changes
  - Haptic feedback on reconnection
  - Uses Network Information API when available
  
  **Enhanced Haptic Feedback**
  
  Consistent vibration patterns across the app:
  | Pattern | Duration | Use Case |
  |---------|----------|----------|
  | tap | 10ms | Button taps |
  | success | 10-50-10ms | Confirmations |
  | warning | 30-50-30ms | Alerts, SOS |
  | error | 50-30-50-30-50ms | Errors |
  | navigation | 20ms | Turn guidance |
  
  Can be disabled via `MobileModule.setHapticEnabled(false)`
  
  **Desktop Safety Guarantees**
  
  | Feature | Desktop Behavior |
  |---------|------------------|
  | FAB | `display: none` via CSS |
  | Status indicators | `display: none` via CSS |
  | Install prompt | Event never fires on desktop browsers |
  | Battery API | Returns early if unavailable |
  | Vibrate API | No-op if unavailable |
  | Touch detection | Returns false on desktop |

## [6.44.0] - 2025-01-31

### Added
- **Phase 7: Help/Settings Search**
  
  Search for help topics and settings directly from the command palette (Ctrl+K).
  
  **Help Topics (20 topics)**
  
  | Category | Topics |
  |----------|--------|
  | Navigation | GPS & Location, Offline Maps, Route Navigation |
  | Celestial | Celestial Navigation, Star Identification, Resection |
  | Communication | Radio Frequencies, Meshtastic, APRS Tracking |
  | Emergency | Emergency SOS, SARSAT Beacons |
  | Tools | Distance Measurement, Compass Bearing, Waypoints |
  | Weather | Weather Information, Barometer |
  | Data | Import GPX/KML, Export Data |
  | General | Keyboard Shortcuts, Night Mode |
  
  **Settings Options (15 settings)**
  
  | Setting | Action |
  |---------|--------|
  | Night Mode | Toggle red night vision mode |
  | Units | Switch metric/imperial |
  | Coordinate Format | Cycle DMS/Decimal/DDM |
  | Map Layer | Change base layer |
  | GPS Accuracy | Show/hide accuracy circle |
  | Track Position | Auto-follow position |
  | Sound Effects | Toggle sounds |
  | Clear All Data | Factory reset (with confirm) |
  | Export All Data | Backup as JSON |
  | Bluetooth Devices | Manage connections |
  
  **Usage Examples**
  ```
  Ctrl+K → "gps" → ❓ GPS & Location (Help)
  Ctrl+K → "night" → 🌙 Night Mode (Setting)
  Ctrl+K → "export" → 📤 Export All Data
  Ctrl+K → "keyboard" → ⌨️ Keyboard Shortcuts
  ```

- **Phase 8: Favorites System**
  
  Pin frequently used items to access them instantly when opening search.
  
  **Adding Favorites**
  - **Ctrl+D** while result is selected to toggle favorite
  - Click the ☆ star button on any search result
  - Favorited items show ★ indicator
  
  **Favorites Panel**
  When opening search (Ctrl+K) with no query, favorites appear first:
  ```
  ┌─────────────────────────────────────────┐
  │ ⭐ Favorites                   [Clear All] │
  │ ┌─────────────────────────────────────┐ │
  │ │ 📍 Basecamp Alpha         × │ │
  │ │ ⭐ Polaris (star)          × │ │
  │ │ ⚡ Add Waypoint            × │ │
  │ └─────────────────────────────────────┘ │
  ├─────────────────────────────────────────┤
  │ 🕐 Recent Searches            [Clear] │
  │ waypoint  polaris  route              │
  └─────────────────────────────────────────┘
  ```
  
  **Features**
  - Up to 20 favorites stored
  - Click favorite to instantly activate
  - Hover to reveal remove (×) button  
  - Clear All button to reset favorites
  - Persists across sessions (localStorage)
  - Works with all search categories:
    - Actions, Waypoints, Routes
    - Celestial bodies, Landmarks
    - Help topics, Settings
  
  **Enhanced Search Results**
  - Star button (☆/★) on each result
  - Favorited results have subtle gold highlight
  - Favorite badge (★) in result title

## [6.43.0] - 2025-01-31

### Added
- **Landmark Pack Search System**
  
  Search and use geographic landmarks from public domain databases for navigation
  and rangefinder resection. All data sources are US Federal Government works,
  which are not eligible for copyright (17 USC § 105).
  
  **Legal Status**
  - All landmark data is PUBLIC DOMAIN (US Government works)
  - No attribution required (though provided as good practice)
  - Commercial use permitted without restriction
  - Zero legal risk for distribution or sale
  
  **Data Sources**
  
  | Source | Data Type | Example |
  |--------|-----------|---------|
  | USGS GNIS | Peaks, summits, features | Mount Whitney (4,421m) |
  | FAA DOF | Towers, antennas | Sutro Tower (298m) |
  | NGS | Survey benchmarks | High-precision markers |
  | USFS | Fire lookouts | Keller Peak Lookout |
  
  **Landmark Types**
  
  | Type | Icon | Use Case |
  |------|------|----------|
  | Summit/Peak | 🏔️ | Resection, navigation |
  | Tower | 📡 | Resection (known height) |
  | Survey Marker | 📍 | Precision positioning |
  | Fire Lookout | 🔭 | Resection, emergency |
  | Dam | 🌊 | Navigation reference |
  | Bridge | 🌉 | Navigation reference |
  
  **Search Integration (Ctrl+K)**
  ```
  Ctrl+K → "whitney" → 🏔️ Mount Whitney (4,421m • USGS GNIS)
  Ctrl+K → "tower" → 📡 Shows nearby towers
  Ctrl+K → "l:peak" → Filter to landmarks only
  ```
  
  **Landmark Actions**
  When you select a landmark, an action modal appears with:
  - 🗺️ **Show on Map** - Center map on landmark
  - 📐 **Add to Resection** - Use for rangefinder position fix
  - 📍 **Save as Waypoint** - Add to your waypoints
  - 📋 **Copy Coordinates** - Copy lat/lon to clipboard
  
  **Rangefinder Resection Integration**
  Landmarks can be directly added to the resection calculator:
  1. Search for a visible peak or tower
  2. Click "Add to Resection"
  3. Take bearing/distance measurement
  4. Repeat for 2-3 landmarks
  5. Calculate position fix
  
  **Offline Landmark Packs**
  Available packs (coming soon):
  - California Peaks (847 summits, 95KB)
  - California Towers (2,134 towers, 180KB)
  - Nevada Peaks (412 summits, 48KB)
  - Colorado 14ers & Peaks (634 summits, 72KB)
  - Western Fire Lookouts (523 lookouts, 58KB)
  
  **GPX Import**
  Import custom landmarks from GPX files:
  ```javascript
  LandmarkModule.importFromGPX(gpxContent);
  ```
  
  **Sample Data Included**
  21 sample landmarks are pre-loaded for demo:
  - 10 California peaks (Whitney, Shasta, etc.)
  - 3 Nevada peaks (Boundary, Wheeler, Charleston)
  - 3 FAA towers (Sutro, Mt Wilson, etc.)
  - 2 Fire lookouts
  - 2 NGS benchmarks

## [6.42.0] - 2025-01-31

### Added
- **Contextual Suggestions for Global Search**
  
  When opening search (Ctrl+K) with no query, the interface now shows intelligent
  contextual suggestions based on current conditions and recent activity.
  
  **Suggestion Categories**
  
  | Category | Examples | Priority |
  |----------|----------|----------|
  | ⚠️ **Alerts** | Weather alerts, offline status | Highest (110) |
  | ⭐ **Now Visible** | Visible stars/planets/Moon with altitude | High (50-90) |
  | 🧭 **Navigation** | Active route, active hike, GPS status | High (85-100) |
  | 🕐 **Recent** | Recently used actions | Medium (35-40) |
  
  **Celestial Suggestions**
  - Automatically detects visible celestial bodies
  - Shows current altitude and azimuth
  - Only suggests bodies >15° above horizon (well visible)
  - Checks: Sirius, Vega, Arcturus, Capella, Polaris, Betelgeuse
  - Checks planets: Venus, Jupiter, Mars, Saturn
  - Checks Moon visibility
  
  **Navigation Suggestions**
  - Shows active route with progress percentage
  - Shows active hike with duration and distance
  - Suggests rangefinder resection when GPS signal is weak
  
  **Alert Suggestions**
  - Weather alerts from WeatherModule
  - Offline mode indicator
  
  **Quick Actions Grid**
  - 4 one-tap action buttons: Add Waypoint, Measure, Compass, Stars
  - Accessible even without typing
  
  **Recent Actions Tracking**
  - Tracks which actions you use frequently
  - Persists across sessions via localStorage
  - Shows "Used X min/hours/days ago"
  
  **Usage**
  ```
  Ctrl+K (with empty search) →
  ┌─────────────────────────────────────────┐
  │ ⚠️ Alerts                               │
  │   🌤️ Weather Alert: Winter Storm Watch  │
  ├─────────────────────────────────────────┤
  │ ⭐ Now Visible                          │
  │   ⭐ Sirius - Alt 32° Az 180°           │
  │   🪐 Jupiter - Alt 45° Az 220°          │
  │   🌙 Moon - Alt 28° Az 90°              │
  ├─────────────────────────────────────────┤
  │ 🧭 Navigation                           │
  │   🧭 Continue: Summit Trail (45% done)  │
  ├─────────────────────────────────────────┤
  │ 🕐 Recent                               │
  │   📍 Add Waypoint - Used 2 hours ago    │
  │   📏 Measure Distance - Used yesterday  │
  ├─────────────────────────────────────────┤
  │ [📍 Add] [📏 Measure] [🧭 Compass] [⭐] │
  └─────────────────────────────────────────┘
  ```

## [6.41.0] - 2025-01-31

### Added
- **Enhanced Fuzzy Matching for Global Search**
  
  The global search (Ctrl+K) now features intelligent fuzzy matching that tolerates
  typos, supports initials, and ranks results more accurately.
  
  **Matching Strategies (in priority order)**
  
  | Strategy | Example Query | Example Match | Score Range |
  |----------|---------------|---------------|-------------|
  | Exact | `eagle creek` | "Eagle Creek" | 100 |
  | Prefix | `eagle` | "Eagleton" | 80-90 |
  | Word-prefix | `eagle` | "Eagle Creek" | 80-85 |
  | Typo tolerance | `bsaecamp` | "Basecamp Alpha" | 35-75 |
  | Word boundary | `eagle trail` | "Eagle Creek Trail" | 50-80 |
  | Initials | `ec` | "Eagle Creek" | 70 |
  | Contains | `gle` | "Eagle Creek" | 40-55 |
  | Subsequence | `egc` | "Eagle Creek" | 25-45 |
  
  **Typo Tolerance**
  - Uses Levenshtein distance algorithm
  - Allows 1 typo for words ≤4 chars
  - Allows 2 typos for words 5-6 chars
  - Allows 3 typos for words 7+ chars
  - Common typos now find results: `bsaecamp` → "Basecamp", `polarus` → "Polaris"
  
  **Initials Matching**
  - Two-letter queries match word initials: `ec` → "Eagle Creek"
  - Supports 2-6 letter initial queries
  - Works with multi-word names: `nyc` → "New York City"
  
  **Word Boundary Detection**
  - Handles spaces, camelCase, snake_case, kebab-case
  - Multi-word queries require all words to match
  - `eagle trail` finds "Eagle Creek Trail" but not "Eagle Creek"
  
  **Improved Ranking**
  - Word-prefix matches rank with prefix matches
  - Typo matches score based on similarity ratio
  - Position penalty for mid-string matches
  - All match types properly ordered for intuitive results

## [6.40.0] - 2025-01-31

### Added
- **Enhanced Global Search - Actions & Celestial Bodies**
  
  The global search (Ctrl+K) is now a powerful command palette supporting quick actions
  and celestial body search in addition to existing waypoint/route search.
  
  **New Search Categories**
  - ⚡ **Actions** - Execute commands directly from search
  - ⭐ **Celestial** - Search stars, planets, Sun, and Moon
  
  **Action Commands (25+ commands)**
  - Waypoint: Add Waypoint, Add Waypoint Here
  - Routes: Create Route, Start/Stop Navigation
  - Tools: Measure Distance, Take Bearing, Rangefinder Resection
  - Celestial: Star Chart, Star ID, Camera Sextant, Start Observation
  - Maps: Download Offline Maps, Change Map Layer
  - Weather: Check Weather, Satellite Weather
  - Comms: Communication Plan, Emergency SOS
  - Hiking: Start Hike, Stop Hike
  - View: Center on Position, Reset Map North
  - Settings: Toggle Night Mode, Keyboard Shortcuts
  
  **Celestial Body Search**
  - 18 navigation stars with constellation, magnitude, and keywords
  - 4 planets (Venus, Mars, Jupiter, Saturn)
  - Sun and Moon
  - Live position display (altitude/azimuth) when available
  - Searchable by name, constellation, or keywords (e.g., "north star", "orion", "summer triangle")
  
  **Usage Examples**
  ```
  Ctrl+K → "add waypoint" → Creates new waypoint
  Ctrl+K → "polaris" → Shows Polaris with current position
  Ctrl+K → "measure" → Activates distance measurement
  Ctrl+K → "sos" → Opens emergency SOS panel
  Ctrl+K → "vega" → Shows Vega: Lyra • Mag 0.0 • Alt 45° Az 320°
  ```
  
  **Category Shortcuts**
  - `a` - Actions only
  - `s` - Celestial (stars) only
  - `w` - Waypoints only
  - `r` - Routes only
  - `t` - Team members only
  - `f` - Frequencies only
  - `c` - Coordinates only

## [6.39.0] - 2025-01-31

### Added
- **Rangefinder Resection - GPS-Denied Position Fixing**
  
  Calculate your position without GPS using distance measurements to known landmarks.
  Works with any rangefinder (laser, optical) or even estimated distances.
  
  **Features**
  - Add landmarks from waypoints or by tapping on map
  - Enter measured distances in meters
  - Real-time GDOP (Geometric Dilution of Precision) indicator
  - Trilateration algorithm calculates position from 3+ measurements
  - Accuracy estimation with 95% confidence interval
  - Residual analysis showing per-landmark measurement errors
  - Apply calculated position to map
  
  **Technical Details**
  - Gauss-Newton nonlinear least squares solver
  - Local ENU coordinate conversion for numerical stability
  - Haversine distance calculations for geographic accuracy
  - GDOP quality ratings: Excellent (<2), Good (<4), Moderate (<6), Poor (>6)
  
  **Real-World Use Cases**
  - Wildfire evacuation when GPS is degraded by smoke
  - Canyon/mine environments with no satellite visibility
  - Electronic warfare scenarios with GPS jamming
  - Backup navigation for SAR teams
  
  **Location**
  Navigation Panel → GPS-Denied Position section
  
  **Workflow**
  1. Add 3+ landmarks (known points visible from your position)
  2. Measure distance to each with any rangefinder
  3. Enter distances into GridDown
  4. Calculate position fix
  5. Apply to map

## [6.38.0] - 2025-01-31

### Added
- **Star Identification (Phase 8e) - Augmented Reality Star Finding**
  
  Point your phone at the night sky to automatically identify stars and celestial bodies.
  
  **Features**
  - Real-time star identification using device orientation sensors
  - Visual overlay showing star names, magnitudes, and constellations
  - Automatic identification of 57 navigation stars, 4 planets, and the Moon
  - Brightness-scaled star markers with constellation labels
  - Selection highlighting with tap-to-select functionality
  - Recommended targets list sorted by observation suitability
  
  **Technical Details**
  - Uses DeviceOrientationEvent for camera pointing direction
  - Compass heading (alpha) for azimuth direction
  - Pitch angle (beta) for altitude calculation
  - Gnomonic projection for screen coordinate mapping
  - 60° horizontal × 45° vertical field of view estimation
  - Real-time sensor smoothing with circular averaging for compass
  
  **Smart Recommendations**
  - Scores stars by: brightness, altitude, azimuth spread
  - Prefers mid-altitude (30-60°) for easier observation
  - Highlights first-magnitude navigation stars
  - Always recommends Moon and visible planets
  - Provides observation reasoning for each target
  
  **Integration**
  - Located in Celestial panel → Tools tab
  - "Observe This Object" button pre-selects body in Observe tab
  - Works alongside Camera Sextant for complete workflow
  - Shares observer position with other celestial tools

## [6.37.0] - 2025-01-31

### Added
- **Camera Sextant (Phase 8c) - Emergency Celestial Navigation**
  
  Use your phone's camera and sensors to measure celestial body altitudes without specialized equipment.
  
  **Features**
  - Real-time altitude measurement using device orientation sensors
  - Live camera view with crosshairs for body targeting
  - Bubble level indicator for accurate measurements
  - Horizon calibration for improved accuracy
  - Multi-sample averaging for better precision
  - Direct integration with celestial observation workflow
  
  **Technical Details**
  - Uses DeviceOrientationEvent for pitch angle (altitude)
  - Uses accelerometer for gravity reference and level detection
  - Estimated accuracy: ±1-2° (vs 0.1° for real sextant)
  - Supports horizon calibration to reduce systematic errors
  - Real-time smoothing with configurable sample window
  
  **Usage**
  1. Open Celestial panel → Observe tab
  2. Click "Start Camera Sextant"
  3. Point phone at horizon, tap "Calibrate Horizon"
  4. Point at celestial body, level the bubble
  5. Tap "Capture Altitude" to record measurement
  6. Click "Use This Measurement" to populate observation form
  
  **Accuracy Guidance**
  - Best accuracy: calibrated, level bubble, stable hold
  - Normal accuracy: ~1.5° (90 nautical miles position error)
  - Poor conditions: ~2.5° when moving or uncalibrated
  - Multiple captures and averaging improves precision
  
  **Emergency Value**
  - Works with no sextant, no GPS, just a smartphone
  - Suitable for rough position estimation in survival situations
  - Combine with noon sight or Polaris for latitude fix

### Changed
- Reorganized Observe tab to prominently feature Camera Sextant
- Manual observation section renamed for clarity

## [6.26.2] - 2025-01-31

### Fixed
- Fixed "ModalsModule.showModal is not a function" error when starting a hike
- Replaced ModalsModule.showModal call with custom inline modal implementation
- Modal now properly styled with dark theme and functional cancel/start buttons

## [6.26.1] - 2025-01-31

### Fixed
- Fixed missing `renderPaceSelector` function that caused HikingModule initialization failure
- Removed duplicate `getFlatSpeed` function definition

## [6.26.0] - 2025-01-31

### Added
- **Turnaround Time Alerts - Safety Critical Feature**
  
  **Active Hike Management**
  - Start/stop hike tracking with configurable parameters
  - Set target distance, elevation gain/loss, out-and-back mode
  - Automatic turnaround time calculation based on daylight
  - Real-time elapsed time and distance tracking
  - Hike summary on completion
  
  **Alert System**
  - Progressive warnings at 30, 15, and 5 minutes before turnaround
  - Critical alert when turnaround time is reached
  - Emergency alerts every 5 minutes if past turnaround
  - Integrates with AlertModule for banners, sounds, push notifications
  - Visual status indicator: green (ok), yellow (turn soon), red (turn back!)
  
  **Configuration Options**
  - Enable/disable turnaround alerts
  - Configurable warning intervals
  - Sound alerts toggle
  - Safety margin setting (default 30 min before sunset)

- **Enhanced Hiking Breadcrumb Trail**
  
  **Speed-Colored Trail Visualization**
  - Red: Slow/stopped (< 1 mph)
  - Orange: Walking pace (1-2 mph)  
  - Green: Moderate hiking (2-3 mph)
  - Blue: Fast hiking (> 3 mph)
  
  **Trail Features**
  - Distance markers every 0.25 miles
  - Start point marker (green "S")
  - Pulsing current position indicator
  - Up to 500 trail points stored
  - Cumulative distance tracking per point
  - Elevation data capture when available
  
  **Trail Statistics**
  - Total distance covered
  - Duration and average speed
  - Elevation gain/loss from GPS
  - Point count
  
  **UI Integration**
  - Active Hike widget in Navigation panel
  - Start Hike modal with parameter configuration
  - Trail legend showing speed colors
  - Real-time stats display (distance, gain, speed)
  - Turnaround countdown with color-coded urgency

## [6.25.0] - 2025-01-31

### Added
- **HikingModule: Hiking Time Estimates & Daylight Tracking**
  
  **Hiking Time Estimation**
  - Dual algorithm approach using Naismith's Rule and Tobler's Hiking Function
  - Accounts for elevation gain AND loss (steep descents slow you down too)
  - Rest stop calculations (configurable intervals and duration)
  - Four pace presets: Slow/Heavy Pack (2.0 mph), Moderate (2.5 mph), Fast/Light (3.0 mph), Trail Runner (4.5 mph)
  - Custom speed override option
  - Moving time vs total time breakdown
  - Average pace display (min/mi)
  
  **Daylight Tracking**
  - Real-time daylight remaining calculation using SunMoonModule
  - Visual progress bar showing day progression
  - Sunrise/sunset times display
  - "Usable daylight" calculation (includes safety margin)
  - Color-coded status: green (>3h), yellow (1-3h), red (<1h)
  
  **Turnaround Calculator**
  - For out-and-back hikes: calculates when to turn around
  - Accounts for return trip being different (reversed elevation)
  - Shows latest safe start time
  - Maximum one-way distance with remaining daylight
  - Smart warnings: critical (after sunset), warning (minimal margin)
  
  **UI Integration**
  - Route elevation profile now shows hiking time estimates
  - Pace selector with instant recalculation
  - Daylight widget in Navigation panel
  - Turnaround calculator for routes under 20 miles
  
  **Settings**
  - Configurable safety margin (default 30 minutes before sunset)
  - Rest stop interval (default every 60 minutes)
  - Rest stop duration (default 10 minutes)
  - Include/exclude rest stops toggle

## [6.24.0] - 2025-01-31

### Added
- **Phase 4: AQI Alert System Integration** - Complete monitoring and alert system for air quality
  
  **AlertModule (New)**
  - Centralized alert management system for all GridDown alerts
  - Multiple severity levels: Info, Caution, Warning, Critical, Emergency
  - Persistent banner notifications for critical/emergency alerts
  - Push notification support (requires permission)
  - Alert sound effects (Web Audio API)
  - Alert history with filtering by source/severity
  - Click-to-dismiss banners
  - Events integration (`alert:triggered` event)
  
  **AQI Monitoring**
  - Background monitoring at configurable intervals
  - Current GPS location monitoring (default: every 30 minutes)
  - All waypoints monitoring (default: every 60 minutes)
  - Automatic state restoration on app restart
  - Manual "Check Now" button for immediate scan
  
  **Configurable Alert Thresholds**
  - Caution: 101+ (Unhealthy for Sensitive Groups)
  - Warning: 151+ (Unhealthy)
  - Critical: 201+ (Very Unhealthy)
  - Emergency: 301+ (Hazardous)
  - User-adjustable via Weather panel settings
  - Sensitive Groups mode lowers thresholds by 50 points
  
  **AQI Forecasts**
  - Fetches next-day AQI forecast from AirNow API
  - Forecast alerts for poor air quality expected tomorrow
  - Toggle to enable/disable forecast alerts
  
  **Weather Panel UI**
  - New "AQI Alerts & Monitoring" section
  - Monitoring ON/OFF toggle
  - Threshold configuration inputs
  - Alert history display (last 5 alerts)
  - Push notification enable button
  - Sensitive groups and forecast alerts checkboxes

## [6.23.5] - 2025-01-31

### Fixed
- **AQI Map Overlay Refresh**: Stations now update when panning/zooming the map
  - Added MapModule.onMoveEnd() callback system for map movement events
  - AQI layer subscribes to move events and refreshes stations automatically
  - Debounced (300ms) to prevent excessive API calls during continuous panning

- **Toast Notifications**: Now dismissible by tap/click
  - All toasts can be dismissed immediately by tapping
  - Added cursor pointer to indicate clickability
  - AQI station popup toast reduced from 8s to 4s duration
  - Simplified station popup display (removed verbose guidance text)
  - Added "Tap to dismiss" hint

## [6.23.4] - 2025-01-31

### Fixed
- **AQI Map Overlay**: Rewrote to use GridDown's native canvas-based map renderer
  - Previous version incorrectly tried to use Leaflet which is not available
  - Now uses MapModule's new overlay marker system
  - Station markers render correctly on the canvas map
  - Click handling shows station details in toast popup

### Added
- **MapModule Overlay Markers API**: New system for external modules to add custom markers
  - `MapModule.addOverlayMarkers(layerId, markers, options)` - Add marker layer
  - `MapModule.updateOverlayMarkers(layerId, markers)` - Update markers
  - `MapModule.removeOverlayMarkers(layerId)` - Remove layer
  - `MapModule.hasOverlayMarkers(layerId)` - Check if layer exists
  - Supports custom colors, values displayed in markers, click handlers
  - Used by AQI stations, extensible for other overlay types

## [6.23.3] - 2025-01-31

### Added
- **API Keys Settings Section**: New settings panel section for configuring external service API keys
  - AirNow (Air Quality) API key configuration
  - Visual status indicator showing if key is configured
  - Secure password-style input field
  - Direct link to get free API key (instant approval)
  - Enter key support for quick save

### Fixed
- AQI features now have accessible configuration UI instead of requiring console/code

## [6.23.2] - 2025-01-31

### Added
- **AQI Map Overlay (Phase 3)**: Interactive map layer showing air quality monitoring stations
  - **Toggle Button**: "Show AQI Stations" button in Weather panel under Satellite & Radar section
  - **Station Markers**: Color-coded circle markers at each EPA AirNow monitoring station
    - Shows real-time AQI value inside each marker
    - Colors match EPA standard AQI categories (green/yellow/orange/red/purple/maroon)
  - **Interactive Tooltips**: Hover over any marker to see:
    - Current AQI value
    - AQI category (Good, Moderate, USG, Unhealthy, etc.)
    - Primary pollutant being measured
    - Reporting area name
  - **Detailed Popups**: Click any marker for full details:
    - Large AQI badge with category
    - Location information
    - Health guidance for current conditions
    - Observation timestamp
  - **Dynamic Loading**: Stations automatically load/refresh as you pan the map
  - **Coverage Legend**: Color key showing all AQI categories when layer is active
  
### Enhanced
- AirQualityModule extended with map layer management functions:
  - `addMapLayer()` / `removeMapLayer()` - Add/remove station overlay
  - `toggleMapLayer()` - Toggle visibility
  - `refreshMapLayer()` - Manually refresh station data
  - `isMapLayerVisible()` - Check layer status
  - `fetchStationsInBounds()` - Fetch stations for any bounding box

### Technical Notes
- Stations cached for 30 minutes to reduce API calls
- Map movement debounced (500ms) to avoid excessive requests
- Maximum 100-mile radius per fetch to manage response size
- Leaflet circleMarker + divIcon combo for markers with labels

## [6.23.1] - 2025-01-31

### Added
- **AQI at Waypoints/Routes (Phase 2)**: Extended Air Quality Index integration
  - **Waypoint Weather**: Click any waypoint to see weather AND AQI together
    - Visual AQI badge with EPA-standard color coding
    - Icon changes to air quality warning if AQI > 100 (Unhealthy for Sensitive Groups)
  - **Route Weather Analysis**: AQI now included for all route points
    - Each point shows color-coded AQI badge alongside weather
    - Points with poor AQI get highlighted border
    - AQI alerts automatically added to route alerts section
      - Caution (AQI 101-150): Unhealthy for Sensitive Groups
      - Warning (AQI 151-200): Unhealthy
      - Critical (AQI > 200): Very Unhealthy/Hazardous
    - Alerts include health guidance recommendations

### Enhanced
- Waypoint weather cards now show visual AQI badge (not just text)
- Route analysis button shows "Checking air quality..." status during AQI fetch
- Alerts sorted by severity (critical → warning → caution)

## [6.23.0] - 2025-01-30

### Added
- **Air Quality Index (AQI) Integration**: Added EPA AirNow AQI display to Weather panel
  - Real-time Air Quality Index from EPA AirNow API
  - Color-coded AQI badges with health guidance (Good/Moderate/USG/Unhealthy/Very Unhealthy/Hazardous)
  - Shows primary pollutant (PM2.5, O3, PM10, etc.) when elevated
  - Coverage: United States, Canada, Mexico
  - Graceful fallback for international users (displays "Outside Coverage" message)
  - Separate refresh button for AQI data
  - 1-hour data caching (matches AirNow update frequency)

### New Module
- `js/modules/airquality.js`: AirNow API integration module
  - `AirQualityModule.fetchAQI(lat, lon)` - Fetch AQI for coordinates
  - `AirQualityModule.getMapCenterAQI()` - Get AQI at map center
  - `AirQualityModule.isInCoverageArea(lat, lon)` - Check coverage
  - `AirQualityModule.renderAQIBadge(data)` - Render AQI display HTML
  - `AirQualityModule.setApiKey(key)` - Configure API key

### Documentation
- **ATTRIBUTIONS.md**: Added EPA AirNow attribution requirements
  - Public domain (US Government work)
  - Commercial use permitted
  - Attribution and preliminary data disclaimer required

### Technical Notes
- API key required for AirNow (free registration at docs.airnowapi.org)
- Key stored in localStorage (`airnow_api_key`)
- Module gracefully handles: no API key, outside coverage, no nearby stations, fetch errors
- Service worker updated to cache airquality.js

## [6.22.10] - 2025-01-30

### Documentation
- **README.md**: Updated version to 6.22.9, added NASA GIBS to acknowledgments, updated recent highlights
- **PRIVACY.md**: Fixed license reference (was MIT, now dual GPL v3 + Commercial), added NASA GIBS and IEM to external services table
- **ATTRIBUTIONS.md**: New file documenting all data source licensing requirements
  - Complete licensing summary for all map tile providers
  - Commercial distribution checklist highlighting Esri restrictions
  - Attribution requirements for NASA GIBS, Open-Meteo, Nominatim, etc.

## [6.22.9] - 2025-01-30

### Fixed
- **Weather Overlays - Fixed GIBS URL format**: Corrected NASA GIBS tile URLs
  - Changed time format from ISO timestamp to simple YYYY-MM-DD date
  - Switched from GOES geostationary (complex time handling) to VIIRS/MODIS daily imagery
  - All satellite overlays now working correctly with NASA GIBS

### Changed
- Satellite overlay buttons now show: NEXRAD (US radar), Satellite (VIIRS global), Terra (MODIS)
- Uses yesterday's imagery for complete global coverage (daily products)

## [6.22.8] - 2025-01-30

### Changed
- **Weather Overlays - NASA GIBS Migration**: Replaced RainViewer API with NASA GIBS
  - All satellite imagery now from US Government sources (NASA/NOAA)
  - 100% commercial-safe (public domain with attribution)
  - New buttons: NEXRAD (US radar), GOES IR (infrared), GOES Color (GeoColor)
  - GOES imagery covers Americas with 10-minute updates
  - Added VIIRS Daily product option for global true-color imagery
  - Removed RainViewer and OpenWeatherMap dependencies (licensing restrictions)

### Technical
- GIBS WMTS integration with time-varying support for geostationary imagery
- Automatic time calculation for GOES products (~50 min delay for GIBS latency)
- Daily products use yesterday's date for complete polar orbiter coverage

## [6.22.7] - 2025-01-30

### Changed
- **Weather Overlays**: Removed Clouds button that required API key configuration
  - Now shows 3 buttons that all work without any setup: NEXRAD, Global Radar, IR Satellite
  - Changed from 2x2 grid to 1x3 layout for cleaner appearance
  - Updated attribution text to clarify data sources

## [6.22.6] - 2025-01-30

### Fixed
- **Satellite/Radar Weather Layers**: Fixed 404 errors for weather overlays
  - Iowa State Mesonet GOES satellite tiles have been discontinued
  - Migrated to RainViewer API for global radar and IR satellite imagery
  - Added support for OpenWeatherMap cloud layer (requires API key)
  - NEXRAD composite radar (US) remains available via IEM
  
### Changed
- Weather overlay buttons now show: NEXRAD (US), Global Radar, IR Satellite, Clouds
- Added async handling for RainViewer API data fetching
- Better error messages when weather layers fail to load
- Updated attribution to reflect new data sources

## [6.22.5] - 2025-01-30

### Fixed
- **Route Weather Analysis**: Fixed "Cannot read properties of undefined (reading 'time')" error
  - Added comprehensive validation in `findBestTravelWindows()` function
  - Now properly checks if hourly data exists and has sufficient entries
  - Validates that hourly entries have required `time` property
  - Added null checks for `hour.weather?.severity` access
  - Safely calculates average temperature with proper filtering
  - Gracefully returns empty array when data is insufficient

## [6.22.4] - 2025-01-30

### Fixed
- **SSTV TX Preview Infinite Loop**: Fixed critical bug causing continuous re-renders
  - Added `sstvPreviewDisplayed` flag to track when preview is already shown
  - Added `sstvRestorePending` flag to prevent concurrent restore operations
  - Preview now only restores once after a genuine re-render
  - Removed excessive console logging (Image data stored messages)
  - Significantly improves performance when image is captured

## [6.22.3] - 2025-01-30

### Fixed
- **SSTV Tab Highlighting**: Tab buttons now properly highlight when clicked
  - Added `classList.toggle()` to update active state on tab switch
  - Visual feedback now correctly shows which tab is selected

## [6.22.2] - 2025-01-30

### Fixed
- **SSTV Camera**: Added 1.5s warm-up delay for camera auto-exposure adjustment
  - Fixes dark/underexposed images when using Camera source
  - Allows camera auto-exposure and auto-white-balance to stabilize
  - Added "Initializing camera..." toast notification
  - Improved logging for camera capture process

- **SSTV TX Image Persistence**: Images now persist robustly across all scenarios
  - Added retry logic (5 attempts, 200ms each) if canvas not ready
  - Image data stored immediately on capture and restored after re-renders
  - Added "Loading preview..." placeholder when image is being restored
  - Added ✕ clear button to remove captured image
  - Images persist when switching tabs or changing modes
  - Clear stored image after successful transmission

- **SSTV Tab Variable**: Fixed `sstvCurrentTab` → `sstvActiveTab` typo in openImageForAnnotation()

### Added
- `clearTXPreview()` function to reset TX canvas and stored image

## [6.22.0] - 2025-01-30

### Added
- **Read Receipts** - Optional message seen indicators for DMs
  - Eye icon (👁) shows when recipient has read your message
  - Toggle to enable/disable sending read receipts
  - Automatic read receipts when opening DM conversation
  - New `DM_READ` message type for receipt transmission

- **Message Retry Logic** - Automatic retry for failed messages
  - Exponential backoff: 5s, 15s, 30s delays
  - Up to 3 automatic retry attempts
  - Manual retry button on failed messages (↻)
  - Visual indicators during retry process
  - Events for retry scheduling and completion

- **Key Verification** - Fingerprint-based key verification
  - Human-readable 16-character fingerprints
  - Key verification modal with side-by-side comparison
  - Verified badge (✓) on contacts and conversations
  - Mark/unmark keys as verified
  - Verification status persisted across sessions

- **Message Context Menu** - Right-click actions on messages
  - Copy message text to clipboard
  - Retry failed messages
  - Delete messages (hides from view)
  - Works on both DM and channel messages

### Changed
- Delivery status now includes READ state (pending → sent → delivered → read)
- DM conversation header shows verification status
- Contact list shows verification badges
- Channel messages now support context menu
- setupDMAckTimeout now triggers auto-retry on timeout

### Technical
- MeshtasticModule expanded: 2857 → 3418 lines (+561)
- panels.js expanded: 14329 → 14685 lines (+356)
- New state: readReceiptsEnabled, pendingRetries, deletedMessageIds
- New storage: meshtastic_preferences, meshtastic_deleted
- New events: dm_read, retry_scheduled, retry_sent, message_failed, key_verified, key_unverified, message_deleted, settings_changed

### New API Functions
```javascript
// Read Receipts
MeshtasticModule.isReadReceiptsEnabled()
MeshtasticModule.setReadReceiptsEnabled(enabled)
MeshtasticModule.sendDMReadReceipt(messageId, nodeId)

// Message Retry
MeshtasticModule.retryMessage(messageId)
MeshtasticModule.cancelRetry(messageId)
MeshtasticModule.getRetryInfo(messageId)

// Key Verification
MeshtasticModule.getMyKeyFingerprint()
MeshtasticModule.getPeerKeyFingerprint(nodeId)
MeshtasticModule.markKeyAsVerified(nodeId)
MeshtasticModule.markKeyAsUnverified(nodeId)
MeshtasticModule.isKeyVerified(nodeId)
MeshtasticModule.getKeyVerificationStatus(nodeId)

// Message Management
MeshtasticModule.deleteMessage(messageId, isDM, nodeId)
MeshtasticModule.isMessageDeleted(messageId)
MeshtasticModule.copyMessageText(messageId, isDM, nodeId)
MeshtasticModule.getMessageDetails(messageId, isDM, nodeId)
```

## [6.21.0] - 2025-01-30

### Added
- **Direct Messages (DM)** - End-to-end encrypted 1:1 messaging
  - Dedicated Direct Messages section in Team & Mesh panel
  - PKI (Public Key Infrastructure) using ECDH P-256 curve
  - Automatic key exchange with mesh network nodes
  - AES-256-GCM encryption for all DM content
  - DM conversation threads with delivery status
  - Unread indicators per contact and total DM unread badge

- **PKI Key Management**
  - `generateKeyPair()` - Automatic Curve25519-equivalent key generation
  - `broadcastPublicKey()` - Share your public key with the mesh
  - `requestPublicKey(nodeId)` - Request specific node's key
  - Key persistence across sessions (IndexedDB storage)
  - Visual indicators for key exchange status

- **DM User Interface**
  - Contact list with online status and unread badges
  - Conversation view with encrypted message indicator
  - "New DM" modal for starting conversations
  - Back button to return to contact list
  - Key exchange status on each contact (🔑 Key exchanged / ⚠️ Key needed)

- **New Message Types**
  - `PUBLIC_KEY` - Broadcasting public key to mesh
  - `KEY_REQUEST` - Requesting a node's public key
  - `KEY_RESPONSE` - Responding to key request
  - `DM` - Encrypted direct message
  - `DM_ACK` - DM delivery acknowledgment

### Technical
- MeshtasticModule expanded: 1904 → 2856 lines (+952)
- panels.js expanded: 13965 → 14300 lines (+335)
- Web Crypto API integration (ECDH, AES-GCM)
- New Storage keys: meshtastic_keypair, meshtastic_peer_keys, meshtastic_dm_conversations
- New events: keypair_generated, public_key_received, key_request_timeout, dm_received, dm_ack, dm_updated, active_dm_changed, dm_unread_change

### Security Notes
- Private keys stored encrypted in IndexedDB
- Shared secrets derived per-peer using ECDH
- Messages encrypted with AES-256-GCM (authenticated encryption)
- 12-byte random IV per message
- Keys never transmitted in plaintext

## [6.20.0] - 2025-01-30

### Added
- **Meshtastic Channel Management** - Full channel selection and private channel support
  - Channel selector UI with visual indicators for active channel
  - Support for default channels (Primary, LongFast, LongSlow)
  - Create private encrypted channels with custom Pre-Shared Key (PSK)
  - Random PSK generator for secure key creation
  - Import channels from JSON configuration
  - Export channels for secure sharing with team members
  - Delete custom channels (defaults protected)

- **Message Delivery Status** - Track message delivery through the mesh
  - Pending (⏳) - Queued for sending
  - Sent (✓) - Transmitted to mesh network
  - Delivered (✓✓) - ACK received from recipient
  - Failed (✗) - Send error
  - Automatic ACK responses for received messages
  - 30-second timeout tracking for delivery confirmation

- **Unread Message Indicators** - Never miss a message
  - Per-channel unread count badges on channel buttons
  - Total unread count in Team & Mesh panel header
  - Auto-mark as read when switching to a channel
  - Timestamp-based tracking persisted across sessions

- **Message Persistence** - Messages survive page refresh
  - Last 100 messages saved to IndexedDB
  - Channel assignments preserved
  - Delivery status preserved

### Changed
- Messages now filter by active channel (was showing all)
- Increased message display limit from 10 to 20
- Added encryption status banner (warning for public, confirmation for private)

### Technical
- MeshtasticModule expanded: 1343 → 1904 lines (+561)
- panels.js expanded: 13638 → 13965 lines (+327)
- New state: channels, activeChannelId, messageStates, channelReadState, pendingAcks
- New events: channel_change, channel_created, channel_deleted, message_status, unread_change
- New Storage keys: meshtastic (extended), meshtastic_messages (new)

## [6.19.9] - 2025-01-29

### Added
- **SARSAT Module** - Full integration for COSPAS-SARSAT 406 MHz beacon receiver
  - Support for PLB (Personal Locator Beacon), ELT (Aviation), EPIRB (Maritime), and SSAS (Ship Security)
  - WebSocket and Web Serial connection to external Raspberry Pi-based SDR receiver
  - Real-time beacon tracking and map display with pulsing emergency indicators
  - Country code decoding for 200+ countries (ITU-R M.585 / MID codes)
  - Test beacon filtering option
  - Auto-waypoint creation for received beacons with GPS position
  - Alert sounds for emergency beacons
  - Beacon detail display with hex ID, type, country, signal strength
  - Position history tracking with track tails on map
  
- **SARSAT Panel** - New navigation panel for beacon receiver management
  - Connection status and statistics
  - Emergency beacon alerts with prominent styling
  - Beacon type reference guide
  - Received beacon list with "Go To" navigation
  - Settings: auto-waypoints, alert sounds, test beacon display

### Technical
- New files: `js/modules/sarsat.js`, `docs/sarsat_receiver.py`
- Navigation item added to sidebar
- Map overlay rendering for beacon positions
- Event system integration for real-time updates

### Documentation
- Included Python SDR receiver implementation for Raspberry Pi
- Full DSP chain: Costas loop carrier recovery, Gardner TED, BCH error correction

## [6.19.8] - 2025-01-29

### Fixed
- **SSTV Camera Capture Crash** - Fixed camera failing to capture on some devices:
  - Now properly waits for video metadata to load before capturing
  - Added `playsinline` attribute for iOS Safari compatibility
  - Added 10-second timeout for metadata loading
  - Added dimension validation before creating canvas
  - Better error messages showing actual failure reason

- **SSTV Display Preview Safety** - Added input validation:
  - Checks for valid imageData dimensions before processing
  - Validates SSTV mode exists before accessing properties
  - Try-catch wrapper with user-friendly error toast
  - Console logging for debugging

### Technical
- Camera now requests ideal 640×480 resolution
- Video element set to muted (required for autoplay on some browsers)
- Added `onloadedmetadata` and `onerror` handlers with Promise wrapper

## [6.19.7] - 2025-01-29

### Added
- **SSTV Image Annotation** - Draw on images before transmission:
  - **Toolbar**: Pen, Arrow, Circle, Rectangle, Text, and Eraser tools
  - **Customization**: Color picker and line width selector (Thin/Medium/Thick/Bold)
  - **Actions**: Undo (↩️) and Clear All (🗑️) buttons
  - **Overlay System**: Annotations drawn on transparent layer above base image
  - **Auto-Flatten**: Annotations automatically merged before SSTV transmission
  - **Text Tool**: Input field appears when text tool selected, click to place
  - **Touch Support**: Full touch device compatibility for mobile annotation

- **Annotate from History** - Edit received images:
  - "Annotate & TX" button in received image detail modal
  - Opens image in Transmit tab with annotation tools
  - Non-destructive: original image preserved in history

### Technical
- Annotation canvas overlay with `position: absolute` stacking
- Drawing state: tool, color, width, history stack (20 levels)
- Mouse/touch event handlers with coordinate scaling
- Shape preview during drag (arrow, circle, rectangle)
- `flattenAnnotations()` merges layers via `drawImage()`
- `hasAnnotations()` checks alpha channel for content
- CSS `.sstv-tool-active` class for tool selection feedback

## [6.19.6] - 2025-01-29

### Added
- **SSTV Expandable Windows** - Full-screen viewing for better signal analysis:
  - Expand button (⛶) on both Waterfall Display and Received Image
  - Full-screen modal overlay with dark background
  - Waterfall: Larger 800×300 canvas with live frequency updates
  - Preview: Full-size image display with mode and dimension info
  - Live updates continue in expanded mode during active decoding
  - Close with button, Escape key, or click outside
  - Frequency scale labels in expanded waterfall (SYNC/BLACK/VIS/WHITE)

### Technical
- New functions: `openSSTVExpandedView()`, `closeSSTVExpandedView()`
- Expanded waterfall updates at 50ms intervals with signal quality feedback
- Expanded preview updates at 100ms to track live decode progress
- Colormap rendering shared with inline display
- Keyboard handler (Escape) and click-outside-to-close support

## [6.19.5] - 2025-01-29

### Added
- **Additional SSTV Modes** - Extended mode support:
  - PD-180 (640×496, 180s) - High resolution, longer transmission
  - PD-240 (640×496, 240s) - Maximum quality PD mode
  - PD-290 (800×616, 290s) - Highest resolution PD mode
  - Wraase SC2-180 (320×256, 180s) - Sequential RGB format
  
- **Frequency Drift Compensation** - Automatic correction for transmitter drift:
  - Real-time sync pulse frequency tracking
  - Auto-compensation based on measured vs expected 1200 Hz sync
  - Manual drift adjustment slider (±50 Hz)
  - Confidence indicator and measurement counter
  - Low-pass filtering for stable drift estimates
  - Reset functionality for fresh calibration

- **RGB Color Mode Support** - Full encoder/decoder for Wraase SC2 format:
  - Sequential R-G-B channel encoding/decoding
  - Proper sync timing for SC2 format

### Improved
- Decoder now records sync pulse times for DSP slant analysis
- Image completion applies auto-slant correction when enabled
- Drift compensation applied during YCrCb, GBR, and RGB decoding

### Technical
- Added `getFrequencyDriftCompensation()` to DSP module
- Added `recordSyncFrequency()` for drift tracking
- Added `getDriftAnalysisStatus()` for UI updates
- Goertzel algorithm for precise sync frequency measurement

## [6.19.4] - 2025-01-29

### Added
- **SSTV Waterfall Display** - Real-time spectrogram visualization for SSTV signals:
  - Frequency range 1100-2400 Hz (SSTV band)
  - Four colormaps: Viridis, Plasma, Thermal, Grayscale
  - Live frequency markers for SYNC, BLACK, VIS, WHITE
  - Dominant frequency display with amplitude
  - Signal quality analysis with tuning guidance

- **SSTV Auto-Slant Correction** - Automatic image skew correction:
  - Sync pulse timing analysis for drift detection
  - Image-based slant detection using edge tracking
  - Manual correction slider (±5%)
  - Expected vs measured line time display
  - Per-mode timing configuration

### Technical
- New `sstv-dsp.js` module (822 lines) for advanced signal processing
- `SSTVModule._getAudioState()` exposes audio context for DSP integration
- Event-driven slant analysis updates via `sstv:slantAnalysis`
- FFT-based frequency analysis using Web Audio AnalyserNode

## [6.19.3] - 2025-01-29

### Fixed
- **SSTV Module Storage Error** - Fixed `Storage.get is not a function` error by using correct `Storage.Settings.get()` and `Storage.Settings.set()` API for history persistence

## [6.19.2] - 2025-01-29

### Added
- **SSTV AI Enhancement Module** - Comprehensive neural network-based image enhancement:
  - **Upscaling**: 2× and 4× upscaling using Real-CUGAN/Real-ESRGAN ONNX models
  - **Denoising**: SCUNet and NAFNet support for radio interference removal
  - **Face Enhancement**: Optional GFPGAN support for portrait images
  - **OCR Text Extraction**: 
    - Tesseract.js loaded from CDN on demand (~3MB)
    - Callsign detection (amateur radio formats)
    - Maidenhead grid square extraction
    - Coordinate parsing (decimal degrees and DMS)
  - **Lightweight Architecture** - Models NOT bundled (~600KB total app size):
    - Users download ONNX models separately from official sources
    - Comprehensive download links and instructions in UI
    - Models stored in IndexedDB for offline reuse
  - **Model Registry with Download Sources**:
    - Real-CUGAN 2× (2.9MB) - Recommended for SSTV noise patterns
    - Real-ESRGAN 2× (6.5MB) and 4× (16.7MB)
    - SCUNet (9.2MB) and NAFNet (8.4MB) for denoising
    - GFPGAN (348MB) for face restoration
  - **WebGPU Acceleration**: 5-10× faster when supported (WASM fallback)
  - **Processing Pipelines**:
    - Quick (2× upscale only)
    - Standard (denoise + 2× upscale)
    - Quality (denoise + 4× upscale)
    - Full (denoise + 4× + face + OCR)
  - **Enhanced UI**:
    - Model import/export with progress tracking
    - Processing tips and recommendations
    - Clear all models option with confirmation
    - Installed models status display

### Technical
- ONNX Runtime Web 1.17.0 loaded from CDN
- Tile-based processing (512px default) for memory efficiency
- Progress events: `sstvEnhance:progress` (legacy) and `sstvai:progress` (new)
- CHW tensor format for ONNX model compatibility
- Graceful degradation when models unavailable

## [6.19.1] - 2025-01-29

### Fixed
- Minor service worker cache versioning

## [6.19.0] - 2025-01-29

### Added
- **SSTV Module** - Slow Scan Television integration for amateur radio image transmission:
  - **Receive Support**: Decode SSTV signals from radio audio input
    - Robot36, Robot72 modes
    - Martin M1, M2 modes
    - Scottie S1, S2 modes
    - PD-90, PD-120 modes
    - Auto VIS code detection
    - Real-time decode progress display
    - Signal strength meter
  - **Transmit Support**: Encode and transmit images via audio output
    - All supported modes available
    - Camera capture integration
    - Gallery image selection
    - Map view capture for tactical sharing
    - Automatic callsign overlay
    - Grid square auto-calculation from GPS
  - **DSP Implementation**: 
    - Goertzel algorithm for efficient frequency detection
    - VIS code encoding/decoding
    - YCrCb and GBR color mode support
  - **Image History**: Store and manage received images
  - **Settings Panel**: Callsign, grid square, default mode, audio settings
  - **Legal Compliance**: License acknowledgment workflow, mandatory callsign for TX
  - **Connection Guide**: Hardware setup instructions for audio cable interface

### Technical
- Web Audio API for audio I/O
- getUserMedia for microphone access
- IndexedDB storage for received images
- Event-driven architecture for decode progress

## [6.18.5] - 2025-01-28

### Fixed
- **Settings Version Display** - Version number now reads dynamically from manifest.json instead of being hardcoded
- **About Section** - Added BlackAtlas LLC branding and GitHub link

### Added
- **Security Headers Template** - Added .htaccess file with CSP and security headers for Apache hosting

## [6.18.4] - 2025-01-28

### Added
- **Privacy Policy** - Added PRIVACY.md documenting data handling practices:
  - No personal data collection
  - All data stored locally on device
  - External service connections documented
  - Hardware connection privacy explained

### Changed
- Updated README with privacy policy link
- Version consistency check across all files

## [6.18.3] - 2025-01-28

### Fixed
- **Modal Accessibility (aria-hidden)** - Fixed accessibility violation where modal container had `aria-hidden="true"` while focused elements were inside:
  - Modal container now sets `aria-hidden="false"` when opening
  - Sets `aria-hidden="true"` when closing
  - Eliminates browser warning about hidden focus

- **Offline Mode Console Spam** - Reduced console noise when in offline mode:
  - Network connectivity checks now stop when user enables "Offline Mode" toggle
  - Checks resume when offline mode is disabled
  - Uses State.subscribe to react to offline mode changes
  - Eliminates repeated 503 errors and ServiceWorker update failures in console

## [6.18.2] - 2025-01-27

### Fixed
- **Offline Maps Draw Region on Touch Devices** - Region drawing now works on mobile/tablet:
  
  **Problem**: The "Draw Region" button would enter drawing mode but touch events (tap, drag) were not being handled, making it impossible to actually draw a region on touch devices.
  
  **Solution**: Added offline region drawing support to all three touch event handlers:
  - `handleTouchStart`: Detects drawing mode and initiates region selection
  - `handleTouchMove`: Updates the selection rectangle as user drags
  - `handleTouchEnd`: Completes the selection and triggers download modal
  
  **Notes**:
  - Two-finger gestures (pinch/rotate) now cancel drawing mode
  - Drawing works identically to mouse-based drawing on desktop
  - Tested on both single-touch and multi-touch scenarios

## [6.18.1] - 2025-01-27

### Added
- **MQTT Connection Support** - AtlasRF now supports MQTT over WebSocket:
  
  **Connection Method Selector**:
  - Auto (recommended) - Tries WebSocket first, falls back to REST
  - WebSocket - Real-time push via native WebSocket
  - MQTT - Pub/sub via MQTT over WebSocket (requires Mosquitto broker)
  - REST Polling - Periodic fetch every 5 seconds
  
  **MQTT Implementation**:
  - Dynamically loads MQTT.js library from CDN when MQTT is selected
  - Configurable MQTT WebSocket port (default: 9001)
  - Subscribes to topic hierarchy: `atlasrf/tracks/#`, `atlasrf/weather/#`, `atlasrf/alerts`, `atlasrf/emergency`
  - Automatic reconnection with exponential backoff
  - Graceful error handling when broker unavailable
  
  **UI Updates**:
  - Connection method dropdown in AtlasRF panel
  - MQTT port input field (enabled when MQTT selected)
  - Dynamic description text based on selected method
  - Connection mode displayed when connected (WEBSOCKET/MQTT/REST)

### Technical Notes
- MQTT only works over WebSocket (browsers cannot use raw TCP)
- Requires Mosquitto or compatible broker with WebSocket listener enabled
- MQTT.js library loaded on-demand to avoid bloating initial page load
- Existing WebSocket and REST code paths remain unchanged
- Settings persist: connectionMethod, mqttPort stored in IndexedDB

## [6.18.0] - 2025-01-27

### Added
- **AtlasRF Integration** - Connect to AtlasRF for off-grid situational awareness:
  
  **Track Detection Display**:
  - Aircraft (ADS-B 1090 MHz) - Blue aircraft symbols with heading
  - Ships (AIS 162 MHz) - Cyan boat symbols with heading
  - Drones (Remote ID 2.4 GHz) - Amber diamond symbols
  - Radiosondes (400 MHz) - Purple circle markers
  - APRS Stations (144.39 MHz) - Green circle markers
  
  **Map Layer Toggles**:
  - Individual on/off toggle for each detection type
  - Real-time track counts shown when connected
  - Settings persist across sessions
  - Disabled types hidden from map rendering
  
  **Weather Source Toggle**:
  - Internet (NWS/IEM) - Default, reliable online weather
  - AtlasRF FIS-B - Off-grid weather via 978 MHz UAT
  - Stale data detection with 15-minute threshold
  - Auto-fallback option when FIS-B data goes stale
  
  **Connection Features**:
  - WebSocket real-time updates (preferred)
  - REST polling fallback (5-second interval)
  - Automatic reconnection with exponential backoff
  - Health check monitoring every 30 seconds
  - Configurable host/port (default: atlasrf.local:8000)
  
  **Emergency Alerts**:
  - Aircraft squawk detection (7500 Hijack, 7600 Radio Fail, 7700 Emergency)
  - AIS emergency devices (SART, MOB, EPIRB)
  - Visual emergency alert panel with pulsing indicators
  - Toast notifications for critical emergencies
  
  **Map Rendering**:
  - Track symbols with heading rotation (aircraft/ships)
  - Age-based alpha fade for stale tracks
  - Labels shown at zoom level 10+
  - Emergency tracks rendered with red color and pulse effect
  - Maximum 500 rendered tracks for performance
  
  **Panel UI**:
  - Connection status with WebSocket/REST mode indicator
  - Track statistics grid with live counts
  - Emergency alerts section (when active)
  - Help documentation for AtlasRF setup

### Technical Details
- New module: `js/modules/atlasrf.js` (~900 lines)
- New nav item with radar icon
- Map overlay integrated with existing render pipeline
- Event-driven architecture for real-time updates
- Settings persisted via IndexedDB

## [6.17.1] - 2025-01-27

### Fixed
- **BLM Surface Management Layer** - Updated to new URL after BLM service reorganization
  - Changed from `BLM_Natl_SMA_Cached` to `BLM_Natl_SMA_Cached_with_PriUnk`
  - Fixes 404 errors when viewing federal land ownership

### Removed
- **World Topo Map** - Removed deprecated Esri service (no longer maintained)
- **BLM Grazing Allotments** - Removed (requires dynamic ArcGIS export API, not tile cache)

### Changed
- Renamed "USFS / Topo Maps" category to "Esri Topo Maps" for clarity
- Marked Nat Geo basemap as "(legacy)" - still works but in mature support

### Notes
All remaining map layers verified working:
- General: OpenStreetMap, OpenTopoMap, Esri Satellite ✓
- USGS: Topo, Imagery, Imagery+Topo, Hydro ✓ (refreshed Oct/Feb 2025)
- Esri: USA Topo, Nat Geo, Hillshade, Labels, Roads ✓
- BLM: Surface Management ✓

## [6.17.0] - 2025-01-27

### Added
- **Storage Quota Warning** - Browser storage monitoring and alerts:
  
  **Monitoring**:
  - Uses Storage API to track IndexedDB and Cache storage usage
  - Automatic checks every 5 minutes
  - Three warning levels: 80% (warning), 90% (critical), 95% (danger)

  **Warning Banner**:
  - Color-coded popup at bottom-right when threshold exceeded
  - Shows percentage used and bytes remaining
  - Visual progress bar indicator
  - "Manage" button links to offline panel for tile management
  - "Dismiss" remembers level until storage increases

  **API**:
  - `StorageMonitorModule.getStatus()` - Full usage stats
  - `StorageMonitorModule.renderCompact()` - Embeddable indicator
  - `StorageMonitorModule.formatBytes()` - Utility function

- **Network Quality Indicator** - Connection speed monitoring:
  
  **Detection Methods**:
  - Network Information API (Chrome/Android): connection type, effective type, downlink, RTT
  - Latency measurement: HEAD requests to manifest.json
  - Automatic quality classification: excellent, good, fair, poor

  **Quality Levels**:
  - 📶 Excellent: 4 bars, green (4G + <50ms latency or >10Mbps)
  - 📶 Good: 3 bars, lime (4G or >4Mbps)
  - 📶 Fair: 2 bars, yellow (3G or >1Mbps)
  - 📶 Poor: 1 bar, red (2G or <1Mbps)
  - 📴 Offline: 0 bars, gray

  **UI Components**:
  - `renderCompact()` - Signal bars + label + speed/latency
  - `renderDetailed()` - Full panel with type, speed, latency, status
  - `renderBadge()` - Minimal signal bars only

  **Utilities**:
  - `estimateTileLoadTime(sizeKB)` - Predict tile download time
  - Event subscription for quality changes

### Technical
- New module: `js/modules/storagemonitor.js` (~280 lines)
- New module: `js/modules/networkquality.js` (~320 lines)
- Both integrate with existing PWA infrastructure
- Uses Navigator Storage and Network Information APIs

## [6.16.0] - 2025-01-27

### Added
- **Update Available Toast** - PWA update notifications:
  
  **Update Detection**:
  - Listens for service worker update events
  - Periodic update checks (every 5 minutes when tab active)
  - Checks on visibility change (returning to tab)
  - Detects waiting service workers

  **User Interface**:
  - Blue toast notification at bottom of screen
  - Shows new version number
  - "Refresh Now" button to apply update immediately
  - "Later" button to dismiss temporarily
  - Smooth slide-in/slide-out animations

  **API**:
  - `UpdateModule.isUpdateAvailable()` - Check if update pending
  - `UpdateModule.getCurrentVersion()` - Get installed version
  - `UpdateModule.applyUpdate()` - Force refresh to apply

- **Feature-Specific Warnings** - Contextual compatibility alerts:
  
  **Integration Points**:
  - Meshtastic: Web Bluetooth check before connection
  - Meshtastic: Web Serial check before USB connection  
  - APRS: Web Bluetooth check before TNC connection
  - Radiacode: Web Bluetooth check before connection
  - Barometer: Sensor API check before start

  **Warning Modal**:
  - Shows when user attempts unsupported feature
  - Identifies the specific missing API
  - Shows current browser and OS
  - Recommends Chrome on Android for full support
  - Non-blocking - user informed but not prevented

### Changed
- Service worker message handler now supports both string and object formats
- Hardware connection functions now show visual warnings before throwing errors

### Technical
- New module: `js/modules/update.js` (~280 lines)
- Modified: `meshtastic.js`, `aprs.js`, `radiacode.js`, `barometer.js`
- SW message handler updated for SKIP_WAITING and GET_VERSION

## [6.15.0] - 2025-01-27

### Added
- **Offline Status Indicator** - Real-time network connectivity monitoring:
  
  **Offline Banner**:
  - Persistent red banner at top of screen when offline
  - Pulsing 📴 icon for visibility
  - "Using cached data" message to reassure users
  - Live duration counter showing time offline
  - Smooth slide-in/slide-out animations

  **Back Online Toast**:
  - Green success toast when connection restored
  - Shows how long the app was offline
  - Auto-dismisses after 3 seconds

  **Technical Features**:
  - Listens to browser `online`/`offline` events
  - Periodic connectivity verification (30-second interval)
  - Actual fetch test to confirm real connectivity
  - Event subscription system for other modules
  - Inline indicator component for embedding in panels

  **API for Other Modules**:
  - `NetworkStatusModule.isOnline()` - Check current status
  - `NetworkStatusModule.subscribe(callback)` - Listen for changes
  - `NetworkStatusModule.renderInlineIndicator()` - Embeddable UI
  - `NetworkStatusModule.getOfflineDuration()` - Time offline

### Technical
- New module: `js/modules/networkstatus.js` (~400 lines)
- Uses `navigator.onLine` with fetch verification backup
- CSS animations for smooth transitions
- Body class `offline-mode` for layout adjustments

## [6.14.0] - 2025-01-27

### Added
- **Browser Compatibility Detection** - Automatic browser/platform detection:
  
  **Detection Features**:
  - Identifies browser type and version (Chrome, Firefox, Safari, Edge, Samsung Internet)
  - Detects operating system (Android, iOS, Windows, macOS, Linux)
  - Checks support for critical APIs: Service Worker, IndexedDB, Geolocation
  - Checks support for advanced APIs: Web Bluetooth, Web Serial, Barometer, Wake Lock

  **Compatibility Levels**:
  - ✅ Full: Chrome on Android (all features supported)
  - 🔶 Partial: Chrome Desktop, Edge (most features, no barometer)
  - ⚠️ Limited: Safari, Firefox (core features only, no hardware integration)
  - ❌ Unsupported: Browsers without Service Worker

  **User Interface**:
  - First-visit compatibility banner with feature status
  - Collapsible details showing supported/unsupported features
  - Feature-specific warning modals when attempting unsupported features
  - Browser and OS identification display
  - Dismissable with preference saved to localStorage

  **API for Modules**:
  - `CompatibilityModule.requireFeature('webBluetooth')` - Check and warn
  - `CompatibilityModule.isSupported('barometer')` - Silent check
  - `CompatibilityModule.getSummary()` - Full compatibility report

### Technical
- New module: `js/modules/compatibility.js` (~600 lines)
- User Agent parsing for browser/OS detection
- Feature detection via API presence checks
- LocalStorage persistence for banner dismissal
- Version-tracked dismissal (re-shows after major updates)

### Platform Support Matrix
| Feature | Chrome Android | Chrome Desktop | Safari iOS | Firefox |
|---------|---------------|----------------|------------|---------|
| Offline/PWA | ✅ | ✅ | ✅ | ✅ |
| Web Bluetooth | ✅ | ✅ | ❌ | ❌ |
| Web Serial | ✅ | ✅ | ❌ | ❌ |
| Barometer | ✅ | ❌ | ❌ | ❌ |
| GPS | ✅ | ✅ | ✅ | ✅ |

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

## [6.27.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 1: Celestial Almanac
- **CelestialModule** - Complete navigation-grade celestial body positions
- **Sun Position**: GHA, Declination, Semi-diameter, Equation of Time
- **Moon Position**: GHA, Declination, Horizontal Parallax, Semi-diameter, Phase
- **Planet Positions**: Venus, Mars, Jupiter, Saturn with GHA/Dec calculations
- **58 Navigation Stars**: Full catalog with SHA, Declination, magnitude, constellation
- **GHA Aries**: Greenwich Hour Angle of First Point of Aries
- **Altitude/Azimuth Calculations**: Convert GHA/Dec to observer-relative coordinates
- **Visible Bodies**: Automatically identify what celestial bodies are observable
- **Recommended Bodies**: Suggest optimal bodies for celestial fix (120° spread)
- **Almanac Generation**: Complete daily almanac with all body positions
- **Almanac Widget**: Visual display of current celestial data

### Technical Details
- All algorithms based on public domain astronomical formulas
- Accuracy: ~1 arcminute for sun/moon, ~2 arcminutes for planets
- Fully offline capable - no external API dependencies
- Julian Date functions for precise time calculations
- VSOP87-based planetary calculations (simplified)

### Foundation for Future Phases
- Phase 2: Observation Input & Sextant Simulation
- Phase 3: Sight Reduction & Line of Position
- Phase 4: Position Fixing (Emergency Position Fix)
- Phase 5: Star Chart, Sun Compass, Moon Navigation, Polaris Finder
- Phase 6: Dead Reckoning Integration
- Phase 7: Training Mode, Shadow Stick Guide, Solar Noon Calculator

## [6.28.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 2: Observation Input & Altitude Corrections

#### Altitude Correction System
- **Refraction Correction**: Bennett's formula with low-altitude table interpolation
- **Dip Correction**: Height of eye calculation (0.97' × √height)
- **Semi-diameter Correction**: Upper/lower limb for sun and moon
- **Parallax Correction**: Horizontal parallax for moon (significant), sun (minor)
- **Temperature/Pressure Adjustments**: Non-standard atmospheric corrections

#### Observation Management
- **startObservation(body, options)**: Begin observation session for any celestial body
- **recordSight(altitude, time)**: Record sextant altitude with automatic corrections
- **completeObservation()**: Finish session, calculate averages, add to log
- **getSightLog()**: Retrieve all completed observations
- **clearSightLog()**: Clear observation history

#### Device Sensor Integration
- **initDeviceSensors()**: Request device orientation permissions
- **getDeviceAltitude()**: Measure altitude using device tilt (~2° accuracy)
- **stopDeviceSensors()**: Stop sensor listening

#### UI Widgets
- **renderObservationWidget()**: Active observation interface with altitude input
- **renderCorrectionBreakdown()**: Visual display of all corrections applied
- **renderSightLogWidget()**: View and manage recorded observations
- **renderCorrectionSettingsWidget()**: Configure index error, height of eye, limb, etc.

### Correction Pipeline
```
Sextant Altitude (Hs)
    ↓ − Index Error
Apparent Altitude (Ha)
    ↓ − Dip (height of eye)
    ↓ − Refraction  
    ↓ ± Semi-diameter (sun/moon)
    ↓ + Parallax (moon/sun)
Observed Altitude (Ho)
```

### Test Results
- 79/79 tests passed
- Refraction values validated against nautical tables
- Full observation workflow tested
- Error handling verified

## [6.29.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 3: Sight Reduction & Line of Position

#### Core Sight Reduction
- **sightReduction(AP, GHA, Dec)**: Calculate computed altitude (Hc) and azimuth (Zn) using spherical trigonometry
- **calculateIntercept(Ho, Hc)**: Determine intercept distance and direction (Toward/Away)
- **generateLOP(AP, Zn, intercept)**: Create Line of Position perpendicular to azimuth

#### Sight Reduction Formula
```
sin(Hc) = sin(Lat) × sin(Dec) + cos(Lat) × cos(Dec) × cos(LHA)
```

#### Complete Workflow
- **reduceSight(observation, AP)**: Full sight reduction from completed observation
- **reduceAllSights(AP)**: Reduce all observations in sight log
- **storeLOP(reduction)**: Save LOP for position fixing
- **calculateLOPIntersection(lop1, lop2)**: Find fix from two LOPs

#### LOP Management
- Store multiple LOPs from different observations
- Delete individual LOPs or clear all
- Quality assessment based on angle between LOPs (>30° = Good, 15-30° = Fair, <15° = Poor)

#### UI Widgets
- **renderSightReduction()**: Visual display of reduction results with Ho/Hc comparison
- **renderSightReductionWidget()**: AP input and observation list
- **renderLOPsList()**: Manage stored LOPs and calculate fix
- **renderLOPOnMap()**: Draw LOP with azimuth arrow on canvas/map

### Key Concepts
- **Assumed Position (AP)**: Starting point for calculations (typically GPS or DR position)
- **Local Hour Angle (LHA)**: GHA + Longitude (determines body's position relative to observer)
- **Computed Altitude (Hc)**: What altitude body SHOULD be from AP
- **Intercept**: Difference between observed (Ho) and computed (Hc) × 60 = nautical miles
- **Line of Position**: Line perpendicular to azimuth, passing through intercept point

### Test Results
- 64/64 tests passed
- Verified Polaris altitude = observer latitude
- Verified LOP perpendicular to azimuth
- Verified intersection calculation

### Navigation Accuracy
- Sight reduction: Sub-arcminute precision
- Position fix depends on:
  - Observation quality
  - Time accuracy
  - Angle between LOPs (ideally 60-120°)

## [6.30.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 4: Emergency Position Fix

#### Noon Sight (Latitude from Sun)
- **calculateNoonSightLatitude(Ho, dec, bearing)**: Determine latitude from sun at meridian passage
- **calculateMeridianPassage(longitude, date)**: Predict time of local apparent noon
- **processNoonSight(altitudes)**: Process multiple observations to find maximum altitude
- Formula: `Latitude = 90° - Ho + Dec` (sun bearing south)

#### Polaris Latitude (Northern Hemisphere)
- **calculatePolarisLatitude(Ho, date, longitude)**: Latitude from Polaris altitude
- Fundamental principle: Polaris altitude ≈ observer's latitude
- Small correction applied for Polaris polar distance (~0.7°)
- Error handling for southern hemisphere observations

#### Longitude from Noon Time
- **calculateLongitudeFromNoon(merPassTime, date)**: Determine longitude from meridian passage timing
- Formula: `Longitude = (12:00 - EoT - observed_time) × 15°/hour`
- Accounts for Equation of Time

#### Running Fix
- **calculateRunningFix(sight1, sight2, course, speed)**: Position from two sights with DR advance
- **calculateAMPMFix(amSight, pmSight, course, speed)**: Morning/afternoon sun fix
- Advances first LOP by course and speed to intersect with second LOP

#### Emergency Navigation Widgets
- **renderNoonSightWidget()**: Meridian passage predictor and altitude input
- **renderPolarisWidget()**: Polaris finder with visibility check
- **renderEmergencyNavWidget()**: Complete emergency navigation interface
- **renderRunningFixWidget()**: Running fix calculator
- **renderEmergencyFixResult()**: Display latitude/longitude results

### Emergency Methods Summary
| Method | Determines | Requires | Accuracy |
|--------|------------|----------|----------|
| Noon Sight | Latitude | Sun at noon, time | ±5 nm |
| Polaris | Latitude | Clear night sky | ±5 nm |
| Noon Time | Longitude | Accurate UTC time | ±10 nm |
| Running Fix | Full position | Two sights, course/speed | ±10-20 nm |

### Test Results
- 57/57 tests passed
- Verified seasonal latitude calculations (solstices, equinox)
- Confirmed Polaris correction accuracy
- Running fix distance calculations validated

## [6.31.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 5: Celestial Tools

#### Star Chart
- **generateStarChart(lat, lon, date, options)**: Generate complete sky chart data
  - Filter by magnitude (brightness) and altitude
  - Includes stars, planets, moon position
  - Twilight status (day/civil/nautical/astronomical/night)
- **altAzToChartXY(altitude, azimuth, radius)**: Convert alt/az to chart coordinates
- **renderStarChartCanvas(ctx, chartData, options)**: Draw interactive star chart on canvas
- Stereographic projection from zenith
- Cardinal direction markers (N/E/S/W)

#### Sun Compass
- **calculateSunCompass(lat, lon, date)**: Determine cardinal directions from sun position
- Returns sun azimuth, altitude, and rotation to find north
- Shadow stick method instructions
- Watch method instructions (both hemispheres)
- Interactive compass display widget

#### Polaris Finder (Northern Hemisphere)
- **calculatePolarisFinder(lat, lon, date)**: Locate Polaris using Big Dipper
- Big Dipper "pointer stars" (Dubhe & Merak) guidance
- Polaris altitude = observer's latitude
- Visual diagram of Big Dipper to Polaris
- Automatic Southern Cross suggestion for southern hemisphere users

#### Southern Cross Finder (Southern Hemisphere)
- **calculateSouthernCrossFinder(lat, lon, date)**: Navigate using Crux
- Acrux and Gacrux positions
- South Celestial Pole location
- Instructions for finding south

#### Moon Navigation
- **calculateMoonNavigation(lat, lon, date)**: Use moon for direction finding
- Moon phase calculation and description
- Illumination percentage
- Crescent moon "horns" method for finding south
- Phase-specific navigation instructions

#### Constellation Data
- **CONSTELLATION_LINES**: Line connections for major constellations
  - Ursa Major (Big Dipper)
  - Ursa Minor (Little Dipper)
  - Orion
  - Scorpius
  - Crux (Southern Cross)
  - Cygnus

#### UI Widgets
- **renderStarChartWidget()**: Interactive sky chart with stats
- **renderSunCompassWidget()**: Visual compass with sun position
- **renderPolarisFinderWidget()**: Illustrated Polaris finding guide
- **renderMoonNavigationWidget()**: Moon phase and navigation display
- **renderCelestialToolsWidget()**: Combined tools panel with tabs

### Direction Finding Methods
| Method | Conditions | Accuracy |
|--------|------------|----------|
| Sun Compass | Daytime, clear sky | ±5° |
| Polaris | Night, N. hemisphere | ±1° |
| Southern Cross | Night, S. hemisphere | ±2° |
| Moon Horns | Crescent moon visible | ±10° |
| Shadow Stick | Sunny day, ~20 min | ±5° |

### Test Results
- 79/79 tests passed
- Star chart coordinate conversion verified
- Polaris altitude = latitude principle confirmed
- Sun compass directions validated

## [6.32.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 6: Dead Reckoning Integration

#### Dead Reckoning Core
- **initializeDR(position, time, fixType, options)**: Initialize DR from known position
- **updateCourseSpeed(course, speed)**: Update vessel course and speed
- **calculateDRPosition(time)**: Calculate DR position at any time
- **getCurrentDRPosition()**: Get current DR position (convenience function)
- **getDRState()**: Get complete DR state object
- **getDRLog()**: Get position history log
- **clearDR()**: Reset all DR state

#### Set and Drift
- **calculateSetAndDrift(drPosition, actualPosition, elapsed)**: Determine current/wind effects
- **updateFixFromCelestial(celestialFix, time)**: Update fix and calculate set/drift
- **calculateEstimatedPosition(time)**: EP accounting for set and drift

#### Navigation Calculations
- **calculateCourseDistance(from, to)**: Course and distance between two points
- **calculateRequiredSpeed(from, to, hours)**: Speed needed to arrive on time
- **calculateETA(waypoint, fromPosition)**: Estimated time of arrival

#### LOP Integration
- **advanceLOP(lop, newTime)**: Advance a Line of Position using DR

#### UI Widgets
- **renderDRStatusWidget()**: Current DR status with fix info, position, course/speed
- **renderDRInputWidget(course, speed)**: Course and speed input controls
- **renderDRPlot(ctx, latLonToPixel, options)**: Draw DR track on map
- **renderNavigationPlanWidget(waypoint)**: Waypoint planning interface
- **renderETAResult(eta)**: Display ETA calculation results

### Position Types
| Type | Description | Symbol |
|------|-------------|--------|
| **Fix** | Known position (GPS, celestial) | ⊙ |
| **DR** | Dead reckoning (course/speed) | ⊗ |
| **EP** | Estimated position (DR + set/drift) | △ |

### Key Concepts

**Dead Reckoning Formula:**
```
New Position = Last Fix + (Course × Speed × Time)
```

**Set and Drift:**
- **Set**: Direction the current/wind is pushing you (degrees true)
- **Drift**: Speed of the current/wind effect (knots)
- Calculated by comparing celestial fix with DR position

**Estimated Position (EP):**
```
EP = DR Position + (Set × Drift × Time)
```

### Workflow Example
```javascript
// 1. Start with GPS fix
CelestialModule.initializeDR({lat: 37.8, lon: -122.4}, new Date(), 'gps', {course: 270, speed: 6});

// 2. After 2 hours, check DR position
const dr = CelestialModule.calculateDRPosition(twoHoursLater);
// → DR: 37.8°N, 122.6°W (12nm west)

// 3. Take celestial fix, update and get set/drift
const result = CelestialModule.updateFixFromCelestial({lat: 37.85, lon: -122.65}, fixTime);
// → Set: 3°T, Drift: 1.5 kts (current pushing us slightly north)

// 4. Calculate ETA to destination
const eta = CelestialModule.calculateETA({lat: 37.8, lon: -123.5});
// → Course: 270°T, Distance: 51nm, ETA: 8.5 hours
```

### Test Results
- 83/83 tests passed
- DR position calculations verified against known formulas
- Set and drift calculations validated
- ETA calculations confirmed

## [6.33.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 7: Training Mode

#### Primitive Navigation Methods
These techniques work with minimal or no specialized equipment - critical survival skills.

##### Shadow Stick Method
- **calculateShadowStick(startTime, endTime, lat)**: Calculate E-W line from shadow movement
- Sun moves 15° per hour = 0.25° per minute
- Best accuracy: 15-30 minute wait
- First mark = West, second mark = East
- Perpendicular line = North-South

##### Solar Noon
- **calculateSolarNoon(longitude, date)**: Predict time of local apparent noon
- **calculateLongitudeFromSolarNoon(observedNoon, date)**: Determine longitude from observed noon
- Accounts for Equation of Time (EoT)
- At solar noon: shortest shadow, points true N/S

##### Watch Method
- **calculateWatchMethod(time, lat)**: Find direction using analog watch
- Northern hemisphere: point hour hand at sun, bisect to 12 = South
- Southern hemisphere: point 12 at sun, bisect to hour hand = North
- Visual diagram with hour hand and bisect angle

##### Star Time
- **calculateStarTime(lat, lon, date)**: Determine Local Sidereal Time
- Shows which star is on your meridian
- Useful for star identification

##### Hand Measurement
- **calculateLatitudeFromHand(fists, fingers)**: Estimate Polaris altitude
- 1 fist at arm's length ≈ 10°
- 1 finger width ≈ 2°
- Polaris altitude ≈ your latitude
- Accuracy: ±5-10°

##### Kamal (Traditional Arab Tool)
- **calculateKamal(stringLength, plateWidth, targetLatitude)**: Calculate kamal dimensions
- Simple latitude measuring device
- Uses: plate width / string length = angle

##### Equal Altitude Method
- **calculateEqualAltitudeNoon(morningTime, morningAlt, afternoonTime)**: Find local noon
- Measure sun altitude in AM, wait for same altitude in PM
- Midpoint = local apparent noon
- No declination knowledge needed

##### Horizon Distance
- **calculateHorizonDistance(heightFt)**: Distance to visible horizon
- Formula: 1.17 × √(height in feet) = nautical miles
- Examples: 6ft = 2.9nm, 20ft = 5.2nm, 50ft = 8.3nm

#### UI Widgets
- **renderShadowStickWidget(lat)**: Interactive shadow stick trainer with timer
- **renderSolarNoonWidget(longitude)**: Solar noon predictor
- **renderWatchMethodWidget(lat)**: Visual watch compass diagram
- **renderHandMeasurementWidget()**: Fist/finger measurement tool
- **renderTrainingModeWidget(lat, lon)**: Complete training panel with tabs
- **renderHorizonDistanceWidget()**: Horizon calculator

### Methods Accuracy Summary

| Method | Equipment | Accuracy | Best Use |
|--------|-----------|----------|----------|
| Shadow Stick | Stick | ±5-10° | E-W direction |
| Watch | Analog watch | ±15° | Quick direction |
| Hand/Fist | None | ±5-10° | Latitude estimate |
| Solar Noon | Accurate time | ±10nm | Longitude |
| Equal Altitude | Watch, any stick | ±5 min | Local noon |
| Kamal | Simple tool | ±2° | Latitude |

### Test Results
- 95/95 tests passed
- All primitive methods validated
- Widget rendering verified
- Complete workflow tested

### Celestial Navigation Module - COMPLETE ✅

All 7 phases implemented:
1. ✅ Celestial Almanac (Sun, Moon, Planets, 58 Stars)
2. ✅ Observation Input & Altitude Corrections
3. ✅ Sight Reduction & Line of Position
4. ✅ Emergency Position Fix Methods
5. ✅ Star Chart, Sun Compass, Polaris Finder
6. ✅ Dead Reckoning Integration
7. ✅ Training Mode & Primitive Methods

Total: 6,100+ lines of code, 110+ exported functions, 100% test coverage

## [6.33.0] - 2025-01-31

### Added - Celestial Navigation Panel Integration

#### UI Panel
- New **Celestial** panel in sidebar navigation (star icon)
- Located after Sun/Moon panel for logical grouping
- 5-tab interface for organized access to all features

#### Tab Structure
| Tab | Icon | Features |
|-----|------|----------|
| **Almanac** | 📖 | Sun/Moon positions, planet GHA/Dec, recommended bodies |
| **Observe** | 🔭 | Record sights, body selection, sight log management |
| **Fix** | 📍 | Sight reduction, LOP management, fix calculation, emergency methods |
| **Tools** | 🧭 | Sun compass, Polaris finder, star chart |
| **DR** | 📐 | Dead reckoning status, course/speed input, ETA planning |

#### Panel Features
- **Observer Position**: Lat/Lon input with "Sync from Map" button
- **UTC Time Display**: Current time for observations
- **Body Selection**: Sun, Moon, planets, 20+ navigation stars
- **Manual Altitude Entry**: Degrees and minutes input
- **Eye Height Setting**: For dip correction
- **Sight Log**: View/clear recorded observations
- **Assumed Position**: For sight reduction
- **LOP Display**: View calculated lines of position
- **Fix Calculation**: Intersect LOPs for position fix
- **Emergency Methods**: Quick access to Noon Sight and Polaris latitude

#### Event Handling
- Tab switching with state preservation
- Position sync from MapModule
- Sight recording workflow
- Observation complete/cancel
- Sight reduction and LOP storage
- Fix calculation with result display
- DR initialization and course/speed updates
- ETA calculation to waypoints
- Emergency method dialogs (Noon Sight, Polaris)

#### Integration Points
- Reads position from MapModule.getMapState()
- Uses CelestialModule widgets for Tools and DR tabs
- Full access to all 92 CelestialModule functions
- State persistence across tab switches

### Files Modified
- `js/core/constants.js`: Added 'celestial' to NAV_ITEMS
- `js/modules/panels.js`: Added renderCelestial() and supporting functions (+600 lines)
- `sw.js`: Version bump to 6.33.0
- `README.md`: Version update

## [6.34.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 7: Training Mode

#### New Training Tab in Celestial Panel
- Added 6th tab "Training" (🎓) to celestial navigation panel
- Comprehensive primitive navigation methods without instruments

#### Primitive Navigation Methods

**Shadow Stick Method** (`calculateShadowStick`)
- Find East-West line using sun and vertical stick
- Mark shadow tips 15-30 minutes apart
- First mark = West, Second mark = East
- Accuracy: ±5° typical

**Solar Noon** (`calculateSolarNoon`)
- Calculate exact time sun crosses meridian
- At solar noon, shadows point true North (N. hemisphere)
- Accounts for Equation of Time
- Returns time in UTC

**Longitude from Solar Noon** (`calculateLongitudeFromSolarNoon`)
- Determine longitude by observing solar noon time
- Compare observed noon with 12:00 UTC + EoT

**Watch Method** (`calculateWatchMethod`)
- Find direction using analog watch
- Northern: point hour hand at sun, bisect to 12 = South
- Southern: point 12 at sun, bisect to hour hand = North
- Automatic hemisphere-specific instructions

**Star Time** (`calculateStarTime`)
- Calculate local sidereal time
- Identify which constellation is on meridian
- Useful for star navigation timing

**Hand Measurement** (`calculateLatitudeFromHand`)
- Measure angles at arm's length
- 1 finger ≈ 2°, 3 fingers ≈ 5°, fist ≈ 10°, span ≈ 20°
- Polaris altitude ≈ latitude (N. hemisphere)

**Kamal** (`calculateKamal`)
- Traditional Arab navigation tool
- Calculate plate angle from dimensions
- Determine plates needed for target latitude

**Equal Altitude Noon** (`calculateEqualAltitudeNoon`)
- Find local noon without declination tables
- Morning + afternoon equal altitude times
- Noon = exact midpoint

**Horizon Distance** (`calculateHorizonDistance`)
- Calculate visible distance to horizon
- Formula: 1.17 × √(height in feet) = nautical miles
- Standing (6ft) ≈ 2.9 nm, Mast (20ft) ≈ 5.2 nm

#### UI Widgets
- `renderShadowStickWidget()` - Interactive shadow stick timer
- `renderSolarNoonWidget(lon)` - Solar noon display
- `renderWatchMethodWidget(lat)` - Watch method instructions
- `renderHandMeasurementWidget()` - Hand measurement guide
- `renderHorizonDistanceWidget()` - Horizon calculator
- `renderTrainingModeWidget(lat, lon)` - Complete training panel

#### Training Panel Features
- Shadow stick step-by-step instructions
- Real-time solar noon for current longitude
- Watch method with current hour display
- Hand measurement reference chart
- Horizon distance table
- All methods work offline

### Test Results
- 87/87 tests passed
- All primitive methods validated against known values
- Widget rendering verified

### Complete Celestial Navigation Module Summary

| Phase | Version | Features |
|-------|---------|----------|
| 1 | 6.27.0 | Almanac (58 stars, Sun/Moon/Planets) |
| 2 | 6.28.0 | Observations & Altitude Corrections |
| 3 | 6.29.0 | Sight Reduction & LOP |
| 4 | 6.30.0 | Emergency Position Fix |
| 5 | 6.31.0 | Star Chart & Celestial Tools |
| 6 | 6.32.0 | Dead Reckoning Integration |
| 7 | 6.34.0 | Training Mode & Primitive Methods |

### Module Statistics
- Total lines: 6,089
- Exported functions: 113
- UI tabs: 6 (Almanac, Observe, Fix, Tools, DR, Training)
- Test coverage: 100%
- External dependencies: None
- Fully offline capable

## [6.35.0] - 2025-01-31

### Added - Celestial Navigation Module Phase 8: Inertial Navigation / PDR

#### GPS-Denied Navigation
Complete Pedestrian Dead Reckoning (PDR) system using device motion sensors for navigation without GPS. Works in tunnels, buildings, and during GPS jamming/spoofing.

#### Core Functions

**Sensor Management:**
- `checkSensorAvailability()` - Check accelerometer, gyroscope, magnetometer availability
- `requestSensorPermission()` - Request iOS 13+ motion sensor permission

**Initialization & Control:**
- `initInertialNav(options)` - Initialize with start position, step length, declination
- `startInertialTracking()` - Begin sensor-based position tracking
- `stopInertialTracking()` - Stop tracking, return summary
- `resetInertialNav(position)` - Reset to known position

**State & Position:**
- `getInertialState()` - Get current position, heading, speed, confidence, drift
- `getInertialTrack(maxPoints)` - Get position history for plotting
- `getPositionUncertainty()` - Get error ellipse parameters

**Calibration:**
- `calibrateStepLength(knownDistance, stepCount)` - Calibrate step length using known distance
- `calibrateGyroBias(duration)` - Calibrate gyroscope bias (hold still for 5s)

**Fix Updates:**
- `updateInertialFix(position, fixType)` - Apply known fix to reset drift
- `performZUPT()` - Zero Velocity Update when stationary

#### Sensor Algorithms

**Step Detection:**
- Accelerometer peak detection with low-pass filtering
- Minimum step interval: 250ms, Maximum: 2000ms
- Acceleration threshold: 1.2g for step trigger
- Adaptive step timing validation

**Heading Determination:**
- Gyroscope integration for magnetic-free heading
- Magnetometer for absolute reference
- Complementary filter fusion (98% gyro, 2% magnetic)
- Automatic gyro bias correction

**Position Calculation:**
- Step count × calibrated step length = distance
- Heading-based position update (x=east, y=north)
- Relative position in meters + absolute lat/lon conversion

**Drift Estimation:**
- 2% of distance traveled base drift rate
- Confidence degrades with distance and time
- Uncertainty ellipse with along-track/cross-track error

#### UI Components

**IMU Tab in Celestial Panel (📱):**
- Sensor availability status display
- Real-time position, heading, speed, steps
- Visual confidence bar with color coding
- Start/Stop tracking controls
- ZUPT button for stationary updates
- Fix update from map position

**Calibration Interface:**
- Step length calibration with known distance input
- Gyroscope bias calibration (5-second hold)
- Magnetic declination setting
- Calibration status indicators

#### Rendering Widgets:
- `renderInertialStatusWidget()` - Main tracking status display
- `renderInertialCalibrationWidget()` - Calibration controls
- `renderInertialNavWidget(lat, lon)` - Combined widget
- `renderInertialTrack(ctx, meterToPixel, options)` - Canvas track renderer

#### Technical Specifications

| Parameter | Value |
|-----------|-------|
| Step length default | 75 cm |
| Step length range | 30-150 cm |
| Step interval | 250-2000 ms |
| Accel threshold | 1.2g |
| Drift rate | 2% of distance |
| Gyro fusion weight | 98% |
| Min calibration steps | 10 |
| History buffer | 1000 points |

#### Use Cases
- Building/tunnel navigation
- GPS jamming scenarios
- Indoor positioning
- Hiking in canyons/dense forest
- Maritime below-deck navigation
- Tactical movement tracking

### Test Results
- 112/112 tests passed
- All sensor functions validated
- State management verified
- Calibration algorithms tested
- UI rendering confirmed

### Module Statistics
- Total lines: 7,190
- Exported functions: 133
- UI tabs: 7 (Almanac, Observe, Fix, Tools, DR, IMU, Training)
- Sensor APIs: DeviceMotionEvent, DeviceOrientationEvent

## [6.36.0] - 2025-01-31

### Changed - Commercial Licensing Compliance

Removed all Esri basemap services that require commercial licensing for paid distribution.

#### Removed Services
| Service | Reason |
|---------|--------|
| Esri World Imagery (satellite) | Commercial license required |
| Esri USA Topo Maps | Commercial license required |
| Esri National Geographic | Commercial license required |
| Esri World Hillshade | Commercial license required |
| Esri World Labels | Commercial license required |
| Esri World Transportation | Commercial license required |

#### Retained Services (Commercially Safe)

**Global Coverage:**
- OpenStreetMap (ODbL license - free with attribution)
- OpenTopoMap (CC-BY-SA - free with attribution)

**US Coverage (Public Domain - US Government):**
- USGS Topo - Official USGS topographic maps
- USGS Imagery - Satellite/aerial imagery
- USGS Imagery + Topo - Hybrid overlay
- USGS Hydro - Water features
- BLM Surface Management - Federal land ownership

#### Files Modified
- `js/map.js` - Removed Esri tile definitions
- `js/modules/map.js` - Removed Esri tile definitions
- `js/panels.js` - Updated layer UI
- `js/modules/panels.js` - Updated layer UI  
- `js/modules/offline.js` - Removed Esri tile URLs
- `sw.js` - Removed Esri domains from cache whitelist

#### Migration Notes
- Users who had Esri satellite selected will automatically fall back to USGS Imagery
- USGS Imagery provides US coverage equivalent to satellite for tactical purposes
- International users can use OpenStreetMap + OpenTopoMap for global coverage
- Consider MapTiler or Stadia Maps API keys for global satellite (requires paid plan)

### Fixed
- Layer switcher now cycles through available (safe) basemaps only
- Legacy state handling updated to redirect satellite → USGS Imagery
