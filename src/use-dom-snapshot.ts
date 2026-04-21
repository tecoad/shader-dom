import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { snapshotToCanvas } from "./snapshot"

export interface UseDomSnapshotOptions {
	interactive?: boolean
	/**
	 * Fired after every successful snapshot. In interactive mode this is
	 * effectively per-frame; consumers throttle as needed.
	 */
	onSnapshot?: (canvas: HTMLCanvasElement) => void
}

/**
 * Runs the snapshot pipeline against a ref'd DOM element and returns
 * the backing canvas. Interactive mode runs a requestAnimationFrame loop;
 * non-interactive runs on mount + MutationObserver + ResizeObserver.
 *
 * The returned canvas reference is stable across renders. Its content
 * updates in place — consumers using three.js CanvasTexture set needsUpdate
 * each frame to pick up changes.
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
	// Only exposed to consumers after the first successful snapshot populates
	// the canvas — a freshly-created <canvas> has default 300×150 dims and
	// transparent pixels, which would make consumers think there's content.
	const [exposedCanvas, setExposedCanvas] = useState<HTMLCanvasElement | null>(
		null
	)

	// Lazy-init backing canvas on first render (SSR-safe).
	if (canvasRef.current === null && typeof document !== "undefined") {
		canvasRef.current = document.createElement("canvas")
	}

	const snapshot = useCallback(() => {
		const el = sourceRef.current
		const target = canvasRef.current
		if (!el || !target || snapshotting.current) return
		snapshotting.current = true
		snapshotToCanvas(el, target, () => {
			snapshotting.current = false
			// Expose canvas only once the first successful snapshot lands.
			setExposedCanvas(prev => prev ?? target)
			onSnapshotRef.current?.(target)
		})
	}, [sourceRef])

	useEffect(() => {
		const el = sourceRef.current
		const target = canvasRef.current
		if (!el || !target) return

		if (interactive) {
			let running = true
			const loop = () => {
				if (!running) return
				snapshot()
				requestAnimationFrame(loop)
			}
			requestAnimationFrame(loop)
			return () => {
				running = false
			}
		}

		requestAnimationFrame(snapshot)

		const mutationObs = new MutationObserver(() =>
			requestAnimationFrame(snapshot)
		)
		mutationObs.observe(el, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		})

		const resizeObs = new ResizeObserver(() => requestAnimationFrame(snapshot))
		resizeObs.observe(el)

		return () => {
			mutationObs.disconnect()
			resizeObs.disconnect()
		}
	}, [snapshot, interactive, sourceRef])

	return exposedCanvas
}
