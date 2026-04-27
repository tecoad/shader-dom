import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isTextInput } from "./caret"
import { resolveCaretColor, resolveSelectionColor } from "./caret"

describe("isTextInput", () => {
	it("returns true for HTMLTextAreaElement", () => {
		const el = document.createElement("textarea")
		expect(isTextInput(el)).toBe(true)
	})

	it("returns true for input with default type", () => {
		const el = document.createElement("input")
		expect(isTextInput(el)).toBe(true)
	})

	it("returns true for input type=text/search/url/tel/password", () => {
		for (const type of ["text", "search", "url", "tel", "password"]) {
			const el = document.createElement("input")
			el.type = type
			expect(isTextInput(el), `type=${type}`).toBe(true)
		}
	})

	it("returns false for non-text inputs", () => {
		for (const type of ["checkbox", "radio", "range", "color", "file", "number", "date"]) {
			const el = document.createElement("input")
			el.type = type
			expect(isTextInput(el), `type=${type}`).toBe(false)
		}
	})

	it("returns false for non-input/textarea targets", () => {
		expect(isTextInput(document.createElement("div"))).toBe(false)
		expect(isTextInput(document.createElement("button"))).toBe(false)
		expect(isTextInput(null)).toBe(false)
	})
})

import { measureCharPosition } from "./caret"

describe("measureCharPosition", () => {
	function makeInput(value: string): HTMLInputElement {
		const el = document.createElement("input")
		el.type = "text"
		el.value = value
		document.body.appendChild(el)
		return el
	}

	it("returns a CharPosition object with numeric x, y, and positive height", () => {
		const el = makeInput("hello")
		// jsdom resolves fontSize as "medium" (not px), so provide an explicit px
		// value so the lineHeight fallback produces a finite number.
		el.style.fontSize = "16px"
		const pos = measureCharPosition(el, 2)
		expect(typeof pos.x).toBe("number")
		expect(typeof pos.y).toBe("number")
		expect(pos.height).toBeGreaterThan(0)
		el.remove()
	})

	it("does not throw on empty input value at index 0", () => {
		const el = makeInput("")
		expect(() => measureCharPosition(el, 0)).not.toThrow()
		el.remove()
	})

	it("derives height from fontSize × 1.2 when lineHeight is normal", () => {
		const el = makeInput("hello")
		el.style.fontSize = "20px"
		// Force lineHeight: normal so the fallback path runs.
		el.style.lineHeight = "normal"
		document.body.appendChild(el)
		const pos = measureCharPosition(el, 0)
		expect(pos.height).toBeCloseTo(20 * 1.2, 1)
		el.remove()
	})

	it("works for textarea elements", () => {
		const el = document.createElement("textarea")
		el.value = "line1\nline2"
		// jsdom resolves fontSize as "medium" (not px); supply an explicit px value.
		el.style.fontSize = "16px"
		document.body.appendChild(el)
		const pos = measureCharPosition(el, 3)
		expect(typeof pos.x).toBe("number")
		expect(pos.height).toBeGreaterThan(0)
		el.remove()
	})
})

describe("resolveCaretColor", () => {
	it("returns the computed caret-color when set explicitly", () => {
		const el = document.createElement("input")
		el.style.caretColor = "rgb(255, 0, 0)"
		document.body.appendChild(el)
		expect(resolveCaretColor(el)).toBe("rgb(255, 0, 0)")
		el.remove()
	})

	it("falls back to currentColor when caret-color is auto", () => {
		const el = document.createElement("input")
		el.style.color = "rgb(0, 128, 0)"
		document.body.appendChild(el)
		// jsdom may report "auto" for caretColor when not set
		const color = resolveCaretColor(el)
		// Either the explicit color or a CSS color string; never empty.
		expect(color.length).toBeGreaterThan(0)
		expect(color).not.toBe("auto")
		el.remove()
	})
})

describe("resolveSelectionColor", () => {
	it("returns a non-empty CSS color string", () => {
		const el = document.createElement("input")
		document.body.appendChild(el)
		const color = resolveSelectionColor(el)
		expect(color.length).toBeGreaterThan(0)
		el.remove()
	})
})

import { injectCaretAndSelection } from "./caret"

describe("injectCaretAndSelection (caret)", () => {
	function setup(value: string, selStart: number) {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "text"
		input.value = value
		input.style.fontSize = "16px"
		// jsdom reports borderLeftWidth/borderTopWidth as 2px by default, which
		// shifts computeContentOrigin by 2px. Zero it out so origin.x = 0 and
		// caret-at-start assertions work as intended.
		input.style.borderWidth = "0"
		// Stub layout — jsdom returns 0 for client dimensions, which would
		// fail clip-bounds checks. Provide reasonable synthetic values.
		Object.defineProperty(input, "clientWidth", { value: 200, configurable: true })
		Object.defineProperty(input, "clientHeight", { value: 30, configurable: true })
		root.appendChild(input)
		document.body.appendChild(root)
		input.focus()
		input.setSelectionRange(selStart, selStart)
		const dst = root.cloneNode(true) as HTMLElement
		return { root, input, dst, cleanup: () => root.remove() }
	}

	it("no-op when activeElement is not inside rootSrc", () => {
		const { root, dst, cleanup } = setup("hello", 2)
		const otherRoot = document.createElement("div")
		const childCountBefore = dst.childElementCount
		injectCaretAndSelection(otherRoot, dst)
		expect(dst.childElementCount).toBe(childCountBefore)
		cleanup()
		otherRoot.remove()
	})

	it("no-op when activeElement is non-text input (e.g. checkbox)", () => {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "checkbox"
		root.appendChild(input)
		document.body.appendChild(root)
		input.focus()
		const dst = root.cloneNode(true) as HTMLElement
		const before = dst.childElementCount
		injectCaretAndSelection(root, dst)
		expect(dst.childElementCount).toBe(before)
		root.remove()
	})

	it("appends a caret div when text input is focused with collapsed selection (visible phase)", () => {
		// Force visible phase by stubbing Date.now to phase 0
		const realNow = Date.now
		try {
			Date.now = () => 0
			const { root, dst, cleanup } = setup("hi", 1)
			const before = dst.childElementCount
			injectCaretAndSelection(root, dst)
			expect(dst.childElementCount).toBe(before + 1)
			const caret = dst.lastElementChild as HTMLElement
			expect(caret.style.position).toBe("absolute")
			expect(caret.style.width).toBe("2px")
			expect(parseFloat(caret.style.height)).toBeGreaterThan(0)
			cleanup()
		} finally {
			Date.now = realNow
		}
	})

	it("does not append a caret div in the off phase of blink", () => {
		const realNow = Date.now
		try {
			Date.now = () => 500 // off phase
			const { root, dst, cleanup } = setup("hi", 1)
			const before = dst.childElementCount
			injectCaretAndSelection(root, dst)
			expect(dst.childElementCount).toBe(before)
			cleanup()
		} finally {
			Date.now = realNow
		}
	})

	it("places caret at x=0 for empty input", () => {
		const realNow = Date.now
		try {
			Date.now = () => 0
			const { root, dst, cleanup } = setup("", 0)
			injectCaretAndSelection(root, dst)
			const caret = dst.lastElementChild as HTMLElement
			expect(parseFloat(caret.style.left)).toBeCloseTo(0, 0)
			cleanup()
		} finally {
			Date.now = realNow
		}
	})
})

describe("injectCaretAndSelection (selection)", () => {
	function setupSelected(value: string, start: number, end: number) {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "text"
		input.value = value
		input.style.fontSize = "16px"
		input.style.borderWidth = "0"
		Object.defineProperty(input, "clientWidth", { value: 200, configurable: true })
		Object.defineProperty(input, "clientHeight", { value: 30, configurable: true })
		root.appendChild(input)
		document.body.appendChild(root)
		input.focus()
		input.setSelectionRange(start, end)
		const dst = root.cloneNode(true) as HTMLElement
		return { root, input, dst, cleanup: () => root.remove() }
	}

	it("does not throw when computing single-line selection rect (real width verified manually)", () => {
		const { root, dst, cleanup } = setupSelected("hello world", 0, 5)
		expect(() => injectCaretAndSelection(root, dst)).not.toThrow()
		cleanup()
	})

	it("selection rectangle ignores blink phase (does not throw at off-phase)", () => {
		const realNow = Date.now
		try {
			Date.now = () => 500
			const { root, dst, cleanup } = setupSelected("hello", 0, 3)
			expect(() => injectCaretAndSelection(root, dst)).not.toThrow()
			cleanup()
		} finally {
			Date.now = realNow
		}
	})
})

import { setupCaretBlink } from "./caret"

describe("setupCaretBlink", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("does not invalidate when no input is focused", () => {
		const root = document.createElement("div")
		document.body.appendChild(root)
		const invalidate = vi.fn()
		const cleanup = setupCaretBlink(root, invalidate)
		vi.advanceTimersByTime(2000)
		expect(invalidate).not.toHaveBeenCalled()
		cleanup()
		root.remove()
	})

	it("invalidates ~once per 500ms while a text input is focused", () => {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "text"
		root.appendChild(input)
		document.body.appendChild(root)
		const invalidate = vi.fn()
		const cleanup = setupCaretBlink(root, invalidate)
		input.focus()
		const focusInEvt = new FocusEvent("focusin", { bubbles: true })
		Object.defineProperty(focusInEvt, "target", { value: input })
		root.dispatchEvent(focusInEvt)
		vi.advanceTimersByTime(2000)
		// Should have ticked roughly 4 times in 2000ms (1 per 500ms boundary).
		expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(3)
		expect(invalidate.mock.calls.length).toBeLessThanOrEqual(5)
		cleanup()
		root.remove()
	})

	it("stops invalidating after focusout", () => {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "text"
		root.appendChild(input)
		document.body.appendChild(root)
		const invalidate = vi.fn()
		const cleanup = setupCaretBlink(root, invalidate)
		const focusInEvt = new FocusEvent("focusin", { bubbles: true })
		Object.defineProperty(focusInEvt, "target", { value: input })
		root.dispatchEvent(focusInEvt)
		vi.advanceTimersByTime(600)
		const callsAfterFocus = invalidate.mock.calls.length
		expect(callsAfterFocus).toBeGreaterThanOrEqual(1)
		root.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
		vi.advanceTimersByTime(2000)
		expect(invalidate.mock.calls.length).toBe(callsAfterFocus)
		cleanup()
		root.remove()
	})

	it("ignores focusin from non-text inputs", () => {
		const root = document.createElement("div")
		const checkbox = document.createElement("input")
		checkbox.type = "checkbox"
		root.appendChild(checkbox)
		document.body.appendChild(root)
		const invalidate = vi.fn()
		const cleanup = setupCaretBlink(root, invalidate)
		// Focusin from a non-text target — must not start the heartbeat.
		const evt = new FocusEvent("focusin", { bubbles: true })
		Object.defineProperty(evt, "target", { value: checkbox })
		root.dispatchEvent(evt)
		vi.advanceTimersByTime(2000)
		expect(invalidate).not.toHaveBeenCalled()
		cleanup()
		root.remove()
	})

	it("does not invalidate when document.hidden is true", () => {
		const root = document.createElement("div")
		const input = document.createElement("input")
		input.type = "text"
		root.appendChild(input)
		document.body.appendChild(root)
		const realHidden = Object.getOwnPropertyDescriptor(
			Document.prototype,
			"hidden"
		)
		Object.defineProperty(document, "hidden", {
			configurable: true,
			get: () => true,
		})
		const invalidate = vi.fn()
		const cleanup = setupCaretBlink(root, invalidate)
		const focusInEvt = new FocusEvent("focusin", { bubbles: true })
		Object.defineProperty(focusInEvt, "target", { value: input })
		root.dispatchEvent(focusInEvt)
		vi.advanceTimersByTime(2000)
		expect(invalidate).not.toHaveBeenCalled()
		cleanup()
		if (realHidden) Object.defineProperty(Document.prototype, "hidden", realHidden)
		root.remove()
	})
})
