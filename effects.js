// Художественные эффекты (чистые функции: canvas, сила 0..1 -> новый canvas)
(function () {
  const U = PX.U;
  const scaleR = (c, r) => Math.max(1, Math.round(r * Math.max(c.width, c.height) / 1024));

  const DUO = [['#1b1464', '#f9d423'], ['#0f2027', '#ff6a88'], ['#42275a', '#ffd8a8'], ['#003d33', '#caff6b']];

  const EFFECTS = [
    { id: 'sketch', name: 'Эскиз', icon: '✏️', fn(c, s) {
      const w = c.width, h = c.height, ctx = U.ctx(U.clone(c));
      const id = ctx.getImageData(0, 0, w, h), d = id.data;
      const g = new Uint8ClampedArray(w * h), inv = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) { g[i] = U.lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); inv[i] = 255 - g[i]; }
      const b = U.blur(inv, w, h, scaleR(c, 2 + s * 8), 1, 1, 2);
      for (let i = 0; i < w * h; i++) {
        const v = Math.min(255, (g[i] * 255) / (255 - b[i] + 1));
        const m = 0.15 + 0.1 * (1 - s);
        d[i * 4] = v * (1 - m) + d[i * 4] * m; d[i * 4 + 1] = v * (1 - m) + d[i * 4 + 1] * m; d[i * 4 + 2] = v * (1 - m) + d[i * 4 + 2] * m;
      }
      ctx.putImageData(id, 0, 0); return ctx.canvas;
    } },
    { id: 'cartoon', name: 'Мультик', icon: '🎨', fn(c, s) {
      const w = c.width, h = c.height, ctx = U.ctx(U.clone(c));
      const id = ctx.getImageData(0, 0, w, h);
      const sm = U.blur(id.data, w, h, scaleR(c, 2), 4, 3, 2), d = id.data;
      const L = Math.round(8 - s * 5);
      const g = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) g[i] = U.lum(sm[i * 4], sm[i * 4 + 1], sm[i * 4 + 2]);
      const thr = 40 - s * 20;
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
        const e = Math.abs(gx) + Math.abs(gy) > thr ? 0.25 : 1;
        for (let k = 0; k < 3; k++) d[i * 4 + k] = (Math.round((sm[i * 4 + k] / 255) * L) / L) * 255 * e;
      }
      ctx.putImageData(id, 0, 0); return ctx.canvas;
    } },
    { id: 'pixel', name: 'Пиксели', icon: '🟦', fn(c, s) {
      const b = Math.max(2, Math.round((0.01 + s * 0.05) * Math.max(c.width, c.height)));
      const sm = U.canvas(Math.ceil(c.width / b), Math.ceil(c.height / b));
      const sx = sm.getContext('2d'); sx.imageSmoothingEnabled = true; sx.drawImage(c, 0, 0, sm.width, sm.height);
      const o = U.canvas(c.width, c.height), ox = o.getContext('2d'); ox.imageSmoothingEnabled = false;
      ox.drawImage(sm, 0, 0, sm.width, sm.height, 0, 0, sm.width * b, sm.height * b); return o;
    } },
    { id: 'glitch', name: 'Глитч', icon: '📺', fn(c, s) {
      const w = c.width, h = c.height, rnd = U.rng(7);
      const o = U.clone(c), x = o.getContext('2d');
      const n = Math.round(6 + s * 22);
      for (let i = 0; i < n; i++) {
        const y = rnd() * h, hh = (0.01 + rnd() * 0.06) * h, dx = (rnd() - 0.5) * s * 0.18 * w;
        x.drawImage(c, 0, y, w, hh, dx, y, w, hh);
      }
      const ctx = U.ctx(o), id = ctx.getImageData(0, 0, w, h), d = id.data, src = new Uint8ClampedArray(d);
      const sh = Math.max(1, Math.round(w * (0.004 + s * 0.02)));
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const i = (yy * w + xx) * 4;
        d[i] = src[(yy * w + Math.min(w - 1, xx + sh)) * 4];
        d[i + 2] = src[(yy * w + Math.max(0, xx - sh)) * 4 + 2];
      }
      ctx.putImageData(id, 0, 0); return o;
    } },
    { id: 'duo', name: 'Дуотон', icon: '🌗', opt: 'duo', fn(c, s, o = {}) {
      const pair = DUO[(o.duo || 0) % DUO.length].map(U.hex2rgb);
      const w = c.width, h = c.height, ctx = U.ctx(U.clone(c)), id = ctx.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const t = U.lum(d[i], d[i + 1], d[i + 2]) / 255;
        for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - s) + (pair[0][k] + (pair[1][k] - pair[0][k]) * t) * s;
      }
      ctx.putImageData(id, 0, 0); return ctx.canvas;
    } },
    { id: 'glow', name: 'Свечение', icon: '💫', fn(c, s) {
      const w = c.width, h = c.height, ctx = U.ctx(U.clone(c)), id = ctx.getImageData(0, 0, w, h), d = id.data;
      const bright = new Uint8ClampedArray(d.length);
      for (let i = 0; i < d.length; i += 4) {
        const k = U.smooth(110, 230, U.lum(d[i], d[i + 1], d[i + 2]));
        bright[i] = d[i] * k; bright[i + 1] = d[i + 1] * k; bright[i + 2] = d[i + 2] * k; bright[i + 3] = 255;
      }
      const bl = U.blur(bright, w, h, scaleR(c, 14), 4, 3, 3);
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) {
        const a = d[i + k] / 255, b = (bl[i + k] / 255) * s * 1.4;
        d[i + k] = (1 - (1 - a) * (1 - Math.min(1, b))) * 255;
      }
      ctx.putImageData(id, 0, 0); return ctx.canvas;
    } },
    { id: 'blur', name: 'Размытие', icon: '🌫', fn(c, s) {
      const w = c.width, h = c.height, ctx = U.ctx(U.clone(c)), id = ctx.getImageData(0, 0, w, h);
      const b = U.blur(id.data, w, h, scaleR(c, 1 + s * 14), 4, 3, 3);
      id.data.set(b); ctx.putImageData(id, 0, 0); return ctx.canvas;
    } },
  ];

  // Рамки: возвращает canvas с полями _ox,_oy (смещение исходника)
  function frame(c, type, pct, color) {
    const w = c.width, h = c.height, m = Math.min(w, h);
    const pad = Math.round(m * pct);
    let out, ox = pad, oy = pad;
    if (type === 'polaroid') {
      const bot = pad * 3;
      out = U.canvas(w + pad * 2, h + pad + bot);
      const x = out.getContext('2d'); x.fillStyle = '#f7f4ec'; x.fillRect(0, 0, out.width, out.height); x.drawImage(c, pad, pad);
    } else if (type === 'round') {
      out = U.canvas(w, h); ox = oy = 0;
      const x = out.getContext('2d'), r = m * (0.04 + pct * 2);
      x.beginPath(); x.roundRect(0, 0, w, h, r); x.clip(); x.drawImage(c, 0, 0);
    } else {
      out = U.canvas(w + pad * 2, h + pad * 2);
      const x = out.getContext('2d'); x.fillStyle = type === 'black' ? '#000' : type === 'color' ? color : '#fff';
      x.fillRect(0, 0, out.width, out.height); x.drawImage(c, pad, pad);
    }
    out._ox = ox; out._oy = oy; return out;
  }

  PX.effects = { list: EFFECTS, DUO, frame };
})();
