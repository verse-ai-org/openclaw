import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ErrorCallout({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-3">
      <AlertCircle className="size-4" />
      <AlertDescription className="text-xs break-words">{message}</AlertDescription>
    </Alert>
  );
}
