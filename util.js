window.PX = window.PX || {};
(function () {
  const U = (PX.U = {});

  U.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  U.ctx = (c) => c.getContext('2d', { willReadFrequently: true });
  U.clone = (c) => { const n = U.canvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
  // уменьшить до max по длинной стороне (если уже меньше, вернёт тот же canvas)
  U.fit = (c, max) => {
    const s = Math.min(1, max / Math.max(c.width, c.height));
    if (s >= 1) return c;
    const n = U.canvas(c.width * s, c.height * s);
    const x = n.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, n.width, n.height);
    return n;
  };
  U.crop = (c, x, y, w, h) => {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const n = U.canvas(w, h); n.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h); return n;
  };
  U.lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.smooth = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  // Быстрый box blur. src: типизированный массив, st — шагов на пиксель, nch — сколько каналов блюрить.
  U.boxBlur = (src, w, h, r, st = 4, nch = 3) => {
    r = Math.max(1, Math.round(r));
    const out = new src.constructor(src.length);
    const tmp = new Float32Array(src.length);
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let c = 0; c < nch; c++) {
        let sum = 0;
        for (let x = -r; x <= r; x++) sum += src[(row + Math.min(w - 1, Math.max(0, x))) * st + c];
        for (let x = 0; x < w; x++) {
          tmp[(row + x) * st + c] = sum / d;
          sum += src[(row + Math.min(w - 1, x + r + 1)) * st + c] - src[(row + Math.max(0, x - r)) * st + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < nch; c++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * st + c];
        for (let y = 0; y < h; y++) {
          out[(y * w + x) * st + c] = sum / d;
          sum += tmp[(Math.min(h - 1, y + r + 1) * w + x) * st + c] - tmp[(Math.max(0, y - r) * w + x) * st + c];
        }
      }
    }
    if (st === 4 && nch === 3) for (let i = 3; i < src.length; i += 4) out[i] = src[i];
    return out;
  };
  // «гауссоподобный» блюр: несколько проходов box
  U.blur = (src, w, h, r, st = 4, nch = 3, passes = 3) => {
    let b = src;
    for (let i = 0; i < passes; i++) b = U.boxBlur(b, w, h, r, st, nch);
    return b;
  };

  U.loadFile = async (file, max = 3072) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = U.canvas(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, 0, 0);
      return U.fit(c, max);
    } finally { URL.revokeObjectURL(url); }
  };

  U.hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  U.nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
})();
