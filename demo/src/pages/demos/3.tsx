import { useState } from "react"
import { HtmlTexture, Shader } from "shader-dom"
import { liquidPreset } from "shader-dom/presets/liquid"

/**
 * Mirrors /Users/matheus/Downloads/liquid-effect-animation-main/src/app/demo/page.tsx:
 * fullscreen, "Liquid / Effect" main text, "Interactive UI Component" subtext,
 * tagline below a thin divider, #fafafa base with cool+warm radial gradients
 * in multiply blend (same as the Downloads generateTextImage).
 */
const liquidScene = liquidPreset()

export default function Demo3() {
	const [count, setCount] = useState(0)

	return (
		<Shader scene={liquidScene}>
			<HtmlTexture interactive>
				<div className="relative h-dvh w-dvw overflow-hidden flex flex-col items-center justify-center bg-[#fafafa] text-[#1d1d1f] font-sans">
					{/* Ambient light gradients — cool top, warm bottom — multiply blend */}
					<div className="absolute inset-0 pointer-events-none mix-blend-multiply bg-[radial-gradient(circle_at_50%_10%,rgba(220,225,240,0.6)_0%,rgba(250,250,250,1)_60%)]" />
					<div className="absolute inset-0 pointer-events-none mix-blend-multiply bg-[radial-gradient(circle_at_50%_95%,rgba(240,230,220,0.4)_0%,rgba(250,250,250,1)_50%)]" />

					{/* Subtext (like generateTextImage's subText) */}
					<div className="relative mb-[2vw] text-[max(11px,0.9vw)] font-semibold tracking-[0.25em] uppercase opacity-35">
						Interactive UI Component
					</div>

					{/* Main text — "Liquid" / "Effect" stacked */}
					<div className="relative flex flex-col items-center text-[min(13vw,19vh)] font-bold tracking-[-0.04em] leading-[1.08]">
						<div>Liquid</div>
						<div>Effect</div>
					</div>

					{/* Divider (60px × 0.5px, 12% alpha) */}
					<div className="relative mt-[1.8vw] w-[60px] h-[0.5px] bg-[rgba(29,29,31,0.12)]" />

					{/* Tagline (like generateTextImage's tagline) */}
					<div className="relative mt-[1vw] text-[max(11px,1vw)] font-normal tracking-[0.02em] opacity-30">
						Built with Three.js &nbsp;•&nbsp; React &nbsp;•&nbsp; Tailwind CSS
					</div>

					{/* Interactive button (the original demo/3 element preserved) */}
					<button
						type="button"
						className="relative mt-[3vw] px-8 py-4 bg-black text-white rounded-full hover:bg-[red] active:scale-95 duration-300 transition"
						onClick={() => setCount(c => c + 1)}
					>
						Clicks: {count}
					</button>
				</div>
			</HtmlTexture>
		</Shader>
	)
}
