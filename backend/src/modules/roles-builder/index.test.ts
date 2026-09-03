import {
  isRolesBuilderPermissionKey,
  listRolePermissionKeys,
} from "@adobos/shared";
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { rolesBuilderModule } from "./index.js";
import { permissionsBitfieldFromKeys } from "./service.js";

describe("roles-builder module", () => {
  it("is named Roles Builder", () => {
    expect(rolesBuilderModule.id).toBe("roles-builder");
    expect(rolesBuilderModule.name).toBe("Roles Builder");
  });
});

describe("catalog vs discord.js", () => {
  it("every key exists in PermissionFlagsBits and Administrator is excluded", () => {
    const keys = listRolePermissionKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(
        typeof PermissionFlagsBits[key as keyof typeof PermissionFlagsBits],
      ).toBe("bigint");
      expect(key).not.toBe("Administrator");
    }
    expect(isRolesBuilderPermissionKey("Administrator")).toBe(false);
  });

  it("the bitfield ignores Administrator and keys outside the catalog", () => {
    expect(permissionsBitfieldFromKeys(["Administrator"])).toBe(0n);
    expect(permissionsBitfieldFromKeys(["NotARealFlag"])).toBe(0n);
    expect(permissionsBitfieldFromKeys(["PinMessages"])).toBe(
      PermissionFlagsBits.PinMessages,
    );
    expect(
      permissionsBitfieldFromKeys([
        "PinMessages",
        "Administrator",
        "BypassSlowmode",
      ]),
    ).toBe(
      PermissionFlagsBits.PinMessages | PermissionFlagsBits.BypassSlowmode,
    );
  });
});
