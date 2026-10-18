/* Views: dashboard, data integration, live twin */
(function () {
'use strict';
const CDT = window.CDT, H = CDT.helpers, C = CDT.core, S = C.S, E = C.E, RL = C.RL, K = CDT.colors;
const { $, $$, sum, mean, clamp, inr, inrK, pct, dstr, esc, countUp } = H;

const weeklyTotals = (ds, ids) => { const ps = ids ? ds.products.filter(p => ids.includes(p.id)) : ds.products; return { units: ds.dates.map((_, i) => sum(ps.map(p => p.units[i]))), rev: ds.dates.map((_, i) => sum(ps.map(p => p.units[i] * p.price[i]))) }; };
function pills(sel, id) { const ds = S.ds; return '<div class="pills" id="' + id + '"><button data-p="all" class="' + (sel === 'all' ? 'on' : '') + '">All products</button>' + ds.products.map(p => '<button data-p="' + p.id + '" class="' + (sel === p.id ? 'on' : '') + '">' + esc(p.name) + '</button>').join('') + '</div>'; }
function recFor(pid) {
  const ds = S.ds, p = ds.products.find(x => x.id === pid), i = ds.products.indexOf(p), T = S.twin, r = S.rl[pid]; const ratio = S.fc[pid].mean[0] / p.base, reg = ratio > 1.1 ? 2 : ratio < 0.9 ? 0 : 1;
  const state = { stock: T.inv[i], pipe: p.base, reg }, a = RL.greedy(r.Q, RL.stateIdx(p, state)), d = RL.describe(a); return { p, a, d, state, r, reg };
}
function recCard(pid, compact) {
  const x = recFor(pid), regs = ['low', 'normal', 'high'];
  return '<div class="rec"><div class="rec-h"><small>' + esc(x.p.name) + ' &middot; ' + regs[x.reg] + ' demand regime</small></div>' +
    '<div class="rec-grid"><div><small>Set price</small><strong>' + inr(x.p.priceNow * x.d.price) + '</strong><span class="' + (x.d.price > 1 ? 'up' : x.d.price < 1 ? 'down' : '') + '">' + (x.d.price === 1 ? 'hold' : (x.d.price > 1 ? '+' : '') + Math.round((x.d.price - 1) * 100) + '%') + '</span></div>' +
    '<div><small>Order quantity</small><strong>' + Math.round(x.p.base * x.d.order).toLocaleString('en-IN') + '</strong><span>' + x.d.order + '&times; weekly demand</span></div></div>' +
    '<p class="muted">Agent trained on ' + x.r.episodes.toLocaleString('en-IN') + ' simulated episodes. In evaluation it earned <b>' + (x.r.eval.uplift >= 0 ? '+' : '') + pct(x.r.eval.uplift) + '</b> profit vs. a fixed-price, fixed-order policy.</p>' +
    (compact ? '<a class="btn small" href="#/app/decide">Open the decision lab</a>' : '') + '</div>';
}

/* ---------------- Dashboard ---------------- */
CDT.registerView('dashboard', function (v) {
  const ds = S.ds, fc = S.fc, n = ds.weeks, tot = weeklyTotals(ds), rev4 = sum(tot.rev.slice(-4)), prev4 = sum(tot.rev.slice(-8, -4));
  const fRev4 = sum(ds.products.map(p => sum(fc[p.id].mean.slice(0, 4)) * p.priceNow)), acc = fc.__total.metrics.en.accuracy, T = S.twin;
  const cover = sum(T.inv) / (sum(T.hd) * 84), sim = S.simBase.stats, delta = (rev4 - prev4) / prev4 * 100, fDelta = (fRev4 - rev4) / rev4 * 100;
  const top = S.decideProd || ds.products[0].id;
  v.innerHTML = '<div class="kpis">' +
    kpi('Revenue, last 4 weeks', 'rev', rev4, inrK, sgn(delta) + ' vs prior 4 weeks', delta >= -0.05) +
    kpi('Forecast revenue, next 4 weeks', 'frev', fRev4, inrK, sgn(fDelta) + ' vs last 4 weeks', fDelta >= -0.05) +
    kpi('Forecast accuracy', 'acc', acc, x => pct(x), 'holdout, last 12 weeks', true) +
    kpi('Inventory cover', 'cov', cover, x => x.toFixed(1) + ' wks', cover >= 1 && cover <= 2.6 ? 'healthy range' : cover < 1 ? 'low stock' : 'excess stock', cover >= 1 && cover <= 2.6) +
    kpi('12-week profit outlook', 'prof', sim.profit, inrK, 'P5 downside ' + inrK(sim.p5), true) + '</div>' +
    '<div class="grid g21"><section class="panel"><div class="panel-h"><h3>Demand: actual vs forecast</h3>' + pills(S.selProd, 'dPills') + '</div><canvas id="dChart" class="chart"></canvas><div class="legend"><span><i style="background:' + K.cyan + '"></i>Actual</span><span><i class="dash" style="background:' + K.violet + '"></i>Forecast</span><span><i class="band"></i>80% interval</span></div></section>' +
    '<section class="panel"><div class="panel-h"><h3>Next best action</h3><span class="tag">RL agent</span></div><div id="dRec">' + recCard(top, true) + '</div></section></div>' +
    '<div class="grid g3"><section class="panel"><div class="panel-h"><h3>Inventory health</h3></div><div id="dInv"></div></section>' +
    '<section class="panel"><div class="panel-h"><h3>Live alerts</h3><a class="lnk" href="#/app/twin">Open twin &rarr;</a></div><div id="dAlerts"></div></section>' +
    '<section class="panel"><div class="panel-h"><h3>Forecast accuracy by product</h3></div><canvas id="dAcc" class="chart short"></canvas></section></div>';
  $$('.kpi strong', v).forEach(el => countUp(el, +el.dataset.v, el.dataset.f === 'k' ? inrK : el.dataset.f === 'p' ? (x => pct(x)) : el.dataset.f === 'w' ? (x => x.toFixed(1) + ' wks') : null));
  $$('#dPills button', v).forEach(b => b.addEventListener('click', () => { S.selProd = b.dataset.p; $$('#dPills button').forEach(x => x.classList.toggle('on', x === b)); drawDash(); }));
  function drawDash() { const ids = S.selProd === 'all' ? null : [S.selProd], t = weeklyTotals(ds, ids), W = 40, hist = t.units.slice(-W);
    const fm = ids ? fc[ids[0]].mean : fc.__sum || (fc.__sum = fc[ds.products[0].id].mean.map((_, h) => sum(ds.products.map(p => fc[p.id].mean[h])))); const lo = ids ? fc[ids[0]].lo : (fc.__lo || (fc.__lo = fm.map((_, h) => sum(ds.products.map(p => fc[p.id].lo[h]))))), hi = ids ? fc[ids[0]].hi : (fc.__hi || (fc.__hi = fm.map((_, h) => sum(ds.products.map(p => fc[p.id].hi[h])))));
    const labels = hist.map((_, i) => dstr(ds.dates[n - W + i])).concat(fm.map((_, h) => { const d = new Date(ds.dates[n - 1]); d.setDate(d.getDate() + 7 * (h + 1)); return dstr(d); }));
    CDT.lineChart($('#dChart'), [{ data: hist, color: K.cyan, label: 'Actual units' }, { data: [hist[W - 1]].concat(fm), color: K.violet, dash: [6, 5], label: 'Forecast', startAt: W - 1 }],
      { labels, marker: W - 1, band: { lo: [hist[W - 1]].concat(lo), hi: [hist[W - 1]].concat(hi), startAt: W - 1 }, tipFmt: x => Math.round(x).toLocaleString('en-IN') }); }
  requestAnimationFrame(() => { drawDash(); CDT.hbars($('#dAcc'), ds.products.map(p => ({ label: p.name, value: fc[p.id].metrics.en.accuracy, color: 'rgba(139,124,255,.4)', color2: K.cyan })), { fmt: x => pct(x), left: 84 }); });
  $('#dInv').innerHTML = ds.products.map((p, i) => { const c = T.inv[i] / (T.hd[i] * 84), st = c < 1 ? 'low' : c > 2.6 ? 'high' : 'ok'; return '<div class="inv"><div><span>' + esc(p.name) + '</span><b class="' + st + '">' + c.toFixed(1) + ' wks</b></div><div class="gauge"><i class="' + st + '" style="width:' + clamp(c / 3.5 * 100, 3, 100) + '%"></i><u></u></div></div>'; }).join('') + '<p class="muted">Target band: 1.0 to 2.6 weeks of cover.</p>';
  function alerts() { const a = T.alerts.slice(0, 4); $('#dAlerts').innerHTML = a.length ? a.map(x => '<div class="al ' + x.sev + '"><b>' + x.time + '</b><span>' + esc(x.msg) + '</span></div>').join('') : '<p class="muted">No alerts yet. The twin is watching the live stream. Open the live twin and inject an event to see it react.</p>'; } alerts();
  const iv = setInterval(() => { if (S.view !== 'dashboard') { clearInterval(iv); return; } alerts(); }, 1500);
});
const sgn = d => (Math.abs(d) < 0.05 ? '' : d > 0 ? '+' : '') + pct(Math.abs(d) < 0.05 ? 0 : d);
function kpi(label, id, val, f, sub, good) { const fk = f === inrK ? 'k' : (f.toString().includes('wks') ? 'w' : 'p'); return '<div class="kpi"><small>' + label + '</small><strong data-v="' + val + '" data-f="' + fk + '">0</strong><span class="' + (good ? 'up' : 'down') + '">' + sub + '</span></div>'; }

/* ---------------- Data integration ---------------- */
CDT.registerView('data', function (v) {
  const ds = S.ds, q = ds.quality, conns = [['Sales database', q.rows.toLocaleString('en-IN') + ' rows'], ['Inventory system', (ds.weeks * ds.products.length).toLocaleString('en-IN') + ' stock records'], ['Workforce records', ds.weeks + ' weekly rosters'], ['Customer transactions', '3 segments modelled'], ['Supplier management', new Set(ds.products.map(p => p.supplier)).size + ' suppliers']];
  const steps = [['Validate schema', 'date, product, units, price present'], ['Handle missing values', q.interpolated + ' weeks interpolated'], ['Detect outliers (IQR \u00D7 3)', q.outliers + ' values winsorised'], ['Normalise and build features', 'lags, seasonality, price ratio'], ['Aggregate weekly time series', ds.weeks + ' weeks \u00D7 ' + ds.products.length + ' products'], ['Estimate twin parameters', 'base demand, price elasticity, cost']];
  const quality = clamp(100 - q.interpolated / (ds.weeks * ds.products.length) * 400 - q.outliers * 1.5, 0, 100);
  v.innerHTML = '<div class="grid g21"><section class="panel"><div class="panel-h"><h3>Data sources</h3><span class="tag">' + (ds.source === 'sample' ? 'sample connectors' : 'uploaded file') + '</span></div>' +
    '<ul class="conns">' + conns.map(c => '<li><i class="dot live"></i><span>' + c[0] + '</span><em>' + c[1] + '</em><b>Synced</b></li>').join('') + '</ul>' +
    '<div class="drop" id="drop"><input type="file" id="file" accept=".csv,text/csv" hidden><div><strong>Upload your own sales data</strong><p>Drag a CSV here or <a href="#" id="pick">browse</a>. Columns: <code>date, product, units, price</code> (optional <code>stock, satisfaction</code>). About 30 or more weeks of history works best.</p></div><div class="btns"><button class="btn small" id="useSample">Use the sample dataset</button><button class="btn small ghost" id="dlSample">Download sample CSV</button></div><p class="err" id="dErr" role="alert"></p></div></section>' +
    '<section class="panel"><div class="panel-h"><h3>Data quality</h3></div><div class="ring" style="--p:' + quality + '"><b>' + Math.round(quality) + '</b><small>/100</small></div><ul class="stats"><li><span>Rows ingested</span><b>' + q.rows.toLocaleString('en-IN') + '</b></li><li><span>Missing handled</span><b>' + q.interpolated + '</b></li><li><span>Outliers capped</span><b>' + q.outliers + '</b></li><li><span>Products</span><b>' + ds.products.length + '</b></li></ul>' + (q.assumedCost ? '<p class="warn">Unit cost was not in the file, so cost is assumed to be 68% of price. Add a cost column in your real data for accurate profit figures.</p>' : '') + '</section></div>' +
    '<div class="grid g2"><section class="panel"><div class="panel-h"><h3>Cleaning pipeline</h3></div><ol class="pipeline">' + steps.map((s, i) => '<li style="--i:' + i + '"><i></i><div><b>' + s[0] + '</b><span>' + s[1] + '</span></div></li>').join('') + '</ol></section>' +
    '<section class="panel"><div class="panel-h"><h3>Calibrated twin parameters</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Product</th><th>Base demand / wk</th><th>Price</th><th>Unit cost</th><th>Elasticity</th></tr></thead><tbody>' + ds.products.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + Math.round(p.base).toLocaleString('en-IN') + '</td><td>' + inr(p.priceNow) + '</td><td>' + inr(p.cost) + '</td><td>' + p.elast.toFixed(2) + (p.elastEstimated ? '' : ' <small>(default)</small>') + '</td></tr>').join('') + '</tbody></table></div><p class="muted">Price elasticity is estimated from the detrended log-log relation between price and units.</p></section></div>' +
    '<section class="panel"><div class="panel-h"><h3>Recent data</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Week of</th><th>Product</th><th>Units</th><th>Price</th><th>Stock</th></tr></thead><tbody>' + ds.products.flatMap(p => [ds.weeks - 1, ds.weeks - 2, ds.weeks - 3].map(i => ({ i, p }))).sort((a, b) => b.i - a.i).slice(0, 12).map(r => '<tr><td>' + dstr(ds.dates[r.i]) + '</td><td>' + esc(r.p.name) + '</td><td>' + Math.round(r.p.units[r.i]).toLocaleString('en-IN') + '</td><td>' + inr(r.p.price[r.i]) + '</td><td>' + Math.round(r.p.stock[r.i]).toLocaleString('en-IN') + '</td></tr>').join('') + '</tbody></table></div></section>';
  const err = msg => { $('#dErr').textContent = msg; };
  const load = file => { if (!file) return; err(''); const rd = new FileReader(); rd.onload = async () => { try { const d = E.ingestCSV(String(rd.result), file.name); await C.buildTwin(d); } catch (e) { err(e.message); } }; rd.readAsText(file); };
  $('#pick').addEventListener('click', e => { e.preventDefault(); $('#file').click(); }); $('#file').addEventListener('change', e => load(e.target.files[0]));
  const dz = $('#drop'); ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); })); ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); })); dz.addEventListener('drop', e => load(e.dataTransfer.files[0]));
  $('#useSample').addEventListener('click', () => C.buildTwin(E.generateSample(104, 42)));
  $('#dlSample').addEventListener('click', () => { const s = E.generateSample(104, 42); const rows = ['date,product,units,price,stock,satisfaction']; s.products.forEach(p => s.dates.forEach((d, i) => rows.push([d.toISOString().slice(0, 10), p.name, Math.round(p.units[i]), p.price[i].toFixed(2), Math.round(p.stock[i]), p.sat[i].toFixed(1)].join(',')))); download('sample-msme-sales.csv', rows.join('\n'), 'text/csv'); });
});
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }
CDT.helpers.download = download; CDT.helpers.pills = pills; CDT.helpers.recCard = recCard; CDT.helpers.recFor = recFor; CDT.helpers.weeklyTotals = weeklyTotals;

/* ---------------- Live twin ---------------- */
CDT.registerView('twin', function (v) {
  const ds = S.ds, T = S.twin;
  v.innerHTML = '<div class="twin-bar panel"><div class="tb-l"><span class="clock" id="tClock">Day 1, 9:00</span><span class="muted">simulated business time</span></div><div class="tb-r"><button class="btn small" id="tPlay">' + (T.running ? 'Pause' : 'Resume') + '</button><div class="seg" id="tSpeed">' + [1, 4, 10].map(s => '<button data-s="' + s + '" class="' + (T.speed === s ? 'on' : '') + '">' + s + '&times;</button>').join('') + '</div><span class="sep"></span><button class="btn small warn" data-ev="spike">Demand surge</button><button class="btn small warn" data-ev="supply">Supplier delay</button><button class="btn small warn" data-ev="staff">Staff absent</button></div></div>' +
    '<div class="tmetrics">' + [['sales', 'Units sold / hour', K.cyan], ['cover', 'Stock cover (weeks)', K.violet], ['util', 'Staff utilisation %', K.amber], ['sat', 'Customer satisfaction', K.green], ['eta', 'Supplier lead time (h)', K.rose]].map(m => '<div class="tm"><small>' + m[1] + '</small><strong id="tv-' + m[0] + '">--</strong><canvas id="ts-' + m[0] + '" height="38"></canvas></div>').join('') + '</div>' +
    '<div class="grid g21"><section class="panel"><div class="panel-h"><h3>Business state</h3><span class="tag live">streaming</span></div><div class="tbl-wrap"><table class="tbl" id="tTable"></table></div><p class="muted">The twin mirrors stock, orders in transit and demand hour by hour. Orders are placed automatically when projected cover falls too low.</p></section>' +
    '<section class="panel"><div class="panel-h"><h3>Alerts</h3><button class="lnk" id="ackAll">Acknowledge all</button></div><div id="tAlerts" class="alerts"></div></section></div>';
  $('#tPlay').addEventListener('click', () => { T.running = !T.running; $('#tPlay').textContent = T.running ? 'Pause' : 'Resume'; C.startTwinLoop(); });
  $$('#tSpeed button').forEach(b => b.addEventListener('click', () => { T.speed = +b.dataset.s; $$('#tSpeed button').forEach(x => x.classList.toggle('on', x === b)); C.startTwinLoop(); }));
  $$('[data-ev]').forEach(b => b.addEventListener('click', () => C.injectEvent(b.dataset.ev)));
  $('#ackAll').addEventListener('click', () => { T.alerts.forEach(a => a.ack = true); updateTwinUI(); C.updateBadge(); });
  updateTwinUI();
});
function updateTwinUI() {
  const T = S.twin, ds = S.ds; if (!$('#tClock')) return; const hod = 9 + (T.hour % 12), day = Math.floor(T.hour / 12) + 1; $('#tClock').textContent = 'Day ' + day + ', ' + hod + ':00';
  const last = k => T.hist[k][T.hist[k].length - 1], fmt = { sales: x => Math.round(x).toLocaleString('en-IN'), cover: x => x.toFixed(2), util: x => Math.round(x) + '%', sat: x => x.toFixed(0), eta: x => Math.round(x) + ' h' };
  [['sales', K.cyan], ['cover', K.violet], ['util', K.amber], ['sat', K.green], ['eta', K.rose]].forEach(m => { const d = T.hist[m[0]]; if (!d.length) return; $('#tv-' + m[0]).textContent = fmt[m[0]](last(m[0])); const cv = $('#ts-' + m[0]); if (d.length > 2) CDT.spark(cv, d, m[1]); });
  $('#tTable').innerHTML = '<thead><tr><th>Product</th><th>Stock</th><th>Cover</th><th>On order</th><th>Status</th></tr></thead><tbody>' + (T.status.length ? T.status : ds.products.map((p, i) => ({ name: p.name, stock: T.inv[i], cover: T.inv[i] / (T.hd[i] * 84), out: false, pend: 0 }))).map(s => '<tr><td>' + esc(s.name) + '</td><td>' + Math.round(s.stock).toLocaleString('en-IN') + '</td><td>' + s.cover.toFixed(1) + ' wks</td><td>' + (s.pend ? 'arrives in ' + s.pend + ' h' : '-') + '</td><td><span class="st ' + (s.out ? 'crit' : s.cover < 1 ? 'warn' : 'ok') + '">' + (s.out ? 'Stock-out' : s.cover < 1 ? 'Low' : 'Healthy') + '</span></td></tr>').join('') + '</tbody>';
  $('#tAlerts').innerHTML = T.alerts.length ? T.alerts.slice(0, 12).map(a => '<div class="al ' + a.sev + (a.ack ? ' ack' : '') + '"><b>' + a.time + '</b><span>' + esc(a.msg) + '</span></div>').join('') : '<p class="muted">No alerts yet. Try injecting a demand surge or a supplier delay.</p>';
}
CDT.views.updateTwin = updateTwinUI;
})();
