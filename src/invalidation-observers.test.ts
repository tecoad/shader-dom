import { describe, expect, it, vi } from "vitest"

// jsdom lacks ResizeObserver; provide a minimal polyfill BEFORE importing the
// module under test so its constructor reference picks up the polyfill.
if (!globalThis.ResizeObserver) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver
}

const { observeInvalidations } = await import("./invalidation-observers")

describe("observeInvalidations — transition counter", () => {
	it("increments on transitionrun, decrements on transitionend", () => {
		const root = document.createElement("div")
		document.body.appendChild(root)
		const onInvalidate = vi.fn()
		const observers = observeInvalidations({
			root,
			onInvalidate,
			interactive: true,
		})
		expect(observers.hasActiveAnimations()).toBe(false)

		root.dispatchEvent(new Event("transitionrun", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(true)

		root.dispatchEvent(new Event("transitionrun", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(true)

		root.dispatchEvent(new Event("transitionend", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(true)

		root.dispatchEvent(new Event("transitionend", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(false)

		observers.dispose()
		document.body.removeChild(root)
	})

	it("clamps counter at 0 on spurious transitionend", () => {
		const root = document.createElement("div")
		document.body.appendChild(root)
		const observers = observeInvalidations({
			root,
			onInvalidate: vi.fn(),
			interactive: true,
		})

		root.dispatchEvent(new Event("transitionend", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(false)

		observers.dispose()
		document.body.removeChild(root)
	})

	it("returns false from hasActiveAnimations when not interactive", () => {
		const root = document.createElement("div")
		document.body.appendChild(root)
		const observers = observeInvalidations({
			root,
			onInvalidate: vi.fn(),
			interactive: false,
		})

		root.dispatchEvent(new Event("transitionrun", { bubbles: true }))
		expect(observers.hasActiveAnimations()).toBe(false)

		observers.dispose()
		document.body.removeChild(root)
	})
})
