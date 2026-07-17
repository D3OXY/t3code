# Better Sidebar Prototype — Design Reference

## Status

- Throwaway UI prototype using curated mock data.
- Keep only the split-navigator direction. Earlier variants are rejected.
- Prototype URL: `/?prototype=better-sidebar`.

## Information architecture

- Threads are grouped under projects.
- A narrow project rail switches between Focus and individual projects.
- Focus aggregates important threads across every project.
- Individual project views show that project's threads; grouped rail entries show combined member-project threads.
- Old, irrelevant work stays accessible without being visually prominent.
- The project rail and divider stretch through the full content height to the footer.
- Project and thread lists scroll independently without scroll chaining.
- Focus and Archived stay pinned in the project rail.
- New thread stays pinned above the thread list.
- The project rail remains scrollable, but its scrollbar is hidden.

## Priority and status rules

Priority order:

1. Approval required.
2. Waiting for user input.
3. Plan ready.
4. Failed.
5. Completed but not viewed.
6. Running or starting.
7. Interrupted or recent inactive.
8. Older.

Completed-but-not-viewed is derived from the latest completed turn being newer than the thread's last-visited timestamp.

Available app data:

- Pending approval, pending user input, and actionable proposed-plan flags.
- Session states: idle, starting, running, ready, interrupted, stopped, and error.
- Latest-turn states: running, interrupted, completed, and error.
- Thread activity timestamps and locally stored last-visited timestamps.
- There is no persisted quiet or inactive signal; those states are derived.

## Recent and Older

- Needs you, Failed, Completed, Working, and Recent are separate project sections.
- Error threads appear under **Failed**, below Needs you and above Completed and Working.
- Starting/Connecting threads appear under **Working** while retaining their row-level label.
- Interrupted threads appear under **Recent** while retaining their row-level label.
- Completed threads remain under **Completed** regardless of age, until their status changes.
- **Recent** contains interrupted threads and inactive threads newer than the configured folding threshold.
- **Inactive** means a thread has none of the actionable, running, plan-ready, or unseen-completion states above.
- **Older** means inactive and last activity reached the configured folding threshold.
- Older is collapsed by default when a project has newer threads.
- Older is expanded by default when every thread in the project is Older.
- Older always remains manually accessible.

## Actions and navigation

- Replace the Focus heading/summary area with a prominent **New thread** button.
- Every project view has the same button with project context, such as “in t3code.”
- Archived is an icon pinned to the bottom of the project rail.
- Non-working thread rows reveal Archive on hover/focus; the first activation changes it to Confirm, and confirmation archives the thread.
- Leaving the row or moving focus outside cancels archive confirmation.
- Settings remains in the footer.
- The sidebar-options trigger sits beside, but outside, the search field in its own background.

## Sidebar options

- Project sorting remains configurable: Last user message, Created at, or Manual.
- Project grouping remains configurable: repository, repository path, or separate.
- Grouped physical projects collapse into one logical project-rail entry; selecting it shows their combined threads.
- Repository grouping mirrors the production logical-project model: one representative rail entry retains all physical member projects across local, sandbox, and remote environments.
- Thread sorting remains configurable: Last user message or Created at.
- Thread layout is configurable as **Grouped** or **Ungrouped**.
- Grouped layout uses the status sections defined above; the selected thread sort applies within each section.
- Ungrouped layout uses one thread list ordered by the selected thread sort, while preserving status labels.
- Inactive threads can be folded after an adjustable number of days; default is 3 days.
- The threshold supports 1–30 days.
- Older folding can be disabled entirely.
- Folded threads remain accessible through the Older disclosure.
- Do not limit the number of visible threads; overflow is handled by scrolling and Older folding.

## Branding and presentation

- Reuse the actual production T3 Code sidebar branding component.
- Do not recreate or approximate the logo, Code label, or stage badge.
- Project rail badges indicate attention or completed work.
- Project badge precedence is Failed, needs-input/action, then completed.
- Every project tile has a subtle background so its hit area remains legible.
- The active project uses a restrained foreground ring and small offset.
- Project status indicators sit at the tile's outer top-right without clipping.
- Reuse the shared production Tooltip components for project-rail hover details.
- Individual-project tooltips show project name, environment, and workspace path.
- Grouped-project tooltips show the logical group name, member count, and every member as environment plus workspace path.
- Needs-input threads must be immediately distinguishable and highest priority.
- Completed-but-unviewed threads must be easy to identify.
- Thread status icons are vertically centered against the complete two-line row.
- Thread titles, timestamps, project names, and status labels truncate instead of wrapping.
- Truncated thread titles use the shared tooltip on hover/focus.
- Thread rows can show PR state, worktree, running-terminal, discovered-port, and remote-environment indicators with tooltips.
- Double-clicking a thread title/row starts inline rename; Enter or blur commits and Escape cancels.
- Thread context menus expose Rename, Mark unread, Copy Path, Copy Thread ID, and Delete.
- Multi-select is omitted from this prototype; production currently uses it only for bulk Mark unread and Delete.
- Dense, utilitarian hierarchy; status is communicated through ordering, labels, and restrained color.

## Prototype data

- Use mock data only while validating this direction.
- Include enough projects and threads to exercise both independent scroll regions.
- Keep the distribution realistic: only occasional projects need action or contain unseen completions.
- Cover approval, user input, plan ready, connecting, working, failed, completed, interrupted, recent inactive, and older inactive states.
- Include long titles and project names to verify truncation.
- Include completed threads older than the configured threshold to verify they remain under Completed.
- Keep at least one project whose every thread is Older to verify default expansion.

## Production follow-up

- Replace mock projects and threads with existing sidebar project snapshots and thread shells.
- Derive Recent and Older from actual state and last-activity timestamps.
- Persist project sort/grouping, thread sort/layout, folding enabled state, and folding threshold as sidebar preferences.
- Wire New thread buttons to the existing project-aware thread creation flow.
- Preserve current sidebar resizing, keyboard navigation, mobile behavior, context menus, and thread actions.
