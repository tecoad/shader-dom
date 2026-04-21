import { defineConfig } from "tsup"

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/shaders/index.ts",
		"src/presets/liquid/index.ts",
	],
	format: ["esm"],
	dts: true,
	outDir: "dist",
	clean: true,
})
