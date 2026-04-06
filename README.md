# shader-dom

Apply GPU fragment shaders to live React DOM elements using WebGL.

Takes a real snapshot of any React component via SVG `foreignObject`, uploads it as a WebGL texture, and runs it through a fragment shader at 60fps.

## Pipeline

```
React DOM → Inline Styles → XMLSerializer → SVG foreignObject → Data URI → Canvas 2D → WebGL texImage2D → Fragment Shader
```

1. **React DOM** — renders the component normally in the browser
2. **Inline Styles** — walks the DOM tree copying `getComputedStyle()` to each element's inline `style`, because CSS inheritance and external stylesheets don't work inside foreignObject
3. **XMLSerializer** — serializes the cloned DOM to valid XHTML
4. **SVG foreignObject** — wraps the serialized HTML in an SVG with `<foreignObject>`
5. **Data URI** — encodes the SVG as `data:image/svg+xml;charset=utf-8,...` (this is critical — see below)
6. **Canvas 2D** — loads the data URI into an `Image`, draws it onto a canvas at 2x for retina
7. **WebGL texImage2D** — uploads the canvas as a GPU texture
8. **Fragment Shader** — processes every pixel at 60fps on the GPU

### Why data URI instead of blob URL?

The naive approach uses `URL.createObjectURL(blob)` to load the SVG into an Image. This **taints the canvas** in Safari and older Chrome, causing `texImage2D` to throw a `SecurityError`.

Data URIs (`data:image/svg+xml;charset=utf-8,...`) are treated as same-origin by all browsers, so the canvas stays clean and WebGL can read it.

```js
// Taints the canvas (blob URL)
const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
img.src = URL.createObjectURL(blob);

// Does NOT taint (data URI)
img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
```

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

## Based on

Technique by [@shuding](https://x.com/shuding_/status/2040416459252547588) — foreignObject snapshot → WebGL texture → GPU shader.
