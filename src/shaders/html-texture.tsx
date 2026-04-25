import { type ReactNode, useContext, useEffect, useId, useRef } from "react"
import { ShaderContext } from "shaders/dist/react/Shader.js"
import { float, screenUV, texture, vec2, vec4 } from "three/tsl"
import { CanvasTexture, SRGBColorSpace } from "three/webgpu"

import { useDomSnapshot } from "../use-dom-snapshot"
import { useInteractiveOverlay } from "../use-interactive-overlay"

export interface HtmlTextureProps {
	children: ReactNode
	interactive?: boolean
	/**
	 * Cap the snapshot canvas DPR. The SVG raster + GPU upload scale with
	 * pixel count; lowering to `1` cuts ~4× of per-frame snapshot cost on
	 * Retina. Useful when the consuming shader already blurs/distorts the
	 * texture. Default: full `window.devicePixelRatio`.
	 */
	maxPixelRatio?: number
}

export function HtmlTexture({
	children,
	interactive = false,
	maxPixelRatio,
}: HtmlTextureProps) {
	const context = useContext(ShaderContext)
	const reactId = useId()
	const instanceId = reactId.replace(/[^a-zA-Z0-9_]/g, "")

	const markerRef = useRef<HTMLSpanElement>(null)
	const layersContainerRef = useRef<HTMLElement | null>(null)

	// Discover shader container once (the nearest positioned <div> ancestor,
	// which is the shaders package's <Shader> wrapper).
	useEffect(() => {
		const marker = markerRef.current
		if (!marker) return
		const container = marker.closest("div")
		if (container) {
			container.style.position = "relative"
			layersContainerRef.current = container
		}
	}, [])

	// The shaders-package's <Shader> dictates container dimensions; overlay
	// fills it via absolute inset:0 so child content's `h-full` works.
	const { overlayNode, overlayRef } = useInteractiveOverlay({
		interactive,
		children,
		layersContainerRef,
		fill: true,
	})

	const snapshotCanvas = useDomSnapshot(overlayRef, {
		interactive,
		maxPixelRatio,
	})

	// Register a fragment node in the shaders package's graph, sampling
	// a CanvasTexture wrapping the snapshot canvas.
	useEffect(() => {
		if (!context || !snapshotCanvas) return

		const tex = new CanvasTexture(snapshotCanvas)
		tex.colorSpace = SRGBColorSpace

		const fragmentNode = ({
			onBeforeRender,
			onCleanup,
		}: {
			onBeforeRender: (cb: () => void) => void
			onCleanup: (cb: () => void) => void
		}) => {
			const textureNode = texture(tex)
			onBeforeRender(() => {
				if (snapshotCanvas.width > 0 && snapshotCanvas.height > 0) {
					tex.needsUpdate = true
				}
			})
			onCleanup(() => tex.dispose())
			const uv = screenUV
			const sampled = textureNode.sample(vec2(uv.x, float(1).sub(uv.y)))
			return vec4(sampled.rgb, sampled.a)
		}

		context.shaderNodeRegister(
			instanceId,
			fragmentNode,
			context.shaderParentId,
			{ blendMode: "normal", opacity: 1, visible: true },
			{},
			{ name: "HtmlTexture", props: {}, fragmentNode }
		)

		return () => {
			context.shaderNodeRegister(instanceId, null, null, null, null)
			tex.dispose()
		}
	}, [context, instanceId, snapshotCanvas])

	return (
		<>
			{overlayNode}
			<span
				ref={markerRef}
				style={{ display: "contents" }}
				data-shader-id={instanceId}
			/>
		</>
	)
}
