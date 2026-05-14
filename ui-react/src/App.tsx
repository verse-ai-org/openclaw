import { ThemeProvider } from "next-themes";
import { RouterProvider } from "react-router";
import { router } from "@/router";
import { Toaster } from "@/components/ui/sonner";
import { getPersistedAppearance } from "@/store/settings.store";

export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={getPersistedAppearance()}
      enableSystem={false}
      disableTransitionOnChange
    >
      <RouterProvider router={router} />
      <Toaster />
    </ThemeProvider>
  );
}
