/**
 * Gradient-boosted trees for binary log loss, small enough to read: quantile bins, fixed depth,
 * shrinkage, row subsampling, per-sample weights. Trees come out in the breadth-first layout
 * src/score.ts evaluates.
 */
export interface Tree { f: number[]; t: number[]; l: number[] }
export interface Gbdt { base: number; rate: number; trees: Tree[] }

export interface GbdtOptions { trees?: number; depth?: number; rate?: number; bins?: number; minLeaf?: number; subsample?: number; lambda?: number; seed?: number; colsample?: number }

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function trainGbdt(X: number[][], y: number[], w: number[], o: GbdtOptions = {}): Gbdt {
  const T = o.trees ?? 300, D = o.depth ?? 3, rate = o.rate ?? 0.08, B = o.bins ?? 32, minLeaf = o.minLeaf ?? 20, sub = o.subsample ?? 0.8, lambda = o.lambda ?? 1, col = o.colsample ?? 0.6;
  const n = X.length, d = X[0].length;
  const rand = rng(o.seed ?? 7);
  // Quantile thresholds per feature.
  const cuts: number[][] = [];
  const binned: Uint8Array[] = [];
  for (let j = 0; j < d; j++) {
    const vals = X.map((x) => x[j]).sort((a, b) => a - b);
    const cs: number[] = [];
    for (let k = 1; k < B; k++) {
      const v = vals[Math.floor((k * n) / B)];
      if (!cs.length || v > cs[cs.length - 1]) cs.push(v);
    }
    cuts.push(cs);
    const col = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let b = 0;
      while (b < cs.length && X[i][j] > cs[b]) b++;
      col[i] = b;
    }
    binned.push(col);
  }
  const wsum = w.reduce((a, b) => a + b, 0);
  const pbar = y.reduce((a, v, i) => a + v * w[i], 0) / wsum;
  const base = Math.log(pbar / (1 - pbar));
  const F = new Float64Array(n).fill(base);
  const trees: Tree[] = [];
  for (let t = 0; t < T; t++) {
    const g = new Float64Array(n), h = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = 1 / (1 + Math.exp(-F[i]));
      g[i] = (p - y[i]) * w[i];
      h[i] = Math.max(p * (1 - p), 1e-6) * w[i];
    }
    const rows: number[] = [];
    for (let i = 0; i < n; i++) if (rand() < sub) rows.push(i);
    const feats: number[] = [];
    for (let j = 0; j < d; j++) if (rand() < col) feats.push(j);
    const size = 2 ** (D + 1) - 1;
    const tree: Tree = { f: new Array(size).fill(-1), t: new Array(size).fill(0), l: new Array(size).fill(0) };
    const leafVal = (idx: number[]) => {
      let G = 0, H = 0;
      for (const i of idx) { G += g[i]; H += h[i]; }
      return -G / (H + lambda);
    };
    const grow = (node: number, idx: number[], depth: number) => {
      if (depth === D || idx.length < 2 * minLeaf) { tree.l[node] = leafVal(idx); return; }
      let G = 0, H = 0;
      for (const i of idx) { G += g[i]; H += h[i]; }
      const parent = (G * G) / (H + lambda);
      let best = 0, bf = -1, bb = -1;
      for (const j of feats) {
        const nb = cuts[j].length + 1;
        if (nb < 2) continue;
        const hg = new Float64Array(nb), hh = new Float64Array(nb), hc = new Int32Array(nb);
        const col = binned[j];
        for (const i of idx) { const b = col[i]; hg[b] += g[i]; hh[b] += h[i]; hc[b]++; }
        let gl = 0, hl = 0, cl = 0;
        for (let b = 0; b < nb - 1; b++) {
          gl += hg[b]; hl += hh[b]; cl += hc[b];
          if (cl < minLeaf || idx.length - cl < minLeaf) continue;
          const gr = G - gl, hr = H - hl;
          const gain = (gl * gl) / (hl + lambda) + (gr * gr) / (hr + lambda) - parent;
          if (gain > best) { best = gain; bf = j; bb = b; }
        }
      }
      if (bf < 0) { tree.l[node] = leafVal(idx); return; }
      tree.f[node] = bf;
      tree.t[node] = cuts[bf][bb];
      const left: number[] = [], right: number[] = [];
      for (const i of idx) (binned[bf][i] <= bb ? left : right).push(i);
      grow(2 * node + 1, left, depth + 1);
      grow(2 * node + 2, right, depth + 1);
    };
    grow(0, rows, 0);
    // Compact unused slots to zero and update every row's margin.
    for (let i = 0; i < n; i++) F[i] += rate * evalTree(tree, X[i]);
    trees.push(tree);
  }
  return { base, rate, trees };
}

export function evalTree(tree: Tree, x: number[]): number {
  let i = 0;
  while (tree.f[i] >= 0) i = x[tree.f[i]] <= tree.t[i] ? 2 * i + 1 : 2 * i + 2;
  return tree.l[i];
}

export function predictMargin(m: Gbdt, x: number[]): number {
  let s = m.base;
  for (const t of m.trees) s += m.rate * evalTree(t, x);
  return s;
}

/** Fit p = sigmoid(a * m + b) by weighted Newton steps on log loss. */
export function platt(margins: number[], y: number[], w: number[]): { a: number; b: number } {
  let a = 1, b = 0;
  for (let it = 0; it < 100; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (let i = 0; i < margins.length; i++) {
      const p = 1 / (1 + Math.exp(-(a * margins[i] + b)));
      const e = (p - y[i]) * w[i], s = p * (1 - p) * w[i];
      ga += e * margins[i]; gb += e;
      haa += s * margins[i] ** 2; hab += s * margins[i]; hbb += s;
    }
    haa += 1e-6; hbb += 1e-6;
    const det = haa * hbb - hab * hab;
    a -= (hbb * ga - hab * gb) / det;
    b -= (haa * gb - hab * ga) / det;
  }
  return { a, b };
}

export function auc(scores: number[], y: number[]): number {
  const idx = scores.map((s, i) => i).sort((p, q) => scores[p] - scores[q]);
  let rank = 0, sumPos = 0, pos = 0;
  for (let k = 0; k < idx.length; ) {
    let e = k;
    while (e + 1 < idx.length && scores[idx[e + 1]] === scores[idx[k]]) e++;
    const avg = (k + e) / 2 + 1;
    for (let q = k; q <= e; q++) if (y[idx[q]] === 1) { sumPos += avg; pos++; }
    rank = e + 1;
    k = e + 1;
  }
  void rank;
  const neg = y.length - pos;
  return pos && neg ? (sumPos - (pos * (pos + 1)) / 2) / (pos * neg) : NaN;
}
