import { floorSubpixelTextMetrics } from "./snapshot"

const TEXTUAL_INPUT_TYPES = new Set([
	"",
	"text",
	"search",
	"url",
	"tel",
	"password",
])

export function isTextInput(
	target: EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement {
	if (target instanceof HTMLTextAreaElement) return true
	if (target instanceof HTMLInputElement) {
		return TEXTUAL_INPUT_TYPES.has(target.type)
	}
	return false
}

const MIRROR_PROPS = [
	"direction",
	"boxSizing",
	"width",
	"height",
	"overflowX",
	"overflowY",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"fontStyle",
	"fontVariant",
	"fontWeight",
	"fontStretch",
	"fontSize",
	"fontSizeAdjust",
	"lineHeight",
	"fontFamily",
	"textAlign",
	"textTransform",
	"textIndent",
	"letterSpacing",
	"wordSpacing",
] as const

let mirrorDiv: HTMLDivElement | null = null

function getMirrorDiv(): HTMLDivElement {
	if (!mirrorDiv) {
		mirrorDiv = document.createElement("div")
		mirrorDiv.style.cssText =
			"position:absolute;left:-9999px;top:-9999px;visibility:hidden;overflow:hidden;"
		document.body.appendChild(mirrorDiv)
	}
	return mirrorDiv
}

export interface CharPosition {
	x: number
	y: number
	height: number
}

export function measureCharPosition(
	el: HTMLInputElement | HTMLTextAreaElement,
	charIndex: number
): CharPosition {
	const mirror = getMirrorDiv()
	const cs = getComputedStyle(el)
	const isInput = el instanceof HTMLInputElement

	for (const prop of MIRROR_PROPS) {
		;(mirror.style as unknown as Record<string, string>)[prop as string] =
			cs[prop as keyof CSSStyleDeclaration] as string
	}
	// Match the rasterized snapshot's text metrics. snapshot.ts floors
	// sub-pixel font-size / line-height / letter-spacing on the rasterized
	// clone so character advance is deterministic. The mirror must do the
	// same — otherwise each char is ~0.5px wider in the mirror than in the
	// rasterized SVG, and the caret drifts right of the visible text as
	// text grows longer.
	floorSubpixelTextMetrics(el, mirror)
	mirror.style.whiteSpace = isInput ? "pre" : cs.whiteSpace
	mirror.style.height = "auto"
	mirror.style.overflowY = "hidden"

	const text = el.value
	const before = text.substring(0, charIndex)

	mirror.textContent = ""
	const textNode = document.createTextNode(before)
	const marker = document.createElement("span")
	marker.textContent = "|"
	mirror.appendChild(textNode)
	mirror.appendChild(marker)
	mirror.appendChild(document.createTextNode(text.substring(charIndex) || "."))

	const fontSize = parseFloat(cs.fontSize)
	const lhParsed = parseFloat(cs.lineHeight)
	const lineHeight = Number.isNaN(lhParsed)
		? fontSize * 1.2
		: cs.lineHeight.endsWith("px")
			? lhParsed
			: lhParsed * fontSize

	return {
		x: marker.offsetLeft,
		y: marker.offsetTop,
		height: lineHeight,
	}
}

const DEFAULT_SELECTION_BG = "rgba(100, 130, 255, 0.35)"

export function resolveCaretColor(
	el: HTMLInputElement | HTMLTextAreaElement
): string {
	const cs = getComputedStyle(el)
	const raw = cs.caretColor
	if (raw && raw !== "auto" && raw !== "rgba(0, 0, 0, 0)") return raw
	return cs.color
}

export function resolveSelectionColor(
	el: HTMLInputElement | HTMLTextAreaElement
): string {
	try {
		const sel = getComputedStyle(el, "::selection")
		const bg = sel.backgroundColor
		if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg
	} catch {
		// Some environments don't support pseudo-element style queries.
	}
	return DEFAULT_SELECTION_BG
}

const CARET_BLINK_MS = 500
const CARET_WIDTH = 2

function computeContentOrigin(
	rootSrc: HTMLElement,
	inputEl: HTMLElement,
	cs: CSSStyleDeclaration
): { x: number; y: number } {
	const borderLeft = parseFloat(cs.borderLeftWidth) || 0
	const borderTop = parseFloat(cs.borderTopWidth) || 0
	let offsetX = 0
	let offsetY = 0
	let el: HTMLElement | null = inputEl
	while (el && el !== rootSrc) {
		offsetX += el.offsetLeft
		offsetY += el.offsetTop
		el = el.offsetParent as HTMLElement | null
	}
	return { x: offsetX + borderLeft, y: offsetY + borderTop }
}

/**
 * Patches `pos.y` for single-line `<input>` elements so the caret/selection
 * rectangle aligns with the visible text.
 *
 * Browsers vertically center text inside `<input type="text">` (and the other
 * text-entry types) regardless of how tall the content area is. The mirror
 * div used by `measureCharPosition` is a regular `<div>`, which lays text out
 * from the top of the content area — so `pos.y` returned by the mirror
 * corresponds to the top, not the centered text. For `<input>`, recompute
 * `pos.y` as the centered offset within the content area. Textareas don't
 * have this behavior — their text aligns to the padding-top, matching the
 * mirror exactly, so we skip them.
 */
function centerSingleLineInput(
	inputEl: HTMLInputElement | HTMLTextAreaElement,
	cs: CSSStyleDeclaration,
	pos: { y: number; height: number }
): void {
	if (!(inputEl instanceof HTMLInputElement)) return
	const paddingTop = parseFloat(cs.paddingTop) || 0
	const paddingBottom = parseFloat(cs.paddingBottom) || 0
	const contentHeight = inputEl.clientHeight - paddingTop - paddingBottom
	pos.y = paddingTop + (contentHeight - pos.height) / 2
}

/**
 * Computes how many pixels the rendered text in the cloned input should be
 * shifted left to keep the cursor (or selection end) visible at the right
 * edge — our own "scroll into view" math, derived from mirror measurements
 * rather than the browser's `inputEl.scrollLeft`.
 *
 * SVG foreignObject ignores `input.scrollLeft` during rasterization, and
 * the browser's auto-scroll value can include user-agent margins that vary.
 * Computing the shift ourselves yields a deterministic result that anchors
 * the cursor exactly at the content right edge when text overflows.
 */
function computeInputScrollShift(
	inputEl: HTMLInputElement | HTMLTextAreaElement,
	cs: CSSStyleDeclaration,
	cursorPosX: number
): number {
	if (!(inputEl instanceof HTMLInputElement)) return 0
	const paddingRight = parseFloat(cs.paddingRight) || 0
	const contentRight = inputEl.clientWidth - paddingRight
	return Math.max(0, cursorPosX - contentRight)
}

/**
 * Locates the cloned input/textarea in `rootDst` that mirrors `inputEl`
 * in `rootSrc`. They sit at the same index in the matched-tag query.
 */
function findClonedInput(
	rootSrc: HTMLElement,
	rootDst: HTMLElement,
	inputEl: HTMLInputElement | HTMLTextAreaElement
): HTMLElement | null {
	const sources = rootSrc.querySelectorAll<HTMLElement>("input, textarea")
	const clones = rootDst.querySelectorAll<HTMLElement>("input, textarea")
	for (let i = 0; i < sources.length; i++) {
		if (sources[i] === inputEl) {
			return (clones[i] as HTMLElement) ?? null
		}
	}
	return null
}

/**
 * Applies a `text-indent` shift to the cloned input to simulate horizontal
 * scroll. Adds to any existing `text-indent` rather than replacing it.
 */
function applyClonedInputShift(
	cloned: HTMLElement,
	shiftX: number
): void {
	const existing = parseFloat(cloned.style.textIndent) || 0
	cloned.style.textIndent = `${existing - shiftX}px`
}

export function injectCaretAndSelection(
	rootSrc: HTMLElement,
	rootDst: HTMLElement
): void {
	const active = document.activeElement
	if (!isTextInput(active)) return
	if (!rootSrc.contains(active)) return

	const inputEl = active
	const selStart = inputEl.selectionStart
	const selEnd = inputEl.selectionEnd
	if (selStart === null || selEnd === null) return

	const cs = getComputedStyle(inputEl)
	const origin = computeContentOrigin(rootSrc, inputEl, cs)

	const clipLeft = origin.x
	const clipRight = clipLeft + inputEl.clientWidth
	const clipTop = origin.y
	const clipBottom = clipTop + inputEl.clientHeight

	if (selStart === selEnd) {
		const visible = Math.floor(Date.now() / CARET_BLINK_MS) % 2 === 0
		if (!visible) return

		const pos = measureCharPosition(inputEl, selStart)
		centerSingleLineInput(inputEl, cs, pos)
		const shiftX = computeInputScrollShift(inputEl, cs, pos.x)
		if (shiftX > 0) {
			const cloned = findClonedInput(rootSrc, rootDst, inputEl)
			if (cloned) applyClonedInputShift(cloned, shiftX)
		}
		const caretX = origin.x + pos.x - shiftX
		const caretY = origin.y + pos.y - inputEl.scrollTop

		if (
			caretX < clipLeft ||
			caretX > clipRight ||
			caretY < clipTop ||
			caretY + pos.height > clipBottom
		) {
			return
		}

		const caret = document.createElement("div")
		caret.setAttribute("xmlns", "http://www.w3.org/1999/xhtml")
		caret.style.cssText =
			`position:absolute;pointer-events:none;` +
			`left:${caretX}px;top:${caretY}px;` +
			`width:${CARET_WIDTH}px;height:${pos.height}px;` +
			`background:${resolveCaretColor(inputEl)};`
		rootDst.appendChild(caret)
		return
	}

	// Non-collapsed selection — render one or more rectangles. Shift is
	// computed from selEnd (the cursor anchor for shift+arrow extension).
	const startPos = measureCharPosition(inputEl, selStart)
	const endPos = measureCharPosition(inputEl, selEnd)
	centerSingleLineInput(inputEl, cs, startPos)
	centerSingleLineInput(inputEl, cs, endPos)
	const lineHeight = startPos.height
	const shiftX = computeInputScrollShift(inputEl, cs, endPos.x)
	if (shiftX > 0) {
		const cloned = findClonedInput(rootSrc, rootDst, inputEl)
		if (cloned) applyClonedInputShift(cloned, shiftX)
	}
	const scrollL = shiftX
	const scrollT = inputEl.scrollTop
	const bg = resolveSelectionColor(inputEl)

	const appendRect = (x: number, y: number, w: number, h: number) => {
		if (w <= 0 || h <= 0) return
		const left = Math.max(x, clipLeft)
		const right = Math.min(x + w, clipRight)
		const top = Math.max(y, clipTop)
		const bottom = Math.min(y + h, clipBottom)
		if (right <= left || bottom <= top) return
		const rect = document.createElement("div")
		rect.setAttribute("xmlns", "http://www.w3.org/1999/xhtml")
		rect.style.cssText =
			`position:absolute;pointer-events:none;` +
			`left:${left}px;top:${top}px;` +
			`width:${right - left}px;height:${bottom - top}px;` +
			`background:${bg};`
		rootDst.appendChild(rect)
	}

	if (startPos.y === endPos.y) {
		const x = origin.x + startPos.x - scrollL
		const y = origin.y + startPos.y - scrollT
		const w = endPos.x - startPos.x
		appendRect(x, y, w, lineHeight)
	} else {
		// First line: from startX to clipRight
		const firstX = origin.x + startPos.x - scrollL
		const firstY = origin.y + startPos.y - scrollT
		appendRect(firstX, firstY, clipRight - firstX, lineHeight)

		// Middle band: full content width between first and last line
		const midTop = firstY + lineHeight
		const midBottom = origin.y + endPos.y - scrollT
		if (midBottom > midTop) {
			appendRect(clipLeft, midTop, clipRight - clipLeft, midBottom - midTop)
		}

		// Last line: from clipLeft to endX
		const lastY = origin.y + endPos.y - scrollT
		const lastEndX = origin.x + endPos.x - scrollL
		appendRect(clipLeft, lastY, lastEndX - clipLeft, lineHeight)
	}
}

export function setupCaretBlink(
	root: HTMLElement,
	invalidate: () => void
): () => void {
	let timer = 0
	let watching = false

	const tick = () => {
		if (!document.hidden) invalidate()
		schedule()
	}

	const schedule = () => {
		const msUntilBoundary = CARET_BLINK_MS - (Date.now() % CARET_BLINK_MS)
		timer = window.setTimeout(tick, msUntilBoundary)
	}

	const onFocusIn = (e: FocusEvent) => {
		if (!isTextInput(e.target)) return
		if (watching) return
		watching = true
		schedule()
	}

	const onFocusOut = () => {
		if (!watching) return
		watching = false
		if (timer) {
			clearTimeout(timer)
			timer = 0
		}
	}

	root.addEventListener("focusin", onFocusIn)
	root.addEventListener("focusout", onFocusOut)

	return () => {
		root.removeEventListener("focusin", onFocusIn)
		root.removeEventListener("focusout", onFocusOut)
		if (timer) clearTimeout(timer)
	}
}

