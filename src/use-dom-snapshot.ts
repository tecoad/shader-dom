import { type RefObject, useEffect, useRef, useState } from "react"
import { observeInvalidations } from "./invalidation-observers"
import { createScheduler } from "./scheduler"
import { snapshotToCanvas } from "./snapshot"

export interface UseDomSnapshotOptions {
	interactive?: boolean
	/**
	 * Fired after every successful snapshot. With event-driven scheduling
	 * this fires at most once per animation frame, and only when an event
	 * (mutation, resize, pointer, focus, input, selection, transition tick,
	 * or image load) actually invalidated the snapshot.
	 */
	onSnapshot?: (canvas: HTMLCanvasElement) => void
	/**
	 * Cap the snapshot canvas DPR. See `SnapshotOptions.maxPixelRatio` for
	 * the full rationale. Default: `Infinity`.
	 */
	maxPixelRatio?: number
}

/**
 * Drives the DOM snapshot pipeline for a ref'd element. Unlike a naive
 * rAF loop, this hook is event-driven: observers (see
 * `observeInvalidations`) fan into a single `scheduler.invalidate()`,
 * which coalesces multiple events in one frame into a single snapshot
 * call. When the DOM is idle, zero snapshot work happens.
 *
 * The transition-aware mini-loop keeps invalidating each frame while
 * CSS transitions are active (tracked via `transitionrun`/`transitionend`)
 * so transition intermediates get sampled and applied to the clone.
 *
 * The returned canvas reference is stable across renders; its contents
 * update in place. three.js consumers wrap it in CanvasTexture and set
 * `needsUpdate = true` once per frame.
 */
export function useDomSnapshot(
	sourceRef: RefObject<HTMLElement | null>,
	options: UseDomSnapshotOptions = {}
): HTMLCanvasElement | null {
	const { interactive = false, onSnapshot, maxPixelRatio } = options
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const snapshotting = useRef(false)
	const onSnapshotRef = useRef(onSnapshot)
	onSnapshotRef.current = onSnapshot
	// Refs so changing these props doesn't re-mount the entire snapshot
	// pipeline — the next snapshot picks up the new value.
	const maxPixelRatioRef = useRef(maxPixelRatio)
	maxPixelRatioRef.current = maxPixelRatio
	const [exposedCanvas, setExposedCanvas] = useState<HTMLCanvasElement | null>(
		null
	)

	if (canvasRef.current === null && typeof document !== "undefined") {
		canvasRef.current = document.createElement("canvas")
	}

	useEffect(() => {
		const el = sourceRef.current
		const target = canvasRef.current
		if (!el || !target) return

		let observers: ReturnType<typeof observeInvalidations> | null = null
		let transitionLoopHandle: number | null = null
		// Throttle the transition-aware mini-loop to ~30fps. The previous
		// every-frame cadence ran the full snapshot pipeline 18 times per 300ms
		// transition, saturating Safari's main thread without producing visible
		// improvement for `duration-300` transitions. 30fps = 9 samples per
		// 300ms transition, indistinguishable to the eye.
		const TRANSITION_MIN_INTERVAL_MS = 33
		let lastTransitionInvalidateMs = 0

		const tryTransitionInvalidate = () => {
			if (!observers?.hasActiveTransitions()) return
			const now = performance.now()
			if (now - lastTransitionInvalidateMs >= TRANSITION_MIN_INTERVAL_MS) {
				lastTransitionInvalidateMs = now
				scheduler.invalidate()
			} else {
				// Throttled — wait one frame and re-check. Cheap; no snapshot work.
				transitionLoopHandle = requestAnimationFrame(tryTransitionInvalidate)
			}
		}

		const runSnapshot = async () => {
			if (!el || !target || snapshotting.current) return
			snapshotting.current = true
			try {
				await snapshotToCanvas(
					el,
					target,
					() => {
						setExposedCanvas(prev => prev ?? target)
						onSnapshotRef.current?.(target)
					},
					{
						captureTransitions: observers?.hasActiveTransitions() ?? false,
						maxPixelRatio: maxPixelRatioRef.current,
					}
				)
			} finally {
				snapshotting.current = false
			}

			// Transition-aware mini-loop: while any transition is active,
			// schedule a throttled re-invalidation so intermediates sample.
			if (observers?.hasActiveTransitions()) {
				transitionLoopHandle = requestAnimationFrame(tryTransitionInvalidate)
			}
		}

		const scheduler = createScheduler(runSnapshot)

		observers = observeInvalidations({
			root: el,
			onInvalidate: () => scheduler.invalidate(),
			interactive,
		})

		// Initial snapshot — fire once on mount.
		scheduler.invalidate()

		return () => {
			if (transitionLoopHandle !== null) {
				cancelAnimationFrame(transitionLoopHandle)
			}
			scheduler.dispose()
			observers?.dispose()
		}
	}, [sourceRef, interactive])

	return exposedCanvas
}
