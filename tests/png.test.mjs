import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decode, encode, diff } from '../scripts/lib/png.mjs';

function gradient(width, height) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      data[o] = (x * 37) & 0xff;
      data[o + 1] = (y * 53) & 0xff;
      data[o + 2] = (x * y) & 0xff;
      data[o + 3] = 255 - ((x + y) & 0x7f);
    }
  }
  return { width, height, data };
}

// Builds a PNG by hand so the decoder is exercised on every filter type and on RGB input.
function handmadePng(width, height, channels, rows, filters) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filters[y % filters.length];
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x += 1) {
      const value = rows[y * stride + x];
      const left = x >= channels ? rows[y * stride + x - channels] : 0;
      const up = y > 0 ? rows[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? rows[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = (left + up) >> 1;
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      raw[y * (stride + 1) + 1 + x] = (value - predictor) & 0xff;
    }
  }
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('encode → decode round-trip keeps every RGBA byte', () => {
  const image = gradient(23, 17);
  const decoded = decode(encode(image));
  assert.equal(decoded.width, 23);
  assert.equal(decoded.height, 17);
  assert.ok(decoded.data.equals(image.data));
});

test('decoder handles filters 0–4 for RGBA and RGB', () => {
  const width = 9;
  const height = 10;
  for (const channels of [4, 3]) {
    const rows = Buffer.alloc(width * height * channels);
    for (let i = 0; i < rows.length; i += 1) rows[i] = (i * 31 + (i >> 3) * 7) & 0xff;
    const decoded = decode(handmadePng(width, height, channels, rows, [0, 1, 2, 3, 4]));
    for (let p = 0; p < width * height; p += 1) {
      for (let c = 0; c < channels; c += 1) assert.equal(decoded.data[p * 4 + c], rows[p * channels + c]);
      if (channels === 3) assert.equal(decoded.data[p * 4 + 3], 255);
    }
  }
});

test('decoder rejects non-PNG input', () => {
  assert.throws(() => decode(Buffer.from('not a png')), /Not a PNG/);
});

test('diff reports identical images as unchanged', () => {
  const png = encode(gradient(12, 8));
  const result = diff(png, png);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.changedRatio, 0);
  assert.equal(decode(result.diffPng).width, 12);
});

test('diff counts changed pixels, honours threshold and size mismatch', () => {
  const base = gradient(10, 10);
  const changed = { ...base, data: Buffer.from(base.data) };
  for (const p of [0, 5, 99]) changed.data[p * 4] = (changed.data[p * 4] + 40) & 0xff;
  changed.data[50 * 4 + 1] = (changed.data[50 * 4 + 1] + 3) & 0xff;

  const strict = diff(encode(base), encode(changed));
  assert.equal(strict.changedPixels, 4);
  assert.equal(strict.changedRatio, 0.04);
  const marked = decode(strict.diffPng);
  assert.deepEqual([...marked.data.subarray(0, 4)], [255, 0, 0, 255]);

  assert.equal(diff(base, changed, { threshold: 5 }).changedPixels, 3);

  const larger = gradient(10, 12);
  assert.equal(diff(base, larger).changedPixels >= 20, true);
});
