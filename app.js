(() => {
  const U = PX.U, { Renderer, FILTERS, KEYS } = PX.GL;
  const $ = (s) => document.querySelector(s);

  const ADJ = [
    ['exposure', 'Экспозиция', -100, 100], ['brightness', 'Яркость', -100, 100], ['contrast', 'Контраст', -100, 100],
    ['saturation', 'Насыщенность', -100, 100], ['vibrance', 'Живость', -100, 100], ['warmth', 'Тепло', -100, 100],
    ['tint', 'Оттенок', -100, 100], ['highlights', 'Света', -100, 100], ['shadows', 'Тени', -100, 100],
    ['fade', 'Выцветание', 0, 100], ['sharpen', 'Резкость', 0, 100], ['vignette', 'Виньетка', -100, 100], ['grain', 'Зерно', 0, 100],
  ];
  const TABS = [['crop', '✂️', 'Обрезка'], ['filters', '🎨', 'Фильтры'], ['adjust', '🎚', 'Настройка'], ['retouch', '💄', 'Ретушь'], ['ai', '✨', 'AI'],
    ['effects', '🪄', 'Эффекты'], ['text', '🔤', 'Текст'], ['stickers', '😀', 'Стикеры'], ['draw', '✏️', 'Рисунок'], ['frame', '🖼', 'Рамки']];
  const RATIOS = [['Свободно', 0], ['Исходное', -1], ['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['9:16', 0.5625], ['16:9', 16 / 9], ['3:2', 1.5], ['2:3', 2 / 3]];
  const COLORS = ['#ffffff', '#000000', '#ff3b5c', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff9f0a', '#25f4ee', '#ff6ec7'];
  const FONTS = [['Обычный', '-apple-system, Helvetica, Arial, sans-serif'], ['Serif', 'Georgia, serif'], ['Impact', 'Impact, Haettenschweiler, sans-serif'], ['Моно', '"Courier New", monospace'],
    ['Рукопись', '"Snell Roundhand", cursive'], ['Marker', '"Marker Felt", fantasy'], ['Chalk', 'Chalkduster, fantasy']];
  const EMOJI = '😀 😂 🥹 😍 🥰 😎 🤩 😭 😡 🥳 😴 🤔 🙈 👍 👎 👏 🙌 🙏 💪 ✌️ 🤞 👀 💋 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💖 ✨ ⭐ 🌟 💫 🔥 💥 💯 ✅ ❌ ❗ ❓ 🎉 🎊 🎈 🎁 🎂 🍕 🍔 🍟 🍩 🍦 ☕ 🍷 🍺 🌸 🌹 🌻 🌈 ☀️ 🌙 ⚡ ❄️ 🌊 🍀 🐶 🐱 🐼 🦊 🦄 🦋 🐝 🐾 🚗 ✈️ 🏖 🏝 🎵 🎶 🎧 📸 🎬 👑 💎 🕶 🎀 🚀 🛸 👻 💀 🤖 👽 🎃'.split(' ');
  const LIPS = [['Нюд', '#c98a7a'], ['Роза', '#e0607e'], ['Красная', '#c8102e'], ['Коралл', '#ff6f61'], ['Вишня', '#8b1a3a'], ['Фиолет', '#9b3d7a']];
  const BP = [['smooth', 'Гладкая кожа'], ['whiten', 'Осветлить кожу'], ['slim', 'Овал лица'], ['bigEyes', 'Размер глаз'], ['eyes', 'Блеск глаз'], ['teeth', 'Белые зубы'], ['lips', 'Помада']];
  const BGFILL = [['#ffffff'], ['#000000'], ['#ff4d6d'], ['#4dabf7'], ['#51cf66'], ['#ffd43b'], ['#ff9a9e', '#fad0c4'], ['#a18cd1', '#fbc2eb'], ['#0f2027', '#2c5364']];

  const S = {
    base: null, shown: null, temp: null, hasAlpha: false,
    adj: {}, filter: { id: 'none', k: 1 }, overlays: [], sel: null,
    hist: [], hi: -1, tab: 'filters', pend: null, compare: false,
    faces: null, facesFor: null, bp: {}, lip: 0, adjKey: 'exposure',
    eff: { id: 'sketch', s: 0.6, duo: 0 }, frame: { type: 'white', pct: 0.04, color: '#ffffff' },
    brush: { mode: 'pen', color: '#ff3b5c', size: 0.012 }, text: { color: '#ffffff' },
    ai: { mode: null, brush: 0.04 }, erase: [], cr: null, cratio: 0, dispScale: 1, mask: null,
  };

  const glc = $('#gl'), ov = $('#ov'), octx = ov.getContext('2d'), wrap = $('#wrap'), stage = $('#stage'), panel = $('#panel'), cropEl = $('#crop');
  let R, TR = null;

  /* ---------- служебное ---------- */
  let toastT;
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms); }
  function busy(on, text) { $('#busy').hidden = !on; if (text) $('#busyt').textContent = text; }
  async function task(text, fn) {
    busy(true, text); await U.nextFrame();
    try { return await fn(); }
    catch (e) { console.error(e); toast('Ошибка: ' + (e && e.message ? e.message : e), 4500); }
    finally { busy(false); }
  }

  /* ---------- рендер ---------- */
  function scaleP(p, k) { const o = {}; for (const key of KEYS) if (p[key] != null) o[key] = p[key] * k; o.shTint = p.shTint; o.hiTint = p.hiTint; return o; }
  function finalParams() {
    const f = FILTERS.find((x) => x.id === S.filter.id);
    const fp = f ? scaleP(f.p, S.filter.k) : {};
    const out = {};
    for (const k of KEYS) out[k] = (S.adj[k] || 0) + (fp[k] || 0);
    out.shTint = fp.shTint; out.hiTint = fp.hiTint;
    return out;
  }
  function show(img) {
    if (S.shown !== img) { R.setImage(img); S.shown = img; fitStage(); }
  }
  function fitStage() {
    const img = S.shown; if (!img) return;
    const aw = stage.clientWidth - 16, ah = stage.clientHeight - 16;
    const s = Math.min(aw / img.width, ah / img.height);
    wrap.style.width = Math.max(10, img.width * s) + 'px';
    wrap.style.height = Math.max(10, img.height * s) + 'px';
    S.dispScale = (img.width * s) / img.width;
    syncCrop();
  }
  function render() {
    if (!S.base) return;
    const img = S.compare || !S.temp ? S.base : S.temp;
    show(img);
    R.render(S.compare ? {} : finalParams());
    if (ov.width !== img.width || ov.height !== img.height) { ov.width = img.width; ov.height = img.height; }
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!S.temp && !S.compare) {
      drawOverlays(octx, ov.width, ov.height, true);
      if (S.ai.mode === 'erase' && S.tab === 'ai') drawErase(octx);
    }
    ov.style.pointerEvents = ['text', 'stickers', 'draw'].includes(S.tab) || (S.tab === 'ai' && S.ai.mode === 'erase') ? 'auto' : 'none';
    syncCrop();
  }

  function setBase(c, alpha) {
    S.base = c; if (alpha != null) S.hasAlpha = alpha;
    S.temp = null; S.pend = null; S.mask = null;
    show(c); render();
  }

  /* ---------- оверлеи (текст, стикеры, рисунок) ---------- */
  function drawOverlays(ctx, W, H, ui) {
    for (const o of S.overlays) {
      if (o.type === 'stroke') drawStroke(ctx, o);
      else drawObj(ctx, o, ui && o === S.sel);
    }
  }
  function drawStroke(ctx, o) {
    const pts = o.pts; if (!pts.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
    let w = o.size;
    if (o.mode === 'marker') { ctx.globalAlpha = 0.45; w *= 1.8; }
    if (o.mode === 'neon') { ctx.shadowColor = o.color; ctx.shadowBlur = o.size * 1.6; }
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) { ctx.arc(pts[0].x, pts[0].y, w / 2, 0, 7); ctx.fill(); }
    else {
      for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.stroke();
      if (o.mode === 'neon') { ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.35; ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawErase(ctx) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(254,44,85,.55)'; ctx.fillStyle = 'rgba(254,44,85,.55)';
    for (const s of S.erase) {
      ctx.lineWidth = s.size; ctx.beginPath(); ctx.moveTo(s.pts[0].x, s.pts[0].y);
      if (s.pts.length === 1) { ctx.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, 7); ctx.fill(); }
      else { for (const p of s.pts) ctx.lineTo(p.x, p.y); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawObj(ctx, o, sel) {
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot); ctx.scale(o.scale, o.scale);
    if (o.type === 'text') {
      ctx.font = `${o.bold ? '700' : '400'} ${o.size}px ${FONTS[o.font][1]}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = (o.text || ' ').split('\n'), lh = o.size * 1.2;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      o._w = w + o.size * 0.4; o._h = lh * lines.length + o.size * 0.2;
      const light = U.lum(...U.hex2rgb(o.color)) > 140;
      if (o.bg) { ctx.fillStyle = light ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.roundRect(-o._w / 2, -o._h / 2, o._w, o._h, o.size * 0.25); ctx.fill(); }
      lines.forEach((l, i) => {
        const y = (i - (lines.length - 1) / 2) * lh;
        if (o.outline) { ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = o.size * 0.16; ctx.strokeStyle = light ? '#000' : '#fff'; ctx.strokeText(l, 0, y); ctx.restore(); }
        if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = o.size * 0.12; ctx.shadowOffsetY = o.size * 0.04; }
        ctx.fillStyle = o.color; ctx.fillText(l, 0, y); ctx.shadowColor = 'transparent';
      });
    } else {
      ctx.font = `${o.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.emoji, 0, 0);
      o._w = o._h = o.size * 1.2;
    }
    if (sel) {
      const k = 1 / (S.dispScale * o.scale);
      ctx.strokeStyle = '#25f4ee'; ctx.lineWidth = 2 * k; ctx.setLineDash([8 * k, 6 * k]);
      ctx.strokeRect(-o._w / 2 - 6 * k, -o._h / 2 - 6 * k, o._w + 12 * k, o._h + 12 * k);
    }
    ctx.restore();
  }
  function hitTest(px, py) {
    for (let i = S.overlays.length - 1; i >= 0; i--) {
      const o = S.overlays[i]; if (o.type === 'stroke') continue;
      const dx = px - o.x, dy = py - o.y, c = Math.cos(-o.rot), s = Math.sin(-o.rot);
      const lx = (dx * c - dy * s) / o.scale, ly = (dx * s + dy * c) / o.scale;
      const pad = 14 / (S.dispScale * o.scale);
      if (Math.abs(lx) <= (o._w || 60) / 2 + pad && Math.abs(ly) <= (o._h || 60) / 2 + pad) return o;
    }
    return null;
  }

  /* ---------- история ---------- */
  function snap() { return { base: S.base, alpha: S.hasAlpha, adj: { ...S.adj }, filter: { ...S.filter }, ov: JSON.stringify(S.overlays) }; }
  function commit() {
    S.hist.length = S.hi + 1; S.hist.push(snap()); if (S.hist.length > 14) S.hist.shift();
    S.hi = S.hist.length - 1; updHist();
  }
  function restore(i) {
    const s = S.hist[i]; if (!s) return;
    S.hi = i; S.adj = { ...s.adj }; S.filter = { ...s.filter }; S.overlays = JSON.parse(s.ov); S.sel = null; S.hasAlpha = s.alpha;
    S.pend = null; S.temp = null; S.erase = [];
    S.base = s.base; render(); renderPanel(); updHist();
  }
  function updHist() { $('#b-undo').disabled = S.hi <= 0; $('#b-redo').disabled = S.hi >= S.hist.length - 1; }

  function mapOv(f, { rot = 0, scale = 1, flip = false } = {}) {
    for (const o of S.overlays) {
      if (o.type === 'stroke') { o.pts = o.pts.map((p) => { const q = f(p.x, p.y); return { x: q[0], y: q[1] }; }); o.size *= scale; }
      else { const q = f(o.x, o.y); o.x = q[0]; o.y = q[1]; o.rot = (flip ? -o.rot : o.rot) + rot; o.scale *= scale; }
    }
  }

  /* ---------- превью-механизм ---------- */
  let smallC = null, smallFor = null, prevT;
  function smallBase() { if (smallFor !== S.base) { smallC = U.fit(S.base, 1024); smallFor = S.base; } return smallC; }
  function preview(fn, after) {
    S.pend = { fn, after }; showPend();
    clearTimeout(prevT);
    prevT = setTimeout(() => { if (!S.pend) return; try { S.temp = S.pend.fn(smallBase()); render(); } catch (e) { console.error(e); toast('Ошибка: ' + e.message); } }, 40);
  }
  function showPend() {
    const slot = $('#pendslot'); if (!slot) return;
    slot.innerHTML = S.pend ? `<div class="pendbar"><button data-act="pend-no">Отмена</button><button class="pri" data-act="pend-ok">Применить</button></div>` : pendDefault();
  }
  function pendDefault() { return S.tab === 'crop' ? `<div class="pendbar"><button class="pri" data-act="crop-apply">Применить обрезку</button></div>` : ''; }
  function cancelPend() { clearTimeout(prevT); S.pend = null; if (S.temp) { S.temp = null; render(); } }
  async function pendOk() {
    const p = S.pend; if (!p) return;
    clearTimeout(prevT);
    await task('Применяю…', () => {
      const r = p.fn(S.base);
      if (p.after) p.after(r); else { setBase(r); commit(); }
    });
    S.pend = null; S.temp = null; render(); renderPanel();
  }

  /* ---------- панели ---------- */
  const sl = (label, key, min, max, val, extra = '') => `<label class="sl"><span>${label}</span><input type="range" data-in="${key}" min="${min}" max="${max}" value="${val}" ${extra}><b>${Math.round(val)}</b></label>`;
  const swatches = (list, cur, act) => `<div class="scroll">${list.map((c) => `<button class="sw ${c === cur ? 'on' : ''}" style="background:${c}" data-act="${act}" data-v="${c}"></button>`).join('')}</div>`;

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([id, ic, nm]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}"><i>${ic}</i>${nm}</button>`).join('');
  }
  function renderPanel() {
    const fn = PANELS[S.tab]; panel.innerHTML = fn ? fn() : ''; showPend();
    if (S.tab === 'filters') buildThumbsAsync();
    renderTabs();
  }

  const PANELS = {
    crop() {
      return `<div class="scroll">${RATIOS.map(([n, v]) => `<button class="chip ${S.cratio === v ? 'on' : ''}" data-act="ratio" data-v="${v}">${n}</button>`).join('')}</div>
      <div class="scroll"><button class="chip" data-act="rot-l">⟲ Влево</button><button class="chip" data-act="rot-r">⟳ Вправо</button><button class="chip" data-act="flip-h">⇋ Зеркало</button><button class="chip" data-act="flip-v">⇅ Зеркало</button></div>
      <div class="pp">${sl('Выпрямить', 'straight', -30, 30, 0)}</div><div id="pendslot"></div>`;
    },
    filters() {
      const f = FILTERS.find((x) => x.id === S.filter.id);
      return `<div class="scroll" id="thumbs">${FILTERS.map((f, i) => `<button class="thumb ${S.filter.id === f.id ? 'on' : ''}" data-act="filter" data-v="${f.id}"><canvas width="1" height="1" data-i="${i}"></canvas>${f.name}</button>`).join('')}</div>
      <div class="pp">${f && f.id !== 'none' ? sl('Интенсивность', 'fk', 0, 100, S.filter.k * 100) : '<p class="note">Выберите фильтр</p>'}</div>`;
    },
    adjust() {
      const a = ADJ.find((x) => x[0] === S.adjKey);
      return `<div class="scroll">${ADJ.map(([k, n]) => `<button class="chip ${S.adjKey === k ? 'on' : ''} ${S.adj[k] ? 'dot' : ''}" data-act="adjkey" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="pp">${sl(a[1], 'adj', a[2], a[3], (S.adj[a[0]] || 0) * 100)}
      <div class="row"><button class="chip" data-act="autoenh">✨ Авто</button><button class="chip" data-act="adjreset">Сбросить всё</button></div></div>`;
    },
    retouch() {
      if (S.facesBusy) return `<p class="note pp">Ищу лица…</p>`;
      if (S.faceErr) return `<p class="note pp">Не удалось загрузить модель лица: ${S.faceErr}<br>Нужен интернет при первом запуске (модель ~4 МБ + библиотека). Дальше работает офлайн.</p><div class="pp"><button class="chip" data-act="retry-faces">Повторить</button></div>`;
      if (S.facesFor !== S.base) return `<div class="pp"><p class="note">Нажмите, чтобы найти лица на фото. При первом запуске скачается модель (~10 МБ).</p><button class="chip on" data-act="retry-faces">Найти лица</button></div>`;
      if (!S.faces || !S.faces.length) return `<p class="note pp">Лицо не найдено. Попробуйте фото, где лицо видно крупнее и спереди.</p>`;
      return `<div class="pp"><p class="note">Найдено лиц: ${S.faces.length}</p>${BP.map(([k, n]) => sl(n, 'bp:' + k, 0, 100, (S.bp[k] || 0) * 100)).join('')}
      ${swatches(LIPS.map((l) => l[1]), LIPS[S.lip][1], 'lipcol')}</div><div id="pendslot"></div>`;
    },
    ai() {
      if (S.ai.mode === 'erase') return `<div class="pp"><p class="note">Закрасьте пальцем то, что нужно убрать (лишний человек, провод, пятно). Лучше работает на небольших объектах и ровном фоне.</p>
        ${sl('Размер кисти', 'ebrush', 1, 15, S.ai.brush * 100)}
        <div class="pendbar" style="padding:0"><button data-act="erase-off">Назад</button><button data-act="erase-clear">Сбросить</button><button class="pri" data-act="erase-do">Стереть</button></div></div>`;
      if (S.ai.mode === 'bg') return `<div class="pp"><p class="note">Фон заменяется на выбранный. Работает для людей на фото.</p></div>
        <div class="scroll"><button class="chip" data-act="bg" data-v="transparent">Прозрачный</button><button class="chip" data-act="bg" data-v="blur">Размыть фон</button>
        ${BGFILL.map((c, i) => `<button class="sw" style="background:${c.length > 1 ? `linear-gradient(135deg,${c[0]},${c[1]})` : c[0]}" data-act="bg" data-v="fill${i}"></button>`).join('')}</div>
        <div class="pendbar"><button data-act="bg-off">Назад</button></div>`;
      return `<div class="scroll" style="padding-top:6px">
        <button class="tool" data-act="autoenh"><i>🪄</i><b>Автоулучшение</b><small>Свет, контраст, цвет</small></button>
        <button class="tool" data-act="bg-on"><i>🧑‍🎤</i><b>Фон</b><small>Удалить, заменить, размыть</small></button>
        <button class="tool" data-act="erase-on"><i>🧽</i><b>Ластик</b><small>Убрать объект</small></button>
        <button class="tool" data-act="upscale"><i>🔍</i><b>Качество ×2</b><small>Увеличить и добавить чёткости</small></button></div>
        <p class="note pp">Все модели работают на устройстве. При первом использовании «Фона» скачается модель (~1 МБ).</p>`;
    },
    effects() {
      const e = PX.effects.list.find((x) => x.id === S.eff.id);
      return `<div class="scroll">${PX.effects.list.map((x) => `<button class="chip ${S.eff.id === x.id && S.pend ? 'on' : ''}" data-act="eff" data-v="${x.id}">${x.icon} ${x.name}</button>`).join('')}</div>
      <div class="pp">${sl('Сила', 'effs', 0, 100, S.eff.s * 100)}
      ${e.opt === 'duo' ? `<div class="scroll" style="padding:0">${PX.effects.DUO.map((d, i) => `<button class="sw ${S.eff.duo === i ? 'on' : ''}" style="background:linear-gradient(135deg,${d[0]},${d[1]})" data-act="duo" data-v="${i}"></button>`).join('')}</div>` : ''}</div><div id="pendslot"></div>`;
    },
    text() {
      const o = S.sel && S.sel.type === 'text' ? S.sel : null;
      if (!o) return `<div class="pp"><button class="chip on" data-act="add-text">＋ Добавить текст</button><p class="note">Коснитесь текста на фото, чтобы выбрать его. Двумя пальцами — масштаб и поворот.</p></div>`;
      return `<div class="pp"><textarea id="txt" data-in="txt">${o.text}</textarea></div>
      <div class="scroll">${FONTS.map((f, i) => `<button class="chip ${o.font === i ? 'on' : ''}" style="font-family:${f[1]}" data-act="font" data-v="${i}">${f[0]}</button>`).join('')}</div>
      <div class="scroll"><button class="chip ${o.bold ? 'on' : ''}" data-act="tg" data-v="bold">Жирный</button><button class="chip ${o.outline ? 'on' : ''}" data-act="tg" data-v="outline">Контур</button><button class="chip ${o.shadow ? 'on' : ''}" data-act="tg" data-v="shadow">Тень</button><button class="chip ${o.bg ? 'on' : ''}" data-act="tg" data-v="bg">Плашка</button><button class="chip" data-act="add-text">＋ Ещё</button><button class="chip" data-act="del">🗑 Удалить</button></div>
      ${swatches(COLORS, o.color, 'tcolor')}<div class="pp">${sl('Размер', 'tsize', 10, 300, o.scale * 100)}</div>`;
    },
    stickers() {
      const o = S.sel && S.sel.type === 'sticker' ? S.sel : null;
      return `<div class="emo">${EMOJI.map((e) => `<button data-act="emoji" data-v="${e}">${e}</button>`).join('')}</div>
      ${o ? `<div class="pp">${sl('Размер', 'tsize', 10, 400, o.scale * 100)}<button class="chip" data-act="del">🗑 Удалить стикер</button></div>` : '<p class="note pp">Выберите стикер. Двигайте пальцем, двумя пальцами — размер и поворот.</p>'}`;
    },
    draw() {
      return `<div class="scroll">${[['pen', 'Ручка'], ['marker', 'Маркер'], ['neon', 'Неон']].map(([k, n]) => `<button class="chip ${S.brush.mode === k ? 'on' : ''}" data-act="bmode" data-v="${k}">${n}</button>`).join('')}<button class="chip" data-act="stroke-undo">↶ Штрих</button></div>
      ${swatches(COLORS.concat(['#8e8e93']), S.brush.color, 'bcolor')}<div class="pp">${sl('Толщина', 'bsize', 1, 40, S.brush.size * 1000)}</div>`;
    },
    frame() {
      const T = [['none', 'Нет'], ['white', 'Белая'], ['black', 'Чёрная'], ['polaroid', 'Полароид'], ['round', 'Скругление'], ['color', 'Цвет']];
      return `<div class="scroll">${T.map(([k, n]) => `<button class="chip ${S.frame.type === k ? 'on' : ''}" data-act="ftype" data-v="${k}">${n}</button>`).join('')}</div>
      ${S.frame.type === 'color' ? swatches(COLORS, S.frame.color, 'fcolor') : ''}<div class="pp">${sl('Ширина', 'fpct', 1, 15, S.frame.pct * 100)}</div><div id="pendslot"></div>`;
    },
  };

  /* ---------- миниатюры фильтров ---------- */
  let thumbs = null, thumbsFor = null;
  function buildThumbsAsync() {
    setTimeout(() => {
      if (S.tab !== 'filters') return;
      if (thumbsFor !== S.base) {
        const sq = U.canvas(136, 136), m = Math.min(S.base.width, S.base.height);
        sq.getContext('2d').drawImage(S.base, (S.base.width - m) / 2, (S.base.height - m) / 2, m, m, 0, 0, 136, 136);
        if (!TR) TR = new Renderer(U.canvas(136, 136));
        TR.setImage(sq);
        thumbs = FILTERS.map((f) => { TR.render(scaleP(f.p, 1)); const c = U.canvas(136, 136); c.getContext('2d').drawImage(TR.c, 0, 0); return c; });
        thumbsFor = S.base;
      }
      document.querySelectorAll('#thumbs canvas').forEach((cv) => { const t = thumbs[+cv.dataset.i]; cv.width = 136; cv.height = 136; cv.getContext('2d').drawImage(t, 0, 0); });
    }, 0);
  }

  /* ---------- вкладки ---------- */
  function setTab(t) {
    if (S.tab === t && panel.innerHTML) return;
    cancelPend(); S.ai.mode = null; S.erase = [];
    if (S.tab === 'text' || S.tab === 'stickers') S.sel = null;
    S.tab = t;
    if (t === 'crop') initCrop();
    renderPanel(); render();
    if (t === 'retouch') ensureFaces();
  }

  /* ---------- обрезка ---------- */
  function initCrop() { S.cr = { x: 0, y: 0, w: S.base.width, h: S.base.height }; S.cratio = 0; }
  function syncCrop() {
    const on = S.tab === 'crop' && !S.temp && S.base && S.cr;
    cropEl.hidden = !on; if (!on) return;
    const W = S.base.width, H = S.base.height;
    cropEl.style.left = (S.cr.x / W) * 100 + '%'; cropEl.style.top = (S.cr.y / H) * 100 + '%';
    cropEl.style.width = (S.cr.w / W) * 100 + '%'; cropEl.style.height = (S.cr.h / H) * 100 + '%';
  }
  function setRatio(v) {
    const W = S.base.width, H = S.base.height;
    if (v === -1) v = W / H;
    S.cratio = v;
    if (v > 0) {
      let w, h; if (W / H > v) { h = H; w = H * v; } else { w = W; h = W / v; }
      S.cr = { x: (W - w) / 2, y: (H - h) / 2, w, h };
    } else S.cr = { x: 0, y: 0, w: W, h: H };
    syncCrop();
  }
  let cd = null;
  cropEl.addEventListener('pointerdown', (e) => { cd = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, r: { ...S.cr } }; try { cropEl.setPointerCapture(e.pointerId); } catch (err) {} e.preventDefault(); });
  cropEl.addEventListener('pointermove', (e) => {
    if (!cd) return;
    const k = S.base.width / wrap.getBoundingClientRect().width, dx = (e.clientX - cd.x) * k, dy = (e.clientY - cd.y) * k;
    const W = S.base.width, H = S.base.height;
    let { x, y, w, h } = cd.r;
    if (cd.h === 'move') { x = U.clamp(x + dx, 0, W - w); y = U.clamp(y + dy, 0, H - h); }
    else {
      let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
      if (cd.h.includes('l')) x0 = U.clamp(x + dx, 0, x1 - 40); else x1 = U.clamp(x1 + dx, x0 + 40, W);
      if (cd.h.includes('t')) y0 = U.clamp(y + dy, 0, y1 - 40); else y1 = U.clamp(y1 + dy, y0 + 40, H);
      if (S.cratio > 0) {
        let nw = x1 - x0, nh = y1 - y0;
        if (nw / nh > S.cratio) nw = nh * S.cratio; else nh = nw / S.cratio;
        if (cd.h.includes('l')) x0 = x1 - nw; else x1 = x0 + nw;
        if (cd.h.includes('t')) y0 = y1 - nh; else y1 = y0 + nh;
      }
      x = x0; y = y0; w = x1 - x0; h = y1 - y0;
    }
    S.cr = { x, y, w, h }; syncCrop();
  });
  const endCrop = () => { cd = null; };
  cropEl.addEventListener('pointerup', endCrop); cropEl.addEventListener('pointercancel', endCrop);

  function geoCommit(canvas, f, opt) { mapOv(f, opt); setBase(canvas); commit(); initCrop(); renderPanel(); }
  function straighten(c, deg) {
    const t = (deg * Math.PI) / 180, w = c.width, h = c.height;
    const s = Math.cos(Math.abs(t)) + Math.sin(Math.abs(t)) * Math.max(w / h, h / w);
    const o = U.canvas(w, h), x = o.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.translate(w / 2, h / 2); x.rotate(t); x.scale(s, s); x.drawImage(c, -w / 2, -h / 2); return o;
  }
  function rotate90(c, cw) {
    const o = U.canvas(c.height, c.width), x = o.getContext('2d');
    x.translate(o.width / 2, o.height / 2); x.rotate(cw ? Math.PI / 2 : -Math.PI / 2); x.drawImage(c, -c.width / 2, -c.height / 2); return o;
  }
  function flipC(c, h) {
    const o = U.canvas(c.width, c.height), x = o.getContext('2d');
    if (h) { x.translate(c.width, 0); x.scale(-1, 1); } else { x.translate(0, c.height); x.scale(1, -1); }
    x.drawImage(c, 0, 0); return o;
  }

  /* ---------- лицо ---------- */
  async function ensureFaces() {
    if (S.facesFor === S.base || S.facesBusy) return;
    S.facesBusy = true; S.faceErr = null; renderPanel();
    busy(true, 'Загружаю модель лица (первый раз ~10 МБ)…');
    try { S.faces = await PX.beauty.detect(S.base); S.facesFor = S.base; }
    catch (e) { console.error(e); S.faceErr = e.message || String(e); }
    finally { S.facesBusy = false; busy(false); renderPanel(); }
  }
  function retouchPreview() {
    const bp = { ...S.bp, lipColor: U.hex2rgb(LIPS[S.lip][1]) }, faces = S.faces, base = S.base;
    preview((c) => PX.beauty.apply(c, faces, bp), (r) => { setBase(r); S.faces = faces; S.facesFor = r; S.bp = {}; commit(); });
  }

  /* ---------- AI ---------- */
  async function getMask() {
    if (S.mask && S.mask.f === S.base) return S.mask.m;
    busy(true, 'Загружаю модель (первый раз ~1 МБ)…');
    const m = await PX.ai.personMask(S.base);
    S.mask = { f: S.base, m }; return m;
  }
  async function doBg(v) {
    await task('Обрабатываю фон…', async () => {
      const m = await getMask();
      busy(true, 'Заменяю фон…'); await U.nextFrame();
      let r;
      if (v === 'transparent') r = PX.ai.applyBackground(S.base, m, 'transparent');
      else if (v === 'blur') r = PX.ai.applyBackground(S.base, m, 'blur');
      else r = PX.ai.applyBackground(S.base, m, 'color', (() => { const c = BGFILL[+v.slice(4)]; return c.length > 1 ? c : c[0]; })());
      const keep = S.mask; setBase(r.canvas, r.alpha); S.mask = null; commit();
      if (v === 'transparent') toast('Фон прозрачный. Сохраняйте в PNG.');
    });
    renderPanel();
  }
  async function doErase() {
    if (!S.erase.length) return toast('Сначала закрасьте объект');
    await task('Стираю…', () => {
      const m = U.canvas(S.base.width, S.base.height), x = m.getContext('2d');
      x.strokeStyle = x.fillStyle = '#fff'; x.lineCap = x.lineJoin = 'round';
      for (const s of S.erase) { x.lineWidth = s.size; x.beginPath(); x.moveTo(s.pts[0].x, s.pts[0].y); if (s.pts.length === 1) { x.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, 7); x.fill(); } else { for (const p of s.pts) x.lineTo(p.x, p.y); x.stroke(); } }
      const r = PX.ai.inpaint(S.base, m); S.erase = []; setBase(r); commit();
    });
    renderPanel();
  }

  /* ---------- события панели ---------- */
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const v = b.dataset.v;
    switch (b.dataset.act) {
      case 'pend-ok': return pendOk();
      case 'pend-no': cancelPend(); S.bp = {}; return renderPanel();
      case 'ratio': setRatio(+v); return renderPanel();
      case 'rot-l': case 'rot-r': { const cw = b.dataset.act === 'rot-r', W = S.base.width, H = S.base.height;
        return geoCommit(rotate90(S.base, cw), cw ? (x, y) => [H - y, x] : (x, y) => [y, W - x], { rot: cw ? Math.PI / 2 : -Math.PI / 2 }); }
      case 'flip-h': { const W = S.base.width; return geoCommit(flipC(S.base, true), (x, y) => [W - x, y], { flip: true }); }
      case 'flip-v': { const H = S.base.height; return geoCommit(flipC(S.base, false), (x, y) => [x, H - y], { flip: true }); }
      case 'crop-apply': { const c = S.cr; if (!c) return; const r = U.crop(S.base, c.x, c.y, c.w, c.h), ox = Math.round(c.x), oy = Math.round(c.y);
        return geoCommit(r, (x, y) => [x - ox, y - oy]); }
      case 'filter': S.filter = { id: v, k: 1 }; commit(); renderPanel(); return render();
      case 'adjkey': S.adjKey = v; return renderPanel();
      case 'autoenh': S.adj = PX.ai.autoEnhance(S.base); commit(); render(); toast('Улучшено автоматически'); return renderPanel();
      case 'adjreset': S.adj = {}; commit(); render(); return renderPanel();
      case 'retry-faces': S.facesFor = null; return ensureFaces();
      case 'lipcol': S.lip = LIPS.findIndex((l) => l[1] === v); if (!S.bp.lips) S.bp.lips = 0.6; renderPanel(); return retouchPreview();
      case 'bg-on': S.ai.mode = 'bg'; return renderPanel();
      case 'bg-off': S.ai.mode = null; return renderPanel();
      case 'bg': return doBg(v);
      case 'erase-on': S.ai.mode = 'erase'; S.erase = []; renderPanel(); return render();
      case 'erase-off': S.ai.mode = null; S.erase = []; renderPanel(); return render();
      case 'erase-clear': S.erase = []; return render();
      case 'erase-do': return doErase();
      case 'upscale': return task('Увеличиваю…', () => { const r = PX.ai.upscale(S.base); if (!r) return toast('Фото уже достаточно большое (макс. 3072 px)'); setBase(r); commit(); toast(`Новый размер: ${r.width}×${r.height}`); });
      case 'eff': S.eff.id = v; renderPanel(); return effPreview();
      case 'duo': S.eff.duo = +v; renderPanel(); return effPreview();
      case 'add-text': { const o = { type: 'text', text: 'Текст', x: S.base.width / 2, y: S.base.height / 2, size: S.base.width * 0.09, color: S.text.color, font: 0, bold: true, outline: false, shadow: true, bg: false, rot: 0, scale: 1 }; S.overlays.push(o); S.sel = o; commit(); render(); renderPanel(); return; }
      case 'font': S.sel.font = +v; commit(); render(); return renderPanel();
      case 'tg': S.sel[v] = !S.sel[v]; commit(); render(); return renderPanel();
      case 'tcolor': S.sel.color = v; S.text.color = v; commit(); render(); return renderPanel();
      case 'emoji': { const o = { type: 'sticker', emoji: v, x: S.base.width / 2, y: S.base.height / 2, size: Math.min(S.base.width, S.base.height) * 0.22, rot: 0, scale: 1 }; S.overlays.push(o); S.sel = o; commit(); render(); return renderPanel(); }
      case 'del': S.overlays = S.overlays.filter((o) => o !== S.sel); S.sel = null; commit(); render(); return renderPanel();
      case 'bmode': S.brush.mode = v; return renderPanel();
      case 'bcolor': S.brush.color = v; return renderPanel();
      case 'stroke-undo': { for (let i = S.overlays.length - 1; i >= 0; i--) if (S.overlays[i].type === 'stroke') { S.overlays.splice(i, 1); break; } commit(); return render(); }
      case 'ftype': S.frame.type = v; renderPanel(); return framePreview();
      case 'fcolor': S.frame.color = v; renderPanel(); return framePreview();
    }
  });
  function effPreview() {
    const e = PX.effects.list.find((x) => x.id === S.eff.id), s = S.eff.s, duo = S.eff.duo;
    preview((c) => e.fn(c, s, { duo }));
  }
  function framePreview() {
    if (S.frame.type === 'none') { cancelPend(); return showPend(); }
    const { type, pct, color } = S.frame;
    preview((c) => PX.effects.frame(c, type, pct, color), (r) => {
      mapOv((x, y) => [x + r._ox, y + r._oy]); setBase(r, S.hasAlpha || type === 'round'); commit();
    });
  }

  panel.addEventListener('input', (e) => {
    const t = e.target, k = t.dataset.in; if (!k) return;
    const v = +t.value, out = t.parentElement && t.parentElement.querySelector('b');
    if (out) out.textContent = Math.round(v) + (k === 'straight' ? '°' : '');
    if (k === 'adj') { S.adj[S.adjKey] = v / 100; render(); }
    else if (k === 'fk') { S.filter.k = v / 100; render(); }
    else if (k === 'straight') {
      if (!v) return cancelPend();
      const deg = v, tt = (deg * Math.PI) / 180, w0 = S.base.width, h0 = S.base.height, s = Math.cos(Math.abs(tt)) + Math.sin(Math.abs(tt)) * Math.max(w0 / h0, h0 / w0);
      preview((c) => straighten(c, deg), (r) => {
        const cx = w0 / 2, cy = h0 / 2, cs = Math.cos(tt), sn = Math.sin(tt);
        mapOv((x, y) => { const dx = x - cx, dy = y - cy; return [cx + s * (dx * cs - dy * sn), cy + s * (dx * sn + dy * cs)]; }, { rot: tt, scale: s });
        setBase(r); commit(); initCrop();
      });
    }
    else if (k.startsWith('bp:')) { S.bp[k.slice(3)] = v / 100; if (k === 'bp:lips' && !v) delete S.bp.lips; retouchPreview(); }
    else if (k === 'effs') { S.eff.s = v / 100; effPreview(); }
    else if (k === 'txt') { S.sel.text = t.value; render(); }
    else if (k === 'tsize') { S.sel.scale = v / 100; render(); }
    else if (k === 'bsize') S.brush.size = v / 1000;
    else if (k === 'ebrush') S.ai.brush = v / 100;
    else if (k === 'fpct') { S.frame.pct = v / 100; framePreview(); }
  });
  panel.addEventListener('change', (e) => { const k = e.target.dataset.in; if (['adj', 'fk', 'txt', 'tsize'].includes(k)) commit(); });

  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  /* ---------- жесты на холсте ---------- */
  const ptrs = new Map(); let gest = null, curStroke = null;
  const toImg = (e) => { const r = ov.getBoundingClientRect(); return { x: ((e.clientX - r.left) * ov.width) / r.width, y: ((e.clientY - r.top) * ov.height) / r.height }; };
  ov.addEventListener('pointerdown', (e) => {
    try { ov.setPointerCapture(e.pointerId); } catch (err) {}
    const p = toImg(e); ptrs.set(e.pointerId, p);
    if (S.tab === 'draw') {
      curStroke = { type: 'stroke', pts: [p], color: S.brush.color, size: S.brush.size * Math.max(ov.width, ov.height) * 0.5, mode: S.brush.mode };
      S.overlays.push(curStroke); render(); return;
    }
    if (S.tab === 'ai' && S.ai.mode === 'erase') {
      curStroke = { pts: [p], size: S.ai.brush * Math.max(ov.width, ov.height) * 0.5 }; S.erase.push(curStroke); render(); return;
    }
    if (ptrs.size === 1) {
      const o = hitTest(p.x, p.y);
      if (o !== S.sel) { S.sel = o; renderPanel(); }
      render();
      gest = o ? { type: 'move', o, dx: o.x - p.x, dy: o.y - p.y, changed: false } : null;
    } else if (ptrs.size === 2 && S.sel) {
      const [a, b] = [...ptrs.values()];
      gest = { type: 'pinch', o: S.sel, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), s0: S.sel.scale, r0: S.sel.rot, changed: false };
    }
  });
  ov.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = toImg(e); ptrs.set(e.pointerId, p);
    if (curStroke) { curStroke.pts.push(p); render(); return; }
    if (!gest) return;
    if (gest.type === 'move' && ptrs.size === 1) { gest.o.x = p.x + gest.dx; gest.o.y = p.y + gest.dy; gest.changed = true; render(); }
    else if (gest.type === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      gest.o.scale = U.clamp(gest.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / gest.d0), 0.1, 8);
      gest.o.rot = gest.r0 + (Math.atan2(b.y - a.y, b.x - a.x) - gest.a0); gest.changed = true; render();
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (curStroke) { curStroke = null; if (S.tab === 'draw') commit(); return; }
    if (gest && gest.changed) { commit(); if (S.sel) { /* обновить ползунок размера */ const s = panel.querySelector('[data-in=tsize]'); if (s) { s.value = S.sel.scale * 100; s.parentElement.querySelector('b').textContent = Math.round(S.sel.scale * 100); } } }
    if (ptrs.size === 0) gest = null;
    else if (gest && gest.type === 'pinch') { gest = null; }
  };
  ov.addEventListener('pointerup', up); ov.addEventListener('pointercancel', up);

  /* ---------- верхняя панель ---------- */
  $('#b-undo').onclick = () => { cancelPend(); if (S.hi > 0) restore(S.hi - 1); };
  $('#b-redo').onclick = () => { cancelPend(); if (S.hi < S.hist.length - 1) restore(S.hi + 1); };
  const cmp = $('#b-cmp');
  const cmpOn = (e) => { e.preventDefault(); S.compare = true; render(); }, cmpOff = () => { if (S.compare) { S.compare = false; render(); } };
  cmp.addEventListener('pointerdown', cmpOn); cmp.addEventListener('pointerup', cmpOff); cmp.addEventListener('pointerleave', cmpOff); cmp.addEventListener('pointercancel', cmpOff);
  $('#b-close').onclick = () => { if (S.hist.length > 1 && !confirm('Закрыть? Несохранённые изменения пропадут.')) return; closeEditor(); };

  /* ---------- экспорт ---------- */
  const M = { fmt: 'jpeg', q: 0.92, url: null, blob: null };
  function flatten(fmt) {
    cancelPend();
    show(S.base); R.render(finalParams());
    const w = S.base.width, h = S.base.height, o = U.canvas(w, h), x = o.getContext('2d');
    if (fmt === 'jpeg' || !S.hasAlpha) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
    x.drawImage(glc, 0, 0); drawOverlays(x, w, h, false);
    render();
    return o;
  }
  async function makeBlob() {
    const c = flatten(M.fmt);
    const blob = await new Promise((r) => c.toBlob(r, 'image/' + M.fmt, M.q));
    if (M.url) URL.revokeObjectURL(M.url);
    M.blob = blob; M.url = URL.createObjectURL(blob);
    $('#m-img').src = M.url;
    $('#m-info').textContent = `${c.width}×${c.height}, ${(blob.size / 1048576).toFixed(2)} МБ`;
  }
  $('#b-save').onclick = async () => { $('#modal').classList.remove('hidden'); await task('Готовлю файл…', makeBlob); };
  $('#m-close').onclick = () => $('#modal').classList.add('hidden');
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
  document.querySelectorAll('[data-fmt]').forEach((b) => (b.onclick = async () => {
    M.fmt = b.dataset.fmt; document.querySelectorAll('[data-fmt]').forEach((x) => x.classList.toggle('on', x === b));
    $('#m-qwrap').style.display = M.fmt === 'png' ? 'none' : ''; await makeBlob();
  }));
  let qT; $('#m-q').oninput = (e) => { $('#m-qv').textContent = e.target.value; M.q = e.target.value / 100; clearTimeout(qT); qT = setTimeout(makeBlob, 250); };
  $('#m-share').onclick = async () => {
    if (!M.blob) return;
    const name = `pixa-${Date.now()}.${M.fmt === 'png' ? 'png' : 'jpg'}`;
    const file = new File([M.blob], name, { type: M.blob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = M.url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('Файл скачан. Если не появился, зажмите картинку и сохраните.');
  };

  /* ---------- открытие/закрытие ---------- */
  function openEditor(canvas, tab) {
    $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
    if (!R) R = new Renderer(glc);
    S.shown = null; S.adj = {}; S.filter = { id: 'none', k: 1 }; S.overlays = []; S.sel = null; S.hist = []; S.hi = -1; S.bp = {}; S.faces = null; S.facesFor = null;
    S.erase = []; S.ai.mode = null; S.hasAlpha = false; S.cr = null; thumbsFor = null; smallFor = null;
    S.base = canvas; S.tab = tab || 'filters';
    requestAnimationFrame(() => {
      show(canvas); if (S.tab === 'crop') initCrop(); render(); renderPanel(); fitStage();
      commit();
      if (S.tab === 'retouch') ensureFaces();
    });
  }
  function closeEditor() { $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden'); S.base = null; S.shown = null; S.hist = []; }
  new ResizeObserver(() => fitStage()).observe(stage);
  window.addEventListener('resize', fitStage);

  /* ---------- главный экран ---------- */
  let startTab = 'filters';
  document.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => { startTab = b.dataset.start; $('#f-one').click(); }));
  $('#f-one').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    await task('Открываю фото…', async () => openEditor(await U.loadFile(f), startTab));
  };
  $('#card-collage').onclick = () => { const inp = $('#f-many'); inp.onchange = async () => {
    const fs = Array.from(inp.files || []); inp.value = ''; if (!fs.length) return;
    await task('Готовлю коллаж…', async () => {
      await PX.collage.open(fs, (c) => openEditor(c, 'filters'));
    });
  }; inp.click(); };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.PXApp = { S, openEditor };
})();
