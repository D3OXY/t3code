import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { showToast } from "~/stores/toasts";

/** An icon button that copies `text` and confirms with a check for a moment. */
export function CopyButton({
  text,
  label = "Copy",
}: {
  readonly text: string;
  readonly label?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => showToast("Could not copy to the clipboard."),
    );
  };

  return (
    <Tooltip label={copied ? "Copied" : label} side="top">
      <Button size="icon-sm" variant="ghost" aria-label={label} onClick={copy}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </Tooltip>
  );
}
