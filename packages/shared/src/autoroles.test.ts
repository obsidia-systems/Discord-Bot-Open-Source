import { describe, expect, it } from "vitest";
import {
  AUTOROLE_REACTIONS_MAX,
  autoroleAssignDenyReason,
  autoroleMappingLimit,
  canAssignAutorole,
  exclusiveSelectRoleIds,
  isAutorolePickableRole,
  isAutoroleSendChannelType,
  normalizeAutoroleEmojiKey,
} from "./autoroles.js";

const guildId = "111";

describe("canAssignAutorole", () => {
  it("rechaza missing, everyone, managed y encima del bot", () => {
    expect(autoroleAssignDenyReason(null, guildId, 5)).toBe("missing");
    expect(
      autoroleAssignDenyReason(
        { id: guildId, managed: false, position: 0 },
        guildId,
        5,
      ),
    ).toBe("everyone");
    expect(
      autoroleAssignDenyReason(
        { id: "222", managed: true, position: 1 },
        guildId,
        5,
      ),
    ).toBe("managed");
    expect(
      autoroleAssignDenyReason(
        { id: "222", managed: false, position: 5 },
        guildId,
        5,
      ),
    ).toBe("above_bot");
    expect(
      canAssignAutorole({ id: "222", managed: false, position: 4 }, guildId, 5),
    ).toBe(true);
  });
});

describe("exclusiveSelectRoleIds", () => {
  it("deja el elegido y quita el resto del menú", () => {
    expect(exclusiveSelectRoleIds(["a", "b", "c"], "b")).toEqual({
      add: "b",
      remove: ["a", "c"],
    });
    expect(exclusiveSelectRoleIds(["a", "b"], "z")).toEqual({
      add: null,
      remove: [],
    });
  });
});

describe("normalizeAutoroleEmojiKey", () => {
  it("normaliza mención, custom y unicode", () => {
    expect(normalizeAutoroleEmojiKey("<:pepe:123456789012345678>")).toBe(
      "custom:123456789012345678",
    );
    expect(normalizeAutoroleEmojiKey("custom:99")).toBe("custom:99");
    expect(normalizeAutoroleEmojiKey("🔥")).toBe("unicode:🔥");
    expect(() => normalizeAutoroleEmojiKey("  ")).toThrow(/vacío/);
  });
});

describe("canales, tope y picker", () => {
  it("solo texto y anuncios; reacciones 20; managed fuera", () => {
    expect(isAutoroleSendChannelType(0)).toBe(true);
    expect(isAutoroleSendChannelType(5)).toBe(true);
    expect(isAutoroleSendChannelType(2)).toBe(false);
    expect(autoroleMappingLimit("REACTIONS")).toBe(AUTOROLE_REACTIONS_MAX);
    expect(autoroleMappingLimit("BUTTONS")).toBe(25);
    expect(isAutorolePickableRole({ managed: true })).toBe(false);
    expect(
      isAutorolePickableRole({ managed: true, premiumSubscriber: true }),
    ).toBe(false);
    expect(isAutorolePickableRole({ managed: false })).toBe(true);
  });
});
