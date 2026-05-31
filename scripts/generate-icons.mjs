import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsDir = join(root, "assets");
mkdirSync(assetsDir, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(join(assetsDir, `icon-${size}.png`), renderIcon(size));
}

function renderIcon(size) {
  const width = size;
  const height = size;
  const pixels = new Uint8Array(width * height * 4);
  fillRoundRect(pixels, width, 0, 0, width, height, Math.round(size * 0.21), [27, 36, 48, 255]);
  fillRoundRect(
    pixels,
    width,
    Math.round(size * 0.22),
    Math.round(size * 0.22),
    Math.round(size * 0.56),
    Math.round(size * 0.56),
    Math.round(size * 0.07),
    [255, 253, 248, 255],
  );
  fillRect(pixels, width, size * 0.29, size * 0.34, size * 0.42, size * 0.075, [27, 36, 48, 255]);
  fillRect(pixels, width, size * 0.29, size * 0.49, size * 0.22, size * 0.065, [27, 36, 48, 255]);
  fillRect(pixels, width, size * 0.29, size * 0.64, size * 0.42, size * 0.065, [27, 36, 48, 255]);
  fillRect(pixels, width, size * 0.55, size * 0.47, size * 0.055, size * 0.14, [15, 118, 110, 255]);
  fillRect(pixels, width, size * 0.67, size * 0.47, size * 0.055, size * 0.14, [15, 118, 110, 255]);
  fillTriangle(
    pixels,
    width,
    [size * 0.6, size * 0.47],
    [size * 0.665, size * 0.63],
    [size * 0.73, size * 0.47],
    [15, 118, 110, 255],
  );

  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    scanlines.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), scanlineOffset + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", concatUInt32(width, height, 8, 6, 0, 0, 0)),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillRect(pixels, width, x, y, rectWidth, rectHeight, color) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(width, Math.round(x + rectWidth));
  const y1 = Math.min(width, Math.round(y + rectHeight));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      setPixel(pixels, width, px, py, color);
    }
  }
}

function fillRoundRect(pixels, width, x, y, rectWidth, rectHeight, radius, color) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = Math.round(x + rectWidth);
  const y1 = Math.round(y + rectHeight);
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = Math.max(x0 + radius - px, 0, px - (x1 - radius));
      const dy = Math.max(y0 + radius - py, 0, py - (y1 - radius));
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, width, px, py, color);
      }
    }
  }
}

function fillTriangle(pixels, width, a, b, c, color) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0]));
  const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const minY = Math.floor(Math.min(a[1], b[1], c[1]));
  const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const area = edge(a, b, c);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const point = [x + 0.5, y + 0.5];
      const w0 = edge(b, c, point);
      const w1 = edge(c, a, point);
      const w2 = edge(a, b, point);
      if ((area > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        setPixel(pixels, width, x, y, color);
      }
    }
  }
}

function edge(a, b, c) {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

function setPixel(pixels, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= width) {
    return;
  }
  const offset = (y * width + x) * 4;
  pixels.set(color, offset);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function concatUInt32(width, height, bitDepth, colorType, compression, filter, interlace) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = bitDepth;
  buffer[9] = colorType;
  buffer[10] = compression;
  buffer[11] = filter;
  buffer[12] = interlace;
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
