(() => {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const host = document.getElementById('game');
  const action = document.getElementById('action');
  const status = document.getElementById('status');
  const C = {
    bg: '#F3E5CF', ink: '#4A382E', brown: '#C9824B', stripe: '#A9653B',
    white: '#F5EFE4', pink: '#D98989', blue: '#6E98B5', shadow: '#DFCCAF',
    muted: '#8B7561', red: '#C9584D', yellow: '#D8B75B'
  };
  const FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const BEST_KEY = 'nekonotemokaritai.retake.best.v1';
  const COUNT_BEAT = 650;
  const ITEM_POOL = [
    { id: 'can', type: 'can', name: '空き缶', target: 0 },
    { id: 'paper', type: 'paper', name: '丸めた紙', target: 0 },
    { id: 'bottle', type: 'bottle', name: 'ペットボトル', target: 0 },
    { id: 'banana', type: 'banana', name: 'バナナの皮', target: 0 },
    { id: 'sock', type: 'sock', name: '靴下', target: 1 },
    { id: 'dress', type: 'dress', name: 'ワンピース', target: 1 },
    { id: 'shirt', type: 'shirt', name: 'Tシャツ', target: 1 },
    { id: 'pants', type: 'pants', name: 'ズボン', target: 1 },
    { id: 'ball', type: 'ball', name: 'ボール', target: 2 },
    { id: 'mouse', type: 'mouse', name: 'ねずみのおもちゃ', target: 2 },
    { id: 'yarn', type: 'yarn', name: '毛糸玉', target: 2 },
    { id: 'duck', type: 'duck', name: 'アヒルのおもちゃ', target: 2 }
  ];
  const ITEM_EMOJI = {
    can: '🥫',
    paper: '📄',
    bottle: '🧴',
    banana: '🍌',
    sock: '🧦',
    dress: '👗',
    shirt: '👕',
    pants: '👖',
    ball: '⚽',
    mouse: '🐭',
    yarn: '🧶',
    duck: '🦆'
  };
  const BIN_SLOTS = [65, 180, 295];
  const bins = [0, 1, 2].map((id) => ({ id, x: BIN_SLOTS[id], y: 115, shake: -Infinity, flash: -Infinity, cooldown: 0 }));

  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function buildRoundItems() {
    const chosen = [];
    for (let target = 0; target < 3; target++) {
      chosen.push(...shuffle(ITEM_POOL.filter(item => item.target === target)).slice(0, 2));
    }
    const positions = [];
    const fallback = [[75,235],[180,230],[285,245],[85,360],[185,350],[280,375]];
    for (let i = 0; i < 6; i++) {
      let point = null;
      for (let attempt = 0; attempt < 220; attempt++) {
        const candidate = { x: 52 + Math.random() * 256, y: 225 + Math.random() * 178 };
        const clear = positions.every(p => Math.hypot(candidate.x - p.x, candidate.y - p.y) >= 72);
        if (clear) { point = candidate; break; }
      }
      positions.push(point || { x: fallback[i][0], y: fallback[i][1] });
    }
    return shuffle(chosen).map((item, i) => ({ ...item, x: positions[i].x, y: positions[i].y, active: true }));
  }

  function shuffleBins() {
    const slots = shuffle(BIN_SLOTS);
    bins.forEach((bin, i) => { bin.x = slots[i]; });
  }
  const hand = { x: 180, y: 555, tx: 180, ty: 555, close: 0 };
  let state = 'TITLE', items = [], held = null, effects = [];
  let stateAt = 0, startedAt = 0, elapsed = 0, lastFrame = performance.now();
  let best = loadBest(), newBest = false, pointerId = null, lastCount = 0;
  let focused = false, pressed = false, hovered = false;
  let audioCtx = null;
  const keys = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      const value = Number(raw);
      return raw !== null && Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  }

  function announce(message) { status.textContent = message; }
  function ensureAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { audioCtx = null; }
  }
  function tone(freq, duration = 0.055, volume = 0.035, type = 'sine', delay = 0) {
    if (!audioCtx) return;
    const at = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(at); osc.stop(at + duration);
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function timeLabel(ms) { return (ms / 1000).toFixed(2); }

  function resize() {
    const style = getComputedStyle(document.body);
    const width = document.documentElement.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = document.body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(width / W, height / H, 1.3);
    host.style.width = `${W * scale}px`;
    host.style.height = `${H * scale}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function releasePointer() {
    const id = pointerId;
    pointerId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function start() {
    if (state !== 'TITLE' && state !== 'RESULT') return;
    releasePointer();
    keys.clear();
    ensureAudio();
    items = buildRoundItems();
    shuffleBins();
    tone(440, 0.05, 0.025);
    held = null;
    effects = [];
    elapsed = 0;
    newBest = false;
    Object.assign(hand, { x: 180, y: 555, tx: 180, ty: 555, close: 0 });
    bins.forEach(bin => Object.assign(bin, { shake: -Infinity, flash: -Infinity, cooldown: 0 }));
    state = 'COUNTDOWN';
    stateAt = performance.now();
    lastCount = 0;
    action.hidden = true;
    pressed = false;
    canvas.focus({ preventScroll: true });
  }

  function finish(now) {
    elapsed = now - startedAt;
    state = 'CLEAR';
    stateAt = now;
    releasePointer();
    keys.clear();
    const stored = loadBest();
    if (stored !== null && (best === null || stored < best)) best = stored;
    newBest = best === null || elapsed < best;
    tone(660, 0.07, 0.03, 'triangle');
    tone(880, 0.08, 0.03, 'triangle', 0.08);
    tone(1180, 0.12, 0.025, 'sine', 0.16);
    if (newBest) {
      best = elapsed;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* Play still works when storage is blocked. */ }
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    hand.tx = clamp((event.clientX - rect.left) * W / rect.width, 45, 315);
    hand.ty = clamp((event.clientY - rect.top) * H / rect.height - 60, 170, 570);
  }

  canvas.addEventListener('pointerdown', event => {
    if (state !== 'PLAYING' || pointerId !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    pointerPosition(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (state !== 'PLAYING' || event.pointerId !== pointerId) return;
    event.preventDefault();
    pointerPosition(event);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(eventName, event => {
      if (event.pointerId === pointerId) releasePointer();
    });
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (state === 'PLAYING') keys.add(event.key);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', () => { keys.clear(); releasePointer(); pressed = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { keys.clear(); releasePointer(); }
  });
  action.addEventListener('click', start);
  action.addEventListener('focus', () => { focused = true; });
  action.addEventListener('blur', () => { focused = false; pressed = false; });
  action.addEventListener('pointerenter', () => { hovered = true; });
  action.addEventListener('pointerleave', () => { hovered = false; pressed = false; });
  action.addEventListener('pointerdown', () => { pressed = true; });
  window.addEventListener('pointerup', () => { pressed = false; });
  action.addEventListener('pointercancel', () => { pressed = false; });
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);

  function heldPosition(now) {
    const p = clamp((now - held.caughtAt) / 100, 0, 1);
    const ease = 1 - (1 - p) ** 3;
    return { x: held.fromX + (hand.x - held.fromX) * ease, y: held.fromY + (hand.y - held.fromY) * ease };
  }

  function collisions(now) {
    if (!held) {
      const item = items.find(item => item.active && Math.abs(item.x - hand.x) <= 19 && Math.abs(item.y - hand.y) <= 20);
      if (item) {
        held = { item, caughtAt: now, fromX: item.x, fromY: item.y };
        tone(560, 0.045, 0.024, 'triangle');
        announce(`${item.name}をつかみました。`);
      }
      return;
    }
    const pos = heldPosition(now);
    // The generous entrance extends down to y=185, within the hands' y>=170 reach.
    const bin = bins.find(bin => Math.abs(pos.x - bin.x) <= 40 && pos.y >= 78 && pos.y <= 185);
    if (!bin) return;
    if (bin.id !== held.item.target) {
      if (now >= bin.cooldown) {
        bin.shake = now;
        bin.cooldown = now + 750;
        tone(165, 0.07, 0.025, 'square');
        announce('ここではないみたい。別の箱へ運びましょう。');
      }
      return;
    }
    const item = held.item;
    item.active = false;
    effects.push({ kind: 'put', item, x: pos.x, y: pos.y, toX: bin.x, toY: 116, at: now });
    tone(760, 0.05, 0.03, 'triangle');
    tone(1040, 0.06, 0.02, 'sine', 0.045);
    bin.flash = now;
    held = null;
    announce(`${item.name}を片付けました。`);
    if (items.every(item => !item.active)) finish(now);
  }

  function update(now, dt) {
    if (state === 'COUNTDOWN') {
      const count = 3 - Math.floor((now - stateAt) / COUNT_BEAT);
      if (count <= 0) {
        state = 'PLAYING';
        startedAt = now; // This is also the frame where 1 disappears and input becomes available.
        announce('スタート。6個の物を片付けましょう。');
      } else if (count !== lastCount) { lastCount = count; announce(String(count)); }
    }
    if (state === 'PLAYING') {
      elapsed = now - startedAt;
      let dx = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      let dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        hand.tx = clamp(hand.tx + dx / length * dt * 0.32, 45, 315);
        hand.ty = clamp(hand.ty + dy / length * dt * 0.32, 170, 570);
      }
      const follow = 1 - Math.exp(-dt / 42);
      dx = (hand.tx - hand.x) * follow;
      dy = (hand.ty - hand.y) * follow;
      // Sweep in small steps so a fast drag cannot skip a 38px pickup zone.
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
      for (let step = 0; step < steps && state === 'PLAYING'; step++) {
        hand.x += dx / steps;
        hand.y += dy / steps;
        collisions(now);
      }
    }
    hand.close += ((held ? 6 : 0) - hand.close) * (1 - Math.exp(-dt / 35));
    effects = effects.filter(effect => now - effect.at < 520);
    // RETAKE: leave a little celebration beat after the final item.
    if (state === 'CLEAR' && now - stateAt >= 1000) {
      state = 'RESULT';
      action.textContent = 'もう一回';
      action.setAttribute('aria-label', 'もう一回');
      action.hidden = false;
      action.focus({ preventScroll: true });
      announce(`${timeLabel(elapsed)}秒。ベスト${timeLabel(best)}秒。${newBest ? 'ベストタイム更新。' : ''}もう一回で再挑戦できます。`);
    }
  }

  // Drawing helpers: every visible element is a Canvas path or text.
  function path(draw, fill, stroke = C.ink, width = 2.5) {
    ctx.beginPath(); draw();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function roundRect(x, y, w, h, r, fill, stroke = C.ink, width = 2.5) {
    path(() => ctx.roundRect(x, y, w, h, r), fill, stroke, width);
  }
  function ellipse(x, y, rx, ry, fill, stroke = null, width = 2.5) {
    path(() => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), fill, stroke, width);
  }
  function line(points, color = C.ink, width = 2) {
    path(() => { ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); }, null, color, width);
  }
  function text(value, x, y, size, color = C.ink, weight = 700, font = FONT) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }
  function desk() {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    line([[0, 192], [360, 192]], '#E9D8BD', 1.3);
    line([[0, 433], [360, 433]], '#E9D8BD', 1.3);
    line([[29, 202], [56, 202]], '#E9D8BD', 1.3);
    line([[291, 443], [325, 443]], '#E9D8BD', 1.3);
    roundRect(0, 627, W, 13, 0, '#EAD7B9', null);
    line([[0, 627], [360, 627]], '#D8BF9E', 1.5);
  }

  function drawBin(bin, now) {
    const age = now - bin.shake;
    const shake = age < 320 && !reducedMotion.matches ? Math.sin(age / 320 * Math.PI * 6) * 3 * (1 - age / 320) : 0;
    ctx.save(); ctx.translate(bin.x + shake, bin.y);
    ellipse(0, 37, 38, 7, C.shadow);
    const flashAge = now - bin.flash;
    if (flashAge < 320) {
      ctx.globalAlpha = 1 - flashAge / 320;
      line([[-44, -9], [-49, -13]], C.stripe, 2.5);
      line([[44, -9], [49, -13]], C.stripe, 2.5);
      line([[0, -42], [0, -47]], C.stripe, 2.5);
      ctx.globalAlpha = 1;
    }
    if (bin.id === 0) {
      path(() => { ctx.moveTo(-31, -23); ctx.lineTo(-26, 31); ctx.quadraticCurveTo(0, 38, 26, 31); ctx.lineTo(31, -23); ctx.closePath(); }, '#7C8585');
      ellipse(0, -23, 35, 8, '#A6AAA2', C.ink);
      ellipse(0, -23, 25, 3, '#5D6564');
      line([[-22, -10], [-19, 23]], '#A6AAA2', 2);
      line([[22, -10], [19, 23]], '#646E6C', 2);
      roundRect(-9, -3, 18, 23, 3, null, C.white, 2);
      line([[-13, -6], [13, -6]], C.white, 2.5);
      line([[-4, -7], [-4, -11], [4, -11], [4, -7]], C.white, 2);
      line([[-3, 3], [-3, 13]], C.white, 1.6);
      line([[3, 3], [3, 13]], C.white, 1.6);
    } else if (bin.id === 1) {
      roundRect(-23, -34, 46, 24, 9, null, C.blue, 4);
      path(() => { ctx.moveTo(-35, -21); ctx.lineTo(-29, 31); ctx.quadraticCurveTo(0, 37, 29, 31); ctx.lineTo(35, -21); ctx.closePath(); }, '#E9DFC9');
      for (const x of [-23, 23]) for (const y of [-6, 5, 16]) roundRect(x - 3, y, 6, 4, 2, C.blue, null);
      roundRect(-37, -25, 74, 9, 4, C.blue);
      path(() => { ctx.moveTo(-7, -8); ctx.lineTo(-17, -2); ctx.lineTo(-12, 7); ctx.lineTo(-7, 4); ctx.lineTo(-7, 23); ctx.lineTo(8, 23); ctx.lineTo(8, 4); ctx.lineTo(13, 7); ctx.lineTo(18, -2); ctx.lineTo(8, -8); ctx.quadraticCurveTo(0, 1, -7, -8); ctx.closePath(); }, C.white, C.blue, 2);
    } else {
      roundRect(-34, -25, 68, 13, 5, '#A9653B');
      ellipse(-13, -21, 10, 11, C.yellow, C.ink, 2);
      path(() => { ctx.moveTo(2, -21); ctx.lineTo(9, -36); ctx.lineTo(24, -29); ctx.lineTo(18, -15); ctx.closePath(); }, C.blue, C.ink, 2);
      roundRect(-35, -18, 70, 51, 6, '#C99058');
      roundRect(-37, -23, 74, 9, 3, '#DBAA76');
      line([[-25, 25], [25, 25]], '#AD7343', 2);
      ellipse(0, 6, 13, 13, C.yellow, C.ink, 2);
      path(() => { ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, 6, 10, 14); }, null, C.ink, 1.8);
      path(() => { ctx.moveTo(9, -3); ctx.quadraticCurveTo(-1, 4, -8, 16); }, null, C.ink, 1.8);
    }
    const binLabel = bin.id === 0 ? 'ゴミ' : bin.id === 1 ? 'せんたく' : 'おもちゃ';
    text(binLabel, 0, 52, 11, C.muted, 800);
    ctx.restore();
  }

  function drawItem(type, x, y, scale = 1, shadow = true) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const emoji = ITEM_EMOJI[type] || '❓';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '44px "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(emoji, 0, 0);

    ctx.restore();
  }

  function onePaw(x, y, mirror) {
    ctx.save(); ctx.translate(x, y); ctx.scale(mirror, 1);
    // Draw the same bent foreleg twice, mirroring the second one exactly.
    path(() => {
      ctx.moveTo(-24, H - y + 8); ctx.lineTo(-24, 20);
      ctx.bezierCurveTo(-29, 7, -27, -17, -17, -27);
      ctx.bezierCurveTo(-13, -35, -4, -37, 1, -31);
      ctx.bezierCurveTo(7, -37, 16, -30, 16, -24);
      ctx.bezierCurveTo(26, -25, 30, -13, 24, -6);
      ctx.bezierCurveTo(36, 0, 27, 19, 17, 22);
      ctx.quadraticCurveTo(13, 30, 14, 48); ctx.lineTo(18, H - y + 8); ctx.closePath();
    }, C.brown);
    path(() => {
      ctx.moveTo(-24, 10); ctx.bezierCurveTo(-31, -5, -22, -27, -17, -27);
      ctx.bezierCurveTo(-13, -35, -4, -37, 1, -31);
      ctx.bezierCurveTo(7, -37, 16, -30, 16, -24);
      ctx.bezierCurveTo(26, -25, 30, -13, 24, -6);
      ctx.bezierCurveTo(36, 0, 27, 19, 17, 22);
      ctx.lineTo(10, 31); ctx.quadraticCurveTo(0, 22, -5, 29);
      ctx.quadraticCurveTo(-13, 22, -24, 26); ctx.closePath();
    }, C.white, null);
    path(() => { ctx.moveTo(-23, 46); ctx.quadraticCurveTo(-12, 43, -6, 49); ctx.quadraticCurveTo(-15, 54, -23, 54); }, C.stripe, null);
    path(() => { ctx.moveTo(-23, 66); ctx.quadraticCurveTo(-13, 62, -4, 69); ctx.quadraticCurveTo(-13, 73, -23, 73); }, C.stripe, null);
    line([[1, -30], [0, -20]], C.ink, 1.8);
    line([[16, -23], [12, -15]], C.ink, 1.8);
    ellipse(20, 4, 5, 8, C.pink);
    ellipse(19, -9, 3, 3.5, C.pink);
    ctx.restore();
  }

  function paws() {
    onePaw(hand.x - 35 + hand.close, hand.y, 1);
    onePaw(hand.x + 35 - hand.close, hand.y, -1);
  }

  function pawMark() {
    ctx.save(); ctx.translate(180, 205); ctx.rotate(-0.13);
    ellipse(0, 5, 12, 10, C.brown);
    for (const [x, y, r] of [[-14, -7, 5], [-5, -14, 5.5], [7, -13, 5.5], [16, -4, 4.5]]) ellipse(x, y, r, r + 1, C.brown);
    ctx.restore();
  }

  function button(label) {
    const offset = pressed ? 3 : 0;
    roundRect(80, 363, 200, 62, 20, '#BBA080', null);
    roundRect(80, 358 + offset, 200, 62, 20, hovered ? '#D58E55' : C.brown, C.ink, 2.5);
    text(label, 180, 389 + offset, 19, C.white);
    if (focused && action.matches(':focus-visible')) roundRect(74, 352, 212, 74, 25, null, C.ink, 2);
  }

  function draw(now) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    desk();
    if (state === 'TITLE') {
      pawMark();
      text('RETAKE #001', 180, 225, 12, C.stripe, 800, MONO);
      text('猫の手も借りたい', 180, 266, 30);
      text('毎回ちがう部屋を、猫の手でお片付け。', 180, 309, 12, C.muted, 500);
      button('スタート');
      paws();
      return;
    }
    if (state === 'RESULT') {
      // Results use the same resting hands and uncluttered desk as the title.
      const savedX = hand.x, savedY = hand.y;
      hand.x = 180; hand.y = 555; paws(); hand.x = savedX; hand.y = savedY;
      if (newBest) {
        line([[107, 219], [99, 216]], C.stripe, 2);
        line([[253, 219], [261, 216]], C.stripe, 2);
        text('NEW BEST!', 180, 218, 14, C.stripe, 700, MONO);
      }
      const result = timeLabel(elapsed);
      const size = result.length > 6 ? 37 : 48;
      ctx.font = `700 ${size}px ${MONO}`;
      const numberWidth = ctx.measureText(result).width;
      const total = numberWidth + 27;
      text(result, 180 - 13.5, 271, size, C.ink, 700, MONO);
      text('秒', 180 + total / 2 - 9, 282, 17);
      text(`BEST ${timeLabel(best)}秒`, 180, 319, 14, C.muted, 500);
      button('もう一回');
      return;
    }
    bins.forEach(bin => drawBin(bin, now));
    // Forelegs sit behind desk objects; the held item is always on top.
    paws();
    items.forEach(item => {
      if (item.active && item !== held?.item) drawItem(item.type, item.x, item.y);
    });
    if (held) {
      const pos = heldPosition(now);
      drawItem(held.item.type, pos.x, pos.y - 5, 1.12, false);
    }
    effects.forEach(effect => {
      const age = now - effect.at;
      if (effect.kind === 'put') {
        const p = clamp(age / 220, 0, 1);
        ctx.globalAlpha = 1 - p;
        drawItem(effect.item.type, effect.x + (effect.toX - effect.x) * p, effect.y + (effect.toY - effect.y) * p, 1.12 - p * 0.72, false);
        ctx.globalAlpha = 1;
        const sparkleP = clamp(age / 500, 0, 1);
        ctx.save();
        ctx.globalAlpha = 1 - sparkleP;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          const r = 12 + sparkleP * 28;
          ellipse(effect.toX + Math.cos(a) * r, effect.toY + Math.sin(a) * r, 2.6, 2.6, i % 2 ? C.yellow : C.white);
        }
        ctx.restore();
      }
    });
    text(timeLabel(elapsed), 180, 39, 29, C.ink, 600, MONO);
    if (state === 'CLEAR') {
      const p = clamp((now - stateAt) / 800, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 4) * (1 - Math.max(0, (p - 0.7) / 0.3) * 0.35);
      roundRect(72, 252, 216, 72, 18, C.white, C.ink, 2.5);
      text('おかたづけ完了！', 180, 279, 19, C.stripe);
      text('ぴかぴか！', 180, 305, 13, C.muted, 600);
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI * 0.2;
        const r = 70 + Math.sin(i * 2.1) * 12;
        ellipse(180 + Math.cos(a) * r, 285 + Math.sin(a) * r * 0.55, 2.5, 2.5, i % 2 ? C.yellow : C.white);
      }
      ctx.restore();
    }
    if (state === 'COUNTDOWN') {
      ctx.fillStyle = 'rgba(243,229,207,0.56)'; ctx.fillRect(0, 66, W, 441);
      const phase = ((now - stateAt) % COUNT_BEAT) / COUNT_BEAT;
      const scale = reducedMotion.matches ? 1 : 1 + 0.12 * Math.max(0, 1 - phase * 4);
      ctx.save(); ctx.translate(180, 310); ctx.scale(scale, scale);
      ellipse(0, 3, 48, 48, C.shadow);
      ellipse(0, -2, 48, 48, C.white, C.ink, 2.5);
      text(String(lastCount || 3), 0, -1, 48, C.ink, 700, MONO);
      ctx.restore();
    }
  }

  function frame(now) {
    const dt = Math.min(Math.max(0, now - lastFrame), 50);
    lastFrame = now;
    update(now, dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
