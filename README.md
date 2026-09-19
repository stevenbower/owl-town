# Owl You Need Is Apples

A tiny pixel-art platformer. Help the little owl collect **5 heart apples** in each of three stages, then follow the rainbow home.

It's a static site (plain HTML/CSS/JS, no build step), so it runs straight from GitHub Pages.

## Play

- **Keyboard:** `←` `→` walk · `Space` jump · press again in the air to **flap** (twice) · hold to **glide** · `↓`+`Space` drops through bridges · `P` pause · `M` sound
- **iPhone / iPad / touch:** slide your thumb on the ◀ ▶ pad, tap **A** to jump/flap, hold **A** to glide. Tip: "Add to Home Screen" in Safari for a full-screen app.

Hop on grumpy burrs and bees to turn them into flowers, bounce on pink flowers, and ride the moving planks. Falling in the water costs a heart, and you respawn nearby.

## Stages

1. **Apple Meadow:** learn to jump, flap and stomp
2. **Waterfall Isles:** floating islands, moving platforms, bees
3. **The Rainbow Orchard:** rainbow bridges all the way home, ending in the "Home at last!" movie

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy to GitHub Pages

A workflow in `.github/workflows/pages.yml` publishes the repo root on every push to `main`.
In the repo on GitHub, go to **Settings → Pages → Source** and choose **GitHub Actions**.
(Or pick **Deploy from a branch**, `main` / root. That works too.)

## Project layout

| Path | What |
| --- | --- |
| `index.html`, `css/style.css` | Page, HUD, menus, touch controls |
| `js/sprites.js` | All pixel art, drawn in code (owls, heart apples, rainbows, tiles…) |
| `js/levels.js` | Stage layouts. Each stage must contain exactly 5 apples |
| `js/game.js` | Physics, enemies, camera, rendering, screens |
| `js/audio.js` | Chiptune music and sound effects (Web Audio) |
| `assets/` | Title poster, ending video, the original coloring page, app icons |

Inspired by a hand-colored owls, apples and rainbows coloring page (shown on the victory screen).
