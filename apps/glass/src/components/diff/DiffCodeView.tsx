/* oxlint-disable eslint/no-restricted-imports -- Glass's single styled adapter around Pierre's raw viewer; the rule's StyledDiffCodeView lives in apps/web. */
import { CodeView, type ControlledCodeViewProps } from "@pierre/diffs/react";
/* oxlint-enable eslint/no-restricted-imports */

import { DiffWorkerPoolProvider, PREFERRED_HIGHLIGHTER, diffThemeName } from "./DiffWorkerPool";
import { useDocumentTheme } from "./useDocumentTheme";

type DiffCodeViewProps = Omit<ControlledCodeViewProps<undefined>, "options"> & {
  readonly options: Omit<
    NonNullable<ControlledCodeViewProps<undefined>["options"]>,
    "unsafeCSS" | "itemMetrics" | "layout" | "theme" | "themeType" | "preferredHighlighter"
  >;
};

/** Pierre's virtualized multi-file viewer, styled for glass and fed by the shared worker pool. */
export function DiffCodeView({ options, className, ...props }: DiffCodeViewProps) {
  const theme = useDocumentTheme();
  return (
    <DiffWorkerPoolProvider>
      <CodeView
        {...props}
        className={`outline-none ${className ?? ""}`}
        options={{
          ...options,
          theme: diffThemeName(theme),
          themeType: theme,
          preferredHighlighter: PREFERRED_HIGHLIGHTER,
          unsafeCSS: GLASS_DIFF_CSS,
          itemMetrics: {
            diffHeaderHeight: 32,
            hunkSeparatorHeight: 24,
            spacing: 0,
            paddingTop: 0,
            // Pierre paints 8px under each expanded file's last line; count it
            // or the end of the list sits past the reachable scroll range.
            paddingBottom: 8,
          },
          layout: { paddingTop: 0, paddingBottom: 0, gap: 0 },
        }}
      />
    </DiffWorkerPoolProvider>
  );
}

// Pierre renders inside a shadow root, so app styling reaches it only through
// this stylesheet and inherited custom properties. The code surface is
// transparent so the glass pane shows through; line tints mix against it.
const GLASS_DIFF_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-header-font-family: var(--font-sans) !important;
  --diffs-font-family: var(--font-mono) !important;
  --diffs-bg: transparent !important;
  --diffs-light-bg: transparent !important;
  --diffs-dark-bg: transparent !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-bg-context-override: color-mix(in srgb, transparent 97%, var(--fg));
  --diffs-bg-hover-override: color-mix(in srgb, transparent 94%, var(--fg));
  --diffs-bg-separator-override: color-mix(in srgb, transparent 96%, var(--fg));
  --diffs-bg-buffer-override: color-mix(in srgb, transparent 92%, var(--fg));
  --diffs-bg-addition-override: color-mix(in srgb, transparent 86%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, transparent 80%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, transparent 78%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, transparent 70%, var(--success));
  --diffs-bg-deletion-override: color-mix(in srgb, transparent 86%, var(--danger));
  --diffs-bg-deletion-number-override: color-mix(in srgb, transparent 80%, var(--danger));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, transparent 78%, var(--danger));
  --diffs-bg-deletion-emphasis-override: color-mix(in srgb, transparent 70%, var(--danger));
  background-color: transparent !important;
  color: var(--fg) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: color-mix(in oklab, var(--surface) 94%, transparent) !important;
  backdrop-filter: blur(16px);
  border-bottom-color: transparent !important;
  box-shadow: inset 0 -1px var(--line);
  align-items: center !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  line-height: 1 !important;
  min-height: 32px !important;
  padding-block: 6px !important;
  padding-inline: 6px 12px !important;
  cursor: default;
}

[data-diffs-header]:hover {
  background-color: color-mix(in oklab, var(--surface-raised) 96%, transparent) !important;
}

[data-diffs-header] [data-header-content] {
  align-items: center !important;
  line-height: 1 !important;
}

[data-diffs-header] :is([data-title], [data-prev-name]) {
  line-height: 16px !important;
  color: var(--fg) !important;
}

[data-diffs-header] [data-prev-name] {
  color: var(--fg-muted) !important;
}

[data-diffs-header] [data-metadata] {
  align-items: center !important;
  line-height: 1 !important;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count],
[data-diffs-header] [data-deletions-count] {
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  font-variant-numeric: tabular-nums;
}

[data-diffs-header] [data-additions-count] { color: var(--success) !important; }
[data-diffs-header] [data-deletions-count] { color: var(--danger) !important; }

:is([data-separator="line-info"], [data-separator="line-info-basic"]) {
  height: 24px !important;
  margin-block: 0 !important;
  background-color: transparent !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]) [data-separator-wrapper],
:is([data-separator="line-info"], [data-separator="line-info-basic"]) [data-separator-content] {
  background-color: transparent !important;
  color: var(--fg-faint) !important;
  font-family: var(--font-sans) !important;
  font-size: 11px !important;
  text-decoration: none !important;
}

:is([data-separator="line-info"], [data-separator="line-info-basic"]):hover [data-separator-content] {
  color: var(--fg-muted) !important;
}

/* Expanding a file mounts its body at once. Fade it in; Pierre owns geometry,
   so height cannot animate without fighting the virtualizer. */
[data-diff],
[data-file] {
  transition: opacity 180ms ease-out;
}

@starting-style {
  [data-diff],
  [data-file] {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-diff],
  [data-file] {
    transition: none;
  }
}
`;
