/** biome-ignore-all lint/suspicious/noArrayIndexKey: <explanation> */
import { stagger, useAnimate, useInView } from "motion/react"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface FitHeadlineProps {
	children: ReactNode
	className?: string
	headlineClassName?: string
}

interface FitHeadlineLineProps {
	children: ReactNode
	className?: string
}

function calculateOptimalFontSize(container: HTMLElement) {
	const lines = container.querySelectorAll<HTMLElement>("[data-fit-line]")
	if (!lines.length) return

	const containerRight = container.getBoundingClientRect().right
	let fontSizeCqw = 20
	container.style.setProperty("--fit-headline-size", `${fontSizeCqw}cqw`)

	const getWidestLineRight = () => {
		let maxRight = 0
		for (const line of lines) {
			const right = line.getBoundingClientRect().right
			if (right > maxRight) maxRight = right
		}
		return maxRight
	}

	let widestRight = getWidestLineRight()
	const step = 0.1
	const tolerance = 2
	let iterations = 0

	while (
		Math.abs(containerRight - widestRight) > tolerance &&
		iterations < 300
	) {
		const previousRight = widestRight

		if (widestRight > containerRight) {
			fontSizeCqw = Math.round((fontSizeCqw - step) * 100) / 100
		} else {
			fontSizeCqw = Math.round((fontSizeCqw + step) * 100) / 100
		}

		container.style.setProperty("--fit-headline-size", `${fontSizeCqw}cqw`)
		widestRight = getWidestLineRight()

		if (previousRight <= containerRight && widestRight > containerRight) {
			fontSizeCqw = Math.round((fontSizeCqw - step) * 100) / 100
			container.style.setProperty("--fit-headline-size", `${fontSizeCqw}cqw`)
			break
		}

		iterations++
	}
}

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

function calculateBaselinePositions(container: HTMLElement) {
	const lines = container.querySelectorAll<HTMLElement>("[data-fit-line]")
	const containerRect = container.getBoundingClientRect()

	return [...lines].map(line => {
		const rect = line.getBoundingClientRect()
		const metrics = getFontMetrics(line)
		const lineCenter = rect.top + rect.height / 2 - containerRect.top
		const fontHeight = metrics.ascent + metrics.descent
		const baseline = lineCenter - fontHeight / 2 + metrics.ascent
		const xHeight = baseline - metrics.xHeight

		return { baseline, xHeight }
	})
}

function FitHeadlineRoot({
	children,
	className,
	headlineClassName,
}: FitHeadlineProps) {
	const isCalculating = useRef(false)
	const [scope, animate] = useAnimate<HTMLDivElement>()
	const isInView = useInView(scope, { once: true, amount: 1 })
	const [linePositions, setLinePositions] = useState<
		Array<{ baseline: number; xHeight: number }>
	>([])

	useEffect(() => {
		if (!scope.current) return
		const container = scope.current

		const recalculate = () => {
			if (isCalculating.current) return
			requestAnimationFrame(() => {
				if (!container || isCalculating.current) return
				isCalculating.current = true
				calculateOptimalFontSize(container)
				setLinePositions(calculateBaselinePositions(container))
				isCalculating.current = false
			})
		}

		const observer = new ResizeObserver(recalculate)

		document.fonts.ready.then(() => {
			calculateOptimalFontSize(container)
			setLinePositions(calculateBaselinePositions(container))
			observer.observe(container)
		})

		return () => observer.disconnect()
	}, [scope])

	useEffect(() => {
		if (linePositions.length > 0 && isInView) {
			animate(
				"[data-typography-line]",
				{ opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
				{ delay: stagger(0.05), type: "spring", bounce: 0.6, stiffness: 300 }
			)
		}
	}, [linePositions, isInView, animate])

	const allLines = linePositions.flatMap(pos => [
		{ type: "xHeight" as const, top: pos.xHeight },
		{ type: "baseline" as const, top: pos.baseline },
	])

	return (
		<div
			ref={scope}
			className={cn("@container relative w-full text-color-heading", className)}
		>
			{allLines.map((line, i) => (
				<div
					key={i}
					data-typography-line
					className="z-0 absolute h-px w-dvw bg-accent-7"
					style={{
						top: `${line.top}px`,
						left: "calc(-50vw + 50%)",
						opacity: 0,
						transform: "translateY(-10px)",
						filter: "blur(3px)",
					}}
				/>
			))}

			<h1
				className={cn("z-1", headlineClassName)}
				style={{
					fontSize: "var(--fit-headline-size, 10cqw)",
					fontKerning: "none",
					fontFeatureSettings: "kern 0",
					visibility: linePositions.length > 0 ? "visible" : "hidden",
				}}
			>
				{children}
			</h1>
		</div>
	)
}

function Line({ children, className }: FitHeadlineLineProps) {
	return (
		<span
			data-fit-line
			className={cn("block w-fit whitespace-nowrap z-1", className)}
		>
			{children}
		</span>
	)
}

export const FitHeadline = Object.assign(FitHeadlineRoot, { Line })
