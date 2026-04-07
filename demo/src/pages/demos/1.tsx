import { Shader, LinearGradient, CursorTrail } from "shaders/react"

export default function Demo1() {
	return (
		<div className="w-dvw h-dvh flex items-center justify-center">
			<Shader className="w-dvw h-dvh">
				<LinearGradient colorA="#0f172a" colorB="#7c3aed" />

				<CursorTrail />
			</Shader>
			<button
				type="button"
				className="px-10 py-6 rounded-full bg-[green] text-white"
			>
				Click
			</button>
		</div>
	)
}
