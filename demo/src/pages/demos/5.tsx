import { useState } from "react"
import { HtmlTexture, Shader } from "shader-dom"
import { liquidPreset } from "shader-dom/presets/liquid"

/**
 * Softbox-lighting variant of demos/3 — same scene/markup, only `lighting:
 * "softbox"` added to the preset call. Use this side-by-side with /demos/3
 * (which uses the default `studio` mode) to compare:
 * - /demos/3 → bundled studio bake, central hotspot
 * - /demos/5 → procedural softbox env map, no hotspot, homogeneous highlights
 *
 * `liquid` is attached to `window` so the runtime toggle can be exercised
 * from devtools:
 *
 *   liquid.controls.setLighting("studio")
 *   liquid.controls.setLighting("softbox")
 *   liquid.controls.setAttenuation(0.999)   // very long-lived ripples
 *   liquid.controls.setAttenuation(0.99)    // fast fade
 *   liquid.controls.setAttenuation(0.995)   // bundle default
 */
const liquid = liquidPreset({
	pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
	cursorDrops: false,
	envMapIntensity: 0.3,
	displacementScale: 10,
	rain: false,
	rainTime: 2,
	simulationStepsPerFrame: 5,
	lighting: "softbox",
	// Default is 0.995. Bumped here so ripples linger ~10× longer at this
	// `simulationStepsPerFrame` — easier to feel the new knob in isolation.
	attenuation: 0.985,
})

;(window as unknown as { liquid: typeof liquid }).liquid = liquid

export default function Demo5() {
	const [count, setCount] = useState(0)

	return (
		<Shader scene={liquid.scene}>
			<HtmlTexture interactive maxPixelRatio={1}>
				<div className="relative h-dvh w-dvw overflow-hidden flex flex-col items-center justify-center bg-[white] text-[#1d1d1f] font-sans">
					{/* Subtext (like generateTextImage's subText) */}
					<div className="relative mb-[2vw] text-[max(11px,0.9vw)] font-semibold tracking-[0.25em] uppercase">
						Softbox Lighting
					</div>

					{/* Main text — "Liquid" / "Effect" stacked */}
					<div className="relative flex flex-col items-center text-[min(13vw,19vh)] font-bold tracking-[-0.04em] leading-[1.08]">
						<div>Liquid</div>
						<div>Effect</div>
					</div>

					{/* Divider (60px × 0.5px, 12% alpha) */}
					<div className="relative mt-[1.8vw] w-[60px] h-[0.5px] bg-[rgba(29,29,31,0.12)]" />

					{/* Tagline (like generateTextImage's tagline) */}
					<div className="relative mt-[1vw] text-[max(11px,1vw)] font-normal tracking-[0.02em]">
						Built with Three.js &nbsp;•&nbsp; React &nbsp;•&nbsp; Tailwind CSS
					</div>

					{/* Interactive button (the original demo/3 element preserved) */}
					<button
						type="button"
						className="relative mt-[3vw] px-8 py-4 bg-black text-white rounded-full hover:bg-[red] active:scale-95 duration-300 transition"
						onClick={e => {
							setCount(c => c + 1)
							const x = (e.clientX / window.innerWidth) * 2 - 1
							const y = -(e.clientY / window.innerHeight) * 2 + 1
							liquid.controls.drop(x, y)
							liquid.controls.pulse(2.5, 800)
						}}
					>
						Clicks: {count}
					</button>

					<input
						type="text"
						placeholder="Type here..."
						className="relative mt-[1.5vw] px-5 py-3 bg-white border border-[rgba(29,29,31,0.15)] rounded-full text-[15px] tracking-[0.01em] outline-none focus:border-[rgba(29,29,31,0.4)] transition w-[340px]"
					/>
					{/* Tagline (like generateTextImage's tagline) */}
					<div className="relative mt-[1vw] text-[max(11px,1vw)] font-normal tracking-[0.02em]">
						Built with Three.js &nbsp;•&nbsp; React &nbsp;•&nbsp; Tailwind CSS
					</div>
				</div>
			</HtmlTexture>
		</Shader>
	)
}
