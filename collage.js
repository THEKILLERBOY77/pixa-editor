// Коллаж: 2–9 фото, шаблоны, отступы, скругление, фон. Тап по двум ячейкам меняет фото местами.
(function () {
  const U = PX.U;
  const $ = (s) => document.querySelector(s);

  function grid(rows, cols) { const o = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) o.push([c / cols, r / rows, 1 / cols, 1 / rows]); return o; }
  function layoutsFor(n) {
    const t = 1 / 3;
    const L = {
      1: [[[0, 0, 1, 1]]],
      2: [[[0, 0, .5, 1], [.5, 0, .5, 1]], [[0, 0, 1, .5], [0, .5, 1, .5]], [[0, 0, .65, 1], [.65, 0, .35, 1]], [[0, 0, 1, .65], [0, .65, 1, .35]]],
      3: [[[0, 0, .5, 1], [.5, 0, .5, .5], [.5, .5, .5, .5]], [[0, 0, 1, .5], [0, .5, .5, .5], [.5, .5, .5, .5]], grid(1, 3), grid(3, 1), [[0, 0, .5, .5], [.5, 0, .5, 1], [0, .5, .5, .5]]],
      4: [grid(2, 2), [[0, 0, 1, .6], [0, .6, t, .4], [t, .6, t, .4], [2 * t, .6, t, .4]], [[0, 0, .6, 1], [.6, 0, .4, t], [.6, t, .4, t], [.6, 2 * t, .4, t]], grid(1, 4), grid(4, 1)],
      5: [[[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, t, .5], [t, .5, t, .5], [2 * t, .5, t, .5]], [[0, 0, t, .5], [t, 0, t, .5], [2 * t, 0, t, .5], [0, .5, .5, .5], [.5, .5, .5, .5]], [[0, 0, .5, 1], [.5, 0, .25, .5], [.75, 0, .25, .5], [.5, .5, .25, .5], [.75, .5, .25, .5]]],
      6: [grid(2, 3), grid(3, 2), [[0, 0, .5, .5], [.5, 0, .25, .25], [.75, 0, .25, .25], [.5, .25, .25, .25], [.75, .25, .25, .25], [0, .5, 1, .5]]],
    };
    if (L[n]) return L[n];
    const c = Math.ceil(Math.sqrt(n)), r = Math.ceil(n / c);
    return [grid(r, c).slice(0, n)];
  }
  const RATIOS = [['1:1', 1], ['4:5', 0.8], ['9:16', 0.5625], ['3:2', 1.5]];
  const BGS = ['#ffffff', '#000000', '#f5e6d3', '#ffd6e0', '#cdeac0', '#bde0fe', '#222222'];

  const C = { imgs: [], li: 0, gap: 0.012, rad: 0, bg: '#ffffff', ratio: 1, sel: -1, onDone: null };

  function size(max) { return C.ratio >= 1 ? [max, Math.round(max / C.ratio)] : [Math.round(max * C.ratio), max]; }

  function draw(cv, max, selHighlight) {
    const [W, H] = size(max);
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    const lay = layoutsFor(C.imgs.length)[C.li] || layoutsFor(C.imgs.length)[0];
    const g = C.gap * Math.min(W, H), r = C.rad * Math.min(W, H);
    cv._cells = [];
    lay.forEach((q, i) => {
      const cx = g + q[0] * (W - 2 * g) + g / 2, cy = g + q[1] * (H - 2 * g) + g / 2;
      const cw = q[2] * (W - 2 * g) - g, ch = q[3] * (H - 2 * g) - g;
      cv._cells.push([cx, cy, cw, ch]);
      const im = C.imgs[i];
      if (!im || cw < 2 || ch < 2) return;
      x.save();
      x.beginPath(); x.roundRect(cx, cy, cw, ch, Math.min(r, cw / 2, ch / 2)); x.clip();
      const s = Math.max(cw / im.width, ch / im.height);
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, cx + (cw - im.width * s) / 2, cy + (ch - im.height * s) / 2, im.width * s, im.height * s);
      x.restore();
      if (selHighlight && C.sel === i) { x.strokeStyle = '#25f4ee'; x.lineWidth = Math.max(4, W / 100); x.strokeRect(cx, cy, cw, ch); }
    });
  }

  function drawIcon(cv, lay) {
    cv.width = 48; cv.height = 48;
    const x = cv.getContext('2d'); x.fillStyle = '#8d8d96';
    lay.forEach((q) => x.fillRect(q[0] * 48 + 1.5, q[1] * 48 + 1.5, q[2] * 48 - 3, q[3] * 48 - 3));
  }

  function panel() {
    const lays = layoutsFor(C.imgs.length);
    const p = $('#cpanel');
    p.innerHTML = `
      <div class="scroll" id="c-lays">${lays.map((l, i) => `<button class="lay ${i === C.li ? 'on' : ''}" data-i="${i}"><canvas></canvas></button>`).join('')}</div>
      <div class="scroll">${RATIOS.map(([n, v]) => `<button class="chip ${v === C.ratio ? 'on' : ''}" data-r="${v}">${n}</button>`).join('')}
        <button class="chip" id="c-add">＋ Фото</button></div>
      <div class="pp">
        <label class="sl"><span>Отступ</span><input type="range" id="c-gap" min="0" max="50" value="${Math.round(C.gap * 1000)}"><b></b></label>
        <label class="sl"><span>Скругление</span><input type="range" id="c-rad" min="0" max="100" value="${Math.round(C.rad * 1000)}"><b></b></label>
      </div>
      <div class="scroll">${BGS.map((c) => `<button class="sw ${c === C.bg ? 'on' : ''}" style="background:${c}" data-bg="${c}"></button>`).join('')}</div>
      <p class="note pp">Коснитесь двух ячеек подряд, чтобы поменять фото местами.</p>`;
    p.querySelectorAll('.lay canvas').forEach((cv, i) => drawIcon(cv, lays[i]));
  }

  function redraw() { draw($('#ccv'), 1100, true); }

  function bind() {
    const p = $('#cpanel');
    p.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.i != null) { C.li = +b.dataset.i; panel(); redraw(); }
      else if (b.dataset.r) { C.ratio = +b.dataset.r; panel(); redraw(); }
      else if (b.dataset.bg) { C.bg = b.dataset.bg; panel(); redraw(); }
      else if (b.id === 'c-add') PX.collage.addMore();
    };
    p.oninput = (e) => {
      if (e.target.id === 'c-gap') C.gap = e.target.value / 1000;
      if (e.target.id === 'c-rad') C.rad = e.target.value / 1000;
      redraw();
    };
    const cv = $('#ccv');
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) * cv.width) / r.width, y = ((e.clientY - r.top) * cv.height) / r.height;
      const i = (cv._cells || []).findIndex((c) => x >= c[0] && x <= c[0] + c[2] && y >= c[1] && y <= c[1] + c[3]);
      if (i < 0 || i >= C.imgs.length) return;
      if (C.sel < 0) C.sel = i;
      else { const t = C.imgs[C.sel]; C.imgs[C.sel] = C.imgs[i]; C.imgs[i] = t; C.sel = -1; }
      redraw();
    };
    $('#c-close').onclick = () => { $('#collage').classList.add('hidden'); PX.collage.onClose && PX.collage.onClose(); };
    $('#c-done').onclick = () => {
      const out = U.canvas(10, 10); draw(out, 2600, false);
      $('#collage').classList.add('hidden');
      C.onDone && C.onDone(out);
    };
  }

  PX.collage = {
    async open(files, onDone) {
      C.onDone = onDone; C.sel = -1; C.li = 0;
      C.imgs = [];
      for (const f of Array.from(files).slice(0, 9)) C.imgs.push(await U.loadFile(f, 1800));
      if (C.imgs.length < 1) return false;
      $('#collage').classList.remove('hidden');
      bind(); panel(); redraw();
      return true;
    },
    async addMore() {
      const inp = $('#f-many');
      inp.onchange = async () => {
        const fs = Array.from(inp.files || []); inp.value = '';
        for (const f of fs) if (C.imgs.length < 9) C.imgs.push(await U.loadFile(f, 1800));
        C.li = 0; panel(); redraw();
      };
      inp.click();
    },
  };
})();
