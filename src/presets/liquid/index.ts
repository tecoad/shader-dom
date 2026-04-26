import {
	CanvasTexture,
	Color,
	Mesh,
	MeshBasicMaterial,
	PMREMGenerator,
	Scene,
	SRGBColorSpace,
	type Texture,
	TorusGeometry,
	type WebGLRenderer,
} from "three"
import {
	type ElementAnchor,
	elementToNDC,
	screenToNDC,
} from "../../coords"
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
	/**
	 * Built-in lighting mode used when no `envMap` URL is provided.
	 * - "studio" (default): bundled bake — bright PointLight overhead, central hotspot.
	 * - "softbox": HDR torus ring above the surface — directional highlights on
	 *   wave crests, no central hotspot, homogeneous in azimuth.
	 *
	 * Ignored when `envMap` is set; user-supplied env maps always win.
	 * Default: "studio"
	 */
	lighting?: "studio" | "softbox"
	/**
	 * Wave-velocity damping per simulation step. The wave-sim multiplies each
	 * cell's velocity by this value every step — values closer to 1 make ripples
	 * dissipate slower, values further from 1 make them fade faster.
	 *
	 * The effective decay per visual frame compounds with `simulationStepsPerFrame`:
	 * at 60fps with 1 step/frame the half-life is `ln(0.5)/(60·ln(attenuation))` seconds
	 * (~2.3s at the default 0.995). Bumping `simulationStepsPerFrame` shortens
	 * decay AND speeds up wavefront propagation; tune `attenuation` to control
	 * decay independently.
	 *
	 * Reasonable range: ~0.97 (very short) … 0.9995 (very long). Default: 0.995
	 */
	attenuation?: number
	/**
	 * Gate env-map specular reflections by surface slope. When true, flat regions
	 * (calm water, ambient ripples) receive zero env contribution — the underlying
	 * snapshot shows through cleanly with no PMREM-blur halos or reflection tint —
	 * and only steep wave crests light up with the configured `lighting`.
	 *
	 * Combine with any `lighting` mode. Default: false
	 */
	reflectionOnSlopeOnly?: boolean
	/**
	 * `[edge0, edge1]` for the slope gate's `smoothstep`. The slope metric is
	 * `length(transformedNormal.xy)` — 0 on flat water, rising with tilt.
	 *
	 * - `edge0`: slopes below this are fully gated out (snapshot shows through).
	 *   Raise to tolerate stronger ambient ripples without acquiring highlights.
	 * - `edge1`: slopes above this get full env contribution (PBR + reflections).
	 *   Lower to let gentler waves catch highlights; raise to require steeper
	 *   crests.
	 *
	 * Only takes effect when `reflectionOnSlopeOnly` is true (or set to true at
	 * runtime via `controls.setReflectionOnSlopeOnly`). Default: [0.05, 0.4]
	 */
	slopeGateRange?: [number, number]
}

/**
 * Anything that can stand in for a screen-space point: a real DOM event, a
 * synthetic React event, or a hand-built `{ clientX, clientY }` literal.
 */
export type ScreenPoint =
	| { clientX: number; clientY: number }
	| MouseEvent
	| PointerEvent
	| Touch

export interface DropAtOptions {
	/** Forwarded to the underlying drop. Defaults to `0.04`. */
	size?: number
	/** Forwarded to the underlying drop. Defaults to `0.05`. */
	strength?: number
	/**
	 * When the target is an `Element`, which point of its bounding box to fire
	 * the ripple from. Ignored for `ScreenPoint` targets. Defaults to `"center"`.
	 */
	anchor?: ElementAnchor
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
	 *
	 * For screen-space input (mouse events, button centers), prefer `dropAt`
	 * — it handles canvas-bounds conversion automatically and works for shaders
	 * that aren't fullscreen.
	 */
	drop: (x?: number, y?: number, size?: number, strength?: number) => void
	/**
	 * Drop a ripple at a screen-space point or DOM element. Converts to NDC
	 * against the mounted canvas's bounds, so it works whether the shader is
	 * fullscreen or confined to a smaller container.
	 *
	 * - Pass an `Element` to fire from its center (or anchor, via `opts.anchor`).
	 *   Works for keyboard-triggered clicks where `clientX/Y` would be `0`.
	 * - Pass a `MouseEvent`/`PointerEvent`/`Touch` to fire from the pointer.
	 * - Pass any `{ clientX, clientY }` literal for fully custom positioning.
	 *
	 * No-op until `<Shader>` mounts.
	 */
	dropAt: (target: Element | ScreenPoint, opts?: DropAtOptions) => void
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
	/**
	 * Set the wave-velocity damping per simulation step. See
	 * `LiquidPresetOptions.attenuation` for the exact role.
	 */
	setAttenuation: (value: number) => void
	/**
	 * Toggle slope-gated reflections at runtime. See
	 * `LiquidPresetOptions.reflectionOnSlopeOnly`. No-op until `<Shader>` mounts.
	 */
	setReflectionOnSlopeOnly: (on: boolean) => void
	/**
	 * Adjust the slope gate's `smoothstep` thresholds at runtime. See
	 * `LiquidPresetOptions.slopeGateRange`. No-op until `<Shader>` mounts.
	 */
	setSlopeGateRange: (range: [number, number]) => void
	/**
	 * Switch lighting mode at runtime. No-op when an `envMap` URL was provided
	 * at construction (the user's explicit choice wins; construct a new handle
	 * to switch). No-op until `<Shader>` mounts.
	 */
	setLighting: (mode: "studio" | "softbox") => void
	/** Toggle raindrops at runtime. */
	setRain: (on: boolean) => void
}

export interface LiquidHandle {
	scene: ShaderScene
	controls: LiquidControls
}

interface ThreeWrapper {
	renderer: WebGLRenderer
	onBeforeRender?: (info: { delta: number }) => void
}

interface LiquidApp {
	three: ThreeWrapper
	liquidPlane: {
		material: {
			metalness: number
			roughness: number
			envMapIntensity: number
			envMap: Texture | null
			needsUpdate: boolean
			onBeforeCompile?: (shader: {
				uniforms: Record<string, { value: unknown }>
				fragmentShader: string
				vertexShader: string
			}) => void
		}
		uniforms: { displacementScale: { value: number } }
		attenuation: number
		setImage: (texture: unknown) => void
		setEnvMap: (texture: Texture | null) => void
		addDrop: (x: number, y: number, size: number, strength: number) => void
		update: () => void
	}
	setRain: (on: boolean) => void
	setRainTime: (seconds: number) => void
	loadEnvMap: (url: string) => Promise<void>
	dispose: () => void
}

/**
 * Build a procedural softbox env map: a bright HDR torus ring in the upper
 * hemisphere over a medium-gray background, prefiltered for PBR via PMREM.
 *
 * Produces homogeneous reflections — flat regions get medium uniform brightness,
 * wave crests get directional highlights uniformly distributed in azimuth.
 *
 * Caller owns the returned texture and is responsible for disposing it.
 */
function buildSoftboxEnvMap(renderer: WebGLRenderer): Texture {
	const scene = new Scene()
	scene.background = new Color(0.13, 0.13, 0.13)

	const geo = new TorusGeometry(8, 2, 8, 32)
	// HDR-bright color: PMREMGenerator bakes into a half-float render target,
	// so values >1 act as emissive intensity even with MeshBasicMaterial.
	const mat = new MeshBasicMaterial({ color: new Color(20, 20, 20) })
	const ring = new Mesh(geo, mat)
	// Tube centered on the horizon (y=0) so its angular extent from origin
	// straddles the equator (~±18° elevation). Flat / lightly-rippled regions
	// reflect well above this band and stay uniformly gray — only steep wave
	// crests (normal tilt ≳ 36°) reflect down into the bright tube. Result:
	// highlights ride on actual waves; the calm "background" stays clean.
	ring.position.y = 0
	ring.rotation.x = Math.PI / 2
	scene.add(ring)

	const pmrem = new PMREMGenerator(renderer)
	const target = pmrem.fromScene(scene, 0.04)

	geo.dispose()
	mat.dispose()
	pmrem.dispose()

	return target.texture
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
		lighting = "studio",
		attenuation,
		reflectionOnSlopeOnly = false,
		slopeGateRange = [0.05, 0.4],
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
	// Captured at scene mount so screen-space helpers (`dropAt`) can convert
	// `clientX/Y` against the actual canvas bounds — required for shaders that
	// don't fill the viewport.
	let mountedCanvas: HTMLCanvasElement | null = null
	// Captured at scene mount so `setLighting("studio")` can restore the
	// bundle's baked env map without rebuilding it.
	let originalEnvMap: Texture | null = null
	let cachedSoftboxEnvMap: Texture | null = null
	// Once the user supplies an envMap URL, that's their explicit lighting
	// choice for this handle's lifetime — `setLighting` becomes a no-op.
	// Construct a new handle to switch.
	const envMapUrlInEffect = envMap !== undefined
	let activeLighting: "studio" | "softbox" = lighting
	// Uniform references shared with the chained onBeforeCompile. `uSlopeGate`
	// toggles the gate (0 = bypass, 1 = full gate); `uSlopeGateMin/Max` set the
	// smoothstep edges. Captured at mount.
	let slopeGateUniform: { value: number } | null = null
	let slopeGateMinUniform: { value: number } | null = null
	let slopeGateMaxUniform: { value: number } | null = null

	const scene: ShaderScene = canvas => {
		const created = (LiquidBackground as (c: HTMLCanvasElement) => LiquidApp)(
			canvas
		)
		app = created
		realAddDrop = created.liquidPlane.addDrop.bind(created.liquidPlane)
		mountedCanvas = canvas

		const resolvedPixelRatio =
			pixelRatio === "auto" ? window.devicePixelRatio || 1 : pixelRatio
		created.three.renderer.setPixelRatio(resolvedPixelRatio)

		created.liquidPlane.material.metalness = metalness
		created.liquidPlane.material.roughness = roughness
		created.liquidPlane.uniforms.displacementScale.value = displacementScale
		if (envMapIntensity !== undefined)
			created.liquidPlane.material.envMapIntensity = envMapIntensity
		if (attenuation !== undefined)
			created.liquidPlane.attenuation = attenuation

		// Capture the bundle's baked studio env map before any other change
		// touches it — needed so `setLighting("studio")` can restore without rebake.
		originalEnvMap = created.liquidPlane.material.envMap

		if (!envMapUrlInEffect && lighting === "softbox") {
			cachedSoftboxEnvMap = buildSoftboxEnvMap(created.three.renderer)
			created.liquidPlane.setEnvMap(cachedSoftboxEnvMap)
		}

		// Chain a slope-gate onto whatever onBeforeCompile the bundle already
		// installed (the bundle uses one for displacement). The gate multiplies
		// `radiance` (env-map specular contribution) by smoothstep(slope), so
		// flat surfaces get zero env reflection while wave crests get the full
		// reflection. World-space normal is recovered with inverseTransformDirection.
		const material = created.liquidPlane.material
		const originalOnBeforeCompile = material.onBeforeCompile
		const gateU = { value: reflectionOnSlopeOnly ? 1 : 0 }
		const minU = { value: slopeGateRange[0] }
		const maxU = { value: slopeGateRange[1] }
		material.onBeforeCompile = shader => {
			if (originalOnBeforeCompile) originalOnBeforeCompile(shader)
			shader.uniforms.uSlopeGate = gateU
			shader.uniforms.uSlopeGateMin = minU
			shader.uniforms.uSlopeGateMax = maxU
			shader.fragmentShader =
				`uniform float uSlopeGate;\nuniform float uSlopeGateMin;\nuniform float uSlopeGateMax;\n${shader.fragmentShader}`
			// Single injection just before tonemapping. The bundle's earlier chunk
			// replacement leaves `transformedNormal` (a tangent-space normal built
			// from the displacement map's BA channels) in scope; `length(.xy)` is
			// the planar slope — 0 on flat water, rises with tilt — and works
			// without any view/camera transform.
			//
			// When `uSlopeGate = 1` and the surface is flat, we replace the PBR
			// output with the raw `diffuseColor`, bypassing both the env-specular
			// (the soft circle from PMREM blur leaking into the upper hemisphere)
			// AND the iblIrradiance modulation that would otherwise dim the
			// snapshot toward whatever gray the env's diffuse averages to.
			//
			// Identifiers must avoid the leading `__` prefix — GLSL reserves it.
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <tonemapping_fragment>",
				`{
  float liquidSlope = length(transformedNormal.xy);
  float liquidGate = mix(1.0, smoothstep(uSlopeGateMin, uSlopeGateMax, liquidSlope), uSlopeGate);
  gl_FragColor.rgb = mix(diffuseColor.rgb, gl_FragColor.rgb, liquidGate);
}
#include <tonemapping_fragment>`
			)
		}
		material.needsUpdate = true
		slopeGateUniform = gateU
		slopeGateMinUniform = minU
		slopeGateMaxUniform = maxU

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
				if (cachedSoftboxEnvMap) {
					cachedSoftboxEnvMap.dispose()
					cachedSoftboxEnvMap = null
				}
				created.dispose()
				// Guard against out-of-order disposes when the same handle
				// is mounted/unmounted in overlapping cycles (StrictMode, etc).
				if (app === created) {
					app = null
					realAddDrop = null
					mountedCanvas = null
					originalEnvMap = null
					slopeGateUniform = null
					slopeGateMinUniform = null
					slopeGateMaxUniform = null
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
		dropAt(target, opts) {
			if (!realAddDrop || !mountedCanvas) return
			const size = opts?.size ?? 0.04
			const strength = opts?.strength ?? 0.05
			const [x, y] =
				target instanceof Element
					? elementToNDC(mountedCanvas, target, opts?.anchor)
					: screenToNDC(mountedCanvas, target.clientX, target.clientY)
			realAddDrop(x, y, size, strength)
		},
		setSimulationStepsPerFrame(value) {
			extraStepsPerFrame = Math.max(1, Math.floor(value)) - 1
		},
		setEnvMapIntensity(value) {
			if (app) app.liquidPlane.material.envMapIntensity = value
		},
		setAttenuation(value) {
			if (app) app.liquidPlane.attenuation = value
		},
		setReflectionOnSlopeOnly(on) {
			if (slopeGateUniform) slopeGateUniform.value = on ? 1 : 0
		},
		setSlopeGateRange(range) {
			if (slopeGateMinUniform) slopeGateMinUniform.value = range[0]
			if (slopeGateMaxUniform) slopeGateMaxUniform.value = range[1]
		},
		setLighting(mode) {
			if (!app) return
			if (envMapUrlInEffect) return
			if (mode === activeLighting) return
			activeLighting = mode
			if (mode === "softbox") {
				if (!cachedSoftboxEnvMap) {
					cachedSoftboxEnvMap = buildSoftboxEnvMap(app.three.renderer)
				}
				app.liquidPlane.setEnvMap(cachedSoftboxEnvMap)
			} else {
				app.liquidPlane.setEnvMap(originalEnvMap)
			}
		},
		setRain(on) {
			if (app) app.setRain(on)
		},
	}

	return { scene, controls }
}
