import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  isRolesBuilderPermissionKey,
  listRolePermissionKeys,
} from "@adobos/shared";
import { rolesBuilderModule } from "./index.js";
import { permissionsBitfieldFromKeys } from "./service.js";

describe("roles-builder module", () => {
  it("se llama Roles Builder", () => {
    expect(rolesBuilderModule.id).toBe("roles-builder");
    expect(rolesBuilderModule.name).toBe("Roles Builder");
  });
});

describe("catálogo vs discord.js", () => {
  it("cada key existe en PermissionFlagsBits y Administrator no entra", () => {
    const keys = listRolePermissionKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(typeof PermissionFlagsBits[key as keyof typeof PermissionFlagsBits]).toBe(
        "bigint",
      );
      expect(key).not.toBe("Administrator");
    }
    expect(isRolesBuilderPermissionKey("Administrator")).toBe(false);
  });

  it("el bitfield ignora Administrator y claves fuera del catálogo", () => {
    expect(permissionsBitfieldFromKeys(["Administrator"])).toBe(0n);
    expect(permissionsBitfieldFromKeys(["NotARealFlag"])).toBe(0n);
    expect(permissionsBitfieldFromKeys(["PinMessages"])).toBe(
      PermissionFlagsBits.PinMessages,
    );
    expect(
      permissionsBitfieldFromKeys(["PinMessages", "Administrator", "BypassSlowmode"]),
    ).toBe(
      PermissionFlagsBits.PinMessages | PermissionFlagsBits.BypassSlowmode,
    );
  });
});
