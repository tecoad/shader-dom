import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import { Floodlines } from "@/components/floodlines"
import { SHADERS } from "@/lib/shaders"
import { cn } from "@/lib/utils"

interface ShaderSelectorProps {
	shader: string
	onShaderChange: (shader: string) => void
}

export function ShaderSelector({
	shader,
	onShaderChange,
}: ShaderSelectorProps) {
	return (
		<Floodlines className="[--line-color:var(--color-base-3)]">
			<RadioGroup
				value={shader}
				onValueChange={v => onShaderChange(v as string)}
				className="inline-flex items-center gap-1 bg-base-2 rounded-none p-1.5 h-12 max-w-full overflow-x-auto snap-x snap-mandatory hide-scrollbar"
			>
				{Object.entries(SHADERS).map(([key, { name }]) => {
					const selected = shader === key
					return (
						<label
							key={key}
							data-selected={selected || undefined}
							className={cn(
								"snap-start scroll-ml-1 shrink-0 cursor-pointer select-none",
								"inline-flex items-center justify-center whitespace-nowrap",
								"h-[calc(100%-1px)] rounded-md px-2.5 text-base font-medium transition-all",
								"text-base-11 hover:text-base-12 border border-transparent",
								"data-[selected]:bg-base-1 data-[selected]:text-base-12 data-[selected]:shadow-sm",
								"dark:data-[selected]:border-base-a7 dark:data-[selected]:bg-base-a3",
								"outline-none focus-visible:ring-[3px] focus-visible:ring-base-a5"
							)}
						>
							<Radio.Root value={key} className="sr-only" />
							{name}
						</label>
					)
				})}
			</RadioGroup>
		</Floodlines>
	)
}
