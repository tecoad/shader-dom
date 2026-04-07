import NumberFlow from "@number-flow/react"
import { Button } from "@/components/button"
import { StateTransition } from "@/components/state-transition"
import { Spinner } from "./spinner"

interface ControlsProps {
	isLive: boolean
	snapshotMs: number
	onToggleLive: () => void
}

export function Controls({ isLive, snapshotMs, onToggleLive }: ControlsProps) {
	return (
		<div className="flex  gap-3 items-center justify-center">
			<Button size="lg" variant="outline" onClick={onToggleLive}>
				<StateTransition fixedWidth="center" state={isLive ? "live" : "paused"}>
					<StateTransition.State name="live">
						<Spinner />
						Live
					</StateTransition.State>
					<StateTransition.State name="paused">Paused</StateTransition.State>
				</StateTransition>
			</Button>

			<Button size="lg" variant="solid" disabled>
				Snapshot
				<NumberFlow
					data-slot="icon"
					className="w-18 aspect-auto overflow-hidden tabular-nums text-xs text-base-contrast opacity-80 font-mono"
					value={Number(snapshotMs.toFixed(1))}
					format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
					suffix=" ms"
					willChange
				/>
			</Button>
		</div>
	)
}
