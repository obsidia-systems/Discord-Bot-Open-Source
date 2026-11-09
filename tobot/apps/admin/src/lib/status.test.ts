import assert from "node:assert/strict";
import test from "node:test";
import { classifyProbe, metricsStateFor, parseGauges, queueGauges, readyReason, remoteServices } from "./status.ts";

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

test("ready text is kept only when it is a known cause", () => {
  assert.equal(readyReason("Control Plane", 503, "Database"), "Database");
  assert.equal(readyReason("Control Plane", 503, "secret"), "");
  assert.equal(readyReason("Delivery", 204, "Database"), "");
  assert.equal(
    readyReason("Discord Edge", 503, JSON.stringify({ session_established: false, heartbeat_alive: true })),
    "Gateway session",
  );
  assert.equal(
    readyReason("Discord Edge", 503, JSON.stringify({ session_established: false, heartbeat_alive: false })),
    "Gateway session and heartbeat",
  );
});

test("remote probes and queue numbers stay apart", () => {
  const gauges = parseGauges([
    "tobot_ai_live 1",
    "tobot_ai_ready 0",
    "tobot_ai_reservations_uncertain 3",
    "tobot_gateway_session_established 1",
    "tobot_edge_outbox_unpublished 2",
  ].join("\n"));
  assert.deepEqual(remoteServices(gauges, "ok")[0], {
    name: "AI",
    live: "up",
    ready: "not-ready",
    reason: "Database",
    metrics: "ok",
  });
  assert.deepEqual(queueGauges(gauges), [
    { name: "tobot_ai_reservations_uncertain", value: 3 },
    { name: "tobot_edge_outbox_unpublished", value: 2 },
  ]);
});

test("metrics scrape without a token is unconfigured", () => {
  assert.equal(metricsStateFor(null, false), "unconfigured");
  assert.equal(metricsStateFor(200, true), "ok");
  assert.equal(metricsStateFor(401, true), "rejected");
  assert.equal(metricsStateFor(null, true), "unavailable");
});
