import { useEffect, useRef } from "react"
import { DemoContent } from "@/components/demo-content"
import { useDomSnapshot } from "@/hooks/use-dom-snapshot"
import { useSelectionHighlight } from "@/hooks/use-selection-highlight"
import { useWebGLShader } from "@/hooks/use-webgl-shader"
import { SHADERS } from "@/lib/shaders"

interface ShaderDemoProps {
	shader: string
	counter: number
	onSnapshotMs: (ms: number) => void
}

export function ShaderDemo({ shader, counter, onSnapshotMs }: ShaderDemoProps) {
	const domRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const highlightRef = useRef<HTMLDivElement>(null)

	const { texture, snapshot } = useDomSnapshot(domRef, [counter, shader])
	const { updateTexture } = useWebGLShader(canvasRef, texture, SHADERS[shader].code)

	useSelectionHighlight(domRef, highlightRef)

	useEffect(() => {
		let running = true
		const loop = () => {
			if (!running) return
			const t0 = performance.now()
			snapshot()
			onSnapshotMs(performance.now() - t0)
			requestAnimationFrame(loop)
		}
		loop()
		return () => {
			running = false
		}
	}, [snapshot, onSnapshotMs])

	useEffect(() => {
		if (texture) updateTexture()
	}, [texture, updateTexture])

	return (
		<div className="flex justify-center">
			<div>
				<div className="relative w-full">
					<canvas
						ref={canvasRef}
						className="absolute top-0 left-0 z-1 pointer-events-none"
					/>
					{/* Selection highlight layer — above canvas, below interactive overlay */}
					<div
						ref={highlightRef}
						className="absolute top-0 left-0 w-full h-full z-2 pointer-events-none"
					/>
					{/* Interactive overlay — opacity: 0, catches all events */}
					<div ref={domRef} className="interactive-overlay relative z-3">
						<DemoContent counter={counter} />
					</div>
				</div>
			</div>
		</div>
	)
}
