// Owl You Need Is Apples — a little pixel platformer.
(function () {
  'use strict';

  const W = 400, H = 224, TS = 16;
  const { SOLID, PLANK, ROWS } = window.TILE;

  // Physics (per 60Hz frame)
  const GRAV = 0.3, MAXFALL = 5.5, GLIDE = 1.0;
  const ACC = 0.22, AIRACC = 0.16, MAXV = 1.9;
  const JUMPV = -5.5, FLAPV = -4.0, FLAPS = 2, BOUNCEV = -8.2, STOMPV = -4.4;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const S = window.SPR;
  const FONT = '"Press Start 2P", "Courier New", monospace';

  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ Input
  const input = { left: false, right: false, up: false, down: false, jump: false };
  let jumpWasDown = false;
  let jumpLock = false; // ignore a held jump that started a menu action
  let jumpHits = 0;     // latched presses, so a tap shorter than one frame still counts

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
  };

  window.addEventListener('keydown', (e) => {
    Sound.init();
    if (e.code === 'Enter' || e.code === 'Space') {
      const btn = primaryButton();
      if (btn) { e.preventDefault(); jumpLock = true; btn.click(); return; }
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    const k = KEYS[e.code];
    if (k) {
      if (k === 'jump' && !e.repeat) jumpHits++;
      input[k] = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.code];
    if (k) input[k] = false;
  });

  // Touch devices (iPhone / iPad / Android): show on-screen controls
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');
  // iOS only lets audio start from inside a touch/click handler
  ['touchend', 'pointerup', 'click'].forEach((ev) => document.addEventListener(ev, () => Sound.init(), { passive: true }));
  // Block pinch-zoom / double-tap zoom / page bounce during play
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.overlay')) e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // Slide-able d-pad: whichever half your thumb is over is the direction
  const dpad = $('dpad');
  const dpadTouches = new Map();
  const arrowL = dpad.querySelector('.l'), arrowR = dpad.querySelector('.r');
  function dpadUpdate() {
    let l = false, r = false;
    const rect = dpad.getBoundingClientRect();
    for (const x of dpadTouches.values()) {
      if (x < rect.left + rect.width / 2) l = true; else r = true;
    }
    input.left = l; input.right = r;
    arrowL.classList.toggle('on', l);
    arrowR.classList.toggle('on', r);
  }
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sound.init();
    try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dpadTouches.set(e.pointerId, e.clientX);
    dpadUpdate();
  });
  dpad.addEventListener('pointermove', (e) => {
    if (!dpadTouches.has(e.pointerId)) return;
    dpadTouches.set(e.pointerId, e.clientX);
    dpadUpdate();
  });
  const dpadEnd = (e) => { dpadTouches.delete(e.pointerId); dpadUpdate(); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => dpad.addEventListener(ev, dpadEnd));

  // Touch buttons
  document.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.dataset.key;
    const down = (e) => { e.preventDefault(); Sound.init(); input[k] = true; if (k === 'jump') jumpHits++; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
    const up = (e) => { e.preventDefault(); input[k] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  function primaryButton() {
    const ov = document.querySelector('.overlay:not([hidden])');
    return ov ? ov.querySelector('.primary') : null;
  }

  // ------------------------------------------------------------------ State
  let state = 'title';
  let L = null;          // current level
  let levelIndex = 0;
  let score = 0, levelStartScore = 0;
  let lives = 3;
  let applesGot = 0;
  let totalDots = 0, dotsGot = 0, levelDotsStart = 0;
  let camX = 0;
  let frame = 0;
  let particles = [];
  let blooms = [];
  let toast = null;
  let intro = 0;
  let activeSign = null;
  let cut = null;        // door / ending cutscene state
  let zoom = { z: 1, fx: 0, fy: 0, blend: 0 };
  let bgCache = null;

  const player = {
    x: 0, y: 0, w: 12, h: 17, vx: 0, vy: 0, face: 1,
    onGround: false, ground: null, flaps: FLAPS, coyote: 0, jumpBuf: 0, jumpCut: false,
    invuln: 0, flapT: 0, drop: 0, anim: 0, safe: { x: 0, y: 0 }, hurtT: 0, visible: true,
    scale: 1, alpha: 1, back: false,
  };

  // ------------------------------------------------------------------ Tiles
  function tileAt(tx, ty) {
    if (tx < 0 || tx >= L.width) return SOLID;
    if (ty < 0 || ty >= ROWS) return 0;
    return L.grid[ty * L.width + tx];
  }
  function renderTile(tx, ty) {
    if (ty >= ROWS) return SOLID;
    if (tx < 0 || tx >= L.width || ty < 0) return 0;
    return L.grid[ty * L.width + tx];
  }

  function rainbowY(r, x) {
    const t = (x - r.x0) / (r.x1 - r.x0);
    return r.base - Math.sin(t * Math.PI) * r.height;
  }

  // ------------------------------------------------------------------ Level setup
  function loadLevel(i, keepScore) {
    levelIndex = i;
    L = window.buildLevel(i);
    applesGot = 0;
    lives = 3;
    if (!keepScore) score = levelStartScore;
    levelStartScore = score;
    levelDotsStart = dotsGot;
    particles = [];
    blooms = [];
    toast = null;
    cut = null;
    activeSign = null;
    zoom = { z: 1, fx: 0, fy: 0, blend: 0 };
    Object.assign(player, {
      x: L.start.x * TS + 2, y: L.start.row * TS - player.h, vx: 0, vy: 0, face: 1,
      onGround: false, ground: null, flaps: FLAPS, invuln: 0, drop: 0, hurtT: 0,
      visible: true, scale: 1, alpha: 1, back: false,
    });
    player.safe = { x: player.x, y: player.y };
    camX = clamp(player.x - W / 3, 0, L.width * TS - W);
    intro = 170;
    bgCache = buildBackground(L);
    updateHUD(true);
  }

  function totalDotCount() {
    let n = 0;
    for (let i = 0; i < window.LEVELS.length; i++) n += window.buildLevel(i).dots.length;
    return n;
  }

  // ------------------------------------------------------------------ Update
  function update() {
    frame++;
    const jumpDown = input.jump && !jumpLock;
    if (!input.jump) jumpLock = false;
    const jumpPressed = (jumpDown && !jumpWasDown) || (jumpHits > 0 && !jumpLock);
    jumpHits = 0;
    jumpWasDown = jumpDown;

    if (state !== 'play' && state !== 'door') return;

    updateMovers();
    if (state === 'play') {
      updatePlayer({ left: input.left, right: input.right, down: input.down, jump: jumpDown, jumpPressed });
    } else {
      updateCutscene();
    }
    updateEnemies();
    updateParticles();
    if (state === 'play') {
      collect();
      checkDoor();
      checkSigns();
    }
    for (const f of L.flowers) if (f.squish > 0) f.squish--;
    for (const f of L.friends) {
      const near = Math.abs(player.x - f.x - 10) < 70;
      f.cheer = near ? f.cheer + 1 : 0;
    }
    updateCamera();
    if (intro > 0) intro--;
    if (toast && --toast.t <= 0) toast = null;
  }

  function updateMovers() {
    for (const m of L.movers) {
      const k = 0.5 - 0.5 * Math.cos((frame / m.period) * Math.PI * 2);
      const nx = m.ox + m.dx * k, ny = m.oy + m.dy * k;
      m.vx = nx - m.x; m.vy = ny - m.y;
      m.x = nx; m.y = ny;
    }
  }

  function updatePlayer(inp) {
    const p = player;
    if (p.invuln > 0) p.invuln--;
    if (p.flapT > 0) p.flapT--;
    if (p.drop > 0) p.drop--;
    if (p.hurtT > 0) p.hurtT--;
    p.anim++;

    // Ride moving platforms
    if (p.ground && p.ground.period) {
      p.x += p.ground.vx;
      p.y += p.ground.vy;
    }

    // Horizontal
    const acc = p.onGround ? ACC : AIRACC;
    if (inp.left && !inp.right) { p.vx -= acc; p.face = -1; }
    else if (inp.right && !inp.left) { p.vx += acc; p.face = 1; }
    else p.vx *= p.onGround ? 0.72 : 0.94;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;
    p.vx = clamp(p.vx, -MAXV, MAXV);

    // Jumping / flapping
    if (inp.jumpPressed) p.jumpBuf = 8;
    else if (p.jumpBuf > 0) p.jumpBuf--;

    if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0)) {
      p.jumpBuf = 0;
      const onOneWay = p.ground && (p.ground === 'plank' || p.ground.period || p.ground.base !== undefined);
      if (inp.down && onOneWay) {
        p.drop = 14; p.y += 2; p.onGround = false; p.ground = null;
      } else {
        p.vy = JUMPV; p.jumpCut = false; p.coyote = 0;
        p.onGround = false; p.ground = null;
        Sound.play('jump');
        dust(p.x + p.w / 2, p.y + p.h, 4);
      }
    } else if (inp.jumpPressed && !p.onGround && p.coyote <= 0 && p.flaps > 0) {
      p.jumpBuf = 0;
      p.flaps--;
      p.vy = Math.min(p.vy, FLAPV);
      p.jumpCut = false;
      p.flapT = 14;
      Sound.play('flap');
      for (let i = 0; i < 3; i++) particles.push({ kind: 'feather', x: p.x + p.w / 2 + rand(-6, 6), y: p.y + p.h - 4, vx: rand(-0.6, 0.6), vy: rand(0.2, 0.8), life: 40, max: 40 });
    }
    if (!inp.jump && p.vy < -2 && !p.jumpCut) { p.vy *= 0.5; p.jumpCut = true; }

    // Gravity (hold jump while falling to glide)
    p.vy += GRAV;
    const gliding = inp.jump && p.vy > 0;
    p.vy = Math.min(p.vy, gliding ? GLIDE : MAXFALL);
    p.gliding = gliding;

    moveX(p, p.vx);
    const prevGround = p.ground;
    const wasOnGround = p.onGround;
    moveY(p, prevGround);

    if (p.onGround) {
      if (!wasOnGround && p.vyLanding > 3) dust(p.x + p.w / 2, p.y + p.h, 5);
      p.flaps = FLAPS;
      p.coyote = 6;
      if (p.ground === 'solid') {
        // remember a safe tile-centred spot to respawn at after a fall
        const cx = p.x + p.w / 2;
        const tx = Math.floor(cx / TS), ty = Math.floor((p.y + p.h + 1) / TS);
        if (tileAt(tx - 1, ty) === SOLID && tileAt(tx + 1, ty) === SOLID && tileAt(tx, ty - 1) !== SOLID) {
          p.safe = { x: tx * TS + 8 - p.w / 2, y: ty * TS - p.h };
        }
      }
    } else if (p.coyote > 0) p.coyote--;

    if (p.y < -60) { p.y = -60; p.vy = Math.max(p.vy, 0); }
    if (p.y > H + 24) loseLife('fall');
  }

  function moveX(p, dx) {
    p.x += dx;
    const ty0 = Math.floor(p.y / TS), ty1 = Math.floor((p.y + p.h - 0.01) / TS);
    if (dx > 0) {
      const tx = Math.floor((p.x + p.w - 0.01) / TS);
      for (let ty = ty0; ty <= ty1; ty++) if (tileAt(tx, ty) === SOLID) { p.x = tx * TS - p.w; p.vx = 0; break; }
    } else if (dx < 0) {
      const tx = Math.floor(p.x / TS);
      for (let ty = ty0; ty <= ty1; ty++) if (tileAt(tx, ty) === SOLID) { p.x = (tx + 1) * TS; p.vx = 0; break; }
    }
  }

  function moveY(p, prevGround) {
    const prevBottom = p.y + p.h;
    p.vyLanding = p.vy;
    p.y += p.vy;
    p.onGround = false;
    p.ground = null;
    const tx0 = Math.floor(p.x / TS), tx1 = Math.floor((p.x + p.w - 0.01) / TS);

    if (p.vy >= 0) {
      const bottom = p.y + p.h;
      const ty = Math.floor((bottom - 0.01) / TS);
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = tileAt(tx, ty);
        if (t === SOLID || (t === PLANK && p.drop === 0 && prevBottom <= ty * TS + 0.5)) {
          p.y = ty * TS - p.h;
          p.vy = 0;
          p.onGround = true;
          p.ground = t === SOLID ? 'solid' : 'plank';
          break;
        }
      }
      if (!p.onGround && p.drop === 0) {
        const cx = p.x + p.w / 2;
        for (const r of L.rainbows) {
          if (cx < r.x0 || cx > r.x1) continue;
          const s = rainbowY(r, cx);
          const b = p.y + p.h;
          if ((b >= s && prevBottom <= s + 6) || (prevGround === r && b < s && s - b < 8)) {
            p.y = s - p.h; p.vy = 0; p.onGround = true; p.ground = r;
            break;
          }
        }
      }
      if (!p.onGround && p.drop === 0) {
        for (const m of L.movers) {
          if (p.x + p.w <= m.x + 1 || p.x >= m.x + m.w - 1) continue;
          const b = p.y + p.h;
          if (b >= m.y && prevBottom <= m.y + 2 + Math.abs(m.vy)) {
            p.y = m.y - p.h; p.vy = 0; p.onGround = true; p.ground = m;
            break;
          }
        }
      }
    } else {
      const ty = Math.floor(p.y / TS);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tileAt(tx, ty) === SOLID) { p.y = (ty + 1) * TS; p.vy = 0; break; }
      }
    }
  }

  function updateEnemies() {
    const p = player;
    for (const e of L.enemies) {
      if (!e.alive) continue;
      if (e.type === 'burr') {
        if (Math.abs(e.x - camX - W / 2) > W) continue; // sleep when far away
        e.vy = Math.min(e.vy + GRAV, MAXFALL);
        // turn at walls and ledges
        const ahead = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
        const tx = Math.floor(ahead / TS);
        const midTy = Math.floor((e.y + e.h / 2) / TS);
        const footTy = Math.floor((e.y + e.h + 2) / TS);
        const floorAhead = tileAt(tx, footTy);
        if (tileAt(tx, midTy) === SOLID || (e.onGround && floorAhead !== SOLID && floorAhead !== PLANK)) e.vx = -e.vx;
        e.x += e.vx;
        e.y += e.vy;
        e.onGround = false;
        const ty = Math.floor((e.y + e.h) / TS);
        for (const cx of [e.x + 2, e.x + e.w - 2]) {
          const t = tileAt(Math.floor(cx / TS), ty);
          if ((t === SOLID || t === PLANK) && e.vy >= 0) { e.y = ty * TS - e.h; e.vy = 0; e.onGround = true; }
        }
        if (e.y > H + 20) e.alive = false;
      } else if (e.type === 'bee') {
        e.t += 0.022;
        const nx = e.ox + Math.sin(e.t) * e.range;
        e.face = nx > e.x ? 1 : -1;
        e.x = nx;
        e.y = e.oy + Math.sin(e.t * 3) * 5;
      }

      if (state !== 'play') continue;
      // Player contact
      if (overlap(p.x, p.y, p.w, p.h, e.x + 1, e.y + 2, e.w - 2, e.h - 2)) {
        const prevBottom = p.y + p.h - p.vy;
        if (p.vy > 0 && prevBottom <= e.y + 7) {
          e.alive = false;
          p.vy = input.jump ? STOMPV * 1.25 : STOMPV;
          p.jumpCut = true;
          p.flaps = FLAPS;
          addScore(200, e.x + e.w / 2, e.y);
          Sound.play('stomp');
          blooms.push({ x: e.x + e.w / 2, y: e.type === 'burr' ? e.y + e.h : e.y + e.h / 2, t: 0, fall: e.type === 'bee' });
          for (let i = 0; i < 8; i++) particles.push({ kind: 'petal', x: e.x + e.w / 2, y: e.y + e.h / 2, vx: rand(-1.5, 1.5), vy: rand(-2.5, -0.5), life: 36, max: 36, c: ['#ff8cc6', '#ffe066', '#fff'][i % 3] });
        } else if (p.invuln <= 0) {
          hurt(e);
        }
      }
    }
  }

  function hurt(e) {
    const p = player;
    Sound.play('hurt');
    lives--;
    updateHUD();
    if (lives <= 0) { gameOver(); return; }
    p.invuln = 120;
    p.hurtT = 24;
    p.vy = -3.2;
    p.vx = (p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1) * 2.4;
    showToast('OUCH! BE CAREFUL!', 70);
  }

  function loseLife() {
    const p = player;
    Sound.play('fall');
    lives--;
    updateHUD();
    if (lives <= 0) { gameOver(); return; }
    p.x = p.safe.x; p.y = p.safe.y;
    p.vx = 0; p.vy = 0; p.invuln = 100; p.ground = null;
    // shoo away enemies right next to the respawn spot
    for (const e of L.enemies) if (e.alive && e.type === 'burr' && Math.abs(e.x - p.x) < 40) e.x += e.x < p.x ? -40 : 40;
    showToast('SPLASH! TRY AGAIN!', 80);
  }

  function collect() {
    const p = player;
    for (const a of L.apples) {
      if (a.got) continue;
      if (overlap(p.x - 2, p.y - 4, p.w + 4, p.h + 4, a.x - 7, a.y - 7, 14, 14)) {
        a.got = true;
        applesGot++;
        addScore(1000, a.x, a.y - 8);
        Sound.play('apple');
        for (let i = 0; i < 10; i++) particles.push({ kind: 'heart', x: a.x, y: a.y, vx: rand(-1.4, 1.4), vy: rand(-2.2, -0.6), life: 50, max: 50 });
        if (applesGot === 5) {
          setTimeout(() => Sound.play('unlock'), 350);
          showToast('ALL APPLES COLLECTED! FIND THE DOOR!', 160);
        } else {
          showToast(`HEART APPLE ${applesGot}/5!`, 70);
        }
        updateHUD();
      }
    }
    for (const d of L.dots) {
      if (d.got) continue;
      if (overlap(p.x, p.y - 2, p.w, p.h + 2, d.x - 4, d.y - 4, 8, 8)) {
        d.got = true;
        dotsGot++;
        addScore(50);
        Sound.play('dot');
        for (let i = 0; i < 4; i++) particles.push({ kind: 'spark', x: d.x, y: d.y, vx: rand(-1, 1), vy: rand(-1, 1), life: 16, max: 16, c: S.DOT_COLORS[d.c] });
      }
    }
    for (const f of L.flowers) {
      if (p.vy > 0 && overlap(p.x, p.y + p.h - 6, p.w, 6, f.x + 2, f.y + 2, 12, 8) && p.y + p.h - p.vy <= f.y + 8) {
        p.vy = BOUNCEV;
        p.jumpCut = true;
        p.flaps = FLAPS;
        f.squish = 12;
        Sound.play('bounce');
        for (let i = 0; i < 6; i++) particles.push({ kind: 'petal', x: f.x + 8, y: f.y + 4, vx: rand(-1.5, 1.5), vy: rand(-1.5, 0.5), life: 30, max: 30, c: '#ff8cc6' });
      }
    }
  }

  function checkDoor() {
    const d = L.door;
    if (!d) return;
    const p = player;
    const inside = overlap(p.x, p.y, p.w, p.h, d.x + 8, d.y + 16, d.w - 16, d.h - 16);
    if (!inside) { d.warned = false; return; }
    if (applesGot < 5) {
      if (!d.warned) {
        d.warned = true;
        Sound.play('locked');
        showToast(`THE DOOR IS LOCKED! FIND ${5 - applesGot} MORE HEART APPLE${5 - applesGot === 1 ? '' : 'S'}.`, 150);
      }
      return;
    }
    if (!p.onGround) return;
    // Enter the door
    state = 'door';
    cut = { t: 0, phase: 'walk', home: d.home };
    Sound.play(d.home ? 'home' : 'clear');
    addScore(lives * 500);
  }

  function updateCutscene() {
    const p = player, d = L.door;
    cut.t++;
    const doorCx = d.x + d.w / 2;
    if (cut.phase === 'walk') {
      const cx = p.x + p.w / 2;
      const dir = Math.sign(doorCx - cx);
      if (Math.abs(doorCx - cx) > 1.5 || !p.onGround) {
        updatePlayer({ left: dir < 0, right: dir > 0, jump: false, jumpPressed: false });
        if (cut.t > 120) { p.x = doorCx - p.w / 2; }
      } else {
        p.vx = 0;
        p.x = doorCx - p.w / 2;
        cut.phase = 'enter';
        cut.t = 0;
        p.back = true;
      }
    } else if (cut.phase === 'enter') {
      const dur = cut.home ? 110 : 60;
      const k = Math.min(1, cut.t / dur);
      p.scale = 1 - 0.55 * k;
      p.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      p.enterLift = 10 * k;
      if (frame % 3 === 0) particles.push({ kind: 'spark', x: doorCx + rand(-14, 14), y: d.y + rand(8, 44), vx: rand(-0.3, 0.3), vy: rand(-0.8, -0.2), life: 40, max: 40, c: '#fff6a8' });
      if (cut.home) {
        zoom.blend = easeInOut(k);
        zoom.z = 1 + 1.3 * zoom.blend;
      }
      if (k >= 1) { cut.phase = 'fade'; cut.t = 0; }
    } else if (cut.phase === 'fade') {
      const dur = cut.home ? 70 : 30;
      if (cut.home) { zoom.z = 2.3 + 0.4 * (cut.t / dur); }
      if (cut.t >= dur) {
        cut.phase = 'done';
        if (cut.home) showEnding(); else showClear();
      }
    }
  }

  function checkSigns() {
    const cx = player.x + player.w / 2;
    activeSign = null;
    for (const s of L.signs) if (Math.abs(cx - (s.x + 10)) < 20 && Math.abs(player.y - s.y) < 40) activeSign = s;
  }

  function updateCamera() {
    let target;
    if (cut && cut.home) target = L.door.x + L.door.w / 2 - W / 2;
    else target = player.x + player.w / 2 - W / 2 + player.face * 28;
    target = clamp(target, 0, L.width * TS - W);
    camX += (target - camX) * 0.1;
    camX = clamp(camX, 0, L.width * TS - W);
  }

  function updateParticles() {
    for (const q of particles) {
      q.life--;
      q.x += q.vx; q.y += q.vy;
      if (q.kind === 'heart' || q.kind === 'text') q.vy *= 0.95;
      else if (q.kind === 'feather') { q.vy = Math.min(q.vy + 0.02, 0.8); q.vx = Math.sin(q.life * 0.2) * 0.6; }
      else if (q.kind === 'petal' || q.kind === 'dust') q.vy += 0.08;
    }
    particles = particles.filter((q) => q.life > 0);
    for (const b of blooms) b.t++;
  }

  // ------------------------------------------------------------------ Helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function dust(x, y, n) {
    for (let i = 0; i < n; i++) particles.push({ kind: 'dust', x: x + rand(-4, 4), y: y - 1, vx: rand(-0.8, 0.8), vy: rand(-0.8, -0.2), life: 18, max: 18 });
  }

  function addScore(n, x, y) {
    score += n;
    if (x !== undefined) particles.push({ kind: 'text', text: `+${n}`, x, y, vx: 0, vy: -1.2, life: 45, max: 45 });
    updateHUD();
  }

  function showToast(text, t) { toast = { text, t, max: t }; }

  // ------------------------------------------------------------------ HUD
  const hud = { score: $('hud-score'), lives: $('hud-lives'), apples: $('hud-apples'), stage: $('hud-stage'), name: $('hud-name') };
  $('hud-apple-icon').src = S.appleURL;
  let hudCache = {};
  function updateHUD(force) {
    const vals = { score: String(score).padStart(6, '0'), lives, apples: `${applesGot}/5`, stage: L ? L.def.stage : '', name: L ? L.def.name : '' };
    if (force || vals.score !== hudCache.score) hud.score.textContent = vals.score;
    if (force || vals.lives !== hudCache.lives) {
      hud.lives.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const img = document.createElement('img');
        img.src = i < lives ? S.heartURL : S.heartEmptyURL;
        img.alt = i < lives ? 'life' : '';
        hud.lives.appendChild(img);
      }
    }
    if (force || vals.apples !== hudCache.apples) {
      hud.apples.textContent = vals.apples;
      hud.apples.parentElement.classList.toggle('full', applesGot === 5);
    }
    if (force || vals.stage !== hudCache.stage) { hud.stage.textContent = `STAGE ${vals.stage}`; hud.name.textContent = vals.name; }
    hudCache = vals;
  }

  // ------------------------------------------------------------------ Background
  function buildBackground(level) {
    // Sky + distant rainbow (static)
    const [sky, sctx] = S.makeCanvas(W, H);
    const g = sctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, level.def.sky[0]);
    g.addColorStop(0.55, level.def.sky[1]);
    g.addColorStop(1, level.def.sky[2]);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, W, H);
    const bands = ['#ff8a8a', '#ffc27a', '#fff08a', '#9be58a', '#8ad0ff', '#c3a2ff'];
    sctx.globalAlpha = 0.35;
    bands.forEach((c, i) => {
      sctx.strokeStyle = c;
      sctx.lineWidth = 7;
      sctx.beginPath();
      sctx.arc(W * 0.62, H * 1.05, 190 - i * 7, Math.PI, Math.PI * 2);
      sctx.stroke();
    });
    sctx.globalAlpha = 1;

    // Distant floating islands with waterfalls (repeating strip)
    const SW = 720;
    const [far, fctx] = S.makeCanvas(SW, H);
    const r = S.rng(levelIndex * 97 + 5);
    const falls = [];
    for (let i = 0; i < 7; i++) {
      const x = i * (SW / 7) + r() * 40;
      const y = 90 + r() * 60;
      const w = 40 + r() * 50;
      // island underside (taper)
      fctx.fillStyle = '#9a86b8';
      for (let k = 0; k < 26; k++) {
        const ww = w * (1 - k / 28);
        fctx.fillRect(Math.round(x + (w - ww) / 2), Math.round(y + 6 + k), Math.round(ww), 1);
      }
      fctx.fillStyle = '#86b98a';
      fctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 7);
      fctx.fillStyle = '#a4d49a';
      fctx.fillRect(Math.round(x), Math.round(y), Math.round(w), 2);
      // tiny trees
      for (let t = 0; t < 2 + r() * 3; t++) {
        const tx = x + 6 + r() * (w - 12), th = 8 + r() * 10;
        fctx.fillStyle = '#8a6f84';
        fctx.fillRect(Math.round(tx), Math.round(y - th + 4), 2, Math.round(th - 4));
        fctx.fillStyle = '#7fae86';
        fctx.beginPath(); fctx.arc(tx + 1, y - th + 2, 5 + r() * 3, 0, Math.PI * 2); fctx.fill();
        if (r() < 0.6) { fctx.fillStyle = '#e88a9a'; fctx.fillRect(Math.round(tx - 2), Math.round(y - th + 1), 2, 2); }
      }
      if (r() < 0.75) {
        const fx = Math.round(x + w * (0.3 + r() * 0.4));
        const fw = 5 + Math.round(r() * 5);
        falls.push({ x: fx, y: Math.round(y + 4), w: fw });
        fctx.fillStyle = 'rgba(214,236,255,0.9)';
        fctx.fillRect(fx, Math.round(y + 4), fw, H - y);
        fctx.fillStyle = 'rgba(160,205,245,0.9)';
        fctx.fillRect(fx + fw - 1, Math.round(y + 4), 1, H - y);
      }
    }
    // mist at the bottom
    const mg = fctx.createLinearGradient(0, H - 70, 0, H);
    mg.addColorStop(0, 'rgba(255,255,255,0)');
    mg.addColorStop(1, 'rgba(255,240,250,0.8)');
    fctx.fillStyle = mg;
    fctx.fillRect(0, H - 70, SW, 70);

    return { sky, far, SW, falls };
  }

  // ------------------------------------------------------------------ Render
  function render() {
    if (!L) return;
    const cam = Math.round(camX);

    // Parallax layers (not zoomed)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCache.sky, 0, 0);
    // clouds
    for (let i = 0; i < 6; i++) {
      const c = S.clouds[i % S.clouds.length];
      const span = W + 200;
      const x = ((i * 157 - cam * 0.15 - frame * 0.08 * (1 + (i % 3) * 0.3)) % span + span) % span - 100;
      ctx.drawImage(c, Math.round(x), 10 + ((i * 37) % 70));
    }
    // far islands
    const fo = ((-cam * 0.3) % bgCache.SW + bgCache.SW) % bgCache.SW;
    ctx.drawImage(bgCache.far, Math.round(fo - bgCache.SW), 0);
    ctx.drawImage(bgCache.far, Math.round(fo), 0);
    // waterfall shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const f of bgCache.falls) {
      for (const off of [0, bgCache.SW, -bgCache.SW]) {
        const x = Math.round(f.x + fo + off - bgCache.SW);
        for (const xx of [x, x + bgCache.SW]) {
          if (xx < -10 || xx > W + 10) continue;
          for (let k = 0; k < 4; k++) {
            const yy = f.y + ((frame * 1.5 + k * 37 + f.x) % (H - f.y));
            ctx.fillRect(xx + 1 + (k % 2) * 2, Math.round(yy), 1, 5);
          }
        }
      }
    }

    // World (can be zoomed during the ending)
    const fx = camX + W / 2, fy = H / 2;
    let zfx = fx, zfy = fy;
    if (zoom.blend > 0 && L.door) {
      zfx = fx + (L.door.x + L.door.w / 2 - fx) * zoom.blend;
      zfy = fy + (L.door.y + 26 - fy) * zoom.blend;
    }
    const z = zoom.z;
    ctx.setTransform(z, 0, 0, z, Math.round(W / 2 - zfx * z), Math.round(H / 2 - zfy * z));

    drawWater(cam);
    const x0 = cam - 40 / z, x1 = cam + W + 40;
    for (const t of L.trees) if (t.x + 72 > x0 && t.x < x1) ctx.drawImage(S.trees[t.v % S.trees.length], t.x, t.y);
    for (const r of L.rainbows) if (r.x1 > x0 && r.x0 < x1) drawRainbow(r, x0, x1);
    drawTiles(cam);
    for (const m of L.movers) drawMover(m);
    if (L.door) drawDoor(L.door);
    for (const s of L.signs) if (s.x + 20 > x0 && s.x < x1) ctx.drawImage(S.sign, s.x, s.y);
    for (const f of L.flowers) ctx.drawImage(f.squish > 0 ? S.flowerSquish : S.flower, f.x, f.y);
    drawBlooms();
    drawFriends();
    drawCollectibles(x0, x1);
    drawEnemies(x0, x1);
    drawPlayer();
    drawParticles();
    if (cut && (cut.phase === 'enter' || cut.phase === 'fade')) drawDoorLight();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (cut && cut.phase === 'fade') {
      const dur = cut.home ? 70 : 30;
      ctx.fillStyle = cut.home ? `rgba(255,250,235,${Math.min(1, cut.t / dur)})` : `rgba(43,26,18,${Math.min(0.6, cut.t / dur)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (cut && cut.phase === 'done') {
      ctx.fillStyle = cut.home ? '#fffaeb' : 'rgba(43,26,18,0.6)';
      ctx.fillRect(0, 0, W, H);
    }
    drawUI();
  }

  function drawWater(cam) {
    const top = 204;
    ctx.fillStyle = '#5ab4ec';
    ctx.fillRect(cam - 40, top, W + 80, H - top + 40);
    ctx.fillStyle = '#3f93d1';
    ctx.fillRect(cam - 40, top + 10, W + 80, 30);
    ctx.fillStyle = '#bfe7ff';
    for (let x = Math.floor((cam - 40) / 12) * 12; x < cam + W + 40; x += 12) {
      const o = Math.round(Math.sin((x + frame * 0.8) * 0.08) * 2);
      ctx.fillRect(x + ((frame >> 3) % 4), top + 2 + o, 5, 1);
      ctx.fillRect(x + 6, top + 9 - o, 3, 1);
    }
  }

  function drawTiles(cam) {
    const tx0 = Math.max(0, Math.floor((cam - 40) / TS)), tx1 = Math.min(L.width - 1, Math.ceil((cam + W + 40) / TS));
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = L.grid[ty * L.width + tx];
        if (!t) continue;
        const x = tx * TS, y = ty * TS;
        if (t === PLANK) { ctx.drawImage(S.plank, x, y); continue; }
        const v = (tx * 7 + ty * 3) & 3;
        const above = renderTile(tx, ty - 1) === SOLID;
        const below = renderTile(tx, ty + 1) === SOLID;
        const set = above ? (below ? S.dirt : S.dirtBottom) : (below ? S.grass : S.grassBottom);
        ctx.drawImage(set[v], x, y);
        // dark edge where the ground ends
        const left = renderTile(tx - 1, ty) === SOLID || tx === 0;
        const right = renderTile(tx + 1, ty) === SOLID || tx === L.width - 1;
        ctx.fillStyle = '#4a2a14';
        if (!left) { ctx.fillRect(x, y + (above ? 0 : 5), 1, below ? TS - (above ? 0 : 5) : 9); if (!above) { ctx.fillStyle = '#2f6e1f'; ctx.fillRect(x, y, 1, 6); ctx.fillStyle = '#4a2a14'; } }
        if (!right) { ctx.fillRect(x + TS - 1, y + (above ? 0 : 5), 1, below ? TS - (above ? 0 : 5) : 9); if (!above) { ctx.fillStyle = '#2f6e1f'; ctx.fillRect(x + TS - 1, y, 1, 6); } }
      }
    }
  }

  const RAINBOW = ['#ff4d5e', '#ff9a3c', '#ffe14d', '#62d15a', '#46a8ff', '#9a67ff'];
  function drawRainbow(r, x0, x1) {
    const a = Math.max(r.x0, Math.floor(x0)), b = Math.min(r.x1, Math.ceil(x1));
    for (let x = a; x < b; x++) {
      const s = Math.round(rainbowY(r, x + 0.5));
      ctx.fillStyle = '#6b1f4a';
      ctx.fillRect(x, s - 1, 1, 1);
      for (let i = 0; i < RAINBOW.length; i++) {
        ctx.fillStyle = RAINBOW[i];
        ctx.fillRect(x, s + i * 3, 1, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x, s, 1, 1);
      ctx.fillStyle = '#3e2a6b';
      ctx.fillRect(x, s + 18, 1, 1);
    }
    // fluffy clouds at the feet
    const c = S.clouds[2];
    ctx.drawImage(c, r.x0 - 20, r.base - 6, 40, 18);
    ctx.drawImage(c, r.x1 - 20, r.base - 6, 40, 18);
  }

  function drawMover(m) {
    const x = Math.round(m.x), y = Math.round(m.y);
    for (let i = 0; i < m.w; i += TS) ctx.drawImage(S.plank, x + i, y, Math.min(TS, m.w - i), 7, x + i, y, Math.min(TS, m.w - i), 7);
    // leafy ends
    ctx.fillStyle = '#5cbf3a';
    ctx.fillRect(x - 2, y + 1, 3, 3); ctx.fillRect(x + m.w - 1, y + 1, 3, 3);
    ctx.fillStyle = '#ff8cc6';
    ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + m.w, y + 2, 1, 1);
    // little propeller-leaf underneath so it reads as "floating"
    const f = (frame >> 2) % 2;
    ctx.fillStyle = '#86dd52';
    ctx.fillRect(x + m.w / 2 - 4 + f * 2, y + 8, 4, 2);
    ctx.fillRect(x + m.w / 2 + f * -2, y + 8, 4, 2);
  }

  // Pre-rendered doors
  const DOORS = (() => {
    const make = (open) => {
      const [c, dctx] = S.makeCanvas(32, 48);
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
        const cx = x + 0.5 - 16, cy = y + 0.5 - 16;
        const outer = y >= 16 ? true : cx * cx + cy * cy <= 16 * 16;
        const inner = x >= 5 && x < 27 && (y >= 16 ? true : cx * cx + cy * cy <= 11 * 11);
        if (!outer) continue;
        let col;
        if (inner) {
          if (open) {
            const d = Math.sqrt(cx * cx + (y - 28) ** 2);
            col = d < 6 ? '#fffbe0' : d < 10 ? '#fff0a8' : d < 14 ? '#ffd86b' : '#f7b640';
          } else {
            col = (x - 5) % 5 === 0 ? '#7a4a24' : '#b07a44';
            if (y % 9 === 0) col = '#8f5f30';
          }
        } else {
          // bark ring frame
          const ring = Math.floor(Math.sqrt(cx * cx + Math.min(0, cy) ** 2 + (x < 16 ? 0 : 0)));
          col = (ring + (y >> 2)) % 3 === 0 ? '#5b3418' : '#7a4a24';
          if (x < 2 || x > 29) col = '#3d2210';
        }
        dctx.fillStyle = col;
        dctx.fillRect(x, y, 1, 1);
      }
      // outline top arc
      dctx.fillStyle = '#2b1a12';
      for (let a = Math.PI; a <= Math.PI * 2; a += 0.02) dctx.fillRect(Math.round(16 + Math.cos(a) * 15.5 - 0.5), Math.round(16 + Math.sin(a) * 15.5 - 0.5), 1, 1);
      // heart
      const hx = 12, hy = 24;
      const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
      rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === 'X') { dctx.fillStyle = open ? '#ff7eb6' : '#e84f8a'; dctx.fillRect(hx + xx * 1 - 1 + (open ? 0 : 1), hy + yy, 1, 1); } }));
      if (open) {
        // bigger glowing heart outline
        rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === 'X') { dctx.fillStyle = '#ffb3d6'; dctx.fillRect(9 + xx * 2, 20 + yy * 2, 2, 2); } }));
        rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === 'X' && yy < 5) { dctx.fillStyle = '#ff6fae'; dctx.fillRect(11 + xx * 1.4, 22 + yy * 1.4, 1, 1); } }));
      } else {
        dctx.fillStyle = '#f2c14e';
        dctx.fillRect(22, 30, 2, 2);
      }
      return c;
    };
    return { closed: make(false), open: make(true) };
  })();

  function drawDoor(d) {
    const open = applesGot >= 5;
    if (open) {
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.08);
      const g = ctx.createRadialGradient(d.x + 16, d.y + 28, 4, d.x + 16, d.y + 28, 44 + pulse * 6);
      g.addColorStop(0, 'rgba(255,240,160,0.85)');
      g.addColorStop(1, 'rgba(255,240,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - 40, d.y - 30, d.w + 80, d.h + 60);
    }
    ctx.drawImage(open ? DOORS.open : DOORS.closed, d.x, d.y);
    if (open && frame % 6 === 0) particles.push({ kind: 'spark', x: d.x + 16 + rand(-12, 12), y: d.y + rand(12, 44), vx: 0, vy: -0.3, life: 30, max: 30, c: '#ffffff' });

    // flag pole & banner
    const bx = d.x + 16, by = d.y - 18;
    const text = d.home ? 'HOME AT LAST!' : 'HOME';
    ctx.font = `8px ${FONT}`;
    const tw = Math.ceil(ctx.measureText(text).width) + 10;
    ctx.fillStyle = '#2b1a12';
    ctx.fillRect(Math.round(bx - tw / 2) - 1, by - 1, tw + 2, 14);
    ctx.fillStyle = '#f3e3c3';
    ctx.fillRect(Math.round(bx - tw / 2), by, tw, 12);
    ctx.fillStyle = '#4a2a14';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, bx, by + 2);
    if (!open) {
      // lock hint: apple counter above the door
      ctx.drawImage(S.apple, bx - 26, by - 16, 12, 12);
      ctx.fillStyle = '#2b1a12';
      ctx.fillText(`${applesGot}/5`, bx + 6, by - 13);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${applesGot}/5`, bx + 5, by - 14);
    }
  }

  function drawDoorLight() {
    const d = L.door;
    const k = cut.phase === 'fade' ? 1 : Math.min(1, cut.t / (cut.home ? 110 : 60));
    const cx = d.x + 16, cy = d.y + 28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + frame * 0.01;
      ctx.fillStyle = `rgba(255,230,140,${0.12 * k})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - 0.08) * 220, cy + Math.sin(a - 0.08) * 220);
      ctx.lineTo(cx + Math.cos(a + 0.08) * 220, cy + Math.sin(a + 0.08) * 220);
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + 60 * k);
    g.addColorStop(0, `rgba(255,250,210,${0.9 * k})`);
    g.addColorStop(1, 'rgba(255,240,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 120, cy - 120, 240, 240);
    ctx.restore();
  }

  function drawBlooms() {
    for (const b of blooms) {
      const s = Math.min(1, b.t / 14);
      const size = Math.round(16 * s);
      if (size <= 0) continue;
      if (b.fall) {
        // bees turn into little flowers that float away
        ctx.globalAlpha = Math.max(0, 1 - b.t / 120);
        ctx.drawImage(S.pop, Math.round(b.x - 5), Math.round(b.y - b.t * 0.3), 10, 10);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(S.flower, Math.round(b.x - size / 2), Math.round(b.y - size), size, size);
      }
    }
  }

  function drawFriends() {
    for (const f of L.friends) {
      const cheering = f.cheer > 0;
      const hop = cheering ? Math.abs(Math.sin(f.cheer * 0.15)) * 5 : 0;
      const hop2 = cheering ? Math.abs(Math.sin(f.cheer * 0.15 + 1.4)) * 5 : 0;
      const face = player.x > f.x ? 'r' : 'l';
      const blink = (frame + f.x) % 200 < 8;
      const poseA = cheering ? (Math.sin(f.cheer * 0.15) > 0 ? 'happy' : 'up') : blink ? 'blink' : 'idle';
      const poseB = cheering ? (Math.sin(f.cheer * 0.15 + 1.4) > 0 ? 'happy' : 'up') : 'idle';
      ctx.drawImage(S.baby[poseA][face], f.x, Math.round(f.y - hop));
      ctx.drawImage(S.pink[poseB][face], f.x + 18, Math.round(f.y - hop2));
      if (cheering && f.cheer % 40 === 1) particles.push({ kind: 'heart', x: f.x + 18, y: f.y - 4, vx: rand(-0.4, 0.4), vy: -0.9, life: 50, max: 50 });
    }
  }

  function drawCollectibles(x0, x1) {
    const bob = Math.sin(frame * 0.07) * 2;
    for (const a of L.apples) {
      if (a.got || a.x < x0 - 16 || a.x > x1 + 16) continue;
      // glow
      ctx.fillStyle = 'rgba(255,240,180,0.35)';
      ctx.beginPath(); ctx.arc(a.x, a.y + bob, 11 + Math.sin(frame * 0.12) * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(S.apple, Math.round(a.x - 8), Math.round(a.y - 8 + bob));
    }
    for (let i = 0; i < L.dots.length; i++) {
      const d = L.dots[i];
      if (d.got || d.x < x0 - 8 || d.x > x1 + 8) continue;
      const b = Math.round(Math.sin(frame * 0.09 + i * 0.7) * 1.5);
      ctx.drawImage(S.dots[d.c], Math.round(d.x - 4), Math.round(d.y - 4 + b));
    }
  }

  function drawEnemies(x0, x1) {
    for (const e of L.enemies) {
      if (!e.alive || e.x < x0 - 20 || e.x > x1 + 20) continue;
      const f = (frame >> 3) & 1;
      if (e.type === 'burr') ctx.drawImage(S.burr[f], Math.round(e.x - 2), Math.round(e.y - 2));
      else ctx.drawImage((e.face > 0 ? S.bee : S.beeL)[(frame >> 2) & 1], Math.round(e.x - 1), Math.round(e.y - 1));
    }
  }

  function drawPlayer() {
    const p = player;
    if (p.invuln > 0 && (frame >> 2) % 2 === 0 && state === 'play') return;
    let pose = 'idle';
    if (p.back) pose = (frame >> 3) % 2 ? 'back' : 'backUp';
    else if (p.hurtT > 0) pose = 'hurt';
    else if (!p.onGround) {
      if (p.flapT > 0) pose = (p.flapT >> 2) % 2 ? 'up' : 'down';
      else if (p.gliding) pose = (frame >> 3) % 2 ? 'up' : 'idle';
      else pose = p.vy < 0 ? 'up' : 'down';
    } else if (Math.abs(p.vx) > 0.3) {
      pose = ['walk1', 'idle', 'walk2', 'idle'][(p.anim >> 3) & 3];
    } else if (p.anim % 190 < 7) pose = 'blink';
    const spr = S.owl[pose][p.face > 0 ? 'r' : 'l'];
    const w = S.OWL_W * p.scale, h = S.OWL_H * p.scale;
    const cx = p.x + p.w / 2, bottom = p.y + p.h - (p.enterLift || 0);
    ctx.globalAlpha = p.alpha;
    ctx.drawImage(spr, Math.round(cx - w / 2), Math.round(bottom - h), Math.round(w), Math.round(h));
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const q of particles) {
      const a = Math.min(1, q.life / (q.max * 0.5));
      ctx.globalAlpha = a;
      const x = Math.round(q.x), y = Math.round(q.y);
      switch (q.kind) {
        case 'heart':
          ctx.drawImage(S.heart, x - 4, y - 4);
          break;
        case 'spark':
          ctx.fillStyle = q.c;
          ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
          break;
        case 'petal':
          ctx.fillStyle = q.c;
          ctx.fillRect(x, y, 2, 2);
          break;
        case 'dust':
          ctx.fillStyle = '#f3e3c3';
          ctx.fillRect(x, y, 2, 2);
          break;
        case 'feather':
          ctx.fillStyle = '#a8744a';
          ctx.fillRect(x, y, 3, 1); ctx.fillRect(x + 1, y + 1, 2, 1);
          break;
        case 'text':
          ctx.font = `8px ${FONT}`;
          ctx.fillStyle = '#2b1a12';
          ctx.fillText(q.text, x + 1, y + 1);
          ctx.fillStyle = '#fff6a8';
          ctx.fillText(q.text, x, y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function wrap(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > maxChars) { lines.push(line); line = w; }
      else line = (line + ' ' + w).trim();
    }
    if (line) lines.push(line);
    return lines;
  }

  function panel(lines, y, style) {
    ctx.font = `8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20;
    const h = lines.length * 12 + 10;
    const x = Math.round(W / 2 - w / 2);
    ctx.fillStyle = '#2b1a12';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = style === 'wood' ? '#e3c08d' : '#fff3f8';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = style === 'wood' ? '#f3d9ad' : '#ffffff';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = style === 'wood' ? '#4a2a14' : '#b0306e';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 6 + i * 12));
  }

  function drawUI() {
    if (state !== 'play') return;
    if (intro > 0) {
      const a = Math.min(1, intro / 30);
      ctx.globalAlpha = a;
      panel([`STAGE ${L.def.stage}`, L.def.name, '', 'FIND 5 HEART APPLES!'], 60, 'pink');
      ctx.globalAlpha = 1;
    } else if (activeSign) {
      panel(wrap(activeSign.text, 34), 8, 'wood');
    } else if (toast) {
      ctx.globalAlpha = Math.min(1, toast.t / 15);
      panel(wrap(toast.text, 36), 8, 'pink');
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ Screens
  const overlays = ['title', 'clear', 'over', 'pause', 'ending', 'victory'];
  function show(id) {
    for (const o of overlays) $(o).hidden = o !== id;
    document.body.dataset.screen = id || 'play';
  }

  function startGame() {
    Sound.init();
    Sound.play('start');
    Sound.startMusic();
    score = 0; levelStartScore = 0; dotsGot = 0;
    if (!totalDots) totalDots = totalDotCount();
    loadLevel(0, true);
    state = 'play';
    show(null);
  }

  function showClear() {
    state = 'clear';
    $('clear-stage').textContent = `STAGE ${L.def.stage} · ${L.def.name}`;
    $('clear-bonus').textContent = `LIFE BONUS +${lives * 500}`;
    $('clear-score').textContent = String(score).padStart(6, '0');
    const next = window.LEVELS[levelIndex + 1];
    $('clear-next').textContent = next ? `NEXT: ${next.name}` : '';
    show('clear');
  }

  function nextLevel() {
    Sound.play('start');
    loadLevel(levelIndex + 1, true);
    state = 'play';
    show(null);
  }

  function gameOver() {
    state = 'over';
    Sound.stopMusic();
    show('over');
  }

  function retry() {
    Sound.play('start');
    Sound.startMusic();
    dotsGot = levelDotsStart;
    loadLevel(levelIndex, false);
    state = 'play';
    show(null);
  }

  function releaseInput() {
    for (const k in input) input[k] = false;
    document.querySelectorAll('.down, .dpad .on').forEach((el) => el.classList.remove('down', 'on'));
  }

  function togglePause() {
    releaseInput();
    if (state === 'play') { state = 'paused'; show('pause'); Sound.stopMusic(); }
    else if (state === 'paused') { state = 'play'; show(null); Sound.startMusic(); }
  }

  function toggleMute() {
    Sound.init();
    const m = Sound.toggleMute();
    document.querySelectorAll('.mute').forEach((b) => { b.classList.toggle('off', m); b.setAttribute('aria-pressed', String(m)); });
  }

  const video = $('ending-video');
  function showEnding() {
    state = 'ending';
    show('ending');
    video.currentTime = 0;
    const p = video.play();
    if (p && p.catch) p.catch(() => showVictory());
  }

  function showVictory() {
    if (state === 'victory') return;
    state = 'victory';
    video.pause();
    $('win-score').textContent = String(score).padStart(6, '0');
    $('win-dots').textContent = `${dotsGot}/${totalDots}`;
    show('victory');
    let best = 0;
    try { best = +localStorage.getItem('owl-best') || 0; if (score > best) localStorage.setItem('owl-best', String(score)); } catch (e) { /* ignore */ }
    $('win-best').textContent = score > best ? 'NEW BEST SCORE!' : `BEST: ${String(best).padStart(6, '0')}`;
  }

  video.addEventListener('ended', showVictory);
  video.addEventListener('error', showVictory);
  $('btn-play').addEventListener('click', startGame);
  $('btn-next').addEventListener('click', nextLevel);
  $('btn-retry').addEventListener('click', retry);
  $('btn-resume').addEventListener('click', togglePause);
  $('btn-skip').addEventListener('click', showVictory);
  $('btn-again').addEventListener('click', () => { show('title'); state = 'title'; });
  $('btn-pause').addEventListener('click', togglePause);
  document.querySelectorAll('.mute').forEach((b) => b.addEventListener('click', toggleMute));
  if (Sound.muted) document.querySelectorAll('.mute').forEach((b) => b.classList.add('off'));

  window.addEventListener('blur', () => { if (state === 'play') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });

  // ------------------------------------------------------------------ Sizing
  function resize() {
    const stage = $('stage');
    const aw = stage.clientWidth, ah = stage.clientHeight;
    let w = aw, h = (aw * H) / W;
    if (h > ah) { h = ah; w = (ah * W) / H; }
    // snap to whole multiples when big enough, for crisp pixels
    const k = Math.floor(w / W);
    if (k >= 2 && w - k * W < W * 0.25) { w = k * W; h = k * H; }
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage'));
  resize();

  // ------------------------------------------------------------------ Main loop
  let last = performance.now(), acc = 0;
  function loop(now) {
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= 1000 / 60) {
      update();
      acc -= 1000 / 60;
    }
    render();
    requestAnimationFrame(loop);
  }

  // Attract mode behind the title screen
  loadLevel(0, true);
  show('title');
  const ready = document.fonts && document.fonts.load ? document.fonts.load(`8px ${FONT}`).catch(() => {}) : Promise.resolve();
  ready.then(() => requestAnimationFrame(loop));

  // Debug hook for testing
  window.__owl = { get state() { return state; }, get player() { return player; }, get level() { return L; }, input, loadLevel: (i) => { loadLevel(i, true); state = 'play'; show(null); }, give: () => { L.apples.forEach((a) => { a.got = true; }); applesGot = 5; updateHUD(); } };
})();
