/* =====================================================================
   Cognitive Digital Twin: application (router, views, live twin)
   ===================================================================== */
(function () {
'use strict';
const CDT = window.CDT, E = CDT.engine, U = CDT.util, RL = CDT.rl, K = CDT.colors;
const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const sum = U.sum, mean = U.mean, clamp = U.clamp;
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const inr = v => (v < 0 ? '-' : '') + '\u20B9' + Math.abs(Math.round(v)).toLocaleString('en-IN');
const inrK = v => (v < 0 ? '-' : '') + '\u20B9' + CDT.fmtK(Math.abs(v));
const pct = (v, d) => v.toFixed(d == null ? 1 : d) + '%';
const dstr = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = { ds: null, fc: null, graph: null, simBase: null, sim: null, rl: {}, weights: { alpha: 1, beta: 0.6, gamma: 0.4 }, twin: null, view: null, selProd: 'all', graphSel: null, scn: { priceAll: 0, shock: 0, delay: 0, staff: 0, volatility: 0 }, preset: 'baseline', simN: 1000, decideProd: null, ready: false };
CDT.S = S;

/* ---------- count-up ---------- */
function countUp(el, v, f) { f = f || (x => Math.round(x).toLocaleString('en-IN')); if (reduce) { el.textContent = f(v); return; } const t0 = performance.now(); const step = now => { const p = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = f(v * e); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }

/* =====================================================================
   Twin construction pipeline
   ===================================================================== */
function trainRL(p, w, episodes, seed) { const Q = RL.newQ(); const curve = RL.train(p, w, episodes, Q, 0, episodes, seed || 11); return { Q, curve, w: Object.assign({}, w), eval: CDT.rlEvaluate(p, w, Q, 300, 9000), episodes }; }
async function buildTwin(ds) {
  const boot = $('#boot'), list = $('#bootSteps'), bar = $('#bootBar'); boot.classList.add('on');
  const steps = ['Integrating data sources', 'Constructing the digital twin', 'Training cognitive models', 'Calibrating the what-if simulator', 'Training the decision agent'];
  list.innerHTML = steps.map((s, i) => '<li data-i="' + i + '"><i></i>' + s + '</li>').join(''); bar.style.width = '0%';
  const mark = async (i, fn) => { const li = list.children[i]; li.classList.add('run'); await frame(); await sleep(120); const t0 = performance.now(); fn(); const spent = performance.now() - t0; await sleep(Math.max(0, 380 - spent)); li.classList.remove('run'); li.classList.add('done'); bar.style.width = ((i + 1) / steps.length * 100) + '%'; };
  if (CDT.bg) CDT.bg.pulse(2.4);
  S.ready = false; if (S.twin) clearInterval(S.twin.timer); S.selProd = 'all'; S.graphSel = null; S.impact = null; S.sim = null;
  await mark(0, () => { S.ds = E.estimateParams(ds); });
  await mark(1, () => { S.graph = E.buildGraph(S.ds); });
  await mark(2, () => { S.fc = E.buildForecasts(S.ds, 12); });
  await mark(3, () => { S.twin = newTwin(); S.simBase = E.simulate(S.ds, S.fc, scnObj(CDT.PRESETS.baseline.scn), 1000, 7); S.sim = null; S.scn = { priceAll: 0, shock: 0, delay: 0, staff: 0, volatility: 0 }; S.preset = 'baseline'; });
  await mark(4, () => { S.rl = {}; S.ds.products.forEach((p, i) => { S.rl[p.id] = trainRL(p, S.weights, 3000, 20 + i); }); S.decideProd = S.ds.products.slice().sort((a, b) => b.weeklyRevenue - a.weeklyRevenue)[0].id; });
  await sleep(250); boot.classList.remove('on'); S.ready = true; startTwinLoop(); heroChips(); route(true);
}
const scnObj = p => ({ priceAll: p.price || 0, shock: p.shock || 0, delay: p.delay || 0, staff: p.staff || 0, volatility: p.volatility || 0 });
function heroChips() {
  const el = $('#heroChips'); if (!el || !S.fc) return; const acc = S.fc.__total.metrics.en.accuracy, ev = Object.values(S.rl).map(r => r.eval.uplift), up = mean(ev);
  el.innerHTML = '<span class="chip"><i class="dot live"></i>Twin online</span><span class="chip">Forecast accuracy <b>' + pct(acc) + '</b></span><span class="chip">12-week profit <b>' + inrK(S.simBase.stats.profit) + '</b></span><span class="chip">Agent uplift <b>' + (up >= 0 ? '+' : '') + pct(up, 0) + '</b></span>';
}

/* =====================================================================
   Live twin stream
   ===================================================================== */
function newTwin() {
  const ds = S.ds, fc = S.fc, hd = ds.products.map(p => fc[p.id].mean[0] / 84);
  return { running: true, speed: 1, hour: 0, hd, inv: ds.products.map(p => p.stockNow), pending: ds.products.map(() => []), spike: 0, absent: 0, eta: 24, etaT: 0, staff: E.BASE_STAFF, cap: E.capacityPerStaff(ds) / 84 * 1.4,
    hist: { sales: [], cover: [], util: [], sat: [], eta: [] }, alerts: [], aid: 1, cool: {}, seed: 5, timer: null, status: [], lastSold: [] };
}
function twinAlert(sev, msg, key) { const T = S.twin; if (key) { if (T.cool[key] && T.hour - T.cool[key] < 14) return; T.cool[key] = T.hour; } const hod = 9 + (T.hour % 12), day = Math.floor(T.hour / 12) + 1;
  T.alerts.unshift({ id: T.aid++, sev, msg, time: 'Day ' + day + ', ' + hod + ':00', ack: false }); if (T.alerts.length > 40) T.alerts.pop(); if (sev !== 'info' && CDT.bg) CDT.bg.pulse(1.9); updateBadge(); }
function twinTick() {
  const T = S.twin, ds = S.ds; if (!T) return; T.hour++; const hod = T.hour % 12, prof = 0.55 + 0.9 * Math.sin(Math.PI * (hod + 0.5) / 12);
  const rng = U.mulberry32(T.seed * 7919 + T.hour); let total = 0, stockouts = 0; const sold = [], so = [];
  ds.products.forEach((p, i) => {
    const exp = T.hd[i] * prof, act = Math.max(0, exp * Math.exp(0.16 * U.randn(rng)) * (T.spike > 0 ? 1.9 : 1));
    T.pending[i] = T.pending[i].filter(a => { a.h--; if (a.h <= 0) { T.inv[i] += a.q; return false; } return true; });
    const s = Math.min(act, T.inv[i]); T.inv[i] -= s; const out = s < act * 0.98; if (out) stockouts++; so.push(out); total += s; sold.push(s);
    const week = T.hd[i] * 84; if (T.inv[i] + sum(T.pending[i].map(a => a.q)) < week * 1.3 && !T.pending[i].length) T.pending[i].push({ q: week * 1.2, h: T.eta });
  });
  if (T.spike > 0) T.spike--; if (T.absent > 0) T.absent--; if (T.etaT > 0) { T.etaT--; if (T.etaT === 0) T.eta = 24; }
  const staffNow = Math.max(1, T.staff - (T.absent > 0 ? 2 : 0)), util = total / (staffNow * T.cap), sat = clamp(96 - stockouts * 7 - Math.max(0, util - 0.95) * 40 + U.randn(rng) * 0.8, 35, 100);
  const cover = sum(T.inv) / (sum(T.hd) * 84), H = T.hist;
  const push = (k, v) => { H[k].push(v); if (H[k].length > 60) H[k].shift(); };
  const prev = H.sales.slice(-24); push('sales', total); push('cover', cover); push('util', util * 100); push('sat', sat); push('eta', T.eta);
  if (prev.length >= 12) { const m = mean(prev), sd = U.std(prev) || 1, z = (total - m) / sd; if (z > 2.6) twinAlert('warn', 'Unusual demand spike: sales ' + z.toFixed(1) + '\u03C3 above the recent pattern.', 'spike'); else if (z < -2.6) twinAlert('warn', 'Unusual demand drop: sales ' + Math.abs(z).toFixed(1) + '\u03C3 below the recent pattern.', 'drop'); }
  so.forEach((o, i) => { if (o) twinAlert('crit', 'Stock-out risk: ' + ds.products[i].name + ' cannot meet current demand.', 'so' + i); });
  if (util > 1.05) twinAlert('warn', 'Staff capacity exceeded (' + Math.round(util * 100) + '% utilisation). Service quality at risk.', 'util');
  T.status = ds.products.map((p, i) => ({ name: p.name, stock: T.inv[i], cover: T.inv[i] / (T.hd[i] * 84), out: so[i], pend: T.pending[i].length ? T.pending[i][0].h : 0 }));
  if (S.view === 'twin') updateTwinUI(); updateBadge();
}
function startTwinLoop() { const T = S.twin; clearInterval(T.timer); if (T.running) T.timer = setInterval(twinTick, 1000 / T.speed); }
function injectEvent(kind) { const T = S.twin; if (!T) return; if (CDT.bg) CDT.bg.pulse(3);
  if (kind === 'spike') { T.spike = 8; twinAlert('info', 'Event injected: demand surge (+90%) for the next 8 hours.'); }
  if (kind === 'supply') { T.eta = 72; T.etaT = 36; twinAlert('info', 'Event injected: supplier delay. New orders now take 72 hours.'); }
  if (kind === 'staff') { T.absent = 14; twinAlert('info', 'Event injected: two staff absent for 14 hours.'); }
  if (S.view === 'twin') updateTwinUI(); }
function updateBadge() { const n = S.twin ? S.twin.alerts.filter(a => !a.ack && a.sev !== 'info').length : 0; $$('.alert-badge').forEach(b => { b.textContent = n; b.classList.toggle('on', n > 0); }); }

/* =====================================================================
   Router + shell
   ===================================================================== */
const VIEWS = {
  dashboard: { t: 'Dashboard', s: 'The business twin at a glance', i: '\u25A6' },
  data: { t: 'Data integration', s: 'Connect, clean and calibrate the twin', i: '\u25A4' },
  twin: { t: 'Live digital twin', s: 'Real-time synchronisation and event injection', i: '\u25CE' },
  cognitive: { t: 'Cognitive analysis', s: 'Machine-learning prediction and knowledge-graph reasoning', i: '\u2727' },
  simulate: { t: 'Simulation engine', s: 'Monte Carlo what-if analysis', i: '\u2248' },
  decide: { t: 'Decision recommendation', s: 'Reinforcement-learning optimisation of price and inventory', i: '\u2699' },
  reports: { t: 'Reports', s: 'Executive summary and export', i: '\u25A4' }
};
let graphRun = false;
function route(force) {
  const h = location.hash || '#/'; const m = h.match(/^#\/app(?:\/(\w+))?/);
  if (m) { if (!S.ready && !force) return; showApp(VIEWS[m[1]] ? m[1] : 'dashboard'); }
  else { graphRun = false; S.view = null; $('#app').hidden = true; $('#landing').hidden = false; document.body.classList.remove('in-app'); const id = h.replace('#/', ''); const t = id && document.getElementById(id);
    if (t) { setTimeout(() => t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 30); } else window.scrollTo(0, 0); }
  $$('#topNav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === h && !a.classList.contains('launch')));
  $('#menuBtn').setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-open');
}
function showApp(name) {
  graphRun = false; S.view = name; $('#landing').hidden = true; $('#app').hidden = false; document.body.classList.add('in-app'); window.scrollTo(0, 0);
  $('#side').innerHTML = '<div class="side-h">Modules</div>' + Object.keys(VIEWS).map(k => '<a href="#/app/' + k + '" class="' + (k === name ? 'on' : '') + '"><span>' + VIEWS[k].i + '</span>' + VIEWS[k].t + (k === 'twin' ? '<b class="alert-badge"></b>' : '') + '</a>').join('') + '<a class="back" href="#/">&larr; Back to overview</a>';
  const v = VIEWS[name];
  $('#appBar').innerHTML = '<div><h1>' + v.t + '</h1><p>' + v.s + '</p></div><div class="status"><span class="chip">' + esc(S.ds.name) + '</span><span class="chip"><i class="dot live"></i>Twin synced</span></div>';
  const view = $('#view'); view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  ({ dashboard: viewDashboard, data: viewData, twin: viewTwin, cognitive: viewCognitive, simulate: viewSimulate, decide: viewDecide, reports: viewReports })[name](view);
  updateBadge();
}
window.addEventListener('hashchange', () => route());
$('#menuBtn').addEventListener('click', () => { const o = document.body.classList.toggle('menu-open'); $('#menuBtn').setAttribute('aria-expanded', o); });
window.addEventListener('scroll', () => $('#top').classList.toggle('solid', window.scrollY > 24), { passive: true });
CDT.helpers = { $, $$, sum, mean, clamp, inr, inrK, pct, dstr, esc, countUp, sleep, frame };
CDT.core = { S, E, RL, buildTwin, trainRL, twinTick, injectEvent, startTwinLoop, updateBadge, route, VIEWS, scnObj, heroChips, setGraphRun: v => { graphRun = v; }, getGraphRun: () => graphRun };
CDT.views = {}; CDT.registerView = (n, f) => { CDT.views[n] = f; };
function viewDashboard(v) { CDT.views.dashboard(v); } function viewData(v) { CDT.views.data(v); } function viewTwin(v) { CDT.views.twin(v); } function updateTwinUI() { if (CDT.views.updateTwin) CDT.views.updateTwin(); }
function viewCognitive(v) { CDT.views.cognitive(v); } function viewSimulate(v) { CDT.views.simulate(v); } function viewDecide(v) { CDT.views.decide(v); } function viewReports(v) { CDT.views.reports(v); }
})();
