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

function fakeInteraction(notifications: string[]): never {
  return {
    signal: new AbortController().signal,
    notify: (note: { message: string }) => notifications.push(note.message),
    prompt: async () => "sk-secret-1  ",
  } as never;
}
