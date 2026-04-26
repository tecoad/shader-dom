import { createContext, type RefObject } from "react"

export interface ShaderContextValue {
	/**
	 * Register a snapshot canvas from a child HtmlTexture.
	 * Returns an unregister function to call on unmount.
	 *
	 * First registration wins. Subsequent registrations while one is
	 * active log a dev-mode warning and return a no-op unregister.
	 */
	registerSnapshot: (canvas: HTMLCanvasElement) => () => void
	/**
	 * Ref to the WebGL `<canvas>` element rendered by `<Shader>`. Exposed so
	 * descendants (via `useShader()`) can convert viewport pixels into the
	 * shader plane's NDC space without walking the DOM.
	 */
	canvasRef: RefObject<HTMLCanvasElement | null>
	/**
	 * Ref to the positioned ancestor where interactive overlay layers
	 * (selection, caret, escape) are attached.
	 */
	layersContainerRef: RefObject<HTMLElement | null>
	/**
	 * HtmlTexture calls this after every successful snapshot. Shader's
	 * scene path dispatches to subscribed plugins (fragment path ignores).
	 */
	notifySnapshotUpdate: (canvas: HTMLCanvasElement) => void
	/**
	 * Subscribe to snapshot update notifications. Returns an unsubscribe.
	 */
	subscribeSnapshotUpdate: (
		cb: (canvas: HTMLCanvasElement) => void
	) => () => void
}

export const ShaderContext = createContext<ShaderContextValue | null>(null)
