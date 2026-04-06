# shader-dom — Architecture & Learnings

Complete technical documentation of everything we discovered building this prototype. This document serves as the knowledge base for the next step: building a declarative React API (`<Canvas>`, `<Snapshot>`, `glsl`).

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [DOM Snapshot via foreignObject](#dom-snapshot-via-foreignobject)
- [The Tainted Canvas Problem](#the-tainted-canvas-problem)
- [CSS Isolation in SVG-as-Image](#css-isolation-in-svg-as-image)
- [Interactive Mode (PDF.js Pattern)](#interactive-mode-pdfjs-pattern)
- [Text Selection Through Shaders](#text-selection-through-shaders)
- [Canvas Sizing (Retina)](#canvas-sizing-retina)
- [box-sizing Inside foreignObject](#box-sizing-inside-foreignobject)
- [WebGL Renderer](#webgl-renderer)
- [Current File Structure](#current-file-structure)
- [Current Code Reference](#current-code-reference)
- [Target API Design](#target-api-design)
- [Migration Notes](#migration-notes)

---

## Pipeline Overview

```
React DOM → cloneNode → XMLSerializer → SVG foreignObject → Data URI → Image → Canvas 2D (2x) → WebGL texImage2D → Fragment Shader (60fps)
```

The snapshot captures the real DOM (not a Canvas 2D redraw). The shader runs on the GPU and animates independently — the texture only updates when the DOM changes.

## DOM Snapshot via foreignObject

The core technique: serialize a DOM subtree into an SVG `<foreignObject>`, load it as an image, draw to canvas, upload to WebGL.

```js
const clone = el.cloneNode(true);
const xml = new XMLSerializer().serializeToString(clone);
const svgString =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
  `<foreignObject width="100%" height="100%">` +
  `<style xmlns="http://www.w3.org/1999/xhtml">* { margin: 0; padding: 0; box-sizing: border-box; }</style>` +
  `${xml}</foreignObject>` +
  `</svg>`;

const img = new Image();
img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
```

Key details:
- `cloneNode(true)` copies all HTML attributes including inline `style`, but NOT computed styles from CSS classes/stylesheets
- `XMLSerializer` produces valid XHTML from the clone
- The clone is independent — modifying the live DOM after cloning doesn't affect the snapshot
- Snapshot takes <16ms on desktop (fits in one frame)

## The Tainted Canvas Problem

When you draw an image onto a Canvas and then try to read it via WebGL `texImage2D`, the browser checks if the canvas is "origin-clean". If the image source is cross-origin or security-sensitive, the canvas becomes **tainted** and `texImage2D` throws `SecurityError`.

### What taints the canvas

| Image source | Contains foreignObject | Tainted? |
|---|---|---|
| `blob:` URL | Yes | **YES** (Safari, older Chrome) |
| `data:` URI | Yes | **NO** (all browsers) |
| `http://` URL | Yes | **YES** (all browsers) |

### The fix

Use a data URI, not a blob URL:

```js
// TAINTS — blob URL
const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
img.src = URL.createObjectURL(blob);

// DOES NOT TAINT — data URI (same-origin in all browsers)
img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
```

Data URIs are treated as same-origin because they are embedded directly — no network fetch, no cross-origin risk.

### Browser status

- Chrome 131+ also fixed blob URLs (no longer taint)
- Firefox: blob URLs never tainted
- Safari: blob URLs still taint as of 2026 — **must use data URI**

## CSS Isolation in SVG-as-Image

This is a critical property we exploit for interactive mode.

When SVG is loaded as an image (via data URI or blob URL for `drawImage()`):
- **Host document stylesheets are completely inaccessible**
- Only inline `<style>` blocks within the SVG and inline `style` attributes work
- External resources (fonts, images) are blocked
- JavaScript is disabled

This means:
- `cloneNode(true)` copies the `class` attribute, but the CSS rules for that class don't exist in the SVG context
- Only inline `style` attributes produce visual effects in the snapshot
- We can freely add CSS classes to the live DOM (like `.interactive-overlay`) without affecting the snapshot

**Important:** If the component uses CSS classes or external stylesheets for visual styling (not just inline styles), those styles won't appear in the snapshot. Components must use inline styles for anything that should be captured.

## Interactive Mode (PDF.js Pattern)

Inspired by how PDF.js overlays selectable text on canvas-rendered PDFs.

### Architecture

```
┌─────────────────────────────┐
│ DOM (z-index: 2)            │  ← interactive, visually transparent
│ class="interactive-overlay" │     pointer-events: all
│ color: transparent          │     text selectable
│ background: transparent     │     buttons clickable
├─────────────────────────────┤
│ Canvas (z-index: 1)         │  ← shader output, visual layer
│ pointer-events: none        │     60fps GPU rendering
└─────────────────────────────┘
```

The DOM is on TOP, the canvas is BELOW. The DOM is fully interactive (clicks, hover, selection, tab navigation). The canvas just shows the shader effect. Since the DOM is transparent, the shader shows through.

### Why DOM on top, not canvas on top?

If the canvas is on top with `pointer-events: none`:
- Clicks pass through, but text selection highlight renders BELOW the opaque canvas — invisible
- Scroll, drag, and other complex interactions can be unreliable

With DOM on top:
- All interactions are native (browser handles everything)
- Selection highlight renders on top of the shader — visible
- No `pointer-events` tricks needed on the canvas

### CSS for transparency

```css
.interactive-overlay {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
}
.interactive-overlay * {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  outline-color: transparent !important;
  text-shadow: none !important;
}
```

`!important` is required because we need to override inline styles on child elements (inline styles have specificity `1,0,0,0` which beats any selector).

### Why this doesn't break the snapshot

The snapshot uses `cloneNode(true)` which copies inline `style` attributes (the real colors, backgrounds, gradients). The `class="interactive-overlay"` is also copied, but inside the SVG-as-image context, no stylesheet defines `.interactive-overlay`, so the class has no effect. The snapshot renders with full visual fidelity.

We also call `clone.classList.remove("interactive-overlay")` as a safety measure.

## Text Selection Through Shaders

### The problem

`opacity: 0` hides the `::selection` highlight too (opacity applies to the entire composite). `visibility: hidden` prevents selection entirely.

### The solution

`color: transparent` with `opacity: 1`. The element is fully opaque (so `::selection` renders normally), but the text color is invisible (so the shader shows through).

```css
.interactive-overlay ::selection {
  background: rgba(100, 130, 255, 0.35);
  color: transparent;
  -webkit-text-fill-color: transparent;
}
```

### Safari fix

Safari ignores `color: transparent` inside `::selection` and shows white text. The fix is to also set `-webkit-text-fill-color: transparent` in the `::selection` rule. Both `color` and `-webkit-text-fill-color` must be transparent.

### Properties allowed in `::selection`

Only these CSS properties work inside `::selection`:
- `color`
- `background-color`
- `text-decoration`
- `text-shadow`
- `-webkit-text-fill-color`
- `-webkit-text-stroke-color`
- `-webkit-text-stroke-width`

Notably, `background-image` is ignored in `::selection`.

## Canvas Sizing (Retina)

The snapshot creates a canvas at 2x resolution for retina displays:

```js
canvas.width = width * 2;
canvas.height = height * 2;
ctx.scale(2, 2);
ctx.drawImage(img, 0, 0, width, height);
```

The WebGL canvas must set CSS dimensions to half the buffer size:

```js
canvas.width = texture.width;   // 840 (internal pixels)
canvas.height = texture.height; // 680 (internal pixels)
canvas.style.width = (texture.width / 2) + "px";   // 420 CSS px
canvas.style.height = (texture.height / 2) + "px";  // 340 CSS px
```

Without explicit CSS height, the canvas defaults to its `height` attribute value in CSS pixels (e.g., 680px instead of 340px), distorting the aspect ratio and making text appear to wrap differently.

## box-sizing Inside foreignObject

The host document's `* { box-sizing: border-box }` rule doesn't apply inside foreignObject (SVG-as-image has no access to host stylesheets). The default is `content-box`.

If a component uses `width: 420` and `padding: 32`:
- With `border-box`: total width = 420px, content = 356px
- With `content-box`: total width = 484px, content = 420px

Text wraps at different widths, causing visible layout differences between DOM and shader.

### Fix

Inject the CSS reset inside the SVG:

```js
const svgString =
  `<svg ...>` +
  `<foreignObject width="100%" height="100%">` +
  `<style xmlns="http://www.w3.org/1999/xhtml">* { margin: 0; padding: 0; box-sizing: border-box; }</style>` +
  `${xml}</foreignObject>` +
  `</svg>`;
```

Any global CSS that affects layout must be duplicated inside the SVG.

## WebGL Renderer

### Setup

- WebGL 1 (`canvas.getContext("webgl")`)
- Full-screen quad (triangle strip, 4 vertices)
- Vertex shader passes through position and texture coordinates
- Fragment shader receives `u_texture` (the DOM snapshot), `u_time`, and `u_resolution`

### Render loop

The shader runs at 60fps via `requestAnimationFrame`. The texture updates only when the DOM changes (new snapshot). The shader animates via `u_time` uniform.

### Cleanup

On unmount or shader change, all GL resources are deleted:
```js
cancelAnimationFrame(rafRef.current);
gl.deleteTexture(glTex);
gl.deleteProgram(program);
gl.deleteShader(vs);
gl.deleteShader(fs);
```

### Vertex shader (shared)

```glsl
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

### Fragment shader uniforms

| Uniform | Type | Description |
|---|---|---|
| `u_texture` | `sampler2D` | The DOM snapshot texture |
| `u_time` | `float` | Elapsed seconds since start |
| `u_resolution` | `vec2` | Canvas pixel dimensions |

## Current File Structure

```
shader-dom/
├── index.html          # Entry point + interactive-overlay CSS
├── main.jsx            # React bootstrap
├── shader-dom.jsx      # All logic: snapshot, WebGL, shaders, UI
├── package.json        # Vite + React 18
├── vite.config.js      # Vite + @vitejs/plugin-react
└── README.md           # Public-facing docs
```

## Current Code Reference

### Hooks

| Hook | Purpose | Key detail |
|---|---|---|
| `useDomSnapshot(domRef, deps)` | Clone DOM → foreignObject SVG → data URI → Canvas | Returns `{ texture, snapshot }` |
| `useWebGLShader(canvasRef, texture, shaderCode)` | Compile shader, upload texture, render loop | Returns `{ updateTexture }` |

### Components

| Component | Purpose |
|---|---|
| `DemoContent` | The demo card being snapshotted (inline styles, interactive buttons) |
| `InteractiveButton` | Button with hover/press states via React state (captured in snapshot) |
| `App` | Orchestrates everything: shader selector, controls, layout modes |

### Shaders (5 built-in)

| Key | Name | Effect |
|---|---|---|
| `wave` | Wave Distortion | Sinusoidal UV displacement |
| `chromatic` | Chromatic Aberration | RGB channel offset by distance from center |
| `glitch` | Glitch | Random horizontal shifts + color separation |
| `pixelate` | Pixelate + Glow | Dynamic pixel grid with bloom |
| `hologram` | Hologram | Scanlines, flicker, cyan tint |

---

## Target API Design

The next step is to extract the prototype into a declarative React API:

```jsx
import { Canvas, Snapshot, glsl } from 'shader-dom'

function App() {
  return (
    <Canvas width={640} height={360}>
      {glsl.fragment`
        vec4 dom = texture(
          ${(
            <Snapshot>
              <div style={{ width: '100%', height: '100%' }}>
                hello
              </div>
            </Snapshot>
          )},
          uv
        );
        return dom;
      `}
    </Canvas>
  )
}
```

### Components to build

| Component | Responsibility |
|---|---|
| `<Canvas>` | Creates WebGL context, manages render loop, provides `u_time`/`u_resolution` uniforms |
| `<Snapshot>` | Renders children to DOM, runs foreignObject snapshot pipeline, provides texture to parent `<Canvas>` |
| `glsl.fragment` | Tagged template literal that compiles GLSL, interpolates `<Snapshot>` as `sampler2D` uniforms |

### Key design decisions needed

1. **How does `<Snapshot>` communicate the texture to `<Canvas>`?** Context? Ref? Callback?
2. **How does `glsl.fragment` map JSX interpolations to shader uniforms?** Each `<Snapshot>` becomes a `sampler2D`, each number becomes a `float`, etc.
3. **Interactive mode** — should `<Snapshot interactive>` automatically apply the overlay pattern? Or is it a separate wrapper?
4. **Multiple snapshots** — can a shader combine textures from multiple `<Snapshot>` components?
5. **Custom uniforms** — how to pass `u_mouse`, scroll position, or React state as shader uniforms?
6. **Snapshot frequency** — every frame? On DOM change (MutationObserver)? Manual trigger?

## Migration Notes

### What to preserve from the prototype

- **Data URI approach** for foreignObject (not blob URL) — critical for Safari
- **CSS reset injection** inside SVG (`box-sizing: border-box`, `margin: 0`, `padding: 0`)
- **`clone.classList.remove()`** to strip transparency classes from snapshot clones
- **Retina handling** (2x canvas with explicit CSS width/height at 1x)
- **Interactive overlay CSS pattern** — `color: transparent` + `::selection` with explicit colors
- **Safari `::selection` fix** — both `color: transparent` and `-webkit-text-fill-color: transparent`
- **Canvas CSS dimensions** must be set explicitly (not just `width: 100%`) to match DOM size

### What can be improved

- **No `inlineStyles` needed** if components use inline styles — but a general-purpose `<Snapshot>` should support components with CSS classes. Consider optional style inlining.
- **Snapshot frequency** — current prototype snapshots every frame. For the API, default to snapshotting on DOM changes (MutationObserver + ResizeObserver) and expose a manual trigger.
- **WebGL 2** — the prototype uses WebGL 1. The API could target WebGL 2 for `texture()` instead of `texture2D()`, and for features like multiple render targets.
- **Shader compilation caching** — recompile only when shader code changes, not on every texture update.
- **OffscreenCanvas** — move snapshot rendering to a worker for better perf on complex DOMs.

### Gotchas to remember

| Issue | Cause | Fix |
|---|---|---|
| `SecurityError: tainted canvas` | Blob URL with foreignObject | Use data URI |
| Snapshot layout differs from DOM | Missing `box-sizing: border-box` in foreignObject | Inject `<style>` in SVG |
| Text visible during selection (Safari) | Safari ignores `color: transparent` in `::selection` | Add `-webkit-text-fill-color: transparent` |
| Canvas aspect ratio distorted | CSS height not set (defaults to buffer height) | Set `canvas.style.height` explicitly |
| External fonts missing in snapshot | SVG-as-image blocks external resources | Embed fonts as base64 in SVG `<style>` |
| CSS classes don't work in snapshot | SVG-as-image has no access to host stylesheets | Use inline styles or inject `<style>` in SVG |
| `opacity: 0` hides selection highlight | Opacity applies to entire composite including `::selection` | Use `color: transparent` instead |
