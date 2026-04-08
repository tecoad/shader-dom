/**
 * Renders text selection highlights as positioned divs over the shader canvas.
 * Works with opacity: 0 overlays because Range.getClientRects() reads
 * from layout, not rendering — geometry is correct regardless of opacity.
 *
 * Uses a div pool to avoid creating/destroying elements on every selection change.
 */
export function setupSelectionHighlights(
  container: HTMLElement,
  highlightLayer: HTMLElement,
): () => void {
  const pool: HTMLElement[] = []

  function updateHighlights() {
    const sel = window.getSelection()
    const rects: DOMRect[] = []

    if (sel && !sel.isCollapsed) {
      const containerRect = container.getBoundingClientRect()

      for (let i = 0; i < sel.rangeCount; i++) {
        const range = sel.getRangeAt(i)
        if (!container.contains(range.commonAncestorContainer)) continue

        for (const rect of range.getClientRects()) {
          rects.push(
            new DOMRect(
              rect.left - containerRect.left,
              rect.top - containerRect.top,
              rect.width,
              rect.height,
            ),
          )
        }
      }
    }

    // Grow pool as needed
    while (pool.length < rects.length) {
      const div = document.createElement("div")
      div.style.cssText =
        "position:absolute;background:rgba(100,130,255,0.35);pointer-events:none;border-radius:2px;"
      highlightLayer.appendChild(div)
      pool.push(div)
    }

    // Position active highlights
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      const div = pool[i]
      div.style.left = `${r.x}px`
      div.style.top = `${r.y}px`
      div.style.width = `${r.width}px`
      div.style.height = `${r.height}px`
      div.style.display = "block"
    }

    // Hide unused
    for (let i = rects.length; i < pool.length; i++) {
      pool[i].style.display = "none"
    }
  }

  document.addEventListener("selectionchange", updateHighlights)
  window.addEventListener("scroll", updateHighlights, true)
  window.addEventListener("resize", updateHighlights)

  return () => {
    document.removeEventListener("selectionchange", updateHighlights)
    window.removeEventListener("scroll", updateHighlights, true)
    window.removeEventListener("resize", updateHighlights)
    for (const div of pool) div.remove()
    pool.length = 0
  }
}
