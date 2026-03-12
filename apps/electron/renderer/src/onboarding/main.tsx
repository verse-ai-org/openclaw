import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// 不使用 StrictMode：StrictMode 在开发模式下会双次调用 useEffect，
// 导致 wizard.start 被调用两次，第二次返回 "wizard already running"
createRoot(root).render(<App />);
