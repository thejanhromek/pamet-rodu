// Minimal PNG codec and pixel diff on top of node:zlib (no dependencies).
// Decodes 8-bit RGB/RGBA, non-interlaced, all filter types 0-4; encodes RGBA.
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes a PNG buffer into { width, height, data } where data is RGBA (4 bytes per pixel). */
export function decode(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file');
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!header) throw new Error('PNG is missing IHDR');
  const { width, height, bitDepth, colorType, interlace } = header;
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG color type ${colorType}`);
  if (interlace !== 0) throw new Error('Interlaced PNG is not supported');

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is truncated');

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[src + x];
      const left = x >= channels ? pixels[dst + x - channels] : 0;
      const up = y > 0 ? pixels[prev + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let out;
      if (filter === 0) out = value;
      else if (filter === 1) out = value + left;
      else if (filter === 2) out = value + up;
      else if (filter === 3) out = value + ((left + up) >> 1);
      else if (filter === 4) out = value + paeth(left, up, upLeft);
      else throw new Error(`Unknown PNG filter ${filter}`);
      pixels[dst + x] = out & 0xff;
    }
  }

  if (channels === 4) return { width, height, data: pixels };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = 255;
  }
  return { width, height, data: rgba };
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** Encodes { width, height, data } (RGBA) into a PNG buffer. Rows use the Sub filter. */
export function encode({ width, height, data }) {
  if (data.length !== width * height * 4) throw new Error('RGBA data length does not match dimensions');
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      raw[row + 1 + x] = (data[y * stride + x] - left) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Compares two PNGs (buffers or decoded images). A pixel counts as changed when any
 * channel differs by more than `threshold` (0-255). Images of different size count
 * every pixel outside the shared area as changed.
 * Returns { changedRatio, changedPixels, totalPixels, diffPng } where diffPng shows a
 * faded copy of `a` with changed pixels in red.
 */
export function diff(a, b, { threshold = 0 } = {}) {
  const imgA = Buffer.isBuffer(a) ? decode(a) : a;
  const imgB = Buffer.isBuffer(b) ? decode(b) : b;
  const width = Math.max(imgA.width, imgB.width);
  const height = Math.max(imgA.height, imgB.height);
  const out = Buffer.alloc(width * height * 4);
  let changed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const inA = x < imgA.width && y < imgA.height;
      const inB = x < imgB.width && y < imgB.height;
      let isChanged = !(inA && inB);
      if (!isChanged) {
        const ia = (y * imgA.width + x) * 4;
        const ib = (y * imgB.width + x) * 4;
        for (let c = 0; c < 4; c += 1) {
          if (Math.abs(imgA.data[ia + c] - imgB.data[ib + c]) > threshold) {
            isChanged = true;
            break;
          }
        }
      }
      if (isChanged) {
        changed += 1;
        out[o] = 255;
        out[o + 1] = 0;
        out[o + 2] = 0;
        out[o + 3] = 255;
      } else {
        const ia = (y * imgA.width + x) * 4;
        const grey = (imgA.data[ia] * 0.299 + imgA.data[ia + 1] * 0.587 + imgA.data[ia + 2] * 0.114) | 0;
        const faded = 255 - ((255 - grey) >> 2);
        out[o] = faded;
        out[o + 1] = faded;
        out[o + 2] = faded;
        out[o + 3] = 255;
      }
    }
  }
  const totalPixels = width * height;
  return {
    changedPixels: changed,
    totalPixels,
    changedRatio: totalPixels ? changed / totalPixels : 0,
    diffPng: encode({ width, height, data: out }),
  };
}
