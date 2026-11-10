// A small QR Code encoder (byte mode, error-correction level M, versions 1–10, up to 213 bytes)
// for garment passport links. No dependencies; returns a module matrix or an SVG string.
// Follows ISO/IEC 18004 (Model 2).

// Data codewords per block and EC codewords per block, level M, versions 1..10.
const BLOCKS_M = [null,
  { ec: 10, groups: [[1, 16]] }, { ec: 16, groups: [[1, 28]] }, { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] }, { ec: 24, groups: [[2, 43]] }, { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] }, { ec: 22, groups: [[2, 38], [2, 39]] }, { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] }];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const REMAINDER = [null, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z & 0xFF;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = gfMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

export function encodeQR(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const dataCw = BLOCKS_M[v].groups.reduce((s, [n, k]) => s + n * k, 0);
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCw * 8) { version = v; break; }
  }
  if (!version) throw new Error('Text too long for this QR encoder');
  const spec = BLOCKS_M[version], size = version * 4 + 17;
  const dataCw = spec.groups.reduce((s, [n, k]) => s + n * k, 0);

  // Bit stream: mode, length, bytes, terminator, padding.
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4); push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xEC; data.length < dataCw; pad ^= 0xEC ^ 0x11) data.push(pad);

  // Split into blocks, add error correction, interleave.
  const blocks = [], div = rsDivisor(spec.ec);
  let k = 0;
  for (const [n, len] of spec.groups) for (let b = 0; b < n; b++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, div) }); }
  const final = [];
  const maxLen = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) final.push(b.d[i]);
  for (let i = 0; i < spec.ec; i++) for (const b of blocks) final.push(b.e[i]);

  // Matrix with function patterns. m[y][x]; fn marks function modules.
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[version];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const d = (0 << 3) | mask; // level M = 00
    let rem = d; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(f, i));
    set(8, 7, bit(f, 6)); set(8, 8, bit(f, 7)); set(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(f, i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const v = (version << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(v, i)); set(b, a, bit(v, i)); }
  }

  // Place codewords in the zigzag.
  let idx = 0;
  const totalBits = final.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && idx < totalBits) { m[y][x] = bit(final[idx >>> 3], 7 - (idx & 7)); idx++; }
    }
  }
  void REMAINDER; // remainder bits stay light

  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const apply = mask => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[mask](x, y)) m[y][x] = !m[y][x]; };

  const penalty = () => {
    let p = 0, dark = 0;
    const line = get => {
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (get(i) === get(i - 1)) run++; else { if (run >= 5) p += run - 2; run = 1; }
      }
      if (run >= 5) p += run - 2;
      for (let i = 0; i + 10 < size + 4; i++) {
        const seq = []; for (let k2 = 0; k2 < 11; k2++) { const t = i + k2 - 4; seq.push(t >= 0 && t < size ? get(t) : false); }
        const s = seq.map(b => (b ? 1 : 0)).join('');
        if (s === '00001011101' || s === '10111010000') p += 40;
      }
    };
    for (let y = 0; y < size; y++) line(i => m[y][i]);
    for (let x = 0; x < size; x++) line(i => m[i][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    apply(mask); drawFormat(mask);
    const s = penalty(); if (s < bestScore) { bestScore = s; best = mask; }
    apply(mask);
  }
  apply(best); drawFormat(best);
  return { size, version, mask: best, modules: m };
}

export function qrSVG(text, { margin = 4, dark = '#141210', light = '#f2ebdd', label = '' } = {}) {
  const { size, modules } = encodeQR(text), dim = size + margin * 2;
  let path = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges" role="img" aria-label="${esc(label || 'QR code')}"><rect width="${dim}" height="${dim}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
