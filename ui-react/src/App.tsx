import { RouterProvider } from "react-router";
import { router } from "@/router";
import { Toaster } from "@/components/ui/sonner";

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}
