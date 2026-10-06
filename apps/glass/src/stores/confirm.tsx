import { create } from "zustand";

import { Button } from "~/components/ui/Button";
import { Dialog, DialogPopup } from "~/components/ui/Dialog";

interface ConfirmRequest {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly danger: boolean;
  readonly resolve: (confirmed: boolean) => void;
}

const useConfirmStore = create<{ readonly request: ConfirmRequest | null }>(() => ({
  request: null,
}));

/** Asks the user to confirm a destructive action. Resolves false on cancel or dismiss. */
export function confirmAction(input: {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().request?.resolve(false);
    useConfirmStore.setState({
      request: {
        title: input.title,
        description: input.description,
        confirmLabel: input.confirmLabel ?? "Confirm",
        danger: input.danger ?? false,
        resolve,
      },
    });
  });
}

/** Mount once near the root. */
export function ConfirmHost() {
  const request = useConfirmStore((state) => state.request);
  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    useConfirmStore.setState({ request: null });
  };
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && settle(false)}>
      {request ? (
        <DialogPopup title={request.title} description={request.description} size="sm">
          <div className="flex justify-end gap-2 p-5 pt-6">
            <Button variant="secondary" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button
              autoFocus
              variant={request.danger ? "danger" : "primary"}
              onClick={() => settle(true)}
            >
              {request.confirmLabel}
            </Button>
          </div>
        </DialogPopup>
      ) : null}
    </Dialog>
  );
}
