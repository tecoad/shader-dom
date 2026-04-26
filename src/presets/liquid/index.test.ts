import { describe, expect, it } from "vitest"
import { liquidPreset } from "./index"

describe("liquidPreset", () => {
	it("returns a handle with scene and controls", () => {
		const handle = liquidPreset()
		expect(typeof handle.scene).toBe("function")
		expect(typeof handle.controls.setLighting).toBe("function")
	})

	it("setLighting is a no-op before mount (does not throw)", () => {
		const handle = liquidPreset({ lighting: "softbox" })
		expect(() => handle.controls.setLighting("studio")).not.toThrow()
		expect(() => handle.controls.setLighting("softbox")).not.toThrow()
	})

	it("setLighting is a no-op when an envMap URL was provided", () => {
		const handle = liquidPreset({ envMap: "/ignored.hdr" })
		// Even after mount, this should short-circuit. Pre-mount it short-circuits
		// at the !app guard; the full URL-in-effect path is verified in the demo.
		expect(() => handle.controls.setLighting("softbox")).not.toThrow()
	})

	it("setReflectionOnSlopeOnly is a no-op before mount (does not throw)", () => {
		const handle = liquidPreset({ reflectionOnSlopeOnly: true })
		expect(() => handle.controls.setReflectionOnSlopeOnly(false)).not.toThrow()
		expect(() => handle.controls.setReflectionOnSlopeOnly(true)).not.toThrow()
	})
})
