import { Badge } from "@/components/badge"
import { BaselineHeading } from "@/components/baseline-heading"

const STEPS = [
	"React DOM",
	"Inline Styles",
	"XMLSerializer",
	"SVG foreignObject",
	"Data URI",
	"Canvas 2D",
	"WebGL texImage2D",
	"Fragment Shader",
	"Display",
]

export function PipelineDiagram() {
	return (
		<div>
			<BaselineHeading
				className="mb-6"
				headingClassName="text-3xl font-semibold text-base-12"
			>
				Pipeline
			</BaselineHeading>
			<div className="flex items-center gap-2 flex-wrap text-xs">
				{STEPS.map((step, i) => (
					<span key={step} className="flex items-center gap-2">
						<Badge variant="surface">{step}</Badge>
						{i < STEPS.length - 1 && (
							<span className="text-base-8">&rarr;</span>
						)}
					</span>
				))}
			</div>
		</div>
	)
}
