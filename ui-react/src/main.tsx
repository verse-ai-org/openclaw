import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installDevAuthMock } from "@/lib/auth/dev-auth-mock";
import "./index.css";

installDevAuthMock();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(<App />);
