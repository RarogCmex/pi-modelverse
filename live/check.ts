/**
 * Manual live checks against the real gateway. Reads ./secret.env (gitignored):
 *
 *   API=https://api.modelverse.cn/v1
 *   KEY1=...   # broad grants (277 ids as of 2026-09-24)
 *   KEY2=...   # granted promo key (7 ids)
 *
 * Run:  node live/check.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeGrants } from "../provider.ts";
import { CATALOG } from "../catalog.ts";
import { createMemoryGrantStore, filterModelsByGrants } from "../grants.ts";
import { fetchModelverseModels } from "../discovery.ts";
import { buildModels } from "../models.ts";

interface SecretEnv {
  API?: string;
  [key: string]: string | undefined;
}

function readSecretEnv(): SecretEnv {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "secret.env"), join(here, "..", "secret.env")];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error(`secret.env not found at ${candidates.join(" or ")}`);
  const out: SecretEnv = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function chatRoundtrip(api: string, key: string, model: string): Promise<string> {
  const body = {
    model,
    messages: [{ role: "user", content: "Reply with a single word: pong" }],
    max_completion_tokens: 500,
  };
  const response = await fetch(`${api}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  return `http=${response.status} content=${JSON.stringify(payload.choices?.[0]?.message?.content ?? null)} err=${JSON.stringify(payload.error?.message ?? null).slice(0, 120)}`;
}

async function main() {
  const env = readSecretEnv();
  const api = env.API ?? "https://api.modelverse.cn/v1";
  console.log(`gateway: ${api}`);

  for (const name of ["KEY1", "KEY2"]) {
    const key = env[name];
    if (!key) continue;
    const probe = await probeGrants(key, api);
    console.log(`${name}: http=${probe.status} granted=${probe.granted} sample=${probe.sample.join(", ")}`);
  }

  // Picker view: exactly what pi's model selector will show for each key.
  // Discovery records the raw grant set, the filter replays it against the
  // curated catalog — the check that KEY2 no longer lists claude/gpt-6/glm.
  for (const name of ["KEY1", "KEY2"]) {
    const key = env[name];
    if (!key) continue;
    const store = createMemoryGrantStore();
    const overlay = await fetchModelverseModels(
      api,
      {
        credential: { type: "api_key", key },
        allowNetwork: true,
        signal: new AbortController().signal,
        publish: async () => true,
      } as never,
      8_000,
      store,
    );
    const all = [...buildModels(api), ...overlay];
    const visible = filterModelsByGrants(all, key, store);
    console.log(
      `\npicker view (${name}): granted=${store.lookup(key)?.ids.length ?? "unknown"} ` +
        `catalog=${all.length} visible=${visible.length} overlay=${overlay.length}`,
    );
    console.log(`  ${visible.map((model) => model.id).join(", ")}`);
    const hidden = all.filter((model) => !visible.some((v) => v.id === model.id)).map((m) => m.id);
    if (hidden.length) console.log(`  hidden: ${hidden.join(", ")}`);
  }

  // Cheap live smoke on the chat surface. Quota-aware: a key whose spend budget
  // is exhausted answers permission_error for everything (even rejected
  // requests — the cap is estimated at admission), so report and move on
  // instead of hammering the gateway. Needs the model to be granted to the key.
  for (const name of ["KEY1", "KEY2"]) {
    const key = env[name];
    if (!key) continue;
    console.log(`\nchat smoke (${name}):`);
    for (const entry of CATALOG.filter((entry) => entry.api === "openai-completions")) {
      const grants = await probeGrants(key, api);
      if (!grants.ok) {
        console.log(`  stop: key rejected (HTTP ${grants.status})`);
        break;
      }
      const result = await chatRoundtrip(api, key, entry.id);
      console.log(`  ${entry.id.padEnd(18)} ${result}`);
      if (/quota exceeded/i.test(result)) {
        console.log(`  ${name}: месячная/дневная квота исчерпана — остальные модели пропущены.`);
        break;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
