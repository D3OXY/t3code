import { describe, expect, it } from "vite-plus/test";

import { visibleTerminalIds } from "./terminalTabs";

describe("visibleTerminalIds", () => {
  it("falls back to the default terminal so the panel always has a shell", () => {
    expect(visibleTerminalIds([])).toEqual(["term-1"]);
    expect(
      visibleTerminalIds(["term-1"], { created: [], closed: ["term-1"], active: null }),
    ).toEqual(["term-1"]);
  });

  it("merges server and local terminals in numeric order without duplicates", () => {
    expect(
      visibleTerminalIds(["term-10", "term-2"], {
        created: ["term-2", "term-3"],
        closed: [],
        active: null,
      }),
    ).toEqual(["term-2", "term-3", "term-10"]);
  });

  it("hides terminals closed locally while the server still reports them", () => {
    expect(
      visibleTerminalIds(["term-1", "term-2"], { created: [], closed: ["term-2"], active: null }),
    ).toEqual(["term-1"]);
  });
});
