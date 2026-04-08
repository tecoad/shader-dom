import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // shader-dom needs access to ShaderContext (not in shaders/react public exports)
      "shaders/dist/react/Shader.js": new URL(
        "./node_modules/shaders/dist/react/Shader.js",
        import.meta.url,
      ).pathname,
    },
  },
})
