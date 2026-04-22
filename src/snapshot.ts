import { decompressFrames, parseGIF } from "gifuct-js"

const svgCache = new WeakMap<HTMLCanvasElement, string>()

let cachedCSS: string | null = null
let cachedSheetCount = 0
let fontUrlMap: Map<string, string> | null = null
let fontEmbedStarted = false

let imageUrlMap: Map<string, string> | null = null
let imageEmbedStarted = false
const imgDataCache = new Map<string, string>()

interface GifAnimation {
	frames: ImageData[]
	delays: number[]
	canvas: HTMLCanvasElement
	ctx: CanvasRenderingContext2D
	currentFrame: number
	lastAdvance: number
	width: number
	height: number
}

const gifCache = new Map<string, GifAnimation | "pending">()

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

	// Re-apply cached image embeddings to the fresh CSS
	if (imageUrlMap) {
		for (const [originalUrl, dataUri] of imageUrlMap) {
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
				let updated = cachedCSS!
				for (const [originalUrl, dataUri] of map) {
					updated = updated.split(originalUrl).join(dataUri)
				}
				cachedCSS = updated
			}
		})
	}

	// Kick off image URL embedding in background (one-time)
	if (!imageEmbedStarted) {
		imageEmbedStarted = true
		buildImageUrlMap(css).then(map => {
			if (map.size > 0) {
				imageUrlMap = map
				let updated = cachedCSS!
				for (const [originalUrl, dataUri] of map) {
					updated = updated.split(originalUrl).join(dataUri)
				}
				cachedCSS = updated
			}
		})
	}

	return cachedCSS
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

const FONT_EXTENSIONS = /\.(woff2?|ttf|otf|eot)(\?|$)/i
const ANIMATED_GIF = /\.gif(\?|$)/i

/**
 * Fetches a GIF, pre-composes all frames with correct disposal handling,
 * and stores the decoded animation in gifCache. Runs once per GIF URL.
 * While decoding, gifCache holds "pending" so embedImages can
 * fall back to static frame 0 via drawImage.
 *
 * Pre-composition strategy adapted from react-gif-timeline: each frame
 * is fully composited during parsing, so playback is just putImageData.
 */
function initGifAnimation(src: string): void {
	gifCache.set(src, "pending")
	fetch(src)
		.then(res => res.arrayBuffer())
		.then(buffer => {
			const gif = parseGIF(buffer)
			const rawFrames = decompressFrames(gif, true)
			if (rawFrames.length === 0) {
				gifCache.delete(src)
				return
			}

			const width = gif.lsd.width
			const height = gif.lsd.height

			// Accumulator canvas for compositing patches into full frames
			const accumulator = document.createElement("canvas")
			accumulator.width = width
			accumulator.height = height
			const accCtx = accumulator.getContext("2d")!

			// Temp canvas for drawing each frame's patch
			const temp = document.createElement("canvas")
			const tempCtx = temp.getContext("2d")!

			const frames: ImageData[] = []
			const delays: number[] = []

			for (const frame of rawFrames) {
				const { patch, dims, disposalType, delay } = frame

				if (patch) {
					temp.width = dims.width
					temp.height = dims.height
					const patchData = new ImageData(
						new Uint8ClampedArray(patch),
						dims.width,
						dims.height
					)
					tempCtx.putImageData(patchData, 0, 0)
					accCtx.drawImage(temp, dims.left, dims.top)
				}

				// Capture the full composited frame
				frames.push(accCtx.getImageData(0, 0, width, height))
				delays.push(delay)

				// Handle disposal
				if (disposalType === 2 || disposalType === 3) {
					accCtx.clearRect(dims.left, dims.top, dims.width, dims.height)
				}
			}

			// Render canvas for playback
			const canvas = document.createElement("canvas")
			canvas.width = width
			canvas.height = height
			const ctx = canvas.getContext("2d")!
			ctx.putImageData(frames[0], 0, 0)

			gifCache.set(src, {
				frames,
				delays,
				canvas,
				ctx,
				currentFrame: 0,
				lastAdvance: performance.now(),
				width,
				height,
			})
		})
		.catch(() => {
			gifCache.delete(src)
		})
}

/**
 * Advances a GIF animation to the correct frame based on elapsed time.
 * Frames are pre-composed, so this is just a putImageData call.
 */
function advanceGifFrame(anim: GifAnimation): void {
	const now = performance.now()
	if (now - anim.lastAdvance < anim.delays[anim.currentFrame]) return

	anim.currentFrame = (anim.currentFrame + 1) % anim.frames.length
	anim.lastAdvance = now
	anim.ctx.putImageData(anim.frames[anim.currentFrame], 0, 0)
}

/**
 * Finds all url() references in CSS outside @font-face blocks,
 * fetches them, and converts to base64 data URIs.
 * Mirrors buildFontMap — runs once in the background.
 */
async function buildImageUrlMap(css: string): Promise<Map<string, string>> {
	const urlRegex = /url\(["']?([^"')]+)["']?\)/g
	const fontFaceRegex = /@font-face\s*\{[^}]*\}/g
	const map = new Map<string, string>()

	// Collect URLs inside @font-face to exclude them
	const fontFaceUrls = new Set<string>()
	const fontFaces = css.match(fontFaceRegex)
	if (fontFaces) {
		for (const block of fontFaces) {
			let match: RegExpExecArray | null
			urlRegex.lastIndex = 0
			// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
			while ((match = urlRegex.exec(block)) !== null) {
				fontFaceUrls.add(match[1])
			}
		}
	}

	// Find all other url() references
	const urls = new Set<string>()
	urlRegex.lastIndex = 0
	let match: RegExpExecArray | null
	// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
	while ((match = urlRegex.exec(css)) !== null) {
		const url = match[1]
		if (url.startsWith("data:")) continue
		if (fontFaceUrls.has(url)) continue
		if (FONT_EXTENSIONS.test(url)) continue
		urls.add(url)
	}

	if (urls.size === 0) return map

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
				// Image fetch failed — skip
			}
		})
	)

	return map
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

/**
 * Embeds images as base64 data URIs in the clone so they survive
 * SVG foreignObject sandboxing. Uses canvas extraction for <img>
 * elements (synchronous, fast) and replaces inline background-image
 * URLs from the shared cache.
 */
function embedImages(original: HTMLElement, clone: HTMLElement): void {
	const origImages = original.querySelectorAll("img")
	const cloneImages = clone.querySelectorAll("img")

	for (let i = 0; i < origImages.length; i++) {
		const origImg = origImages[i]
		const cloneImg = cloneImages[i]
		const src = origImg.src
		if (!src || src.startsWith("data:")) continue

		// Animated GIF: decode with gifuct-js and advance frames
		if (ANIMATED_GIF.test(src)) {
			const cached = gifCache.get(src)
			if (!cached) {
				initGifAnimation(src)
				// Fall through to static drawImage for frame 0 while decoding
			} else if (cached !== "pending") {
				const frameAttr = cloneImg.getAttribute("data-gif-frame")
				if (frameAttr !== null) {
					// Controlled mode: render specific frame
					const frameIndex = Math.min(
						Math.max(0, parseInt(frameAttr, 10) || 0),
						cached.frames.length - 1
					)
					cached.ctx.putImageData(cached.frames[frameIndex], 0, 0)
				} else {
					// Auto mode: advance based on timing
					advanceGifFrame(cached)
				}
				const dataUri = cached.canvas.toDataURL()
				cloneImg.setAttribute("src", dataUri)
				continue
			}
			// If pending, fall through to static drawImage for frame 0
		}

		if (imgDataCache.has(src)) {
			cloneImg.setAttribute("src", imgDataCache.get(src)!)
			continue
		}

		if (origImg.complete && origImg.naturalWidth > 0) {
			try {
				const c = document.createElement("canvas")
				c.width = origImg.naturalWidth
				c.height = origImg.naturalHeight
				const ctx = c.getContext("2d")!
				ctx.drawImage(origImg, 0, 0)
				const dataUri = c.toDataURL()
				imgDataCache.set(src, dataUri)
				cloneImg.setAttribute("src", dataUri)
			} catch {
				// Cross-origin tainted canvas — skip silently
			}
		}
	}

	// Inline background-image replacement
	const origAll = original.querySelectorAll("*")
	const cloneAll = clone.querySelectorAll("*")
	const urlRegex = /url\(["']?([^"')]+)["']?\)/g

	for (let i = 0; i < origAll.length; i++) {
		const origEl = origAll[i] as HTMLElement
		const bg = origEl.style.backgroundImage
		if (!bg || !bg.includes("url(")) continue

		let replaced = bg
		let match: RegExpExecArray | null
		urlRegex.lastIndex = 0
		// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
		while ((match = urlRegex.exec(bg)) !== null) {
			const url = match[1]
			if (url.startsWith("data:")) continue

			const resolved = new URL(url, window.location.href).href
			const cached = imgDataCache.get(resolved) ?? imageUrlMap?.get(url)
			if (cached) {
				replaced = replaced.split(match[0]).join(`url("${cached}")`)
			}
		}

		if (replaced !== bg) {
			;(cloneAll[i] as HTMLElement).style.backgroundImage = replaced
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
 * Inlines live `getComputedStyle` visual properties onto the clone for any
 * element that is currently in the `:hover`, `:focus`, or `:active` chain —
 * and (if `captureTransitions` is true) for elements with an active CSS
 * transition so mid-animation intermediate values are sampled.
 *
 * WHY INLINE AND NOT CSS-REWRITING?
 * We tried pseudo-class rewriting (`:hover` → `.pseudo-hover` in the CSS
 * embedded in the SVG). That works for hand-written CSS but breaks with
 * Tailwind 4: Tailwind wraps every `hover:*` rule in `@media (hover: hover)`,
 * and SVG foreignObject rasterized to an image doesn't reliably evaluate
 * interactive media features. The class rule silently fails to apply.
 *
 * Inlining the computed value bypasses CSS matching entirely. It reads from
 * the LIVE DOM (where `:hover` and transitions DO work) and writes inline
 * styles on the clone — inline style has 1,0,0,0 specificity and always
 * wins. O(k) where k ~ 1-3 for the hover/focus/active chain; the transition
 * branch is O(N) but only runs while transitions are active (usually
 * <500ms per interaction).
 */
function applyInteractiveStyles(
	original: HTMLElement,
	clone: HTMLElement,
	captureTransitions: boolean
): void {
	const origAll = [...original.querySelectorAll("*")]
	const cloneAll = [...clone.querySelectorAll("*")]

	const interactive = new Set<Element>()
	for (const el of original.querySelectorAll(":hover")) interactive.add(el)
	for (const el of original.querySelectorAll(":focus")) interactive.add(el)
	for (const el of original.querySelectorAll(":active")) interactive.add(el)

	// Fast path: nothing to do if nothing is hovered/focused/active AND we
	// aren't capturing transitions. Avoids the O(N) getComputedStyle loop.
	if (interactive.size === 0 && !captureTransitions) return

	for (let i = 0; i < origAll.length; i++) {
		const el = origAll[i]
		const isInteractive = interactive.has(el)

		if (!isInteractive && !captureTransitions) continue

		const computed = getComputedStyle(el)
		let shouldApply = isInteractive
		if (!shouldApply) {
			const hasTransition =
				computed.transitionProperty !== "none" &&
				computed.transitionProperty !== ""
			shouldApply = hasTransition
		}
		if (!shouldApply) continue

		const clonedEl = cloneAll[i] as HTMLElement
		for (const prop of VISUAL_PROPS) {
			clonedEl.style.setProperty(prop, computed.getPropertyValue(prop))
		}
	}
}

const TEXT_METRIC_PROPS = [
	"font-size",
	"line-height",
	"letter-spacing",
] as const

/**
 * Floors sub-pixel `font-size` / `line-height` / `letter-spacing` resolved
 * on `source` and writes the floored values as inline style on `target`.
 *
 * Single source of truth shared by two call sites that MUST agree on
 * character advance:
 *   1. The snapshot pipeline (SVG foreignObject rasterization — without
 *      the floor, sub-pixel `font-size: 14.5px` can fit one extra
 *      character per line in the SVG vs. the live DOM).
 *   2. The caret clone in `caret.ts` — the rasterized text uses the
 *      floored metrics, so the caret clone must too or it drifts ahead
 *      of the visible text as the user types.
 *
 * Floor-based logic ported from three-html-render (htmlRenderer.ts:622-634).
 */
export function floorSubpixelTextMetrics(
	source: HTMLElement,
	target: HTMLElement
): void {
	const computed = getComputedStyle(source)
	for (const prop of TEXT_METRIC_PROPS) {
		const raw = computed.getPropertyValue(prop)
		if (!raw.includes(".")) continue
		const match = /^(-?\d+\.\d+)(px|em|rem)?$/.exec(raw.trim())
		if (!match) continue
		const floored = Math.floor(parseFloat(match[1]))
		const unit = match[2] ?? "px"
		target.style.setProperty(prop, `${floored}${unit}`)
	}
}

function freezeResolvedTextMetrics(
	original: HTMLElement,
	clone: HTMLElement
): void {
	const origAll = original.querySelectorAll<HTMLElement>("*")
	const cloneAll = clone.querySelectorAll<HTMLElement>("*")
	for (let i = 0; i < origAll.length; i++) {
		floorSubpixelTextMetrics(origAll[i], cloneAll[i])
	}
}

export interface SnapshotOptions {
	/**
	 * When true, `getComputedStyle` is queried on every descendant with an
	 * active `transition-*` declaration so mid-animation intermediate
	 * values are inlined on the clone. Defaults to `false`. Enable only
	 * while `transitionrun` has fired and `transitionend`/`transitioncancel`
	 * hasn't balanced it — see `observeInvalidations`.
	 */
	captureTransitions?: boolean
}

/**
 * Snapshots an HTML element onto a target canvas (async due to Image load).
 *
 * Pipeline: clone → sync form state → apply pseudo-class markers → freeze
 * text metrics → (optional) capture transition intermediates → embed images →
 * serialize to XML → wrap in SVG foreignObject with cached page CSS →
 * SVG string cache check (skip rasterize on identical string) → load as Image →
 * draw to target canvas at dpr.
 *
 * No PNG encoding, no blob URLs — draws directly to the canvas
 * that backs the CanvasTexture for immediate GPU upload.
 */
export async function snapshotToCanvas(
	el: HTMLElement,
	targetCanvas: HTMLCanvasElement,
	onComplete?: () => void,
	options: SnapshotOptions = {}
): Promise<void> {
	const width = el.offsetWidth
	const height = el.offsetHeight
	if (width === 0 || height === 0) return

	const clone = el.cloneNode(true) as HTMLElement
	clone.style.opacity = "1"

	syncFormState(el, clone)
	applyInteractiveStyles(el, clone, options.captureTransitions ?? false)
	freezeResolvedTextMetrics(el, clone)
	embedImages(el, clone)

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

	// Cache hit: byte-identical SVG as last snapshot AND target dimensions
	// unchanged → skip rasterize + GPU upload + onComplete notification.
	const prevSvg = svgCache.get(targetCanvas)
	const dpr = window.devicePixelRatio || 1
	const expectedW = width * dpr
	const expectedH = height * dpr
	if (
		prevSvg === svgString &&
		targetCanvas.width === expectedW &&
		targetCanvas.height === expectedH
	) {
		return
	}
	svgCache.set(targetCanvas, svgString)

	const img = new Image()
	img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`
	await img.decode()

	targetCanvas.width = expectedW
	targetCanvas.height = expectedH
	const ctx = targetCanvas.getContext("2d")!
	ctx.scale(dpr, dpr)
	ctx.clearRect(0, 0, width, height)
	ctx.drawImage(img, 0, 0, width, height)
	onComplete?.()
}
