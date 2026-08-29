/**
 * ClaudeSkills — filesystem discovery of Claude Code skills for the `$` picker.
 *
 * Claude Code loads skills from `<config dir>/skills` (user scope), then
 * `<cwd>/.agents/skills` and `<cwd>/.claude/skills` (project scope), one
 * directory per skill with a `SKILL.md` carrying YAML frontmatter. Later roots
 * win on name collisions, so precedence is user, `.agents`, then `.claude`.
 * The Agent SDK init handshake surfaces skills only as slash commands without
 * their filesystem paths, so the provider snapshot scans the same locations
 * directly, mirroring how the Codex app-server reports its skills.
 *
 * @module provider/Drivers/ClaudeSkills
 */
import * as NodeOS from "node:os";

import type { ClaudeSettings, ServerProviderSkill } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { fromYaml } from "@t3tools/shared/schemaYaml";

import { expandHomePath } from "../../pathExpansion.ts";

type ClaudeSkillScope = "user" | "project";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

const ClaudeSkillFrontmatter = fromYaml(
  Schema.Struct({
    name: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    "user-invocable": Schema.optional(Schema.Boolean),
  }),
);
const decodeClaudeSkillFrontmatter = Schema.decodeUnknownOption(ClaudeSkillFrontmatter);
const decodeClaudeSkillFrontmatterRecord = Schema.decodeUnknownOption(
  fromYaml(Schema.Record(Schema.String, Schema.Unknown)),
);

const UNSUPPORTED_FALLBACK_FIELDS = [
  "allowed-tools",
  "disallowed-tools",
  "model",
  "context",
  "agent",
  "background",
  "hooks",
  "arguments",
] as const;

type SkillFrontmatter =
  | { readonly kind: "missing" }
  | { readonly kind: "malformed" }
  | {
      readonly kind: "parsed";
      readonly name?: string;
      readonly description?: string;
      readonly userInvocable: boolean;
    };

function parseSkillFrontmatter(contents: string): SkillFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) {
    return { kind: "missing" };
  }

  const parsed = Option.getOrUndefined(decodeClaudeSkillFrontmatter(match[1] ?? ""));
  if (!parsed) {
    return { kind: "malformed" };
  }

  const name = parsed.name?.trim() ?? "";
  const description = parsed.description?.trim() ?? "";
  return {
    kind: "parsed",
    userInvocable: parsed["user-invocable"] !== false,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };
}

function splitClaudeSkillArguments(value: string): ReadonlyArray<string> {
  const arguments_: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (current.length > 0) {
        arguments_.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  if (current.length > 0) arguments_.push(current);
  return arguments_;
}

export type PreparedClaudeSkillContents =
  | { readonly kind: "prepared"; readonly contents: string }
  | { readonly kind: "malformed" }
  | { readonly kind: "unsupported"; readonly fields: ReadonlyArray<string> };

/**
 * Prepares a Claude skill for providers that cannot ask Claude Code to invoke
 * it natively. Argument placeholders are expanded; runtime-only frontmatter
 * is rejected so the fallback never silently weakens a skill's contract.
 */
export function prepareClaudeSkillContents(
  contents: string,
  argumentsText: string,
): PreparedClaudeSkillContents {
  const match = FRONTMATTER_PATTERN.exec(contents);
  const body = match ? contents.slice(match[0].length).trimStart() : contents;
  if (match) {
    const frontmatter = Option.getOrUndefined(decodeClaudeSkillFrontmatterRecord(match[1] ?? ""));
    if (!frontmatter) return { kind: "malformed" };
    const fields = UNSUPPORTED_FALLBACK_FIELDS.filter((field) => frontmatter[field] !== undefined);
    if (fields.length > 0) return { kind: "unsupported", fields };
  }

  const positionalArguments = splitClaudeSkillArguments(argumentsText);
  let substituted = false;
  const prepared = body.replace(
    /(\\*)\$(?:ARGUMENTS(?:\[(\d+)\])?|(\d+))/g,
    (token, backslashes: string, indexed: string | undefined, shorthand: string | undefined) => {
      const placeholder = token.slice(backslashes.length);
      if (backslashes.length === 1) return placeholder;
      substituted = true;
      const index = indexed ?? shorthand;
      const replacement =
        index === undefined ? argumentsText : (positionalArguments[Number(index)] ?? placeholder);
      return `${backslashes}${replacement}`;
    },
  );
  return {
    kind: "prepared",
    contents:
      !substituted && argumentsText.length > 0
        ? `${prepared.trimEnd()}\n\nARGUMENTS: ${argumentsText}`
        : prepared,
  };
}

/**
 * Resolve the Claude config directory the CLI would use, matching the
 * precedence the spawned CLI sees: the instance's `homePath` (exported as
 * `CLAUDE_CONFIG_DIR` by `makeClaudeEnvironment`), then a `CLAUDE_CONFIG_DIR`
 * already present in the process environment, then `~/.claude`.
 */
const resolveClaudeConfigDirPath = Effect.fn("resolveClaudeConfigDirPath")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  environment: NodeJS.ProcessEnv,
  cwd?: string,
): Effect.fn.Return<string, never, Path.Path> {
  const path = yield* Path.Path;
  const homePath = config.homePath.trim();
  if (homePath.length > 0) {
    return path.resolve(expandHomePath(homePath));
  }
  // No tilde expansion here: the spawned CLI receives this env var verbatim
  // (env vars are never shell-expanded), so a literal `~` must stay literal
  // for discovery to scan the same directory the runtime would. A relative
  // value is resolved against the workspace cwd — the subprocess's own cwd —
  // for the same reason.
  const environmentConfigDir = environment.CLAUDE_CONFIG_DIR?.trim() ?? "";
  if (environmentConfigDir.length > 0) {
    return cwd ? path.resolve(cwd, environmentConfigDir) : path.resolve(environmentConfigDir);
  }
  return path.join(NodeOS.homedir(), ".claude");
});

/**
 * Enumerate Claude Code skills from the user config dir, workspace
 * `.agents/skills`, and workspace `.claude/skills`, in that order. Discovery
 * is best-effort: unreadable roots and malformed skill entries are skipped so
 * a broken skill never degrades the provider snapshot. On name collisions,
 * later roots win: `.agents` beats user and `.claude` beats `.agents`, matching
 * Claude Code's resolution.
 */
export const discoverClaudeSkills = Effect.fn("discoverClaudeSkills")(function* (
  config: Pick<ClaudeSettings, "homePath">,
  cwd?: string,
  environment?: NodeJS.ProcessEnv,
): Effect.fn.Return<ReadonlyArray<ServerProviderSkill>, never, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configDirPath = yield* resolveClaudeConfigDirPath(config, environment ?? process.env, cwd);

  const roots: ReadonlyArray<{ directory: string; scope: ClaudeSkillScope }> = [
    { directory: path.join(configDirPath, "skills"), scope: "user" },
    ...(cwd
      ? [
          { directory: path.join(cwd, ".agents", "skills"), scope: "project" as const },
          { directory: path.join(cwd, ".claude", "skills"), scope: "project" as const },
        ]
      : []),
  ];

  const skillsByName = new Map<string, ServerProviderSkill>();
  for (const root of roots) {
    const entries = yield* fileSystem
      .readDirectory(root.directory)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

    for (const entry of [...entries].sort()) {
      const skillPath = path.join(root.directory, entry, "SKILL.md");
      const contents = yield* fileSystem
        .readFileString(skillPath)
        .pipe(Effect.orElseSucceed(() => undefined));
      if (contents === undefined) {
        continue;
      }

      const frontmatter = parseSkillFrontmatter(contents);
      // Malformed frontmatter means the skill won't load in Claude Code
      // either — skip it rather than surfacing a broken entry under its
      // directory name.
      if (frontmatter.kind === "malformed") {
        continue;
      }
      if (frontmatter.kind === "parsed" && !frontmatter.userInvocable) {
        continue;
      }

      const name = (frontmatter.kind === "parsed" ? frontmatter.name : undefined) ?? entry.trim();
      if (!name) {
        continue;
      }

      skillsByName.set(name, {
        name,
        path: skillPath,
        enabled: true,
        scope: root.scope,
        ...(frontmatter.kind === "parsed" && frontmatter.description
          ? { description: frontmatter.description }
          : {}),
      });
    }
  }

  return [...skillsByName.values()].sort((left, right) => left.name.localeCompare(right.name));
});
