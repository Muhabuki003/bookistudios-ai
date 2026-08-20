import { expect, test } from "vitest";

import { pathOfThread } from "@/core/threads/utils";

test("uses standard chat route when thread has no agent context", () => {
  expect(pathOfThread("thread-123")).toBe("/workspace/chats/thread-123");
  expect(
    pathOfThread({
      thread_id: "thread-123",
    }),
  ).toBe("/workspace/chats/thread-123");
});

test("always routes to the chats section (agent chat routes were removed)", () => {
  expect(
    pathOfThread({
      thread_id: "thread-123",
      metadata: { agent_name: "researcher" },
    }),
  ).toBe("/workspace/chats/thread-123");
});
