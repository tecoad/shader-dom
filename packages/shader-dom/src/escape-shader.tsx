import { type ReactNode, useContext, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { EscapeLayerContext } from "./html-texture"

export interface EscapeShaderProps {
  children: ReactNode
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
export function EscapeShader({ children }: EscapeShaderProps) {
  const escapeLayer = useContext(EscapeLayerContext)
  const ghostRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  // Sync portal position to ghost position each frame
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
      requestAnimationFrame(sync)
    }
    requestAnimationFrame(sync)
    return () => { running = false }
  }, [escapeLayer])

  return (
    <>
      {/* Ghost: invisible, maintains layout space in overlay */}
      <div
        ref={ghostRef}
        style={{ visibility: "hidden", pointerEvents: "none" }}
        data-escape-shader
      >
        {children}
      </div>
      {/* Real: portaled above canvas, visible, interactive */}
      {escapeLayer && createPortal(
        <div ref={portalRef} style={{ position: "absolute", pointerEvents: "auto" }}>
          {children}
        </div>,
        escapeLayer,
      )}
    </>
  )
}
