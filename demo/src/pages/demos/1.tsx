import { useState } from "react"
import { EscapeShader, HtmlTexture } from "shader-dom/shaders"
import { CursorRipples, Shader } from "shaders/react"

export default function Demo1() {
	const [count, setCount] = useState(0)

	return (
		<div className="h-dvh w-dvw border border-[red] flex flex-col p-10 items-center justify-center">
			<div className="flex border border-[yellow] flex-col gap-8 items-center justify-center">
				<div className="bg-[gray] p-4">
					Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam,
					quos.
				</div>
				<Shader className="border-3 border-[green] h-[500px]">
					<CursorRipples intensity={10} radius={0.5}>
						<HtmlTexture interactive>
							<div className=" h-full border-[blue] flex flex-col items-center justify-center gap-12 ">
								<div className="text-5xl font-semibold text-[red]">Lipsum</div>
								<EscapeShader>
									<div className="text-2xl font-semibold text-[purple] hover:bg-[green] bg-[gray] p-6">
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
			</div>
		</div>
	)
}
