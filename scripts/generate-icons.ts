/**
 * Generates the PWA icon set. No image libraries are available in this
 * environment, so this rasterises a dumbbell glyph by hand and writes PNGs
 * directly (zlib + CRC32 is all a valid PNG needs).
 *
 * One-time asset generation — run with `npx tsx scripts/generate-icons.ts`.
 * Re-run only if the mark or brand colours change.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BG = [0x0b, 0x0f, 0x14] as const;
const FG = [0x4a, 0xde, 0x80] as const;

type RGB = readonly [number, number, number] | Uint8Array;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encodes RGBA pixel data as a PNG. */
function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  // Each scanline is prefixed with a filter-type byte; 0 = None.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

class Canvas {
  readonly px: Uint8Array;

  constructor(readonly size: number) {
    this.px = new Uint8Array(size * size * 4);
  }

  /** Coverage-blended plot, so edges are antialiased rather than jagged. */
  private blend(x: number, y: number, colour: RGB, coverage: number) {
    if (coverage <= 0 || x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const a = Math.min(1, coverage);
    const i = (y * this.size + x) * 4;
    for (let c = 0; c < 3; c++) {
      this.px[i + c] = Math.round(this.px[i + c] * (1 - a) + colour[c] * a);
    }
    this.px[i + 3] = Math.max(this.px[i + 3], Math.round(255 * a));
  }

  fill(colour: RGB) {
    for (let i = 0; i < this.px.length; i += 4) {
      this.px[i] = colour[0];
      this.px[i + 1] = colour[1];
      this.px[i + 2] = colour[2];
      this.px[i + 3] = 255;
    }
  }

  /**
   * Fills a rounded rectangle by supersampling each pixel 4x4, which is enough
   * to keep the corners smooth at every size we emit.
   */
  roundedRect(x0: number, y0: number, w: number, h: number, r: number, colour: RGB) {
    const x1 = x0 + w;
    const y1 = y0 + h;
    const radius = Math.min(r, w / 2, h / 2);

    const inside = (px: number, py: number) => {
      if (px < x0 || px > x1 || py < y0 || py > y1) return false;
      const cx = Math.min(Math.max(px, x0 + radius), x1 - radius);
      const cy = Math.min(Math.max(py, y0 + radius), y1 - radius);
      const dx = px - cx;
      const dy = py - cy;
      return dx * dx + dy * dy <= radius * radius;
    };

    const S = 4;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        let hits = 0;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) hits++;
          }
        }
        this.blend(x, y, colour, hits / (S * S));
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.size, this.size, this.px);
  }
}

/**
 * Draws the dumbbell mark: two outer plates, two inner plates, and a connecting
 * bar. `inset` shrinks the mark for maskable icons, where platforms crop to a
 * circle and anything in the outer 10% can be cut off.
 */
function drawDumbbell(canvas: Canvas, inset: number) {
  const s = canvas.size;
  const u = s / 100; // 1 unit = 1% of the icon
  const scale = 1 - inset * 2;
  const cy = s / 2;

  const at = (v: number) => s / 2 + (v - 50) * u * scale;
  const len = (v: number) => v * u * scale;

  const barH = len(9);
  const plateOuterH = len(38);
  const plateInnerH = len(54);
  const plateW = len(9);
  const radius = len(3.5);

  // Connecting bar
  canvas.roundedRect(at(28), cy - barH / 2, len(44), barH, radius / 2, FG);

  // Plates, outermost first
  for (const [x, h] of [
    [16, plateOuterH],
    [27, plateInnerH],
    [64, plateInnerH],
    [75, plateOuterH],
  ] as const) {
    canvas.roundedRect(at(x), cy - h / 2, plateW, h, radius, FG);
  }
}

function icon(size: number, opts: { maskable?: boolean } = {}): Buffer {
  const canvas = new Canvas(size);

  if (opts.maskable) {
    // Maskable icons must bleed to the edges; the platform applies its own shape.
    canvas.fill(BG);
    drawDumbbell(canvas, 0.14);
  } else {
    canvas.roundedRect(0, 0, size, size, size * 0.22, BG);
    drawDumbbell(canvas, 0.06);
  }

  return canvas.toPng();
}

const outDir = join(process.cwd(), "public");
const files: [string, Buffer][] = [
  ["icon-192.png", icon(192)],
  ["icon-512.png", icon(512)],
  ["icon-maskable-512.png", icon(512, { maskable: true })],
  // iOS composites the home-screen tile on an opaque background and applies its
  // own corner radius, so this one is drawn square edge-to-edge.
  ["apple-touch-icon.png", (() => {
    const c = new Canvas(180);
    c.fill(BG);
    drawDumbbell(c, 0.08);
    return c.toPng();
  })()],
  ["favicon.png", icon(64)],
];

for (const [name, buf] of files) {
  writeFileSync(join(outDir, name), buf);
  console.log(`${name.padEnd(26)} ${(buf.length / 1024).toFixed(1)} KB`);
}
