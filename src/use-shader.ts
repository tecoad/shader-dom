import { useContext, useMemo } from "react"
import {
	type ElementAnchor,
	elementToNDC,
	screenToNDC,
} from "./coords"
import { ShaderContext } from "./shader-context"

export interface UseShaderResult {
	/**
	 * The WebGL `<canvas>` rendered by the nearest ancestor `<Shader>`. `null`
	 * before mount; checking it before use is cheap and avoids assertions.
	 */
	canvas: HTMLCanvasElement | null
	/**
	 * Convert viewport-relative pixels (e.g. `event.clientX`/`clientY`) to the
	 * shader plane's NDC space (`x, y ∈ [-1, 1]`, `+y` up). Returns `[0, 0]`
	 * when the canvas isn't mounted yet.
	 */
	toNDC: (clientX: number, clientY: number) => [number, number]
	/**
	 * Convert an element's anchor point to NDC. Useful for triggering effects
	 * from a button's center regardless of how the user interacted with it
	 * (mouse, keyboard, screen reader).
	 */
	elementToNDC: (element: Element, anchor?: ElementAnchor) => [number, number]
}

/**
 * Read coordinate-conversion helpers bound to the nearest ancestor `<Shader>`.
 * Throws when used outside of a `<Shader>` subtree.
 *
 * @example
 *   const { toNDC } = useShader()
 *   <button onClick={e => liquid.controls.drop(...toNDC(e.clientX, e.clientY))} />
 */
export function useShader(): UseShaderResult {
	const ctx = useContext(ShaderContext)
	if (!ctx) {
		throw new Error(
			"[shader-dom] useShader() must be used inside a <Shader> subtree."
		)
	}
	const { canvasRef } = ctx
	// Stable identity across renders (the ref itself never changes).
	return useMemo<UseShaderResult>(
		() => ({
			get canvas() {
				return canvasRef.current
			},
			toNDC(clientX, clientY) {
				const c = canvasRef.current
				return c ? screenToNDC(c, clientX, clientY) : [0, 0]
			},
			elementToNDC(element, anchor) {
				const c = canvasRef.current
				return c ? elementToNDC(c, element, anchor) : [0, 0]
			},
		}),
		[canvasRef]
	)
}
