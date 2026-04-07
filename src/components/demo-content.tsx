import { useState } from "react"
import { Button } from "./button"
import { Badge } from "./badge"

export function DemoContent({ counter }: { counter: number }) {
	const [clicks, setClicks] = useState(0)

	return (
		<div className="w-full p-6 font-sans bg-base-2 text-base-12 overflow-hidden">
			<div className="flex items-center gap-3 mb-5">
				<div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-9 to-accent-10 flex items-center justify-center text-xl font-bold text-white">
					S
				</div>
				<div>
					<div className="font-bold text-base">Shader DOM</div>
					<div className="text-xs text-base-9">React + WebGL</div>
				</div>
			</div>

			<h2 className="text-3xl font-semibold leading-tighter mb-3 text-base-12">
				Shaders in React via foreignObject
			</h2>

			<p className="text-sm leading-relaxed text-base-10 mb-5">
				DOM snapshot &rarr; SVG foreignObject &rarr; Canvas &rarr; WebGL texture
				&rarr; GPU fragment shader. All running at 60fps.
			</p>

			<div className="flex gap-2 mb-5">
				{["React", "WebGL", "GLSL", "SVG"].map(tag => (
					<Badge variant="surface" key={tag}>
						{tag}
					</Badge>
				))}
			</div>

			<div className="mb-5">
				<Button
					size="lg"
					variant="solid"
					className="hover:bg-accent-a6 active:bg-accent-a4 active:scale-90 transition-all"
					onClick={() => setClicks(c => c + 1)}
				>
					Clicks
					<span
						data-slot="icon"
						className="tabular-nums text-xs text-base-contrast opacity-80 font-mono"
					>
						{clicks}
					</span>
				</Button>
			</div>

			<input
				type="text"
				placeholder="Type here..."
				className="w-full px-3 py-2 mb-5 rounded-lg bg-base-3 border border-base-6 text-base-12 text-sm placeholder:text-base-8 outline-none focus:border-accent-8"
			/>

			<div className="p-4 bg-base-a3 rounded-xl border border-base-a4">
				<div className="flex justify-between mb-2.5">
					<span className="text-xs text-base-9">Frame Count</span>
					<span className="text-sm font-bold font-mono tabular-nums text-accent-11">
						{counter}
					</span>
				</div>
				<div className="h-1.5 rounded-sm bg-base-a4 overflow-hidden">
					<div
						className="h-full rounded-sm bg-gradient-to-r from-accent-9 to-accent-10 transition-[width] duration-300"
						style={{ width: `${counter % 100}%` }}
					/>
				</div>
			</div>
		</div>
	)
}
