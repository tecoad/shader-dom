# shader-dom

Apply GPU fragment shaders to live, interactive React DOM elements using WebGL.

Takes a real snapshot of any React component via SVG `foreignObject`, uploads it as a WebGL texture, and runs it through a fragment shader at 60fps — while keeping the DOM fully interactive (clicks, hover, text selection).

## Pipeline

```
React DOM → cloneNode → XMLSerializer → SVG foreignObject → Data URI → Canvas 2D → WebGL texImage2D → Fragment Shader
```

### Why data URI instead of blob URL?

Blob URLs **taint the canvas** in Safari (and older Chrome), causing WebGL's `texImage2D` to throw a `SecurityError`. Data URIs are treated as same-origin by all browsers.

```js
// Taints the canvas (blob URL)
img.src = URL.createObjectURL(blob);

// Does NOT taint (data URI)
img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
```

## Interactive Mode

Uses the PDF.js pattern: the real DOM sits on top of the canvas with `color: transparent` and `opacity: 1`. The shader shows through the transparent DOM, but all interactions (click, hover, text selection) work natively.

```
┌─────────────────────┐
│ DOM (z-index: 2)    │  ← transparent, interactive, selectable
├─────────────────────┤
│ Canvas (z-index: 1) │  ← shader output at 60fps
└─────────────────────┘
```

Text selection highlights (`::selection`) render on top of the shader because the DOM has `opacity: 1` — only `color` is transparent.

## Shaders

- **Wave Distortion** — sinusoidal UV displacement
- **Chromatic Aberration** — RGB channel offset based on distance from center
- **Glitch** — random horizontal line shifts with color separation
- **Pixelate + Glow** — dynamic pixel grid with bloom effect
- **Hologram** — scanlines, flicker, and cyan-tinted color shift

## Running

```bash
npm install
npm run dev
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical documentation, all learnings, gotchas, and the target API design for the next phase.

## Based on

Technique by [@shuding](https://x.com/shuding_/status/2040416459252547588) — foreignObject snapshot → WebGL texture → GPU shader.
