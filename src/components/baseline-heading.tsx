import { cn } from "@/lib/utils"
import { stagger, useAnimate, useInView } from "motion/react"
import { useEffect, useRef, useState } from "react"

function getFontMetrics(element: HTMLElement) {
	const style = window.getComputedStyle(element)
	const canvas = document.createElement("canvas")
	const context = canvas.getContext("2d")

	if (!context) {
		return { xHeight: 0, ascent: 0, descent: 0 }
	}

	context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

	const xMetrics = context.measureText("x")
	const hMetrics = context.measureText("H")

	return {
		xHeight: xMetrics.actualBoundingBoxAscent,
		ascent: hMetrics.actualBoundingBoxAscent,
		descent: hMetrics.actualBoundingBoxDescent,
	}
}

export function BaselineHeading({
	as: Tag = "h2",
	className,
	headingClassName,
	children,
	...rest
}: {
	as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
	headingClassName?: string
} & React.HTMLAttributes<HTMLDivElement>) {
	const headingRef = useRef<HTMLHeadingElement>(null)
	const [scope, animate] = useAnimate()
	const isInView = useInView(scope, { once: true, amount: 1 })
	const [linePositions, setLinePositions] = useState<{
		baseline: number
		xHeight: number
	} | null>(null)

	useEffect(() => {
		document.fonts.ready.then(() => {
			if (!headingRef.current || !scope.current) return

			const containerRect = scope.current.getBoundingClientRect()
			const rect = headingRef.current.getBoundingClientRect()
			const metrics = getFontMetrics(headingRef.current)

			const lineCenter = rect.top + rect.height / 2 - containerRect.top
			const fontHeight = metrics.ascent + metrics.descent
			const baseline = lineCenter - fontHeight / 2 + metrics.ascent
			const xHeight = baseline - metrics.xHeight

			setLinePositions({ baseline, xHeight })
		})
	}, [scope])

	useEffect(() => {
		if (linePositions && isInView) {
			animate(
				"[data-typography-line]",
				{ opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
				{
					delay: stagger(0.05),
					type: "spring",
					bounce: 0.6,
					stiffness: 300,
				}
			)
		}
	}, [linePositions, isInView, animate])

	const allLines = linePositions
		? [
				{ type: "xHeight" as const, top: linePositions.xHeight },
				{ type: "baseline" as const, top: linePositions.baseline },
			]
		: []

	return (
		<div
			ref={scope}
			className={cn("relative w-full", className)}
			{...rest}
		>
			{allLines.map((line, i) => (
				<div
					key={i}
					data-typography-line
					className="absolute h-px w-dvw bg-accent-7"
					style={{
						top: `${line.top}px`,
						left: "calc(-50vw + 50%)",
						opacity: 0,
						transform: "translateY(-10px)",
						filter: "blur(3px)",
					}}
				/>
			))}

			<Tag ref={headingRef} className={cn("relative z-1", headingClassName)}>
				{children}
			</Tag>
		</div>
	)
}
