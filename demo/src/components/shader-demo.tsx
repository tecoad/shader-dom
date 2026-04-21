import { HtmlTexture, Shader } from "shader-dom"
import { DemoContent } from "@/components/demo-content"
import { SHADERS } from "@/lib/shaders"

interface ShaderDemoProps {
	shader: string
	counter: number
}

export function ShaderDemo({ shader, counter }: ShaderDemoProps) {
	return (
		<div className="flex justify-center">
			<Shader fragment={SHADERS[shader].code} className="w-full">
				<HtmlTexture interactive>
					<DemoContent counter={counter} />
				</HtmlTexture>
			</Shader>
		</div>
	)
}
