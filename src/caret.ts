const INPUT_PROPS = [
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

/**
 * Renders a native caret by placing a transparent input clone above the canvas.
 * The clone shows only the caret (everything else is transparent).
 * Text is visible through the shader; the caret is visible through the clone.
 */
export function setupCaretRendering(
	overlay: HTMLElement,
	caretLayer: HTMLElement
): () => void {
	let clone: HTMLInputElement | HTMLTextAreaElement | null = null
	let sourceInput: HTMLInputElement | HTMLTextAreaElement | null = null
	let ignoreBlur = false

	function createClone(source: HTMLInputElement | HTMLTextAreaElement) {
		const el = document.createElement(
			source.tagName.toLowerCase()
		) as typeof source
		if (source instanceof HTMLInputElement) {
			;(el as HTMLInputElement).type = source.type
		}

		const computed = getComputedStyle(source)

		// Copy text-related styles so the clone matches the source exactly
		for (const prop of INPUT_PROPS) {
			el.style[prop as any] = computed[prop as any]
		}

		// Only caret visible — text comes from the shader layer.
		// Keep border WIDTH (affects content area with border-box) but hide visually.
		el.style.position = "absolute"
		el.style.color = "transparent"
		el.style.background = "transparent"
		el.style.borderColor = "transparent"
		el.style.outline = "none"
		el.style.boxShadow = "none"
		el.style.margin = "0"
		el.style.pointerEvents = "auto"
		el.style.zIndex = "0"

		const rawCaret = computed.caretColor
		el.style.caretColor =
			rawCaret && rawCaret !== "auto" && rawCaret !== "rgba(0, 0, 0, 0)"
				? rawCaret
				: computed.color

		return el
	}

	function positionClone() {
		if (!clone || !sourceInput) return
		const inputRect = sourceInput.getBoundingClientRect()
		const layerRect = caretLayer.getBoundingClientRect()
		clone.style.left = `${inputRect.left - layerRect.left}px`
		clone.style.top = `${inputRect.top - layerRect.top}px`
		clone.style.width = `${inputRect.width}px`
		clone.style.height = `${inputRect.height}px`
	}

	function syncToSource() {
		if (!clone || !sourceInput) return
		sourceInput.value = clone.value
		sourceInput.dispatchEvent(new Event("input", { bubbles: true }))
	}

	function activate(target: HTMLInputElement | HTMLTextAreaElement) {
		sourceInput = target
		clone = createClone(target)
		clone.value = target.value

		caretLayer.appendChild(clone)
		positionClone()

		// Focus the clone — this causes the overlay input to blur
		ignoreBlur = true
		clone.focus()
		clone.selectionStart = target.selectionStart
		clone.selectionEnd = target.selectionEnd
		ignoreBlur = false

		// Sync keystrokes from clone to overlay input
		clone.addEventListener("input", syncToSource)

		// Keep position in sync (scroll, resize, layout changes)
		clone.addEventListener("scroll", () => {
			if (sourceInput) sourceInput.scrollLeft = clone!.scrollLeft
		})

		// When clone loses focus, clean up
		clone.addEventListener("blur", deactivate)
	}

	function deactivate() {
		if (clone) {
			clone.removeEventListener("input", syncToSource)
			clone.removeEventListener("blur", deactivate)
			clone.remove()
			clone = null
		}
		sourceInput = null
	}

	function onFocusIn(e: FocusEvent) {
		const target = e.target
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement
		) {
			// Don't re-activate if the clone is already active for this input
			if (sourceInput === target) return
			activate(target)
		}
	}

	function onFocusOut(e: FocusEvent) {
		if (ignoreBlur) return
		// If focus moved outside the overlay entirely, clean up
		const related = e.relatedTarget as HTMLElement | null
		if (!related || !overlay.contains(related)) {
			deactivate()
		}
	}

	overlay.addEventListener("focusin", onFocusIn)
	overlay.addEventListener("focusout", onFocusOut)

	return () => {
		overlay.removeEventListener("focusin", onFocusIn)
		overlay.removeEventListener("focusout", onFocusOut)
		deactivate()
	}
}
