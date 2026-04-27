import { type ReactNode, useContext, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { EscapeLayerContext } from "./escape-layer-context"

export interface EscapeShaderProps {
	children: ReactNode
	/**
	 * When true, the ghost is `position: absolute; inset: 0`, so it does
	 * NOT contribute to layout but still has the dimensions of the nearest
	 * positioned ancestor. Useful when the escaped subtree is positioned
	 * absolutely (e.g. floating overlays) and the parent already reserves
	 * the space some other way. Default: false (ghost is in flow).
	 */
	fill?: boolean
	/**
	 * Controls `pointer-events` on the portal wrapper in the escape layer.
	 * Default `"auto"` (escaped DOM is clickable). Set to `"none"` for
	 * purely visual overlays whose area should pass clicks through to
	 * elements behind them. Default: "auto".
	 */
	pointerEvents?: "auto" | "none"
}

/**
 * Renders children outside the shader pipeline while maintaining layout position.
 *
 * Ghost (visibility:hidden) stays in the overlay for correct layout participation.
 * Real children are portaled above the canvas via the escape layer.
 *
 * Trade-off: children render twice (ghost + portal). For simple components
 * (buttons, badges, links) this is negligible.
 */
export function EscapeShader({
	children,
	fill = false,
	pointerEvents = "auto",
}: EscapeShaderProps) {
	const escapeLayer = useContext(EscapeLayerContext)
	const ghostRef = useRef<HTMLDivElement>(null)
	const portalRef = useRef<HTMLDivElement>(null)

	// Sync portal position AND size to ghost each frame. Width/height sync
	// matters when children are absolutely positioned (ghost's content
	// layout is empty, so the portal would otherwise collapse to 0x0 and
	// absolute children inside it would land at the wrong coordinates).
	useEffect(() => {
		const ghost = ghostRef.current
		const portal = portalRef.current
		if (!ghost || !portal || !escapeLayer) return

		let running = true
		const sync = () => {
			if (!running) return
			const ghostRect = ghost.getBoundingClientRect()
			const layerRect = escapeLayer.getBoundingClientRect()
			portal.style.left = `${ghostRect.left - layerRect.left}px`
			portal.style.top = `${ghostRect.top - layerRect.top}px`
			portal.style.width = `${ghostRect.width}px`
			portal.style.height = `${ghostRect.height}px`
			requestAnimationFrame(sync)
		}
		requestAnimationFrame(sync)
		return () => {
			running = false
		}
	}, [escapeLayer])

	const ghostStyle: React.CSSProperties = fill
		? {
				position: "absolute",
				inset: 0,
				visibility: "hidden",
				pointerEvents: "none",
			}
		: {
				visibility: "hidden",
				pointerEvents: "none",
			}

	return (
		<>
			{/* Ghost: invisible, maintains layout space in overlay */}
			<div ref={ghostRef} style={ghostStyle} data-escape-shader>
				{children}
			</div>
			{/* Real: portaled above canvas, visible, interactive */}
			{escapeLayer &&
				createPortal(
					<div
						ref={portalRef}
						style={{ position: "absolute", pointerEvents }}
					>
						{children}
					</div>,
					escapeLayer
				)}
		</>
	)
}
