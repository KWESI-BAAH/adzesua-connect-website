'use strict';
/* Adzesua learning pattern: tiles built from the mark's circle, stem and dot, drawn on canvas.
   The gold dot (the learner) appears sparingly; one tile per row is "lit". */
(function () {
  function draw() {
    const c = document.getElementById('gPattern'); if (!c) return;
    const r = c.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    const x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, r.width, r.height);
    const T = r.width < 600 ? 46 : 64; let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const cols = Math.ceil(r.width / T) + 1, rows = Math.ceil(r.height / T) + 1;
    for (let j = 0; j < rows; j++) {
      const lit = Math.floor(rnd() * cols);
      for (let i = 0; i < cols; i++) {
        const cx = i * T, cy = j * T; const k = Math.floor(rnd() * 5);
        // fade toward the top-left so the headline stays calm
        const fade = Math.min(1, ((i / cols) * 0.9 + (j / rows) * 0.7));
        const a = 0.025 + 0.06 * fade;
        x.strokeStyle = `rgba(255,255,255,${a})`; x.fillStyle = `rgba(255,255,255,${a})`; x.lineWidth = T * 0.075; x.lineCap = 'butt';
        x.save(); x.translate(cx + T / 2, cy + T / 2); x.rotate((Math.floor(rnd() * 4)) * Math.PI / 2); x.translate(-T / 2, -T / 2);
        if (k === 0) { x.beginPath(); x.arc(T * 0.42, T * 0.58, T * 0.2, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.moveTo(T * 0.66, T * 0.3); x.lineTo(T * 0.66, T * 0.82); x.stroke(); }
        else if (k === 1) { x.beginPath(); x.arc(T * 0.5, T * 0.5, T * 0.22, 0, Math.PI * 2); x.stroke(); }
        else if (k === 2) { x.beginPath(); x.moveTo(T * 0.5, T * 0.22); x.lineTo(T * 0.5, T * 0.78); x.lineTo(T * 0.62, T * 0.78); x.stroke(); }
        else if (k === 3) { x.beginPath(); x.arc(T * 0.5, T * 1.0, T * 0.32, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
        else { x.beginPath(); x.arc(T * 0.5, T * 0.5, T * 0.06, 0, Math.PI * 2); x.fill(); }
        if (i === lit && fade > 0.45) { x.fillStyle = `rgba(245,178,26,${0.35 + 0.4 * fade})`; x.beginPath(); x.arc(T * 0.78, T * 0.24, T * 0.065, 0, Math.PI * 2); x.fill(); }
        x.restore();
      }
    }
  }
  let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 120); });
  document.addEventListener('DOMContentLoaded', () => { draw(); if (window.ADZ_PLATFORM === 'firebase') document.body.classList.add('platform-firebase'); });
})();
