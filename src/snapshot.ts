let cachedCSS: string | null = null
let cachedSheetCount = 0
let fontUrlMap: Map<string, string> | null = null
let fontEmbedStarted = false

/**
 * Collects all CSS rules from every stylesheet on the page.
 * Cached, but invalidates when stylesheets are added/removed
 * (e.g., motion/react's popLayout injects dynamic <style> tags).
 *
 * On first extraction, kicks off async font embedding in the background.
 * Once fonts are embedded as base64, the cache updates and subsequent
 * snapshots render custom fonts correctly inside SVG foreignObject.
 */
function extractPageCSS(): string {
	const currentCount = document.styleSheets.length
	if (cachedCSS !== null && currentCount === cachedSheetCount) return cachedCSS

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

	// Re-apply cached font embeddings to the fresh CSS
	if (fontUrlMap) {
		for (const [originalUrl, dataUri] of fontUrlMap) {
			css = css.split(originalUrl).join(dataUri)
		}
	}

	cachedCSS = css
	cachedSheetCount = currentCount

	// Kick off font embedding in background (one-time)
	if (!fontEmbedStarted) {
		fontEmbedStarted = true
		buildFontMap(css).then(map => {
			if (map.size > 0) {
				fontUrlMap = map
				// Re-apply to current cache
				let updated = cachedCSS!
				for (const [originalUrl, dataUri] of map) {
					updated = updated.split(originalUrl).join(dataUri)
				}
				cachedCSS = updated
			}
		})
	}

	return css
}

/**
 * Finds all @font-face url() references in CSS, fetches the font files,
 * converts to base64 data URIs, and replaces the URLs in the CSS string.
 * Font files are likely already in the browser cache — fetch is instant.
 */
async function buildFontMap(css: string): Promise<Map<string, string>> {
	const fontFaceRegex = /@font-face\s*\{[^}]*\}/g
	const urlRegex = /url\(["']?([^"')]+)["']?\)/g
	const map = new Map<string, string>()

	const fontFaces = css.match(fontFaceRegex)
	if (!fontFaces) return map

	const urls = new Set<string>()
	for (const block of fontFaces) {
		let match: RegExpExecArray | null
		urlRegex.lastIndex = 0
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		while ((match = urlRegex.exec(block)) !== null) {
			const url = match[1]
			if (!url.startsWith("data:")) urls.add(url)
		}
	}

	await Promise.all(
		[...urls].map(async url => {
			try {
				const resolved = new URL(url, window.location.href).href
				const response = await fetch(resolved)
				if (!response.ok) return
				const blob = await response.blob()
				const base64 = await blobToBase64(blob)
				map.set(url, base64)
			} catch {
				// Font fetch failed — skip
			}
		})
	)

	return map
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

/**
 * Copies runtime form state from original to clone.
 * cloneNode only copies HTML attributes, not DOM properties
 * like .value, .checked, .scrollTop which change at runtime.
 */
function syncFormState(original: HTMLElement, clone: HTMLElement): void {
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
function applyInteractiveStyles(
	original: HTMLElement,
	clone: HTMLElement
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
	onComplete?: () => void
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
