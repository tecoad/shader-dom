import { useState, useRef, useCallback, useEffect, type RefObject } from "react"

function extractPageCSS(): string {
  let css = ""
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        css += rule.cssText
      }
    } catch {}
  }
  return css
}

// Visual properties to capture from getComputedStyle on hovered/active elements.
// Layout props (width, height, padding, display, flex) are excluded.
const VISUAL_PROPS = [
  "background-color", "background-image", "background",
  "color", "opacity",
  "transform", "scale", "rotate", "translate",
  "box-shadow", "border-color",
  "outline", "outline-color", "outline-offset",
  "text-shadow", "text-decoration-color",
  "filter", "backdrop-filter",
]

/**
 * Reads computed styles from hovered/active elements on the ORIGINAL DOM,
 * then applies them to corresponding elements on the CLONE.
 * Never modifies the live DOM — zero style recalc cost.
 */
function applyInteractiveStyles(original: HTMLElement, clone: HTMLElement) {
  const hovered = original.querySelectorAll(":hover")
  const active = original.querySelectorAll(":active")
  const targets = new Set([...hovered, ...active])
  if (targets.size === 0) return

  const origAll = [...original.querySelectorAll("*")]
  const cloneAll = [...clone.querySelectorAll("*")]

  for (const target of targets) {
    const idx = origAll.indexOf(target as Element)
    if (idx === -1) continue
    const clonedEl = cloneAll[idx] as HTMLElement
    const computed = getComputedStyle(target)
    for (const prop of VISUAL_PROPS) {
      clonedEl.style.setProperty(prop, computed.getPropertyValue(prop))
    }
  }
}

/**
 * Copies dynamic form state from original to clone.
 * cloneNode only copies HTML attributes, not DOM properties
 * like .value, .checked, .scrollTop which change at runtime.
 */
function syncFormState(original: HTMLElement, clone: HTMLElement) {
  const origInputs = original.querySelectorAll("input, textarea, select")
  const cloneInputs = clone.querySelectorAll("input, textarea, select")

  for (let i = 0; i < origInputs.length; i++) {
    const orig = origInputs[i] as HTMLInputElement
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
      ;(cloned as unknown as HTMLSelectElement).selectedIndex = orig.selectedIndex
    }
  }

  // Sync scroll positions
  const origScrollable = original.querySelectorAll("*")
  const cloneScrollable = clone.querySelectorAll("*")
  for (let i = 0; i < origScrollable.length; i++) {
    const orig = origScrollable[i] as HTMLElement
    if (orig.scrollTop || orig.scrollLeft) {
      ;(cloneScrollable[i] as HTMLElement).scrollTop = orig.scrollTop
      ;(cloneScrollable[i] as HTMLElement).scrollLeft = orig.scrollLeft
    }
  }
}

export function useDomSnapshot(domRef: RefObject<HTMLDivElement | null>, deps: unknown[] = []) {
  const [texture, setTexture] = useState<HTMLCanvasElement | null>(null)
  const snapshotting = useRef(false)
  const cachedCSS = useRef("")

  useEffect(() => {
    requestAnimationFrame(() => {
      cachedCSS.current = extractPageCSS()
    })
  }, [])

  const snapshot = useCallback(() => {
    const el = domRef.current
    if (!el || snapshotting.current) return
    snapshotting.current = true

    const width = el.offsetWidth
    const height = el.offsetHeight

    const clone = el.cloneNode(true) as HTMLElement
    clone.style.opacity = "1"

    // Sync form state: cloneNode doesn't capture .value, .checked, scrollTop
    syncFormState(el, clone)

    // Apply real computed styles to hovered/active elements on the clone
    applyInteractiveStyles(el, clone)

    const xml = new XMLSerializer().serializeToString(clone)
    const isDark = document.documentElement.classList.contains("dark")
    const svgClass = isDark ? ' class="dark"' : ""

    const svgString =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${svgClass}>` +
      `<foreignObject width="100%" height="100%">` +
      `<html xmlns="http://www.w3.org/1999/xhtml"${svgClass}>` +
      `<head><style><![CDATA[${cachedCSS.current}]]></style></head>` +
      `<body>${xml}</body>` +
      `</html>` +
      `</foreignObject></svg>`

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = width * 2
      canvas.height = height * 2
      const ctx = canvas.getContext("2d")!
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0, width, height)
      setTexture(canvas)
      snapshotting.current = false
    }
    img.onerror = () => {
      snapshotting.current = false
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domRef, ...deps])

  return { texture, snapshot }
}
