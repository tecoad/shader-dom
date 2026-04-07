import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router"
import App from "./App"
import Demo1 from "./pages/demos/1"
import "./style.css"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route index element={<App />} />
				<Route path="demos/1" element={<Demo1 />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>
)
