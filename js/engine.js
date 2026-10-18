/* =====================================================================
   Cognitive Digital Twin engine (runs entirely in the browser)
   Data integration -> twin model -> ML forecasting -> knowledge graph
   -> Monte Carlo what-if simulation -> Q-learning decision optimisation
   ===================================================================== */
(function () {
'use strict';
const CDT = window.CDT = window.CDT || {};

/* ---------- utils ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randn(rng) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => a.length ? sum(a) / a.length : 0;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const quantile = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }
CDT.util = { mulberry32, randn, sum, mean, std, clamp, quantile, startOfWeek };

/* ---------- sample MSME retail dataset (deterministic) ---------- */
const SAMPLE_PRODUCTS = [
  { id: 'staples', name: 'Staples',   base: 1200, price: 48, cost: 31, elast: -0.8, season: 0.10, phase: 4,  fest: 0.4, supplier: 'S1' },
  { id: 'bev',     name: 'Beverages', base: 950,  price: 35, cost: 20, elast: -1.4, season: 0.26, phase: 10, fest: 1.0, supplier: 'S2' },
  { id: 'snacks',  name: 'Snacks',    base: 800,  price: 22, cost: 12, elast: -1.9, season: 0.18, phase: 18, fest: 0.9, supplier: 'S2' },
  { id: 'home',    name: 'Home care', base: 600,  price: 90, cost: 58, elast: -1.1, season: 0.12, phase: 30, fest: 0.5, supplier: 'S3' }
];

function generateSample(weeks, seed) {
  weeks = weeks || 104; const rng = mulberry32(seed || 42);
  const end = startOfWeek(new Date()); const dates = [];
  for (let i = 0; i < weeks; i++) { const d = new Date(end); d.setDate(d.getDate() - (weeks - 1 - i) * 7); dates.push(d); }
  const products = SAMPLE_PRODUCTS.map(sp => {
    const units = [], price = [], stock = [], sat = []; let st = sp.base * 2, pipe = sp.base;
    for (let i = 0; i < weeks; i++) {
      const wk = i % 52, trend = 1 + 0.12 * (i / weeks);
      const festival = (wk >= 38 && wk <= 43) ? 0.28 * sp.fest : 0;
      const seas = 1 + sp.season * Math.sin(2 * Math.PI * (i + sp.phase) / 52) + festival;
      const promo = rng() < 0.12, p = sp.price * (promo ? 0.9 : 1) * (1 + 0.008 * randn(rng));
      const dem = sp.base * trend * seas * Math.pow(p / sp.price, sp.elast) * Math.exp(0.065 * randn(rng));
      st += pipe; const sold = Math.min(dem, st); st -= sold;
      const target = dem * 2.2; pipe = Math.max(0, target - st);
      units.push(sold); price.push(p); stock.push(st);
      sat.push(clamp(62 + 36 * (sold / dem) + 2.5 * randn(rng), 40, 100));
    }
    return { id: sp.id, name: sp.name, supplier: sp.supplier, units, price, stock, sat, cost: sp.cost, truth: { elast: sp.elast, base: sp.base } };
  });
  return { name: 'Sample MSME retail dataset', source: 'sample', weeks, dates, products,
           quality: { rows: weeks * products.length, missing: 0, outliers: 0, interpolated: 0, assumedCost: false } };
}

/* ---------- CSV ingestion + cleaning ---------- */
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length);
  if (lines.length < 3) throw new Error('The file needs a header row and at least two data rows.');
  const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]).map(h => h.toLowerCase());
  const col = names => head.findIndex(h => names.includes(h));
  const ci = { date: col(['date', 'week', 'day']), product: col(['product', 'item', 'sku', 'category']), units: col(['units', 'quantity', 'qty', 'sales', 'units_sold']), price: col(['price', 'unit_price']), stock: col(['stock', 'inventory']), sat: col(['satisfaction', 'csat', 'rating']) };
  if (ci.date < 0 || ci.product < 0 || ci.units < 0 || ci.price < 0) throw new Error('Required columns: date, product, units, price (optional: stock, satisfaction).');
  return { rows: lines.slice(1).map(split), ci };
}
function ingestCSV(text, filename) {
  const { rows, ci } = parseCSV(text); let missing = 0, bad = 0;
  const byProd = {}; let minW = Infinity, maxW = -Infinity;
  rows.forEach(r => {
    const d = new Date(r[ci.date]), u = parseFloat(r[ci.units]), p = parseFloat(r[ci.price]);
    if (isNaN(d.getTime()) || !isFinite(u) || !isFinite(p) || u < 0 || p <= 0) { bad++; return; }
    const w = Math.round(startOfWeek(d).getTime() / 604800000); minW = Math.min(minW, w); maxW = Math.max(maxW, w);
    const k = r[ci.product] || 'Item'; const o = byProd[k] || (byProd[k] = {});
    const c = o[w] || (o[w] = { u: 0, pu: 0, n: 0, st: NaN, sat: [] });
    c.u += u; c.pu += p * u; c.n += 1; if (ci.stock >= 0 && isFinite(parseFloat(r[ci.stock]))) c.st = parseFloat(r[ci.stock]);
    if (ci.sat >= 0 && isFinite(parseFloat(r[ci.sat]))) c.sat.push(parseFloat(r[ci.sat]));
  });
  const names = Object.keys(byProd).slice(0, 8); const weeks = maxW - minW + 1;
  if (!names.length || weeks < 30) throw new Error('Need at least ~30 weeks of valid history (found ' + Math.max(weeks, 0) + ').');
  let interpolated = 0, outliers = 0;
  const dates = []; for (let i = 0; i < weeks; i++) dates.push(new Date((minW + i) * 604800000));
  const products = names.map((nm, idx) => {
    const units = [], price = [], stock = [], sat = [];
    for (let i = 0; i < weeks; i++) { const c = byProd[nm][minW + i];
      if (c && c.u > 0) { units.push(c.u); price.push(c.pu / c.u); stock.push(c.st); sat.push(c.sat.length ? mean(c.sat) : NaN); } else { units.push(NaN); price.push(NaN); stock.push(NaN); sat.push(NaN); missing++; } }
    const fill = a => { for (let i = 0; i < a.length; i++) if (isNaN(a[i])) { let l = i - 1, r = i + 1; while (l >= 0 && isNaN(a[l])) l--; while (r < a.length && isNaN(a[r])) r++; a[i] = l >= 0 && r < a.length ? a[l] + (a[r] - a[l]) * (i - l) / (r - l) : l >= 0 ? a[l] : r < a.length ? a[r] : NaN; } };
    const hadUnits = units.map(isNaN); fill(units); fill(price); interpolated += hadUnits.filter(Boolean).length;
    const q1 = quantile(units, .25), q3 = quantile(units, .75), iqr = q3 - q1;
    for (let i = 0; i < units.length; i++) { if (units[i] > q3 + 3 * iqr) { units[i] = q3 + 3 * iqr; outliers++; } else if (units[i] < q1 - 3 * iqr && units[i] < 0) { units[i] = Math.max(0, q1 - 3 * iqr); outliers++; } }
    const avgU = mean(units); const hasStock = stock.some(x => !isNaN(x)); fill(stock);
    const stk = hasStock ? stock.map(x => isNaN(x) ? avgU * 2 : x) : units.map(() => avgU * 2);
    const sT = sat.some(x => !isNaN(x)); fill(sat);
    return { id: 'p' + idx, name: nm, supplier: ['S1', 'S2', 'S3'][idx % 3], units, price, stock: stk, sat: sT ? sat : units.map(() => 85), cost: mean(price) * 0.68, costAssumed: true };
  });
  return { name: filename || 'Uploaded dataset', source: 'upload', weeks, dates, products,
           quality: { rows: rows.length, missing, outliers, interpolated, bad, assumedCost: true } };
}

/* ---------- twin parameter estimation ---------- */
function linreg(x, y) { const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); } const b = sxx > 1e-12 ? sxy / sxx : 0; return { b, a: my - b * mx, sxx }; }
function estimateParams(ds) {
  ds.products.forEach(p => {
    const n = p.units.length, w = 8; p.base = mean(p.units.slice(-w)); p.priceNow = mean(p.price.slice(-w));
    const lp = p.price.map(Math.log), lu = p.units.map(x => Math.log(Math.max(1, x)));
    const t = p.units.map((_, i) => i), rt = linreg(t, lu), lur = lu.map((v, i) => v - rt.b * i); // detrend
    const pv = std(lp); const r = linreg(lp, lur);
    p.elast = pv > 0.012 ? clamp(r.b, -3, -0.4) : -1.2; p.elastEstimated = pv > 0.012;
    p.stockNow = p.stock[n - 1]; p.weeklyRevenue = p.base * p.priceNow; p.margin = (p.priceNow - p.cost) / p.priceNow;
  });
  return ds;
}

/* ---------- forecasting: random forest + harmonic regression ---------- */
function buildTree(X, y, idx, depth, rng, mtry, minLeaf) {
  const m = mean(idx.map(i => y[i]));
  if (depth === 0 || idx.length < 2 * minLeaf) return { v: m };
  const nf = X[0].length, feats = []; while (feats.length < mtry) { const f = Math.floor(rng() * nf); if (!feats.includes(f)) feats.push(f); }
  let best = { gain: 0 }; const base = idx.reduce((s, i) => s + (y[i] - m) * (y[i] - m), 0);
  feats.forEach(f => {
    const vals = idx.map(i => X[i][f]).sort((a, b) => a - b);
    for (let q = 1; q <= 10; q++) { const th = vals[Math.floor(q / 11 * (vals.length - 1))];
      let ls = 0, lc = 0, rs = 0, rc = 0, lss = 0, rss = 0;
      idx.forEach(i => { const v = y[i]; if (X[i][f] <= th) { ls += v; lss += v * v; lc++; } else { rs += v; rss += v * v; rc++; } });
      if (lc < minLeaf || rc < minLeaf) continue;
      const sse = (lss - ls * ls / lc) + (rss - rs * rs / rc), gain = base - sse;
      if (gain > best.gain) best = { gain, f, th };
    }
  });
  if (!best.f && best.f !== 0) return { v: m };
  const L = idx.filter(i => X[i][best.f] <= best.th), R = idx.filter(i => X[i][best.f] > best.th);
  return { f: best.f, th: best.th, gain: best.gain, l: buildTree(X, y, L, depth - 1, rng, mtry, minLeaf), r: buildTree(X, y, R, depth - 1, rng, mtry, minLeaf) };
}
const predTree = (t, x) => t.l ? predTree(x[t.f] <= t.th ? t.l : t.r, x) : t.v;
function addImportance(t, imp) { if (!t.l) return; imp[t.f] += t.gain; addImportance(t.l, imp); addImportance(t.r, imp); }
const FEATURE_NAMES = ['Last week', '2 weeks ago', '4 weeks ago', '4-week average', 'Season (sin)', 'Season (cos)', 'Price ratio', 'Trend (time)'];
function featRow(units, i, priceRatio) {
  const l1 = units[i - 1], l2 = units[i - 2], l4 = units[i - 4], m4 = (units[i - 1] + units[i - 2] + units[i - 3] + units[i - 4]) / 4, w = i % 52;
  return [l1, l2, l4, m4, Math.sin(2 * Math.PI * w / 52), Math.cos(2 * Math.PI * w / 52), priceRatio, i];
}
function trainRF(units, prices, p0, upto, seed) {
  const rng = mulberry32(seed), X = [], y = [];
  for (let i = 4; i < upto; i++) { X.push(featRow(units, i, prices[i] / p0)); y.push(units[i]); }
  const trees = [], N = 40, n = X.length;
  for (let k = 0; k < N; k++) { const idx = []; for (let j = 0; j < n; j++) idx.push(Math.floor(rng() * n)); trees.push(buildTree(X, y, idx, 6, rng, 3, 3)); }
  return { trees, importance: (() => { const imp = new Array(8).fill(0); trees.forEach(t => addImportance(t, imp)); const s = sum(imp) || 1; return imp.map(v => v / s); })() };
}
function rfForecast(model, hist, startIdx, H) {
  const u = hist.slice(); const out = [];
  for (let h = 0; h < H; h++) { const i = startIdx + h, x = featRow(u, i, 1); const p = mean(model.trees.map(t => predTree(t, x))); u[i] = p; out.push(p); }
  return out;
}
function solve(A, b) { const n = b.length; for (let i = 0; i < n; i++) { let m = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r; [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
  for (let r = i + 1; r < n; r++) { const f = A[r][i] / (A[i][i] || 1e-12); for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-12); } return x; }
function harmRow(t) { const r = [1, t / 100]; for (let k = 1; k <= 3; k++) r.push(Math.sin(2 * Math.PI * k * t / 52), Math.cos(2 * Math.PI * k * t / 52)); return r; }
function trainHR(units, upto) {
  const X = [], y = []; for (let i = 0; i < upto; i++) { X.push(harmRow(i)); y.push(units[i]); }
  const k = X[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  X.forEach((r, i) => { for (let a = 0; a < k; a++) { b[a] += r[a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; } });
  for (let a = 0; a < k; a++) A[a][a] += 1e-4; return solve(A, b);
}
const hrPredict = (beta, i) => sum(harmRow(i).map((v, j) => v * beta[j]));

function metrics(actual, pred) {
  const e = actual.map((a, i) => a - pred[i]), mse = mean(e.map(v => v * v)), mape = mean(actual.map((a, i) => Math.abs(e[i]) / Math.max(1, a))) * 100;
  return { mse, rmse: Math.sqrt(mse), mape, accuracy: clamp(100 - mape, 0, 100) };
}
function buildForecasts(ds, H) {
  H = H || 12; const HOLD = 12, out = {};
  ds.products.forEach((p, k) => {
    const n = p.units.length, tr = n - HOLD, actual = p.units.slice(tr);
    const rf = trainRF(p.units, p.price, p.priceNow, tr, 100 + k);
    const rfHold = rfForecast(rf, p.units.slice(0, tr), tr, HOLD);
    const hr = trainHR(p.units, tr), hrHold = Array.from({ length: HOLD }, (_, h) => hrPredict(hr, tr + h));
    const m1 = metrics(actual, rfHold), m2 = metrics(actual, hrHold);
    const w1 = 1 / (m1.mse + 1e-9), w2 = 1 / (m2.mse + 1e-9), wr = w1 / (w1 + w2);
    const enHold = rfHold.map((v, i) => wr * v + (1 - wr) * hrHold[i]), m3 = metrics(actual, enHold);
    const rfF = trainRF(p.units, p.price, p.priceNow, n, 200 + k), hrF = trainHR(p.units, n);
    const rfFut = rfForecast(rfF, p.units, n, H), hrFut = Array.from({ length: H }, (_, h) => hrPredict(hrF, n + h));
    const mean_ = rfFut.map((v, i) => Math.max(0, wr * v + (1 - wr) * hrFut[i]));
    const sd = std(actual.map((a, i) => a - enHold[i]));
    out[p.id] = { hold: { actual, rf: rfHold, hr: hrHold, en: enHold, start: tr }, metrics: { rf: m1, hr: m2, en: m3 }, weight: wr, importance: rfF.importance,
      mean: mean_, lo: mean_.map((v, h) => Math.max(0, v - 1.28 * sd * Math.sqrt(1 + 0.06 * h))), hi: mean_.map((v, h) => v + 1.28 * sd * Math.sqrt(1 + 0.06 * h)), sd };
  });
  const tot = (key) => Array.from({ length: HOLD }, (_, i) => sum(ds.products.map(p => out[p.id].hold[key][i])));
  out.__total = { metrics: { rf: metrics(tot('actual'), tot('rf')), hr: metrics(tot('actual'), tot('hr')), en: metrics(tot('actual'), tot('en')) },
    hold: { actual: tot('actual'), rf: tot('rf'), hr: tot('hr'), en: tot('en') } };
  return out;
}

/* ---------- knowledge graph ---------- */
function buildGraph(ds) {
  const rev = ds.products.map(p => p.weeklyRevenue), tot = sum(rev) || 1;
  const nodes = [], edges = [];
  const add = (id, type, label, extra) => nodes.push(Object.assign({ id, type, label }, extra || {}));
  ds.products.forEach((p, i) => add('P' + i, 'product', p.name, { rev: rev[i], share: rev[i] / tot }));
  const segs = [['C1', 'Loyal customers', [0.5, 0.45, 0.4, 0.5]], ['C2', 'Occasional customers', [0.3, 0.35, 0.4, 0.3]], ['C3', 'New customers', [0.2, 0.2, 0.2, 0.2]]];
  segs.forEach(s => add(s[0], 'customer', s[1]));
  const sup = { S1: 'Agro Wholesale', S2: 'FreshBev Distributors', S3: 'HomeGoods Co.' };
  const used = [...new Set(ds.products.map(p => p.supplier))]; used.forEach(s => add(s, 'supplier', sup[s] || s));
  add('E1', 'employee', 'Counter staff'); add('E2', 'employee', 'Stock team');
  add('D1', 'dept', 'Sales'); add('D2', 'dept', 'Operations');
  segs.forEach(s => ds.products.forEach((p, i) => edges.push({ s: s[0], t: 'P' + i, rel: 'purchases', w: s[2][i % 4] })));
  ds.products.forEach((p, i) => edges.push({ s: p.supplier, t: 'P' + i, rel: 'delivers', w: 1 }));
  edges.push({ s: 'E1', t: 'D1', rel: 'manages', w: 1 }, { s: 'E2', t: 'D2', rel: 'manages', w: 1 });
  ds.products.forEach((p, i) => { edges.push({ s: 'D1', t: 'P' + i, rel: 'sells', w: 0.8 }); edges.push({ s: 'D2', t: 'P' + i, rel: 'stocks', w: 0.7 }); });
  return { nodes, edges };
}
function impactAnalysis(g, ds, nodeId, severity) {
  const byId = {}; g.nodes.forEach(n => byId[n.id] = n); const node = byId[nodeId]; const res = {}; const sev = severity;
  const prodRev = {}; g.nodes.filter(n => n.type === 'product').forEach(n => prodRev[n.id] = n.rev);
  const hitProducts = {};
  if (node.type === 'product') hitProducts[node.id] = sev;
  else if (node.type === 'supplier') g.edges.filter(e => e.s === node.id && e.rel === 'delivers').forEach(e => hitProducts[e.t] = sev * e.w);
  else if (node.type === 'dept') g.edges.filter(e => e.s === node.id).forEach(e => hitProducts[e.t] = sev * e.w * 0.6);
  else if (node.type === 'employee') { const d = g.edges.find(e => e.s === node.id && e.rel === 'manages'); if (d) g.edges.filter(e => e.s === d.t).forEach(e => hitProducts[e.t] = sev * e.w * 0.45); }
  else if (node.type === 'customer') g.edges.filter(e => e.s === node.id && e.rel === 'purchases').forEach(e => hitProducts[e.t] = sev * e.w * 0.5);
  Object.keys(hitProducts).forEach(pid => { const lost = prodRev[pid] * hitProducts[pid]; res[pid] = { id: pid, label: byId[pid].label, pct: hitProducts[pid], lost, type: 'product' }; });
  const lostTotal = sum(Object.values(res).map(r => r.lost));
  const custShare = {}; g.edges.filter(e => e.rel === 'purchases').forEach(e => { if (res[e.t]) custShare[e.s] = (custShare[e.s] || 0) + res[e.t].lost * e.w; });
  const csum = sum(Object.values(custShare)) || 1;
  Object.keys(custShare).forEach(cid => { res[cid] = { id: cid, label: byId[cid].label, pct: custShare[cid] / csum, lost: custShare[cid] / csum * lostTotal * 0.35, type: 'customer' }; });
  return { rows: Object.values(res).sort((a, b) => b.lost - a.lost), lostTotal, affected: new Set(Object.keys(res).concat([nodeId])) };
}

/* ---------- Monte Carlo what-if simulation ---------- */
const WAGE_RATE = 0.11, BASE_STAFF = 6; // labour cost = 11% of weekly revenue, shared across staff
const wageOf = ds => WAGE_RATE * sum(ds.products.map(p => p.weeklyRevenue)) / BASE_STAFF;
function capacityPerStaff(ds) { return Math.ceil(sum(ds.products.map(p => p.base)) * 1.18 / BASE_STAFF); }
function simulate(ds, fc, scn, N, seed, H) {
  H = H || 12; N = N || 1000; const cap = capacityPerStaff(ds), wage = wageOf(ds);
  const staff = Math.max(1, Math.round(BASE_STAFF * (1 + (scn.staff || 0) / 100))), L = 1 + (scn.delay || 0);
  const profits = [], revs = [], serv = [], so = []; const weekRev = Array.from({ length: H }, () => []), weekProfit = Array.from({ length: H }, () => []);
  const sig = 0.1 + (scn.volatility || 0);
  for (let r = 0; r < N; r++) {
    const rng = mulberry32(seed * 100003 + r); let R = 0, Pf = 0, dem = 0, sold = 0, soWeeks = 0;
    const st = ds.products.map(p => p.stockNow), delay = scn.delay || 0, pipe = ds.products.map((p, i) => Array.from({ length: L }, (_, k) => k < delay ? 0 : fc[p.id].mean[0]));
    const wr = new Array(H).fill(0), wp = new Array(H).fill(0);
    for (let t = 0; t < H; t++) {
      const D = [], pot = []; let totPot = 0;
      ds.products.forEach((p, i) => {
        st[i] += pipe[i].shift();
        const pc = ((scn.price && scn.price[p.id] !== undefined) ? scn.price[p.id] : (scn.priceAll || 0)) / 100;
        const shock = (t >= (scn.shockStart || 0)) ? (scn.shock || 0) / 100 : 0;
        const d = fc[p.id].mean[t] * (1 + shock) * Math.pow(1 + pc, p.elast) * Math.exp(sig * randn(rng) - sig * sig / 2);
        D.push(d); pot.push(Math.min(d, st[i])); totPot += pot[i];
      });
      const capScale = Math.min(1, staff * cap / Math.max(1, totPot)); let wkRev = 0, wkProfit = -staff * wage, anySO = false;
      ds.products.forEach((p, i) => {
        const pc = ((scn.price && scn.price[p.id] !== undefined) ? scn.price[p.id] : (scn.priceAll || 0)) / 100, price = p.priceNow * (1 + pc);
        const s = pot[i] * capScale, lost = D[i] - s; st[i] -= s;
        const rev = price * s, cogs = p.cost * s, hold = 0.004 * p.cost * st[i], pen = 0.25 * Math.max(0, price - p.cost) * lost;
        wkRev += rev; wkProfit += rev - cogs - hold - pen; dem += D[i]; sold += s; if (lost > 0.05 * D[i]) anySO = true;
        const nxt = fc[p.id].mean[Math.min(H - 1, t + L)], pos = st[i] + sum(pipe[i]); pipe[i].push(Math.max(0, nxt * (L + 1) * 1.1 - pos));
      });
      R += wkRev; Pf += wkProfit; wr[t] = wkRev; wp[t] = wkProfit; if (anySO) soWeeks++;
    }
    profits.push(Pf); revs.push(R); serv.push(sold / Math.max(1, dem)); so.push(soWeeks);
    for (let t = 0; t < H; t++) { weekRev[t].push(wr[t]); weekProfit[t].push(wp[t]); }
  }
  return { profits, revs, serv, so, N, H, staff,
    stats: { profit: mean(profits), p5: quantile(profits, .05), p50: quantile(profits, .5), p95: quantile(profits, .95), pLoss: profits.filter(v => v < 0).length / N, rev: mean(revs), service: mean(serv), soWeeks: mean(so) },
    path: { rev: weekRev.map(mean), profit: weekProfit.map(mean), lo: weekProfit.map(a => quantile(a, .1)), hi: weekProfit.map(a => quantile(a, .9)) } };
}
CDT.PRESETS = {
  baseline: { label: 'Baseline', scn: { price: 0, shock: 0, delay: 0, staff: 0, volatility: 0 } },
  highdemand: { label: 'High market demand', scn: { price: 0, shock: 25, delay: 0, staff: 0, volatility: 0.04 } },
  supply: { label: 'Supply chain disruption', scn: { price: 0, shock: 0, delay: 2, staff: 0, volatility: 0.05 } },
  workforce: { label: 'Workforce shortage', scn: { price: 0, shock: 0, delay: 0, staff: -34, volatility: 0 } },
  seasonal: { label: 'Seasonal pricing swing', scn: { price: 8, shock: -12, delay: 0, staff: 0, volatility: 0.03 } }
};

/* ---------- Q-learning decision optimisation ---------- */
const PRICE_M = [0.90, 0.95, 1.00, 1.05, 1.10], ORDER_M = [0.5, 1.0, 1.5], NS = 6, NR = 3, NA = PRICE_M.length * ORDER_M.length;
const REGIME = [0.82, 1.0, 1.22], HOLDC = 0.01, FIXED_ORD = 0.35; // fixed cost per order as share of weekly revenue*0.01
function rlStep(p, state, a, rng) {
  const pm = PRICE_M[Math.floor(a / ORDER_M.length)], om = ORDER_M[a % ORDER_M.length];
  const demand = p.base * REGIME[state.reg] * Math.pow(pm, p.elast) * Math.exp(0.1 * randn(rng) - 0.005);
  const sales = Math.min(demand, state.stock), price = p.priceNow * pm;
  const rev = price * sales, cogs = p.cost * sales, profit = rev - cogs;
  const order = p.base * om, endStock = state.stock - sales + state.pipe;
  const cost = HOLDC * p.cost * Math.max(0, endStock) + FIXED_ORD * 0.01 * p.base * p.priceNow * (order > 0 ? 1 : 0) + 0.12 * p.cost * order * 0.1;
  const sat = 100 * sales / Math.max(1, demand);
  const next = { stock: Math.min(endStock, p.base * 3.5), pipe: order, reg: rng() < 0.7 ? state.reg : Math.floor(rng() * NR) };
  return { next, profit, cost, sat, lost: demand - sales, sales, demand };
}
const rlScale = p => p.base * p.priceNow;
function rlReward(p, r, w) { const sc = rlScale(p); return w.alpha * r.profit / sc - w.beta * r.cost / sc + w.gamma * (r.sat - 85) / 15; }
function stateIdx(p, s) { return clamp(Math.round(s.stock / (0.5 * p.base)), 0, NS - 1) * NR + s.reg; }
function newQ() { return Array.from({ length: NS * NR }, () => new Array(NA).fill(0)); }
function rlTrain(p, w, episodes, Q, offset, total, seed, onProgress) {
  const rng = mulberry32(seed); const curve = [];
  for (let e = 0; e < episodes; e++) {
    const ge = offset + e, eps = Math.max(0.05, 1 - ge / (total * 0.75)), lr = Math.max(0.05, 0.25 * (1 - ge / total));
    let s = { stock: p.base * (0.5 + rng() * 2), pipe: p.base, reg: Math.floor(rng() * NR) }, tot = 0;
    for (let t = 0; t < 26; t++) {
      const si = stateIdx(p, s); let a;
      if (rng() < eps) a = Math.floor(rng() * NA); else { a = 0; for (let k = 1; k < NA; k++) if (Q[si][k] > Q[si][a]) a = k; }
      const r = rlStep(p, s, a, rng), rew = rlReward(p, r, w), ni = stateIdx(p, r.next);
      s = { stock: r.next.stock, pipe: r.next.pipe, reg: r.next.reg };
      Q[si][a] += lr * (rew + 0.95 * Math.max.apply(null, Q[ni]) - Q[si][a]); tot += rew;
    }
    curve.push(tot);
  }
  return curve;
}
function greedy(Q, si) { let a = 0; for (let k = 1; k < NA; k++) if (Q[si][k] > Q[si][a]) a = k; return a; }
function actionIndex(pi, oi) { return pi * ORDER_M.length + oi; }
CDT.rl = { PRICE_M, ORDER_M, NS, NR, NA, newQ, train: rlTrain, greedy, stateIdx, step: rlStep, reward: rlReward, actionIndex, BASE_A: actionIndex(2, 1),
  describe: a => ({ price: PRICE_M[Math.floor(a / ORDER_M.length)], order: ORDER_M[a % ORDER_M.length] }) };
CDT.rlEvaluate = function (p, w, Q, episodes, seed) {
  const res = { learned: { profit: 0, cost: 0, sat: 0, reward: 0 }, base: { profit: 0, cost: 0, sat: 0, reward: 0 } };
  ['learned', 'base'].forEach(kind => {
    for (let e = 0; e < episodes; e++) {
      const rng = mulberry32(seed + e); let s = { stock: p.base * 1.5, pipe: p.base, reg: 1 }, T = { profit: 0, cost: 0, sat: 0, reward: 0 };
      for (let t = 0; t < 26; t++) {
        const a = kind === 'learned' ? greedy(Q, stateIdx(p, s)) : CDT.rl.BASE_A; const r = rlStep(p, s, a, rng);
        T.profit += r.profit; T.cost += r.cost; T.sat += r.sat / 26; T.reward += rlReward(p, r, w); s = { stock: r.next.stock, pipe: r.next.pipe, reg: r.next.reg };
      }
      Object.keys(T).forEach(k => res[kind][k] += T[k] / episodes);
    }
  });
  res.uplift = (res.learned.profit - res.base.profit) / Math.max(1, Math.abs(res.base.profit)) * 100;
  return res;
};
CDT.rlExplain = function (p, w, Q, state, actions, seed) {
  const out = []; actions.forEach(a0 => {
    let pr = 0, co = 0, sa = 0, rw = 0; const R = 300;
    for (let e = 0; e < R; e++) { const rng = mulberry32(seed + e); let s = { stock: state.stock, pipe: state.pipe, reg: state.reg };
      for (let t = 0; t < 8; t++) { const a = t === 0 ? a0 : greedy(Q, stateIdx(p, s)); const r = rlStep(p, s, a, rng); pr += r.profit; co += r.cost; sa += r.sat / 8; rw += rlReward(p, r, w); s = { stock: r.next.stock, pipe: r.next.pipe, reg: r.next.reg }; } }
    out.push({ a: a0, profit: pr / R, cost: co / R, sat: sa / R, reward: rw / R });
  }); return out;
};

CDT.engine = { generateSample, ingestCSV, estimateParams, buildForecasts, buildGraph, impactAnalysis, simulate, FEATURE_NAMES, capacityPerStaff, BASE_STAFF, wageOf };
})();
