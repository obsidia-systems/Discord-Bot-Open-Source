import assert from "node:assert/strict";
import test from "node:test";
import { classifyProbe, metricsStateFor, parseGauges } from "./status.ts";

test("health status maps to up, not-ready, or down", () => {
  assert.equal(classifyProbe(204), "up");
  assert.equal(classifyProbe(200), "up");
  assert.equal(classifyProbe(503), "not-ready");
  assert.equal(classifyProbe(500), "down");
  assert.equal(classifyProbe(null), "down");
});

test("gauge text keeps only numeric tobot samples", () => {
  const gauges = parseGauges(
    [
      "tobot_edge_outbox_unpublished 0",
      "tobot_gateway_session_established 1",
      "tobot_guild_1507220191078252674 1",
      "authorization: Bearer secret",
      "",
    ].join("\n"),
  );
  assert.deepEqual(gauges, [
    { name: "tobot_edge_outbox_unpublished", value: 0 },
    { name: "tobot_gateway_session_established", value: 1 },
  ]);
});

test("metrics scrape without a token is unconfigured", () => {
  assert.equal(metricsStateFor(null, false), "unconfigured");
  assert.equal(metricsStateFor(200, true), "ok");
  assert.equal(metricsStateFor(401, true), "rejected");
  assert.equal(metricsStateFor(null, true), "unavailable");
});
