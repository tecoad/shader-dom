import { type ReactNode, useContext, useEffect } from "react"
import { ShaderContext, type ShaderContextValue } from "./shader-context"
import { useDomSnapshot } from "./use-dom-snapshot"
import { useInteractiveOverlay } from "./use-interactive-overlay"

export interface HtmlTextureProps {
	children: ReactNode
	interactive?: boolean
	/**
	 * Cap the snapshot canvas DPR. The SVG raster + GPU upload scale with
	 * pixel count, so on a Retina display lowering this to `1` cuts ~4× of
	 * per-frame snapshot cost. Useful when the consuming shader already
	 * blurs/distorts the texture (e.g. wave displacement). Default: full
	 * `window.devicePixelRatio`.
	 */
	maxPixelRatio?: number
	/**
	 * When true, the overlay fills the parent <Shader> via
	 * `position: absolute; inset: 0`, letting the Shader (and whatever sizes
	 * it from outside) dictate dimensions. Default is content-driven sizing —
	 * the overlay is `position: relative` and its children's intrinsic size
	 * drives the Shader.
	 *
	 * Use `fill` when the snapshot tree's height comes from outside the
	 * Shader (e.g. a parent sized via `h-[70dvh]`) and you want to use
	 * `h-full` / `w-full` inside. This avoids viewport units (vh/dvh/vw/dvw)
	 * being re-resolved against the SVG foreignObject's own box during
	 * rasterization, which produces a height/width mismatch between the
	 * live element and its cloned copy in the snapshot.
	 */
	fill?: boolean
}

/**
 * Renders DOM children as an invisible interactive overlay whose contents
 * are captured (every frame when interactive, on mutation otherwise) and
 * fed to the parent <Shader> as a texture.
 *
 * Must be used inside <Shader> from "shader-dom". For the shaders/react
 * integration, import from "shader-dom/shaders" instead. When used without
 * either parent, the children render as plain pass-through (no shader).
 */
export function HtmlTexture(props: HtmlTextureProps) {
	const context = useContext(ShaderContext)

	if (!context) {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				"[shader-dom] <HtmlTexture> used outside <Shader> — rendering children as pass-through."
			)
		}
		return <>{props.children}</>
	}

	return <HtmlTextureInner {...props} context={context} />
}

function HtmlTextureInner({
	children,
	interactive = false,
	maxPixelRatio,
	fill = false,
	context,
}: HtmlTextureProps & { context: ShaderContextValue }) {
	const { overlayNode, overlayRef } = useInteractiveOverlay({
		interactive,
		children,
		layersContainerRef: context.layersContainerRef,
		fill,
	})

	const snapshotCanvas = useDomSnapshot(overlayRef, {
		interactive,
		maxPixelRatio,
		onSnapshot: canvas => context.notifySnapshotUpdate(canvas),
	})

	useEffect(() => {
		if (!snapshotCanvas) return
		return context.registerSnapshot(snapshotCanvas)
	}, [context, snapshotCanvas])

	return overlayNode
}
