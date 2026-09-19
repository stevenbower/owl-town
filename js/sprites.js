// Pixel-art sprites, drawn procedurally into small offscreen canvases.
// Colors are taken from the hand-colored owl / apple / rainbow page.
(function () {
  'use strict';

  const OUT = '#2b1a12';

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  }

  function px(ctx, x, y, color, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  // Seeded RNG so textures are stable between reloads.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Build a boolean mask on a w*h grid from an "inside" test on pixel centers.
  function mask(w, h, inside) {
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x + 0.5, y + 0.5)) m[y * w + x] = 1;
      }
    }
    return m;
  }

  // Paint a mask with a fill color and a 1px outline on its border.
  function paint(ctx, w, h, m, fill, outline) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const edge =
          x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
          !m[y * w + x - 1] || !m[y * w + x + 1] ||
          !m[(y - 1) * w + x] || !m[(y + 1) * w + x];
        px(ctx, x, y, edge && outline ? outline : fill);
      }
    }
  }

  function ellipse(cx, cy, rx, ry) {
    return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }

  function blob(ctx, w, h, cx, cy, rx, ry, fill, outline) {
    paint(ctx, w, h, mask(w, h, ellipse(cx, cy, rx, ry)), fill, outline);
  }

  function flip(src) {
    const [c, ctx] = makeCanvas(src.width, src.height);
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- Owls
  const OWL_W = 20, OWL_H = 22;

  const PALETTES = {
    hero: { body: '#8b5a34', dark: '#65401f', light: '#a8744a', ring: '#b23fa0', ringDark: '#7e2a73', belly: '#a9a9b3', stripe: '#6f6f7a' },
    pink: { body: '#e889b8', dark: '#c4618f', light: '#f6b4d3', ring: '#f6d0e2', ringDark: '#d88fb4', belly: '#fff0f6', stripe: '#e9b8cf', bow: true },
    baby: { body: '#b98a5c', dark: '#8f6440', light: '#d6ad80', ring: '#f2e2c7', ringDark: '#d8c2a0', belly: '#fbf3e3', stripe: '#e3d2b4' },
  };

  function drawOwl(ctx, pal, pose) {
    const w = OWL_W, h = OWL_H;
    const wings = pose.wings || 'side';
    const feet = pose.feet || 0;

    // Wings behind the body when raised
    const wingY = wings === 'up' ? 7 : wings === 'down' ? 15 : 13;
    const wingRy = wings === 'side' ? 4.3 : 3.8;
    const drawWings = () => {
      blob(ctx, w, h, 2.6, wingY, 2.6, wingRy, pal.dark, OUT);
      blob(ctx, w, h, 17.4, wingY, 2.6, wingRy, pal.dark, OUT);
      // scalloped feather hints
      px(ctx, 2, wingY + 1, pal.light);
      px(ctx, 17, wingY + 1, pal.light);
    };
    if (wings === 'up') drawWings();

    // Ear tufts with a little curl (like the drawing)
    const tuft = [[4, 1], [3, 2], [4, 2], [3, 3], [4, 3], [5, 3]];
    for (const [x, y] of tuft) {
      px(ctx, x, y, pal.body);
      px(ctx, w - 1 - x, y, pal.body);
    }
    px(ctx, 4, 0, OUT); px(ctx, 15, 0, OUT);
    px(ctx, 3, 1, OUT); px(ctx, 16, 1, OUT);
    px(ctx, 2, 2, OUT); px(ctx, 17, 2, OUT);

    // Body
    blob(ctx, w, h, 10, 11.6, 8.3, 9.3, pal.body, OUT);

    if (pose.back) {
      // Seen from behind: lighter back patch and tail feathers
      blob(ctx, w, h, 10, 11, 5, 6.5, pal.light, null);
      px(ctx, 8, 19, pal.dark, 4, 1);
      px(ctx, 9, 20, pal.dark, 2, 1);
      for (let y = 7; y < 16; y += 3) {
        px(ctx, 8, y, pal.body); px(ctx, 11, y + 1, pal.body);
      }
    } else {
      // Belly with stripes
      blob(ctx, w, h, 10, 17.4, 4.9, 3.3, pal.belly, OUT);
      for (let x = 8; x <= 12; x += 2) {
        for (let y = 15; y <= 19; y++) px(ctx, x, y, pal.stripe);
      }

      // Big eye rings ("glasses")
      for (const cx of [6.3, 13.7]) {
        paint(ctx, w, h, mask(w, h, ellipse(cx, 8.6, 4.4, 4.4)), pal.ring, OUT);
        // ring segment ticks
        px(ctx, Math.round(cx) - 1, 4, pal.ringDark);
        px(ctx, Math.round(cx) + 2, 5, pal.ringDark);
        px(ctx, Math.round(cx) - 4, 8, pal.ringDark);
        px(ctx, Math.round(cx) + 3, 9, pal.ringDark);
        if (pose.blink) {
          px(ctx, Math.round(cx) - 2, 9, OUT, 4, 1);
        } else {
          paint(ctx, w, h, mask(w, h, ellipse(cx, 8.6, 2.7, 2.7)), '#ffffff', null);
          const look = pose.look ?? 1;
          const ex = Math.round(cx - 1 + look * 0.6 + (pose.happy ? 0 : 0));
          px(ctx, ex, 8, '#111111', 2, 2);
          px(ctx, ex, 8, '#555555');
        }
      }
      if (pose.happy && !pose.blink) {
        // happy closed eyes: little arcs
        for (const cx of [6.3, 13.7]) {
          paint(ctx, w, h, mask(w, h, ellipse(cx, 8.6, 2.7, 2.7)), pal.ring, null);
          px(ctx, Math.round(cx) - 2, 9, OUT); px(ctx, Math.round(cx) - 1, 8, OUT, 2, 1); px(ctx, Math.round(cx) + 1, 9, OUT);
        }
      }

      // Beak
      px(ctx, 8, 12, '#f2a33a', 4, 1);
      px(ctx, 9, 13, '#f2a33a', 2, 1);
      px(ctx, 9, 14, '#d9812a', 2, 1);
      px(ctx, 8, 12, '#ffcf73');

      if (pal.bow) {
        px(ctx, 12, 2, '#ff4f8b', 2, 2); px(ctx, 15, 2, '#ff4f8b', 2, 2); px(ctx, 14, 3, '#c2185b');
        px(ctx, 11, 1, OUT); px(ctx, 12, 1, OUT, 2, 1); px(ctx, 15, 1, OUT, 2, 1);
      }
    }

    if (wings !== 'up') drawWings();

    // Feet
    const fl = feet === 1 ? -1 : 0, fr = feet === 2 ? -1 : 0;
    px(ctx, 6, 20 + fl, '#1b1b1b', 3, 2);
    px(ctx, 11, 20 + fr, '#1b1b1b', 3, 2);
    px(ctx, 6, 21 + fl, '#3a3a3a');
    px(ctx, 13, 21 + fr, '#3a3a3a');
  }

  function owlSet(palName) {
    const pal = PALETTES[palName];
    const poses = {
      idle: { wings: 'side' },
      blink: { wings: 'side', blink: true },
      walk1: { wings: 'side', feet: 1 },
      walk2: { wings: 'side', feet: 2 },
      up: { wings: 'up', feet: 1 },
      down: { wings: 'down', feet: 2 },
      happy: { wings: 'up', happy: true },
      back: { wings: 'side', back: true },
      backUp: { wings: 'up', back: true },
      hurt: { wings: 'up', blink: true },
    };
    const set = {};
    for (const [name, pose] of Object.entries(poses)) {
      const [c, ctx] = makeCanvas(OWL_W, OWL_H);
      drawOwl(ctx, pal, pose);
      set[name] = { r: c, l: flip(c) };
    }
    return set;
  }

  // ---------------------------------------------------------------- Apple
  const HEART = [
    '.XX.XX.',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...',
  ];

  function drawHeart(ctx, ox, oy, color, shade) {
    HEART.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'X') px(ctx, ox + x, oy + y, color);
      });
    });
    if (shade) { px(ctx, ox + 1, oy + 1, shade); px(ctx, ox + 2, oy + 1, shade); }
  }

  function makeApple(scale = 1) {
    const w = 16, h = 16;
    const [c, ctx] = makeCanvas(w, h);
    const m = mask(w, h, (x, y) =>
      ellipse(5.4, 9.6, 4.9, 5.6)(x, y) || ellipse(10.6, 9.6, 4.9, 5.6)(x, y));
    paint(ctx, w, h, m, '#e0342f', OUT);
    // crayon stripes like the coloring page
    for (const y of [7, 10, 13]) {
      for (let x = 1; x < w - 1; x++) if (m[y * w + x] && m[y * w + x - 1] && m[y * w + x + 1]) px(ctx, x, y, '#b82426');
    }
    // dimple at bottom
    px(ctx, 7, 15, 'rgba(0,0,0,0)'); ctx.clearRect(7, 15, 2, 1); px(ctx, 7, 14, OUT, 2, 1);
    // highlight
    px(ctx, 3, 7, '#ff8a80', 1, 2);
    // heart
    drawHeart(ctx, 4, 8, '#ff9ccf', '#ffd1ea');
    // stem & leaf
    px(ctx, 7, 1, '#6b3f1d', 2, 4);
    px(ctx, 7, 0, OUT, 2, 1);
    px(ctx, 9, 1, '#6fbf3a', 3, 2); px(ctx, 10, 0, '#6fbf3a', 3, 1); px(ctx, 12, 1, '#4c9a2a');
    px(ctx, 10, 2, '#4c9a2a', 2, 1);
    return c;
  }

  // ---------------------------------------------------------------- Heart icon (lives)
  function makeHeartIcon() {
    const rows = [
      '.KK...KK.',
      'KppK.KppK',
      'KpWpKpppK',
      'KpppppppK',
      '.KpppppK.',
      '..KpppK..',
      '...KpK...',
      '....K....',
    ];
    const [c, ctx] = makeCanvas(9, 8);
    const col = { K: '#5a1030', p: '#ff5c9d', W: '#ffd6e8' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch]) px(ctx, x, y, col[ch]); }));
    return c;
  }

  // ---------------------------------------------------------------- Dots (candy bubbles)
  const DOT_COLORS = ['#8e44ad', '#2e86de', '#e84393', '#27ae60', '#f39c12', '#e74c3c', '#f1c40f', '#fd79a8'];
  function makeDot(color) {
    const [c, ctx] = makeCanvas(8, 8);
    blob(ctx, 8, 8, 4, 4, 3.8, 3.8, color, OUT);
    px(ctx, 2, 2, 'rgba(255,255,255,0.85)', 2, 1);
    px(ctx, 2, 3, 'rgba(255,255,255,0.6)');
    return c;
  }

  // ---------------------------------------------------------------- Enemies
  function makeBurr(frame) {
    const w = 18, h = 16;
    const [c, ctx] = makeCanvas(w, h);
    const r = rng(7);
    // spikes
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
      const x = Math.round(9 + Math.cos(a + frame * 0.2) * 8);
      const y = Math.round(9 + Math.sin(a + frame * 0.2) * 6.5);
      px(ctx, x, y, '#6b8e23');
      px(ctx, Math.round(9 + Math.cos(a) * 7), Math.round(9 + Math.sin(a) * 5.8), '#556b2f');
    }
    blob(ctx, w, h, 9, 9.5, 6.6, 5.6, '#7fb33a', '#35521a');
    for (let i = 0; i < 8; i++) px(ctx, 4 + Math.floor(r() * 10), 6 + Math.floor(r() * 7), '#5f8f26');
    // grumpy face
    px(ctx, 5, 8, '#fff', 3, 3); px(ctx, 10, 8, '#fff', 3, 3);
    px(ctx, 6 + (frame ? 1 : 0), 9, '#111', 1, 2); px(ctx, 11 + (frame ? 1 : 0), 9, '#111', 1, 2);
    px(ctx, 5, 7, '#35521a', 3, 1); px(ctx, 10, 7, '#35521a', 3, 1);
    px(ctx, 8, 12, '#35521a', 2, 1);
    // feet
    px(ctx, frame ? 4 : 5, 14, '#3d2a14', 3, 2);
    px(ctx, frame ? 11 : 10, 14, '#3d2a14', 3, 2);
    return c;
  }

  function makeBee(frame) {
    const w = 16, h = 14;
    const [c, ctx] = makeCanvas(w, h);
    // wings
    const wy = frame ? 1 : 3;
    blob(ctx, w, h, 6, wy + 2, 2.6, 2.4, 'rgba(230,245,255,0.95)', '#6a8caf');
    blob(ctx, w, h, 10, wy + 2, 2.6, 2.4, 'rgba(230,245,255,0.95)', '#6a8caf');
    blob(ctx, w, h, 8, 8.5, 6.6, 4.6, '#ffd23f', OUT);
    for (const x of [6, 9]) for (let y = 5; y <= 12; y++) px(ctx, x, y, '#2b1a12');
    px(ctx, 12, 7, '#fff', 2, 2); px(ctx, 13, 7, '#111');
    px(ctx, 1, 8, OUT); px(ctx, 0, 9, OUT); // stinger
    px(ctx, 13, 10, '#e84393');
    return c;
  }

  function makeFlower(squish) {
    const w = 16, h = 16;
    const [c, ctx] = makeCanvas(w, h);
    // stem
    px(ctx, 7, 9, '#3f8f2a', 2, 7);
    px(ctx, 4, 12, '#5fb33a', 3, 2); px(ctx, 9, 11, '#5fb33a', 3, 2);
    const cy = squish ? 7 : 5;
    const ry = squish ? 2.4 : 3.3;
    for (const [dx, dy] of [[-3.2, 0], [3.2, 0], [0, -2.6], [0, 2.6], [-2.2, -1.8], [2.2, -1.8]]) {
      blob(ctx, w, h, 8 + dx, cy + dy * (squish ? 0.6 : 1), 2.6, ry * 0.8, '#ff7eb6', '#b4386f');
    }
    blob(ctx, w, h, 8, cy, 2.4, squish ? 1.6 : 2.2, '#ffe066', '#c9961a');
    return c;
  }

  // Tiny decorative flowers that burst out of stomped enemies
  function makePop() {
    const [c, ctx] = makeCanvas(10, 10);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) blob(ctx, 10, 10, 5 + dx, 5 + dy, 1.9, 1.9, '#ffb3d9', '#d15c95');
    blob(ctx, 10, 10, 5, 5, 1.5, 1.5, '#fff176', null);
    return c;
  }

  // ---------------------------------------------------------------- Tiles
  const TS = 16;

  function makeDirt(seed, withBottom) {
    const [c, ctx] = makeCanvas(TS, TS);
    const r = rng(seed);
    px(ctx, 0, 0, '#8a5530', TS, TS);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * 15), y = Math.floor(r() * 15);
      px(ctx, x, y, r() < 0.5 ? '#6e3f20' : '#a0673b', r() < 0.3 ? 2 : 1, 1);
    }
    // little pebbles
    if (r() < 0.6) { const x = 2 + Math.floor(r() * 10), y = 3 + Math.floor(r() * 9); px(ctx, x, y, '#b58a5f', 3, 2); px(ctx, x, y + 2, '#5b3418', 3, 1); }
    if (withBottom) {
      ctx.clearRect(0, 10, TS, 6);
      // rough hanging bottom
      for (let x = 0; x < TS; x++) {
        const d = 10 + Math.floor(r() * 4);
        px(ctx, x, 10, '#8a5530', 1, d - 10);
        px(ctx, x, d, '#4a2a14');
      }
      // roots
      px(ctx, 4, 13, '#5b3418', 1, 3);
      px(ctx, 11, 12, '#5b3418', 1, 4);
    }
    return c;
  }

  function makeGrass(seed, withBottom) {
    const c = makeDirt(seed, withBottom);
    const ctx = c.getContext('2d');
    const r = rng(seed * 31 + 3);
    px(ctx, 0, 0, '#5cbf3a', TS, 5);
    px(ctx, 0, 0, '#86dd52', TS, 1);
    // jagged grass edge over the dirt
    for (let x = 0; x < TS; x++) {
      const d = 5 + Math.floor(r() * 3);
      px(ctx, x, 5, '#3f9a2a', 1, d - 5);
      px(ctx, x, d, '#2f6e1f');
    }
    for (let i = 0; i < 5; i++) px(ctx, Math.floor(r() * 16), 1 + Math.floor(r() * 3), '#9ae86a');
    if (r() < 0.35) { const x = 2 + Math.floor(r() * 11); px(ctx, x, 1, '#ff8cc6'); px(ctx, x - 1, 2, '#ff8cc6'); px(ctx, x + 1, 2, '#ff8cc6'); px(ctx, x, 2, '#ffe066'); }
    return c;
  }

  function makePlank() {
    const [c, ctx] = makeCanvas(TS, TS);
    px(ctx, 0, 1, '#b07a44', TS, 5);
    px(ctx, 0, 1, '#d19a5e', TS, 1);
    px(ctx, 0, 5, '#6b4220', TS, 1);
    px(ctx, 0, 0, OUT, TS, 1);
    px(ctx, 0, 6, OUT, TS, 1);
    px(ctx, 7, 1, '#6b4220', 1, 5);
    px(ctx, 3, 3, '#8f5f30', 2, 1); px(ctx, 11, 2, '#8f5f30', 3, 1);
    // rope/posts
    px(ctx, 1, 7, '#6b4220', 1, 3); px(ctx, 14, 7, '#6b4220', 1, 3);
    return c;
  }

  // ---------------------------------------------------------------- Apple tree (decoration)
  function makeTree(seed) {
    const w = 72, h = 88;
    const [c, ctx] = makeCanvas(w, h);
    const r = rng(seed);
    // trunk
    px(ctx, 30, 44, '#6e4322', 12, 44);
    px(ctx, 30, 44, '#8a5530', 4, 44);
    px(ctx, 26, 82, '#6e4322', 20, 6);
    for (let y = 48; y < 86; y += 5) px(ctx, 33 + (y % 3), y, '#4e2d14', 4, 1);
    px(ctx, 22, 50, '#6e4322', 10, 3); px(ctx, 42, 46, '#6e4322', 10, 3);
    // canopy
    const blobs = [[36, 26, 26, 20], [18, 34, 14, 12], [54, 34, 15, 12], [24, 16, 13, 11], [48, 14, 14, 11], [36, 40, 18, 9]];
    for (const [x, y, rx, ry] of blobs) blob(ctx, w, h, x, y, rx, ry, '#3f9a2a', '#24591a');
    for (const [x, y, rx, ry] of blobs) blob(ctx, w, h, x - 2, y - 3, rx * 0.72, ry * 0.65, '#5cbf3a', null);
    for (let i = 0; i < 40; i++) px(ctx, 6 + Math.floor(r() * 60), 6 + Math.floor(r() * 40), r() < 0.5 ? '#86dd52' : '#2f7a22');
    // heart apples in the canopy
    const small = makeApple();
    for (const [x, y] of [[12, 28], [44, 8], [52, 32], [26, 38], [34, 18]]) ctx.drawImage(small, x, y, 12, 12);
    return c;
  }

  // ---------------------------------------------------------------- Sign
  function makeSign() {
    const [c, ctx] = makeCanvas(20, 22);
    px(ctx, 9, 10, '#6b4220', 2, 12);
    px(ctx, 0, 0, OUT, 20, 12);
    px(ctx, 1, 1, '#e3c08d', 18, 10);
    px(ctx, 1, 1, '#f3d9ad', 18, 1);
    for (const y of [3, 5, 7]) px(ctx, 4, y, '#8a6a44', 12, 1);
    drawHeart(ctx, 7, 8, '#ff5c9d');
    ctx.clearRect(7, 12, 7, 2);
    px(ctx, 9, 12, '#6b4220', 2, 2);
    return c;
  }

  // ---------------------------------------------------------------- Clouds
  function makeCloud(seed, w = 64, h = 28) {
    const [c, ctx] = makeCanvas(w, h);
    const r = rng(seed);
    const m = new Uint8Array(w * h);
    const puffs = [];
    for (let i = 0; i < 5; i++) puffs.push([10 + r() * (w - 20), h * 0.55 + (r() - 0.5) * 6, 7 + r() * 8]);
    puffs.push([w / 2, h * 0.5, 11]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      for (const [cx, cy, rr] of puffs) if ((x - cx) ** 2 + ((y - cy) * 1.2) ** 2 < rr * rr && y < h - 3) { m[y * w + x] = 1; break; }
    }
    paint(ctx, w, h, m, '#ffffff', '#c9d6f2');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m[y * w + x] && y > h * 0.62 && m[(y + 1) * w + x]) px(ctx, x, y, '#e3eafc');
    }
    return c;
  }

  function dataURL(canvas, scale) {
    const [c, ctx] = makeCanvas(canvas.width * scale, canvas.height * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL();
  }

  const grassTiles = [], dirtTiles = [], grassBottom = [], dirtBottom = [];
  for (let i = 0; i < 4; i++) {
    grassTiles.push(makeGrass(100 + i, false));
    grassBottom.push(makeGrass(200 + i, true));
    dirtTiles.push(makeDirt(300 + i, false));
    dirtBottom.push(makeDirt(400 + i, true));
  }

  const apple = makeApple();
  const heart = makeHeartIcon();

  window.SPR = {
    TS,
    OWL_W, OWL_H,
    owl: owlSet('hero'),
    pink: owlSet('pink'),
    baby: owlSet('baby'),
    apple,
    heart,
    dots: DOT_COLORS.map(makeDot),
    DOT_COLORS,
    burr: [makeBurr(0), makeBurr(1)],
    bee: [makeBee(0), makeBee(1)],
    beeL: [flip(makeBee(0)), flip(makeBee(1))],
    flower: makeFlower(false),
    flowerSquish: makeFlower(true),
    pop: makePop(),
    grass: grassTiles, grassBottom, dirt: dirtTiles, dirtBottom,
    plank: makePlank(),
    trees: [makeTree(11), makeTree(23), makeTree(37)],
    sign: makeSign(),
    clouds: [makeCloud(1), makeCloud(2, 80, 30), makeCloud(3, 48, 22), makeCloud(4, 96, 34)],
    makeCanvas, rng,
    appleURL: dataURL(apple, 2),
    heartURL: dataURL(heart, 3),
    heartEmptyURL: (() => {
      const [c, ctx] = makeCanvas(9, 8);
      ctx.globalAlpha = 0.25; ctx.drawImage(heart, 0, 0);
      return dataURL(c, 3);
    })(),
  };
})();
