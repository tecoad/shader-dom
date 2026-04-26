/**
 * Coordinate-conversion helpers for `<Shader>` consumers.
 *
 * The shader plane spans normalized device coordinates (NDC): `x, y ∈ [-1, 1]`,
 * with `(0, 0)` at the canvas center and `+y` pointing up. DOM event handlers
 * deliver `clientX`/`clientY` in viewport-relative pixels, so anything that
 * wants to drive the shader from a click or an element's position needs to
 * map between the two spaces. Doing this manually requires the canvas's
 * `getBoundingClientRect()` — the helpers here centralize that math so callers
 * never have to reach for `window.innerWidth` (which is only correct when the
 * shader is fullscreen) or walk the DOM to find the canvas.
 */

export type ElementAnchor =
	| "center"
	| "top"
	| "bottom"
	| "left"
	| "right"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"

/** Convert viewport-relative pixels to the canvas's NDC space. */
export function screenToNDC(
	canvas: HTMLCanvasElement,
	clientX: number,
	clientY: number
): [number, number] {
	const r = canvas.getBoundingClientRect()
	if (r.width === 0 || r.height === 0) return [0, 0]
	return [
		((clientX - r.left) / r.width) * 2 - 1,
		-((clientY - r.top) / r.height) * 2 + 1,
	]
}

/**
 * Resolve an `ElementAnchor` against a `DOMRect` to viewport pixels. Exposed
 * so consumers can mirror the same anchor semantics outside of shader-dom.
 */
export function rectAnchorPoint(
	rect: DOMRect | { left: number; top: number; width: number; height: number },
	anchor: ElementAnchor = "center"
): [number, number] {
	const left = rect.left
	const top = rect.top
	const right = left + rect.width
	const bottom = top + rect.height
	const cx = left + rect.width / 2
	const cy = top + rect.height / 2
	switch (anchor) {
		case "center":
			return [cx, cy]
		case "top":
			return [cx, top]
		case "bottom":
			return [cx, bottom]
		case "left":
			return [left, cy]
		case "right":
			return [right, cy]
		case "top-left":
			return [left, top]
		case "top-right":
			return [right, top]
		case "bottom-left":
			return [left, bottom]
		case "bottom-right":
			return [right, bottom]
	}
}

/** Convert an element's anchor point to the canvas's NDC space. */
export function elementToNDC(
	canvas: HTMLCanvasElement,
	element: Element,
	anchor: ElementAnchor = "center"
): [number, number] {
	const [x, y] = rectAnchorPoint(element.getBoundingClientRect(), anchor)
	return screenToNDC(canvas, x, y)
}
