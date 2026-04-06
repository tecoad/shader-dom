# shader-dom

Apply GPU fragment shaders to live React DOM elements using WebGL.

Renders a React component to a Canvas 2D texture, uploads it to WebGL via `texImage2D`, and runs it through a fragment shader at 60fps.

## Shaders

- **Wave Distortion** — sinusoidal UV displacement
- **Chromatic Aberration** — RGB channel offset based on distance from center
- **Glitch** — random horizontal line shifts with color separation
- **Pixelate + Glow** — dynamic pixel grid with bloom effect
- **Hologram** — scanlines, flicker, and cyan-tinted color shift

## Pipeline

```
React DOM → Canvas 2D → WebGL texImage2D → Fragment Shader
```

## Running

```bash
npm install
npm run dev
```

## Based on

Technique by [@shuding](https://github.com/shuding) — DOM snapshot → WebGL texture → GPU shader.
