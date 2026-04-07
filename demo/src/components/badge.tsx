import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
	"h-5 gap-1 rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-base-a8 focus-visible:ring-base-a5 focus-visible:ring-[3px] aria-invalid:ring-danger-a4 overflow-hidden group/badge",
	{
		variants: {
			variant: {
				solid: "text-base-contrast bg-base-9 [a]:hover:bg-base-10",
				soft: "text-base-a11 bg-base-a3 [a]:hover:bg-base-a4",
				surface: "text-base-a11 bg-base-surface border-base-a6 [a]:hover:bg-base-a4",
				outline: "text-base-a11 border-base-a8 [a]:hover:bg-base-a3",
			},
		},
		defaultVariants: {
			variant: "solid",
		},
	}
)

function Badge({
	className,
	variant = "solid",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	})
}

export { Badge, badgeVariants }
