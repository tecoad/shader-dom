import {
	type ReactNode,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react"
import { setupCaretRendering } from "./caret"
import { EscapeLayerContext } from "./escape-layer-context"
import { setupSelectionHighlights } from "./selection"

export interface UseInteractiveOverlayOptions {
	interactive: boolean
	children: ReactNode
	/**
	 * Ref pointing to the positioned ancestor the hook appends
	 * selection/caret/escape layers to. Core <Shader> provides
	 * its container; adapter resolves via closest("div") on a marker.
	 */
	layersContainerRef: RefObject<HTMLElement | null>
	/**
	 * When true, the overlay uses `position: absolute; inset: 0` to fill
	 * the positioned ancestor (required when the ancestor dictates dimensions
	 * — e.g. the `shaders/react` package's <Shader>). When false (default),
	 * the overlay is `position: relative` with natural sizing, so the
	 * content drives the ancestor's dimensions.
	 */
	fill?: boolean
}

export interface UseInteractiveOverlayResult {
	overlayNode: ReactNode
	overlayRef: RefObject<HTMLDivElement | null>
}

/**
 * Builds the invisible interactive overlay DOM and wires up:
 *  - Selection highlight layer (z-index 1)
 *  - Escape layer (z-index 3) with EscapeLayerContext provision
 *  - Caret rendering layer (z-index 4)
 *
 * All layers attach to `layersContainerRef.current`. The overlay itself
 * (z-index 2) is rendered inline and is where children actually mount.
 */
export function useInteractiveOverlay({
	interactive,
	children,
	layersContainerRef,
	fill = false,
}: UseInteractiveOverlayOptions): UseInteractiveOverlayResult {
	const overlayRef = useRef<HTMLDivElement>(null)
	const [escapeLayer, setEscapeLayer] = useState<HTMLElement | null>(null)

	// Selection highlight layer
	useEffect(() => {
		if (!interactive) return
		const overlay = overlayRef.current
		const container = layersContainerRef.current
		if (!overlay || !container) return

		const layer = document.createElement("div")
		layer.style.cssText =
			"position:absolute;inset:0;pointer-events:none;z-index:1;"
		container.appendChild(layer)

		const cleanup = setupSelectionHighlights(overlay, layer)

		return () => {
			cleanup()
			layer.remove()
		}
	}, [interactive, layersContainerRef])

	// Caret rendering layer
	useEffect(() => {
		if (!interactive) return
		const overlay = overlayRef.current
		const container = layersContainerRef.current
		if (!overlay || !container) return

		const layer = document.createElement("div")
		layer.style.cssText =
			"position:absolute;inset:0;pointer-events:none;z-index:4;"
		container.appendChild(layer)

		const cleanup = setupCaretRendering(overlay, layer)

		return () => {
			cleanup()
			layer.remove()
		}
	}, [interactive, layersContainerRef])

	// Escape layer (always present, used via EscapeLayerContext)
	useEffect(() => {
		const container = layersContainerRef.current
		if (!container) return

		const layer = document.createElement("div")
		layer.style.cssText =
			"position:absolute;inset:0;pointer-events:none;z-index:3;"
		container.appendChild(layer)
		setEscapeLayer(layer)

		return () => {
			layer.remove()
			setEscapeLayer(null)
		}
	}, [layersContainerRef])

	const overlayNode = (
		<div
			ref={overlayRef}
			style={
				fill
					? {
							position: "absolute",
							inset: 0,
							opacity: 0,
							pointerEvents: interactive ? "auto" : "none",
							zIndex: 2,
						}
					: {
							// Relative + natural sizing: overlay flows in-document and
							// takes its children's intrinsic size, which in turn sizes
							// the parent container. Content drives dimensions.
							position: "relative",
							opacity: 0,
							pointerEvents: interactive ? "auto" : "none",
							zIndex: 2,
						}
			}
		>
			<EscapeLayerContext.Provider value={escapeLayer}>
				{children}
			</EscapeLayerContext.Provider>
		</div>
	)

	return { overlayNode, overlayRef }
}
