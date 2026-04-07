import { cn } from "@/lib/utils"
import { motion, stagger, useAnimate, useInView } from "motion/react"
import type React from "react"
import { useEffect } from "react"

export const Floodlines = ({
	children,
	className,
	shouldAnimate = true,
	onAnimationComplete,
	...rest
}: {
	shouldAnimate?: boolean
	onAnimationComplete?: () => void
} & React.HTMLAttributes<HTMLDivElement>) => {
	const [scope, animate] = useAnimate()
	const isInView = useInView(scope, { once: true, amount: 1 })

	useEffect(() => {
		if (isInView && shouldAnimate) {
			animate(
				".flood-line",
				{ opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
				{ delay: stagger(0.3), type: "spring", bounce: 0.6, stiffness: 300 }
			).then(() => onAnimationComplete?.())
		}
	}, [isInView, animate, shouldAnimate])

	return (
		<div ref={scope} className={cn("relative w-full", className)} {...rest}>
			<Line shouldAnimate={shouldAnimate} />
			{children}
			<Line shouldAnimate={shouldAnimate} />
		</div>
	)
}

const Line = ({ shouldAnimate }: { shouldAnimate: boolean }) => {
	return (
		<motion.div
			style={
				shouldAnimate
					? { opacity: 0, transform: "translateY(-10px)", filter: "blur(3px)" }
					: { opacity: 1, transform: "translateY(0)", filter: "blur(0)" }
			}
			className="flood-line absolute left-[calc(50%-50vw)] z-5 h-px w-screen bg-[var(--line-color,var(--color-border))]"
		/>
	)
}

export const HR = ({
	className,
	shouldAnimate = true,
	onAnimationComplete,
}: {
	className?: string
	shouldAnimate?: boolean
	onAnimationComplete?: () => void
}) => {
	const [scope, animate] = useAnimate()
	const isInView = useInView(scope, { once: true, amount: 1 })

	useEffect(() => {
		if (isInView && shouldAnimate) {
			animate(
				".flood-line",
				{ opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
				{ delay: stagger(0.3), type: "spring", bounce: 0.6, stiffness: 300 }
			).then(() => onAnimationComplete?.())
		}
	}, [isInView, animate, shouldAnimate])

	return (
		<div ref={scope} className={cn("relative w-full", className)}>
			<Line shouldAnimate={shouldAnimate} />
		</div>
	)
}
