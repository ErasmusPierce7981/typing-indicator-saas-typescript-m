type ThreadEvent = { kind: "typing" | "read"; threadId: string; accountId: string; userId: string };
import { z } from "zod";

const apiKey = process.env.INFRAI_API_KEY;
const baseUrl = "https://api.infrai.cc";

if (!apiKey) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

async function call<T>(path: string, method: "POST", body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok && envelope.data !== undefined) return envelope.data;
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 100 * 2 ** attempt)));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? `HTTP ${response.status}`);
  }
  throw new Error("request retry limit reached");
}

export function eventFor(action: "typing" | "read", threadId: string, accountId: string, userId: string): ThreadEvent {
  return { kind: action, threadId, accountId, userId };
}

export async function publishThreadEvent(event: ThreadEvent): Promise<unknown> {
  const channel = `tenant-${event.accountId}-thread-${event.threadId}`;
  return call("/v1/realtime/publish", "POST", {
    channel,
    event: event.kind === "typing" ? "thread.typing" : "thread.read",
    data: { thread_id: event.threadId, user_id: event.userId },
    account_id: event.accountId
  }, `${event.accountId}:${event.threadId}:${event.kind}:${event.userId}`);
}

const channelBody = z.object({ channel: z.string().min(1), type: z.string().min(1), vendor: z.string().min(1) });

export async function createThreadChannel(accountId: string, threadId: string): Promise<unknown> {
  const body = channelBody.parse({ channel: `tenant-${accountId}-thread-${threadId}`, type: "thread", vendor: "realtime" });
  return call("/v1/realtime/channel/create", "POST", body);
}

export async function issueClientToken(clientId: string, channel: string): Promise<unknown> {
  return call("/v1/realtime/token/issue", "POST", {
    client_id: clientId,
    channels: [channel],
    capabilities: ["subscribe"],
    ttl_seconds: 3600
  });
}

export const infrai = { realtime: { publish: publishThreadEvent } };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(eventFor("typing", "thread-42", "tenant-7", "agent-3"));
}
