import { createRoot } from "react-dom/client";
import { BootSplash } from "@/pages/boot/BootSplash";
import "./index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<BootSplash />);
}
