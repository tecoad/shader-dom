export interface Scheduler {
	/** Mark dirty. If no rAF is queued, queue one. Safe to call from inside `run`. */
	invalidate(): void
	/** Cancel any pending rAF and prevent further runs. */
	dispose(): void
}

/**
 * rAF-coalesced dirty-flag scheduler. `run` is invoked at most once per
 * animation frame, and only when `invalidate()` has been called since
 * the last run started. If `invalidate()` fires during `run()`, the
 * scheduler re-arms for the next frame once `run` resolves.
 *
 * Pattern ported from three-html-render's `schedulePaint`
 * (htmlInCanvasPolyfill.ts:805-830).
 */
export function createScheduler(run: () => void | Promise<void>): Scheduler {
	let rafHandle: number | null = null
	let dirty = false
	let running = false
	let disposed = false

	const tick = async () => {
		rafHandle = null
		if (disposed) return
		if (!dirty) return
		dirty = false
		running = true
		try {
			await run()
		} finally {
			running = false
		}
		if (dirty && !disposed) {
			rafHandle = requestAnimationFrame(tick)
		}
	}

	return {
		invalidate() {
			if (disposed) return
			dirty = true
			if (rafHandle !== null) return
			if (running) return
			rafHandle = requestAnimationFrame(tick)
		},
		dispose() {
			disposed = true
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle)
				rafHandle = null
			}
			dirty = false
		},
	}
}
