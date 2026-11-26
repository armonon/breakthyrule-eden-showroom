// Ground routes for the herd: a 1 m grid of where a cow can stand, and flow fields over it (a breadth-first flood
// from a destination, so every cell knows which neighbour is one step closer). A field is cheap (a few ms) and is
// rebuilt when its destination moves to another cell or a gate opens.
export function createNav({ world, bounds = [-60, 104, -160, 76], cell = 1, radius = .75 }) {
  const [x0, x1, z0, z1] = bounds, cols = Math.ceil((x1 - x0) / cell), rows = Math.ceil((z1 - z0) / cell), N = cols * rows;
  let open = new Uint8Array(N), version = 0;
  const col = x => Math.floor((x - x0) / cell), row = z => Math.floor((z - z0) / cell), inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;
  function rebuild() { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) open[r * cols + c] = world.blocked(x0 + (c + .5) * cell, z0 + (r + .5) * cell, radius) ? 0 : 1; version++; }
  rebuild();
  // The open cell nearest a point (within 4 cells), or -1.
  function snap(x, z) {
    const c0 = col(x), r0 = row(z); if (inside(c0, r0) && open[r0 * cols + c0]) return r0 * cols + c0;
    let best = -1, bd = 1e9;
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) { const c = c0 + dc, r = r0 + dr; if (inside(c, r) && open[r * cols + c]) { const d = dc * dc + dr * dr; if (d < bd) { bd = d; best = r * cols + c; } } }
    return best;
  }
  const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
  function field(tx, tz) {
    const dist = new Int32Array(N).fill(-1), start = snap(tx, tz), queue = new Int32Array(N); let head = 0, tail = 0;
    if (start >= 0) { dist[start] = 0; queue[tail++] = start; }
    while (head < tail) {
      const i = queue[head++], c = i % cols, r = (i - c) / cols, d = dist[i] + 1;
      for (let k = 0; k < 8; k++) { const nc = c + DC[k], nr = r + DR[k]; if (!inside(nc, nr)) continue; const j = nr * cols + nc; if (!open[j] || dist[j] >= 0) continue;
        if (k > 3 && (!open[r * cols + nc] || !open[nr * cols + c])) continue;   // no cutting corners
        dist[j] = d; queue[tail++] = j; }
    }
    // The step to take from a point: toward the neighbour with the least distance. null if there is no way.
    function dir(x, z, out) {
      const i = snap(x, z); if (i < 0 || dist[i] < 0) return null; if (dist[i] === 0) { out.x = 0; out.z = 0; return out; }
      const c = i % cols, r = (i - c) / cols; let best = dist[i], bx = 0, bz = 0;
      for (let k = 0; k < 8; k++) { const nc = c + DC[k], nr = r + DR[k]; if (!inside(nc, nr)) continue; const j = nr * cols + nc; if (dist[j] < 0 || dist[j] >= best) continue;
        if (k > 3 && (!open[r * cols + nc] || !open[nr * cols + c])) continue; best = dist[j]; bx = DC[k]; bz = DR[k]; }
      const l = Math.hypot(bx, bz) || 1; out.x = bx / l; out.z = bz / l; return out;
    }
    const steps = (x, z) => { const i = snap(x, z); return i < 0 ? -1 : dist[i]; };
    return { dir, steps, x: tx, z: tz, version, cell: start };
  }
  return { field, rebuild, snap, cellOf: (x, z) => row(z) * cols + col(x), get version() { return version; } };
}
