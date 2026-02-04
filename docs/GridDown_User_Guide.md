# GridDown User Guide

**Version 6.57.3**
*Navigate When Infrastructure Fails*

**BlackDot Technology**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Map & Navigation](#3-map--navigation)
4. [Waypoints & Routes](#4-waypoints--routes)
5. [Offline Maps](#5-offline-maps)
6. [Celestial Navigation](#6-celestial-navigation)
7. [GPS-Denied Navigation](#7-gps-denied-navigation)
8. [Communications](#8-communications)
9. [Sensors & Detection](#9-sensors--detection)
10. [Planning Tools](#10-planning-tools)
11. [Environmental Data](#11-environmental-data)
12. [Search & Discovery](#12-search--discovery)
13. [Reference Materials](#13-reference-materials)
14. [Export & Printing](#14-export--printing)
15. [System Monitoring](#15-system-monitoring)
16. [Settings & Customization](#16-settings--customization)
17. [Troubleshooting](#17-troubleshooting)
- [Appendix A: Quick Reference Card](#appendix-a-quick-reference-card)

---

## 1. Introduction

### 1.1 What is GridDown?

GridDown is a professional-grade Progressive Web Application (PWA) designed for tactical navigation and operational planning in challenging environments. Built with an offline-first philosophy, GridDown ensures that critical functionality remains available when traditional communications, GPS, and mapping services are unavailable.

Whether you are a search and rescue coordinator, emergency responder, outdoor enthusiast, or tactical operator, GridDown provides the tools you need to plan, navigate, and communicate effectively when the grid goes down.

### 1.2 Core Philosophy

- **Offline-First:** Every feature works without internet after initial setup
- **Paper Backup:** Comprehensive print and PDF export when electronics fail
- **Field-Ready:** Designed for real-world tactical and emergency scenarios
- **Self-Reliant:** No cloud dependencies, no accounts required
- **Infrastructure Independent:** Works when GPS, cellular, and internet fail
- **Privacy-First:** All data stored locally, zero telemetry, no tracking

### 1.3 Key Capabilities

GridDown integrates multiple critical functions into a single application:

| Category | Features |
|----------|----------|
| Navigation | Interactive maps, GPS tracking, turn-by-turn guidance, compass, celestial navigation, inertial navigation (PDR), star identification, camera sextant |
| Planning | Route building, logistics calculation, contingency planning, terrain analysis, rangefinder resection |
| Communication | APRS, Meshtastic mesh networking, SSTV image transmission, CoT Bridge (ATAK/WinTAK), team coordination, communication plans |
| Detection | RadiaCode radiation, RF Sentinel (ADS-B, AIS, Remote ID, FPV drones, radiosondes), SARSAT beacons |
| Environment | Weather forecasts, satellite imagery (NEXRAD, VIIRS, MODIS), air quality (AQI), sun/moon calculator, barometer, stream gauges |
| Reference | Medical protocols, field guides (600+ entries), radio frequencies, landmark database (3,100+ locations) |
| Search & Discovery | Global search (Ctrl+K), situation wizard (F1), contextual suggestions, search favorites |
| Export | GPX/KML, print to PDF, encrypted plan sharing (.gdplan) |

### 1.4 System Requirements

#### 1.4.1 Supported Browsers

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | 80+ | ✅ Full support including Web Bluetooth |
| Edge | 80+ | ✅ Full support including Web Bluetooth |
| Opera | 67+ | ✅ Full support including Web Bluetooth |
| Firefox | 75+ | ⚠️ No Web Bluetooth (device connections limited) |
| Safari | 13.1+ | ⚠️ No Web Bluetooth (device connections limited) |
| Chrome Android | 80+ | ✅ Full support on mobile |
| Safari iOS | 13+ | ⚠️ Limited — no Web Bluetooth |

**Recommendation:** Use Chrome or Edge for full functionality, especially for connecting to RadiaCode, APRS TNC, Meshtastic, and RF Sentinel devices.

#### 1.4.2 Device Requirements

- Modern smartphone, tablet, or computer with GPS (recommended)
- Minimum 500 MB storage for offline map tiles
- Internet connection for initial setup and map downloads
- Microphone access for SSTV receive (optional)
- Camera access for SSTV transmit, star identification, and camera sextant (optional)
- Motion sensors (accelerometer, gyroscope) for inertial navigation and compass (optional)

> **Tip:** Samsung Galaxy Tab Active series tablets are recommended for field use due to rugged construction and full Chrome Web API support.

---

## 2. Getting Started

### 2.1 Installation

#### 2.1.1 Web Browser (Recommended)

1. Navigate to the GridDown URL
2. When prompted, click Install or Add to Home Screen
3. GridDown will install as a standalone application
4. The app icon will appear on your home screen or desktop

Once installed, GridDown can be launched without an internet connection, though initial setup requires connectivity to download map tiles.

#### 2.1.2 Running Locally

For advanced users who wish to self-host GridDown:

1. Clone or download the GridDown package from the official repository
2. Serve via any static web server (e.g., `npx serve .` or `python -m http.server 8000`)
3. Access via http://localhost:8000 or your server address

### 2.2 First Launch

When you first open GridDown, an onboarding tour will guide you through the main features including map navigation, creating waypoints, building routes, downloading offline maps, and accessing panels and settings. You can restart this tour at any time from Settings > Show Onboarding Tour.

### 2.3 Interface Overview

#### 2.3.1 Map Canvas

The central map display shows your current position, waypoints, routes, and overlays. Interact with the map using:

- **Pan:** Click and drag (mouse) or swipe (touch)
- **Zoom:** Scroll wheel, pinch gesture, or +/- buttons
- **Rotate:** Hold Shift and drag, or two-finger rotate on touch devices
- **Reset North:** Press N key or click the compass indicator

#### 2.3.2 Navigation Sidebar

The left sidebar provides access to all GridDown panels organized into categories:

- **Core:** Map Layers, Waypoints, Routes, Offline Maps, GPS
- **Planning:** Logistics, Contingency, Terrain Analysis
- **Communications:** Radio Reference, APRS, Meshtastic, Team, SSTV, CoT Bridge
- **Sensors:** RadiaCode, RF Sentinel, FPV Drone Detections, SARSAT
- **Navigation:** Celestial Navigation, Star Identification, Camera Sextant, Rangefinder Resection, Inertial Navigation
- **Environment:** Weather, Satellite Imagery, Air Quality, Sun/Moon, Stream Gauges, Barometer
- **Reference:** Medical, Field Guides, Landmarks, SOS/Emergency
- **Discovery:** Global Search, Situation Wizard
- **System:** Settings, Print/Export

#### 2.3.3 Status Bar

The bottom status bar displays current coordinates (multiple formats available), zoom level, GPS status and accuracy, and connection indicators for active devices.

#### 2.3.4 Mobile Interface

On mobile devices, GridDown provides additional interface elements:

- **Floating Action Button (FAB):** Quick access to common actions including Add Waypoint, Measure, Compass, Help Me, and more
- **Battery Status:** Visual indicator of device battery level
- **Connection Status:** Network connectivity indicator
- **PWA Install Prompt:** Guided installation as a standalone app
- **Haptic Feedback:** Tactile responses for buttons and navigation alerts

---

## 3. Map & Navigation

### 3.1 Map Sources

GridDown supports 15+ map tile sources, selectable from the Map Layers panel:

| Source | Type | Best For |
|--------|------|----------|
| OpenStreetMap | Street | General navigation, urban areas |
| USGS Topo | Topographic | Hiking, terrain analysis (US only) |
| USGS Imagery | Satellite | Aerial reconnaissance (US only) |
| USFS Topo | Forest Service | National forests, trails (US only) |
| Esri World Imagery | Satellite | Global satellite imagery |
| Esri World Topo | Topographic | Global topographic coverage |
| NASA GIBS (VIIRS) | Satellite | Daily global true-color imagery |
| NASA GIBS (MODIS) | Satellite | Daily Terra satellite imagery |
| OpenTopoMap | Topographic | European hiking maps |
| Stamen Terrain | Terrain | Hillshade visualization |

> **Tip:** Download multiple map sources for the same region to have alternatives if one source fails.

### 3.2 Coordinate Formats

GridDown displays coordinates in your preferred format. Switch between formats in Settings:

| Format | Example | Common Use |
|--------|---------|------------|
| DD | 37.7749, -122.4194 | GPS devices, digital |
| DMS | 37°46'29.6"N 122°25'9.8"W | Traditional maps |
| DDM | 37°46.494'N 122°25.164'W | Marine navigation |
| UTM | 10S 551234 4182341 | Military, hiking |
| MGRS | 10SEG 51234 82341 | Military grid |

#### 3.2.1 Coordinate Converter

The Coordinate Converter panel provides full-featured coordinate tools. Paste or type coordinates in any format and GridDown will automatically detect and parse them. Features include instant conversion between all five formats, distance calculator between two coordinate pairs, quick copy buttons for each output format, and direct integration with the map (navigate to any parsed coordinate).

### 3.3 GPS Tracking

Enable GPS tracking to display your current position on the map. Open the GPS panel, click Enable GPS Tracking, and grant location permission when prompted. Your position appears as a blue dot with accuracy circle.

GPS features include current position display with accuracy indicator, speed and heading (when moving), altitude from GPS or barometer, track recording for later analysis, and magnetic declination adjustment.

### 3.4 Turn-by-Turn Navigation

For routes with multiple waypoints, GridDown provides voice-guided navigation. Create or load a route, open the Navigation panel, select your route and tap Start Navigation, then follow voice prompts and on-screen directions.

Navigation features include voice announcements for turns and waypoints, off-route alerts with recalculation suggestions, distance and ETA to next waypoint, breadcrumb trail showing your path, and compass bearing to destination.

---

## 4. Waypoints & Routes

### 4.1 Creating Waypoints

Waypoints mark important locations in your operational area. Long-press (touch) or right-click (mouse) on the map, select Add Waypoint, enter details, and select the appropriate type.

#### 4.1.1 Waypoint Types

| Type | Icon | Use Case | Special Fields |
|------|------|----------|----------------|
| Water | 💧 | Water sources | Flow rate, treatment required |
| Fuel | ⛽ | Fuel caches, gas stations | Fuel type, quantity |
| Camp | 🏕️ | Campsites, rest areas | Capacity, amenities |
| Resupply | 📦 | Supply points | Operating hours, contact |
| Hazard | ⚠️ | Dangers to avoid | Hazard type, severity |
| Bail-out | 🚁 | Emergency extraction points | Access method, capacity |
| Custom | 📍 | General purpose | User-defined fields |

#### 4.1.2 Waypoint Verification

Mark waypoints as Verified after confirming their accuracy in the field. Unverified waypoints display with a dotted border as a visual reminder.

### 4.2 Building Routes

Routes connect waypoints into navigable paths. Open the Routes panel, click New Route, click on the map to add route points, drag points to adjust, set terrain type for each segment, and click Save Route when complete.

#### 4.2.1 Terrain Classifications

| Terrain | Description | Speed Factor |
|---------|-------------|-------------|
| Highway | Paved roads, high speed | 1.0× |
| Road | Maintained roads | 0.8× |
| Trail | Established trails | 0.5× |
| Technical | Off-trail, difficult terrain | 0.3× |

#### 4.2.2 Elevation Profiles

View elevation changes along your route by opening a saved route and clicking View Elevation Profile. The profile shows elevation gain/loss, grade percentages, difficulty, and you can hover over it to highlight the corresponding map location.

### 4.3 Import & Export

GridDown supports standard GPS data formats including GPX (GPS Exchange Format) for importing waypoints, routes, and tracks from GPS devices, and KML/KMZ (Google Earth) for importing placemarks and paths. Both formats preserve waypoint types, notes, and timestamps.

---

## 5. Offline Maps

### 5.1 Why Download Maps?

Downloading maps for offline use is critical for GridDown's core mission. It ensures map availability when internet is unavailable, provides faster loading with no network latency, reduces data usage in the field, and enables true infrastructure independence.

### 5.2 Downloading Map Regions

1. Open the Offline Maps panel
2. Click Draw Region
3. Draw a polygon on the map covering your area of operations
4. Select zoom levels to download (10–17 recommended)
5. Choose map sources to download
6. Click Download and wait for completion

**Storage Estimate:** A 50 km × 50 km area at zoom levels 10–16 requires approximately 200–400 MB of storage.

### 5.3 Managing Offline Storage

The Offline Maps panel shows total tiles downloaded, storage space used, downloaded regions (deletable individually), and cache health statistics. GridDown monitors available storage and alerts you at 80%, 90%, and 95% capacity. Access storage management from Settings > Storage or click the warning banner.

---

## 6. Celestial Navigation

GridDown includes a comprehensive celestial navigation system for GPS-denied navigation using the stars, sun, moon, and planets. This eight-phase module enables position fixing without any electronic navigation aids.

> **Important:** Celestial navigation features are educational aids and require proper training. Do not rely on celestial navigation without formal training. Always maintain backup navigation methods.

### 6.1 Celestial Almanac

The almanac provides real-time positions for 58 navigation stars, the Sun, Moon, and four planets (Venus, Mars, Jupiter, Saturn). Data includes Greenwich Hour Angle (GHA), declination, altitude, azimuth, and star magnitude. All calculations run locally with zero external dependencies.

### 6.2 Celestial Observations

Record altitude observations of celestial bodies with automatic corrections for dip, refraction, semi-diameter (Sun/Moon), and parallax (Moon). Observations include timestamp, body selection, sextant altitude, and eye height. Corrected altitudes feed directly into sight reduction.

### 6.3 Sight Reduction & Position Fix

Perform sight reduction calculations to produce Lines of Position (LOPs). Two or more LOPs generate an estimated position fix. The system uses an assumed position, calculates intercept and azimuth, plots LOPs on the map, and triangulates your position. An emergency position fix can be obtained from a minimum of two celestial body sightings.

### 6.4 Star Chart

An interactive sky chart displays all visible celestial bodies from your current location. The chart updates in real time, shows constellation groupings, and allows you to select bodies for observation. Star magnitudes are visually represented by marker size.

### 6.5 Star Identification (AR)

Point your phone at the night sky to automatically identify stars and celestial bodies using augmented reality. The system uses device orientation sensors to determine camera pointing direction and overlays star names, magnitudes, and constellations on the camera view.

Features include real-time identification of 57 navigation stars, 4 planets, and the Moon; brightness-scaled markers with constellation labels; tap-to-select for observation; and smart recommendations sorted by observation suitability (preferring mid-altitude stars at 30–60°).

### 6.6 Camera Sextant

Use your phone's camera and motion sensors to measure celestial body altitudes without specialized equipment. The camera sextant provides a live camera view with crosshairs, a bubble level indicator, horizon calibration, and multi-sample averaging. Estimated accuracy is ±1–2° (compared to 0.1° for a real sextant). Measurements integrate directly with the observation workflow.

### 6.7 Dead Reckoning Integration

Combine celestial fixes with dead reckoning to maintain position awareness between sightings. Enter course and speed to project your position forward from the last known fix. The system accounts for current, drift, and elapsed time.

### 6.8 Training Mode & Primitive Methods

Learn traditional navigation techniques that require no instruments:

- **Shadow Stick Method:** Determine true north using the sun and a stick
- **Watch Method:** Find local noon without declination tables
- **Hand Measurement:** Estimate angular distances using hand spans
- **Horizon Distance Calculator:** Calculate visible distance based on observer height

All training methods work completely offline.

---

## 7. GPS-Denied Navigation

GridDown provides multiple methods for navigation when GPS is unavailable, jammed, or degraded.

### 7.1 Inertial Navigation (PDR)

The Pedestrian Dead Reckoning (PDR) system uses your device's accelerometer and gyroscope to track movement without GPS. It works in tunnels, buildings, canyons, and during GPS jamming or spoofing scenarios.

> **Warning:** Smartphone sensor-based navigation accumulates errors over time. Accuracy degrades significantly over distances greater than 1–2 km. Use only as a temporary measure and recalibrate frequently when GPS becomes available.

### 7.2 Rangefinder Resection

Calculate your position without GPS using distance measurements to known landmarks. Works with any rangefinder (laser, optical) or even estimated distances.

Workflow:

1. Add 3+ landmarks from waypoints, the landmark database, or by tapping on the map
2. Measure distance to each with any rangefinder
3. Enter distances into GridDown
4. View GDOP (Geometric Dilution of Precision) quality indicator
5. Calculate position fix with accuracy estimation
6. Apply calculated position to map

The system uses Gauss-Newton nonlinear least squares with local ENU coordinate conversion. GDOP quality ratings: Excellent (<2), Good (<4), Moderate (<6), Poor (>6).

### 7.3 Landmark Database

GridDown includes 3,100+ public domain landmarks from US government databases for use in resection and general navigation:

| Source | Data Type | Example |
|--------|-----------|---------|
| USGS GNIS | Peaks, summits, features | Mount Whitney (4,421m) |
| FAA DOF | Towers, antennas | Sutro Tower (298m) |
| NGS | Survey benchmarks | High-precision markers |
| USFS | Fire lookouts | Keller Peak Lookout |

Landmarks can be searched via Ctrl+K, shown on the map, added to resection calculations, saved as waypoints, or used for coordinate reference. All data is public domain (US Government works) and bundled with the application for offline use.

---

## 8. Communications

### 8.1 Radio Frequency Reference

The Radio Reference panel provides quick access to common frequencies for FRS (22 channels, 462/467 MHz, license-free), GMRS (30 channels, 462/467 MHz, FCC license required), MURS (5 channels, 151/154 MHz, license-free), and Marine VHF (Channel 16 distress, Channel 9 calling, WX1–WX7 weather).

### 8.2 APRS Integration

Automatic Packet Reporting System provides real-time position tracking over amateur radio. Connect your APRS TNC (such as Mobilinkd) via Bluetooth, configure your callsign and SSID, and enable position beaconing. Features include real-time station tracking on map, distance and bearing to each station, message sending, and weather station data display.

> **Requirement:** Valid amateur radio license required for transmitting on APRS frequencies.

### 8.3 Meshtastic Integration

Meshtastic provides off-grid mesh networking without amateur radio licensing. GridDown includes a comprehensive Meshtastic integration with real device communication via the official @meshtastic/js library, supporting dozens of features for field communication.

#### 8.3.1 Connecting a Meshtastic Device

GridDown supports both Bluetooth (BLE) and Serial (USB) connections. A device-type selector helps you choose the correct connection method for your hardware:

| Device | Bluetooth | Serial/USB | GPS | Notes |
|--------|-----------|------------|-----|-------|
| WisMesh Pocket | Yes | No | Yes | BLE only; USB is charging only |
| T-Echo | Yes | No | Yes | BLE only; compact e-ink display |
| T-Beam | Yes | Yes | Yes | Dual-mode; long range |
| Heltec V3 | Yes | Yes | No | Dual-mode; OLED display |
| RAK WisBlock | Yes | Yes | Optional | Modular; varies by configuration |
| Station G2 | Yes | Yes | Yes | Base station; high power |

When you select a device type, GridDown automatically disables unsupported connection options. For example, selecting WisMesh Pocket disables the Serial/USB button and shows a note that USB is for charging only.

#### 8.3.2 First-Run Setup Wizard

The first time you open the Meshtastic panel, a 4-step guided wizard walks you through initial configuration:

1. **Name:** Set your mesh display name and 4-character short ID
2. **Region:** Select your regulatory region for legal radio operation
3. **Pair Device:** Connect via Bluetooth or Serial
4. **Scenario:** Choose an operational preset (see below)

#### 8.3.3 Scenario Presets

Quickly configure your mesh radio for different operational scenarios:

| Preset | Modem | Hop Limit | Position Interval | Use Case |
|--------|-------|-----------|-------------------|----------|
| Search & Rescue | Long Fast | 5 | 60 sec | Wide-area SAR operations |
| Field Exercise | Medium | 3 | 120 sec | Training, exercises |
| Event Coverage | Short Fast | 2 | 300 sec | Events, gatherings |
| Low Profile | Long Slow | 3 | 600 sec | Minimal RF signature |
| Emergency | Long Fast | 7 | 30 sec | Maximum range, rapid updates |
| Custom | User-defined | User-defined | User-defined | Full manual configuration |

Each scenario also configures appropriate canned messages. For example, SAR presets include "Found subject," "Need medical," and "Grid clear."

#### 8.3.4 Text Messaging

Send and receive text messages across the mesh network. Channel messages are visible to all nodes on the same channel. Features include:

- Multi-channel support with unread indicators per channel
- Delivery status tracking: Queued → Pending → Sent → Delivered → Read
- Message context menu: copy, retry, delete
- Canned messages bar with 8 quick-send slots (OK, Copy, Moving, At Rally, RTB, Need Assistance, Holding, Task Complete)

#### 8.3.5 Direct Messages (Encrypted)

Send private, encrypted messages to individual mesh nodes using ECDH P-256 key exchange with AES-256-GCM encryption. Features include dedicated DM conversation threads per contact, delivery status and read receipts (configurable), unread indicators per contact, and key verification via 16-character fingerprints. Verified contacts display a checkmark badge.

#### 8.3.6 Position Sharing

Automatic position broadcasting at configurable intervals. All mesh nodes with valid positions appear on the GridDown map with signal quality indicators. Shared data includes coordinates, altitude, speed, and heading.

#### 8.3.7 Drop Pin → Send to Mesh

Right-click any location on the map and select "Send to Mesh" to share that position with the network. Add an optional label, choose to broadcast to all nodes or a specific node. The position is sent in dual format: a text message with coordinates and a Meshtastic waypoint packet.

#### 8.3.8 Waypoint & Route Sharing

Share saved waypoints as interactive pins that other GridDown users can view on their maps. Routes are chunked to fit within the ~237-byte Meshtastic payload limit, with terrain classification preserved.

#### 8.3.9 Traceroute Visualization

Click the traceroute button next to any team member to visualize the mesh network path to that node. The display shows hop-by-hop routing with signal quality at each relay, round-trip time (RTT) measurement, and path visualization on the map. Useful for network debugging, mesh optimization, relay placement, and signal analysis.

#### 8.3.10 Offline Message Queue

When the mesh network is temporarily unavailable, messages are automatically queued for later delivery. The queue uses exponential backoff retry (5s, 15s, 30s) with a maximum of 3 retries per message. The queue persists across app restarts and its status is visible in the mesh health dashboard.

#### 8.3.11 Mesh Health Dashboard

Monitor overall mesh network health at a glance:

- **Health Score:** 0–100 rating with status: Excellent (80+), Good (60+), Fair (40+), Poor (<40)
- **Active Nodes:** Count of nodes seen within the last 5 minutes
- **Signal Distribution:** Breakdown of signal quality across all nodes
- **Average SNR and RSSI:** Network-wide signal metrics
- **Queue Status:** Pending messages and retry state
- **Scenario Badge:** Currently active preset

#### 8.3.12 Device Configuration

Configure your Meshtastic device directly from GridDown:

- **Region Code:** 22 supported regions for legal operation
- **Modem Preset:** Long Fast, Long Slow, Medium, Short Fast, and more
- **TX Power:** 1–30 dBm or device default
- **Hop Limit:** 1–7 hops for mesh relay depth
- **Channel URL Import/Export:** Paste or generate `meshtastic://` and web URLs to share channel configurations
- **Firmware Version:** Displays current version with update status indicator
- **Hardware Model Detection:** Identifies device capabilities (GPS, WiFi, Bluetooth)

#### 8.3.13 Telemetry Export

Export mesh network data for analysis and record-keeping:

- **Node List CSV:** Signal quality, position, firmware, and status for all nodes
- **Message History CSV:** Complete message timeline with delivery status
- **Mesh Health Report (JSON):** Signal distribution, device configuration snapshot
- **Full Telemetry Report (JSON):** Nodes, messages, traceroutes, and configuration

#### 8.3.14 Emergency Features

Send SOS emergency beacons with your current position to the entire mesh network. Quick check-in messages with preset status indicators allow rapid team accountability.

#### 8.3.15 Team QR Onboarding

Generate a QR code or URL that bundles your channel settings and scenario preset. New team members scan the code to instantly join your mesh configuration without manual setup.

### 8.4 Team Management

Coordinate team members with real-time status tracking, distance and bearing to each member, rally point management, and team health monitoring.

### 8.5 SSTV (Slow Scan Television)

Send and receive images over radio using audio tones — no internet required.

#### 8.5.1 Supported Modes

| Mode | Resolution | Duration | Best For |
|------|-----------|----------|----------|
| Robot 36 | 320×240 | 36 sec | Quick reconnaissance |
| Martin M1 | 320×256 | 114 sec | Standard quality |
| Scottie S1 | 320×256 | 110 sec | Alternative to Martin |
| PD-90 | 320×256 | 90 sec | Moderate speed |
| PD-120 | 640×496 | 126 sec | High resolution |
| PD-180 | 640×496 | 180 sec | Higher quality |
| PD-290 | 800×616 | 290 sec | Maximum resolution |

Receiving features include auto mode detection, waterfall display, signal quality meter, and image history. Transmitting includes image loading (camera, gallery, or map capture), annotation tools (draw, text, arrows), mode selection, and automatic callsign overlay.

#### 8.5.2 AI Enhancement

Enhance received SSTV images with AI-powered tools running entirely on your device: 2× and 4× upscaling using neural networks, noise reduction for radio interference, and OCR to extract callsigns and grid squares. All processing is local — no cloud services used.

### 8.6 CoT Bridge (Cursor on Target)

The CoT Bridge enables bidirectional communication with CoT-compatible tactical applications such as ATAK (Android Team Awareness Kit) and WinTAK. This allows GridDown to share and receive position data with TAK-based tactical networks.

Features include a guided setup wizard for bridge connection, sending your position to the CoT network, receiving and displaying positions from TAK users on the GridDown map, team color and callsign display, and speed/heading indicators.

> **Privacy Notice:** When position sharing is enabled, your GPS coordinates, callsign, team color, and speed/heading are visible to all devices on the CoT multicast network. Sharing is off by default and requires explicit consent. All communication is peer-to-peer on your local network — no data passes through any server.

### 8.7 Communication Plan Generator

Generate structured communication plans for your team including assigned frequencies, callsigns, check-in schedules, and emergency procedures. Plans can be printed as part of your paper backup package.

---

## 9. Sensors & Detection

### 9.1 RadiaCode Gamma Spectrometer

Connect RadiaCode 101/102/103/110 devices for radiation monitoring via Bluetooth.

Features include real-time dose rate display (μSv/h), count rate monitoring (CPS), 1024-channel gamma spectrum analysis, isotope identification (Cs-137, K-40, Co-60, etc.), GPS-tagged radiation mapping with track recording, and threshold-based alerts.

#### 9.1.1 Alert Thresholds

| Level | Threshold | Indicator | Action |
|-------|-----------|-----------|--------|
| Normal | < 0.3 μSv/h | Green | Normal background |
| Elevated | 0.3 – 1.0 μSv/h | Yellow | Investigate source |
| Warning | 1.0 – 10 μSv/h | Orange | Limit exposure time |
| Alarm | > 10 μSv/h | Red | Evacuate area |

A Demo Mode is available for testing features without hardware.

### 9.2 RF Sentinel

Connect to an RF Sentinel SDR receiver for multi-protocol RF detection and situational awareness.

#### 9.2.1 Detection Types

| Type | Frequency | Description |
|------|-----------|-------------|
| Aircraft (ADS-B) | 1090 MHz | Commercial and general aviation aircraft |
| Ships (AIS) | 162 MHz | Maritime vessels |
| Drones (Remote ID) | 2.4 GHz | UAVs with FAA Remote ID |
| FPV Drones | Various | FPV/racing drones detected by RF signature |
| Radiosondes | 400 MHz | Weather balloons |
| APRS | 144.39 MHz | Amateur radio stations |

#### 9.2.2 FPV Drone Detections

The FPV Drone Detections panel displays drones detected by RF signature analysis through RF Sentinel Pro. For each detected drone, the panel shows protocol type, operating frequency and band, signal strength (dBm), active links (video, telemetry, control), and correlation with Remote ID when available. This capability is useful for airspace awareness, security monitoring, and counter-UAS applications.

#### 9.2.3 Connection Methods

RF Sentinel supports WebSocket (real-time push, recommended), MQTT (pub/sub via broker), and REST Polling (periodic fetch every 5 seconds). All methods connect over your network to the RF Sentinel hardware.

#### 9.2.4 Emergency Detection

RF Sentinel alerts on emergency conditions: Aircraft Squawk 7500 (hijacking), 7600 (radio failure), 7700 (general emergency), AIS SART (search and rescue transponder), AIS MOB (man overboard), and AIS EPIRB (emergency beacon).

#### 9.2.5 FIS-B Weather

RF Sentinel can receive aviation weather via FIS-B (978 MHz UAT): METARs, TAFs, SIGMETs, PIREPs, and TFRs. Enable FIS-B Weather Source in RF Sentinel settings for true infrastructure-independent weather data.

### 9.3 SARSAT Beacon Receiver

Monitor COSPAS-SARSAT 406 MHz emergency beacons with external SDR hardware.

#### 9.3.1 Beacon Types

| Type | Name | Use Case |
|------|------|----------|
| PLB | Personal Locator Beacon | Hikers, adventurers |
| ELT | Emergency Locator Transmitter | Aviation emergencies |
| EPIRB | Emergency Position-Indicating Radio Beacon | Maritime distress |
| SSAS | Ship Security Alert System | Ship security threats |

Hardware requirements: Raspberry Pi 4 or 5, RTL-SDR Blog V4 (or compatible SDR), 406 MHz antenna (~18.5 cm quarter-wave whip), and optional bandpass filter and LNA.

> **Legal Notice:** SARSAT reception is for supplementary monitoring only. This system does not replace official search and rescue services. Receiving 406 MHz signals is legal; transmitting is strictly prohibited.

---

## 10. Planning Tools

### 10.1 Logistics Calculator

Calculate resource requirements for your mission based on personnel, vehicles, terrain, and duration. The calculator provides total fuel required with safety margin, water requirements adjusted for temperature, food/calorie requirements, critical resupply points along route, and what-if analysis (e.g., what if this cache is empty?).

#### 10.1.1 Vehicle Profiles

| Profile | Base MPG | Terrain Factor |
|---------|----------|----------------|
| 4×4 Truck | 15 mpg | 0.7–1.0× |
| Jeep/SUV | 18 mpg | 0.6–1.0× |
| ATV/UTV | 25 mpg | 0.5–0.9× |
| Motorcycle | 45 mpg | 0.7–1.0× |

#### 10.1.2 Personnel Profiles

| Profile | Water/Day | Calories/Day | Terrain Factor |
|---------|-----------|-------------|----------------|
| Fit Adult | 3 liters | 3,000 kcal | 1.0× |
| Average Adult | 2.5 liters | 2,500 kcal | 0.8× |
| Child | 1.5 liters | 1,800 kcal | 0.6× |
| Elderly | 2 liters | 2,000 kcal | 0.5× |

### 10.2 Contingency Planning

Prepare for the unexpected with bail-out analysis (nearest bail-out points with distance, bearing, terrain difficulty, and estimated travel time), checkpoint generation (configurable interval, coordinates in all formats, exportable for radio comms), and alternative route comparison (primary vs. alternate routes with distance, elevation, and terrain comparison).

### 10.3 Terrain Analysis

Analyze terrain for tactical planning including slope analysis for trafficability, aspect analysis (slope direction), viewshed calculation for observation posts, solar exposure scoring for camp site selection, flood risk assessment, and cover and concealment analysis.

#### 10.3.1 RF Line-of-Sight Analysis

A comprehensive radio path analysis tool located in the Radio Reference panel under the LOS tab. Select two points on the map and analyze RF propagation between them.

Analysis features include terrain elevation profile with interactive chart, Fresnel zone calculation with clearance percentage, earth curvature correction using 4/3 atmospheric refraction model, free-space path loss estimation in dB, obstruction detection with visual markers on the map, and color-coded path overlay (green = clear, yellow = marginal, red = obstructed).

The tool includes 9 frequency presets for common radio services:

| Preset | Frequency | Use Case |
|--------|-----------|----------|
| Meshtastic US | 915 MHz | LoRa mesh networking (Americas) |
| Meshtastic EU | 868 MHz | LoRa mesh networking (Europe) |
| 2m Amateur | 146 MHz | VHF amateur radio |
| 70cm Amateur | 446 MHz | UHF amateur radio |
| GMRS | 462 MHz | General Mobile Radio Service |
| FRS | 467 MHz | Family Radio Service |
| MURS | 151 MHz | Multi-Use Radio Service |
| Marine VHF | 156.8 MHz | Maritime communications |
| CB Radio | 27 MHz | Citizens Band |

You can also enter a custom frequency. The analysis includes configurable antenna heights for both endpoints.

#### 10.3.2 Measurement Tool

Measure distances and areas directly on the map. Access via the sidebar or the mobile FAB menu. Click points on the map to create a measurement path showing cumulative distance between points. Close the path to calculate enclosed area. Measurements display in your configured distance units.

---

## 11. Environmental Data

### 11.1 Weather

GridDown provides weather from multiple sources depending on connectivity:

- **Internet Weather (Open-Meteo):** Current conditions, 7-day forecast, alerts, precipitation probability
- **FIS-B Weather (RF Sentinel):** METARs, TAFs, SIGMETs from aviation weather broadcast — works without internet
- **Waypoint Weather:** Click any waypoint to view weather and air quality at that location

### 11.2 Satellite & Radar Imagery

View weather satellite and radar imagery as map overlays:

| Layer | Source | Coverage | Update Interval |
|-------|--------|----------|-----------------|
| NEXRAD Radar | NOAA/IEM | United States | 5 minutes |
| Satellite (VIIRS) | NASA GIBS | Global (daily) | 24 hours |
| Terra (MODIS) | NASA GIBS | Global (daily) | 24 hours |

Overlays can be toggled on/off and opacity adjusted. All imagery is from US Government sources (public domain).

### 11.3 Air Quality Index (AQI)

Comprehensive air quality monitoring powered by EPA AirNow (covering US, Canada, and Mexico). The AQI panel displays current AQI value and category, pollutant breakdown (PM2.5, PM10, O3, NO2, SO2, CO), and health recommendations for each level.

#### 11.3.1 AQI Map Overlay

Toggle the AQI map overlay to display color-coded monitoring station markers across the map. Each marker shows the real-time AQI value and is colored according to EPA standard categories (green/yellow/orange/red/purple/maroon). Hover or tap any marker for detailed station information. The overlay refreshes automatically when you pan or zoom.

#### 11.3.2 AQI Alerts & Monitoring

Enable automated AQI monitoring to receive alerts when air quality deteriorates. Features include:

- **Configurable alert thresholds:** Caution (101+), Warning (151+), Critical (201+), Emergency (301+)
- **Sensitive Groups mode:** Lowers all thresholds by 50 points for at-risk individuals
- **AQI forecasts:** Next-day forecast alerts for expected poor air quality
- **Push notification support** (requires browser permission)
- **15-minute automatic check interval** with manual refresh option
- **Alert history display** showing the last 5 alerts

> **Note:** AQI data is preliminary and subject to change. Sensor coverage varies by location. An AirNow API key is required (free, instant approval) and can be configured in Settings.

### 11.4 Sun/Moon Calculator

Plan activities around daylight and lunar cycles with sunrise/sunset times, golden hour and blue hour, civil/nautical/astronomical twilight, moonrise/moonset, moon phase and illumination percentage, and lunar calendar for mission planning.

### 11.5 Magnetic Declination

Automatic declination calculation for current position, displaying true vs. magnetic bearing, annual change rate, and integration with all bearing calculations throughout the application.

### 11.6 Stream Gauges

Monitor water levels at USGS gauge stations (US only) with real-time flow rate (cfs), current gauge height, flood stage indicators, and historical trends. Useful for crossing planning, water source assessment, and flood awareness.

### 11.7 Barometric Altimeter

Use the device pressure sensor for altitude measurement with significantly better accuracy than GPS altitude (±1–3m vs GPS ±10–50m). Works indoors and in canyons where GPS struggles. Requires Android Chrome with a device that has a barometer sensor.

Calibration options include one-click sync to GPS altitude, manual altitude entry, and adjustable sea-level reference (QNH). Calibration persists across sessions.

The pressure trend analysis monitors barometric changes over 3–6 hours and displays weather tendency predictions:

- **Storm approaching:** Rapid pressure fall (>2 hPa/hr)
- **Weather deteriorating:** Slow pressure fall
- **Stable conditions:** Minimal pressure change
- **Weather improving:** Slow pressure rise
- **High pressure building:** Rapid pressure rise

A mini-chart displays 6-hour pressure history for visual trend analysis.

---

## 12. Search & Discovery

### 12.1 Global Search (Ctrl+K)

GridDown features a comprehensive global search system accessible with Ctrl+K (or via the mobile FAB menu). The search indexes everything in the application using fuzzy matching that tolerates typos.

#### 12.1.1 Search Categories

| Category | Shortcut | Content |
|----------|----------|---------|
| Actions | a | 25+ executable commands (add waypoint, measure distance, start navigation, etc.) |
| Waypoints | w | All saved waypoints with coordinates |
| Routes | r | All saved routes with distance and duration |
| Team | t | Team members with status |
| Frequencies | f | Radio frequency database |
| Coordinates | c | Coordinate conversion |
| Celestial | s | 58 navigation stars, planets, Sun, and Moon with live positions |
| Landmarks | l | 3,100+ public domain landmarks |

#### 12.1.2 Contextual Suggestions

When opening search with no query, GridDown displays intelligent contextual suggestions: weather alerts, currently visible celestial bodies (with altitude/azimuth), active navigation status, recent actions, and quick-action buttons for common tasks.

#### 12.1.3 Search Favorites

Press Ctrl+D while viewing a search result to save it as a favorite. Favorites appear at the top of search results for quick access and persist across sessions.

### 12.2 Situation Wizard (F1)

The Situation Wizard is a stress-friendly decision tree that helps you find the right tool for your current situation. Access it with F1, Ctrl+/, or via the mobile FAB menu.

The wizard covers five main branches:

- **Lost / Need Position:** GPS, landmarks, celestial navigation, dead reckoning
- **Emergency:** Rescue, medical, signaling, shelter
- **Need to Communicate:** Meshtastic, ham/GMRS radio, APRS, satellite tips
- **Navigation Help:** Follow a route, compass bearing, off-route guidance, terrain navigation
- **Trip Planning:** Route builder, logistics, contingency plans, offline maps
- **Weather / Environment:** Forecast, barometer, sun/moon, radiation monitoring

Each solution screen includes numbered step-by-step instructions, quick-action buttons that open the relevant panels, and expert tips. Emergency branches display with urgent banners and animation.

---

## 13. Reference Materials

### 13.1 Medical Reference

Access critical medical information offline covering trauma (hemorrhage, fractures, burns, head injury), medical emergencies (cardiac, respiratory, diabetic), environmental injuries (heat/cold, altitude sickness, drowning), and toxicology (poisoning, envenomation, overdose). Quick reference includes vital signs by age, CPR guidelines, Rule of 9s for burns, Glasgow Coma Scale, and hemorrhage classification.

> **Disclaimer:** Medical reference is for trained personnel. Always follow your training and local protocols.

### 13.2 Field Guides

Comprehensive offline reference library with 600+ entries covering foraging (150+ edible plants, mushrooms, wild foods), medicinal plants (100+ species with preparation), wildlife, hazards, survival skills (fire, shelter, water, navigation), and knots/lashing (50+ tutorials). Features include full-text search, favorites, regional filtering, and seasonal availability indicators.

### 13.3 SOS/Emergency

Quick access to emergency resources including emergency contact management, quick-dial emergency numbers, international distress signals, signal mirror sun angle calculator, and emergency frequencies reference.

---

## 14. Export & Printing

### 14.1 Print Documents

Generate paper backups for when electronics fail. Document types include Full Operational Plan (complete mission package), Route Cards (turn-by-turn directions), Waypoint Lists (grouped by type with coordinates in all formats), Communication Plan (frequencies, callsigns, schedule), and Quick Reference Card (pocket-sized essential info).

### 14.2 Data Export

Export data in GPX (universal GPS exchange format), KML/KMZ (Google Earth compatible), and GeoJSON (radiation tracks and analysis data).

### 14.3 Encrypted Plan Sharing

Share complete plans securely by selecting data to include, entering an encryption passphrase, and exporting a .gdplan file. Recipients import the file and enter the passphrase to decrypt. Encryption uses AES-256-GCM with passphrase-derived key. The passphrase is never stored or transmitted.

---

## 15. System Monitoring

GridDown includes five system monitoring modules that provide real-time status information and proactive alerts about your device and connectivity.

### 15.1 Offline Status Indicator

A persistent red banner appears at the top of the screen when your device loses internet connectivity. The banner includes a pulsing icon, a "Using cached data" reassurance message, and a live duration counter showing how long you have been offline. When connectivity is restored, a green toast notification confirms you are back online and shows how long the outage lasted.

### 15.2 Network Quality Indicator

Displays real-time connection quality using signal strength bars rated Excellent, Good, Fair, or Poor. Detects your connection type (4G, 3G, 2G, WiFi), measures latency, and estimates tile download times based on current network conditions. Helps you decide whether to download offline maps before connectivity degrades.

### 15.3 Storage Quota Warning

Monitors browser storage usage and warns when approaching limits. Visual progress bar shows remaining space with alerts at 80%, 90%, and 95% thresholds. Includes a quick link to manage offline tile storage when space is running low.

### 15.4 Update Notifications

Automatically detects when a new version of GridDown is available. Displays a non-intrusive toast notification with a "Refresh Now" button for instant update or a "Later" button to dismiss temporarily.

### 15.5 Browser Compatibility Detection

On first visit, GridDown checks your browser and platform against its feature matrix and displays a collapsible compatibility banner:

| Level | Browsers | Notes |
|-------|----------|-------|
| Full | Chrome/Edge on Android | All features including Web Bluetooth and barometer |
| Partial | Chrome/Edge on Desktop | Most features; no barometer sensor |
| Limited | Safari, Firefox | Core features only; no hardware integration |
| Unsupported | No Service Worker | Application will not function offline |

When you attempt to use an unsupported feature (such as connecting a Meshtastic device in Firefox), a warning modal identifies the missing API, shows your current browser, and recommends Chrome on Android for full support.

---

## 16. Settings & Customization

### 16.1 Display Settings

Configure coordinate format (DD, DMS, DDM, UTM, MGRS), distance units (miles, kilometers, nautical miles), map rotation behavior, and label visibility at zoom levels.

### 16.2 Night Modes

Preserve night vision with three display modes: Standard Dark (normal dark theme), Red Light (red-tinted display for night vision preservation), and Blackout (minimal screen glow for light discipline).

### 16.3 Accessibility

GridDown includes comprehensive accessibility features: WCAG 2.1 compliance, screen reader compatibility (417+ ARIA attributes), keyboard navigation support, reduced motion option, and skip-to-content navigation.

### 16.4 Undo/Redo

Undo and redo waypoint and route operations with Ctrl+Z and Ctrl+Shift+Z. The undo toolbar appears in the Waypoints and Routes panels showing available undo/redo actions. Operations that can be undone include creating, editing, and deleting waypoints, as well as route modifications.

### 16.5 Onboarding Tour

A 9-step guided tour introduces new users to GridDown's main features including map navigation, waypoint creation, route building, offline maps, and panel access. The tour runs automatically on first launch and can be replayed at any time from Settings. Supports keyboard navigation (Esc to close, Enter and Arrow keys to navigate steps).

### 16.6 API Key Management

Configure API keys for external services in the Settings panel. Currently supports AirNow (Air Quality) API key configuration with a visual status indicator and direct link to obtain a free key (instant approval).

### 16.7 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+K | Open global search |
| F1 or Ctrl+/ | Open situation wizard |
| Ctrl+Z | Undo last action |
| Ctrl+Shift+Z | Redo |
| Ctrl+D | Toggle favorite (in search) |
| Escape | Close modal/panel/search |
| +/- | Zoom in/out |
| N | Reset map to north |
| Tab / Shift+Tab | Next/previous search category |

---

## 17. Troubleshooting

### 17.1 Bluetooth Devices Not Found

- Ensure device is powered on and in pairing mode
- Use Chrome or Edge (Firefox/Safari lack Web Bluetooth)
- Check that Bluetooth is enabled on your device
- Try restarting both the device and browser
- Ensure no other app is connected to the device

### 17.2 WebSocket Connection Failed

- Verify the server address and port are correct
- Ensure the server is running and accessible
- Check firewall settings
- Try the REST polling fallback option

### 17.3 Maps Not Loading

- Check internet connection (for online tiles)
- Verify offline tiles are downloaded for the area
- Try a different map source
- Clear browser cache and reload

### 17.4 GPS Not Working

- Ensure location permission is granted
- Check that GPS is enabled on device
- Move outdoors for better satellite signal
- Wait 30–60 seconds for initial fix

### 17.5 SSTV Audio Issues

- Ensure microphone permission is granted
- Check that the correct input device is selected
- Verify audio levels are adequate (check waterfall display)
- Adjust audio input level (avoid clipping) and reduce background noise
- Enable auto-slant correction in DSP settings

### 17.6 Celestial Navigation / Star ID Not Working

- Ensure device orientation permissions are granted (required for compass and star ID)
- Calibrate compass by moving device in a figure-8 pattern
- Star identification requires a clear sky and works best away from light pollution
- Camera sextant accuracy improves with horizon calibration

### 17.7 Storage Full

- Delete unused offline map regions
- Clear SSTV image history
- Export and delete old radiation tracks
- Use the storage management tool in Settings

### 17.8 Getting Help

If problems persist, check the browser console (F12) for error messages, try a different browser, clear all site data and reload, or contact support. Use the Situation Wizard (F1) for guided help finding the right feature.

---

## Appendix A: Quick Reference Card

### A.1 Emergency Frequencies

| Service | Frequency | Notes |
|---------|-----------|-------|
| Marine Distress | 156.8 MHz (Ch 16) | International distress |
| Air Distress | 121.5 MHz | Guard frequency |
| APRS (North America) | 144.39 MHz | NA APRS frequency |
| FRS Ch 1 | 462.5625 MHz | Common meeting channel |
| GMRS Ch 1 | 462.5625 MHz | Shared with FRS |
| CB Ch 9 | 27.065 MHz | Emergency channel |
| CB Ch 19 | 27.185 MHz | Highway channel |
| MURS Ch 1 | 151.82 MHz | License-free |

### A.2 Signal Reference

| Signal | Meaning |
|--------|---------|
| Three of anything | Distress signal (3 shots, 3 fires, 3 whistles) |
| SOS (••• ——— •••) | International distress (Morse code) |
| MAYDAY | Voice distress call (life-threatening) |
| PAN-PAN | Urgency call (not life-threatening) |
| One long whistle | Recall/assembly |
| Orange smoke | Visual distress signal |
| Mirror flash | Attract attention (use signal mirror calculator) |

### A.3 GPS-Denied Navigation Quick Guide

1. **Try GPS first** — Move outdoors, wait 60 seconds for fix
2. **Known landmarks visible?** — Use Rangefinder Resection (Section 7.2) with 3+ landmarks
3. **Stars/sun visible?** — Use Celestial Navigation (Section 6) for position fix
4. **Need to move without fix?** — Use Inertial Navigation PDR (Section 7.1) for short distances
5. **Have a compass bearing?** — Use Dead Reckoning with known course and speed
6. **Near a landmark?** — Search the Landmark Database (Section 7.3) via Ctrl+K

---

*GridDown v6.57.3 — BlackDot Technology*
*Navigate When Infrastructure Fails*
