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
	const { interactive = false, onSnapshot } = options
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const snapshotting = useRef(false)
	const onSnapshotRef = useRef(onSnapshot)
	onSnapshotRef.current = onSnapshot
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
					}
				)
			} finally {
				snapshotting.current = false
			}

			// Transition-aware mini-loop: while any transition is active,
			// schedule another invalidation next frame so intermediates sample.
			if (observers?.hasActiveTransitions()) {
				transitionLoopHandle = requestAnimationFrame(() =>
					scheduler.invalidate()
				)
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
