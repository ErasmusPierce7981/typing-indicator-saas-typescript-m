import assert from "node:assert/strict";
import { eventFor, infrai } from "./thread_events.ts";

const typing = eventFor("typing", "thread-42", "tenant-7", "agent-3");
assert.deepEqual(typing, { kind: "typing", threadId: "thread-42", accountId: "tenant-7", userId: "agent-3" });
assert.equal(eventFor("read", "thread-42", "tenant-7", "agent-3").kind, "read");
assert.equal(typeof infrai.realtime.publish, "function");
console.log("thread event decision passed");
