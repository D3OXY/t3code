import {
  MessageId,
  PlanId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { buildTranscriptRows, createTranscriptRowsBuilder } from "./transcriptRows";

const threadId = ThreadId.make("thread-1");
const now = DateTime.makeUnsafe("2026-06-20T00:00:00.000Z");
let ordinal = 0;

function base(id: string) {
  return {
    id: TurnItemId.make(id),
    threadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: ordinal++,
    status: "completed" as const,
    title: null,
    startedAt: now,
    completedAt: now,
    updatedAt: now,
  };
}

function projected(
  item: OrchestrationV2ProjectedTurnItem["item"],
): OrchestrationV2ProjectedTurnItem {
  return {
    position: 0,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: item.id,
    item,
  };
}

const user = (id: string, messageId = id) =>
  projected({
    ...base(id),
    type: "user_message",
    messageId: MessageId.make(messageId),
    createdBy: "user",
    creationSource: "web",
    inputIntent: "turn_start",
    text: "hi",
    attachments: [],
  });
const assistant = (id: string, text = "ok") =>
  projected({
    ...base(id),
    type: "assistant_message",
    messageId: MessageId.make(id),
    text,
    streaming: false,
  });
const reasoning = (id: string) =>
  projected({ ...base(id), type: "reasoning", text: "hmm", streaming: false });
const command = (id: string) => projected({ ...base(id), type: "command_execution", input: "ls" });
const todo = (id: string) =>
  projected({ ...base(id), type: "todo_list", planId: PlanId.make("plan-1"), steps: [] });

const shape = (items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>) =>
  buildTranscriptRows(items).map((row) =>
    row.kind === "tools"
      ? `tools(${row.rows.map((entry) => entry.item.id).join(",")})`
      : row.row.item.id,
  );

describe("buildTranscriptRows", () => {
  it("folds consecutive tool work and the reasoning between it into one group", () => {
    expect(
      shape([
        user("u1"),
        reasoning("r1"),
        command("c1"),
        reasoning("r2"),
        command("c2"),
        assistant("a1"),
      ]),
    ).toEqual(["u1", "tools(r1,c1,r2,c2)", "a1"]);
  });

  it("keeps reasoning with no tool work around it as its own row", () => {
    expect(shape([user("u1"), reasoning("r1"), assistant("a1")])).toEqual(["u1", "r1", "a1"]);
  });

  it("splits tool runs at messages and skips composer-owned items", () => {
    expect(
      shape([command("c1"), todo("t1"), command("c2"), assistant("a1"), command("c3")]),
    ).toEqual(["tools(c1,c2)", "a1", "tools(c3)"]);
  });

  it("hides the echo message of an answered question", () => {
    const question = projected({
      ...base("q1"),
      type: "user_input_request",
      requestId: RuntimeRequestId.make("req-1"),
      questions: [],
      questionAnswer: { requestId: "req-1", answers: {}, attachmentsByQuestionId: {} },
    });
    expect(shape([question, user("u2", "async-answer:req-1")])).toEqual(["q1"]);
  });
});

describe("createTranscriptRowsBuilder", () => {
  it("reuses unchanged rows so only the streamed row is new", () => {
    const build = createTranscriptRowsBuilder();
    const items = [user("u1"), command("c1"), assistant("a1", "par")];
    const first = build(items);
    const second = build([items[0]!, items[1]!, assistant("a1", "partial")]);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).not.toBe(first[2]);
  });

  it("rebuilds a group when a tool joins it, keeping its id", () => {
    const build = createTranscriptRowsBuilder();
    const c1 = command("c1");
    const first = build([c1]);
    const second = build([c1, command("c2")]);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.id).toBe(first[0]?.id);
  });
});
