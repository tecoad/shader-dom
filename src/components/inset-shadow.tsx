import { useId } from "react"

interface InsetShadowProps {
	blur?: number
	offset?: { x?: number; y?: number }
	color?: string
	children: (filterId: string) => React.ReactNode
}

export function InsetShadow({
	blur = 3,
	offset = {},
	color = "rgba(255, 255, 255, 0.5)",
	children,
}: InsetShadowProps) {
	const id = useId()
	const filterId = `inset-shadow-${id}`
	const { x: dx = 0, y: dy = 4 } = offset

	return (
		<>
			{children(filterId)}
			<svg className="absolute size-0 overflow-hidden" aria-hidden="true">
				<defs>
					<filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
						<feComponentTransfer in="SourceAlpha" result="invert">
							<feFuncA type="table" tableValues="1 0" />
						</feComponentTransfer>
						<feOffset dx={dx} dy={dy} result="offset" in="invert" />
						<feGaussianBlur stdDeviation={blur} result="blur" in="offset" />
						<feComposite operator="in" in="blur" in2="SourceAlpha" result="shadow" />
						<feFlood floodColor={color} result="color" />
						<feComposite operator="in" in="color" in2="shadow" result="colored-shadow" />
						<feMerge>
							<feMergeNode in="SourceGraphic" />
							<feMergeNode in="colored-shadow" />
						</feMerge>
					</filter>
				</defs>
			</svg>
		</>
	)
}
