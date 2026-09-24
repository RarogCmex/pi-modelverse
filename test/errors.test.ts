/**
 * Overflow/grant error normalization.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clarifyGrantError, normalizeOverflowError } from "../errors.ts";

test("normalizeOverflowError: Modelverse official phrasings all map to the marker", () => {
  // Official error-code table (tokens_too_long) + live shapes.
  assert.equal(
    normalizeOverflowError("400 Prompt tokens too long. Shorten the input."),
    "context_length_exceeded: 400 Prompt tokens too long. Shorten the input.",
  );
  assert.match(normalizeOverflowError("tokens_too_long")!, /^context_length_exceeded: /);
  assert.match(
    normalizeOverflowError("[User Input Error] The request content exceeds the internal limit of the large model")!,
    /^context_length_exceeded: /,
  );
  // Anthropic-native phrasing (already matched by pi-ai — still fine here).
  assert.match(
    normalizeOverflowError("upstream status 400: prompt is too long: 1763030 tokens > 1000000 maximum")!,
    /^context_length_exceeded: /,
  );
});

test("normalizeOverflowError: non-overflow errors pass through untouched", () => {
  assert.equal(normalizeOverflowError("400 Invalid param"), null);
  assert.equal(normalizeOverflowError("429 Rate limit exceeded, please try again later"), null);
  assert.equal(normalizeOverflowError("500 Internal Server Error"), null);
  assert.equal(normalizeOverflowError("rate_limit" ), null);
  assert.equal(normalizeOverflowError(""), null);
  assert.equal(normalizeOverflowError("context_length_exceeded: already marked"), null);
});

test("clarifyGrantError: the live gate form becomes actionable", () => {
  const clarified = clarifyGrantError(
    "[trace_id: f7b060b8-cb39-4aa2-bc08-58b1620aefb5] No permission to use the model: apikey [uminferapikey-1t6eh6bqkggl] not support model [claude-opus-5-5]",
  );
  assert.ok(clarified);
  assert.ok(clarified.includes("uminferapikey-1t6eh6bqkggl"));
  assert.ok(clarified.includes("claude-opus-5-5"));
  assert.ok(clarified.includes("зависят от ключа"));
  assert.equal(clarifyGrantError("400 Invalid param"), undefined);
});
