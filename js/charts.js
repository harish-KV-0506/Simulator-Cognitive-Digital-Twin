/* Lightweight canvas charts with draw-in animation and hover tooltips */
(function () {
'use strict';
const CDT = window.CDT = window.CDT || {};
const C = { grid: 'rgba(140,170,255,.12)', axis: '#8D99B8', text: '#E8EEFF', cyan: '#4FE3F0', violet: '#8B7CFF', amber: '#FFB454', rose: '#FF5C7A', green: '#45E3A0' };
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
function setup(cv) { const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w: r.width, h: r.height }; }
function nice(min, max, n) { const span = max - min || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag; return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step }; }
const fmt = v => Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'K' : Math.round(v).toString();
CDT.fmtK = fmt;
function animate(cv, draw, ms) {
  cancelAnimationFrame(cv._raf); const t0 = performance.now(); ms = ms || 800;
  if (reduce) { draw(1); return; }
  const f = now => { const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3); draw(e); if (p < 1) cv._raf = requestAnimationFrame(f); }; cv._raf = requestAnimationFrame(f);
}

/* line chart: series [{data, color, dash, width, label, startAt}], opt {labels, band:{lo,hi,color,startAt}, yFmt, marker:index, height} */
CDT.lineChart = function (cv, series, opt) {
  opt = opt || {}; const draw = prog => {
    const { x, w, h } = setup(cv); const L = 46, R = 12, T = 12, B = 26, pw = w - L - R, ph = h - T - B; const n = Math.max.apply(null, series.map(s => (s.startAt || 0) + s.data.length));
    let mn = Infinity, mx = -Infinity; series.forEach(s => s.data.forEach(v => { if (v != null && isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } })); if (opt.band) { opt.band.lo.forEach(v => mn = Math.min(mn, v)); opt.band.hi.forEach(v => mx = Math.max(mx, v)); }
    if (opt.zero) mn = Math.min(0, mn); const sc = nice(mn, mx, 4), X = i => L + (n > 1 ? i / (n - 1) : 0) * pw, Y = v => T + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * ph;
    x.clearRect(0, 0, w, h); x.font = '11px "IBM Plex Mono", monospace'; x.textBaseline = 'middle';
    for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) { x.strokeStyle = C.grid; x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(w - R, Y(v)); x.stroke(); x.fillStyle = C.axis; x.textAlign = 'right'; x.fillText((opt.yFmt || fmt)(v), L - 8, Y(v)); }
    if (opt.labels) { x.textAlign = 'center'; x.textBaseline = 'top'; const stepL = Math.ceil(n / 7); for (let i = 0; i < n; i += stepL) { x.fillStyle = C.axis; x.fillText(opt.labels[i] || '', X(i), h - B + 8); } }
    x.save(); x.beginPath(); x.rect(L - 2, 0, (pw + 6) * prog, h); x.clip();
    if (opt.marker != null) { x.strokeStyle = 'rgba(255,255,255,.22)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(opt.marker), T); x.lineTo(X(opt.marker), T + ph); x.stroke(); x.setLineDash([]); x.fillStyle = C.axis; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText(opt.markerLabel || 'forecast', X(opt.marker) + 6, T + 2); }
    if (opt.band) { const b = opt.band, s0 = b.startAt || 0; x.beginPath(); b.hi.forEach((v, i) => i ? x.lineTo(X(s0 + i), Y(v)) : x.moveTo(X(s0 + i), Y(v))); for (let i = b.lo.length - 1; i >= 0; i--) x.lineTo(X(s0 + i), Y(b.lo[i])); x.closePath(); x.fillStyle = b.color || 'rgba(139,124,255,.16)'; x.fill(); }
    series.forEach(s => { const s0 = s.startAt || 0; x.beginPath(); let started = false; s.data.forEach((v, i) => { if (v == null) return; const px = X(s0 + i), py = Y(v); if (!started) { x.moveTo(px, py); started = true; } else x.lineTo(px, py); });
      x.lineWidth = s.width || 2.2; x.strokeStyle = s.color; x.setLineDash(s.dash || []); x.lineJoin = 'round'; x.shadowColor = s.color; x.shadowBlur = s.glow === false ? 0 : 8; x.stroke(); x.shadowBlur = 0; x.setLineDash([]); });
    x.restore();
    cv._geo = { L, R, T, B, pw, ph, n, X, Y, w, h, series, opt, sc };
  };
  animate(cv, draw, opt.ms);
  if (!cv._hover) { cv._hover = true; const tip = document.getElementById('tip');
    cv.addEventListener('pointermove', e => { const g = cv._geo; if (!g || !tip) return; const r = cv.getBoundingClientRect(), px = e.clientX - r.left, i = Math.round((px - g.L) / g.pw * (g.n - 1)); if (i < 0 || i >= g.n) { tip.style.opacity = 0; return; }
      let html = '<b>' + ((g.opt.labels && g.opt.labels[i]) || '#' + i) + '</b>'; g.series.forEach(s => { const v = s.data[i - (s.startAt || 0)]; if (v != null) html += '<div><i style="background:' + s.color + '"></i>' + (s.label || '') + ' <span>' + (g.opt.tipFmt || fmt)(v) + '</span></div>'; });
      tip.innerHTML = html; tip.style.opacity = 1; tip.style.left = Math.min(window.innerWidth - 190, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
    cv.addEventListener('pointerleave', () => { if (tip) tip.style.opacity = 0; }); }
};

/* histogram of one or two samples */
CDT.histogram = function (cv, a, b, opt) {
  opt = opt || {}; const draw = prog => {
    const { x, w, h } = setup(cv), L = 12, R = 12, T = 14, B = 30, pw = w - L - R, ph = h - T - B; const all = a.concat(b || []); const lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), bins = 34, bw = (hi - lo || 1) / bins;
    const cnt = arr => { const c = new Array(bins).fill(0); arr.forEach(v => c[Math.min(bins - 1, Math.floor((v - lo) / bw))]++); return c; }, ca = cnt(a), cb = b ? cnt(b) : null, mxc = Math.max.apply(null, ca.concat(cb || [])) || 1;
    x.clearRect(0, 0, w, h); const X = v => L + (v - lo) / (hi - lo || 1) * pw;
    const bars = (c, color) => c.forEach((v, i) => { const bh = v / mxc * ph * prog; x.fillStyle = color; x.fillRect(L + i * pw / bins + 1, T + ph - bh, pw / bins - 2, bh); });
    if (cb) bars(cb, 'rgba(139,124,255,.45)'); bars(ca, 'rgba(79,227,240,.55)');
    x.strokeStyle = C.grid; x.beginPath(); x.moveTo(L, T + ph + .5); x.lineTo(w - R, T + ph + .5); x.stroke();
    x.font = '11px "IBM Plex Mono", monospace'; x.fillStyle = C.axis; x.textBaseline = 'top'; for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; x.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'; x.fillText(CDT.fmtK(v), i === 0 ? L : i === 4 ? w - R : X(v), h - B + 8); }
    (opt.markers || []).forEach(m => { x.strokeStyle = m.color; x.setLineDash([5, 4]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(X(m.x), T); x.lineTo(X(m.x), T + ph); x.stroke(); x.setLineDash([]); x.fillStyle = m.color; x.textAlign = 'center'; x.fillText(m.label, X(m.x), 0 + 1); });
  }; animate(cv, draw, 700);
};

/* bars: items [{label, value, color}], horizontal */
CDT.hbars = function (cv, items, opt) {
  opt = opt || {}; const draw = prog => { const { x, w, h } = setup(cv), L = opt.left || 120, R = 46, rowH = h / items.length, mx = Math.max.apply(null, items.map(i => i.value)) || 1;
    x.clearRect(0, 0, w, h); x.font = '12px "DM Sans", sans-serif'; x.textBaseline = 'middle';
    items.forEach((it, i) => { const y = i * rowH + rowH / 2, bw = (w - L - R) * it.value / mx * prog; x.fillStyle = C.axis; x.textAlign = 'right'; x.fillText(it.label, L - 10, y);
      const g = x.createLinearGradient(L, 0, L + bw, 0); g.addColorStop(0, it.color || 'rgba(79,227,240,.35)'); g.addColorStop(1, it.color2 || it.color || C.cyan); x.fillStyle = g; x.beginPath(); x.roundRect ? x.roundRect(L, y - 7, Math.max(2, bw), 14, 4) : x.rect(L, y - 7, Math.max(2, bw), 14); x.fill();
      x.fillStyle = C.text; x.textAlign = 'left'; x.font = '11px "IBM Plex Mono", monospace'; x.fillText((opt.fmt || (v => v.toFixed(1)))(it.value), L + bw + 8, y); x.font = '12px "DM Sans", sans-serif'; }); }; animate(cv, draw, 700);
};

/* simple sparkline */
CDT.spark = function (cv, data, color) {
  const { x, w, h } = setup(cv), mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), r = mx - mn || 1; x.clearRect(0, 0, w, h);
  x.beginPath(); data.forEach((v, i) => { const px = i / (data.length - 1) * (w - 2) + 1, py = h - 3 - (v - mn) / r * (h - 6); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.strokeStyle = color || C.cyan; x.lineWidth = 1.6; x.stroke();
  const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, (color || C.cyan) + '44'); gr.addColorStop(1, (color || C.cyan) + '00'); x.lineTo(w - 1, h); x.lineTo(1, h); x.closePath(); x.fillStyle = gr; x.fill();
};

/* learning curve */
CDT.curve = function (cv, data, opt) { CDT.lineChart(cv, [{ data: data, color: C.green, label: 'Reward', width: 2 }], Object.assign({ ms: 1, yFmt: v => v.toFixed(0), tipFmt: v => v.toFixed(1) }, opt || {})); };
CDT.colors = C;
})();
