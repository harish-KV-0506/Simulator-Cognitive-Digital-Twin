/* Landing page: reveal-on-scroll, interactive architecture, result bars, hero visual, boot */
(function () {
'use strict';
const CDT = window.CDT, H = CDT.helpers, C = CDT.core, { $, $$ } = H, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* reveal on scroll */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); if (e.target.id === 'resBars') drawResults(); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }) : null;
$$('.reveal').forEach((el, i) => { el.style.setProperty('--d', (i % 4) * 70 + 'ms'); if (io) io.observe(el); else el.classList.add('in'); });

/* architecture */
const LAYERS = [
  { n: 'Data acquisition', d: 'Collects real-time and historical business data from sales, customer transactions, inventory, workforce, market demand and suppliers, then cleans, normalises and extracts features.', r: 'Python, Pandas, NumPy, MongoDB', w: 'CSV upload, validation, missing-value handling, outlier capping' },
  { n: 'Digital twin modelling', d: 'Builds the virtual replica of business operations and keeps it updated: demand patterns, sales performance, staff allocation, inventory and customer satisfaction.', r: 'Twin engine over the data layer', w: 'Calibrated twin parameters and a live hour-by-hour stream' },
  { n: 'Cognitive intelligence', d: 'Machine learning predicts demand and a knowledge graph captures how customers, products, suppliers and staff depend on one another.', r: 'Random Forest, LSTM, Neo4j', w: 'Random Forest, seasonal regression and an interactive knowledge graph' },
  { n: 'Simulation and optimisation', d: 'Runs "what-if" analysis with Monte Carlo simulation and uses reinforcement learning to find the best pricing, inventory and workforce decisions.', r: 'Monte Carlo, Q-learning', w: '1,000-run simulations and a live-trained Q-learning agent' },
  { n: 'Decision visualisation', d: 'Presents predicted revenue, simulation outcomes, recommendations, risk and performance in interactive dashboards.', r: 'Power BI, Flask', w: 'This dashboard, with explanations and report export' }
];
const arch = $('#arch'), det = $('#archDetail');
function pick(i) { $$('.layer', arch).forEach((b, k) => b.classList.toggle('on', k === i)); const L = LAYERS[i]; det.innerHTML = '<h3>' + (i + 1) + '. ' + L.n + '</h3><p>' + L.d + '</p><div class="two-t"><div><small>Research implementation</small><b>' + L.r + '</b></div><div><small>This web edition</small><b>' + L.w + '</b></div></div>'; }
arch.innerHTML = LAYERS.map((L, i) => '<button class="layer" data-i="' + i + '"><span>' + (i + 1) + '</span><b>' + L.n + '</b></button>').join('<i class="flow"></i>');
$$('.layer', arch).forEach(b => b.addEventListener('click', () => pick(+b.dataset.i))); pick(0);
let ai = 0; if (!reduce) setInterval(() => { if (!arch.matches(':hover') && !det.matches(':hover') && !arch.contains(document.activeElement)) { ai = (ai + 1) % LAYERS.length; pick(ai); } }, 5000);

/* results */
const RES = [['Prediction accuracy', 71, 94, '%'], ['Operational cost reduction', 5, 17, '%'], ['Inventory optimisation accuracy', 69, 91, '%']];
$('#resBars').innerHTML = RES.map(r => '<div class="rb"><div class="rb-t"><span>' + r[0] + '</span></div><div class="rb-row"><em>Traditional</em><div class="track"><i class="a" data-w="' + r[1] + '"></i></div><b>' + r[1] + r[3] + '</b></div><div class="rb-row"><em>Cognitive twin</em><div class="track"><i class="b" data-w="' + r[2] + '"></i></div><b>' + r[2] + r[3] + '</b></div></div>').join('');
function drawResults() { $$('#resBars i[data-w]').forEach((el, i) => setTimeout(() => { el.style.width = el.dataset.w + '%'; }, i * 120)); }
if (!io) drawResults();

/* hero visual: flowing twin signal */
const hs = $('#heroSpark'); if (hs) { const x = hs.getContext('2d'); let t = 0; const go = () => { const r = hs.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); if (hs.width !== Math.round(r.width * d)) { hs.width = Math.round(r.width * d); hs.height = Math.round(92 * d); } x.setTransform(d, 0, 0, d, 0, 0); const w = r.width, h = 92; x.clearRect(0, 0, w, h); t += 0.02;
  const line = (off, col, a) => { x.beginPath(); for (let i = 0; i <= 80; i++) { const px = i / 80 * w, v = Math.sin(i * 0.17 + t + off) * 14 + Math.sin(i * 0.05 + t * 0.6) * 11 + Math.sin(i * 0.4 + t * 1.8) * 3; const py = h / 2 + v; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1; };
  line(0, '#4FE3F0', 1); line(0.9, '#8B7CFF', 0.7); const cx = ((t * 40) % w); x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, h / 2 + Math.sin((cx / w * 80) * 0.17 + t) * 14 + Math.sin((cx / w * 80) * 0.05 + t * 0.6) * 11, 3.2, 0, 6.2832); x.fill(); if (!reduce) requestAnimationFrame(go); }; go(); }

/* mobile nav */
$$('#topNav a').forEach(a => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

/* boot the twin on the sample dataset */
C.buildTwin(CDT.engine.generateSample(104, 42));
})();
