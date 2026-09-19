// Stage layouts. Coordinates are in 16px tiles; the playfield is 14 tiles tall (rows 0-13).
// Every stage hides exactly 5 heart apples — collect them all to open the door.
(function () {
  'use strict';

  const ROWS = 14;
  const EMPTY = 0, SOLID = 1, PLANK = 2;

  function builder(width) {
    const grid = new Uint8Array(width * ROWS);
    const L = {
      width, grid,
      apples: [], dots: [], enemies: [], rainbows: [], movers: [], signs: [],
      friends: [], flowers: [], trees: [], door: null, start: { x: 2, row: 11 },
    };
    const set = (x, y, v) => { if (x >= 0 && x < width && y >= 0 && y < ROWS) grid[y * width + x] = v; };
    const b = {
      // Solid ground from row `top` down to the bottom of the screen
      ground(x0, x1, top) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) set(x, y, SOLID); },
      // Floating island: `depth` rows of solid starting at `top`
      island(x0, x1, top, depth = 2) { for (let x = x0; x <= x1; x++) for (let y = top; y < top + depth; y++) set(x, y, SOLID); },
      // One-way wooden bridge
      plank(x0, x1, row) { for (let x = x0; x <= x1; x++) set(x, row, PLANK); },
      // Walkable rainbow arc from tile x0 to x1, feet at row `base`, rising `height` tiles
      rainbow(x0, x1, base, height) { L.rainbows.push({ x0: x0 * 16, x1: (x1 + 1) * 16, base: base * 16, height: height * 16 }); },
      // Moving one-way platform, `w` tiles wide, travelling (dx, dy) tiles over `period` frames
      mover(x, row, w, dx, dy, period = 240) { L.movers.push({ ox: x * 16, oy: row * 16, w: w * 16, dx: dx * 16, dy: dy * 16, period, x: x * 16, y: row * 16, vx: 0, vy: 0 }); },
      apple(x, row) { L.apples.push({ x: x * 16 + 8, y: row * 16 + 8, got: false }); },
      dot(x, row) { L.dots.push({ x: x * 16 + 8, y: row * 16 + 8, got: false, c: L.dots.length % 8 }); },
      // A row of candy dots; `arc` lifts the middle ones into a hump
      dots(x0, x1, row, arc = 0) {
        for (let x = x0; x <= x1; x++) {
          const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
          const lift = Math.sin(t * Math.PI) * arc;
          L.dots.push({ x: x * 16 + 8, y: (row - lift) * 16 + 8, got: false, c: L.dots.length % 8 });
        }
      },
      column(x, r0, r1) { for (let r = r0; r <= r1; r++) b.dot(x, r); },
      // Candy dots following a rainbow's curve
      rainbowDots(i, lift = 1.3, step = 1) {
        const r = L.rainbows[i];
        for (let px = r.x0 + 12; px < r.x1 - 8; px += 16 * step) {
          const t = (px - r.x0) / (r.x1 - r.x0);
          L.dots.push({ x: px, y: r.base - Math.sin(t * Math.PI) * r.height - lift * 16, got: false, c: L.dots.length % 8 });
        }
      },
      burr(x, row) { L.enemies.push({ type: 'burr', x: x * 16 + 1, y: row * 16 - 14, w: 14, h: 14, vx: -0.45, vy: 0, alive: true }); },
      bee(x, row, range = 2.5) { L.enemies.push({ type: 'bee', x: x * 16, y: row * 16, w: 14, h: 12, ox: x * 16, oy: row * 16, range: range * 16, t: Math.random() * 6, alive: true, face: -1 }); },
      flower(x, row) { L.flowers.push({ x: x * 16, y: row * 16 - 16, squish: 0 }); },
      sign(x, row, text) { L.signs.push({ x: x * 16 - 2, y: row * 16 - 22, text }); },
      friends(x, row) { L.friends.push({ x: x * 16, y: row * 16 - 22, cheer: 0 }); },
      tree(x, row, v = 0) { L.trees.push({ x: x * 16 - 28, y: row * 16 - 88, v }); },
      door(x, row, home = false) { L.door = { x: x * 16, y: row * 16 - 48, w: 32, h: 48, home }; },
      start(x, row) { L.start = { x, row }; },
    };
    return [L, b];
  }

  const LEVELS = [
    {
      stage: '1-1',
      name: 'APPLE MEADOW',
      width: 150,
      sky: ['#7ec8f2', '#bfe3ff', '#ffd9ec'],
      build(b) {
        b.start(3, 11);
        b.ground(0, 24, 11);
        b.friends(0, 11);
        b.tree(6, 11, 0);
        b.sign(8, 11, 'HI LITTLE OWL! USE ARROWS TO WALK AND SPACE TO JUMP. PRESS JUMP AGAIN IN THE AIR TO FLAP!');
        b.apple(14, 9);
        b.dots(16, 22, 9, 0.8);
        b.tree(20, 11, 1);

        b.ground(28, 46, 11);
        b.sign(30, 11, 'HOP ON GRUMPY BURRS TO TURN THEM INTO FLOWERS!');
        b.plank(33, 37, 8);
        b.apple(35, 6);
        b.dots(33, 37, 7);
        b.burr(40, 11);

        b.ground(47, 58, 9);
        b.apple(53, 6);
        b.tree(56, 9, 2);
        b.rainbow(59, 74, 9, 3.5);
        b.rainbowDots(0, 1.2, 2);
        b.ground(75, 80, 9);
        b.ground(81, 94, 11);
        b.burr(85, 11);
        b.island(87, 91, 7, 1);
        b.apple(89, 5);
        b.dots(87, 91, 6);
        b.burr(92, 11);

        b.island(97, 99, 10, 2);
        b.island(102, 104, 8, 2);
        b.island(107, 109, 9, 2);
        b.dots(97, 99, 8);
        b.dots(102, 104, 6);
        b.dots(107, 109, 7);

        b.ground(111, 149, 11);
        b.apple(118, 9);
        b.burr(123, 11);
        b.sign(126, 11, 'BOUNCY FLOWERS SEND YOU SKY HIGH!');
        b.flower(129, 11);
        b.column(129, 2, 7);
        b.tree(133, 11, 0);
        b.burr(136, 11);
        b.sign(140, 11, 'SWEETER WORLDS AHEAD! GRAB ALL 5 HEART APPLES TO OPEN THE DOOR.');
        b.door(145, 11);
      },
    },
    {
      stage: '1-2',
      name: 'WATERFALL ISLES',
      width: 172,
      sky: ['#8fb8f5', '#c8dcff', '#ffe0f0'],
      build(b) {
        b.start(2, 11);
        b.ground(0, 12, 11);
        b.sign(6, 11, 'SMALL OWLS, BIG ADVENTURES! WATCH OUT FOR BUSY BEES.');
        b.tree(10, 11, 1);

        b.island(15, 19, 9, 2);
        b.dots(15, 19, 8);
        b.island(23, 26, 7, 2);
        b.apple(24, 4);
        b.mover(29, 9, 3, 7, 0, 260);
        b.dots(30, 38, 7, 1);

        b.ground(41, 55, 10);
        b.burr(45, 10);
        b.plank(47, 50, 6);
        b.apple(48, 4);
        b.burr(53, 10);

        b.mover(57, 10, 2, 0, -4, 220);
        b.island(62, 64, 6, 1);
        b.dots(62, 64, 5);
        b.bee(66, 6);
        b.island(68, 70, 9, 2);

        b.ground(73, 92, 11);
        b.bee(80, 7);
        b.tree(82, 11, 2);
        b.apple(85, 8);
        b.burr(89, 11);

        b.rainbow(93, 110, 11, 5);
        b.rainbowDots(0, 1.3, 1);
        b.bee(102, 3);

        b.ground(111, 122, 11);
        b.flower(116, 11);
        b.apple(116, 3);
        b.sign(119, 11, 'GOOD OWLS DO GREAT THINGS!');

        b.island(125, 127, 9, 1);
        b.mover(129, 8, 2, 5, 0, 220);
        b.dots(129, 135, 6, 0.5);
        b.island(138, 141, 7, 2);
        b.apple(139, 5);
        b.island(143, 144, 9, 1);

        b.ground(146, 171, 11);
        b.burr(152, 11);
        b.bee(157, 7);
        b.tree(162, 11, 0);
        b.friends(159, 11);
        b.door(166, 11);
      },
    },
    {
      stage: '1-3',
      name: 'THE RAINBOW ORCHARD',
      width: 192,
      sky: ['#9fb4ff', '#d4d0ff', '#ffd6e6'],
      build(b) {
        b.start(4, 11);
        b.ground(0, 14, 11);
        b.friends(0, 11);
        b.tree(8, 11, 0);
        b.sign(11, 11, 'THE RAINBOW ORCHARD! 5 MORE HEART APPLES AND YOU ARE HOME.');

        b.rainbow(15, 28, 11, 4);
        b.rainbowDots(0, 1.2, 2);
        b.apple(21, 4);

        b.ground(29, 42, 11);
        b.burr(33, 11);
        b.plank(35, 38, 7);
        b.dots(35, 38, 6);
        b.burr(40, 11);
        b.tree(31, 11, 1);

        b.rainbow(43, 54, 11, 3);
        b.rainbow(55, 68, 11, 5);
        b.rainbowDots(1, 1.2, 2);
        b.rainbowDots(2, 1.2, 2);
        b.bee(61, 4);

        b.ground(69, 80, 9);
        b.tree(71, 9, 2);
        b.apple(75, 5);

        b.island(83, 85, 11, 2);
        b.mover(88, 8, 3, 0, 3, 200);
        b.island(94, 96, 7, 2);
        b.apple(95, 5);
        b.bee(98, 6);

        b.ground(101, 125, 11);
        b.burr(106, 11);
        b.island(108, 114, 7, 1);
        b.dots(108, 114, 6);
        b.burr(112, 11);
        b.burr(118, 11);
        b.flower(122, 11);
        b.apple(122, 2);
        b.column(122, 4, 7);

        b.rainbow(126, 145, 11, 6);
        b.rainbowDots(3, 1.3, 1);
        b.bee(135, 2);

        b.ground(146, 191, 11);
        b.apple(153, 8);
        b.burr(157, 11);
        b.sign(164, 11, 'ALMOST HOME... SWEETER WORLDS AHEAD!');
        b.friends(170, 11);
        b.tree(167, 11, 1);
        b.island(176, 177, 10, 1);
        b.island(178, 179, 9, 2);
        b.island(180, 191, 8, 3);
        b.door(184, 8, true);
      },
    },
  ];

  window.LEVELS = LEVELS;
  window.buildLevel = function (i) {
    const def = LEVELS[i];
    const [L, b] = builder(def.width);
    def.build(b);
    L.def = def;
    if (L.apples.length !== 5) console.warn(`Stage ${def.stage} has ${L.apples.length} apples`);
    return L;
  };
  window.TILE = { EMPTY, SOLID, PLANK, ROWS };
})();
