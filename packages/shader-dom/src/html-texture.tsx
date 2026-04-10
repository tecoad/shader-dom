import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react"
import { ShaderContext } from "shaders/dist/react/Shader.js"
import { CanvasTexture, SRGBColorSpace } from "three/webgpu"
import { float, screenUV, texture, vec2, vec4 } from "three/tsl"

import { snapshotToCanvas } from "./snapshot"
import { setupSelectionHighlights } from "./selection"
import { setupCaretRendering } from "./caret"

export const EscapeLayerContext = createContext<HTMLElement | null>(null)

export interface HtmlTextureProps {
  children: ReactNode
  interactive?: boolean
}

export function HtmlTexture({
  children,
  interactive = false,
}: HtmlTextureProps) {
  const context = useContext(ShaderContext)
  const domRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLSpanElement>(null)
  const snapshotCanvas = useRef<HTMLCanvasElement>(null as unknown as HTMLCanvasElement)
  const canvasTextureRef = useRef<CanvasTexture | null>(null)
  const snapshotting = useRef(false)
  const reactId = useId()
  const instanceId = reactId.replace(/[^a-zA-Z0-9_]/g, "")

  // Register custom shader node with CanvasTexture
  useEffect(() => {
    if (!context) return

    if (!snapshotCanvas.current) {
      snapshotCanvas.current = document.createElement("canvas")
    }
    const canvas = snapshotCanvas.current
    const canvasTexture = new CanvasTexture(canvas)
    canvasTexture.colorSpace = SRGBColorSpace
    canvasTextureRef.current = canvasTexture

    const componentDef = {
      name: "HtmlTexture",
      props: {},
      fragmentNode: ({
        onBeforeRender,
        onCleanup,
      }: {
        onBeforeRender: (cb: () => void) => void
        onCleanup: (cb: () => void) => void
      }) => {
        const textureNode = texture(canvasTexture)

        onBeforeRender(() => {
          if (canvas.width > 0 && canvas.height > 0) {
            canvasTexture.needsUpdate = true
          }
        })

        onCleanup(() => {
          canvasTexture.dispose()
        })

        // Sample with flipped Y (SVG/DOM is top-down, GL is bottom-up)
        const uv = screenUV
        const sampledColor = textureNode.sample(vec2(uv.x, float(1).sub(uv.y)))
        return vec4(sampledColor.rgb, sampledColor.a)
      },
    }

    context.shaderNodeRegister(
      instanceId,
      componentDef.fragmentNode,
      context.shaderParentId,
      { blendMode: "normal", opacity: 1, visible: true },
      {},
      componentDef,
    )

    return () => {
      context.shaderNodeRegister(instanceId, null, null, null, null)
      canvasTexture.dispose()
      canvasTextureRef.current = null
    }
  }, [context, instanceId])

  // Snapshot loop
  const snapshot = useCallback(() => {
    const el = domRef.current
    if (!el || snapshotting.current) return
    snapshotting.current = true
    snapshotToCanvas(el, snapshotCanvas.current, () => {
      snapshotting.current = false
    })
  }, [])

  useEffect(() => {
    const el = domRef.current
    if (!el) return

    if (interactive) {
      let running = true
      const loop = () => {
        if (!running) return
        snapshot()
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
      return () => {
        running = false
      }
    }

    requestAnimationFrame(snapshot)

    const mutationObs = new MutationObserver(() =>
      requestAnimationFrame(snapshot),
    )
    mutationObs.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })

    const resizeObs = new ResizeObserver(() =>
      requestAnimationFrame(snapshot),
    )
    resizeObs.observe(el)

    return () => {
      mutationObs.disconnect()
      resizeObs.disconnect()
    }
  }, [snapshot, interactive])

  // Find shader container once for both layers
  const shaderContainerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const marker = markerRef.current
    if (!marker) return
    // Shader renders a <div>, shader components render <span style="display:contents">
    // So the first <div> ancestor is the Shader container (no need to wait for canvas)
    const container = marker.closest("div")
    if (container) {
      container.style.position = "relative"
      shaderContainerRef.current = container
    }
  }, [])

  // Selection highlights — rendered between canvas and overlay
  useEffect(() => {
    if (!interactive) return
    const overlay = domRef.current
    const shaderContainer = shaderContainerRef.current
    if (!overlay || !shaderContainer) return

    const highlightLayer = document.createElement("div")
    highlightLayer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:1;"
    shaderContainer.appendChild(highlightLayer)

    const cleanup = setupSelectionHighlights(overlay, highlightLayer)

    return () => {
      cleanup()
      highlightLayer.remove()
    }
  }, [interactive])

  // Caret rendering — fake blinking caret for focused inputs
  useEffect(() => {
    if (!interactive) return
    const overlay = domRef.current
    const shaderContainer = shaderContainerRef.current
    if (!overlay || !shaderContainer) return

    const caretLayer = document.createElement("div")
    caretLayer.style.cssText =
      "position:absolute;inset:0;pointer-events:none;z-index:4;"
    shaderContainer.appendChild(caretLayer)

    const cleanup = setupCaretRendering(overlay, caretLayer)

    return () => {
      cleanup()
      caretLayer.remove()
    }
  }, [interactive])

  // Escape layer — created once, shared via context with EscapeShader children
  const [escapeLayer, setEscapeLayer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const shaderContainer = shaderContainerRef.current
    if (!shaderContainer) return

    const layer = document.createElement("div")
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3;"
    shaderContainer.appendChild(layer)
    setEscapeLayer(layer)

    return () => {
      layer.remove()
      setEscapeLayer(null)
    }
  }, [])

  return (
    <>
      {/* Overlay — position:absolute works because parent spans are display:contents,
          so it positions relative to the Shader container (nearest positioned ancestor) */}
      <div
        ref={domRef}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          pointerEvents: interactive ? "auto" : "none",
          zIndex: 2,
        }}
      >
        <EscapeLayerContext.Provider value={escapeLayer}>
          {children}
        </EscapeLayerContext.Provider>
      </div>
      {/* Marker span for render order detection + shader container discovery */}
      <span ref={markerRef} style={{ display: "contents" }} data-shader-id={instanceId} />
    </>
  )
}
