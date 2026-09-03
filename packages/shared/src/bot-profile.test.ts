import { describe, expect, it } from "vitest";
import {
  BOT_GUILD_NICKNAME_MAX,
  isBotGuildNicknameTooLong,
  parseBotActivityType,
  parseBotPresenceStatus,
} from "./bot-profile.js";

describe("bot nickname in the guild", () => {
  it("the cap is 32", () => {
    expect(BOT_GUILD_NICKNAME_MAX).toBe(32);
    expect(isBotGuildNicknameTooLong("a".repeat(32))).toBe(false);
    expect(isBotGuildNicknameTooLong("a".repeat(33))).toBe(true);
    expect(isBotGuildNicknameTooLong("  ok  ")).toBe(false);
  });
});

describe("persisted presence (restore, no UI)", () => {
  it("status and activity fall back to safe defaults", () => {
    expect(parseBotPresenceStatus("dnd")).toBe("dnd");
    expect(parseBotPresenceStatus("nope")).toBe("online");
    expect(parseBotActivityType("Watching")).toBe("Watching");
    expect(parseBotActivityType("nope")).toBe("Playing");
  });
});
