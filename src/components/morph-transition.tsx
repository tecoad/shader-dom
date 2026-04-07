import { AnimatePresence, motion, type Transition, type Variants } from "motion/react"
import { useId, useMemo } from "react"
import { classifyState, collectAllStates, State } from "@/lib/slots"
import { cn } from "@/lib/utils"

type TextMorphProps = {
	children: string
	as?: React.ElementType
	className?: string
	style?: React.CSSProperties
	variants?: Variants
	transition?: Transition
} & Omit<React.ComponentPropsWithoutRef<"span">, "children" | "className" | "style">

function TextMorph({
	children,
	as: Component = "p",
	className,
	style,
	variants,
	transition,
	...rest
}: TextMorphProps) {
	const uniqueId = useId()

	const characters = useMemo(() => {
		const charCounts: Record<string, number> = {}

		return children.split("").map(char => {
			const lowerChar = char.toLowerCase()
			charCounts[lowerChar] = (charCounts[lowerChar] || 0) + 1

			return {
				id: `${uniqueId}-${lowerChar}${charCounts[lowerChar]}`,
				label: char === " " ? "\u00A0" : char,
			}
		})
	}, [children, uniqueId])

	const defaultVariants: Variants = {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
	}

	const defaultTransition: Transition = {
		type: "spring",
		stiffness: 280,
		damping: 18,
		mass: 0.3,
	}

	return (
		<Component className={cn(className)} aria-label={children} style={style} {...rest}>
			<AnimatePresence mode="popLayout" initial={false}>
				{characters.map(character => (
					<motion.span
						key={character.id}
						layoutId={character.id}
						className="inline-block"
						aria-hidden="true"
						initial="initial"
						animate="animate"
						exit="exit"
						variants={variants || defaultVariants}
						transition={transition || defaultTransition}
					>
						{character.label}
					</motion.span>
				))}
			</AnimatePresence>
		</Component>
	)
}

type MorphTransitionProps = Omit<React.ComponentPropsWithoutRef<"span">, "children"> & {
	state: string
	fixedWidth?: boolean | "center" | "start"
	onAnimatingChange?: (isAnimating: boolean) => void
	children: React.ReactNode
}

function MorphTransitionRoot({
	state,
	fixedWidth,
	onAnimatingChange,
	className,
	children,
	...rest
}: MorphTransitionProps) {
	const { iconContent, textContent, contentType } = classifyState(children, state)

	const fixedWidthAlign = fixedWidth === "start" ? "start" : fixedWidth ? "center" : null
	const allStates = fixedWidthAlign ? collectAllStates(children) : null

	const animatedContent = (
		<>
			{/* Icon */}
			<AnimatePresence mode="popLayout" initial={false}>
				{iconContent && (
					<motion.span
						data-slot="icon"
						key={state}
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0, opacity: 0 }}
						onAnimationStart={() => onAnimatingChange?.(true)}
						onAnimationComplete={() => onAnimatingChange?.(false)}
						transition={{
							type: "spring",
							bounce: 0.2,
							duration: 0.4,
						}}
						className="shrink-0"
					>
						{iconContent}
					</motion.span>
				)}
			</AnimatePresence>

			{/* Text — character morph */}
			{textContent && (
				<TextMorph as="span" data-slot="text" className="line-clamp-1">
					{textContent as string}
				</TextMorph>
			)}
		</>
	)

	return fixedWidthAlign ? (
		<span
			data-content-type={contentType}
			data-fixed-width
			className={cn(
				"relative inline-grid *:[grid-area:1/1] [gap:inherit] h-full [clip-path:inset(calc(var(--spacing)*var(--padding)*-1))]",
				className
			)}
			{...rest}
		>
			{allStates?.map(s => (
				<span key={s.name} aria-hidden="true" className="invisible flex items-center [gap:inherit]">
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
		<span data-content-type={contentType} className={cn("contents", className)} {...rest}>
			{animatedContent}
		</span>
	)
}

export const MorphTransition: React.FC<MorphTransitionProps> & {
	State: typeof State
} = Object.assign(MorphTransitionRoot, {
	State,
})
