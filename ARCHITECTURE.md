# shader-dom — Architecture & Learnings

Complete technical documentation of everything we discovered building this prototype. This document serves as the knowledge base for the next step: building a declarative React API (`<Canvas>`, `<Snapshot>`, `glsl`).

## Table of Contents

- [Pipeline Overview](#pipeline-overview)
- [DOM Snapshot via foreignObject](#dom-snapshot-via-foreignobject)
- [CSS Embedding in foreignObject](#css-embedding-in-foreignobject)
- [Dark Mode in foreignObject](#dark-mode-in-foreignobject)
- [The Tainted Canvas Problem](#the-tainted-canvas-problem)
- [Interactive Mode — Three Layer Architecture](#interactive-mode--three-layer-architecture)
- [Hover & Active States](#hover--active-states)
- [CSS Transitions in Snapshots](#css-transitions-in-snapshots)
- [Text Selection Through Shaders](#text-selection-through-shaders)
- [Form State Sync](#form-state-sync)
- [Canvas Sizing (Retina)](#canvas-sizing-retina)
- [WebGL Renderer](#webgl-renderer)
- [Current File Structure](#current-file-structure)
- [Current Code Reference](#current-code-reference)
- [Gotchas Reference](#gotchas-reference)
- [Target API Design](#target-api-design)

---

## Pipeline Overview

```
React DOM → getComputedStyle (hover/active) → cloneNode → syncFormState → CSS embedding (CDATA) → SVG foreignObject → Data URI → Image → Canvas 2D (2x) → WebGL texImage2D → Fragment Shader (60fps)
```

The snapshot captures the real DOM (not a Canvas 2D redraw). The shader runs on the GPU and animates independently — the texture only updates when the DOM changes.

## DOM Snapshot via foreignObject

The core technique: serialize a DOM subtree into an SVG `<foreignObject>`, load it as an image, draw to canvas, upload to WebGL.

```js
const clone = el.cloneNode(true);
const xml = new XMLSerializer().serializeToString(clone);
const svgString =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
  `<foreignObject width="100%" height="100%">` +
  `<html xmlns="http://www.w3.org/1999/xhtml">` +
  `<head><style><![CDATA[${css}]]></style></head>` +
  `<body>${xml}</body>` +
  `</html>` +
  `</foreignObject></svg>`;
```

Key details:
- `cloneNode(true)` copies all HTML attributes including inline `style`, but NOT computed styles or DOM properties (`.value`, `.checked`)
- `XMLSerializer` produces valid XHTML from the clone
- The SVG wraps content in `<html><body>` so `:root` CSS selectors resolve correctly
- Snapshot takes ~0.5ms on desktop without hover, ~2ms with hover (fits in one frame)

## CSS Embedding in foreignObject

SVG-as-image is fully sandboxed — **zero access** to host document stylesheets, external resources, fonts, or JavaScript.

### The solution

Extract all page CSS via `document.styleSheets` → `rule.cssText` and embed inside the SVG:

```js
let css = "";
for (const sheet of document.styleSheets) {
  for (const rule of sheet.cssRules) {
    css += rule.cssText;
  }
}
```

The CSS string is wrapped in `<![CDATA[...]]>` inside the `<style>` element. This is critical — CSS selectors contain characters like `>` that would break the XML parser without CDATA.

### What this enables
- All CSS classes (Tailwind, any framework) work in the snapshot
- CSS custom properties (`var()`) resolve correctly
- `@layer` ordering is preserved
- `@media` queries evaluate in the SVG context

### Caching
The CSS is extracted once on mount and cached in a `ref`. Re-extraction is only needed if stylesheets change at runtime (rare).

## Dark Mode in foreignObject

### The problem
`:root` in an SVG document matches `<svg>` (the document root), NOT `<html>` inside `<foreignObject>`. Radix UI defines light mode on `:root` and dark mode on `.dark`:

```css
:root { --sand-1: #fdfdfc; }      /* light — matches <svg> */
.dark { --sand-1: #111110; }      /* dark — needs to match <svg> too */
```

Without intervention, `:root` always wins because `.dark` is on `<html>`, a different element from `<svg>`.

### The solution
Add `class="dark"` to BOTH `<svg>` and `<html>`:

```js
const svgClass = isDark ? ' class="dark"' : "";
`<svg ...${svgClass}>` +
`<html ...${svgClass}>` +
```

`.dark` on `<svg>` overrides `:root` on `<svg>` by source order (same specificity). Dark mode custom properties cascade through `<foreignObject>` → `<html>` → content.

### Approaches we tried and rejected
- **Resolving computed values via getComputedStyle** — worked but added unnecessary complexity. The `.dark` class approach is simpler and handles the cascade natively.
- **Re-extracting CSS on theme change** — unnecessary since the CSS rules already contain both light and dark definitions.

## The Tainted Canvas Problem

When drawing an image onto Canvas and reading via WebGL `texImage2D`, the browser checks if the canvas is "origin-clean". foreignObject content in blob URLs taints the canvas in Safari.

| Image source | Contains foreignObject | Tainted? |
|---|---|---|
| `blob:` URL | Yes | **YES** (Safari, older Chrome) |
| `data:` URI | Yes | **NO** (all browsers) |

**Always use data URIs for foreignObject snapshots.**

## Interactive Mode — Three Layer Architecture

```
┌──────────────────────────────┐
│ DOM Overlay (z-index: 3)     │  ← opacity: 0, catches all events
├──────────────────────────────┤
│ Selection Layer (z-index: 2) │  ← positioned divs via getClientRects()
├──────────────────────────────┤
│ Canvas (z-index: 1)          │  ← shader output, pointer-events: none
└──────────────────────────────┘
```

### Why opacity: 0 (not background: transparent !important)

We tried several approaches for making the overlay invisible:

| Approach | getComputedStyle | ::selection | Hover/transitions |
|---|---|---|---|
| `opacity: 0` | Real values ✓ | Hidden ✗ | Work ✓ |
| `background: transparent !important` | Returns transparent ✗ | Visible ✓ | Broken ✗ |
| `visibility: hidden` | Real values ✓ | No interaction ✗ | No events ✗ |

`opacity: 0` wins because `getComputedStyle` on children returns real CSS values (opacity is a compositing property on the parent, doesn't affect children's computed styles). This enables hover state capture and CSS transition reading.

The `::selection` problem is solved by the separate selection layer (see below).

### Why NOT canvas on top?
If the canvas is on top (`pointer-events: none`, events pass through):
- Text selection highlight renders on the DOM BELOW the opaque canvas — invisible
- No CSS mechanism to make selection "punch through" an opaque element above it

### Why NOT temporarily toggling the overlay class?
We tried removing `interactive-overlay` temporarily to read `getComputedStyle` without interference. Two problems:
1. **With async pipelines** (like modern-screenshot): the browser paints the intermediate state — visible flash
2. **With sync pipelines**: `transition-all` on elements causes CSS transitions from the old state (transparent) to the new state. `getComputedStyle` reads t=0 of the transition (the old value), not the target value. Even `transition: none !important` on all elements didn't fully prevent this in practice.

## Hover & Active States

### The problem
CSS pseudo-classes (`:hover`, `:active`) are browser-internal state — not part of the DOM. `cloneNode` copies the DOM tree (classes, attributes, text), NOT the rendering engine state. Cloned elements never have `:hover`.

This is fundamentally different from React state changes (counter, clicks) which modify the actual DOM and are captured by `cloneNode`.

### The solution
For each hovered/active element, read `getComputedStyle` from the **original** DOM (which HAS `:hover` state) and apply visual properties as inline styles on the **clone** (which is detached — zero style recalc cost):

```js
const hovered = original.querySelectorAll(":hover");
const origAll = [...original.querySelectorAll("*")];
const cloneAll = [...clone.querySelectorAll("*")];

for (const target of hovered) {
  const idx = origAll.indexOf(target);
  const clonedEl = cloneAll[idx];
  const computed = getComputedStyle(target);
  for (const prop of VISUAL_PROPS) {
    clonedEl.style.setProperty(prop, computed.getPropertyValue(prop));
  }
}
```

### Why only VISUAL_PROPS?
Inlining ALL ~300 computed properties breaks layout — computed values are absolute (`width: 85.5px` instead of `auto`), which breaks flexbox, auto margins, and responsive sizing. Only visual properties are safe to inline:

```js
const VISUAL_PROPS = [
  "background-color", "background-image", "background",
  "color", "opacity",
  "transform", "scale", "rotate", "translate",
  "box-shadow", "border-color",
  "outline", "outline-color", "outline-offset",
  "text-shadow", "text-decoration-color",
  "filter", "backdrop-filter",
];
```

Layout comes from the embedded CSS (Tailwind classes). Visual hover state comes from getComputedStyle. Each mechanism does what it does best.

### Performance
- `querySelectorAll(":hover")` returns 1-3 elements (the hover chain)
- Reading ~17 properties via `getComputedStyle` per element is negligible
- Writing to detached clone elements is free (no layout/style recalc)
- Total overhead: ~1-2ms per frame during hover

### Approaches we tried and rejected
- **CSS rewriting (`:hover` → `[data-hover]`)** — worked for hover but required walking the CSSOM tree to handle Tailwind v4's CSS nesting (`CSSNestedDeclarations` inside `@media(hover:hover)` inside `@layer`). Complex and didn't support transitions.
- **modern-screenshot library** — creates an iframe per snapshot, not designed for 60fps. Caused iframe flashing.
- **Full getComputedStyle on ALL elements** — 300 props × 30 elements = 9000 setProperty calls per frame. Too slow (~44ms) and breaks layout.

## CSS Transitions in Snapshots

### The problem
Each snapshot creates a new SVG document from scratch. Elements in frame N have no relationship to frame N-1. CSS transitions require persistent elements that transition between states — impossible with per-frame SVG recreation.

### How transitions work anyway
`getComputedStyle` returns **intermediate transition values**. When a CSS transition is in progress on the live DOM, reading `getComputedStyle(el).backgroundColor` returns the current interpolated value (not the start or end). Since we read from the live DOM and apply to the clone, the transition is effectively "sampled" each frame.

The transition runs on the live DOM (via CSS `transition-all`). The snapshot captures each frame of the transition via `getComputedStyle`. The result is smooth animation in the shader output.

### Requirement
This only works with `opacity: 0` on the overlay. The `background: transparent !important` approach prevents transitions because it overrides the target value — there's nothing to transition to.

## Text Selection Through Shaders

### The problem
`opacity: 0` hides `::selection` highlights. CSS `opacity` composites the entire element (including pseudo-elements) as one atomic group — `::selection` cannot escape the parent's opacity.

### Approaches we evaluated

| Approach | Works? | Why/why not |
|---|---|---|
| CSS Custom Highlight API (`::highlight()`) | No | Paints inside the opacity compositing group |
| `::selection` with `opacity: 1` override | No | `opacity` not allowed in `::selection` |
| `mix-blend-mode` tricks | No | Zero-alpha content produces nothing regardless of blend mode |
| `visibility: hidden` + visible children | No | Prevents text selection entirely |
| Duplicate text layer | Partially | Fragile synchronization, pointer-events conflicts |
| Dynamic opacity switching | Partially | Hover breaks during selection (getComputedStyle returns transparent) |
| **getClientRects() overlay** | **Yes** | Fully decoupled from overlay opacity |

### The solution: getClientRects() selection layer

A separate div layer (z-index: 2, between canvas and overlay) renders selection highlights as positioned divs:

1. `selectionchange` event fires when selection changes
2. `Range.getClientRects()` returns geometry for each selected line — works on `opacity: 0` elements because it reads from layout, not rendering
3. Positioned divs with `background: rgba(100, 130, 255, 0.35)` are placed at the selection coordinates
4. A div pool avoids DOM creation/destruction per event

### Tradeoff
Selection highlights are not pixel-perfect native (no OS-specific rounded corners or squish effects). But they work consistently, don't conflict with hover, and are independent of the overlay opacity mechanism.

## Form State Sync

`cloneNode(true)` copies HTML **attributes** but not DOM **properties**:

| What | Attribute (copied) | Property (not copied) |
|---|---|---|
| Input text | `value="initial"` | `.value = "user typed"` |
| Checkbox | `checked` (initial) | `.checked = true` (runtime) |
| Textarea | — | `.value = "content"` |
| Select | — | `.selectedIndex = 2` |
| Scroll | — | `.scrollTop = 150` |

The `syncFormState` function copies these properties from original to clone before serialization:

```js
function syncFormState(original, clone) {
  const origInputs = original.querySelectorAll("input, textarea, select");
  const cloneInputs = clone.querySelectorAll("input, textarea, select");
  for (let i = 0; i < origInputs.length; i++) {
    // Copy .value, .checked, .selectedIndex, .textContent
  }
  // Also sync scrollTop/scrollLeft on scrollable elements
}
```

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
canvas.style.width = (texture.width / 2) + "px";
canvas.style.height = (texture.height / 2) + "px";
```

## WebGL Renderer

- WebGL 1 (`canvas.getContext("webgl")`)
- Full-screen quad (triangle strip, 4 vertices)
- Vertex shader passes through position and texture coordinates
- Fragment shader receives `u_texture`, `u_time`, `u_resolution`
- Render loop at 60fps via `requestAnimationFrame`
- Texture updates only when snapshot changes (new `setTexture`)

## Current File Structure

```
shader-dom/
├── index.html                     # Entry point + interactive-overlay CSS
├── public/fonts/                  # InterVariable.woff2, GeistMono.woff2
├── src/
│   ├── main.tsx                   # React entry
│   ├── App.tsx                    # Page composition (header, headline, demo, controls)
│   ├── style.css                  # Tailwind imports, base layer, custom variants
│   ├── theme.css                  # Radix color tokens (Sand + Orange), radius system
│   ├── fonts.css                  # @font-face declarations
│   ├── components/
│   │   ├── button.tsx             # CVA button with solid/ghost/outline variants
│   │   ├── fit-headline.tsx       # Responsive headline (container query + motion)
│   │   ├── inset-shadow.tsx       # SVG filter inset shadow
│   │   ├── demo-content.tsx       # Demo card (snapshotted content)
│   │   ├── shader-demo.tsx        # Canvas + overlay + snapshot orchestration
│   │   ├── shader-selector.tsx    # Shader button row
│   │   ├── controls.tsx           # Live/paused toggle + performance badge
│   │   └── pipeline-diagram.tsx   # Visual pipeline representation
│   ├── hooks/
│   │   ├── use-dom-snapshot.ts    # DOM → foreignObject → canvas texture
│   │   ├── use-webgl-shader.ts    # WebGL setup, shader compilation, render loop
│   │   └── use-selection-highlight.ts  # Text selection via getClientRects
│   └── lib/
│       ├── shaders.ts             # GLSL shader definitions
│       └── utils.ts               # cn() utility
```

## Current Code Reference

### Hooks

| Hook | Purpose | Key detail |
|---|---|---|
| `useDomSnapshot(domRef, deps)` | CSS embedding + getComputedStyle (hover) + clone + foreignObject | Returns `{ texture, snapshot }` |
| `useWebGLShader(canvasRef, texture, shaderCode)` | Compile shader, upload texture, render loop | Returns `{ updateTexture }` |
| `useSelectionHighlight(containerRef, highlightRef)` | Render selection highlights via getClientRects | Manages div pool, listens to selectionchange |

### Shaders (5 built-in)

| Key | Name | Effect |
|---|---|---|
| `wave` | Wave Distortion | Sinusoidal UV displacement |
| `chromatic` | Chromatic Aberration | RGB channel offset by distance from center |
| `glitch` | Glitch | Random horizontal shifts + color separation |
| `pixelate` | Pixelate + Glow | Dynamic pixel grid with bloom |
| `hologram` | Hologram | Scanlines, flicker, cyan tint |

## Gotchas Reference

| Issue | Cause | Fix |
|---|---|---|
| `SecurityError: tainted canvas` | Blob URL with foreignObject | Use data URI |
| Snapshot layout differs from DOM | Missing `box-sizing: border-box` in foreignObject | CSS embedding includes Tailwind's base reset |
| CSS classes don't work in snapshot | SVG-as-image has no access to host stylesheets | Embed all CSS via `document.styleSheets` + CDATA |
| Dark mode doesn't work in snapshot | `:root` matches `<svg>`, not `<html>` in foreignObject | Add `class="dark"` to `<svg>` element |
| `:hover` not captured in snapshot | Pseudo-classes are browser state, not DOM | getComputedStyle on original → inline on clone |
| getComputedStyle returns transparent | `background: transparent !important` on overlay | Use `opacity: 0` instead |
| CSS transitions not captured | `!important` overrides prevent transitions | `opacity: 0` preserves real computed values |
| Transition reads t=0 value | Toggling overlay class triggers CSS transition | Don't toggle classes — use `opacity: 0` permanently |
| All computed styles break layout | Inlining width/height/padding overrides flexbox | Only inline VISUAL_PROPS (colors, transforms, shadows) |
| getComputedStyle slow (44ms) | Setting 300 props on LIVE DOM elements | Apply to detached CLONE instead (zero style recalc) |
| `::selection` hidden | `opacity: 0` composites entire element including pseudo-elements | Separate selection layer via getClientRects() divs |
| Input values not in snapshot | `cloneNode` copies attributes, not `.value` property | `syncFormState` copies runtime properties to clone |
| External fonts missing | SVG-as-image blocks external resources | Embed fonts via CSS embedding (page stylesheets include @font-face) |
| modern-screenshot iframe flash | Library creates/destroys iframe per snapshot at 60fps | Don't use screenshot libraries for real-time — use custom pipeline |

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

### Key design decisions needed

1. **How does `<Snapshot>` communicate the texture to `<Canvas>`?** Context? Ref? Callback?
2. **How does `glsl.fragment` map JSX interpolations to shader uniforms?** Each `<Snapshot>` becomes a `sampler2D`, each number becomes a `float`, etc.
3. **Interactive mode** — should `<Snapshot interactive>` automatically apply the three-layer overlay pattern?
4. **Multiple snapshots** — can a shader combine textures from multiple `<Snapshot>` components?
5. **Custom uniforms** — how to pass `u_mouse`, scroll position, or React state as shader uniforms?
6. **Snapshot frequency** — every frame? On DOM change (MutationObserver)? Manual trigger?
