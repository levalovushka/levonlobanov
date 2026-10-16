// CPU image analysis: detail map, color edges (Canny), distance-to-edge field,
// edge-tangent flow field, and the scalar noise used for "andamento" swirls.

// ---------- blur ----------

function boxesForGauss(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

function boxH(src, dst, W, H, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[o + Math.min(Math.max(k, 0), W - 1)];
    for (let x = 0; x < W; x++) {
      dst[o + x] = acc * inv;
      acc += src[o + Math.min(x + r + 1, W - 1)] - src[o + Math.max(x - r, 0)];
    }
  }
}

function boxV(src, dst, W, H, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[Math.min(Math.max(k, 0), H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc * inv;
      acc += src[Math.min(y + r + 1, H - 1) * W + x] - src[Math.max(y - r, 0) * W + x];
    }
  }
}

export function gaussBlur(src, W, H, sigma) {
  const a = Float32Array.from(src);
  if (sigma < 0.35) return a;
  const t = new Float32Array(W * H);
  for (const box of boxesForGauss(sigma, 3)) {
    const r = (box - 1) >> 1;
    if (r < 1) continue;
    boxH(a, t, W, H, r);
    boxV(t, a, W, H, r);
  }
  return a;
}

function percentile(arr, q) {
  const step = Math.max(1, Math.floor(arr.length / 200000));
  const s = [];
  for (let i = 0; i < arr.length; i += step) s.push(arr[i]);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] || 1e-6;
}

// ---------- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ----------

function dt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -1e20; z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

export function edt(mask, W, H) {
  const n = Math.max(W, H);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const g = new Float64Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = mask[y * W + x] ? 0 : 1e20;
    dt1(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) f[x] = g[o + x];
    dt1(f, W, d, v, z);
    for (let x = 0; x < W; x++) out[o + x] = Math.min(Math.sqrt(d[x]), 4000);
  }
  return out;
}

// ---------- analysis ----------

const SRGB2LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB2LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export { SRGB2LIN };

/**
 * @param {ImageData} img
 * @param {{edgeBlur:number, edgeThresh:number, edgeMinLen:number, detailBlur:number}} P
 */
export function analyze(img, P) {
  const W = img.width, H = img.height, N = W * H, src = img.data;
  const ch = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  for (let i = 0; i < N; i++) {
    ch[0][i] = src[4 * i] / 255;
    ch[1][i] = src[4 * i + 1] / 255;
    ch[2][i] = src[4 * i + 2] / 255;
  }

  // --- detail: color gradient energy on the (almost) raw image, blurred over a neighbourhood ---
  const detailRaw = new Float32Array(N);
  {
    const sm = ch.map((c) => gaussBlur(c, W, H, 0.7));
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        let e = 0;
        for (const a of sm) {
          const gx = a[i - W + 1] + 2 * a[i + 1] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - 1] - a[i + W - 1];
          const gy = a[i + W - 1] + 2 * a[i + W] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - W] - a[i - W + 1];
          e += gx * gx + gy * gy;
        }
        detailRaw[i] = Math.sqrt(e);
      }
    }
  }
  const detailBl = gaussBlur(detailRaw, W, H, P.detailBlur);
  const dNorm = 1 / percentile(detailBl, 0.97);
  const detail = new Float32Array(N);
  for (let i = 0; i < N; i++) detail[i] = Math.min(1, detailBl[i] * dNorm);

  // --- edges: Di Zenzo color gradient on a smoothed image + NMS + hysteresis ---
  const bl = ch.map((c) => gaussBlur(c, W, H, P.edgeBlur));
  const mag = new Float32Array(N);
  const dir = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let jxx = 0, jyy = 0, jxy = 0;
      for (const a of bl) {
        const gx = a[i - W + 1] + 2 * a[i + 1] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - 1] - a[i + W - 1];
        const gy = a[i + W - 1] + 2 * a[i + W] + a[i + W + 1] - a[i - W - 1] - 2 * a[i - W] - a[i - W + 1];
        jxx += gx * gx; jyy += gy * gy; jxy += gx * gy;
      }
      const tr = jxx + jyy, df = jxx - jyy;
      mag[i] = Math.sqrt(0.5 * (tr + Math.sqrt(df * df + 4 * jxy * jxy)));
      let ang = 0.5 * Math.atan2(2 * jxy, df) * 180 / Math.PI; // gradient direction
      if (ang < 0) ang += 180;
      dir[i] = ang < 22.5 || ang >= 157.5 ? 0 : ang < 67.5 ? 1 : ang < 112.5 ? 2 : 3;
    }
  }
  const mNorm = 1 / percentile(mag, 0.99);
  for (let i = 0; i < N; i++) mag[i] *= mNorm;

  const hi = P.edgeThresh, lo = P.edgeThresh * 0.45;
  const nms = new Uint8Array(N); // 2 strong, 1 weak
  const OFF = [1, W + 1, W, W - 1];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, m = mag[i];
      if (m < lo) continue;
      const o = OFF[dir[i]];
      if (m >= mag[i + o] && m >= mag[i - o]) nms[i] = m >= hi ? 2 : 1;
    }
  }
  const edges = new Uint8Array(N);
  const stack = new Int32Array(N);
  const N8 = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  for (let i = 0; i < N; i++) {
    if (nms[i] !== 2 || edges[i]) continue;
    let sp = 0; stack[sp++] = i; edges[i] = 1;
    while (sp) {
      const j = stack[--sp];
      for (const o of N8) {
        const k = j + o;
        if (k > 0 && k < N && nms[k] && !edges[k]) { edges[k] = 1; stack[sp++] = k; }
      }
    }
  }
  // drop short fragments (texture noise such as individual grass blades)
  if (P.edgeMinLen > 0) {
    const seen = new Uint8Array(N);
    const comp = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      if (!edges[i] || seen[i]) continue;
      let sp = 0, cn = 0; stack[sp++] = i; seen[i] = 1;
      while (sp) {
        const j = stack[--sp]; comp[cn++] = j;
        for (const o of N8) {
          const k = j + o;
          if (k > 0 && k < N && edges[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
        }
      }
      if (cn < P.edgeMinLen) for (let q = 0; q < cn; q++) edges[comp[q]] = 0;
    }
  }
  let edgeCount = 0;
  for (let i = 0; i < N; i++) edgeCount += edges[i];

  // label surviving contours: length (px) and mean gradient magnitude per component,
  // used to tell significant silhouettes from texture contours
  const compId = new Int32Array(N);
  const compLen = [0], compMag = [0];
  for (let i = 0; i < N; i++) {
    if (!edges[i] || compId[i]) continue;
    const id = compLen.length;
    let sp = 0, cn = 0, sm = 0;
    stack[sp++] = i; compId[i] = id;
    while (sp) {
      const j = stack[--sp]; cn++; sm += mag[j];
      for (const o of N8) {
        const k = j + o;
        if (k > 0 && k < N && edges[k] && !compId[k]) { compId[k] = id; stack[sp++] = k; }
      }
    }
    compLen.push(cn); compMag.push(sm / cn);
  }

  // --- distance to nearest real edge (used for visibility blocking) ---
  const dist = edt(edges, W, H);
  const lumRaw = new Float32Array(N);
  for (let i = 0; i < N; i++) lumRaw[i] = 0.2126 * ch[0][i] + 0.7152 * ch[1][i] + 0.0722 * ch[2][i];
  const lum = gaussBlur(lumRaw, W, H, 2);

  return { W, H, detail, edges, edgeCount, dist, mag, lum, compId, compLen, compMag };
}

// Tangent of the iso-lines of a distance field, as smoothed doubled-angle vectors
// (orientation is defined mod pi, so opposite tangents must not cancel when blurred).
export function tangentField(dist, W, H) {
  let ex = new Float32Array(W * H), ey = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = dist[i + 1] - dist[i - 1], gy = dist[i + W] - dist[i - W];
      const l2 = gx * gx + gy * gy;
      if (l2 < 1e-8) continue;
      // tangent t = (-gy, gx); doubled angle (t.x^2 - t.y^2, 2 t.x t.y) / |t|^2
      ex[i] = (gy * gy - gx * gx) / l2;
      ey[i] = (-2 * gy * gx) / l2;
    }
  }
  ex = gaussBlur(ex, W, H, 2.5);
  ey = gaussBlur(ey, W, H, 2.5);
  return { ex, ey };
}

// ---------- sampling helpers ----------

export function bilinear(a, W, H, x, y) {
  x -= 0.5; y -= 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const x1 = Math.min(Math.max(x0 + 1, 0), W - 1), y1 = Math.min(Math.max(y0 + 1, 0), H - 1);
  x0 = Math.min(Math.max(x0, 0), W - 1); y0 = Math.min(Math.max(y0, 0), H - 1);
  const a00 = a[y0 * W + x0], a10 = a[y0 * W + x1], a01 = a[y1 * W + x0], a11 = a[y1 * W + x1];
  return a00 + (a10 - a00) * fx + (a01 - a00) * fy + (a00 - a10 - a01 + a11) * fx * fy;
}

// ---------- value-noise fbm for swirling flow ----------

let noiseSeed = 1;
export function setNoiseSeed(s) { noiseSeed = s | 0; }

function hashf(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(noiseSeed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hashf(ix, iy), b = hashf(ix + 1, iy), c = hashf(ix, iy + 1), d = hashf(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x, y) {
  return vnoise(x, y) + 0.5 * vnoise(x * 2.03 + 17.1, y * 2.03 + 3.7) + 0.25 * vnoise(x * 4.01 + 5.3, y * 4.01 + 29.9);
}
