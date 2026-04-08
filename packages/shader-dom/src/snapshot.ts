let cachedCSS: string | null = null

/**
 * Collects all CSS rules from every stylesheet on the page.
 * Cached — CSS doesn't change frame-to-frame during interaction.
 */
export function extractPageCSS(): string {
  if (cachedCSS !== null) return cachedCSS
  let css = ""
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        css += rule.cssText
      }
    } catch {
      // Cross-origin stylesheets throw SecurityError — skip them
    }
  }
  cachedCSS = css
  return css
}

export function invalidateCSSCache(): void {
  cachedCSS = null
}

/**
 * Copies runtime form state from original to clone.
 * cloneNode only copies HTML attributes, not DOM properties
 * like .value, .checked, .scrollTop which change at runtime.
 */
export function syncFormState(original: HTMLElement, clone: HTMLElement): void {
  const origInputs = original.querySelectorAll("input, textarea, select")
  const cloneInputs = clone.querySelectorAll("input, textarea, select")

  for (let i = 0; i < origInputs.length; i++) {
    const orig = origInputs[i]
    const cloned = cloneInputs[i] as HTMLInputElement

    if (orig instanceof HTMLInputElement) {
      if (orig.type === "checkbox" || orig.type === "radio") {
        cloned.checked = orig.checked
        if (orig.checked) cloned.setAttribute("checked", "")
        else cloned.removeAttribute("checked")
      } else {
        cloned.setAttribute("value", orig.value)
      }
    } else if (orig instanceof HTMLTextAreaElement) {
      ;(cloned as unknown as HTMLTextAreaElement).textContent = orig.value
    } else if (orig instanceof HTMLSelectElement) {
      ;(cloned as unknown as HTMLSelectElement).selectedIndex =
        orig.selectedIndex
    }
  }

  const origAll = original.querySelectorAll("*")
  const cloneAll = clone.querySelectorAll("*")
  for (let i = 0; i < origAll.length; i++) {
    const orig = origAll[i] as HTMLElement
    if (orig.scrollTop || orig.scrollLeft) {
      ;(cloneAll[i] as HTMLElement).scrollTop = orig.scrollTop
      ;(cloneAll[i] as HTMLElement).scrollLeft = orig.scrollLeft
    }
  }
}

const VISUAL_PROPS = [
  "background-color",
  "background-image",
  "background",
  "color",
  "opacity",
  "transform",
  "scale",
  "rotate",
  "translate",
  "box-shadow",
  "border-color",
  "outline",
  "outline-color",
  "outline-offset",
  "text-shadow",
  "text-decoration-color",
  "filter",
  "backdrop-filter",
]

/**
 * Reads computed styles from interactive elements on the ORIGINAL DOM,
 * then applies them to corresponding elements on the CLONE.
 * Captures elements that are :hover/:active AND elements with active
 * CSS transitions (so transition intermediates are captured correctly).
 * Never modifies the live DOM — zero style recalc cost.
 */
export function applyInteractiveStyles(
  original: HTMLElement,
  clone: HTMLElement,
): void {
  const origAll = [...original.querySelectorAll("*")]
  const cloneAll = [...clone.querySelectorAll("*")]

  const hovered = new Set(original.querySelectorAll(":hover"))
  const active = new Set(original.querySelectorAll(":active"))

  for (let i = 0; i < origAll.length; i++) {
    const el = origAll[i]
    const isInteractive = hovered.has(el) || active.has(el)

    const computed = getComputedStyle(el)
    const hasTransition =
      computed.transitionProperty !== "none" &&
      computed.transitionProperty !== ""

    if (isInteractive || hasTransition) {
      const clonedEl = cloneAll[i] as HTMLElement
      for (const prop of VISUAL_PROPS) {
        clonedEl.style.setProperty(prop, computed.getPropertyValue(prop))
      }
    }
  }
}

/**
 * Snapshots an HTML element onto a target canvas (async due to Image load).
 *
 * Pipeline: clone → sync form state → apply :hover/:active styles →
 * serialize to XML → wrap in SVG foreignObject with cached page CSS →
 * load as Image → draw to target canvas at 2x (retina)
 *
 * No PNG encoding, no blob URLs — draws directly to the canvas
 * that backs the CanvasTexture for immediate GPU upload.
 */
export function snapshotToCanvas(
  el: HTMLElement,
  targetCanvas: HTMLCanvasElement,
  onComplete?: () => void,
): void {
  const width = el.offsetWidth
  const height = el.offsetHeight
  if (width === 0 || height === 0) return

  const clone = el.cloneNode(true) as HTMLElement
  clone.style.opacity = "1"

  syncFormState(el, clone)
  applyInteractiveStyles(el, clone)

  // Hide escaped elements in the texture (they render in a separate visible layer)
  const escaped = clone.querySelectorAll<HTMLElement>("[data-escape-shader]")
  for (const el of escaped) {
    el.style.visibility = "hidden"
  }

  const css = extractPageCSS()
  const xml = new XMLSerializer().serializeToString(clone)
  const isDark = document.documentElement.classList.contains("dark")
  const svgClass = isDark ? ' class="dark"' : ""

  const svgString =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${svgClass}>` +
    `<foreignObject width="100%" height="100%">` +
    `<html xmlns="http://www.w3.org/1999/xhtml"${svgClass}>` +
    `<head><style><![CDATA[${css}]]></style></head>` +
    `<body>${xml}</body>` +
    `</html>` +
    `</foreignObject></svg>`

  const img = new Image()
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1
    targetCanvas.width = width * dpr
    targetCanvas.height = height * dpr
    const ctx = targetCanvas.getContext("2d")!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    onComplete?.()
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
}
