# shader-dom

GPU shaders on live, interactive DOM elements. Wrap any React content in `<HtmlTexture>` and render it through a `<Shader>` — either a hand-written GLSL fragment or a full three.js scene (e.g. `liquid1.min.js`).

```tsx
import { Shader, HtmlTexture } from "shader-dom"

function App() {
  return (
    <Shader
      fragment={`
        uniform sampler2D uTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(uTexture, vUv);
        }
      `}
    >
      <HtmlTexture interactive>
        <button onClick={() => alert("works!")}>Click me</button>
      </HtmlTexture>
    </Shader>
  )
}
```

Clicks, hover, text selection, form inputs, CSS transitions — all work through the shader at 60fps.

## Install

```bash
npm install shader-dom three
```

Peer dependencies: `react >=18`, `react-dom >=18`, `three >=0.170`.

`shaders >=2` is an optional peer dependency used only by the `shader-dom/shaders` adapter.

## Sizing model

`<Shader>` sizes to its content: the `<HtmlTexture>` overlay flows in-document and takes its children's intrinsic dimensions, which in turn sizes the `<Shader>` container. The render canvas fills the container.

To make the shader a specific size, put the dimensions on the content:

```tsx
<Shader fragment={glsl}>
  <HtmlTexture interactive>
    <div style={{ width: 500, height: 500 }}>
      {/* shader canvas will be 500×500 */}
    </div>
  </HtmlTexture>
</Shader>
```

## Components

### `<Shader>`

Renders a GLSL fragment shader or a full three.js scene.

**Fragment path:**

```tsx
<Shader
  fragment={glslString}
  uniforms={{ uIntensity: 0.5, uColor: [1, 0, 0] }}
>
  <HtmlTexture interactive>...</HtmlTexture>
</Shader>
```

Built-in uniforms: `sampler2D uTexture` (DOM snapshot, oriented top-down to match DOM), `float uTime` (seconds), `vec2 uResolution`.

Custom `uniforms` prop: `number` → `float`; `number[]` of length 2/3/4 → `vec2`/`vec3`/`vec4`. Texture uniforms are not supported in v1 — use the scene path for that.

Default vertex shader flips Y so `vUv = (0, 0)` is top-left of the DOM content.

**Scene path:**

```tsx
import { Shader, type ShaderScene } from "shader-dom"

const myScene: ShaderScene = canvas => {
  const renderer = /* your three.js / regl / raw WebGL / ... */
  return {
    onSnapshot: snapshot => {
      // Called on every successful snapshot. Throttle if expensive.
    },
    onResize: (w, h) => renderer.setSize(w, h),
    dispose: () => renderer.dispose(),
  }
}

<Shader scene={myScene}>
  <HtmlTexture interactive>...</HtmlTexture>
</Shader>
```

`onSnapshot` fires after each successful snapshot (interactive mode: per frame). The canvas reference is stable; its contents update in place. For three-based scenes, wrap the canvas in `CanvasTexture` once and set `needsUpdate = true` each frame. For scenes that consume a data URL (e.g. `liquid1.loadImage`), throttle manually.

**Built-in preset — `liquid1` (via `shader-dom/presets/liquid`):**

The scene path has a ready-made preset wrapping [`threejs-components`](https://github.com/ksenia-k/threejs-components)' `liquid1` background. Exposed as an optional sub-export so it's only bundled when you import it.

```tsx
import { Shader, HtmlTexture } from "shader-dom"
import { liquidPreset } from "shader-dom/presets/liquid"

<Shader scene={liquidPreset({ displacementScale: 3, rain: true })}>
  <HtmlTexture interactive>
    <div className="h-dvh w-dvw flex items-center justify-center bg-white">
      <h1>Hello</h1>
    </div>
  </HtmlTexture>
</Shader>
```

Options (all optional):

| Option | Type | Default | Description |
|---|---|---|---|
| `metalness` | `number` | `0.35` | PBR metalness on the liquid plane |
| `roughness` | `number` | `0.45` | PBR roughness on the liquid plane |
| `displacementScale` | `number` | `2` | Displacement amplitude multiplier |
| `rain` | `boolean` | `false` | Whether raindrops fall on the surface |
| `rainTime` | `number` | — | Seconds between raindrops (when `rain: true`) |
| `pixelRatio` | `number \| "auto"` | `"auto"` | Renderer pixel ratio (`"auto"` = `window.devicePixelRatio`) |
| `envMap` | `string` | — | Environment map URL for PBR reflections |

The preset weighs ~636 KB (the bundled three.js app + wrapper). Only imported if you use it — the core `shader-dom` bundle is unaffected.

**Scene recipe — writing your own wrapping (for other third-party scenes):**

Same pattern used by the liquid preset. Useful when you want to plug e.g. `regl`, raw WebGL, or another `threejs-components` module.

```tsx
import { Shader, HtmlTexture, type ShaderScene } from "shader-dom"
import { CanvasTexture, SRGBColorSpace } from "three"
import MyScene from "./vendor/my-scene.js"

const myScene: ShaderScene = canvas => {
  const app = MyScene(canvas)
  // Bypass any async image-URL API — wrap the snapshot canvas once and
  // let three upload via `needsUpdate` each frame.
  let tex: CanvasTexture | null = null
  let boundCanvas: HTMLCanvasElement | null = null

  return {
    onSnapshot(snapshot) {
      if (boundCanvas !== snapshot) {
        tex?.dispose()
        tex = new CanvasTexture(snapshot)
        tex.colorSpace = SRGBColorSpace
        boundCanvas = snapshot
        app.setImage(tex) // or whatever texture-accepting API the scene exposes
      } else if (tex) {
        tex.needsUpdate = true
      }
    },
    dispose() {
      tex?.dispose()
      app.dispose()
    },
  }
}
```

Notes on this pattern:

- **`setImage(CanvasTexture)` instead of `loadImage(dataURL)`** avoids a per-frame PNG encode/decode cycle. `loadImage`-style APIs are designed for one-off image URLs; for live DOM content you want the zero-copy canvas path.
- **Third-party scenes often bundle their own three.js instance**. Our `CanvasTexture` instance is structurally compatible — three's renderer identifies textures by `.isTexture` and shape, not instanceof.
- **Displacement shaders work best with soft content**. Hard-edged DOM (sharp text on solid background) produces choppy displacement. Adding subtle radial gradients in `mix-blend-mode: multiply` over the base color gives the simulation gentler gradients to amplify.

### `<HtmlTexture>`

Captures React content as the DOM snapshot fed to the parent `<Shader>`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | Content to render through the shader |
| `interactive` | `boolean` | `false` | RAF snapshot loop + click/hover/selection/caret capture |

One `<HtmlTexture>` per `<Shader>` in v1.

### `<EscapeShader>`

Children render normally without shader effects, while preserving layout position.

```tsx
<HtmlTexture interactive>
  <div className="card">
    <EscapeShader>
      <h1>Renders without effects</h1>
    </EscapeShader>
    <p>Renders through the shader</p>
  </div>
</HtmlTexture>
```

## Primitives (power users)

For custom pipelines that don't fit `<Shader>`:

```tsx
import { useDomSnapshot, snapshotToCanvas } from "shader-dom"

// Hook — returns a live canvas that updates as the DOM changes.
// Returns null until the first successful snapshot populates the canvas.
const snapshotCanvas = useDomSnapshot(sourceRef, {
  interactive: true,
  onSnapshot: canvas => { /* fires on every snapshot */ },
})

// Or imperatively
await snapshotToCanvas(element, myCanvas)
```

## Using with the `shaders` package

If you want to compose effects from the [shaders.com](https://shaders.com) package (CursorRipples, Glow, Dither, …), import from the adapter sub-export:

```tsx
import { Shader, CursorRipples, Glow } from "shaders/react"
import { HtmlTexture, EscapeShader } from "shader-dom/shaders"

<Shader className="h-[500px]">
  <HtmlTexture interactive>
    <div className="h-full">…</div>
  </HtmlTexture>
  <CursorRipples />
  <Glow />
</Shader>
```

The `shaders` package container dictates dimensions (via its own size prop or CSS), and the adapter's overlay fills it with `position: absolute; inset: 0`.

The `shaders` package requires a Vite alias for an internal module import:

```ts
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "shaders/dist/react/Shader.js": new URL(
        "./node_modules/shaders/dist/react/Shader.js",
        import.meta.url,
      ).pathname,
    },
  },
})
```

If you import `Shader` from both `shader-dom` and `shaders/react` in the same file, alias one: `import { Shader as DomShader } from "shader-dom"`.

## How it works

1. **Snapshot** — DOM is cloned, form state synced, `:hover`/`:active` computed styles applied, images/fonts embedded as base64, serialized to SVG `foreignObject`, loaded as an Image, drawn to a canvas at device pixel ratio.
2. **Texture** — The snapshot canvas becomes a GPU texture. Fragment path wraps it in `CanvasTexture` + `needsUpdate = true` each frame. Scene path hands it off to user code.
3. **Interactivity** — An invisible overlay (`opacity: 0`) sits above the render canvas, receiving all pointer events. Hover and transition states are captured via `getComputedStyle` on the live DOM.
4. **Selection** — Text selection highlights are rendered as positioned divs using `Range.getClientRects()`, since `::selection` can't escape parent `opacity: 0`.
5. **Caret** — Focused inputs get a transparent input clone above the canvas; text is visible through the shader, the caret is visible through the clone.
6. **Escape** — `<EscapeShader>` keeps an invisible ghost in the overlay (for layout) and portals the real children above the canvas (for visibility and interaction).

## Limitations

- External fonts referenced via URL may not render in snapshots (fonts must be loaded/cached by the browser).
- Cross-origin images won't appear in the snapshot (same-origin images are embedded automatically).
- Animated GIFs are supported (decoded frame-by-frame via gifuct-js); animated WebP is not.
- `<iframe>`, `<video>`, `<canvas>` elements inside children won't be captured.
- Snapshot is async (Image load) — brief delay between DOM change and texture update.
- `<EscapeShader>` renders children twice — avoid wrapping components with heavy side effects.
- Fragment-path `uniforms` prop only supports numeric values in v1. For texture uniforms, use the scene path.

## License

MIT
