import { createRoot } from "react-dom/client";
import { SetupWizard } from "@/components/setup-wizard";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(<SetupWizard />);
