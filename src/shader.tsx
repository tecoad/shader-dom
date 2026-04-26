import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react"
import {
	CanvasTexture,
	DataTexture,
	type IUniform,
	LinearSRGBColorSpace,
	Mesh,
	NoColorSpace,
	OrthographicCamera,
	PlaneGeometry,
	RGBAFormat,
	Scene,
	ShaderMaterial,
	type Texture,
	UnsignedByteType,
	Vector2,
	WebGLRenderer,
} from "three"
import { ShaderContext, type ShaderContextValue } from "./shader-context"

const DEFAULT_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = vec2(uv.x, 1.0 - uv.y);
	gl_Position = vec4(position, 1.0);
}
`

function createFallbackTexture(): DataTexture {
	const data = new Uint8Array([0, 0, 0, 0])
	const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType)
	tex.needsUpdate = true
	return tex
}

type UniformsMap = Record<string, IUniform>

function buildUniforms(
	textureValue: Texture,
	resolution: Vector2,
	custom?: Record<string, number | number[]>
): UniformsMap {
	const uniforms: UniformsMap = {
		uTexture: { value: textureValue },
		uTime: { value: 0 },
		uResolution: { value: resolution },
	}
	if (custom) {
		for (const [key, value] of Object.entries(custom)) {
			if (typeof value === "number") {
				uniforms[key] = { value }
			} else if (Array.isArray(value)) {
				if (value.length === 2) {
					uniforms[key] = { value: new Vector2(value[0], value[1]) }
				} else if (value.length === 3) {
					uniforms[key] = {
						value: { x: value[0], y: value[1], z: value[2] },
					}
				} else if (value.length === 4) {
					uniforms[key] = {
						value: {
							x: value[0],
							y: value[1],
							z: value[2],
							w: value[3],
						},
					}
				} else if (process.env.NODE_ENV !== "production") {
					console.warn(
						`[shader-dom] Uniform "${key}" has unsupported shape (length ${value.length}); ignored.`
					)
				}
			}
		}
	}
	return uniforms
}

export interface ShaderSceneLifecycle {
	/**
	 * Called once when a child HtmlTexture's snapshot canvas first has
	 * non-zero size (first successful snapshot). Called again if the
	 * HtmlTexture unmounts and a new one mounts.
	 *
	 * The canvas reference is stable; its contents update in place.
	 * three.js consumers wrap it in CanvasTexture and set needsUpdate.
	 * Scenes consuming a data URL (e.g. liquid1.loadImage) call
	 * snapshot.toDataURL() on demand.
	 */
	onSnapshot?: (snapshot: HTMLCanvasElement) => void
	/** Called on resize (ResizeObserver on the <canvas>). */
	onResize?: (width: number, height: number) => void
	/** Called on <Shader> unmount or `scene` prop change. */
	dispose: () => void
}

export type ShaderScene = (canvas: HTMLCanvasElement) => ShaderSceneLifecycle

type ShaderCommonProps = {
	children: ReactNode
	className?: string
	style?: CSSProperties
}

export type ShaderProps = ShaderCommonProps &
	(
		| {
				fragment: string
				uniforms?: Record<string, number | number[]>
				scene?: never
		  }
		| {
				scene: ShaderScene
				fragment?: never
				uniforms?: never
		  }
		| { fragment?: never; scene?: never; uniforms?: never }
	)

export function Shader(props: ShaderProps) {
	const { children, className, style } = props
	const fragmentProp = "fragment" in props ? props.fragment : undefined
	const sceneProp = "scene" in props && !fragmentProp ? props.scene : undefined
	const uniformsProp = "uniforms" in props ? props.uniforms : undefined

	const containerRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null)

	// Dev-mode sanity: both fragment and scene set
	if (
		process.env.NODE_ENV !== "production" &&
		fragmentProp &&
		"scene" in props &&
		props.scene
	) {
		console.error(
			"[shader-dom] <Shader> received both `fragment` and `scene` props. `fragment` wins."
		)
	}

	const registerSnapshot = useCallback(
		(canvas: HTMLCanvasElement): (() => void) => {
			if (snapshotCanvasRef.current) {
				if (process.env.NODE_ENV !== "production") {
					console.warn(
						"[shader-dom] <Shader> supports a single <HtmlTexture> child in v1; extra registration ignored."
					)
				}
				return () => {}
			}
			snapshotCanvasRef.current = canvas
			return () => {
				if (snapshotCanvasRef.current === canvas) {
					snapshotCanvasRef.current = null
				}
			}
		},
		[]
	)

	const snapshotSubsRef = useRef<Set<(c: HTMLCanvasElement) => void>>(new Set())
	const notifySnapshotUpdate = useCallback((c: HTMLCanvasElement) => {
		for (const cb of snapshotSubsRef.current) cb(c)
	}, [])
	const subscribeSnapshotUpdate = useCallback(
		(cb: (c: HTMLCanvasElement) => void) => {
			snapshotSubsRef.current.add(cb)
			return () => {
				snapshotSubsRef.current.delete(cb)
			}
		},
		[]
	)

	const contextValue = useMemo<ShaderContextValue>(
		() => ({
			registerSnapshot,
			canvasRef,
			layersContainerRef: containerRef,
			notifySnapshotUpdate,
			subscribeSnapshotUpdate,
		}),
		[registerSnapshot, notifySnapshotUpdate, subscribeSnapshotUpdate]
	)

	// Scene path lifecycle
	useEffect(() => {
		if (!sceneProp) return
		const canvas = canvasRef.current
		if (!canvas) return

		const lifecycle = sceneProp(canvas)

		// Fire onSnapshot on every snapshot update (throttle in plugin if needed).
		// Also fire immediately if a populated snapshot already exists.
		const current = snapshotCanvasRef.current
		if (current && current.width > 0 && current.height > 0) {
			lifecycle.onSnapshot?.(current)
		}
		const unsubscribe = subscribeSnapshotUpdate(c => {
			if (c.width > 0 && c.height > 0) lifecycle.onSnapshot?.(c)
		})

		// Resize observer
		let resizeRaf = 0
		const ro = new ResizeObserver(entries => {
			if (resizeRaf) cancelAnimationFrame(resizeRaf)
			resizeRaf = requestAnimationFrame(() => {
				const entry = entries[0]
				const { width, height } = entry.contentRect
				lifecycle.onResize?.(width, height)
			})
		})
		ro.observe(canvas)

		return () => {
			unsubscribe()
			if (resizeRaf) cancelAnimationFrame(resizeRaf)
			ro.disconnect()
			lifecycle.dispose()
		}
	}, [sceneProp, subscribeSnapshotUpdate])

	const uniformsKey = useMemo(
		() => (uniformsProp ? Object.keys(uniformsProp).sort().join("|") : ""),
		[uniformsProp]
	)

	// Fragment path lifecycle.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `uniformsKey` (the sorted key set of `uniformsProp`) is the actual remount trigger — adding it to deps is load-bearing even though it isn't read inside the effect. `uniformsProp` values are captured at mount time by design (real-time uniform updates are a v1 limitation), so it is intentionally NOT a dep.
	useEffect(() => {
		if (!fragmentProp) return
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!canvas || !container) return

		const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
		renderer.setPixelRatio(window.devicePixelRatio || 1)
		// Fragment path is a sRGB-passthrough pipeline: the snapshot canvas
		// already holds sRGB-encoded bytes from the browser's DOM raster,
		// and the user's fragment is expected to sample and emit those bytes
		// unchanged. Any renderer-side encode (linear→sRGB) would corrupt
		// the output — ShaderMaterial with a custom sampler2D does not get
		// auto-injected sRGB decode at the sample site, so the shader reads
		// sRGB values, but the renderer's default `SRGBColorSpace` output
		// still wraps gl_FragColor with a linear→sRGB encode, producing
		// linear bytes on the canvas (displayed as if sRGB → crushed
		// midtones, saturated channel collapse). Match the old raw-WebGL
		// behaviour by disabling both conversions.
		renderer.outputColorSpace = LinearSRGBColorSpace

		const scene = new Scene()
		const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

		const fallback = createFallbackTexture()
		const resolution = new Vector2(
			container.clientWidth,
			container.clientHeight
		)
		const uniforms = buildUniforms(fallback, resolution, uniformsProp)

		const material = new ShaderMaterial({
			vertexShader: DEFAULT_VERTEX_SHADER,
			fragmentShader: fragmentProp,
			uniforms,
			transparent: true,
		})

		const geometry = new PlaneGeometry(2, 2)
		const mesh = new Mesh(geometry, material)
		scene.add(mesh)

		let currentSnapshotTexture: CanvasTexture | null = null
		let currentSnapshotCanvas: HTMLCanvasElement | null = null

		const setSnapshot = (snapshotCanvas: HTMLCanvasElement | null) => {
			if (currentSnapshotTexture) {
				currentSnapshotTexture.dispose()
				currentSnapshotTexture = null
			}
			if (!snapshotCanvas) {
				uniforms.uTexture.value = fallback
				currentSnapshotCanvas = null
				return
			}
			const tex = new CanvasTexture(snapshotCanvas)
			// Tag the texture as `NoColorSpace` so three.js does not inject
			// any sRGB→linear decode at the sampler (see the renderer
			// outputColorSpace comment above for the full passthrough
			// rationale).
			tex.colorSpace = NoColorSpace
			// Canvas content is already DOM-oriented (top at row 0); combined with
			// the vertex shader's 1.0 - uv.y flip, flipY=false gives vUv=(0,0) → DOM top-left.
			tex.flipY = false
			currentSnapshotTexture = tex
			currentSnapshotCanvas = snapshotCanvas
			uniforms.uTexture.value = tex
		}

		setSnapshot(snapshotCanvasRef.current)

		// Poll for snapshot registration or dimension changes (cheap — ref check each frame)
		let rafId = 0
		let lastW = 0
		let lastH = 0
		const startTime = performance.now()
		const render = () => {
			const registered = snapshotCanvasRef.current
			const w = registered?.width ?? 0
			const h = registered?.height ?? 0
			// Recreate the CanvasTexture when the canvas identity OR dimensions change;
			// three.js does not automatically reallocate when the backing canvas resizes.
			if (registered !== currentSnapshotCanvas || w !== lastW || h !== lastH) {
				setSnapshot(registered)
				lastW = w
				lastH = h
			}
			;(uniforms.uTime as { value: number }).value =
				(performance.now() - startTime) / 1000
			if (currentSnapshotTexture) currentSnapshotTexture.needsUpdate = true
			renderer.render(scene, camera)
			rafId = requestAnimationFrame(render)
		}
		rafId = requestAnimationFrame(render)

		// Resize handling
		let resizeRaf = 0
		const ro = new ResizeObserver(entries => {
			if (resizeRaf) cancelAnimationFrame(resizeRaf)
			resizeRaf = requestAnimationFrame(() => {
				const entry = entries[0]
				const { width, height } = entry.contentRect
				renderer.setSize(width, height, false)
				resolution.set(width, height)
			})
		})
		ro.observe(container)
		renderer.setSize(container.clientWidth, container.clientHeight, false)

		return () => {
			cancelAnimationFrame(rafId)
			if (resizeRaf) cancelAnimationFrame(resizeRaf)
			ro.disconnect()
			if (currentSnapshotTexture) currentSnapshotTexture.dispose()
			fallback.dispose()
			material.dispose()
			geometry.dispose()
			renderer.dispose()
		}
	}, [fragmentProp, uniformsKey])

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ position: "relative", ...style }}
		>
			<canvas
				ref={canvasRef}
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					zIndex: 0,
				}}
			/>
			<ShaderContext.Provider value={contextValue}>
				{children}
			</ShaderContext.Provider>
		</div>
	)
}
