# GridDown v6.57.42 Release Notes

## 🎯 What's New

This release fixes three Meshtastic protocol bugs discovered during a comprehensive feature audit: reversed longitude in location shares, channel management that never reached the device hardware, and GridDown protocol messages that exceeded the LoRa payload limit.

### Critical Fixes

- **Longitude direction reversed in location shares** — `sendLocation()` displayed East as West and vice versa in human-readable text messages sent to the mesh. The waypoint JSON had correct raw coordinates but any standard Meshtastic client showed the wrong hemisphere. Now correctly maps positive longitude to East and negative to West.

- **Channel management was local-only** — Creating, importing, or deleting channels only modified GridDown's internal list but never called `MeshtasticClient.setChannel()` to push changes to the device. Device-reported channels were also never synced into GridDown's state. Messages could be sent on wrong channel indices when the device's actual configuration didn't match GridDown's hardcoded defaults. Now fully bidirectional: device channels sync on connect, and GridDown channel changes push to device hardware.

- **Protocol messages exceeded LoRa payload limit** — SOS messages (238 bytes), waypoints (226 bytes), and longer encrypted DMs all exceeded Meshtastic's ~228 byte LoRa text payload, causing firmware to silently truncate (corrupting JSON → receiver parse failure → message lost). SOS — the most safety-critical message — always exceeded the limit even with empty defaults. Added automatic message compaction that shortens JSON field names when payloads exceed the limit, with expansion on the receive side. All 12 message types verified to fit within the 228-byte limit at worst-case field lengths.

---

### Previous Release: v6.57.31

- **AES-256-GCM encryption** — Team package encryption upgraded from XOR obfuscation (32-bit hash key) to AES-256-GCM via Web Crypto API with PBKDF2 key derivation (100k iterations, SHA-256, random salt + IV). Legacy packages remain importable via backward-compatible decryption path.

### New Module

- **QR Code Generator** (`qr-generator.js`, 609 lines) — Self-contained ISO 18004 QR encoder for offline team invite sharing. Byte mode, ECC level M (15% recovery), versions 1-13 (capacity up to 331 bytes). GF(256) Reed-Solomon error correction, all 8 mask patterns with penalty scoring. Replaces previous decorative pseudo-QR that no scanner could read.

---

## 📦 Installation

### Download & Run
1. Download and extract the zip
2. Serve with any static server:
   ```bash
   npx serve .
   # or
   python -m http.server 8000
   ```
3. Open http://localhost:8000

### Install as PWA
After opening in Chrome or Edge, click the install button or use your browser's "Install App" option. Full offline capability after first load.

---

## 🔧 Feature Overview

- **60 modules** providing comprehensive offline tactical planning
- **15+ map sources** including USGS, OpenTopoMap, satellite imagery
- **Offline map download** by drawing regions
- **RadiaCode radiation detector** with spectrum analysis, dose tracking, and heatmap overlay
- **Meshtastic mesh networking** with team coordination, position sharing, and encrypted messaging
- **AtlasRF integration** for multi-protocol RF detection (ADS-B, AIS, Remote ID, FPV, APRS)
- **SARSAT beacon detection** for 406 MHz PLB/ELT/EPIRB signals
- **CoT Bridge (TAK)** for interoperability with ATAK/WinTAK
- **Celestial navigation** with star identification, camera sextant, and ephemeris
- **Inertial navigation** with pedestrian dead reckoning for GPS-denied scenarios
- **GPX/KML import/export** with CSV and GeoJSON support
- **Turn-by-turn navigation** with voice guidance
- **Terrain analysis** with viewshed, line-of-sight, solar exposure, and flood risk
- **Radio frequency database** with comm planning and rally points
- **Encrypted plan sharing** with AES-256-GCM team packages
- **Weather integration** and barometric pressure tracking

See the [README](README.md) for complete documentation.

---

## 📊 Stats

- 60 JavaScript modules
- ~100,000 lines of code
- Fully offline-capable PWA
- Zero external dependencies at runtime
- Web Bluetooth and Web Serial hardware integration

---

## 🔄 Upgrading

If you have a previous version:
1. Replace all files with this release
2. Hard refresh browser (Ctrl+Shift+R)
3. The service worker will automatically update the cache to v6.57.28

---

**Full Changelog**: [CHANGELOG.md](CHANGELOG.md)
