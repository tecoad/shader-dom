import { Children, isValidElement } from "react"

type StateProps = {
	name: string
	children: React.ReactNode
}

export function State({ children }: StateProps) {
	return <>{children}</>
}

export function classifyContent(children: React.ReactNode) {
	const childArray = Children.toArray(children)
	let iconContent: React.ReactNode = null
	const textParts: string[] = []

	for (const child of childArray) {
		if (typeof child === "string" || typeof child === "number") {
			textParts.push(String(child))
		} else if (isValidElement<{ children?: React.ReactNode }>(child) && !child.props.children) {
			iconContent = child
		}
	}

	const textContent = textParts.length > 0 ? textParts.join("") : null
	const contentType =
		!textContent && iconContent ? "icon-only" : textContent && iconContent ? "with-icon" : "text"

	return { iconContent, textContent, contentType } as const
}

export function getStateChildren(children: React.ReactNode) {
	return Children.toArray(children).filter(
		(child): child is React.ReactElement<StateProps> =>
			isValidElement(child) && child.type === State
	)
}

export function classifyState(children: React.ReactNode, state: string) {
	const match = getStateChildren(children).find(child => child.props.name === state)
	return classifyContent(match?.props.children)
}

export function collectAllStates(children: React.ReactNode) {
	return getStateChildren(children).map(child => {
		const { iconContent, textContent } = classifyContent(child.props.children)
		return { name: child.props.name, iconContent, textContent }
	})
}
