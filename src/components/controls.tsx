import NumberFlow from "@number-flow/react"
import { Button } from "@/components/button"
import { MorphTransition } from "@/components/morph-transition"
import { Spinner } from "@/components/spinner"

interface ControlsProps {
	isLive: boolean
	snapshotMs: number
	onToggleLive: () => void
}

export function Controls({ isLive, snapshotMs, onToggleLive }: ControlsProps) {
	return (
		<div className="flex gap-3 items-center justify-center">
			<Button size="lg" variant="outline" onClick={onToggleLive}>
				<MorphTransition fixedWidth="center" state={isLive ? "live" : "paused"}>
					<MorphTransition.State name="live">
						<Spinner strokeWidth={2} />
						Live
					</MorphTransition.State>
					<MorphTransition.State name="paused">Paused</MorphTransition.State>
				</MorphTransition>
			</Button>
			<Button size="lg" variant="solid" disabled>
				Snapshot
				<NumberFlow
					data-slot="icon"
					className="w-18 tabular-nums text-xs text-base-contrast opacity-80 font-mono"
					value={Number(snapshotMs.toFixed(1))}
					format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
					suffix=" ms"
					willChange
				/>
			</Button>
		</div>
	)
}
