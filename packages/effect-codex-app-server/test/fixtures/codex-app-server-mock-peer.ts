import * as NodeOS from "node:os";

let nextServerRequestId = 10_000;
let pendingSkillsListRequestId: number | string | null = null;
let pendingUserInputRequestId: number | null = null;

const writeMessage = (message: unknown) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const respond = (id: number | string, result: unknown) => {
  writeMessage({ id, result });
};

const respondError = (id: number | string, code: number, message: string) => {
  writeMessage({
    id,
    error: {
      code,
      message,
    },
  });
};

const sendRequest = (method: string, params: unknown) => {
  const id = nextServerRequestId++;
  writeMessage({ id, method, params });
  return id;
};

const handleMethod = (message: Record<string, unknown>) => {
  const method = message.method;
  if (typeof method !== "string") {
    return;
  }

  switch (method) {
    case "initialize": {
      // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone mock peer process has no Effect runtime.
      const platform = NodeOS.platform();
      const stderrBytes = Number(process.env.CODEX_APP_SERVER_TEST_STDERR_BYTES ?? 0);
      if (Number.isFinite(stderrBytes) && stderrBytes > 0) {
        process.stderr.write("x".repeat(stderrBytes), () => {
          respond(message.id as number | string, {
            userAgent: "mock-codex-app-server",
            codexHome: process.cwd(),
            platformFamily: platform === "win32" ? "windows" : "unix",
            platformOs: platform === "darwin" ? "macos" : platform,
          });
        });
        return;
      }
      respond(message.id as number | string, {
        userAgent: "mock-codex-app-server",
        codexHome: process.cwd(),
        platformFamily: platform === "win32" ? "windows" : "unix",
        platformOs: platform === "darwin" ? "macos" : platform,
      });
      return;
    }
    case "initialized": {
      // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone mock peer process has no Effect runtime.
      if (process.env.CODEX_APP_SERVER_TEST_DRIFT === "1") {
        // Two notifications the generated bindings cannot decode, standing in
        // for a Codex release whose payloads outgrew them.
        for (let index = 0; index < 2; index += 1) {
          writeMessage({
            method: "item/agentMessage/delta",
            params: {
              delta: index,
              itemId: "item-1",
              threadId: "thread-1",
              turnId: "turn-1",
            },
          });
        }
      }
      writeMessage({
        method: "item/agentMessage/delta",
        params: {
          delta: "Mock server is ready.",
          itemId: "item-1",
          threadId: "thread-1",
          turnId: "turn-1",
        },
      });
      return;
    }
    case "account/read": {
      respond(message.id as number | string, {
        account: {
          type: "chatgpt",
          email: "mock@example.com",
          planType: "plus",
        },
        requiresOpenaiAuth: false,
      });
      return;
    }
    // Replays a resume payload whose history carries a subAgentActivity kind
    // newer than the generated bindings, the shape that made resuming a thread
    // fail outright before responses could be decoded narrowly.
    case "thread/resume": {
      respond(message.id as number | string, {
        cwd: process.cwd(),
        model: "gpt-5.3-codex",
        modelProvider: "openai",
        approvalPolicy: "never",
        approvalsReviewer: "user",
        sandbox: { type: "dangerFullAccess" },
        thread: {
          id: "resumed-thread",
          cliVersion: "0.150.0",
          createdAt: 0,
          updatedAt: 0,
          cwd: process.cwd(),
          ephemeral: false,
          modelProvider: "openai",
          preview: "",
          sessionId: "session-1",
          source: "cli",
          status: { type: "idle" },
          turns: [
            {
              id: "turn-1",
              status: "completed",
              items: [
                {
                  id: "item-18",
                  type: "subAgentActivity",
                  agentPath: "/root/child",
                  agentThreadId: "child-thread",
                  kind: "completed",
                },
              ],
            },
          ],
        },
      });
      return;
    }
    case "skills/list": {
      pendingSkillsListRequestId = message.id as number | string;
      pendingUserInputRequestId = sendRequest("item/tool/requestUserInput", {
        itemId: "item-approval-1",
        threadId: "thread-1",
        turnId: "turn-1",
        questions: [
          {
            id: "approved",
            header: "Approve",
            question: "Continue with the mock skills request?",
            options: [
              {
                label: "yes",
                description: "Approve the request",
              },
            ],
          },
        ],
      });
      return;
    }
    default: {
      if (message.id !== undefined) {
        respondError(message.id as number | string, -32601, `Unhandled request: ${method}`);
      }
    }
  }
};

const handleResponse = (message: Record<string, unknown>) => {
  if (message.id !== pendingUserInputRequestId) {
    return;
  }

  pendingUserInputRequestId = null;

  respond(pendingSkillsListRequestId!, {
    data: [
      {
        cwd: process.cwd(),
        errors: [],
        skills: [],
      },
    ],
  });
  pendingSkillsListRequestId = null;
};

let remainder = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  remainder += chunk;
  const lines = remainder.split("\n");
  remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const message = JSON.parse(trimmed) as Record<string, unknown>;
    if ("method" in message) {
      handleMethod(message);
      continue;
    }
    if ("id" in message) {
      handleResponse(message);
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
