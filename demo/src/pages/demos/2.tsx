import { useState } from "react"
import { HtmlTexture, Shader } from "shader-dom"

const FRAGMENT = /* glsl */ `
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
	vec2 p = vUv;
	// Gentle wave distortion based on uTime
	p.x += sin(p.y * 20.0 + uTime * 2.0) * 0.01;
	p.y += cos(p.x * 20.0 + uTime * 1.5) * 0.01;
	vec4 color = texture2D(uTexture, p);
	gl_FragColor = color;
}
`

export default function Demo2() {
	const [count, setCount] = useState(0)

	return (
		<div className="h-dvh w-dvw flex items-center justify-center p-10">
			<Shader fragment={FRAGMENT} className="border-3 border-[green]">
				<HtmlTexture interactive>
					<div
						style={{ width: 500, height: 500 }}
						className="flex flex-col items-center justify-center gap-10 bg-[gray]"
					>
						<div className="text-5xl font-semibold text-[red]">Fragment</div>
						<button
							type="button"
							className="px-8 py-4 bg-[red] text-white rounded-full hover:bg-[green] active:scale-95 transition"
							onClick={() => setCount(c => c + 1)}
						>
							Count: {count}
						</button>
					</div>
				</HtmlTexture>
			</Shader>
		</div>
	)
}
