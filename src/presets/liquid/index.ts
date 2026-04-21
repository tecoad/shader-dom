import { CanvasTexture, SRGBColorSpace } from "three"
import type { ShaderScene } from "../../shader"
// @ts-expect-error — unpacked three.js bundle from `threejs-components`, no types shipped.
// This file is ~525 KB; only imported when the consumer opts in via
// `shader-dom/presets/liquid`, so the core `shader-dom` bundle is unaffected.
import LiquidBackground from "./liquid1.min.js"

export interface LiquidPresetOptions {
	/** PBR metalness on the liquid plane. Default: 0.35 */
	metalness?: number
	/** PBR roughness on the liquid plane. Default: 0.45 */
	roughness?: number
	/** Displacement amplitude multiplier. Default: 2 */
	displacementScale?: number
	/** Whether raindrops fall on the surface. Default: false */
	rain?: boolean
	/** Time between raindrops in seconds. Ignored when `rain` is false. */
	rainTime?: number
	/** Renderer pixel ratio. "auto" uses `window.devicePixelRatio`. Default: "auto" */
	pixelRatio?: number | "auto"
	/** Environment map URL for PBR reflections. Default: none (dark reflections). */
	envMap?: string
}

interface LiquidApp {
	three: { renderer: { setPixelRatio: (r: number) => void } }
	liquidPlane: {
		material: { metalness: number; roughness: number }
		uniforms: { displacementScale: { value: number } }
		setImage: (texture: unknown) => void
	}
	setRain: (on: boolean) => void
	setRainTime: (seconds: number) => void
	loadEnvMap: (url: string) => Promise<void>
	dispose: () => void
}

/**
 * Reusable `liquid1` scene factory for `<Shader scene={...}>`.
 *
 * Wraps the `threejs-components/build/backgrounds/liquid1` module with
 * sensible defaults and exposes the common knobs as options. Internally
 * uses the zero-copy `CanvasTexture + needsUpdate` pattern for snapshot
 * uploads — bypassing `loadImage`'s PNG encode/decode cycle.
 *
 * @example
 *   import { liquidPreset } from "shader-dom/presets/liquid"
 *
 *   <Shader scene={liquidPreset({ displacementScale: 3, rain: true })}>
 *     <HtmlTexture interactive>…</HtmlTexture>
 *   </Shader>
 */
export function liquidPreset(options: LiquidPresetOptions = {}): ShaderScene {
	const {
		metalness = 0.35,
		roughness = 0.45,
		displacementScale = 2,
		rain = false,
		rainTime,
		pixelRatio = "auto",
		envMap,
	} = options

	return canvas => {
		const app = (LiquidBackground as (c: HTMLCanvasElement) => LiquidApp)(
			canvas
		)

		const resolvedPixelRatio =
			pixelRatio === "auto" ? window.devicePixelRatio || 1 : pixelRatio
		app.three.renderer.setPixelRatio(resolvedPixelRatio)

		app.liquidPlane.material.metalness = metalness
		app.liquidPlane.material.roughness = roughness
		app.liquidPlane.uniforms.displacementScale.value = displacementScale
		app.setRain(rain)
		if (rainTime !== undefined) app.setRainTime(rainTime)
		if (envMap) app.loadEnvMap(envMap)

		let tex: CanvasTexture | null = null
		let boundCanvas: HTMLCanvasElement | null = null

		return {
			onSnapshot(snapshot) {
				if (boundCanvas !== snapshot) {
					if (tex) tex.dispose()
					tex = new CanvasTexture(snapshot)
					tex.colorSpace = SRGBColorSpace
					boundCanvas = snapshot
					app.liquidPlane.setImage(tex)
				} else if (tex) {
					tex.needsUpdate = true
				}
			},
			dispose() {
				if (tex) tex.dispose()
				app.dispose()
			},
		}
	}
}
