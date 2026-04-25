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
	/** Baseline displacement amplitude. The surface returns to this value when idle. Default: 2 */
	displacementScale?: number
	/** Whether raindrops fall on the surface. Default: false */
	rain?: boolean
	/** Time between raindrops in seconds. Ignored when `rain` is false. */
	rainTime?: number
	/**
	 * Whether the cursor itself creates ripples (small drops on pointermove,
	 * larger drops on click — both attached globally to `document.body` by
	 * `liquid1`). Disable when you want the surface driven only by your own
	 * `controls.pulse()` / `controls.setDisplacement()` calls. Default: true
	 */
	cursorDrops?: boolean
	/**
	 * Number of wave-simulation steps run per rendered frame. The shader's
	 * wave equation propagates one cell per step, so this is the seam to
	 * speed up the effect: 2 makes the wavefront travel ~2× faster across
	 * the surface (and decays ~2× faster per visual frame, since the
	 * built-in damping compounds). Costs N × the wave-sim GPU work.
	 * Integer ≥ 1. Default: 1
	 */
	simulationStepsPerFrame?: number
	/**
	 * Multiplier on the env-map contribution to the surface's reflections.
	 * `liquid1` bakes a built-in studio scene (PointLight intensity 900 +
	 * emissive ceiling intensity 100) into an env map — that's the bright
	 * highlight you see at center. Lower this to dim the reflections; set to
	 * 0 to remove them entirely. Default: 1
	 */
	envMapIntensity?: number
	/** Renderer pixel ratio. "auto" uses `window.devicePixelRatio`. Default: "auto" */
	pixelRatio?: number | "auto"
	/** Environment map URL for PBR reflections. Default: none (dark reflections). */
	envMap?: string
}

export interface LiquidControls {
	/**
	 * Set displacement amplitude immediately. Compose with any animation lib
	 * (e.g. motion's `animate({ onUpdate: setDisplacement })`). No-op until
	 * `<Shader>` mounts; safe to call before/after mount.
	 */
	setDisplacement: (value: number) => void
	/**
	 * Trigger a built-in burst: ramps from baseline → `peak` → baseline over
	 * `durationMs`. Pulse modulates the displacement *amplitude* — it is only
	 * visible when there are existing ripples to amplify. Combine with `drop()`
	 * (or `rain`) to produce the actual waves. Cancels any in-flight pulse.
	 * No-op until `<Shader>` mounts.
	 */
	pulse: (peak?: number, durationMs?: number) => void
	/**
	 * Add a localized ripple at normalized device coordinates (`x`, `y` ∈ [-1, 1],
	 * with y up). Bypasses the `cursorDrops` filter, so it always fires.
	 * Defaults: center of the surface, medium-sized splash. No-op until
	 * `<Shader>` mounts.
	 */
	drop: (x?: number, y?: number, size?: number, strength?: number) => void
	/**
	 * Change simulation steps per frame at runtime. Integer ≥ 1.
	 * See `LiquidPresetOptions.simulationStepsPerFrame`.
	 */
	setSimulationStepsPerFrame: (value: number) => void
	/**
	 * Set the env-map contribution multiplier. 0 = no reflections; 1 = default;
	 * values >1 will exaggerate the built-in studio lighting.
	 */
	setEnvMapIntensity: (value: number) => void
	/** Toggle raindrops at runtime. */
	setRain: (on: boolean) => void
}

export interface LiquidHandle {
	scene: ShaderScene
	controls: LiquidControls
}

interface ThreeWrapper {
	renderer: { setPixelRatio: (r: number) => void }
	onBeforeRender?: (info: { delta: number }) => void
}

interface LiquidApp {
	three: ThreeWrapper
	liquidPlane: {
		material: {
			metalness: number
			roughness: number
			envMapIntensity: number
		}
		uniforms: { displacementScale: { value: number } }
		setImage: (texture: unknown) => void
		addDrop: (x: number, y: number, size: number, strength: number) => void
		update: () => void
	}
	setRain: (on: boolean) => void
	setRainTime: (seconds: number) => void
	loadEnvMap: (url: string) => Promise<void>
	dispose: () => void
}

/**
 * Reusable `liquid1` scene factory for `<Shader scene={...}>`.
 *
 * Returns a `{ scene, controls }` handle. Pass `scene` to `<Shader>`; use
 * `controls` to drive the effect imperatively from event handlers.
 *
 * @example
 *   import { liquidPreset } from "shader-dom/presets/liquid"
 *
 *   const liquid = liquidPreset({ cursorDrops: false })
 *
 *   <Shader scene={liquid.scene}>
 *     <HtmlTexture interactive>
 *       <button onClick={e => {
 *         const x = (e.clientX / innerWidth) * 2 - 1
 *         const y = -(e.clientY / innerHeight) * 2 + 1
 *         liquid.controls.drop(x, y)
 *         liquid.controls.pulse(2.5, 800)
 *       }}>Click</button>
 *     </HtmlTexture>
 *   </Shader>
 */
export function liquidPreset(options: LiquidPresetOptions = {}): LiquidHandle {
	const {
		metalness = 0.35,
		roughness = 0.45,
		displacementScale = 2,
		rain = false,
		rainTime,
		pixelRatio = "auto",
		envMap,
		cursorDrops = true,
		envMapIntensity,
		simulationStepsPerFrame = 1,
	} = options

	// Mutable so `setSimulationStepsPerFrame` can change it without re-wrapping
	// `onBeforeRender`. The wrapper closes over this variable.
	let extraStepsPerFrame = Math.max(1, Math.floor(simulationStepsPerFrame)) - 1

	let app: LiquidApp | null = null
	let pulseRaf = 0
	// Captured at scene mount; lets `controls.drop()` reach the unfiltered
	// `addDrop` even when `cursorDrops: false` has wrapped the public one.
	let realAddDrop:
		| ((x: number, y: number, size: number, strength: number) => void)
		| null = null

	const scene: ShaderScene = canvas => {
		const created = (LiquidBackground as (c: HTMLCanvasElement) => LiquidApp)(
			canvas
		)
		app = created
		realAddDrop = created.liquidPlane.addDrop.bind(created.liquidPlane)

		const resolvedPixelRatio =
			pixelRatio === "auto" ? window.devicePixelRatio || 1 : pixelRatio
		created.three.renderer.setPixelRatio(resolvedPixelRatio)

		created.liquidPlane.material.metalness = metalness
		created.liquidPlane.material.roughness = roughness
		created.liquidPlane.uniforms.displacementScale.value = displacementScale
		if (envMapIntensity !== undefined)
			created.liquidPlane.material.envMapIntensity = envMapIntensity

		// Wrap `onBeforeRender` to drive extra wave-sim steps per frame.
		// `liquid1` already sets it inside its factory (rain tick + one
		// `liquidPlane.update()`). We invoke the original then run extras.
		const originalOnBeforeRender = created.three.onBeforeRender
		created.three.onBeforeRender = info => {
			originalOnBeforeRender?.(info)
			for (let i = 0; i < extraStepsPerFrame; i++) {
				created.liquidPlane.update()
			}
		}

		if (!cursorDrops) {
			// `liquid1` attaches global pointer handlers on `document.body` and routes
			// hover/click into `liquidPlane.addDrop(x, y, 0.025, strength)`. Rain (when
			// enabled) uses `addDrop` with size in [0.01, 0.02], so filtering on the
			// magic `size === 0.025` value cleanly separates cursor-driven calls from
			// rain. The pointer object itself isn't on the public surface, so this
			// is the only seam available without modifying the vendored bundle.
			const original = realAddDrop
			created.liquidPlane.addDrop = (x, y, size, strength) => {
				if (size === 0.025) return
				original(x, y, size, strength)
			}
		}

		created.setRain(rain)
		if (rainTime !== undefined) created.setRainTime(rainTime)
		if (envMap) created.loadEnvMap(envMap)

		let tex: CanvasTexture | null = null
		let boundCanvas: HTMLCanvasElement | null = null

		return {
			onSnapshot(snapshot) {
				if (boundCanvas !== snapshot) {
					if (tex) tex.dispose()
					tex = new CanvasTexture(snapshot)
					tex.colorSpace = SRGBColorSpace
					boundCanvas = snapshot
					created.liquidPlane.setImage(tex)
				} else if (tex) {
					tex.needsUpdate = true
				}
			},
			dispose() {
				if (pulseRaf) {
					cancelAnimationFrame(pulseRaf)
					pulseRaf = 0
				}
				if (tex) tex.dispose()
				created.dispose()
				// Guard against out-of-order disposes when the same handle
				// is mounted/unmounted in overlapping cycles (StrictMode, etc).
				if (app === created) {
					app = null
					realAddDrop = null
				}
			},
		}
	}

	const controls: LiquidControls = {
		setDisplacement(value) {
			if (app) app.liquidPlane.uniforms.displacementScale.value = value
		},
		pulse(peak = 4, durationMs = 800) {
			if (!app) return
			if (pulseRaf) cancelAnimationFrame(pulseRaf)
			const a = app
			const start = performance.now()
			const tick = () => {
				const t = (performance.now() - start) / durationMs
				if (t >= 1) {
					a.liquidPlane.uniforms.displacementScale.value = displacementScale
					pulseRaf = 0
					return
				}
				// Fast attack (15%), slow decay (85%) — feels like a tap, not a sine.
				const eased = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85
				a.liquidPlane.uniforms.displacementScale.value =
					displacementScale + (peak - displacementScale) * eased
				pulseRaf = requestAnimationFrame(tick)
			}
			pulseRaf = requestAnimationFrame(tick)
		},
		drop(x = 0, y = 0, size = 0.04, strength = 0.05) {
			realAddDrop?.(x, y, size, strength)
		},
		setSimulationStepsPerFrame(value) {
			extraStepsPerFrame = Math.max(1, Math.floor(value)) - 1
		},
		setEnvMapIntensity(value) {
			if (app) app.liquidPlane.material.envMapIntensity = value
		},
		setRain(on) {
			if (app) app.setRain(on)
		},
	}

	return { scene, controls }
}
