import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Route, Routes } from "react-router"
import App from "./App"
import Demo1 from "./pages/demos/1"
import Demo2 from "./pages/demos/2"
import Demo3 from "./pages/demos/3"
import Demo4 from "./pages/demos/4"
import Demo5 from "./pages/demos/5"
import "./style.css"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route index element={<App />} />
				<Route path="demos/1" element={<Demo1 />} />
				<Route path="demos/2" element={<Demo2 />} />
				<Route path="demos/3" element={<Demo3 />} />
				<Route path="demos/4" element={<Demo4 />} />
				<Route path="demos/5" element={<Demo5 />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>
)
