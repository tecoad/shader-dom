# shader-dom

Apply GPU fragment shaders to live, interactive React DOM elements using WebGL.

Takes a real snapshot of any React component via SVG `foreignObject`, uploads it as a WebGL texture, and runs it through a fragment shader at 60fps — while keeping the DOM fully interactive (clicks, hover, text selection, form inputs).

## Pipeline

```
React DOM → getComputedStyle (hover/active) → cloneNode → syncFormState → CSS embedding (CDATA) → SVG foreignObject → Data URI → Canvas 2D (2x) → WebGL texImage2D → Fragment Shader (60fps)
```

### Key steps explained

1. **getComputedStyle on hovered/active elements** — reads real visual values (including transition intermediates) from the browser, applies them as inline styles on the clone. Only runs on 1-3 elements per frame.
2. **cloneNode(true)** — deep copies the DOM subtree with all attributes and inline styles.
3. **syncFormState** — copies `.value`, `.checked`, `.scrollTop` from inputs/textareas/selects to the clone (cloneNode doesn't capture these runtime properties).
4. **CSS embedding** — all page stylesheets are extracted and embedded inside the SVG `<style>` block wrapped in `<![CDATA[...]]>` to handle special XML characters in CSS selectors.
5. **Dark mode** — `class="dark"` is set on both `<svg>` and `<html>` in the foreignObject, so `:root` and `.dark` selectors resolve correctly. `:root` in SVG-as-image matches `<svg>` (the document root), not `<html>`.
6. **Data URI** — avoids tainted canvas in Safari (blob URLs taint).

### Why data URI instead of blob URL?

Blob URLs **taint the canvas** in Safari (and older Chrome), causing WebGL's `texImage2D` to throw a `SecurityError`. Data URIs are treated as same-origin by all browsers.

## Interactive Mode

Three-layer architecture:

```
┌──────────────────────────────┐
│ DOM Overlay (z-index: 3)     │  ← opacity: 0, catches all events
│ hover/active/click/type      │     getComputedStyle returns real values
├──────────────────────────────┤
│ Selection Layer (z-index: 2) │  ← positioned divs via getClientRects()
│ text selection highlights    │     independent of overlay opacity
├──────────────────────────────┤
│ Canvas (z-index: 1)          │  ← shader output at 60fps
│ pointer-events: none         │
└──────────────────────────────┘
```

### Why opacity: 0?

The overlay must be invisible so the shader shows through. `opacity: 0` was chosen over `background: transparent !important` because:
- `getComputedStyle` on children returns **real values** (not `transparent`)
- `:hover` and `:active` pseudo-class styles are captured correctly
- CSS transitions are captured mid-animation (getComputedStyle returns intermediate values)

### Why a separate selection layer?

`opacity: 0` hides `::selection` highlights (opacity composites the entire element as one atomic group — pseudo-elements can't escape it). Text selection still WORKS with opacity: 0 (the browser tracks it), but the highlight is invisible.

The selection layer uses `Range.getClientRects()` to read selection geometry (works regardless of opacity) and renders positioned divs as highlights above the shader canvas.

### Hover & Active States

CSS pseudo-classes (`:hover`, `:active`) are browser-internal state — they don't exist in the DOM. `cloneNode` copies the DOM tree, not browser state. So cloned elements never have `:hover`.

The solution: for each hovered/active element, read `getComputedStyle` (which includes pseudo-class-applied styles) and inline the visual properties on the **clone** (not the live DOM). Only visual properties are copied (background-color, transform, scale, box-shadow, etc.) — layout properties (width, height, padding) are excluded to avoid breaking flexbox/layout in the foreignObject.

### Form State

`cloneNode` copies HTML **attributes** but not DOM **properties**. Input `.value`, checkbox `.checked`, and element `.scrollTop` are runtime properties that must be synced manually before serialization.

## CSS in foreignObject

SVG-as-image is sandboxed — no access to host document stylesheets. All CSS must be embedded inside the SVG.

### CSS embedding

All page stylesheets are extracted via `document.styleSheets` → `rule.cssText` and embedded in a `<style><![CDATA[...]]></style>` block. The CDATA wrapper prevents XML parser errors from CSS characters like `>` in selectors.

### Dark mode in foreignObject

`:root` in an SVG document matches `<svg>`, not `<html>`. Radix UI defines dark mode tokens on `.dark` selector. Adding `class="dark"` to the `<svg>` element makes `.dark` match at the document root level, overriding `:root` light-mode values by source order.

## Shaders

- **Wave Distortion** — sinusoidal UV displacement
- **Chromatic Aberration** — RGB channel offset based on distance from center
- **Glitch** — random horizontal line shifts with color separation
- **Pixelate + Glow** — dynamic pixel grid with bloom effect
- **Hologram** — scanlines, flicker, and cyan-tinted color shift

## Running

```bash
bun install
bun dev
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical documentation.

## vs. html2canvas

html2canvas walks the DOM element-by-element, calls `getComputedStyle()` on each node, and redraws everything manually on a Canvas 2D. It incidentally captures `:hover` states but is **far too slow for real-time rendering** (~200-500ms per capture).

shader-dom delegates rendering to the browser via SVG `foreignObject`. The browser handles all layout and painting natively, making 60fps feasible. Hover/active states are captured selectively via `getComputedStyle` on only the 1-3 interactive elements per frame.

| | html2canvas | shader-dom |
|---|---|---|
| Rendering | Manual Canvas 2D redraw | Browser-native via foreignObject |
| Speed | Single capture (~200-500ms) | Real-time (~60fps) |
| CSS support | Partial (re-implements CSS) | Full (browser renders it) |
| Pseudo-states | Incidental via getComputedStyle (all elements) | Targeted getComputedStyle (1-3 elements) |
| Transitions | Not captured (freezes animations) | Captured (getComputedStyle returns intermediate values) |
| Use case | Screenshots | Live GPU shader effects |

## Known Limitations

- **External images** — blocked by foreignObject cross-origin restrictions. Use inline SVG or base64.
- **iframes, video, canvas** — foreignObject cannot render embedded content.
- **CSS @keyframes animations** — each snapshot is static; only the current frame is captured.
- **`::selection` rendering** — not native (uses positioned divs via getClientRects). Visually close but not pixel-perfect to OS native selection.

## Based on

Technique by [@shuding](https://x.com/shuding_/status/2040416459252547588) — foreignObject snapshot → WebGL texture → GPU shader.
