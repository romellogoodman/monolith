# Monolith Landing Page

A one-page Vite + React site that renders the word "monolith" as a live, ASCII-textured 3D cube using p5.js.

## What renders

A fullscreen canvas showing a cube that:

- Rotates on all three axes (different frequencies per axis).
- Morphs its width / height / depth via three independent sine waves, so it stretches between cube, slab, and rod shapes.
- Is drawn as colored monospace characters from Paul Bourke's 70-step luminance ramp.

A small uppercase footer (`MONOLITH | ROMELLO GOODMAN`) links to the GitHub repo and personal site, styled after the `~/code/crescents` footer.

## How the ASCII renderer works

The trick is two stacked canvases (one element, one p5 instance):

1. **Off-screen WEBGL buffer** (`gfx`): a `p.createGraphics(cols, rows, p.WEBGL)` sized to the character grid — one source pixel per character cell. `gfx.pixelDensity(1)` is critical, otherwise the readback buffer is 4× bigger than the indexing assumes on Retina displays.
2. **Visible 2D canvas**: the main p5 canvas in default 2D mode. Each frame it `loadPixels()` on the buffer, walks the grid, and draws one character at each cell with `p.fill(r, g, b)` and the glyph chosen from `CHARS[floor(lum / 255 * len)]` where `lum = 0.299r + 0.587g + 0.114b`. Cells below a luminance threshold are skipped so the background reads as empty.

Rendering the source at character resolution (≈ 320×134 cells at 1080p) keeps the GPU→CPU pixel readback cheap enough to hold 60fps.

## React / p5 integration

p5 is a stateful, imperative library — it doesn't compose cleanly with React StrictMode's mount → unmount → mount cycle. The pattern in `src/App.jsx`:

```js
const timeoutId = setTimeout(() => {
  instance = new p5(sketch, container);
}, 0);
return () => {
  clearTimeout(timeoutId);
  instance?.remove();
};
```

The `setTimeout(0)` defers p5 construction by a tick. In StrictMode, the fake unmount fires its cleanup (cancelling the timeout) *before* any canvas gets appended, so only the real mount creates an instance. Without this, p5's async `setup()` appends a canvas after cleanup has already run, leaving two stacked cubes.

## File structure

Single-file by design — `src/App.jsx` holds the whole sketch, `src/App.scss` holds the styles. Keep it that way unless something becomes genuinely reusable.

- `src/App.jsx` — p5 sketch + footer JSX
- `src/App.scss` — background, fullscreen layout, footer styling
- `src/main.jsx` — React root with StrictMode (don't remove StrictMode; the deferred init pattern handles it)
- `src/modern-reset.scss` — CSS reset

## Knobs to turn

At the top of `src/App.jsx`:

- `CHARS` — the luminance ramp. Shorter ramps give chunkier, more diagrammatic output; longer ramps give smoother gradients.
- `CELL_W` / `CELL_H` / `FONT_SIZE` — character grid density. Smaller cells = more detail but slower readback and finer text.

Inside the sketch:

- `Math.min(cols, rows) * 0.45` — base cube size relative to the grid.
- The three `Math.sin(t * ...)` terms — independent morph rates per axis. Drop the multiplier from `0.6` to flatten the morph, raise it for more extreme stretching.
- `p.frameCount * 0.01` / `0.015` / `0.005` — rotation speeds per axis.

## Commands

```bash
npm run dev          # Vite dev server on port 8080
npm run build        # Production build to dist/
npm run lint         # ESLint
npm run format       # Prettier
```

## Relationship to parent repo

This lives at `website/` inside the [monolith](https://github.com/romellogoodman/monolith) repo (a TypeScript CLI/MCP utility library). The parent `.gitignore` excludes `*.js` and `package-lock.json` since the parent is TypeScript; an explicit `!website/**/*.js` and `!website/package-lock.json` exception lets this subproject's JS configs and lockfile be tracked.
