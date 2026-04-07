import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/button"
import { Controls } from "@/components/controls"
import { FitHeadline } from "@/components/fit-headline"
import { InsetShadow } from "@/components/inset-shadow"
import { PipelineDiagram } from "@/components/pipeline-diagram"
import { ShaderDemo } from "@/components/shader-demo"
import { ShaderSelector } from "@/components/shader-selector"
import { Floodlines } from "./components/floodlines"

function GithubIcon() {
	return (
		<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	)
}

function DarkModeIcon() {
	return (
		<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
			<circle
				cx="9"
				cy="9"
				r="7.25"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
			<path d="M9,4V14c2.761,0,5-2.239,5-5s-2.239-5-5-5Z" fill="currentColor" />
		</svg>
	)
}

export default function App() {
	const [shader, setShader] = useState("wave")
	const [counter, setCounter] = useState(0)
	const [isLive, setIsLive] = useState(true)
	const [snapshotMs, setSnapshotMs] = useState(0)
	const [dark, setDark] = useState(() =>
		document.documentElement.classList.contains("dark")
	)

	const toggleTheme = useCallback(() => {
		const next = !document.documentElement.classList.contains("dark")
		document.documentElement.classList.toggle("dark", next)
		localStorage.setItem("theme", next ? "dark" : "light")
		setDark(next)
	}, [])

	const emaRef = useRef(0)
	const lastUpdateRef = useRef(0)
	const handleSnapshotMs = useCallback((ms: number) => {
		const alpha = 0.1
		emaRef.current = emaRef.current === 0 ? ms : emaRef.current * (1 - alpha) + ms * alpha
		const now = performance.now()
		if (now - lastUpdateRef.current > 500) {
			lastUpdateRef.current = now
			setSnapshotMs(emaRef.current)
		}
	}, [])

	// Live counter update
	useEffect(() => {
		if (!isLive) return
		const id = setInterval(() => setCounter(c => c + 1), 200)
		return () => clearInterval(id)
	}, [isLive])

	return (
		<div className="min-h-dvh bg-base-1 flex flex-col px-6">
			{/* Header */}
			<div className="absolute z-20 top-4 right-6 flex gap-2">
				<Button
					size="lg"
					rounded
					variant="ghost"
					className="text-base-a9"
					onClick={toggleTheme}
				>
					<DarkModeIcon />
				</Button>
				<a
					href="https://github.com/tecoad/shader-dom/blob/main/ARCHITECTURE.md"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Button size="lg" rounded variant="outline">
						Docs
					</Button>
				</a>
				<a
					href="https://github.com/tecoad/shader-dom"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Button size="lg" rounded variant="solid">
						<GithubIcon />
						Github
					</Button>
				</a>
			</div>

			{/* Content */}
			<div className="max-w-xl w-full mx-auto border-x border-base-5 flex-1 flex flex-col gap-8 pb-10">
				{/* Headline */}
				<div className="flex flex-col gap-8 justify-end items-center flex-1 min-h-[40vh]">
					<FitHeadline headlineClassName="font-medium tracking-tighter leading-[1]">
						<FitHeadline.Line>
							<InsetShadow
								blur={1}
								offset={{ y: 1 }}
								color="var(--color-white-a5)"
							>
								{filterId => (
									<span
										className="text-base-12"
										style={{ filter: `url(#${filterId})` }}
									>
										shader-dom
									</span>
								)}
							</InsetShadow>
						</FitHeadline.Line>
					</FitHeadline>
					<p className="text-base-10 text-lg text-center">
						GPU fragment shaders on live, interactive DOM elements
					</p>
				</div>

				<Controls
					isLive={isLive}
					snapshotMs={snapshotMs}
					onToggleLive={() => setIsLive(v => !v)}
				/>

				<div>
					<ShaderSelector shader={shader} onShaderChange={setShader} />

					<ShaderDemo
						shader={shader}
						counter={counter}
						onSnapshotMs={handleSnapshotMs}
					/>
					<Floodlines className="[--line-color:var(--color-base-3)]" />
				</div>

				<PipelineDiagram />
			</div>
		</div>
	)
}
