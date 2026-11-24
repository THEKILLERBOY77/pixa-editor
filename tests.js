// Автотесты Pixa. Запуск: index.html?test (добавьте &models — проверить и нейросети, нужен интернет)
(async function () {
  const U = PX.U, $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const withModels = /[?&]models\b/.test(location.search);
  const results = [], errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message || e.reason)));
  // MediaPipe пишет служебные INFO/W-логи через console.error — это не ошибки
  const origErr = console.error; console.error = (...a) => { const m = a.map(String).join(' '); if (!/^(INFO:|[IW]\d{4} )/.test(m)) errors.push(m); origErr.apply(console, a); };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 8000, what = 'условие') {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (fn()) return; } catch (e) {} await sleep(25); }
    throw new Error('Не дождались: ' + what);
  }
  function ok(c, msg) { if (!c) throw new Error(msg || 'проверка не прошла'); }
  function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} ожидалось ≈${b}, получено ${a}`); }
  async function test(name, fn) {
    const e0 = errors.length, t0 = performance.now();
    try {
      await fn();
      if (errors.length > e0) throw new Error('Ошибки в консоли: ' + errors.slice(e0).join(' | '));
      results.push({ name, ok: true, ms: Math.round(performance.now() - t0) });
    } catch (e) { results.push({ name, ok: false, err: e.message || String(e) }); }
  }
  const px = (c, x, y) => Array.from(U.ctx(c).getImageData(x, y, 1, 1).data);
  const data = (c) => U.ctx(c).getImageData(0, 0, c.width, c.height).data;
  function img(w = 400, h = 300) {
    const c = U.canvas(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a5298'); g.addColorStop(1, '#f2994a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e0e0e0'; x.fillRect(w * 0.1, h * 0.1, w * 0.2, h * 0.2);
    return c;
  }
  function glToCanvas(r) { const c = U.canvas(r.c.width, r.c.height); c.getContext('2d').drawImage(r.c, 0, 0); return c; }
  const S = PXApp.S;
  const click = (sel) => { const el = typeof sel === 'string' ? $(sel) : sel; if (!el) throw new Error('Нет элемента ' + sel); el.click(); };
  const input = (sel, v, change) => { const el = $(sel); if (!el) throw new Error('Нет элемента ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); if (change) el.dispatchEvent(new Event('change', { bubbles: true })); };
  async function openEd(c, tab) { PXApp.openEditor(c, tab); await waitFor(() => S.hist.length === 1 && S.shown, 5000, 'открытие редактора'); }
  const idle = () => waitFor(() => $('#busy').hidden, 15000, 'окончание обработки');
  const ptr = (type, xf, yf, id) => { const ov = $('#ov'), r = ov.getBoundingClientRect(); ov.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: r.left + xf * r.width, clientY: r.top + yf * r.height, bubbles: true, isPrimary: id === 1 })); };

  /* ===== утилиты ===== */
  await test('U.fit уменьшает до 3072 и не трогает маленькие', () => {
    const big = U.canvas(4000, 2000), f = U.fit(big, 3072);
    ok(f.width === 3072 && f.height === 1536, `${f.width}x${f.height}`);
    const s = U.canvas(100, 50); ok(U.fit(s, 3072) === s, 'маленький должен вернуться как есть');
  });
  await test('U.crop даёт нужный размер и пиксели', () => {
    const c = img(), r = U.crop(c, 40, 30, 80, 60);
    ok(r.width === 80 && r.height === 60);
    const a = px(c, 50, 40), b = px(r, 10, 10); ok(a.every((v, i) => Math.abs(v - b[i]) <= 1), 'пиксели совпадают');
  });
  await test('boxBlur: однородное остаётся однородным, альфа сохраняется', () => {
    const d = new Uint8ClampedArray(50 * 40 * 4); for (let i = 0; i < d.length; i += 4) { d[i] = 100; d[i + 1] = 150; d[i + 2] = 200; d[i + 3] = 77; }
    const b = U.blur(d, 50, 40, 5);
    for (let i = 0; i < b.length; i += 4) { if (Math.abs(b[i] - 100) > 1 || Math.abs(b[i + 2] - 200) > 1 || b[i + 3] !== 77) throw new Error('пиксель ' + i / 4); }
  });
  await test('boxBlur: одиночная точка размывается с сохранением суммы', () => {
    const w = 41, h = 41, m = new Float32Array(w * h); m[20 * w + 20] = 1000;
    const b = U.boxBlur(m, w, h, 3, 1, 1); let s = 0; for (const v of b) s += v;
    near(s, 1000, 1, 'сумма'); ok(b[20 * w + 20] < 1000 && b[20 * w + 23] > 0, 'размыто');
  });
  await test('hex2rgb, rng, roundRect', () => {
    ok(U.hex2rgb('#ff8000').join() === '255,128,0'); ok(U.hex2rgb('#fff').join() === '255,255,255');
    const a = U.rng(5), b = U.rng(5); ok(a() === b() && a() === b(), 'детерминизм');
    ok(typeof CanvasRenderingContext2D.prototype.roundRect === 'function');
  });
  await test('loadFile читает файл из Blob', async () => {
    const blob = await new Promise((r) => img(320, 200).toBlob(r, 'image/png'));
    const c = await U.loadFile(new File([blob], 't.png', { type: 'image/png' }));
    ok(c.width === 320 && c.height === 200, `${c.width}x${c.height}`);
  });

  /* ===== WebGL ===== */
  const R = new PX.GL.Renderer(U.canvas(1, 1));
  await test('WebGL: без настроек картинка не меняется', () => {
    const c = img(); R.setImage(c); R.render({});
    const a = data(c), b = data(glToCanvas(R)); let mx = 0;
    for (let i = 0; i < a.length; i++) mx = Math.max(mx, Math.abs(a[i] - b[i]));
    ok(mx <= 2, 'макс. разница ' + mx);
  });
  await test('WebGL: насыщенность −100 даёт ч/б, экспозиция осветляет', () => {
    const c = img(); R.setImage(c);
    R.render({ saturation: -1 }); const g = px(glToCanvas(R), 300, 200);
    ok(Math.abs(g[0] - g[1]) <= 2 && Math.abs(g[1] - g[2]) <= 2, 'серый: ' + g);
    R.render({}); const l0 = px(glToCanvas(R), 200, 150); R.render({ exposure: 0.5 }); const l1 = px(glToCanvas(R), 200, 150);
    ok(l1[0] + l1[1] + l1[2] > l0[0] + l0[1] + l0[2] + 30, 'ярче');
  });
  await test('WebGL: все 16 фильтров рендерятся без ошибок GL', () => {
    R.setImage(img());
    for (const f of PX.GL.FILTERS) { R.render(f.p); const e = R.gl.getError(); ok(e === 0, f.id + ' gl error ' + e); }
    ok(PX.GL.FILTERS.length === 16);
  });
  await test('WebGL: прозрачность сохраняется', () => {
    const c = U.canvas(20, 20); const x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(0, 0, 10, 20);
    R.setImage(c); R.render({ fade: 0.5, brightness: 0.3 }); const o = glToCanvas(R);
    ok(px(o, 15, 10)[3] === 0, 'прозрачный остался прозрачным'); ok(px(o, 5, 10)[3] === 255);
  });

  /* ===== эффекты и рамки ===== */
  await test('Все эффекты: правильный размер, картинка меняется', () => {
    const c = img();
    for (const e of PX.effects.list) {
      const r = e.fn(c, 0.6, { duo: 1 });
      ok(r.width === c.width && r.height === c.height, e.id + ' размер');
      const a = data(c), b = data(r); let diff = 0; for (let i = 0; i < a.length; i += 40) diff += Math.abs(a[i] - b[i]);
      ok(diff > 100, e.id + ' не изменил картинку');
    }
  });
  await test('Рамки: размеры и прозрачные углы', () => {
    const c = img(400, 300), pad = Math.round(300 * 0.05);
    const w = PX.effects.frame(c, 'white', 0.05); ok(w.width === 400 + 2 * pad && w.height === 300 + 2 * pad && w._ox === pad);
    ok(px(w, 2, 2).join() === '255,255,255,255', 'белое поле');
    const p = PX.effects.frame(c, 'polaroid', 0.05); ok(p.height === 300 + 4 * pad, 'полароид снизу шире');
    const r = PX.effects.frame(c, 'round', 0.05); ok(r.width === 400 && px(r, 0, 0)[3] === 0, 'скруглённый угол прозрачный');
    const col = PX.effects.frame(c, 'color', 0.05, '#ff0000'); ok(px(col, 2, 2).slice(0, 3).join() === '255,0,0');
  });

  /* ===== AI без сети ===== */
  await test('Ластик заполняет область цветом окружения', () => {
    const c = U.canvas(300, 300), x = c.getContext('2d'); x.fillStyle = '#2060e0'; x.fillRect(0, 0, 300, 300); x.fillStyle = '#ff0000'; x.fillRect(130, 130, 40, 40);
    const m = U.canvas(300, 300), mx = m.getContext('2d'); mx.fillStyle = '#fff'; mx.fillRect(122, 122, 56, 56);
    const r = PX.ai.inpaint(c, m), p = px(r, 150, 150);
    ok(p[2] > 150 && p[0] < 90, 'центр стал синим: ' + p);
    ok(px(r, 20, 20).join() === px(c, 20, 20).join(), 'вне маски не тронуто');
  });
  await test('Ластик с пустой маской возвращает исходник', () => { const c = img(); ok(PX.ai.inpaint(c, U.canvas(c.width, c.height)) === c); });
  await test('Качество ×2: размер и предел 3072', () => {
    const r = PX.ai.upscale(img(500, 400)); ok(r.width === 1000 && r.height === 800, `${r.width}x${r.height}`);
    const r2 = PX.ai.upscale(U.canvas(2000, 1000)); ok(r2.width === 3072, 'упёрлось в 3072: ' + r2.width);
    ok(PX.ai.upscale(U.canvas(3000, 100)) === null, 'слишком большое → null');
  });
  await test('Автоулучшение: тёмное светлеет, светлое темнеет', () => {
    const d = U.canvas(100, 100), dx = d.getContext('2d'); dx.fillStyle = '#151515'; dx.fillRect(0, 0, 100, 100);
    const l = U.canvas(100, 100), lx = l.getContext('2d'); lx.fillStyle = '#f0f0f0'; lx.fillRect(0, 0, 100, 100);
    ok(PX.ai.autoEnhance(d).exposure > 0.1, 'тёмное'); ok(PX.ai.autoEnhance(l).exposure < -0.05, 'светлое');
  });
  await test('Замена фона по маске: прозрачный, цвет, размытие', () => {
    const c = img(100, 100), m = new Uint8ClampedArray(100 * 100); for (let y = 0; y < 100; y++) for (let x = 0; x < 50; x++) m[y * 100 + x] = 255;
    const t = PX.ai.applyBackground(c, m, 'transparent'); ok(t.alpha && px(t.canvas, 80, 50)[3] === 0 && px(t.canvas, 20, 50)[3] === 255);
    const f = PX.ai.applyBackground(c, m, 'color', '#00ff00'); ok(!f.alpha && px(f.canvas, 80, 50).slice(0, 3).join() === '0,255,0');
    ok(px(f.canvas, 20, 50).slice(0, 3).join() === px(c, 20, 50).slice(0, 3).join(), 'человек не тронут');
    const g = PX.ai.applyBackground(c, m, 'color', ['#000000', '#ffffff']); ok(px(g.canvas, 99, 99)[0] > 200, 'градиент');
    const b = PX.ai.applyBackground(c, m, 'blur'); ok(px(b.canvas, 10, 50).join() === px(c, 10, 50).join());
  });

  /* ===== ретушь (без сети) ===== */
  function fakeFace() {
    // 478 точек: эллипс лица + реальные индексы глаз/губ рядом с нужными местами
    const pts = Array.from({ length: 478 }, (_, i) => ({ x: 0.5 + 0.15 * Math.cos(i), y: 0.5 + 0.2 * Math.sin(i) }));
    pts[234] = { x: 0.35, y: 0.5 }; pts[454] = { x: 0.65, y: 0.5 }; pts[33] = { x: 0.4, y: 0.42 }; pts[133] = { x: 0.46, y: 0.42 }; pts[263] = { x: 0.6, y: 0.42 }; pts[362] = { x: 0.54, y: 0.42 };
    return pts;
  }
  await test('Ретушь без лиц не меняет фото', () => {
    const c = img(), r = PX.beauty.apply(c, [], { smooth: 1, teeth: 1 });
    const a = data(c), b = data(r); for (let i = 0; i < a.length; i += 97) ok(a[i] === b[i], 'пиксель ' + i);
  });
  await test('Ретушь со всеми ползунками отрабатывает и меняет фото', () => {
    const c = img(600, 600), r = PX.beauty.apply(c, [fakeFace()], { smooth: 0.8, whiten: 0.6, slim: 0.6, bigEyes: 0.6, eyes: 0.6, teeth: 0.6, lips: 0.7, lipColor: [200, 40, 80] });
    ok(r.width === 600 && r.height === 600);
    const a = data(c), b = data(r); let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]);
    ok(diff > 1000, 'изменения: ' + diff);
  });

  /* ===== коллаж ===== */
  await test('Коллаж: все раскладки 1–9 фото без перекрытий и дыр', () => {
    for (let n = 1; n <= 9; n++) for (const lay of PX.collage._layoutsFor(n)) {
      ok(lay.length === n, `n=${n} ячеек ${lay.length}`);
      let area = 0; for (const [x, y, w, h] of lay) { ok(x >= -1e-9 && y >= -1e-9 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9, 'внутри'); area += w * h; }
      if (n <= 6 || Math.ceil(Math.sqrt(n)) * Math.ceil(n / Math.ceil(Math.sqrt(n))) === n) near(area, 1, 1e-6, `n=${n} площадь`);
    }
  });
  await test('Коллаж: открыть 3 фото, поменять местами, перейти в редактор', async () => {
    const files = [];
    for (const col of ['#f00', '#0f0', '#00f']) { const c = U.canvas(300, 300), x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 300, 300); files.push(new File([await new Promise((r) => c.toBlob(r))], 'a.png', { type: 'image/png' })); }
    let out = null; await PX.collage.open(files, (c) => { out = c; });
    ok(!$('#collage').classList.contains('hidden'), 'экран коллажа виден');
    const cv = $('#ccv'), r = cv.getBoundingClientRect();
    const tap = (xf, yf) => cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + xf * r.width, clientY: r.top + yf * r.height, bubbles: true }));
    tap(0.25, 0.5); tap(0.75, 0.25); // поменять 1 и 2
    click('#c-done'); ok(out && out.width === 2600 && out.height === 2600, 'итог 2600×2600');
    const p = px(out, 400, 1300); ok(p[1] > 200 && p[0] < 50, 'слева теперь зелёное: ' + p);
  });

  /* ===== редактор: сценарии ===== */
  await test('Редактор: большое фото ограничивается 3072 px', async () => { await openEd(U.canvas(5000, 2500), 'filters'); ok(S.base.width === 3072 && S.base.height === 1536); });
  await test('Все вкладки открываются без ошибок', async () => {
    await openEd(img(800, 600), 'filters');
    for (const t of ['crop', 'filters', 'adjust', 'ai', 'effects', 'text', 'stickers', 'draw', 'frame', 'filters']) { click(`[data-tab="${t}"]`); await sleep(30); ok(S.tab === t && $('#panel').innerHTML.length > 20, t); }
  });
  await test('Фильтр и настройка попадают в итоговые параметры и историю', async () => {
    click('[data-tab="filters"]'); click('[data-act="filter"][data-v="bw"]');
    ok(PXApp.finalParams().saturation === -1);
    click('[data-tab="adjust"]'); click('[data-act="adjkey"][data-v="contrast"]');
    input('[data-in="adj"]', 40, true); near(S.adj.contrast, 0.4, 1e-9);
    near(PXApp.finalParams().contrast, 0.55, 1e-9, 'контраст = 0.4 + 0.15 от Ч/Б');
    const h = S.hi; click('#b-undo'); near(S.adj.contrast || 0, 0, 1e-9, 'undo'); click('#b-redo'); ok(S.hi === h, 'redo');
  });
  await test('Миниатюры фильтров отрисованы', async () => {
    click('[data-tab="filters"]'); await waitFor(() => $$('#thumbs canvas').every((c) => c.width === 136), 3000, 'миниатюры');
  });
  await test('Текст со спецсимволами не ломает панель, шрифты на месте', async () => {
    click('[data-tab="text"]'); click('[data-act="add-text"]');
    input('#txt', 'a</textarea><b>x</b> & "q"', true);
    click('[data-act="tg"][data-v="outline"]');
    ok($('#txt').value === 'a</textarea><b>x</b> & "q"', 'текст: ' + $('#txt').value);
    const fonts = $$('[data-act="font"]'); ok(fonts.length === 7, 'шрифтов ' + fonts.length);
    for (const f of fonts) ok(f.style.fontFamily.length > 3, 'font-family ' + f.textContent);
    click('[data-act="font"][data-v="3"]'); ok(S.sel.font === 3);
  });
  await test('Стикер: перемещение и масштаб двумя пальцами', async () => {
    click('[data-tab="stickers"]'); click('[data-act="emoji"]');
    const st = S.sel, h0 = S.hist.length, fx = st.x / S.base.width, fy = st.y / S.base.height;
    ptr('pointerdown', fx, fy, 1); ptr('pointermove', fx + 0.1, fy, 1); ptr('pointerup', fx + 0.1, fy, 1);
    near(st.x / S.base.width, fx + 0.1, 0.01, 'сдвиг');
    const nx = st.x / S.base.width;
    ptr('pointerdown', nx, fy, 1); ptr('pointerdown', nx + 0.05, fy, 2); ptr('pointermove', nx + 0.15, fy + 0.05, 2); ptr('pointerup', nx + 0.15, fy + 0.05, 2); ptr('pointerup', nx, fy, 1);
    ok(st.scale > 2, 'масштаб ' + st.scale); ok(Math.abs(st.rot) > 0.2, 'поворот ' + st.rot); ok(S.hist.length > h0, 'в истории');
  });
  await test('Рисунок: второй палец не рвёт штрих, отмена штриха', async () => {
    click('[data-tab="draw"]'); const n0 = S.overlays.filter((o) => o.type === 'stroke').length, h0 = S.hist.length;
    ptr('pointerdown', 0.2, 0.2, 1); ptr('pointermove', 0.3, 0.3, 1); ptr('pointerdown', 0.8, 0.8, 2); ptr('pointermove', 0.9, 0.9, 2); ptr('pointermove', 0.4, 0.3, 1); ptr('pointerup', 0.9, 0.9, 2); ptr('pointerup', 0.4, 0.3, 1);
    const strokes = S.overlays.filter((o) => o.type === 'stroke');
    ok(strokes.length === n0 + 1, 'штрихов ' + strokes.length); ok(strokes[strokes.length - 1].pts.length === 3, 'точек ' + strokes[strokes.length - 1].pts.length);
    ok(S.hist.length === h0 + 1);
    click('[data-act="stroke-undo"]'); ok(S.overlays.filter((o) => o.type === 'stroke').length === n0);
    const h1 = S.hist.length; click('[data-act="stroke-undo"]'); ok(S.hist.length === h1, 'пустая отмена не пишет в историю');
  });
  await test('Обрезка 1:1 сдвигает оверлеи, «Исходное» подсвечивается', async () => {
    click('[data-tab="crop"]'); click('[data-act="ratio"][data-v="-1"]');
    ok($('[data-act="ratio"][data-v="-1"]').classList.contains('on'), 'чип «Исходное» активен');
    click('[data-act="ratio"][data-v="1"]');
    const W = S.base.width, H = S.base.height, st = S.overlays.find((o) => o.type === 'sticker'), x0 = st.x;
    click('[data-act="crop-apply"]');
    ok(S.base.width === Math.min(W, H) && S.base.height === Math.min(W, H), `${S.base.width}x${S.base.height}`);
    near(st.x, x0 - (W - H) / 2, 1.5, 'стикер сдвинут');
  });
  await test('Поворот 90° меняет размеры и переносит оверлеи; undo после поворота не ломает обрезку', async () => {
    await openEd(img(800, 400), 'stickers'); click('[data-act="emoji"]'); const st = S.sel; st.x = 100; st.y = 50;
    click('[data-tab="crop"]'); click('[data-act="rot-r"]');
    ok(S.base.width === 400 && S.base.height === 800);
    const st2 = S.overlays[0]; near(st2.x, 400 - 50, 0.5); near(st2.y, 100, 0.5); near(st2.rot, Math.PI / 2, 1e-6);
    click('#b-undo'); ok(S.base.width === 800);
    ok(S.cr.x + S.cr.w <= S.base.width && S.cr.y + S.cr.h <= S.base.height, 'рамка обрезки внутри фото');
    const xb = S.overlays[0].x; click('[data-act="flip-h"]'); near(S.overlays[0].x, 800 - xb, 0.5, 'зеркало');
  });
  await test('Выпрямление: превью и применение', async () => {
    const h = S.hist.length, W = S.base.width;
    input('[data-in="straight"]', 10); await waitFor(() => S.temp, 2000, 'превью');
    click('[data-act="pend-ok"]'); await waitFor(() => !S.pend && S.hist.length === h + 1, 5000, 'применение');
    ok(S.base.width === W, 'размер тот же');
  });
  await test('Эффект: нельзя сохранить с незавершённым превью, потом применяется', async () => {
    click('[data-tab="effects"]'); ok(!$('[data-act="eff"].on'), 'при входе ничего не выбрано');
    const b0 = S.base; click('[data-act="eff"][data-v="glitch"]'); await waitFor(() => S.temp, 2000, 'превью');
    click('#b-save'); ok($('#modal').classList.contains('hidden'), 'модалка не открылась'); ok(!$('#toast').classList.contains('hidden'), 'подсказка');
    click('[data-act="pend-ok"]'); await waitFor(() => !S.pend && S.base !== b0, 5000, 'применение');
  });
  await test('Рамка «Полароид» на большом фото не превышает 3072 px', async () => {
    await openEd(U.canvas(3072, 3072), 'stickers'); click('[data-act="emoji"]'); const st = S.sel, x0 = st.x;
    click('[data-tab="frame"]'); ok(S.frame.type === 'none');
    click('[data-act="ftype"][data-v="polaroid"]'); input('[data-in="fpct"]', 10);
    await waitFor(() => S.temp, 3000, 'превью'); click('[data-act="pend-ok"]'); await waitFor(() => !S.pend && S.hist.length === 3, 8000, 'применение');
    ok(Math.max(S.base.width, S.base.height) <= 3072, `${S.base.width}x${S.base.height}`);
    const k = 3072 / (3072 + 4 * 307); near(S.overlays[0].x, (x0 + 307) * k, 3, 'стикер пересчитан'); near(S.overlays[0].scale, k, 0.01);
  });
  await test('AI: ластик через интерфейс', async () => {
    const c = U.canvas(400, 400), x = c.getContext('2d'); x.fillStyle = '#3070d0'; x.fillRect(0, 0, 400, 400); x.fillStyle = '#ff0000'; x.fillRect(190, 190, 20, 20);
    await openEd(c, 'ai'); click('[data-act="erase-on"]'); input('[data-in="ebrush"]', 15);
    ptr('pointerdown', 0.48, 0.5, 7); ptr('pointermove', 0.52, 0.5, 7); ptr('pointerup', 0.52, 0.5, 7);
    ok(S.erase.length === 1); click('[data-act="erase-do"]'); await waitFor(() => S.hist.length === 2, 8000, 'стирание'); await idle();
    const p = px(S.base, 200, 200); ok(p[0] < 120 && p[2] > 150, 'красный квадрат убран: ' + p);
  });
  await test('AI: автоулучшение и качество ×2 через интерфейс', async () => {
    click('[data-act="erase-off"]'); click('[data-act="autoenh"]'); ok(Object.keys(S.adj).length > 3);
    click('[data-act="upscale"]'); await waitFor(() => S.base.width === 800, 8000, 'апскейл'); await idle();
  });
  await test('Экспорт JPG и PNG', async () => {
    click('#b-save'); await waitFor(() => !$('#modal').classList.contains('hidden') && $('#m-img').src.startsWith('blob:'), 8000, 'jpg'); await idle();
    ok(/800×800/.test($('#m-info').textContent), $('#m-info').textContent);
    const s0 = $('#m-img').src;
    click('[data-fmt="png"]'); await waitFor(() => $('#m-img').src !== s0, 5000, 'png');
    const blob = await (await fetch($('#m-img').src)).blob(); ok(blob.type === 'image/png' && blob.size > 1000, blob.type + ' ' + blob.size);
    const s1 = $('#m-img').src; click('[data-fmt="jpeg"]'); await waitFor(() => $('#m-img').src !== s1, 5000, 'jpg'); click('#m-close');
  });
  await test('Экспорт сохраняет прозрачность в PNG и заливает белым в JPG', async () => {
    const c = U.canvas(50, 50), x = c.getContext('2d'); x.fillStyle = '#f00'; x.fillRect(0, 0, 25, 50);
    await openEd(c, 'filters'); S.hasAlpha = true;
    ok(px(PXApp.flatten('png'), 40, 25)[3] === 0, 'png прозрачный');
    ok(px(PXApp.flatten('jpeg'), 40, 25).join() === '255,255,255,255', 'jpg белый');
    ok(px(PXApp.flatten('png'), 10, 25).slice(0, 3).join() === '255,0,0', 'красная часть на месте');
  });
  await test('Офлайн: все файлы из sw.js доступны', async () => {
    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
    const list = JSON.parse(txt.match(/SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
    for (const f of list) { const r = await fetch(f, { cache: 'no-store' }); ok(r.ok, f + ' ' + r.status); }
  });

  /* ===== нейросети (нужен интернет) ===== */
  if (withModels) {
    let portrait = null;
    await test('Модели: загрузка портрета', async () => {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.src = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg'; await im.decode();
      portrait = U.canvas(im.naturalWidth, im.naturalHeight); portrait.getContext('2d').drawImage(im, 0, 0);
    });
    await test('Модели: поиск лица (MediaPipe Face Landmarker)', async () => {
      const f = await PX.beauty.detect(portrait); ok(f.length === 1 && f[0].length >= 468, 'лиц ' + f.length);
    });
    await test('Модели: маска человека (MediaPipe Selfie Segmenter)', async () => {
      const m = await PX.ai.personMask(portrait), w = portrait.width, h = portrait.height;
      ok(m[Math.round(h * 0.3) * w + Math.round(w * 0.5)] > 200, 'лицо — человек'); ok(m[5 * w + 5] < 50, 'угол — фон');
    });
    await test('Модели: ретушь через интерфейс', async () => {
      await openEd(portrait, 'retouch'); await waitFor(() => S.facesFor === S.base, 30000, 'лица'); await idle();
      input('[data-in="bp:smooth"]', 60); await waitFor(() => S.temp, 3000, 'превью');
      click('[data-act="pend-ok"]'); await waitFor(() => S.hist.length === 2, 8000, 'применение');
      ok(S.facesFor === S.base, 'лица остаются валидными после ретуши');
    });
    await test('Модели: размытие фона через интерфейс', async () => {
      click('[data-tab="ai"]'); click('[data-act="bg-on"]'); click('[data-act="bg"][data-v="blur"]');
      await waitFor(() => S.hist.length === 3, 30000, 'фон'); await idle();
    });
  }

  PXApp.closeEditor && PXApp.closeEditor();
  $('#collage').classList.add('hidden');
  const passed = results.filter((r) => r.ok).length, failed = results.length - passed;
  window.__TEST__ = { passed, failed, results };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:999;background:#0b0b0d;color:#eee;overflow:auto;padding:16px;font:13px/1.45 -apple-system,monospace;-webkit-user-select:text;user-select:text';
  box.innerHTML = `<h2 style="margin:0 0 10px;color:${failed ? '#fe2c55' : '#25f4ee'}">Тесты: ${passed} из ${results.length} прошли${failed ? `, ${failed} упали` : ''}</h2>` +
    (withModels ? '' : '<p style="color:#8d8d96">Нейросети не проверялись. Добавьте к адресу &models</p>') +
    results.map((r) => `<div style="color:${r.ok ? '#9be7c4' : '#ff8a9a'}">${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? ` <span style="color:#666">${r.ms} мс</span>` : `<br><span style="padding-left:16px">${String(r.err).replace(/</g, '&lt;')}</span>`}</div>`).join('');
  document.body.appendChild(box);
})();
