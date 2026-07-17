# Better Sidebar Prototype — Design Reference

## Status

- Throwaway UI prototype using curated mock data.
- Keep only the split-navigator direction. Earlier variants are rejected.
- Prototype URL: `/?prototype=better-sidebar`.

## Information architecture

- Threads are grouped under projects.
- A narrow project rail switches between Focus and individual projects.
- Focus aggregates important threads across every project.
- Project views show only that project's threads.
- Old, irrelevant work stays accessible without being visually prominent.
- The project rail and divider stretch through the full content height to the footer.
- Project and thread lists scroll independently without scroll chaining. Focus and Archived stay pinned in the project rail; New thread stays pinned above the thread list.

## Priority and status rules

Priority order:

1. Approval required.
2. Waiting for user input.
3. Plan ready.
4. Completed but not viewed.
5. Running or starting.
6. Recent inactive.
7. Older.

Completed-but-not-viewed is derived from the latest completed turn being newer than the thread's last-visited timestamp.

The actual app exposes approval, user-input, running/starting, plan-ready, and unseen-completion state. It does not expose a `quiet` signal.

## Recent and Older

- Working, Completed, and Recent are separate project sections.
- Completed threads remain under **Completed** regardless of age, until their status changes.
- **Recent** contains only inactive threads newer than 72 hours.
- **Inactive** means a thread has none of the actionable, running, plan-ready, or unseen-completion states above.
- **Older** means inactive and last activity was at least 72 hours ago.
- Older is collapsed by default when a project has newer threads.
- Older is expanded by default when every thread in the project is Older.
- Older always remains manually accessible.

## Actions and navigation

- Replace the Focus heading/summary area with a prominent **New thread** button.
- Every project view has the same button with project context, such as “in t3code.”
- Archived is an icon pinned to the bottom of the project rail.
- Settings remains in the footer.

## Branding and presentation

- Reuse the actual production T3 Code sidebar branding component.
- Do not recreate or approximate the logo, Code label, or stage badge.
- Project rail badges indicate attention or completed work.
- Needs-input threads must be immediately distinguishable and highest priority.
- Completed-but-unviewed threads must be easy to identify.
- Dense, utilitarian hierarchy; status is communicated through ordering, labels, and restrained color.

## Production follow-up

- Replace mock projects and threads with existing sidebar project snapshots and thread shells.
- Derive Older from actual last-activity timestamps; do not add a persisted `quiet` status.
- Wire New thread buttons to the existing project-aware thread creation flow.
- Preserve current sidebar resizing, keyboard navigation, mobile behavior, context menus, and thread actions.
