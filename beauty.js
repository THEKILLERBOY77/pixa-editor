// Ретушь лица на устройстве: MediaPipe Face Landmarker + собственная обработка пикселей
(function () {
  const U = PX.U;
  const VER = '0.10.14';
  const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
  let vision = null, fileset = null, landmarker = null;

  PX.mpLoad = async () => {
    if (!vision) {
      vision = await import(`${CDN}/vision_bundle.mjs`);
      fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    }
    return { vision, fileset };
  };

  async function getLandmarker() {
    if (landmarker) return landmarker;
    const { vision, fileset } = await PX.mpLoad();
    landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      numFaces: 5,
    });
    return landmarker;
  }

  // Возвращает массив лиц, у каждого — массив точек {x,y} в долях 0..1
  async function detect(canvas) {
    const lm = await getLandmarker();
    const small = U.fit(canvas, 1024);
    const res = lm.detect(small);
    return (res.faceLandmarks || []).map((f) => f.map((p) => ({ x: p.x, y: p.y })));
  }

  const IDX = {
    oval: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    lipsOuter: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    lipsInner: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191],
    eyeL: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
    eyeR: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    browL: [276, 283, 282, 295, 285, 336, 296, 334, 293, 300],
    browR: [46, 53, 52, 65, 55, 107, 66, 105, 63, 70],
  };

  function polyMask(bx, by, bw, bh, adds, subs, feather) {
    const c = U.canvas(bw, bh), x = c.getContext('2d', { willReadFrequently: true });
    const path = (poly) => { x.beginPath(); poly.forEach((p, i) => (i ? x.lineTo(p.x - bx, p.y - by) : x.moveTo(p.x - bx, p.y - by))); x.closePath(); x.fill(); };
    x.fillStyle = '#fff';
    adds.forEach(path);
    x.globalCompositeOperation = 'destination-out';
    subs.forEach(path);
    const d = x.getImageData(0, 0, bw, bh).data;
    let m = new Uint8ClampedArray(bw * bh);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
    if (feather > 0) { m = U.boxBlur(m, bw, bh, feather, 1, 1); m = U.boxBlur(m, bw, bh, feather, 1, 1); }
    return m;
  }

  function bbox(poly, pad, W, H) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad));
    x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function warp(ctx, W, H, op) {
    const r = op.r;
    const x0 = Math.max(0, Math.floor(op.x - r)), y0 = Math.max(0, Math.floor(op.y - r));
    const x1 = Math.min(W, Math.ceil(op.x + r)), y1 = Math.min(H, Math.ceil(op.y + r));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw < 3 || bh < 3) return;
    const src = ctx.getImageData(x0, y0, bw, bh);
    const dst = ctx.createImageData(bw, bh);
    dst.data.set(src.data);
    const S = src.data, D = dst.data;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const px = x + x0, py = y + y0;
        const ddx = px - op.x, ddy = py - op.y;
        const d = Math.hypot(ddx, ddy);
        if (d >= r) continue;
        let sx, sy;
        const t = 1 - d / r;
        if (op.type === 'push') {
          const f = t * t;
          sx = px - op.dx * f; sy = py - op.dy * f;
        } else {
          const f = 1 - op.k * t * t;
          sx = op.x + ddx * f; sy = op.y + ddy * f;
        }
        sx -= x0; sy -= y0;
        sx = U.clamp(sx, 0, bw - 1.001); sy = U.clamp(sy, 0, bh - 1.001);
        const ix = sx | 0, iy = sy | 0, fx = sx - ix, fy = sy - iy;
        const i00 = (iy * bw + ix) * 4, i10 = i00 + 4, i01 = i00 + bw * 4, i11 = i01 + 4;
        const o = (y * bw + x) * 4;
        for (let c = 0; c < 4; c++) {
          D[o + c] = S[i00 + c] * (1 - fx) * (1 - fy) + S[i10 + c] * fx * (1 - fy) + S[i01 + c] * (1 - fx) * fy + S[i11 + c] * fx * fy;
        }
      }
    }
    ctx.putImageData(dst, x0, y0);
  }

  // p: {smooth, whiten, slim, bigEyes, eyes, teeth, lips, lipColor:[r,g,b]} — значения 0..1
  function apply(src, faces, p) {
    const W = src.width, H = src.height;
    const out = U.clone(src);
    if (!faces || !faces.length) return out;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const any = p.smooth || p.whiten || p.eyes || p.teeth || p.lips;

    for (const face of faces) {
      const pts = face.map((q) => ({ x: q.x * W, y: q.y * H }));
      const poly = (k) => IDX[k].map((i) => pts[i]);
      const oval = poly('oval');
      const fw = Math.hypot(pts[234].x - pts[454].x, pts[234].y - pts[454].y);

      if (any) {
        const b = bbox(oval, fw * 0.06, W, H);
        if (b.w < 8 || b.h < 8) continue;
        const img = ctx.getImageData(b.x, b.y, b.w, b.h);
        const d = img.data;
        const orig = new Uint8ClampedArray(d);
        const feather = Math.max(2, Math.round(fw * 0.015));
        const skin = polyMask(b.x, b.y, b.w, b.h, [oval], [poly('eyeL'), poly('eyeR'), poly('browL'), poly('browR'), poly('lipsOuter')], feather);
        const n = b.w * b.h;

        if (p.smooth > 0) {
          const r = Math.max(2, Math.round((fw / 75) * (0.6 + p.smooth)));
          const bl = U.blur(orig, b.w, b.h, r, 4, 3, 3);
          const sg = 2 * Math.pow(22 + p.smooth * 22, 2);
          for (let i = 0; i < n; i++) {
            const o = i * 4;
            const dd = U.lum(orig[o], orig[o + 1], orig[o + 2]) - U.lum(bl[o], bl[o + 1], bl[o + 2]);
            const a = (skin[i] / 255) * Math.min(1, p.smooth * 1.1) * Math.exp(-(dd * dd) / sg);
            d[o] = orig[o] + (bl[o] - orig[o]) * a;
            d[o + 1] = orig[o + 1] + (bl[o + 1] - orig[o + 1]) * a;
            d[o + 2] = orig[o + 2] + (bl[o + 2] - orig[o + 2]) * a;
          }
        }
        if (p.whiten > 0) {
          for (let i = 0; i < n; i++) {
            const a = (skin[i] / 255) * p.whiten * 0.3;
            if (!a) continue;
            const o = i * 4;
            d[o] += (255 - d[o]) * a; d[o + 1] += (255 - d[o + 1]) * a * 0.95; d[o + 2] += (255 - d[o + 2]) * a * 0.9;
          }
        }
        if (p.eyes > 0) {
          const em = polyMask(b.x, b.y, b.w, b.h, [poly('eyeL'), poly('eyeR')], [], Math.max(1, Math.round(fw * 0.006)));
          for (let i = 0; i < n; i++) {
            const a = (em[i] / 255) * p.eyes;
            if (!a) continue;
            const o = i * 4;
            for (let c = 0; c < 3; c++) d[o + c] = U.clamp((d[o + c] - 128) * (1 + 0.25 * a) + 128 + 28 * a, 0, 255);
          }
        }
        if (p.teeth > 0) {
          const tm = polyMask(b.x, b.y, b.w, b.h, [poly('lipsInner')], [], Math.max(1, Math.round(fw * 0.004)));
          for (let i = 0; i < n; i++) {
            if (!tm[i]) continue;
            const o = i * 4, r = d[o], g = d[o + 1], bb = d[o + 2];
            const l = U.lum(r, g, bb);
            const red = r - g;
            const wgt = (tm[i] / 255) * (1 - U.smooth(30, 70, red)) * U.smooth(55, 110, l) * p.teeth;
            const t = Math.min(255, l * 1.1 + 22);
            d[o] = r + (t - r) * wgt; d[o + 1] = g + (t - g) * wgt; d[o + 2] = bb + (t - bb) * wgt;
          }
        }
        if (p.lips > 0 && p.lipColor) {
          const lm = polyMask(b.x, b.y, b.w, b.h, [poly('lipsOuter')], [poly('lipsInner')], Math.max(1, Math.round(fw * 0.005)));
          const [lr, lg, lb] = p.lipColor;
          for (let i = 0; i < n; i++) {
            if (!lm[i]) continue;
            const o = i * 4;
            const L = U.clamp(U.lum(d[o], d[o + 1], d[o + 2]) / 150 + 0.1, 0.25, 1.25);
            const a = (lm[i] / 255) * p.lips * 0.8;
            d[o] += (U.clamp(lr * L, 0, 255) - d[o]) * a;
            d[o + 1] += (U.clamp(lg * L, 0, 255) - d[o + 1]) * a;
            d[o + 2] += (U.clamp(lb * L, 0, 255) - d[o + 2]) * a;
          }
        }
        ctx.putImageData(img, b.x, b.y);
      }

      // деформации (после цвета)
      if (p.slim > 0) {
        const cx = (pts[234].x + pts[454].x) / 2;
        const amt = p.slim * 0.055 * fw, rad = fw * 0.24;
        for (const i of [234, 93, 132, 58, 172, 136, 150, 323, 361, 288, 397, 365, 379]) {
          const dir = Math.sign(cx - pts[i].x);
          warp(ctx, W, H, { type: 'push', x: pts[i].x, y: pts[i].y, dx: dir * amt, dy: 0, r: rad });
        }
      }
      if (p.bigEyes > 0) {
        for (const k of ['eyeL', 'eyeR']) {
          const e = poly(k);
          const cx = e.reduce((s, q) => s + q.x, 0) / e.length, cy = e.reduce((s, q) => s + q.y, 0) / e.length;
          const ew = Math.hypot(pts[k === 'eyeL' ? 263 : 33].x - pts[k === 'eyeL' ? 362 : 133].x, pts[k === 'eyeL' ? 263 : 33].y - pts[k === 'eyeL' ? 362 : 133].y);
          warp(ctx, W, H, { type: 'bulge', x: cx, y: cy, r: ew * 1.35, k: p.bigEyes * 0.45 });
        }
      }
    }
    return out;
  }

  PX.beauty = { detect, apply };
})();
