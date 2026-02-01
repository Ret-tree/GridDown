# Changelog

All notable changes to GridDown will be documented in this file.

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
- **About Section** - Added BlackDot Technology branding and GitHub link

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
- **MQTT Connection Support** - RF Sentinel now supports MQTT over WebSocket:
  
  **Connection Method Selector**:
  - Auto (recommended) - Tries WebSocket first, falls back to REST
  - WebSocket - Real-time push via native WebSocket
  - MQTT - Pub/sub via MQTT over WebSocket (requires Mosquitto broker)
  - REST Polling - Periodic fetch every 5 seconds
  
  **MQTT Implementation**:
  - Dynamically loads MQTT.js library from CDN when MQTT is selected
  - Configurable MQTT WebSocket port (default: 9001)
  - Subscribes to topic hierarchy: `rfsentinel/tracks/#`, `rfsentinel/weather/#`, `rfsentinel/alerts`, `rfsentinel/emergency`
  - Automatic reconnection with exponential backoff
  - Graceful error handling when broker unavailable
  
  **UI Updates**:
  - Connection method dropdown in RF Sentinel panel
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
- **RF Sentinel Integration** - Connect to RF Sentinel for off-grid situational awareness:
  
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
  - RF Sentinel FIS-B - Off-grid weather via 978 MHz UAT
  - Stale data detection with 15-minute threshold
  - Auto-fallback option when FIS-B data goes stale
  
  **Connection Features**:
  - WebSocket real-time updates (preferred)
  - REST polling fallback (5-second interval)
  - Automatic reconnection with exponential backoff
  - Health check monitoring every 30 seconds
  - Configurable host/port (default: rfsentinel.local:8000)
  
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
  - Help documentation for RF Sentinel setup

### Technical Details
- New module: `js/modules/rfsentinel.js` (~900 lines)
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
