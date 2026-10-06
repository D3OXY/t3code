import {
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
} from "lucide-react";

/**
 * Glass's only module allowed to name lucide's pull-request glyphs (see the
 * lint allowlist in vite.config.ts). Pick a glyph by meaning, matching
 * apps/web's PullRequestGlyph so both clients draw pull requests the same way.
 */
export const PullRequestGlyph = {
  pullRequest: GitPullRequestArrowIcon,
  draft: GitPullRequestDraftIcon,
  closed: GitPullRequestClosedIcon,
  merged: GitMergeIcon,
} as const;
