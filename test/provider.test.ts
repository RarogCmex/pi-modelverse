/**
 * Provider assembly: base URL resolution, login grant probe, provider wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_URL_ENV_VAR,
  modelverseApiKeyAuth,
  probeGrants,
  resolveBaseUrl,
  withSessionAffinity,
} from "../provider.ts";

test("resolveBaseUrl: env override trimmed, trailing slashes stripped, default gateway else", () => {
  assert.equal(resolveBaseUrl(() => undefined), "https://api.modelverse.cn/v1");
  assert.equal(resolveBaseUrl(() => "https://mirror.example.com/v1//"), "https://mirror.example.com/v1");
  assert.equal(resolveBaseUrl(() => "  https://x.cn/v1  "), "https://x.cn/v1");
  assert.equal(BASE_URL_ENV_VAR, "MODELVERSE_BASE_URL");
});

test("probeGrants: 200 listing counts ids; 401 reports rejection", async () => {
  const ok = await probeGrants(
    "key",
    "https://api.modelverse.cn/v1",
    1_000,
    (async (input: RequestInfo | URL) =>
      new Response(
        JSON.stringify({ data: [{ id: "a" }, { id: "b" }, { id: 3 }] }),
        { status: 200 },
      )) as typeof fetch,
  );
  assert.deepEqual(ok, { ok: true, status: 200, granted: 2, sample: ["a", "b"] });

  const rejected = await probeGrants(
    "bad",
    "https://api.modelverse.cn/v1",
    1_000,
    (async () => new Response("nope", { status: 401 })) as typeof fetch,
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 401);
  assert.equal(rejected.granted, 0);
});

test("probeGrants passes the key as a Bearer header", async () => {
  let seen: string | undefined;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen = (init?.headers as Record<string, string>)?.Authorization;
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  }) as typeof fetch;
  await probeGrants("k1", "https://api.modelverse.cn/v1/", 1_000, impl);
  assert.equal(seen, "Bearer k1");
});

test("login: rejects a key the gateway answers 401 for", async () => {
  const auth = modelverseApiKeyAuth(
    "https://api.modelverse.cn/v1",
    (async () => new Response("nope", { status: 401 })) as typeof fetch,
  );
  const notifications: string[] = [];
  const interaction = fakeInteraction(notifications);
  await assert.rejects(() => auth.login!(interaction), /rejected the key/);
});

test("login: accepted key surfaces its grant count", async () => {
  const listing = { data: [{ id: "mimo-v2.6-flash" }, { id: "claude-opus-5-5" }, { id: "gpt-6-luna" }] };
  const auth = modelverseApiKeyAuth(
    "https://api.modelverse.cn/v1",
    (async () => new Response(JSON.stringify(listing), { status: 200 })) as typeof fetch,
  );
  const notifications: string[] = [];
  const credential = await auth.login!(fakeInteraction(notifications));
  assert.equal(credential.type, "api_key");
  assert.equal((credential as { key: string }).key, "sk-secret-1");
  assert.ok(notifications.some((message) => message.includes("3 models granted")));
});

test("login: unreachable gateway saves the key with a warning instead of failing", async () => {
  const auth = modelverseApiKeyAuth(
    "https://api.modelverse.cn/v1",
    (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
  );
  const notifications: string[] = [];
  const credential = await auth.login!(fakeInteraction(notifications));
  assert.equal((credential as { key: string }).key, "sk-secret-1");
  assert.ok(notifications.some((message) => message.includes("Saving it anyway")));
});

test("withSessionAffinity injects x-session-id onto every outgoing request", async () => {
  const seen: Array<Record<string, string>> = [];
  const callerFetch: typeof fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

  let injectedFetch: typeof fetch | undefined;
  const fakeApi = {
    stream: (_model: never, _context: never, options: { fetch?: typeof fetch }) => {
      injectedFetch = options?.fetch;
      return Promise.resolve({ stream: null });
    },
  };
  const affinited = withSessionAffinity(fakeApi as unknown as never);
  await (affinited as unknown as { stream: (m: never, c: never, o: unknown) => Promise<unknown> }).stream(
    {} as never,
    {} as never,
    { sessionId: "session-abc123", fetch: callerFetch },
  );
  assert.ok(injectedFetch, "adapter received a wrapped fetch");
  assert.notEqual(injectedFetch, callerFetch);

  const response = await injectedFetch!("https://api.modelverse.cn/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer k", "Content-Type": "application/json" },
  });
  assert.equal(response.status, 200);
});

test("injected fetch adds the header; caller headers survive; no sessionId means passthrough", async () => {
  // Header injection + caller header preservation.
  let captured: Headers | undefined;
  const callerFetch: typeof fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  let injectedFetch: typeof fetch | undefined;
  const captureApi = {
    stream: (_m: never, _c: never, options: { fetch?: typeof fetch }) => {
      injectedFetch = options?.fetch;
      return Promise.resolve({ stream: null });
    },
  } as unknown as never;
  const wrapped = withSessionAffinity(captureApi);
  await (wrapped as unknown as { stream: (m: never, c: never, o: unknown) => Promise<unknown> }).stream(
    {} as never,
    {} as never,
    { sessionId: "sess-42", fetch: callerFetch },
  );
  await injectedFetch!("https://api.modelverse.cn/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer k", "Content-Type": "application/json" },
  });
  assert.equal(captured!.get("x-session-id"), "sess-42");
  assert.equal(captured!.get("authorization"), "Bearer k");
  assert.equal(captured!.get("content-type"), "application/json");

  // An existing x-session-id is never overwritten (stable per-session ownership).
  await injectedFetch!("https://api.modelverse.cn/v1/responses", {
    method: "POST",
    headers: { "X-Session-Id": "caller-owned" },
  });
  assert.equal(captured!.get("x-session-id"), "caller-owned");

  // No sessionId: options object passes through untouched (same fetch ref).
  const identityFetch: typeof fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
  const opts = { fetch: identityFetch };
  let passedOptions: { fetch?: typeof fetch } | undefined;
  const spyApi = {
    stream: (_m: never, _c: never, o: { fetch?: typeof fetch }) => {
      passedOptions = o;
      return Promise.resolve({ stream: null });
    },
  } as unknown as never;
  await (withSessionAffinity(spyApi) as unknown as { stream: (m: never, c: never, o: unknown) => Promise<unknown> }).stream(
    {} as never,
    {} as never,
    opts,
  );
  assert.equal(passedOptions, opts, "no sessionId: identity pass-through");
  assert.equal(passedOptions?.fetch, identityFetch);
});

function fakeInteraction(notifications: string[]): never {
  return {
    signal: new AbortController().signal,
    notify: (note: { message: string }) => notifications.push(note.message),
    prompt: async () => "sk-secret-1  ",
  } as never;
}
