import { useState } from "react"
import { EscapeShader, HtmlTexture } from "shader-dom"
import { Circle, CursorRipples, Shader } from "shaders/react"

export default function Demo1() {
	const [count, setCount] = useState(0)

	return (
		<Shader style={{ width: "100dvw", height: "100dvh" }}>
			<CursorRipples intensity={10} radius={0.5}>
				<HtmlTexture interactive>
					<div className="w-dvw h-dvh flex flex-col items-center justify-center gap-12 ">
						<div className="text-5xl font-semibold text-[red]">Lipsum</div>
						<EscapeShader>
							<div className="text-2xl font-semibold text-[purple] hover:bg-[green] bg-white p-6">
								Escaped content
								<button
									type="button"
									className="bg-[red] p-2 hover:bg-[yellow] active:scale-90 rounded-full"
								>
									test
								</button>
							</div>
						</EscapeShader>
						<button
							type="button"
							className="px-10 py-6 transition-all duration-300 hover:bg-[green] active:scale-90 rounded-full bg-[red] text-white text-2xl font-bold"
							onClick={() => setCount(c => c + 1)}
						>
							Count: {count}
						</button>
					</div>
				</HtmlTexture>
				<Circle color="blue" radius={1.35} center={{ x: 0.5, y: 1 }} />

				<HtmlTexture interactive>
					<div className="w-dvw h-dvh flex flex-col items-center justify-center gap-12 ">
						<div className="text-5xl font-semibold text-[red]">Lipsum</div>
						<EscapeShader>
							<div className="text-2xl font-semibold text-[purple] hover:bg-[green] bg-white p-6">
								Escaped content
								<button
									type="button"
									className="bg-[red] p-2 hover:bg-[yellow] active:scale-90 rounded-full"
								>
									test
								</button>
							</div>
						</EscapeShader>
						<button
							type="button"
							className="px-10 py-6 transition-all duration-300 hover:bg-[green] active:scale-90 rounded-full bg-[red] text-white text-2xl font-bold"
							onClick={() => setCount(c => c + 1)}
						>
							Count: {count}
						</button>
					</div>
				</HtmlTexture>
			</CursorRipples>
		</Shader>
	)
}
