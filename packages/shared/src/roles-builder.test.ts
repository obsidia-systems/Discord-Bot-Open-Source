import { describe, expect, it } from "vitest";
import {
  buildPositionPayload,
  DISCORD_GUILD_ROLE_LIMIT,
  isRoleLocked,
  isRolesBuilderPermissionKey,
  listRolePermissionKeys,
  parseRoleColor,
  ROLE_PERMISSION_KEY_SET,
  type RolesBuilderRole,
  reorderKeepingLocks,
} from "./roles-builder.js";

const REQUIRED_2026_KEYS = [
  "PinMessages",
  "BypassSlowmode",
  "CreateEvents",
  "CreateGuildExpressions",
  "ManageEvents",
  "SetVoiceChannelStatus",
  "UseExternalApps",
] as const;

function stubRole(
  id: string,
  extras: Partial<RolesBuilderRole> = {},
): RolesBuilderRole {
  return {
    id,
    name: id,
    color: 0,
    hexColor: "#000000",
    position: 1,
    managed: false,
    hoist: false,
    mentionable: false,
    permissionKeys: [],
    hasAdministrator: false,
    ...extras,
  };
}

describe("catálogo Roles Builder", () => {
  it("no incluye Administrator y no duplica keys", () => {
    const keys = listRolePermissionKeys();
    expect(keys).not.toContain("Administrator");
    expect(ROLE_PERMISSION_KEY_SET.has("Administrator")).toBe(false);
    expect(isRolesBuilderPermissionKey("Administrator")).toBe(false);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("incluye los flags separados en Feb 2026", () => {
    for (const key of REQUIRED_2026_KEYS) {
      expect(isRolesBuilderPermissionKey(key)).toBe(true);
    }
  });

  it("el tope es el de Discord", () => {
    expect(DISCORD_GUILD_ROLE_LIMIT).toBe(250);
  });
});

describe("parseRoleColor", () => {
  it("vacío y default son 0; hex inválido es null", () => {
    expect(parseRoleColor(undefined)).toBe(0);
    expect(parseRoleColor(null)).toBe(0);
    expect(parseRoleColor("")).toBe(0);
    expect(parseRoleColor("#000000")).toBe(0);
    expect(parseRoleColor("default")).toBe(0);
    expect(parseRoleColor("#5865F2")).toBe(0x5865f2);
    expect(parseRoleColor("1ABC9C")).toBe(0x1abc9c);
    expect(parseRoleColor("#GGG")).toBeNull();
    expect(parseRoleColor("#12")).toBeNull();
    expect(parseRoleColor("not-a-color")).toBeNull();
  });
});

describe("jerarquía con locks", () => {
  it("no mueve el slot bloqueado y reasigna posiciones bajo el bot", () => {
    const bot = stubRole("bot", { position: 5 });
    const a = stubRole("a", { position: 4 });
    const managed = stubRole("m", { position: 3, managed: true });
    const b = stubRole("b", { position: 2 });
    const list = [bot, a, managed, b];
    const locked = new Set(
      list
        .filter((role) => isRoleLocked(role, 5, "bot"))
        .map((role) => role.id),
    );
    expect(locked.has("bot")).toBe(true);
    expect(locked.has("m")).toBe(true);

    const reordered = reorderKeepingLocks(list, locked, 3, 1);
    expect(reordered.map((role) => role.id)).toEqual(["bot", "b", "m", "a"]);

    const payload = buildPositionPayload(reordered, 5, "bot");
    expect(payload).toEqual([
      { roleId: "b", position: 4 },
      { roleId: "a", position: 2 },
    ]);
  });
});
