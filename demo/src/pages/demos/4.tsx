import { useState } from "react"
import { HtmlTexture } from "shader-dom/shaders"
import {
	ChromaticAberration,
	CursorRipples,
	RadialGradient,
	Ripples,
	Shader,
	Star,
} from "shaders/react"

export default function Demo4() {
	const [count, setCount] = useState(0)

	return (
		<Shader className="h-dvh w-dvw">
			<CursorRipples
				chromaticSplit={0.3}
				intensity={5}
				radius={0.4}
				visible={true}
			>
				<RadialGradient
					colorA="#ffffff"
					colorB="#c4c4c4"
					radius={0.7}
					visible={true}
				/>
				<HtmlTexture interactive>
					<div className="relative h-dvh w-dvw overflow-hidden flex flex-col items-center justify-center  text-[#1d1d1f] font-sans">
						<div className="relative mb-[2vw] text-[max(11px,0.9vw)] font-semibold tracking-[0.25em] uppercase opacity-35">
							Interactive UI Component
						</div>

						<div className="relative flex flex-col items-center text-[min(13vw,19vh)] font-bold tracking-[-0.04em] leading-[1.08]">
							<div>Liquid</div>
							<div>Effect</div>
						</div>

						<div className="relative mt-[1.8vw] w-[60px] h-[0.5px] bg-[rgba(29,29,31,0.12)]" />

						<div className="relative mt-[1vw] text-[max(11px,1vw)] font-normal tracking-[0.02em] opacity-30">
							Built with Three.js &nbsp;•&nbsp; React &nbsp;•&nbsp; Tailwind CSS
						</div>

						<button
							type="button"
							className="relative mt-[3vw] px-8 py-4 bg-black text-white rounded-full hover:bg-[red] active:scale-95 duration-300 transition"
							onClick={() => setCount(c => c + 1)}
						>
							Clicks: {count}
						</button>

						<input
							type="text"
							placeholder="Type here..."
							className="relative mt-[1.5vw] px-5 py-3 bg-white border border-[rgba(29,29,31,0.15)] rounded-full text-[15px] tracking-[0.01em] outline-none focus:border-[rgba(29,29,31,0.4)] transition w-[340px]"
						/>

						<div className="relative mt-[1vw] text-[max(11px,1vw)] font-normal tracking-[0.02em] opacity-30">
							Built with Three.js &nbsp;•&nbsp; React &nbsp;•&nbsp; Tailwind CSS
						</div>
					</div>
				</HtmlTexture>

				<CursorRipples
					blendMode="overlay"
					chromaticSplit={2.9}
					decay={6.1}
					radius={0.5}
					intensity={20}
					visible={true}
				/>
				<ChromaticAberration strength={0.25} visible={true} />
				<Star color="#f04a4a" radius={0.18} />
			</CursorRipples>
			<Star color="#f04a4a" radius={0.18} visible={false} />
			<Ripples visible={false} />
		</Shader>
	)
}
