# shader-dom

GPU fragment shaders on live, interactive DOM elements. Wrap any React content in `<HtmlTexture>` and compose with effects from the [shaders](https://shaders.com) package.

```tsx
import { Shader, CursorRipples, Glow } from "shaders/react"
import { HtmlTexture } from "shader-dom"

function App() {
  return (
    <Shader style={{ width: "100dvw", height: "100dvh" }}>
      <HtmlTexture interactive>
        <button onClick={() => alert("works!")}>Click me</button>
      </HtmlTexture>
      <CursorRipples />
      <Glow />
    </Shader>
  )
}
```

Clicks, hover, text selection, form inputs, CSS transitions — all work through the shader at 60fps.

## Install

```bash
npm install shader-dom shaders three
```

Peer dependencies: `react >=18`, `react-dom >=18`, `shaders >=2`, `three >=0.170`

## Setup

shader-dom accesses an internal module from the `shaders` package that isn't part of its public exports. Add this alias to your Vite config:

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

## Components

### `<HtmlTexture>`

Captures React content as a GPU texture for the shaders pipeline.

```tsx
<Shader style={{ width: 500, height: 500 }}>
  <HtmlTexture interactive>
    {/* any React content */}
  </HtmlTexture>
  <Dither />
</Shader>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | — | Content to render through the shader |
| `interactive` | `boolean` | `false` | Enable click, hover, text selection, and form input |

When `interactive` is enabled, a RAF loop captures hover states, CSS transitions, and form changes every frame.

### `<EscapeShader>`

Content inside `<EscapeShader>` renders normally without shader effects, maintaining its position in the layout flow.

```tsx
<HtmlTexture interactive>
  <div className="card">
    <EscapeShader>
      <h1>This text renders without effects</h1>
    </EscapeShader>
    <p>This text goes through the shader</p>
  </div>
</HtmlTexture>
```

Escaped content supports native hover, text selection, and pointer events.

## How it works

1. **Snapshot** — DOM is cloned, serialized to SVG foreignObject with embedded page CSS, loaded as an Image, and drawn to a canvas at device pixel ratio
2. **Texture** — A Three.js `CanvasTexture` wraps the canvas. Each frame, `needsUpdate = true` triggers direct GPU upload — no PNG encoding, no URL loading
3. **Interactivity** — An invisible overlay (`opacity: 0`) sits above the canvas, receiving all pointer events. Hover and transition states are captured via `getComputedStyle` on the live DOM
4. **Selection** — Text selection highlights are rendered as positioned divs using `Range.getClientRects()`, since `::selection` can't escape parent `opacity: 0`
5. **Escape** — `<EscapeShader>` content is hidden in the texture and cloned to a visible layer with native pointer events

## Limitations

- External fonts referenced via URL may not render in snapshots (fonts must be loaded/cached by the browser)
- Cross-origin images won't appear in the snapshot
- `<iframe>`, `<video>`, `<canvas>` elements inside children won't be captured
- Snapshot is async (Image load) — brief delay between DOM change and texture update

## License

MIT
