import { Button } from "@/components/button"
import { StateTransition } from "@/components/state-transition"
import { Spinner } from "./spinner"

interface ControlsProps {
	isLive: boolean
	onToggleLive: () => void
}

export function Controls({ isLive, onToggleLive }: ControlsProps) {
	return (
		<div className="flex gap-3 items-center justify-center">
			<Button size="lg" variant="outline" onClick={onToggleLive}>
				<StateTransition fixedWidth="center" state={isLive ? "live" : "paused"}>
					<StateTransition.State name="live">
						<Spinner />
						Live
					</StateTransition.State>
					<StateTransition.State name="paused">Paused</StateTransition.State>
				</StateTransition>
			</Button>
		</div>
	)
}
