import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Children, isValidElement } from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
	[
		// layout
		"relative whitespace-nowrap flex flex-row items-center justify-center shrink-0",
		"border border-transparent",
		"transition-[box-shadow,outline-width,background-color,color] duration-200",
		"select-none",
		"disabled:opacity-50 disabled:pointer-events-none",
		// icon slot
		"**:data-[slot=icon]:flex **:data-[slot=icon]:items-center **:data-[slot=icon]:justify-center",
		"**:data-[slot=icon]:h-full **:data-[slot=icon]:aspect-square **:data-[slot=icon]:border **:data-[slot=icon]:border-transparent",
		// radius state
		"data-[rounded=true]:rounded-full",
		"data-[rounded=true]:**:data-[slot=icon]:rounded-full",
		// focus
		"focus-visible:outline-2 focus-visible:outline-offset-2",
		// icon only
		"icon-only:aspect-square",
		// fixedWidth transitions handle sizing via grid — don't force square
		"[&:has([data-fixed-width])]:aspect-auto!",
		//
		"p-[calc(var(--spacing)*var(--padding))]",
		"gap-[calc(var(--spacing)*var(--padding)*2)]",
		// icon size
		"with-icon:**:[svg]:size-[calc(var(--spacing)*var(--icon-size))] icon-only:**:[svg]:size-[calc(var(--spacing)*var(--icon-size)*1.2)]",
		// radius
		"rounded-(--radius)",
		"**:data-[slot=icon]:rounded-[calc(var(--radius)-calc(var(--spacing)*var(--padding)))]",
		// extra padding
		"**:data-[slot=text]:first:ps-[calc(var(--spacing)*var(--padding))]",
		"**:data-[slot=text]:last:pe-[calc(var(--spacing)*var(--padding))]",
		"data-[rounded=true]:**:data-[slot=text]:first:ps-[calc(var(--spacing)*var(--padding)*2)]",
		"data-[rounded=true]:**:data-[slot=text]:last:pe-[calc(var(--spacing)*var(--padding)*2)]",
	],
	{
		variants: {
			variant: {
				solid: [
					// base
					"text-base-contrast bg-base-9 hover:bg-base-10",
					// icon
					"with-icon:**:data-[slot=icon]:bg-black-a3",
					"with-icon:**:data-[slot=icon]:border-black-a4",
					// hover
					"not-hover:shadow-[inset_0px_-4px_4px_0px_rgba(255,255,255,0.10)]",
					// active
					"active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.15)]",
				],

				ghost: [
					// base
					"text-base-12",
					// icon
					"with-icon:**:data-[slot=icon]:bg-base-a3",
					// hover
					"hover:bg-base-a3",
					"with-icon:hover:**:data-[slot=icon]:bg-base-1",
					// active
					"active:bg-base-a4",
					"active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]",
				],
				outline: [
					// base
					"outline-0 [&_svg]:pointer-events-none [&_svg]:shrink-0",
					"bg-base-1 border-base-a7 text-base-11",
					// vars
					"[--angle:90deg] [--color:var(--color-base-3)]",
					// ring
					"before:block before:absolute before:-inset-px before:rounded-[inherit] before:padding-mask",
					"before:bg-[linear-gradient(var(--angle),var(--color)_0%,transparent_30%,var(--color)_60%,transparent_100%)]",
					"before:[transition:--color_500ms,--angle_500ms,padding_150ms]",
					"data-[size=xs]:before:p-[2px] data-[size=sm]:before:p-[2.5px] data-[size=default]:before:p-[3px] data-[size=lg]:before:p-[3px]",
					// active
					"data-[size=xs]:active:before:p-0 data-[size=sm]:active:before:p-0 data-[size=default]:active:before:p-0 data-[size=lg]:active:before:p-0",
					// hover
					"hover:[--angle:0deg] hover:[--color:var(--color-base-5)]",
					"hover:text-base-12",
				],
				link: ["text-base-12 underline-offset-4 hover:underline"],
				
			},
			size: {
				xs: ["[--padding:0.6] [--radius:var(--radius-md)] [--icon-size:2.75]", "h-6 text-xs"],
				sm: ["[--padding:0.75] [--radius:var(--radius-md)]  [--icon-size:3]", "h-7 text-xs"],
				default: ["[--padding:0.9] [--radius:var(--radius-lg)] [--icon-size:3.5]", "h-8 text-sm"],
				lg: [
					// vars
					"[--padding:1.2] [--radius:var(--radius-lg)] [--icon-size:4]",
					"h-9 text-base",
				],
			},
		},
		defaultVariants: {
			variant: "solid",
			size: "default",
		},
	}
)

type ButtonProps = ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants> & {
		rounded?: boolean
	}

function Button({
	className,
	variant = "solid",
	size = "default",
	rounded = false,
	children,
	...props
}: ButtonProps) {
	type SlotProps = { "data-slot"?: string }

	const mappedChildren = Children.map(children, child => {
		// wrap strings with text slot
		if (typeof child === "string") {
			return <span data-slot="text">{child}</span>
		}
		// wrap childless elements without data-slot as icon (SVGs, icon components)
		if (
			isValidElement<SlotProps & { children?: React.ReactNode }>(child) &&
			!child.props["data-slot"] &&
			!child.props.children
		) {
			return (
				<span data-slot="icon" aria-hidden="true">
					{child}
				</span>
			)
		}
		return child
	})

	// Detect content type for non-animated (slot-only) children
	const hasIcon = mappedChildren?.some(
		(child: React.ReactNode) =>
			isValidElement<SlotProps>(child) && child.props["data-slot"] === "icon"
	)
	const hasText = mappedChildren?.some(
		(child: React.ReactNode) =>
			isValidElement<SlotProps>(child) && child.props["data-slot"] === "text"
	)
	const hasOther = mappedChildren?.some(
		(child: React.ReactNode) => isValidElement<SlotProps>(child) && !child.props["data-slot"]
	)
	const contentType = !hasOther
		? hasIcon && !hasText
			? "icon-only"
			: hasIcon && hasText
				? "with-icon"
				: undefined
		: undefined

	return (
		<ButtonPrimitive
			data-slot="button"
			data-content-type={contentType}
			data-rounded={rounded}
			data-size={size}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		>
			{mappedChildren}
		</ButtonPrimitive>
	)
}

export { Button, buttonVariants, type ButtonProps }
