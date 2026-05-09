import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EntityDiff } from "@/components/EntityDiff";

export type ConflictDialogProps<T extends object> = {
  open: boolean;
  resourceLabel: string;
  mine: T;
  theirs: T;
  onDiscard: () => void;
  onOverwrite: () => void;
};

export function ConflictDialog<T extends object>({
  open,
  resourceLabel,
  mine,
  theirs,
  onDiscard,
  onOverwrite,
}: ConflictDialogProps<T>) {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setShowDiff(false);
          onDiscard();
        }
      }}
      title="Conflict"
      description={`${resourceLabel} was changed in another tab while you were editing.`}
      width={720}
    >
      <div className="space-y-4">
        {!showDiff ? (
          <p className="text-sm text-text-secondary">
            Choose whether to keep your version, load the version from storage, or compare the two.
          </p>
        ) : (
          <EntityDiff
            left={mine as Record<string, unknown>}
            right={theirs as Record<string, unknown>}
            leftTitle="Your tab"
            rightTitle="Other tab (storage)"
          />
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          {!showDiff && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDiff(true)}
            >
              Show diff
            </Button>
          )}
          {showDiff && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDiff(false)}
            >
              Hide diff
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onDiscard}>
            Discard my changes
          </Button>
          <Button
            type="button"
            variant="brand"
            onClick={() => {
              setShowDiff(false);
              onOverwrite();
            }}
          >
            Overwrite
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
