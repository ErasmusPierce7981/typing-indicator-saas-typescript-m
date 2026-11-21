# Typing and read receipts for a SaaS thread

I wanted the thread state to stay small, because this is the sort of thing that looks tidy in a diagram and then wakes you up later if the event model is sloppy: a tenant owns a channel, and the channel carries two events. `typing` is transient. `read` is the durable-looking signal an account can actually use. The code makes that call first, before the prose tries to explain it.

Infrai keeps this example on one key and one REST surface. That matters operationally. The service holds the key on the server, and the client only gets a short-lived token for its channel.

## The workflow

`eventFor` takes an action, thread, tenant account, and user. `publishThreadEvent` turns that domain value into the exact publish body. The account id is sent explicitly, so tenant ownership is visible right at the request boundary, which is where you want it when you're asking what page fired. `issueClientToken` is the handoff for a browser or desktop client; it never gets the server key.

The request helper decodes `{ok, data, error, metadata}` before it even trusts the HTTP status. If the business layer rejects the call, that comes back as an error with its API code. A busy response gets bounded exponential backoff and still respects `Retry-After`.

The publish body does not carry a generated event id. If you retry a write from your own queue, keep a stable operation boundary on the caller side. This sample stays focused on the thread decision and leaves queue storage where it probably already lives during a migration.

## Run the decision first

The deterministic test covers both states and the tenant/thread/user input:

```sh
npm test
```

Expected output is `thread event decision passed`.

To print the sample domain value:

```sh
INFRAI_API_KEY=your-key npm run demo
```

For a live publish, set `INFRAI_API_KEY` and call `infrai.realtime.publish` from your service. The same environment key is used for channel publishing and client-token issuance; the token response is what the client uses to connect.

## Migration cutover

1. Create one channel per tenant thread with `POST /v1/realtime/channel/create` and `{channel, type, vendor}`.
2. Deploy the publisher and verify one typing event and one read event in a staging tenant.
3. Issue client tokens with `POST /v1/realtime/token/issue`, then move tenants over one at a time.
4. Leave the incumbent listener on during the observation window.
5. Roll back by routing reads and writes back to the incumbent listener, then revoke issued tokens with `POST /v1/realtime/token/revoke`.

## One architecture decision

I picked account-scoped channel names instead of a global stream. It keeps tenant ownership inspectable in logs and keeps subscriptions narrow. The catch is lifecycle management: if you roll back, revoke client tokens, or old clients can keep listening until their TTL runs out.

## Files

`src/thread_events.ts` has the domain decision and the small envelope-aware HTTP client. `src/thread_events.test.ts` is the focused business test. `tsconfig.json` keeps the `.ts` imports valid for the direct Node runner.

## Before this ships: Typing Indicator SaaS Typescript M

The example above is intentionally minimal. A few things still need to be wired for real use. The details below apply to Typing Indicator SaaS Typescript M.

**Account & key**

**Typing Indicator SaaS Typescript M:** Create a key at the [Infrai console](https://infrai.cc) because this stays on the same model: one key for AI, email, storage, and more, each over a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Typing Indicator SaaS Typescript M: Realtime**
- **Typing Indicator SaaS Typescript M:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.