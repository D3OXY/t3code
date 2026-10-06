import { describe, expect, it } from "vite-plus/test";

import {
  hasUnseenCompletion,
  resolveSessionStatus,
  sortSessionsByAttention,
  type SessionStatus,
} from "./sessions";

const idleShell = {
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  runtime: null,
};

describe("hasUnseenCompletion", () => {
  it("is unread only when the run completed after the last visit", () => {
    const latestRun = { completedAt: "2026-10-06T10:00:00.000Z" };
    expect(hasUnseenCompletion({ latestRun, lastVisitedAt: "2026-10-06T09:00:00.000Z" })).toBe(
      true,
    );
    expect(hasUnseenCompletion({ latestRun, lastVisitedAt: "2026-10-06T11:00:00.000Z" })).toBe(
      false,
    );
  });

  it("treats never-visited and still-running threads as read", () => {
    expect(
      hasUnseenCompletion({
        latestRun: { completedAt: "2026-10-06T10:00:00.000Z" },
        lastVisitedAt: null,
      }),
    ).toBe(false);
    expect(
      hasUnseenCompletion({
        latestRun: { completedAt: null },
        lastVisitedAt: "2026-10-06T09:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("resolveSessionStatus", () => {
  it("puts a blocked agent ahead of its running state", () => {
    const runtime = { status: "running" as const, lastErrorClass: null };
    expect(resolveSessionStatus({ ...idleShell, runtime, hasPendingApprovals: true }, false)).toBe(
      "approval",
    );
    expect(resolveSessionStatus({ ...idleShell, runtime, hasPendingUserInput: true }, false)).toBe(
      "input",
    );
    expect(resolveSessionStatus({ ...idleShell, runtime }, false)).toBe("working");
  });

  it("separates usage limits from other failures", () => {
    expect(
      resolveSessionStatus(
        { ...idleShell, runtime: { status: "failed", lastErrorClass: "usage_limit" } },
        false,
      ),
    ).toBe("limited");
    expect(
      resolveSessionStatus(
        { ...idleShell, runtime: { status: "failed", lastErrorClass: null } },
        false,
      ),
    ).toBe("failed");
  });

  it("reports finished sessions as done only while unread", () => {
    const runtime = { status: "completed" as const, lastErrorClass: null };
    expect(resolveSessionStatus({ ...idleShell, runtime }, true)).toBe("done");
    expect(resolveSessionStatus({ ...idleShell, runtime }, false)).toBe("idle");
  });
});

describe("sortSessionsByAttention", () => {
  const row = (key: string, status: SessionStatus, activityAt: string) => ({
    key,
    status,
    activityAt,
  });

  it("orders by urgency, then most recent activity", () => {
    const sorted = sortSessionsByAttention([
      row("idle-new", "idle", "2026-10-06T12:00:00.000Z"),
      row("working", "working", "2026-10-06T08:00:00.000Z"),
      row("done", "done", "2026-10-06T09:00:00.000Z"),
      row("approval", "approval", "2026-10-06T07:00:00.000Z"),
      row("idle-old", "idle", "2026-10-06T06:00:00.000Z"),
    ]);
    expect(sorted.map((entry) => entry.key)).toEqual([
      "approval",
      "working",
      "done",
      "idle-new",
      "idle-old",
    ]);
  });
});
