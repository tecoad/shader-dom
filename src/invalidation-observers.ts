export interface InvalidationObservers {
	/**
	 * True while one or more CSS transitions OR Web Animations API
	 * animations (Motion, GSAP, CSS @keyframes) are running inside `root`.
	 *
	 * The caller's transition-aware loop consults this each frame and keeps
	 * invalidating while it's true — guarantees per-frame snapshots so
	 * intermediate animation states reach the rasterizer.
	 */
	hasActiveAnimations(): boolean
	/** Detach all observers and listeners. */
	dispose(): void
}

export interface ObserveInvalidationsOptions {
	/** Element to observe for DOM mutations, resize, and pointer/focus events. */
	root: HTMLElement
	/**
	 * Called whenever an invalidation event fires. Callers should forward
	 * to their scheduler's `invalidate()` — this module does NOT call
	 * requestAnimationFrame itself.
	 */
	onInvalidate: () => void
	/**
	 * When false, only MutationObserver + ResizeObserver are attached.
	 * When true, also: pointerenter/leave/down/up, focusin/out, input/change,
	 * selectionchange, transitionrun/end/cancel, img load.
	 */
	interactive: boolean
}

/**
 * Ported from three-html-render (src/htmlInCanvasPolyfill.ts:748-770). All
 * observers fan into a single `onInvalidate` callback; the caller coalesces
 * via rAF (see `createScheduler`).
 *
 * Transition tracking:
 *  - `transitionrun` increments a counter
 *  - `transitionend` / `transitioncancel` decrements (clamped at 0)
 *  - `hasActiveAnimations()` returns counter > 0
 *  - While active, the caller keeps invalidating each frame so the snapshot
 *    samples transition intermediates via `applyTransitionIntermediates`.
 */
export function observeInvalidations(
	options: ObserveInvalidationsOptions
): InvalidationObservers {
	const { root, onInvalidate, interactive } = options
	const disposers: Array<() => void> = []
	let transitionCount = 0

	// 1) MutationObserver — structural/attribute/text changes
	const mo = new MutationObserver(onInvalidate)
	mo.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		characterData: true,
	})
	disposers.push(() => mo.disconnect())

	// 2) ResizeObserver — root or descendant resize
	const ro = new ResizeObserver(onInvalidate)
	ro.observe(root)
	disposers.push(() => ro.disconnect())

	const hasActiveAnimations = (): boolean => {
		if (transitionCount > 0) return true
		// `getAnimations({subtree: true})` covers WAAPI, CSS transitions, and
		// CSS animations regardless of who started them (Motion, GSAP, etc.).
		// Using it gates the per-frame invalidation loop so animations that
		// don't fire DOM events (WAAPI on transform/opacity/filter) still
		// drive the snapshot pipeline forward each frame.
		if (typeof root.getAnimations !== "function") return false
		const anims = root.getAnimations({ subtree: true })
		for (const a of anims) {
			if (a.playState === "running") return true
		}
		return false
	}

	if (!interactive) {
		return {
			hasActiveAnimations,
			dispose: () => disposers.forEach(fn => fn()),
		}
	}

	// 3) Pointer events — :hover, :active state boundaries
	const onPointer = () => onInvalidate()
	root.addEventListener("pointerenter", onPointer, true)
	root.addEventListener("pointerleave", onPointer, true)
	root.addEventListener("pointerdown", onPointer, true)
	root.addEventListener("pointerup", onPointer, true)
	disposers.push(() => {
		root.removeEventListener("pointerenter", onPointer, true)
		root.removeEventListener("pointerleave", onPointer, true)
		root.removeEventListener("pointerdown", onPointer, true)
		root.removeEventListener("pointerup", onPointer, true)
	})

	// 4) Focus events — :focus state boundaries
	const onFocus = () => onInvalidate()
	root.addEventListener("focusin", onFocus, true)
	root.addEventListener("focusout", onFocus, true)
	disposers.push(() => {
		root.removeEventListener("focusin", onFocus, true)
		root.removeEventListener("focusout", onFocus, true)
	})

	// 5) Form input/change — textbox content changes without mutation
	const onInput = () => onInvalidate()
	root.addEventListener("input", onInput, true)
	root.addEventListener("change", onInput, true)
	disposers.push(() => {
		root.removeEventListener("input", onInput, true)
		root.removeEventListener("change", onInput, true)
	})

	// 6) Document-level selectionchange — selection state
	const onSelection = () => onInvalidate()
	document.addEventListener("selectionchange", onSelection)
	disposers.push(() =>
		document.removeEventListener("selectionchange", onSelection)
	)

	// 7) Image load — async texture data arrives
	const onLoad = (ev: Event) => {
		const target = ev.target as HTMLElement | null
		if (target && target.tagName === "IMG") onInvalidate()
	}
	root.addEventListener("load", onLoad, true)
	disposers.push(() => root.removeEventListener("load", onLoad, true))

	// 8) CSS transition tracking + per-frame invalidation while active
	const onTransitionRun = () => {
		transitionCount++
		onInvalidate()
	}
	const onTransitionSettled = () => {
		if (transitionCount > 0) transitionCount--
		onInvalidate()
	}
	root.addEventListener("transitionrun", onTransitionRun, true)
	root.addEventListener("transitionend", onTransitionSettled, true)
	root.addEventListener("transitioncancel", onTransitionSettled, true)
	disposers.push(() => {
		root.removeEventListener("transitionrun", onTransitionRun, true)
		root.removeEventListener("transitionend", onTransitionSettled, true)
		root.removeEventListener("transitioncancel", onTransitionSettled, true)
	})

	return {
		hasActiveAnimations,
		dispose: () => disposers.forEach(fn => fn()),
	}
}
