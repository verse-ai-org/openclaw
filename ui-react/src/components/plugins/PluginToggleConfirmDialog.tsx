import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PluginToggleConfirmDialog({
  open,
  onOpenChange,
  pluginName,
  enabling,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pluginName: string;
  enabling: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {enabling ? "Enable plugin?" : "Disable plugin?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {enabling
              ? `Enable "${pluginName}"? The gateway will need to restart to load it.`
              : `Disable "${pluginName}"? The gateway will need to restart to unload it.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={enabling ? "default" : "destructive"}
            onClick={onConfirm}
          >
            {enabling ? "Enable" : "Disable"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
