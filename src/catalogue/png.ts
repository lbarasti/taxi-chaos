import { inflateSync } from 'node:zlib';
import { bundledArtworkPath } from './assets';
import type { ArtworkSource, CatalogueSources, PixelCrop } from './schema';

/** Transparent export padding, in source pixels, on each side of the image. */
export type PngPadding = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type PngMeasurement = Readonly<{
  width: number; height: number;
  /** Crop that removes the padding; the whole image when it is fully opaque. */
  crop: PixelCrop;
  padding: PngPadding;
}>;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const u32 = (bytes: Uint8Array, offset: number) => ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

type Header = Readonly<{ width: number; height: number; colourType: number; channels: number }>;

/** Read the IHDR, IDAT stream and tRNS table. Only the standard 8-bit, non-interlaced
 * encodings are accepted; anything else fails loudly instead of mis-measuring padding. */
function decode(bytes: Uint8Array): { header: Header; pixels: Uint8Array; transparent?: Uint8Array } {
  if (bytes.length < 8 || !SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new Error('not a PNG file');
  const parts: Uint8Array[] = [];
  let header: Header | undefined, transparent: Uint8Array | undefined;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = u32(bytes, offset), type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > bytes.length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR') {
      const channels = CHANNELS[data[9]];
      if (data[8] !== 8) throw new Error(`unsupported PNG bit depth ${data[8]}`);
      if (!channels) throw new Error(`unsupported PNG colour type ${data[9]}`);
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
      header = { width: u32(bytes, offset + 8), height: u32(bytes, offset + 12), colourType: data[9], channels };
    } else if (type === 'IDAT') parts.push(data);
    else if (type === 'tRNS') transparent = data;
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG header is missing');
  const { width, height, channels } = header;
  const rows = inflateSync(Buffer.concat(parts.map(part => Buffer.from(part))));
  const stride = width * channels;
  if (rows.length < (stride + 1) * height) throw new Error('truncated PNG pixel data');
  const pixels = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride), cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = rows[cursor++], line = rows.subarray(cursor, cursor + stride), current = pixels.subarray(y * stride, (y + 1) * stride);
    cursor += stride;
    if (filter > 4) throw new Error(`unsupported PNG filter ${filter}`);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? current[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
      // Reconstruct each filtered byte from the left (a), above (b) and above-left (c) neighbours.
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      current[i] = (line[i] + prediction) & 0xff;
    }
    previous = current;
  }
  return { header, pixels, transparent };
}

/** Alpha byte for one pixel index, including tRNS transparency for palette and colour keys. */
function alphaAt(colourType: number, pixels: Uint8Array, index: number, transparent?: Uint8Array): number {
  switch (colourType) {
    case 6: return pixels[index * 4 + 3];
    case 4: return pixels[index * 2 + 1];
    case 3: return transparent?.[pixels[index]] ?? 255;
    case 2: return transparent && pixels[index * 3] === transparent[1] && pixels[index * 3 + 1] === transparent[3] && pixels[index * 3 + 2] === transparent[5] ? 0 : 255;
    default: return transparent && pixels[index] === transparent[1] ? 0 : 255;
  }
}

const u16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const u32le = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const tag = (bytes: Uint8Array, offset: number) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);

/** Decoded width and height from a WebP RIFF header, without decoding pixels. */
export function readWebpSize(bytes: Uint8Array): Readonly<{ width: number; height: number }> | undefined {
  if (bytes.length < 30 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP') return undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = tag(bytes, offset), length = u32le(bytes, offset + 4), data = offset + 8;
    if (data + length > bytes.length) return undefined;
    if (type === 'VP8X') {
      if (length < 10) return undefined;
      return { width: 1 + u24le(bytes, data + 4), height: 1 + u24le(bytes, data + 7) };
    }
    if (type === 'VP8 ') {
      // Lossy frames: 3-byte frame tag, start code 0x9d 0x01 0x2a, then 14-bit dimensions.
      if (length < 10 || bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) return undefined;
      return { width: u16le(bytes, data + 6) & 0x3fff, height: u16le(bytes, data + 8) & 0x3fff };
    }
    if (type === 'VP8L') {
      // Lossless frames pack (width-1) and (height-1) as two 14-bit fields after 0x2f.
      if (length < 5 || bytes[data] !== 0x2f) return undefined;
      return {
        width: 1 + ((bytes[data + 1] | (bytes[data + 2] << 8)) & 0x3fff),
        height: 1 + (((bytes[data + 2] >> 6) | (bytes[data + 3] << 2) | (bytes[data + 4] << 10)) & 0x3fff),
      };
    }
    offset = data + length + (length & 1);
  }
  return undefined;
}

/** Read dimensions from the PNG header without inflating or scanning any pixels.
 * Portrait resizing needs only the width; the encoder validates the pixel stream. */
export function readPngSize(bytes: Uint8Array): Readonly<{ width: number; height: number }> | undefined {
  if (bytes.length < 33 || !SIGNATURE.every((byte, index) => bytes[index] === byte)) return undefined;
  if (u32(bytes, 8) !== 13 || tag(bytes, 12) !== 'IHDR') throw new Error('PNG header is missing');
  const width = u32(bytes, 16), height = u32(bytes, 20);
  if (!width || !height) throw new Error('PNG dimensions must be positive');
  if (bytes[24] !== 8) throw new Error(`unsupported PNG bit depth ${bytes[24]}`);
  if (!CHANNELS[bytes[25]]) throw new Error(`unsupported PNG colour type ${bytes[25]}`);
  if (bytes[28] !== 0) throw new Error('interlaced PNGs are not supported');
  return { width, height };
}

/** Source dimensions and transparent-padding crop for one PNG buffer, with no DOM. */
export function readPng(bytes: Uint8Array): PngMeasurement | undefined {  if (bytes.length < 8 || !SIGNATURE.every((byte, index) => bytes[index] === byte)) return undefined;
  const { header, pixels, transparent } = decode(bytes);
  let minX = header.width, minY = header.height, maxX = -1, maxY = -1;
  for (let y = 0; y < header.height; y++) for (let x = 0; x < header.width; x++) {
    if (alphaAt(header.colourType, pixels, y * header.width + x, transparent) === 0) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < minX || maxY < minY) throw new Error('PNG is fully transparent');
  const crop = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return { width: header.width, height: header.height, crop,
    padding: { left: crop.x, top: crop.y, right: header.width - crop.x - crop.width, bottom: header.height - crop.y - crop.height } };
}

/** Measure every referenced PNG through injected readers, so browser-free tooling and
 * tests share one implementation. Non-PNG (SVG) references are skipped. A file
 * referenced by several IDs is decoded once, and every entry gets a detached crop.
 * When `readBundled` is supplied, the build also records the derivative size that the
 * inline manifest will actually decode. */
export function measureArtworkSources(
  records: readonly Readonly<{ id: string; png: string }>[],
  read: (png: string) => Uint8Array | undefined,
  readBundled?: (png: string) => Uint8Array | undefined,
  measure: (png: string, bytes: Uint8Array) => PngMeasurement | undefined = (_png, bytes) => readPng(bytes),
): CatalogueSources {
  const sources: Record<string, ArtworkSource> = {};
  const byPng = new Map<string, Readonly<{ width: number; height: number; crop: PixelCrop; image?: Readonly<{ width: number; height: number }> }>>();
  for (const record of records) {
    if (!record.png.endsWith('.png')) continue;
    let measurement = byPng.get(record.png);
    if (!measurement) {
      const bytes = read(record.png);
      if (!bytes) throw new Error(`Artwork ${record.id}: missing source ${record.png}`);
      const decoded = measure(record.png, bytes);
      if (!decoded) throw new Error(`Artwork ${record.id}: ${record.png} is not a PNG`);
      let image: Readonly<{ width: number; height: number }> | undefined;
      if (readBundled) {
        const bundledPath = bundledArtworkPath(record.png);
        const bundled = readBundled(bundledPath);
        if (!bundled) throw new Error(`Artwork ${record.id}: missing bundled ${bundledPath}; run npm run artwork:optimize`);
        image = readWebpSize(bundled);
        if (!image) throw new Error(`Artwork ${record.id}: ${bundledPath} is not a readable WebP`);
      }
      measurement = { width: decoded.width, height: decoded.height, crop: decoded.crop, ...(image ? { image } : {}) };
      byPng.set(record.png, measurement);
    }
    sources[record.id] = {
      width: measurement.width, height: measurement.height, crop: { ...measurement.crop },
      ...(measurement.image ? { image: { ...measurement.image } } : {}),
    };
  }
  return sources;
}
