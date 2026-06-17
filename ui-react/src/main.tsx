import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installDevAuthMock } from "@/lib/auth/dev-auth-mock";
import { useProviderCatalogStore } from "@/store/provider-catalog.store";
import "./index.css";

installDevAuthMock();

// Hydrate the provider catalog from cache and refresh from bossim-service.
void useProviderCatalogStore.getState().init();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(<App />);
