import { useEffect, useRef, type RefObject } from "react"

/**
 * Renders text selection highlights as positioned divs over the shader canvas.
 * Works with opacity: 0 overlays because Range.getClientRects() returns
 * layout-based geometry regardless of visual opacity.
 */
export function useSelectionHighlight(
  containerRef: RefObject<HTMLElement | null>,
  highlightRef: RefObject<HTMLElement | null>
) {
  const poolRef = useRef<HTMLElement[]>([])

  useEffect(() => {
    const container = containerRef.current
    const highlightLayer = highlightRef.current
    if (!container || !highlightLayer) return

    function updateHighlights() {
      const sel = window.getSelection()
      let rectsToRender: DOMRect[] = []

      if (sel && !sel.isCollapsed) {
        const containerRect = container!.getBoundingClientRect()

        for (let i = 0; i < sel.rangeCount; i++) {
          const range = sel.getRangeAt(i)
          // Only show highlights for selections within our container
          if (!container!.contains(range.commonAncestorContainer)) continue

          const rects = range.getClientRects()
          for (const rect of rects) {
            rectsToRender.push(
              new DOMRect(
                rect.left - containerRect.left,
                rect.top - containerRect.top,
                rect.width,
                rect.height
              )
            )
          }
        }
      }

      // Reuse or create div pool
      const pool = poolRef.current
      while (pool.length < rectsToRender.length) {
        const div = document.createElement("div")
        div.style.cssText =
          "position:absolute;background:rgba(100,130,255,0.35);pointer-events:none;border-radius:2px;"
        highlightLayer!.appendChild(div)
        pool.push(div)
      }

      // Position active divs
      for (let i = 0; i < rectsToRender.length; i++) {
        const r = rectsToRender[i]
        const div = pool[i]
        div.style.left = `${r.x}px`
        div.style.top = `${r.y}px`
        div.style.width = `${r.width}px`
        div.style.height = `${r.height}px`
        div.style.display = "block"
      }

      // Hide unused divs
      for (let i = rectsToRender.length; i < pool.length; i++) {
        pool[i].style.display = "none"
      }
    }

    document.addEventListener("selectionchange", updateHighlights)
    // Also update on scroll/resize
    window.addEventListener("scroll", updateHighlights, true)
    window.addEventListener("resize", updateHighlights)

    return () => {
      document.removeEventListener("selectionchange", updateHighlights)
      window.removeEventListener("scroll", updateHighlights, true)
      window.removeEventListener("resize", updateHighlights)
      // Clean up pool
      poolRef.current.forEach(div => div.remove())
      poolRef.current = []
    }
  }, [containerRef, highlightRef])
}
