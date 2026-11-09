import assert from "node:assert/strict";
import { test } from "node:test";
import {
  browserErrorMessage,
  capabilityReasons,
  discoveryExpiryLabel,
  discoveryFreshness,
  discoveryPollDelay,
  guildGroup,
  guildIconUrl,
  guildHomeAccess,
  installationView,
  projectionAgeLabel,
  projectionFreshness,
  selectionGrantsAuthority,
  shellReadAllowed,
} from "./shell-state.ts";

const tenantId = "01990c8a-7e2e-7c3a-8c0a-6e5b9c2d1f10";

test("installed shell stays installed only with a tenant", () => {
  assert.deepEqual(
    installationView({
      tenantId,
      installationState: "Installed",
      capabilities: {
        bot_presence: "Healthy",
        application_install_context: "Healthy",
      },
    }),
    { kind: "installed" },
  );
});

test("degraded shell lists unhealthy S0 capabilities", () => {
  assert.deepEqual(
    installationView({
      tenantId,
      installationState: "Degraded",
      capabilities: {
        bot_presence: "Degraded",
        application_install_context: "Healthy",
        unexpected: "<b>no</b>",
      },
    }),
    { kind: "degraded", reasons: ["bot_presence: Degraded"] },
  );
  assert.deepEqual(
    capabilityReasons({ application_install_context: { nested: true } }),
    ["application_install_context: unavailable"],
  );
});

test("removed shell keeps the server and lists the missing bot", () => {
  assert.deepEqual(
    installationView({
      tenantId,
      installationState: "Removed",
      capabilities: {
        bot_presence: "Degraded",
        application_install_context: "Healthy",
      },
    }),
    { kind: "removed", reasons: ["bot_presence: Degraded"] },
  );
});

test("verifying is explicit", () => {
  assert.deepEqual(
    installationView({
      tenantId,
      installationState: "Verifying",
      capabilities: null,
    }),
    { kind: "verifying" },
  );
});

test("a discord icon hash becomes a cdn url and anything else does not", () => {
  const hash = "a".repeat(32);
  assert.equal(
    guildIconUrl("1507220191078252674", hash),
    `https://cdn.discordapp.com/icons/1507220191078252674/${hash}.png`,
  );
  assert.equal(
    guildIconUrl("1507220191078252674", `a_${hash}`),
    `https://cdn.discordapp.com/icons/1507220191078252674/a_${hash}.gif`,
  );
  assert.equal(guildIconUrl("1507220191078252674", "not-a-hash"), null);
  assert.equal(guildIconUrl("guild", hash), null);
  assert.equal(guildIconUrl("1507220191078252674", null), null);
});

test("only a server without a tenant is outside Tobot", () => {
  assert.equal(
    guildGroup(installationView({ tenantId: null, installationState: null, capabilities: null })),
    "without",
  );
  assert.equal(
    guildGroup(installationView({ tenantId, installationState: "Installed", capabilities: null })),
    "with",
  );
  assert.equal(
    guildGroup(installationView({ tenantId, installationState: "Removed", capabilities: null })),
    "with",
  );
});

test("missing tenant is not enabled", () => {
  assert.deepEqual(
    installationView({
      tenantId: null,
      installationState: "Installed",
      capabilities: null,
    }),
    { kind: "not-enabled" },
  );
});

test("freshness becomes stale outside the discovery window", () => {
  assert.equal(discoveryFreshness(1_000, 1_000), "stale");
  assert.equal(discoveryFreshness(999, 1_000), "fresh");
  assert.equal(projectionFreshness(15 * 60), "fresh");
  assert.equal(projectionFreshness(15 * 60 + 1), "stale");
  assert.equal(projectionAgeLabel(901), "Projection age 901s (stale).");
  assert.equal(
    discoveryExpiryLabel(2_000, 1_500),
    "Discovery expires at 1500 (stale).",
  );
});

test("guild home 404 is no access", () => {
  assert.equal(guildHomeAccess(200), "ok");
  assert.equal(guildHomeAccess(401), "unauthenticated");
  assert.equal(guildHomeAccess(404), "no-access");
  assert.equal(guildHomeAccess(500), "unavailable");
});

test("browser errors stay inside the closed set", () => {
  assert.equal(
    browserErrorMessage("expired"),
    "That attempt expired. Start again.",
  );
  assert.equal(
    browserErrorMessage("<script>"),
    "The request could not be completed.",
  );
  assert.equal(
    browserErrorMessage(null),
    "The request could not be completed.",
  );
});

test("verifying guilds poll faster than an idle list", () => {
  assert.equal(discoveryPollDelay(["Installed", "Verifying"]), 2_000);
  assert.equal(discoveryPollDelay(["Installed"]), 15_000);
});

test("an unauthenticated reader cannot open a guild route", () => {
  assert.equal(
    shellReadAllowed({
      authenticated: false,
      routeTenantId: tenantId,
      authorizedTenantIds: [tenantId],
    }),
    false,
  );
});

test("a route tenant outside the authorized set is not readable", () => {
  assert.equal(
    shellReadAllowed({
      authenticated: true,
      routeTenantId: "01990c8a-7e2e-7c3a-8c0a-6e5b9c2d1f11",
      authorizedTenantIds: [tenantId],
    }),
    false,
  );
  assert.equal(
    shellReadAllowed({
      authenticated: true,
      routeTenantId: tenantId,
      authorizedTenantIds: [tenantId],
    }),
    true,
  );
});

test("selecting a guild does not grant authority", () => {
  assert.equal(selectionGrantsAuthority(), false);
});
