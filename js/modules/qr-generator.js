/**
 * GridDown QR Code Generator
 * Self-contained QR code encoder for offline team invite sharing
 * Implements ISO 18004: Byte mode, Error Correction Level M, Versions 1-13
 */
const QRGenerator = (function() {
    'use strict';

    // =========================================================================
    // TABLES
    // =========================================================================

    // Version info: [total codewords, data codewords, ecc per block, blocks group1, data per block g1, blocks group2, data per block g2]
    // Error correction level M only
    const VERSION_TABLE = [
        null, // index 0 unused
        [26, 16, 10, 1, 16, 0, 0],       // V1:  capacity 14 bytes
        [44, 28, 16, 1, 28, 0, 0],       // V2:  capacity 26 bytes
        [70, 44, 26, 1, 44, 0, 0],       // V3:  capacity 42 bytes
        [100, 64, 18, 2, 32, 0, 0],      // V4:  capacity 62 bytes
        [134, 86, 24, 2, 43, 0, 0],      // V5:  capacity 84 bytes
        [172, 108, 16, 4, 27, 0, 0],     // V6:  capacity 106 bytes
        [196, 124, 18, 4, 31, 0, 0],     // V7:  capacity 122 bytes
        [242, 154, 22, 2, 38, 2, 39],    // V8:  capacity 152 bytes
        [292, 182, 22, 3, 36, 2, 37],    // V9:  capacity 180 bytes
        [346, 216, 26, 4, 43, 1, 44],    // V10: capacity 213 bytes
        [404, 254, 30, 1, 50, 4, 51],    // V11: capacity 251 bytes
        [466, 290, 22, 6, 36, 2, 37],    // V12: capacity 287 bytes
        [532, 334, 24, 8, 37, 1, 38],    // V13: capacity 331 bytes
    ];

    // Alignment pattern positions per version (center coordinates)
    const ALIGNMENT_POSITIONS = [
        null, [], [], // V1-2: none
        [6, 22],                         // V3
        [6, 26],                         // V4
        [6, 30],                         // V5
        [6, 34],                         // V6
        [6, 22, 38],                     // V7
        [6, 24, 42],                     // V8
        [6, 26, 46],                     // V9
        [6, 28, 50],                     // V10
        [6, 30, 54],                     // V11
        [6, 32, 58],                     // V12
        [6, 34, 62],                     // V13
    ];

    // Precompute GF(256) log and exp tables
    const GF_EXP = new Uint8Array(512);
    const GF_LOG = new Uint8Array(256);
    (function() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            GF_EXP[i] = x;
            GF_LOG[x] = i;
            x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
        }
        for (let i = 255; i < 512; i++) {
            GF_EXP[i] = GF_EXP[i - 255];
        }
    })();

    // Format info bits for ECC level M (mask 0-7)
    // Pre-encoded with BCH error correction + XOR mask 0x5412
    const FORMAT_INFO = [
        0x5412, 0x5125, 0x5E7C, 0x5B4B,
        0x45F9, 0x40CE, 0x4F97, 0x4AA0,
        0x77C4, 0x72F3, 0x7DAA, 0x789D,
        0x662F, 0x6318, 0x6C41, 0x6976
    ];

    // =========================================================================
    // GF(256) ARITHMETIC
    // =========================================================================

    function gfMul(a, b) {
        if (a === 0 || b === 0) return 0;
        return GF_EXP[GF_LOG[a] + GF_LOG[b]];
    }

    // =========================================================================
    // REED-SOLOMON
    // =========================================================================

    function rsGeneratorPoly(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            const newPoly = new Array(poly.length + 1).fill(0);
            const root = GF_EXP[i];
            for (let j = 0; j < poly.length; j++) {
                newPoly[j] ^= poly[j];
                newPoly[j + 1] ^= gfMul(poly[j], root);
            }
            poly = newPoly;
        }
        return poly;
    }

    function rsEncode(data, eccCount) {
        const gen = rsGeneratorPoly(eccCount);
        const result = new Uint8Array(eccCount);
        for (let i = 0; i < data.length; i++) {
            const factor = data[i] ^ result[0];
            // Shift result left
            for (let j = 0; j < eccCount - 1; j++) {
                result[j] = result[j + 1];
            }
            result[eccCount - 1] = 0;
            // Add scaled generator
            for (let j = 0; j < eccCount; j++) {
                result[j] ^= gfMul(gen[j + 1], factor);
            }
        }
        return result;
    }

    // =========================================================================
    // DATA ENCODING
    // =========================================================================

    function selectVersion(dataLength) {
        for (let v = 1; v < VERSION_TABLE.length; v++) {
            const info = VERSION_TABLE[v];
            // Byte mode overhead: 4 (mode) + charCountBits + data*8 + up to 4 terminator
            const charCountBits = v <= 9 ? 8 : 16;
            const available = info[1] * 8; // data codewords * 8 bits
            const needed = 4 + charCountBits + dataLength * 8;
            if (needed <= available) return v;
        }
        throw new Error('Data too long for QR code');
    }

    function encodeData(text, version) {
        const info = VERSION_TABLE[version];
        const totalDataCodewords = info[1];
        const charCountBits = version <= 9 ? 8 : 16;

        // Build bit stream
        const bits = [];
        function pushBits(value, count) {
            for (let i = count - 1; i >= 0; i--) {
                bits.push((value >> i) & 1);
            }
        }

        // Mode indicator: 0100 = byte mode
        pushBits(0b0100, 4);
        // Character count
        pushBits(text.length, charCountBits);
        // Data
        for (let i = 0; i < text.length; i++) {
            pushBits(text.charCodeAt(i), 8);
        }
        // Terminator (up to 4 zeros)
        const terminatorLen = Math.min(4, totalDataCodewords * 8 - bits.length);
        pushBits(0, terminatorLen);

        // Pad to byte boundary
        while (bits.length % 8 !== 0) bits.push(0);

        // Convert to bytes
        const codewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
            codewords.push(byte);
        }

        // Pad with alternating 0xEC, 0x11
        const padBytes = [0xEC, 0x11];
        let padIdx = 0;
        while (codewords.length < totalDataCodewords) {
            codewords.push(padBytes[padIdx % 2]);
            padIdx++;
        }

        return new Uint8Array(codewords);
    }

    // =========================================================================
    // INTERLEAVING
    // =========================================================================

    function interleave(data, version) {
        const info = VERSION_TABLE[version];
        const [, , eccPerBlock, blocksG1, dataPerBlockG1, blocksG2, dataPerBlockG2] = info;

        // Split data into blocks
        const dataBlocks = [];
        const eccBlocks = [];
        let offset = 0;

        for (let i = 0; i < blocksG1; i++) {
            const block = data.slice(offset, offset + dataPerBlockG1);
            dataBlocks.push(block);
            eccBlocks.push(rsEncode(block, eccPerBlock));
            offset += dataPerBlockG1;
        }
        for (let i = 0; i < blocksG2; i++) {
            const block = data.slice(offset, offset + dataPerBlockG2);
            dataBlocks.push(block);
            eccBlocks.push(rsEncode(block, eccPerBlock));
            offset += dataPerBlockG2;
        }

        // Interleave data codewords
        const result = [];
        const maxDataLen = Math.max(dataPerBlockG1, dataPerBlockG2);
        for (let i = 0; i < maxDataLen; i++) {
            for (const block of dataBlocks) {
                if (i < block.length) result.push(block[i]);
            }
        }
        // Interleave ECC codewords
        for (let i = 0; i < eccPerBlock; i++) {
            for (const block of eccBlocks) {
                if (i < block.length) result.push(block[i]);
            }
        }

        return result;
    }

    // =========================================================================
    // MATRIX CONSTRUCTION
    // =========================================================================

    function createMatrix(version) {
        const size = version * 4 + 17;
        // 0 = white, 1 = black, null = unset
        const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
        const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
        return { matrix, reserved, size };
    }

    function placeFinderPattern(m, row, col) {
        for (let r = -1; r <= 7; r++) {
            for (let c = -1; c <= 7; c++) {
                const mr = row + r, mc = col + c;
                if (mr < 0 || mr >= m.size || mc < 0 || mc >= m.size) continue;

                const isBlack = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                               (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                               (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                const isSeparator = r === -1 || r === 7 || c === -1 || c === 7;

                m.matrix[mr][mc] = isBlack && !isSeparator ? 1 : 0;
                m.reserved[mr][mc] = true;
            }
        }
    }

    function placeAlignmentPattern(m, row, col) {
        for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
                const mr = row + r, mc = col + c;
                if (m.reserved[mr][mc]) return; // overlaps finder, skip entirely
            }
        }
        for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
                const isBlack = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
                m.matrix[row + r][col + c] = isBlack ? 1 : 0;
                m.reserved[row + r][col + c] = true;
            }
        }
    }

    function placeTimingPatterns(m) {
        for (let i = 8; i < m.size - 8; i++) {
            const bit = i % 2 === 0 ? 1 : 0;
            if (!m.reserved[6][i]) {
                m.matrix[6][i] = bit;
                m.reserved[6][i] = true;
            }
            if (!m.reserved[i][6]) {
                m.matrix[i][6] = bit;
                m.reserved[i][6] = true;
            }
        }
    }

    function reserveFormatArea(m) {
        // Around top-left finder
        for (let i = 0; i <= 8; i++) {
            if (!m.reserved[8][i]) m.reserved[8][i] = true;
            if (!m.reserved[i][8]) m.reserved[i][8] = true;
        }
        // Around top-right finder
        for (let i = 0; i <= 7; i++) {
            if (!m.reserved[8][m.size - 1 - i]) m.reserved[8][m.size - 1 - i] = true;
        }
        // Around bottom-left finder
        for (let i = 0; i <= 7; i++) {
            if (!m.reserved[m.size - 1 - i][8]) m.reserved[m.size - 1 - i][8] = true;
        }
        // Dark module
        m.matrix[m.size - 8][8] = 1;
        m.reserved[m.size - 8][8] = true;
    }

    function placeVersionInfo(m, version) {
        if (version < 7) return;
        // Version info encoding (BCH(18,6))
        let bits = version;
        for (let i = 0; i < 12; i++) {
            bits = (bits << 1) ^ ((bits >> 11) * 0x1F25);
        }
        const versionInfo = (version << 12) | bits;

        for (let i = 0; i < 18; i++) {
            const bit = (versionInfo >> i) & 1;
            const row = Math.floor(i / 3);
            const col = m.size - 11 + (i % 3);
            m.matrix[row][col] = bit;
            m.reserved[row][col] = true;
            m.matrix[col][row] = bit;
            m.reserved[col][row] = true;
        }
    }

    function placeFunctionPatterns(m, version) {
        // Finder patterns
        placeFinderPattern(m, 0, 0);
        placeFinderPattern(m, 0, m.size - 7);
        placeFinderPattern(m, m.size - 7, 0);

        // Alignment patterns
        const positions = ALIGNMENT_POSITIONS[version];
        if (positions && positions.length > 0) {
            for (const row of positions) {
                for (const col of positions) {
                    placeAlignmentPattern(m, row, col);
                }
            }
        }

        placeTimingPatterns(m);
        reserveFormatArea(m);
        placeVersionInfo(m, version);
    }

    // =========================================================================
    // DATA PLACEMENT
    // =========================================================================

    function placeDataBits(m, dataBits) {
        let bitIdx = 0;
        // Traverse right to left in column pairs, bottom to top then top to bottom alternating
        let upward = true;

        for (let colPair = m.size - 1; colPair >= 0; colPair -= 2) {
            // Skip the vertical timing pattern column
            if (colPair === 6) colPair = 5;
            if (colPair < 0) break;

            const rowRange = upward ?
                Array.from({ length: m.size }, (_, i) => m.size - 1 - i) :
                Array.from({ length: m.size }, (_, i) => i);

            for (const row of rowRange) {
                for (let dc = 0; dc <= 1; dc++) {
                    const col = colPair - dc;
                    if (col < 0) continue;
                    if (m.reserved[row][col]) continue;

                    m.matrix[row][col] = bitIdx < dataBits.length ? dataBits[bitIdx] : 0;
                    bitIdx++;
                }
            }
            upward = !upward;
        }
    }

    // =========================================================================
    // MASKING
    // =========================================================================

    const MASK_FUNCTIONS = [
        (r, c) => (r + c) % 2 === 0,
        (r, c) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
        (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
        (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ];

    function applyMask(m, maskIdx) {
        const fn = MASK_FUNCTIONS[maskIdx];
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                if (!m.reserved[r][c] && fn(r, c)) {
                    m.matrix[r][c] ^= 1;
                }
            }
        }
    }

    function placeFormatInfo(m, maskIdx) {
        // ECC level M = 00, mask pattern = maskIdx (3 bits)  
        // FORMAT_INFO[maskIdx] contains pre-computed BCH(15,5) + XOR mask 0x5412
        const formatBits = FORMAT_INFO[maskIdx];

        // Copy 1: Around top-left finder pattern
        // Horizontal strip (row 8): bits 0-5 at cols 0-5, bit 6 at col 7 (skip timing col 6), bit 7 at col 8
        const hCols1 = [0, 1, 2, 3, 4, 5, 7, 8];
        for (let i = 0; i < 8; i++) {
            m.matrix[8][hCols1[i]] = (formatBits >> i) & 1;
        }
        // Vertical strip (col 8): bit 8 at row 7 (skip timing row 6), bits 9-14 at rows 5 down to 0
        const vRows1 = [7, 5, 4, 3, 2, 1, 0];
        for (let i = 0; i < 7; i++) {
            m.matrix[vRows1[i]][8] = (formatBits >> (i + 8)) & 1;
        }

        // Copy 2: Bottom-left and top-right areas
        // Vertical strip (col 8, bottom): bits 0-6 at rows (size-1) down to (size-7)
        // Dark module at (size-8, 8) is NOT format info — stays 1
        for (let i = 0; i < 7; i++) {
            m.matrix[m.size - 1 - i][8] = (formatBits >> i) & 1;
        }
        // Horizontal strip (row 8, right): bits 7-14 at cols (size-8) to (size-1)
        for (let i = 7; i < 15; i++) {
            m.matrix[8][m.size - 15 + i] = (formatBits >> i) & 1;
        }
    }

    // =========================================================================
    // PENALTY SCORING
    // =========================================================================

    function calculatePenalty(m) {
        let penalty = 0;

        // Rule 1: Runs of 5+ same-color modules in row/col
        for (let r = 0; r < m.size; r++) {
            let runLen = 1;
            for (let c = 1; c < m.size; c++) {
                if (m.matrix[r][c] === m.matrix[r][c - 1]) {
                    runLen++;
                } else {
                    if (runLen >= 5) penalty += runLen - 2;
                    runLen = 1;
                }
            }
            if (runLen >= 5) penalty += runLen - 2;
        }
        for (let c = 0; c < m.size; c++) {
            let runLen = 1;
            for (let r = 1; r < m.size; r++) {
                if (m.matrix[r][c] === m.matrix[r - 1][c]) {
                    runLen++;
                } else {
                    if (runLen >= 5) penalty += runLen - 2;
                    runLen = 1;
                }
            }
            if (runLen >= 5) penalty += runLen - 2;
        }

        // Rule 2: 2x2 blocks of same color
        for (let r = 0; r < m.size - 1; r++) {
            for (let c = 0; c < m.size - 1; c++) {
                const v = m.matrix[r][c];
                if (v === m.matrix[r][c + 1] &&
                    v === m.matrix[r + 1][c] &&
                    v === m.matrix[r + 1][c + 1]) {
                    penalty += 3;
                }
            }
        }

        // Rule 3: Finder-like patterns (1,0,1,1,1,0,1,0,0,0,0 or reverse)
        const pattern1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
        const pattern2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c <= m.size - 11; c++) {
                let match1 = true, match2 = true;
                for (let i = 0; i < 11; i++) {
                    if (m.matrix[r][c + i] !== pattern1[i]) match1 = false;
                    if (m.matrix[r][c + i] !== pattern2[i]) match2 = false;
                }
                if (match1) penalty += 40;
                if (match2) penalty += 40;
            }
        }
        for (let c = 0; c < m.size; c++) {
            for (let r = 0; r <= m.size - 11; r++) {
                let match1 = true, match2 = true;
                for (let i = 0; i < 11; i++) {
                    if (m.matrix[r + i][c] !== pattern1[i]) match1 = false;
                    if (m.matrix[r + i][c] !== pattern2[i]) match2 = false;
                }
                if (match1) penalty += 40;
                if (match2) penalty += 40;
            }
        }

        // Rule 4: Dark/light module ratio deviation from 50%
        let darkCount = 0;
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                if (m.matrix[r][c]) darkCount++;
            }
        }
        const total = m.size * m.size;
        const pct = (darkCount * 100 / total);
        const prevFive = Math.floor(pct / 5) * 5;
        const nextFive = prevFive + 5;
        penalty += Math.min(Math.abs(prevFive - 50), Math.abs(nextFive - 50)) * 2;

        return penalty;
    }

    // =========================================================================
    // MAIN GENERATION
    // =========================================================================

    function generate(text) {
        const version = selectVersion(text.length);
        const data = encodeData(text, version);
        const codewords = interleave(data, version);

        // Convert codewords to bits
        const dataBits = [];
        for (const cw of codewords) {
            for (let i = 7; i >= 0; i--) {
                dataBits.push((cw >> i) & 1);
            }
        }

        // Try all 8 masks, pick lowest penalty
        let bestMatrix = null;
        let bestPenalty = Infinity;
        let bestMask = 0;

        for (let maskIdx = 0; maskIdx < 8; maskIdx++) {
            const m = createMatrix(version);
            placeFunctionPatterns(m, version);
            placeDataBits(m, dataBits);
            applyMask(m, maskIdx);
            placeFormatInfo(m, maskIdx);

            const penalty = calculatePenalty(m);
            if (penalty < bestPenalty) {
                bestPenalty = penalty;
                bestMatrix = m;
                bestMask = maskIdx;
            }
        }

        return bestMatrix;
    }

    // =========================================================================
    // CANVAS RENDERING
    // =========================================================================

    function toCanvas(text, pixelSize) {
        const m = generate(text);
        const quietZone = 4;
        const totalModules = m.size + quietZone * 2;
        const moduleSize = Math.floor(pixelSize / totalModules);
        const canvasSize = moduleSize * totalModules;

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');

        // White background (includes quiet zone)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        // Draw modules
        ctx.fillStyle = '#000000';
        for (let r = 0; r < m.size; r++) {
            for (let c = 0; c < m.size; c++) {
                if (m.matrix[r][c]) {
                    ctx.fillRect(
                        (c + quietZone) * moduleSize,
                        (r + quietZone) * moduleSize,
                        moduleSize, moduleSize
                    );
                }
            }
        }

        return canvas;
    }

    function toDataURL(text, pixelSize) {
        return toCanvas(text, pixelSize).toDataURL('image/png');
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    return {
        generate,
        toCanvas,
        toDataURL
    };
})();

window.QRGenerator = QRGenerator;
