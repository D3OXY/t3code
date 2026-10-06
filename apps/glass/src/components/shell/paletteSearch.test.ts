import { describe, expect, it } from "vite-plus/test";

import { matchFields, matchToken } from "./paletteSearch";

describe("matchToken", () => {
  it("matches case-insensitively and returns contiguous indices for substrings", () => {
    expect(matchToken("auth", "Fix Authentication")?.indices).toEqual([4, 5, 6, 7]);
  });

  it("prefers an occurrence that starts a word", () => {
    expect(matchToken("auth", "oauth-auth")?.indices).toEqual([6, 7, 8, 9]);
  });

  it("matches scattered subsequences and rejects non-subsequences", () => {
    expect(matchToken("fxa", "fix auth")?.indices).toEqual([0, 2, 4]);
    expect(matchToken("zz", "fix auth")).toBeNull();
  });

  it("ranks substrings above scattered matches and word starts above mid-word", () => {
    const substring = matchToken("cmd", "cmd palette")!.score;
    const scattered = matchToken("cmd", "command")!.score;
    expect(substring).toBeGreaterThan(scattered);
    expect(matchToken("pal", "cmd palette")!.score).toBeGreaterThan(
      matchToken("pal", "opal")!.score,
    );
  });
});

describe("matchFields", () => {
  const fields = (title: string, branch: string) => [
    { text: title, weight: 1 },
    { text: branch, weight: 0.6 },
  ];

  it("matches everything with an empty query", () => {
    expect(matchFields("  ", fields("a", "b"))).toEqual({ score: 0, highlights: [[], []] });
  });

  it("requires every token to match some field and highlights per field", () => {
    const match = matchFields("fix main", fields("Fix redirects", "main"));
    expect(match?.highlights).toEqual([
      [0, 1, 2],
      [0, 1, 2, 3],
    ]);
    expect(matchFields("fix zzz", fields("Fix redirects", "main"))).toBeNull();
  });

  it("weights fields so a title hit outranks the same branch hit", () => {
    const titleHit = matchFields("auth", fields("auth flow", "x"))!.score;
    const branchHit = matchFields("auth", fields("x", "auth flow"))!.score;
    expect(titleHit).toBeGreaterThan(branchHit);
  });
});
