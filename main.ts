// THE WORLD TODAY — Wednesday 25 November 2026
// A one-image newspaper front page, drawn entirely by this program.
// Node 22, standard library only, no network, fully deterministic.
// Everything below is written from scratch for this entry:
// a hand-built stroke font, a small 2D rasteriser and a PNG encoder
// (filters + fixed-Huffman DEFLATE + CRC32/Adler32, all by hand).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Canvas: an RGB framebuffer, 1024 x 1024
// ---------------------------------------------------------------------------
const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 234];
const INK: RGB = [24, 24, 22];
const RED: RGB = [176, 32, 28];
const NAVY: RGB = [16, 35, 63];
const NAVY2: RGB = [26, 52, 88];
const GOLD: RGB = [212, 160, 32];
const GREY: RGB = [96, 92, 84];
const CARD: RGB = [255, 253, 246];
const WHITE: RGB = [255, 255, 255];
const SKY: RGB = [13, 28, 52];

function px(x: number, y: number, c: RGB): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) px(x, y, c);
    }
  }
}

// A circle clipped to a rectangle (used to keep the Earth arc inside its panel).
function fillCircleClipped(cx: number, cy: number, r: number, c: RGB, rx: number, ry: number, rw: number, rh: number): void {
  const y0 = Math.max(ry, Math.ceil(cy - r));
  const y1 = Math.min(ry + rh - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    const xa = Math.max(rx, Math.ceil(cx - dx));
    const xb = Math.min(rx + rw - 1, Math.floor(cx + dx));
    if (xb >= xa) fillRect(xa, y, xb - xa + 1, 1, c);
  }
}

// Even-odd scanline polygon fill.
function fillPolygon(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const ys = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, yA] = pts[i];
      const [x1, yB] = pts[(i + 1) % pts.length];
      if ((yA <= ys && yB > ys) || (yB <= ys && yA > ys)) {
        xs.push(x0 + ((ys - yA) * (x1 - x0)) / (yB - yA));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) px(x, y, c);
    }
  }
}

// A thick line segment: a quad plus round caps.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const r = w / 2;
  if (len < 0.001) {
    fillCircle(x0, y0, r, c);
    return;
  }
  const nx = (-dy / len) * r;
  const ny = (dx / len) * r;
  fillPolygon(
    [
      [x0 + nx, y0 + ny],
      [x1 + nx, y1 + ny],
      [x1 - nx, y1 - ny],
      [x0 - nx, y0 - ny],
    ],
    c,
  );
  fillCircle(x0, y0, r, c);
  fillCircle(x1, y1, r, c);
}

// ---------------------------------------------------------------------------
// Stroke font, drawn by hand on a 6-wide, 10-tall unit grid.
// x: 0..6, y: 0..10. Capitals sit on y 0..8; lower-case x-height is y 3..8;
// descenders reach y 10. Each glyph is a list of strokes; each stroke is a
// polyline of [x, y] points. A one-point stroke is a dot.
// ---------------------------------------------------------------------------
type Stroke = Array<[number, number]>;
const GLYPHS: Record<string, Stroke[]> = {
  A: [[[0, 8], [3, 0], [6, 8]], [[1.5, 5], [4.5, 5]]],
  B: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [5, 1], [5, 3], [4, 4], [0, 4]], [[0, 4], [4, 4], [5, 5], [5, 7], [4, 8], [0, 8]]],
  C: [[[6, 1], [5, 0], [1, 0], [0, 1], [0, 7], [1, 8], [5, 8], [6, 7]]],
  D: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [6, 2], [6, 6], [4, 8], [0, 8]]],
  E: [[[0, 0], [0, 8]], [[0, 0], [6, 0]], [[0, 4], [4, 4]], [[0, 8], [6, 8]]],
  F: [[[0, 0], [0, 8]], [[0, 0], [6, 0]], [[0, 4], [4, 4]]],
  G: [[[6, 1], [5, 0], [1, 0], [0, 1], [0, 7], [1, 8], [5, 8], [6, 7], [6, 4], [3, 4]]],
  H: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]],
  I: [[[3, 0], [3, 8]], [[1, 0], [5, 0]], [[1, 8], [5, 8]]],
  J: [[[4, 0], [6, 0]], [[6, 0], [6, 7], [5, 8], [2, 8], [1, 7]]],
  K: [[[0, 0], [0, 8]], [[5, 0], [0, 4]], [[2, 5], [6, 8]]],
  L: [[[0, 0], [0, 8]], [[0, 8], [6, 8]]],
  M: [[[0, 8], [0, 0], [3, 4], [6, 0], [6, 8]]],
  N: [[[0, 8], [0, 0], [6, 8], [6, 0]]],
  O: [[[1, 0], [5, 0], [6, 1], [6, 7], [5, 8], [1, 8], [0, 7], [0, 1], [1, 0]]],
  P: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [6, 1], [6, 3], [4, 4], [0, 4]]],
  Q: [[[1, 0], [5, 0], [6, 1], [6, 7], [5, 8], [1, 8], [0, 7], [0, 1], [1, 0]], [[4, 6], [6, 9]]],
  R: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [6, 1], [6, 3], [4, 4], [0, 4]], [[3, 4], [6, 8]]],
  S: [[[6, 1], [5, 0], [1, 0], [0, 1], [0, 3], [1, 4], [5, 4], [6, 5], [6, 7], [5, 8], [1, 8], [0, 7]]],
  T: [[[0, 0], [6, 0]], [[3, 0], [3, 8]]],
  U: [[[0, 0], [0, 7], [1, 8], [5, 8], [6, 7], [6, 0]]],
  V: [[[0, 0], [3, 8], [6, 0]]],
  W: [[[0, 0], [2, 8], [3, 5], [4, 8], [6, 0]]],
  X: [[[0, 0], [6, 8]], [[6, 0], [0, 8]]],
  Y: [[[0, 0], [3, 4], [6, 0]], [[3, 4], [3, 8]]],
  Z: [[[0, 0], [6, 0], [0, 8], [6, 8]]],
  a: [[[1, 3], [5, 3], [6, 4], [6, 7], [5, 8], [1, 8], [0, 7], [0, 4], [1, 3]], [[6, 3], [6, 8]]],
  b: [[[0, 0], [0, 8]], [[0, 4], [3, 3], [5, 4], [6, 5], [6, 7], [5, 8], [2, 8], [0, 7]]],
  c: [[[6, 4], [5, 3], [1, 3], [0, 4], [0, 7], [1, 8], [5, 8], [6, 7]]],
  d: [[[1, 3], [5, 3], [6, 4], [6, 7], [5, 8], [1, 8], [0, 7], [0, 4], [1, 3]], [[6, 0], [6, 8]]],
  e: [[[5, 3], [1, 3], [0, 4], [0, 7], [1, 8], [5, 8], [6, 7], [6, 5], [0, 5]]],
  f: [[[4, 0], [3, 0], [2, 1], [2, 8]], [[1, 3], [4, 3]]],
  g: [[[1, 3], [5, 3], [6, 4], [6, 7], [5, 8], [1, 8], [0, 7], [0, 4], [1, 3]], [[6, 3], [6, 9], [5, 10], [2, 10], [1, 9]]],
  h: [[[0, 0], [0, 8]], [[0, 4], [3, 3], [5, 4], [6, 5], [6, 8]]],
  i: [[[3, 3], [3, 8]], [[3, 1]]],
  j: [[[4, 3], [4, 9], [3, 10], [1, 10], [0, 9]], [[4, 1]]],
  k: [[[0, 0], [0, 8]], [[5, 3], [0, 5]], [[2, 6], [6, 8]]],
  l: [[[3, 0], [3, 8]]],
  m: [[[0, 3], [0, 8]], [[0, 3], [2, 3], [3, 4], [3, 8]], [[3, 4], [5, 3], [6, 4], [6, 8]]],
  n: [[[0, 3], [0, 8]], [[0, 3], [3, 3], [5, 4], [6, 5], [6, 8]]],
  o: [[[1, 3], [5, 3], [6, 4], [6, 7], [5, 8], [1, 8], [0, 7], [0, 4], [1, 3]]],
  p: [[[0, 3], [0, 10]], [[0, 5], [3, 3], [5, 4], [6, 5], [6, 7], [5, 8], [2, 8], [0, 7]]],
  q: [[[1, 3], [5, 3], [6, 4], [6, 7], [5, 8], [1, 8], [0, 7], [0, 4], [1, 3]], [[6, 3], [6, 10]]],
  r: [[[0, 3], [0, 8]], [[0, 4], [3, 3], [5, 4], [6, 5]]],
  s: [[[5, 3], [1, 3], [0, 4], [0, 5], [1, 6], [5, 6], [6, 7], [5, 8], [1, 8], [0, 7]]],
  t: [[[3, 0], [3, 8]], [[1, 3], [5, 3]], [[3, 8], [5, 8], [6, 7]]],
  u: [[[0, 3], [0, 7], [1, 8], [5, 8], [6, 7], [6, 3]]],
  v: [[[0, 3], [3, 8], [6, 3]]],
  w: [[[0, 3], [2, 8], [3, 5], [4, 8], [6, 3]]],
  x: [[[0, 3], [6, 8]], [[6, 3], [0, 8]]],
  y: [[[0, 3], [3, 7], [6, 3]], [[3, 7], [3, 10], [2, 10], [1, 9]]],
  z: [[[0, 3], [6, 3], [0, 8], [6, 8]]],
  '0': [[[1, 0], [5, 0], [6, 1], [6, 7], [5, 8], [1, 8], [0, 7], [0, 1], [1, 0]]],
  '1': [[[1, 1], [3, 0], [3, 8]], [[1, 8], [5, 8]]],
  '2': [[[0, 1], [1, 0], [5, 0], [6, 1], [6, 4], [0, 8], [6, 8]]],
  '3': [[[0, 1], [1, 0], [5, 0], [6, 1], [6, 3], [4, 4], [6, 5], [6, 7], [5, 8], [1, 8], [0, 7]]],
  '4': [[[4, 0], [0, 5], [6, 5]], [[4, 0], [4, 8]]],
  '5': [[[6, 0], [0, 0], [0, 4], [4, 4], [6, 5], [6, 7], [5, 8], [1, 8], [0, 7]]],
  '6': [[[6, 1], [5, 0], [1, 0], [0, 1], [0, 7], [1, 8], [5, 8], [6, 7], [6, 5], [4, 4], [0, 4]]],
  '7': [[[0, 0], [6, 0], [3, 8]]],
  '8': [[[1, 0], [5, 0], [6, 1], [6, 3], [5, 4], [1, 4], [0, 3], [0, 1]], [[1, 4], [5, 4], [6, 5], [6, 7], [5, 8], [1, 8], [0, 7], [0, 5]]],
  '9': [[[0, 5], [1, 4], [5, 4], [6, 5], [6, 7], [6, 1], [5, 0], [1, 0], [0, 1], [0, 4]]],
  '.': [[[3, 8]]],
  ',': [[[3, 8], [3, 9], [2, 10], [1, 10]]],
  ':': [[[3, 3]], [[3, 7]]],
  ';': [[[3, 3]], [[3, 7], [3, 8], [2, 9], [1, 9]]],
  '!': [[[3, 0], [3, 6]], [[3, 8]]],
  '?': [[[1, 1], [2, 0], [4, 0], [5, 1], [5, 3], [3, 5], [3, 6]], [[3, 8]]],
  "'": [[[3, 0], [2, 3]]],
  '’': [[[3, 0], [2, 3]]],
  '"': [[[2, 0], [2, 2], [1, 3]], [[5, 0], [5, 2], [4, 3]]],
  '-': [[[0, 5], [6, 5]]],
  '—': [[[0, 5], [6, 5]]],
  '–': [[[0, 5], [6, 5]]],
  '(': [[[5, 0], [3, 1], [2, 3], [2, 5], [3, 7], [5, 8]]],
  ')': [[[1, 0], [3, 1], [4, 3], [4, 5], [3, 7], [1, 8]]],
  '%': [[[0, 0], [6, 8]], [[1, 1], [2, 1], [2, 2], [1, 2]], [[4, 6], [5, 6], [5, 7], [4, 7]]],
  '/': [[[1, 8], [5, 0]]],
  '+': [[[3, 1], [3, 7]], [[0, 4], [6, 4]]],
  '=': [[[0, 3], [6, 3]], [[0, 6], [6, 6]]],
  '•': [[[3, 5]]],
  '$': [[[6, 1], [5, 0], [1, 0], [0, 1], [0, 3], [1, 4], [5, 4], [6, 5], [6, 7], [5, 8], [1, 8], [0, 7]], [[3, 0], [3, 8]]],
};

const ADVANCE_UNITS = 7;
const SPACE_UNITS = 4;

interface TextOpts {
  size: number;
  color: RGB;
  bold?: boolean;
  tracking?: number; // extra px per character
  align?: 'left' | 'center' | 'right';
}

function charAdvance(ch: string, size: number, tracking: number): number {
  const scale = size / 10;
  const units = ch === ' ' ? SPACE_UNITS : ADVANCE_UNITS;
  return units * scale + tracking;
}

function measure(text: string, size: number, tracking = 0): number {
  let w = 0;
  for (const ch of text) w += charAdvance(ch, size, tracking);
  return w - (text.length ? tracking : 0);
}

function drawChar(ch: string, x: number, yTop: number, size: number, thick: number, c: RGB): void {
  const strokes = GLYPHS[ch];
  if (!strokes) return;
  const s = size / 10;
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      fillCircle(x + stroke[0][0] * s, yTop + stroke[0][1] * s, thick / 2, c);
      continue;
    }
    for (let i = 0; i + 1 < stroke.length; i++) {
      thickLine(
        x + stroke[i][0] * s,
        yTop + stroke[i][1] * s,
        x + stroke[i + 1][0] * s,
        yTop + stroke[i + 1][1] * s,
        thick,
        c,
      );
    }
    for (const [gx, gy] of stroke) fillCircle(x + gx * s, yTop + gy * s, thick / 2, c);
  }
}

function drawText(text: string, x: number, yTop: number, o: TextOpts): number {
  const tracking = o.tracking ?? 0;
  const thick = Math.max(1, o.size * (o.bold ? 0.16 : 0.115));
  let cx = x;
  if (o.align === 'center' || o.align === 'right') {
    const w = measure(text, o.size, tracking);
    if (o.align === 'center') cx = x - w / 2;
    else cx = x - w;
  }
  for (const ch of text) {
    if (ch !== ' ') drawChar(ch, cx, yTop, o.size, thick, o.color);
    cx += charAdvance(ch, o.size, tracking);
  }
  return cx;
}

// Greedy word wrap. Returns lines of text that fit maxWidth.
function wrapText(text: string, size: number, maxWidth: number, tracking = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (measure(trial, size, tracking) <= maxWidth || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrapped(text: string, x: number, yTop: number, maxWidth: number, o: TextOpts, lineHeight?: number): number {
  const tracking = o.tracking ?? 0;
  const lh = lineHeight ?? o.size * 1.28;
  const lines = wrapText(text, o.size, maxWidth, tracking);
  let y = yTop;
  for (const line of lines) {
    drawText(line, x, y, o);
    y += lh;
  }
  return y;
}

// ---------------------------------------------------------------------------
// PNG encoder: filters + fixed-Huffman DEFLATE + CRC32 + Adler32, by hand
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}

// Fixed-Huffman literal/length code for a symbol 0..287 -> [code, bitLength]
function litCode(sym: number): [number, number] {
  if (sym <= 143) return [0x30 + sym, 8];
  if (sym <= 255) return [0x190 + (sym - 144), 9];
  if (sym <= 279) return [sym - 256, 7];
  return [0xc0 + (sym - 280), 8];
}

// [baseLength, extraBits, symbol]
const LEN_TABLE: Array<[number, number, number]> = [
  [3, 0, 257], [4, 0, 258], [5, 0, 259], [6, 0, 260], [7, 0, 261], [8, 0, 262],
  [9, 0, 263], [10, 0, 264], [11, 1, 265], [13, 1, 266], [15, 1, 267], [17, 1, 268],
  [19, 2, 269], [23, 2, 270], [27, 2, 271], [31, 2, 272], [35, 3, 273], [43, 3, 274],
  [51, 3, 275], [59, 3, 276], [67, 4, 277], [83, 4, 278], [99, 4, 279], [115, 4, 280],
  [131, 5, 281], [163, 5, 282], [195, 5, 283], [227, 5, 284], [258, 0, 285],
];
// [baseDistance, extraBits, symbol]
const DIST_TABLE: Array<[number, number, number]> = [
  [1, 0, 0], [2, 0, 1], [3, 0, 2], [4, 0, 3], [5, 1, 4], [7, 1, 5],
  [9, 2, 6], [13, 2, 7], [17, 3, 8], [25, 3, 9], [33, 4, 10], [49, 4, 11],
  [65, 5, 12], [97, 5, 13], [129, 6, 14], [193, 6, 15], [257, 7, 16], [385, 7, 17],
  [513, 8, 18], [769, 8, 19], [1025, 9, 20], [1537, 9, 21], [2049, 10, 22],
  [3073, 10, 23], [4097, 11, 24], [6145, 11, 25], [8193, 12, 26], [12289, 12, 27],
  [16385, 13, 28], [24577, 13, 29],
];

class BitWriter {
  bytes: number[] = [];
  cur = 0;
  nbits = 0;
  bit(b: number): void {
    this.cur |= (b & 1) << this.nbits;
    this.nbits++;
    if (this.nbits === 8) {
      this.bytes.push(this.cur);
      this.cur = 0;
      this.nbits = 0;
    }
  }
  // value's low `count` bits, least-significant bit first
  bitsLE(value: number, count: number): void {
    for (let i = 0; i < count; i++) this.bit((value >> i) & 1);
  }
  // Huffman code: most-significant bit first
  huff(code: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bit((code >> i) & 1);
  }
  finish(): Uint8Array {
    if (this.nbits > 0) this.bytes.push(this.cur);
    return new Uint8Array(this.bytes);
  }
}

function deflateFixed(data: Uint8Array): Uint8Array {
  const w = new BitWriter();
  w.bitsLE(1, 1); // BFINAL
  w.bitsLE(1, 2); // BTYPE = 01 fixed Huffman

  // Hash of 3-byte sequences -> last few positions (for LZ77 matches).
  const table = new Map<number, number[]>();
  const hashAt = (i: number): number =>
    ((data[i] << 16) ^ (data[i + 1] << 8) ^ data[i + 2]) & 0xffff;

  let pos = 0;
  const n = data.length;
  while (pos < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (pos + 2 < n) {
      const h = hashAt(pos);
      const cands = table.get(h);
      if (cands) {
        for (let ci = cands.length - 1; ci >= 0; ci--) {
          const prev = cands[ci];
          const dist = pos - prev;
          if (dist > 32768) continue;
          let len = 0;
          const maxLen = Math.min(258, n - pos);
          while (len < maxLen && data[prev + len] === data[pos + len]) len++;
          if (len >= 3 && len > bestLen) {
            bestLen = len;
            bestDist = dist;
            if (len >= 258) break;
          }
        }
      }
      const arr = cands ?? [];
      arr.push(pos);
      if (arr.length > 4) arr.shift();
      table.set(h, arr);
    }
    if (bestLen >= 3) {
      let li = 0;
      while (li + 1 < LEN_TABLE.length && LEN_TABLE[li + 1][0] <= bestLen) li++;
      const [base, extra, sym] = LEN_TABLE[li];
      const [code, clen] = litCode(sym);
      w.huff(code, clen);
      if (extra > 0) w.bitsLE(bestLen - base, extra);
      let di = 0;
      while (di + 1 < DIST_TABLE.length && DIST_TABLE[di + 1][0] <= bestDist) di++;
      const [dbase, dextra, dsym] = DIST_TABLE[di];
      w.huff(dsym, 5);
      if (dextra > 0) w.bitsLE(bestDist - dbase, dextra);
      pos += bestLen;
    } else {
      const [code, clen] = litCode(data[pos]);
      w.huff(code, clen);
      pos++;
    }
  }
  const [ecode, elen] = litCode(256);
  w.huff(ecode, elen);
  return w.finish();
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Filter every scanline (RGB, 3 bytes/px), pick the best filter per row.
function filteredScanlines(): Uint8Array {
  const stride = W * 3;
  const out = new Uint8Array(H * (stride + 1));
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  const cand = new Uint8Array(stride);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < stride; x++) row[x] = buf[y * stride + x];
    let bestType = 0;
    let bestScore = Infinity;
    for (let type = 0; type < 5; type++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const left = x >= 3 ? row[x - 3] : 0;
        const up = prev[x];
        const upLeft = x >= 3 ? prev[x - 3] : 0;
        let v: number;
        if (type === 0) v = row[x];
        else if (type === 1) v = (row[x] - left) & 0xff;
        else if (type === 2) v = (row[x] - up) & 0xff;
        else if (type === 3) v = (row[x] - ((left + up) >> 1)) & 0xff;
        else v = (row[x] - paeth(left, up, upLeft)) & 0xff;
        cand[x] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        out.set(cand, y * (stride + 1) + 1);
      }
    }
    out[y * (stride + 1)] = bestType;
    prev.set(row);
  }
  return out;
}

function encodePNG(): Uint8Array {
  const raw = filteredScanlines();
  const deflated = deflateFixed(raw);
  const zlib = new Uint8Array(2 + deflated.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x9c;
  zlib.set(deflated, 2);
  new DataView(zlib.buffer).setUint32(2 + deflated.length, adler32(raw));

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

// ---------------------------------------------------------------------------
// The front page itself
// ---------------------------------------------------------------------------

// Deterministic star field: a tiny fixed-seed generator (no Date, no Math.random).
let seed = 20261125;
function nextRand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function drawRocketPanel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  // Stars.
  for (let i = 0; i < 46; i++) {
    const sx = x + 8 + nextRand() * (w - 16);
    const sy = y + 8 + nextRand() * (h * 0.55);
    const r = nextRand() < 0.25 ? 1.6 : 1;
    fillCircle(sx, sy, r, [235, 238, 245]);
  }
  // Earth arc along the bottom, clipped to the panel so it never spills out.
  fillCircleClipped(x + w / 2, y + h + 330, 400, [46, 109, 180], x, y, w, h);
  fillCircleClipped(x + w * 0.28, y + h - 28, 46, [58, 140, 90], x, y, w, h);
  fillCircleClipped(x + w * 0.8, y + h - 6, 56, [58, 140, 90], x, y, w, h);
  fillRect(x, y + h - 4, w, 4, [120, 170, 220]);

  // Rocket, nose up, centre-right of the panel.
  const cx = x + w * 0.6;
  const noseY = y + 58;
  const bodyTop = y + 100;
  const bodyBot = y + 240;
  const bw = 46;
  // Flame.
  fillPolygon(
    [
      [cx - 16, bodyBot + 6],
      [cx + 16, bodyBot + 6],
      [cx + 6, bodyBot + 78],
      [cx, bodyBot + 96],
      [cx - 6, bodyBot + 78],
    ],
    [255, 122, 26],
  );
  fillPolygon(
    [
      [cx - 9, bodyBot + 6],
      [cx + 9, bodyBot + 6],
      [cx + 3, bodyBot + 52],
      [cx, bodyBot + 64],
      [cx - 3, bodyBot + 52],
    ],
    [255, 214, 64],
  );
  // Smoke puffs.
  fillCircle(cx - 34, bodyBot + 66, 16, [210, 214, 220]);
  fillCircle(cx + 36, bodyBot + 72, 18, [200, 204, 212]);
  fillCircle(cx - 8, bodyBot + 92, 20, [225, 228, 232]);
  // Fins.
  fillPolygon([[cx - bw / 2, bodyBot - 34], [cx - bw / 2, bodyBot], [cx - bw / 2 - 30, bodyBot + 12]], RED);
  fillPolygon([[cx + bw / 2, bodyBot - 34], [cx + bw / 2, bodyBot], [cx + bw / 2 + 30, bodyBot + 12]], RED);
  // Body.
  fillRect(cx - bw / 2, bodyTop, bw, bodyBot - bodyTop, WHITE);
  fillRect(cx - bw / 2, bodyTop, bw, 5, RED);
  // Nose cone.
  fillPolygon([[cx - bw / 2, bodyTop], [cx + bw / 2, bodyTop], [cx, noseY]], RED);
  // Window.
  fillCircle(cx, bodyTop + 58, 12, [46, 109, 180]);
  fillCircle(cx, bodyTop + 58, 7, [160, 205, 240]);
  // Booster stripe.
  fillRect(cx - bw / 2, bodyTop + 104, bw, 10, NAVY2);
  // Speed lines.
  thickLine(x + 26, y + 120, x + 64, y + 120, 3, [180, 195, 215]);
  thickLine(x + 26, y + 168, x + 78, y + 168, 3, [180, 195, 215]);
  thickLine(x + 26, y + 216, x + 56, y + 216, 3, [180, 195, 215]);

  // Caption inside the panel, top-left, clear of the rocket smoke.
  drawText('SHENZHOU-24', x + 18, y + 14, { size: 15, color: GOLD, bold: true, tracking: 1 });
  drawText('LONG MARCH 2F  •  JIUQUAN', x + 18, y + 36, { size: 12, color: WHITE, bold: true, tracking: 1 });
}

interface Card {
  tag: string;
  tagColor: RGB;
  headline: string;
  body: string;
}

function drawCard(x: number, y: number, w: number, h: number, card: Card): void {
  fillRect(x, y, w, h, CARD);
  fillRect(x, y, w, 2, INK);
  fillRect(x, y, 2, h, INK);
  fillRect(x + w - 2, y, 2, h, INK);
  fillRect(x, y + h - 2, w, 2, INK);
  drawText(card.tag, x + 14, y + 12, { size: 12, color: card.tagColor, bold: true, tracking: 1 });
  drawWrapped(card.headline, x + 14, y + 32, w - 28, { size: 18, color: INK, bold: true }, 22);
  const headLines = wrapText(card.headline, 18, w - 28);
  drawWrapped(card.body, x + 14, y + 32 + headLines.length * 22 + 6, w - 28, { size: 13, color: [58, 56, 50] }, 17);
}

function drawPage(): void {
  fillRect(0, 0, W, H, PAPER);
  const MX = 36;
  const CW = W - MX * 2;

  // Masthead.
  drawText('THE WORLD TODAY', W / 2, 26, { size: 58, color: INK, bold: true, align: 'center', tracking: 1 });
  fillRect(MX, 100, CW, 4, INK);
  fillRect(MX, 108, CW, 1, INK);
  drawText('WEDNESDAY 25 NOVEMBER 2026', MX, 118, { size: 17, color: RED, bold: true, tracking: 2 });
  drawText("THE DAY'S WORLD NEWS IN ONE IMAGE", MX + CW, 118, { size: 17, color: INK, align: 'right', tracking: 2 });

  // Lead story: text left, rocket panel right.
  const leadY = 150;
  const leadH = 350;
  const textW = 596;
  drawText('SPACE  •  CHINA', MX, leadY + 6, { size: 14, color: RED, bold: true, tracking: 2 });
  drawWrapped(
    "FIRST FOREIGN ASTRONAUT REACHES CHINA'S TIANGONG STATION",
    MX,
    leadY + 30,
    textW,
    { size: 33, color: INK, bold: true },
    40,
  );
  drawWrapped(
    'China launched Shenzhou-24 on Wednesday morning, carrying Pakistani astronaut Muhammad Zeeshan Ali — the first foreigner ever to visit the Tiangong space station. Commander Tang Hongbo and Wu Yi fly with him for five to ten days of experiments in orbit.',
    MX,
    leadY + 178,
    textW,
    { size: 15.5, color: [48, 46, 42] },
    22,
  );
  drawText('By Reuters and Xinhua  •  Jiuquan, China', MX, leadY + 330, { size: 12, color: GREY, tracking: 0.5 });
  drawRocketPanel(MX + textW + 20, leadY, CW - textW - 20, leadH);

  // Rule under the lead.
  fillRect(MX, leadY + leadH + 14, CW, 2, INK);

  // Six cards, 3 x 2.
  const cards: Card[] = [
    {
      tag: 'TRADE  •  UNITED STATES',
      tagColor: RED,
      headline: 'NEW US TARIFFS LOOM AS ASIAN STOCKS SLIDE',
      body: 'Washington is set to unveil new duties after a probe into factory overcapacity in 16 partners. Seoul fell 5.3%.',
    },
    {
      tag: 'MIDDLE EAST',
      tagColor: RED,
      headline: 'HOUTHI DRONE HITS RIYADH TOWER AGAIN',
      body: 'A second strike in days on Riyadh\u2019s PIF Tower wounded 11 people, Saudi civil defence said.',
    },
    {
      tag: 'CHINA',
      tagColor: NAVY2,
      headline: 'BEIJING PROBES TOP SHANGHAI OFFICIAL',
      body: 'Politburo member Chen Jining is under investigation, the fourth member of China\u2019s top body probed since 2025.',
    },
    {
      tag: 'EUROPE  •  WAR IN UKRAINE',
      tagColor: NAVY2,
      headline: 'KYIV CONFIRMS BALTIC SHIP STRIKE',
      body: 'Zelenskyy said Ukraine hit the Russian cargo ship Sparta II in the Gulf of Finland. Ally Norway urged caution.',
    },
    {
      tag: 'AFRICA  •  HEALTH',
      tagColor: [26, 110, 66],
      headline: 'EBOLA TEAM RESCUED AFTER 3 DAYS UNDER FIRE',
      body: 'WHO staff were evacuated from a hospital in Ituri, DR Congo, after sheltering in a maternity ward as fighting raged.',
    },
    {
      tag: 'MARKETS',
      tagColor: [26, 110, 66],
      headline: 'US INFLATION AND GDP DATA DUE TODAY',
      body: 'Traders await October PCE and Q3 GDP ahead of a December Fed meeting, with a rate rise almost fully priced in.',
    },
  ];
  const gap = 16;
  const cardW = (CW - gap * 2) / 3;
  const cardH = 180;
  const gridY = leadY + leadH + 30;
  for (let i = 0; i < cards.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawCard(MX + col * (cardW + gap), gridY + row * (cardH + gap), cardW, cardH, cards[i]);
  }

  // Markets ticker.
  const tickY = gridY + cardH * 2 + gap + 16;
  fillRect(MX, tickY, CW, 40, NAVY);
  drawText(
    'SEOUL -5.3%   •   TAIPEI -5.1%   •   NIKKEI -2.9%   •   GOLD $3,545   •   BRENT $90.97   •   BITCOIN $59,508',
    W / 2,
    tickY + 12,
    { size: 13.5, color: WHITE, bold: true, align: 'center', tracking: 0 },
  );

  // Footer.
  drawText(
    'SOURCES: REUTERS  •  XINHUA  •  UN NEWS  •  BLOOMBERG  •  WSJ  —  STORIES REPORTED 24–25 NOV 2026',
    W / 2,
    tickY + 52,
    { size: 11.5, color: GREY, align: 'center', tracking: 0.5 },
  );
}

drawPage();
const png = encodePNG();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
