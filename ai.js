// AI-инструменты на устройстве: сегментация людей, замена фона, ластик, апскейл, автоулучшение
(function () {
  const U = PX.U;
  let segmenter = null;

  async function getSegmenter() {
    if (segmenter) return segmenter;
    const { vision, fileset } = await PX.mpLoad();
    segmenter = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    return segmenter;
  }

  // Маска «человек» полного размера: Uint8ClampedArray(w*h), 0..255
  async function personMask(canvas) {
    const seg = await getSegmenter();
    const small = U.fit(canvas, 768);
    const res = seg.segment(small);
    const list = res.confidenceMasks || [];
    if (!list.length) throw new Error('Модель не вернула маску');
    // выбираем маску, где «центр» ярче «краёв» (человек обычно по центру)
    let best = null, bestScore = -1e9;
    for (const m of list) {
      const w = m.width, h = m.height, a = m.getAsFloat32Array();
      let cs = 0, cn = 0, bs = 0, bn = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const v = a[y * w + x];
        const inC = x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75;
        const inB = x < w * 0.1 || x > w * 0.9 || y < h * 0.1 || y > h * 0.9;
        if (inC) { cs += v; cn++; } else if (inB) { bs += v; bn++; }
      }
      const score = cs / Math.max(1, cn) - bs / Math.max(1, bn);
      if (score > bestScore) { bestScore = score; best = { w, h, a: new Float32Array(a) }; }
    }
    try { list.forEach((m) => m.close && m.close()); } catch (e) {}
    // инверсия, если выбранная маска «фон»
    if (bestScore < 0) for (let i = 0; i < best.a.length; i++) best.a[i] = 1 - best.a[i];
    const mc = U.canvas(best.w, best.h), mx = mc.getContext('2d');
    const id = mx.createImageData(best.w, best.h);
    for (let i = 0; i < best.a.length; i++) { id.data[i * 4 + 3] = U.smooth(0.3, 0.7, best.a[i]) * 255; }
    mx.putImageData(id, 0, 0);
    const full = U.canvas(canvas.width, canvas.height), fx = full.getContext('2d', { willReadFrequently: true });
    fx.imageSmoothingQuality = 'high';
    fx.drawImage(mc, 0, 0, full.width, full.height);
    const d = fx.getImageData(0, 0, full.width, full.height).data;
    let m = new Uint8ClampedArray(full.width * full.height);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    return m;
  }

  // mode: 'transparent' | 'color' | 'blur' ; fill: строка цвета или [c1,c2] для градиента
  function applyBackground(canvas, mask, mode, fill) {
    const w = canvas.width, h = canvas.height;
    const ctx = U.ctx(U.clone(canvas));
    const id = ctx.getImageData(0, 0, w, h), d = id.data;
    if (mode === 'blur') {
      const bl = U.blur(d, w, h, Math.max(4, Math.round(Math.max(w, h) / 70)), 4, 3, 3);
      for (let i = 0; i < mask.length; i++) {
        const a = mask[i] / 255, o = i * 4;
        d[o] = d[o] * a + bl[o] * (1 - a); d[o + 1] = d[o + 1] * a + bl[o + 1] * (1 - a); d[o + 2] = d[o + 2] * a + bl[o + 2] * (1 - a);
      }
      ctx.putImageData(id, 0, 0);
      return { canvas: ctx.canvas, alpha: false };
    }
    for (let i = 0; i < mask.length; i++) d[i * 4 + 3] = (d[i * 4 + 3] * mask[i]) / 255;
    ctx.putImageData(id, 0, 0);
    if (mode === 'transparent') return { canvas: ctx.canvas, alpha: true };
    const out = U.canvas(w, h), ox = out.getContext('2d');
    if (Array.isArray(fill)) { const g = ox.createLinearGradient(0, 0, w * 0.4, h); g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]); ox.fillStyle = g; }
    else ox.fillStyle = fill;
    ox.fillRect(0, 0, w, h);
    ox.drawImage(ctx.canvas, 0, 0);
    return { canvas: out, alpha: false };
  }

  // Ластик: заливка области по маске (диффузия от краёв + шум текстуры)
  function inpaint(canvas, maskCanvas) {
    const W = canvas.width, H = canvas.height;
    const md = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return canvas;
    const pad = Math.max(24, Math.round(Math.max(x1 - x0, y1 - y0) * 0.3));
    const rx = Math.max(0, x0 - pad), ry = Math.max(0, y0 - pad), rw = Math.min(W, x1 + pad) - rx, rh = Math.min(H, y1 + pad) - ry;
    const f = Math.min(1, 300 / Math.max(rw, rh));
    const lw = Math.max(4, Math.round(rw * f)), lh = Math.max(4, Math.round(rh * f));

    const lc = U.canvas(lw, lh), lx = lc.getContext('2d', { willReadFrequently: true });
    lx.imageSmoothingQuality = 'high';
    lx.drawImage(canvas, rx, ry, rw, rh, 0, 0, lw, lh);
    const lmc = U.canvas(lw, lh), lmx = lmc.getContext('2d', { willReadFrequently: true });
    lmx.drawImage(maskCanvas, rx, ry, rw, rh, 0, 0, lw, lh);
    const img = lx.getImageData(0, 0, lw, lh).data, mm = lmx.getImageData(0, 0, lw, lh).data;
    const N = lw * lh;
    let unk = new Uint8Array(N);
    for (let i = 0; i < N; i++) unk[i] = mm[i * 4 + 3] > 30 ? 1 : 0;
    // расширяем маску на 2 пикселя
    for (let it = 0; it < 2; it++) {
      const nu = unk.slice();
      for (let y = 1; y < lh - 1; y++) for (let x = 1; x < lw - 1; x++) { const i = y * lw + x; if (unk[i - 1] || unk[i + 1] || unk[i - lw] || unk[i + lw]) nu[i] = 1; }
      unk = nu;
    }
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { col[i * 3] = img[i * 4]; col[i * 3 + 1] = img[i * 4 + 1]; col[i * 3 + 2] = img[i * 4 + 2]; }
    const known = new Uint8Array(N);
    for (let i = 0; i < N; i++) known[i] = unk[i] ? 0 : 1;
    // «луковая» заливка
    for (let guard = 0; guard < lw + lh; guard++) {
      const upd = [];
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const i = y * lw + x; if (known[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        const nb = [x > 0 ? i - 1 : -1, x < lw - 1 ? i + 1 : -1, y > 0 ? i - lw : -1, y < lh - 1 ? i + lw : -1];
        for (const j of nb) if (j >= 0 && known[j]) { r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; n++; }
        if (n) upd.push([i, r / n, g / n, b / n]);
      }
      if (!upd.length) break;
      for (const [i, r, g, b] of upd) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; known[i] = 1; }
    }
    // сглаживание внутри маски
    for (let it = 0; it < 40; it++) {
      for (let y = 1; y < lh - 1; y++) for (let x = 1; x < lw - 1; x++) {
        const i = y * lw + x; if (!unk[i]) continue;
        for (let k = 0; k < 3; k++) col[i * 3 + k] = (col[(i - 1) * 3 + k] + col[(i + 1) * 3 + k] + col[(i - lw) * 3 + k] + col[(i + lw) * 3 + k]) / 4;
      }
    }
    const fill = U.canvas(lw, lh), fx = fill.getContext('2d'), fid = fx.createImageData(lw, lh);
    for (let i = 0; i < N; i++) { fid.data[i * 4] = col[i * 3]; fid.data[i * 4 + 1] = col[i * 3 + 1]; fid.data[i * 4 + 2] = col[i * 3 + 2]; fid.data[i * 4 + 3] = 255; }
    fx.putImageData(fid, 0, 0);
    // маска полного разрешения региона (чуть шире + мягкий край)
    const regC = U.canvas(rw, rh), rcx = regC.getContext('2d', { willReadFrequently: true });
    rcx.imageSmoothingQuality = 'high';
    rcx.drawImage(fill, 0, 0, rw, rh);
    const fd = rcx.getImageData(0, 0, rw, rh).data;
    const mk = U.canvas(rw, rh), mkx = mk.getContext('2d', { willReadFrequently: true });
    const mkid = mkx.createImageData(rw, rh);
    const lmu = U.canvas(lw, lh), lmux = lmu.getContext('2d'), lmid = lmux.createImageData(lw, lh);
    for (let i = 0; i < N; i++) lmid.data[i * 4 + 3] = unk[i] ? 255 : 0;
    lmux.putImageData(lmid, 0, 0);
    mkx.imageSmoothingQuality = 'high'; mkx.drawImage(lmu, 0, 0, rw, rh);
    const mkd = mkx.getImageData(0, 0, rw, rh).data;
    let ma = new Uint8ClampedArray(rw * rh);
    for (let i = 0; i < ma.length; i++) ma[i] = mkd[i * 4 + 3] > 100 ? 255 : 0;
    ma = U.boxBlur(ma, rw, rh, Math.max(2, Math.round(2 / f)), 1, 1);

    const out = U.clone(canvas), ctx = U.ctx(out);
    const od = ctx.getImageData(rx, ry, rw, rh), d = od.data;
    // шум по текстуре окружения
    let s2 = 0, sn = 0;
    for (let y = 2; y < rh - 2; y += 3) for (let x = 2; x < rw - 2; x += 3) {
      const i = y * rw + x; if (ma[i]) continue;
      const o = i * 4, l = U.lum(d[o], d[o + 1], d[o + 2]);
      const nl = (U.lum(d[o - 4], d[o - 3], d[o - 2]) + U.lum(d[o + 4], d[o + 5], d[o + 6]) + U.lum(d[o - rw * 4], d[o - rw * 4 + 1], d[o - rw * 4 + 2]) + U.lum(d[o + rw * 4], d[o + rw * 4 + 1], d[o + rw * 4 + 2])) / 4;
      s2 += (l - nl) * (l - nl); sn++;
    }
    const sigma = Math.min(14, Math.sqrt(s2 / Math.max(1, sn)));
    const rnd = U.rng(11);
    for (let i = 0; i < ma.length; i++) {
      const a = ma[i] / 255; if (!a) continue;
      const o = i * 4, nz = (rnd() + rnd() + rnd() - 1.5) * sigma * 1.6;
      d[o] += (fd[o] + nz - d[o]) * a; d[o + 1] += (fd[o + 1] + nz - d[o + 1]) * a; d[o + 2] += (fd[o + 2] + nz - d[o + 2]) * a;
    }
    ctx.putImageData(od, rx, ry);
    return out;
  }

  // Апскейл ×2 (до 3072 px) + деликатное повышение чёткости
  function upscale(canvas) {
    const w = canvas.width, h = canvas.height;
    const f = Math.min(2, 3072 / Math.max(w, h));
    if (f < 1.05) return null;
    let cur = canvas;
    const steps = f > 1.45 ? 2 : 1, per = Math.pow(f, 1 / steps);
    for (let s = 0; s < steps; s++) {
      const n = U.canvas(cur.width * per, cur.height * per), x = n.getContext('2d');
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    const ctx = U.ctx(cur), id = ctx.getImageData(0, 0, cur.width, cur.height), d = id.data;
    const bl = U.boxBlur(d, cur.width, cur.height, 1, 4, 3);
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + (d[i + k] - bl[i + k]) * 0.9;
    ctx.putImageData(id, 0, 0);
    return cur;
  }

  // Авто-улучшение: подбирает параметры настроек по гистограмме
  function autoEnhance(canvas) {
    const s = U.fit(canvas, 256), d = U.ctx(s).getImageData(0, 0, s.width, s.height).data;
    const hist = new Float32Array(256); let n = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) continue; const l = Math.round(U.lum(d[i], d[i + 1], d[i + 2])); hist[l]++; n++; sum += l; }
    const pct = (p) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * p) return i / 255; } return 1; };
    const mean = sum / Math.max(1, n) / 255, p2 = pct(0.02), p98 = pct(0.98), p15 = pct(0.15);
    const ev = U.clamp(Math.log2(0.46 / Math.max(0.05, mean)), -0.8, 0.8) * 0.6;
    const range = p98 - p2;
    return {
      exposure: ev / 1.5,
      contrast: U.clamp((0.88 - range) * 0.7, 0, 0.35),
      shadows: U.clamp((0.18 - p15) * 2, 0, 0.35),
      highlights: p98 > 0.98 ? -0.15 : 0,
      saturation: 0.1, vibrance: 0.15, sharpen: 0.25,
    };
  }

  PX.ai = { personMask, applyBackground, inpaint, upscale, autoEnhance };
})();
