import { describe, expect, it } from "vitest";
import {
  BOT_GUILD_NICKNAME_MAX,
  isBotGuildNicknameTooLong,
  parseBotActivityType,
  parseBotPresenceStatus,
} from "./bot-profile.js";

describe("apodo del bot en la guild", () => {
  it("el tope es 32", () => {
    expect(BOT_GUILD_NICKNAME_MAX).toBe(32);
    expect(isBotGuildNicknameTooLong("a".repeat(32))).toBe(false);
    expect(isBotGuildNicknameTooLong("a".repeat(33))).toBe(true);
    expect(isBotGuildNicknameTooLong("  ok  ")).toBe(false);
  });
});

describe("presencia persistida (restore, sin UI)", () => {
  it("status y activity caen a defaults seguros", () => {
    expect(parseBotPresenceStatus("dnd")).toBe("dnd");
    expect(parseBotPresenceStatus("nope")).toBe("online");
    expect(parseBotActivityType("Watching")).toBe("Watching");
    expect(parseBotActivityType("nope")).toBe("Playing");
  });
});
