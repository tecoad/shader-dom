import { cn } from "@/lib/utils"

interface SpinnerProps {
	className?: string
	strokeWidth?: number
}

export const Spinner = ({ className, strokeWidth = 3 }: SpinnerProps) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			className={cn("h-4 w-4 animate-spin animation-duration-[0.4s]", className)}
		>
			<circle
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				opacity=".25"
			/>
			<path
				d="M12 2a10 10 0 0 1 10 10"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
			/>
		</svg>
	)
}
