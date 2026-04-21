declare module "shaders/dist/react/Shader.js" {
	import type { Context } from "react"
	interface ShaderContextValue {
		shaderParentId: string
		shaderNodeRegister: (...args: unknown[]) => void
	}
	export const ShaderContext: Context<ShaderContextValue | null>
}
