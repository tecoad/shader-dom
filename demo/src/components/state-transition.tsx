import {
	AnimatePresence,
	MotionConfig,
	motion,
	type Variants,
} from "motion/react"
import { useEffect, useRef } from "react"
import {
	classifyState,
	collectAllStates,
	getStateChildren,
	State,
} from "@/lib/slots"
import { cn } from "@/lib/utils"

type Direction = "vertical" | "horizontal"
type Preset = "slide" | "swap"

// ── Swap variants (rotate + blur + translate) ──

const swapVerticalVariants: Variants = {
	enter: (isForward: boolean) => ({
		y: isForward ? "100%" : "-100%",
		opacity: 0,
		rotate: isForward ? -60 : 60,
		filter: "blur(3px)",
	}),
	center: {
		y: 0,
		opacity: 1,
		rotate: 0,
		filter: "blur(0px)",
	},
	exit: (isForward: boolean) => ({
		y: isForward ? "-100%" : "100%",
		opacity: 0,
		rotate: isForward ? 60 : -60,
		filter: "blur(3px)",
	}),
}

const swapHorizontalVariants: Variants = {
	enter: (isForward: boolean) => ({
		x: isForward ? "100%" : "-100%",
		opacity: 0,
		rotate: isForward ? -60 : 60,
		filter: "blur(3px)",
	}),
	center: {
		x: 0,
		opacity: 1,
		rotate: 0,
		filter: "blur(0px)",
	},
	exit: (isForward: boolean) => ({
		x: isForward ? "-100%" : "100%",
		opacity: 0,
		rotate: isForward ? 60 : -60,
		filter: "blur(3px)",
	}),
}

const swapVariantsMap = {
	vertical: swapVerticalVariants,
	horizontal: swapHorizontalVariants,
}

// ── Transition configs ──

const slideTransition = {
	type: "tween" as const,
	ease: "easeInOut" as const,
	duration: 0.15,
}

const swapTransition = {
	type: "tween" as const,
	ease: [0.3, 1, 0, 1] as [number, number, number, number],
	duration: 0.5,
}

// ── Component ──

type StateTransitionProps = Omit<
	React.ComponentPropsWithoutRef<"span">,
	"children"
> & {
	state: string
	preset?: Preset
	direction?: Direction
	trackDirection?: boolean
	fixedWidth?: boolean | "center" | "start"
	onAnimatingChange?: (isAnimating: boolean) => void
	children: React.ReactNode
}

function StateTransitionRoot({
	state,
	preset = "slide",
	direction = "vertical",
	trackDirection = false,
	fixedWidth,
	onAnimatingChange,
	className,
	children,
	...rest
}: StateTransitionProps) {
	const prevIndexRef = useRef<number>(0)

	const stateChildren = getStateChildren(children)
	const currentIndex = stateChildren.findIndex(
		child => child.props.name === state
	)
	const isForward = trackDirection ? currentIndex >= prevIndexRef.current : true

	useEffect(() => {
		prevIndexRef.current = currentIndex
	}, [currentIndex])

	const { iconContent, textContent, contentType } = classifyState(
		children,
		state
	)

	const isVertical = direction === "vertical"
	const fixedWidthAlign =
		fixedWidth === "start" ? "start" : fixedWidth ? "center" : null
	const allStates = fixedWidthAlign ? collectAllStates(children) : null

	const isSwap = preset === "swap"

	// ── Icon animation props ──
	const iconAnimationProps = isSwap
		? {
				custom: isForward,
				variants: swapVariantsMap[direction],
				initial: "enter" as const,
				animate: "center" as const,
				exit: "exit" as const,
			}
		: {
				initial: { scale: 0, opacity: 0 },
				animate: { scale: 1, opacity: 1 },
				exit: { scale: 0, opacity: 0 },
			}

	// ── Text animation props ──
	const textAnimationProps = isSwap
		? {
				custom: isForward,
				variants: swapVariantsMap[direction],
				initial: "enter" as const,
				animate: "center" as const,
				exit: "exit" as const,
			}
		: {
				initial: isVertical
					? { y: isForward ? "100%" : "-100%", opacity: 0 }
					: { x: isForward ? "50px" : "-50px", opacity: 0 },
				animate: isVertical ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 },
				exit: isVertical
					? { y: isForward ? "-100%" : "100%", opacity: 0 }
					: { x: isForward ? "-50px" : "50px", opacity: 0 },
			}

	const animatedContent = (
		<>
			{/* Icon */}
			<AnimatePresence
				mode="popLayout"
				initial={false}
				custom={isSwap ? isForward : undefined}
			>
				{iconContent && (
					<motion.span
						data-slot="icon"
						key={state}
						className="shrink-0"
						{...iconAnimationProps}
					>
						{iconContent}
					</motion.span>
				)}
			</AnimatePresence>

			{/* Text */}
			<AnimatePresence
				mode="popLayout"
				initial={false}
				custom={isSwap ? isForward : undefined}
			>
				{textContent && (
					<motion.span
						data-slot="text"
						key={state}
						onAnimationStart={() => onAnimatingChange?.(true)}
						onAnimationComplete={() => onAnimatingChange?.(false)}
						className="line-clamp-1"
						{...textAnimationProps}
					>
						{textContent}
					</motion.span>
				)}
			</AnimatePresence>
		</>
	)

	return (
		<MotionConfig transition={isSwap ? swapTransition : slideTransition}>
			{fixedWidthAlign ? (
				<span
					data-content-type={contentType}
					data-fixed-width
					className={cn(
						"relative inline-grid *:[grid-area:1/1] [gap:inherit] h-full [clip-path:inset(calc(var(--spacing)*var(--padding)*-1))] **:data-[slot=icon]:aspect-auto!",
						className
					)}
					{...rest}
				>
					{allStates?.map(s => (
						<span
							key={s.name}
							aria-hidden="true"
							className="invisible flex items-center [gap:inherit]"
						>
							{s.iconContent && (
								<span data-slot="icon" className="shrink-0">
									{s.iconContent}
								</span>
							)}
							{s.textContent && (
								<span data-slot="text" className="line-clamp-1">
									{s.textContent}
								</span>
							)}
						</span>
					))}

					<span
						className={cn(
							"flex items-center [gap:inherit]",
							fixedWidthAlign === "center" && "justify-center"
						)}
					>
						{animatedContent}
					</span>
				</span>
			) : (
				<span
					data-content-type={contentType}
					className={cn(
						"relative flex items-center h-full [gap:inherit] [clip-path:inset(calc(var(--spacing)*var(--padding)*-1))]",
						className
					)}
					{...rest}
				>
					{animatedContent}
				</span>
			)}
		</MotionConfig>
	)
}

export const StateTransition: React.FC<StateTransitionProps> & {
	State: typeof State
} = Object.assign(StateTransitionRoot, {
	State,
})
