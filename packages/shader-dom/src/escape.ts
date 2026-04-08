const ESCAPE_ATTR = "data-escape-shader"

/**
 * Sets up the escape layer and returns a cleanup function.
 *
 * Clones are created once and updated via MutationObserver (not every frame).
 * Positions are synced each frame via RAF. This ensures text selection
 * isn't disrupted by clone recreation mid-drag.
 *
 * The escape layer has pointer-events: auto so clones receive hover,
 * click, and selection events directly. The overlay's escaped elements
 * have pointer-events: none, creating "holes" that let events through.
 */
export function setupEscapeLayer(
  overlay: HTMLElement,
  escapeLayer: HTMLElement,
): () => void {
  const wrappers: HTMLElement[] = []

  function reclone() {
    const escaped = overlay.querySelectorAll<HTMLElement>(`[${ESCAPE_ATTR}]`)

    // Grow or shrink wrapper pool
    while (wrappers.length < escaped.length) {
      const wrapper = document.createElement("div")
      wrapper.style.cssText = "position:absolute;overflow:hidden;"
      escapeLayer.appendChild(wrapper)
      wrappers.push(wrapper)
    }
    while (wrappers.length > escaped.length) {
      wrappers.pop()!.remove()
    }

    for (let i = 0; i < escaped.length; i++) {
      const source = escaped[i]
      const wrapper = wrappers[i]
      wrapper.innerHTML = ""
      const clone = source.cloneNode(true) as HTMLElement
      clone.removeAttribute(ESCAPE_ATTR)
      clone.style.pointerEvents = "auto"
      wrapper.appendChild(clone)
    }
  }

  function syncPositions() {
    const escaped = overlay.querySelectorAll<HTMLElement>(`[${ESCAPE_ATTR}]`)

    for (let i = 0; i < escaped.length && i < wrappers.length; i++) {
      const rect = escaped[i].getBoundingClientRect()
      const wrapper = wrappers[i]
      // Escape layer is position:fixed, so use viewport coords directly
      wrapper.style.left = `${rect.left}px`
      wrapper.style.top = `${rect.top}px`
      wrapper.style.width = `${rect.width}px`
      wrapper.style.height = `${rect.height}px`
    }
  }

  // Initial clone + position
  reclone()
  syncPositions()

  // Re-clone on DOM changes
  const mutObs = new MutationObserver(() => {
    reclone()
    syncPositions()
  })
  mutObs.observe(overlay, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  // Sync positions each frame
  let running = true
  const loop = () => {
    if (!running) return
    syncPositions()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  return () => {
    running = false
    mutObs.disconnect()
    for (const w of wrappers) w.remove()
    wrappers.length = 0
  }
}

export { ESCAPE_ATTR }
