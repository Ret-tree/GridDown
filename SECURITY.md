# Security Policy

**GridDown by BlackDot Technology**

Last updated: January 2025

---

## Our Commitment to Security

BlackDot Technology takes security seriously. GridDown is designed with a security-first mindset:

- **Offline-first architecture** minimizes attack surface
- **No user accounts** means no credentials to steal
- **Local data storage** keeps your information on your device
- **No cloud backend** eliminates server-side vulnerabilities
- **Open source** enables community security review

---

## Supported Versions

We provide security updates for the following versions:

| Version | Supported |
|---------|-----------|
| 6.x.x (current) | ✅ Yes |
| 5.x.x | ⚠️ Critical fixes only |
| < 5.0 | ❌ No |

**Recommendation**: Always use the latest version for the best security.

---

## Reporting a Vulnerability

### How to Report

If you discover a security vulnerability in GridDown, please report it responsibly:

**Email**: security@blackdot.tech

**Include in your report**:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact assessment
4. Any proof-of-concept code (if applicable)
5. Your suggested fix (optional but appreciated)

**PGP Key** (optional): Available at https://blackdot.tech/.well-known/security.txt

### What NOT to Do

- ❌ Do not publicly disclose the vulnerability before we've addressed it
- ❌ Do not exploit the vulnerability beyond what's necessary to demonstrate it
- ❌ Do not access, modify, or delete other users' data
- ❌ Do not perform denial of service attacks

---

## Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 7 days |
| Status update | Every 14 days until resolved |
| Fix development | Depends on severity (see below) |
| Public disclosure | After fix is released |

### Severity-Based Response

| Severity | Description | Target Fix Time |
|----------|-------------|-----------------|
| **Critical** | Remote code execution, data exfiltration | 24-72 hours |
| **High** | Authentication bypass, significant data exposure | 7 days |
| **Medium** | Limited data exposure, denial of service | 30 days |
| **Low** | Minor issues, hardening improvements | Next release |

---

## Safe Harbor

We support responsible security research. If you:

- Act in good faith
- Avoid privacy violations
- Avoid data destruction
- Report vulnerabilities promptly
- Allow reasonable time for fixes

We will:

- ✅ Not pursue legal action against you
- ✅ Work with you to understand and resolve the issue
- ✅ Credit you in security advisories (if desired)
- ✅ Keep you informed of our progress

---

## Scope

### In Scope

The following are within the scope of our security policy:

| Component | Examples |
|-----------|----------|
| **Web Application** | XSS, CSRF, injection vulnerabilities |
| **Data Storage** | IndexedDB security, localStorage handling |
| **External Connections** | API security, WebSocket handling |
| **Hardware Integrations** | Bluetooth/Serial security |
| **Cryptography** | Encryption implementation in plan sharing |
| **Service Worker** | Cache poisoning, update integrity |
| **Dependencies** | Vulnerabilities in third-party libraries |

### Out of Scope

The following are outside our security scope:

| Item | Reason |
|------|--------|
| Third-party APIs (OSM, USGS, etc.) | Report to respective providers |
| User's device security | Outside our control |
| Physical access attacks | Requires device access |
| Social engineering | User education issue |
| Browser vulnerabilities | Report to browser vendor |
| Self-hosted instances | User's responsibility |
| RF Sentinel hardware | Separate project |

---

## Security Architecture

### Data at Rest

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Waypoints, routes | IndexedDB | Browser sandboxing |
| Settings | localStorage | Browser sandboxing |
| Offline tiles | Cache API | Browser sandboxing |
| Exported plans | User's filesystem | Optional AES-256-GCM encryption |
| SSTV images | IndexedDB | Browser sandboxing |

### Data in Transit

| Connection | Protocol | Security |
|------------|----------|----------|
| Map tiles | HTTPS | TLS encryption |
| Weather API | HTTPS | TLS encryption |
| AirNow API | HTTPS | TLS encryption + API key |
| WebSocket (RF Sentinel) | WSS/WS | TLS when available |
| Bluetooth | BLE | Device pairing |
| Web Serial | USB | Physical connection |

### No Data Transmitted To Us

GridDown does not transmit any data to BlackDot Technology servers. We have:

- No analytics
- No telemetry
- No crash reporting
- No user accounts
- No cloud sync
- No backend servers

---

## Known Security Considerations

### Browser Storage Limitations

- **Risk**: Browser storage can be cleared by user or browser
- **Mitigation**: Regular data export recommended
- **User Action**: Export important data periodically

### Third-Party API Trust

- **Risk**: Map tiles and weather data come from external sources
- **Mitigation**: Use HTTPS, validate responses
- **User Action**: Verify critical data through official sources

### Bluetooth/Serial Connections

- **Risk**: Malicious devices could send unexpected data
- **Mitigation**: Input validation, connection to known devices only
- **User Action**: Only connect trusted devices

### Offline Map Integrity

- **Risk**: Cached tiles could theoretically be tampered with
- **Mitigation**: Tiles from HTTPS sources, browser cache isolation
- **User Action**: Re-download tiles if integrity is questionable

### PWA Installation

- **Risk**: Installing PWA grants offline capability
- **Mitigation**: Service worker validates cached resources
- **User Action**: Install only from trusted sources

### Plan Sharing Encryption

- **Risk**: Weak passphrase could be brute-forced
- **Mitigation**: AES-256-GCM encryption, PBKDF2 key derivation
- **User Action**: Use strong passphrases for sensitive plans

---

## Security Best Practices for Users

### General

1. **Keep GridDown updated** - Install new versions promptly
2. **Use HTTPS** - Always access GridDown via HTTPS
3. **Secure your device** - Use screen lock, encryption
4. **Regular exports** - Backup important data

### For Sensitive Operations

1. **Verify GPS accuracy** - Cross-check critical positions
2. **Use strong passphrases** - For encrypted plan exports
3. **Clear data when needed** - Browser settings → Clear site data
4. **Audit permissions** - Review granted device permissions

### For Hardware Integrations

1. **Trust your devices** - Only connect known hardware
2. **Secure your network** - For RF Sentinel WebSocket connections
3. **Physical security** - Protect connected devices

---

## Security Updates

Security updates are distributed through:

1. **Version updates** - Install latest version
2. **Service worker** - Automatic background updates
3. **Security advisories** - Posted in CHANGELOG.md
4. **Critical alerts** - Email to registered contacts (if opted in)

### Verifying Authenticity

To verify you have an authentic GridDown release:

1. Download only from official sources
2. Check version number in Settings → About
3. Verify service worker version matches release

---

## Vulnerability Disclosure History

| Date | Version | Severity | Description | Status |
|------|---------|----------|-------------|--------|
| - | - | - | No vulnerabilities disclosed yet | - |

We will document disclosed vulnerabilities here after fixes are released.

---

## Bug Bounty

We do not currently offer a paid bug bounty program. However, we:

- ✅ Acknowledge security researchers in release notes
- ✅ Provide letters of appreciation for significant findings
- ✅ May offer GridDown merchandise for exceptional reports

---

## Security Contact

**Email**: security@blackdot.tech

**Response Time**: Within 48 hours

**Encryption**: PGP key available at https://blackdot.tech/.well-known/security.txt

**Alternative Contact**: legal@blackdot.tech (if security@ is unresponsive)

---

## Related Documents

- [Privacy Policy](PRIVACY.md) - Data handling practices
- [Terms of Service](TERMS_OF_SERVICE.md) - Usage terms
- [Disclaimer](DISCLAIMER.md) - Safety information
- [License](LICENSE) - Software licensing

---

**Thank you for helping keep GridDown secure!**

---

**© 2025 BlackDot Technology. All Rights Reserved.**
