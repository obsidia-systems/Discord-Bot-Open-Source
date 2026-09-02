import { describe, expect, it } from "vitest";
import {
  clampStarboardThreshold,
  countUniqueStarUsers,
  decideStarboardAction,
  isConfiguredStarEmoji,
  isStarboardDestinationChannelType,
  normalizeStarboardEmojis,
  STARBOARD_DEFAULT_EMOJI,
  STARBOARD_DEFAULT_THRESHOLD,
  STARBOARD_EMOJIS_MAX,
  STARBOARD_THRESHOLD_MAX,
  shouldSkipStarboardSource,
  starboardHeaderEmoji,
} from "./starboard.js";

describe("emoji y umbral", () => {
  it("normaliza unicode, custom y mención; tope 10; vacío → ⭐", () => {
    expect(normalizeStarboardEmojis(["⭐", "unicode:⭐"])).toEqual([
      STARBOARD_DEFAULT_EMOJI,
    ]);
    expect(normalizeStarboardEmojis(["<:pepe:123456789012345678>"])).toEqual([
      "custom:123456789012345678",
    ]);
    expect(normalizeStarboardEmojis([])).toEqual([STARBOARD_DEFAULT_EMOJI]);
    const many = Array.from({ length: 20 }, (_, i) => `unicode:${i}️⃣`);
    expect(normalizeStarboardEmojis(many)).toHaveLength(STARBOARD_EMOJIS_MAX);
  });

  it("clampa el umbral 1–100", () => {
    expect(clampStarboardThreshold(3)).toBe(STARBOARD_DEFAULT_THRESHOLD);
    expect(clampStarboardThreshold(0)).toBe(1);
    expect(clampStarboardThreshold(999)).toBe(STARBOARD_THRESHOLD_MAX);
    expect(clampStarboardThreshold("no")).toBe(STARBOARD_DEFAULT_THRESHOLD);
  });

  it("solo texto y anuncios como destino", () => {
    expect(isStarboardDestinationChannelType(0)).toBe(true);
    expect(isStarboardDestinationChannelType(5)).toBe(true);
    expect(isStarboardDestinationChannelType(15)).toBe(false);
    expect(isStarboardDestinationChannelType(2)).toBe(false);
  });

  it("header usa el primer unicode", () => {
    expect(starboardHeaderEmoji(["custom:1", "unicode:✨"])).toBe("✨");
    expect(starboardHeaderEmoji(["custom:1"])).toBe("⭐");
  });
});

describe("conteo y decisión", () => {
  it("no cuenta self-star ni bots si están apagados", () => {
    expect(
      countUniqueStarUsers(
        [
          { id: "author", bot: false },
          { id: "bot", bot: true },
          { id: "a", bot: false },
          { id: "a", bot: false },
        ],
        { authorId: "author", allowSelfStar: false, allowBots: false },
      ),
    ).toBe(1);
    expect(
      countUniqueStarUsers(
        [
          { id: "author", bot: false },
          { id: "bot", bot: true },
        ],
        { authorId: "author", allowSelfStar: true, allowBots: true },
      ),
    ).toBe(2);
  });

  it("post / update / remove / noop según umbral", () => {
    expect(
      decideStarboardAction({ count: 3, threshold: 3, alreadyPosted: false }),
    ).toBe("post");
    expect(
      decideStarboardAction({ count: 5, threshold: 3, alreadyPosted: true }),
    ).toBe("update");
    expect(
      decideStarboardAction({ count: 2, threshold: 3, alreadyPosted: true }),
    ).toBe("remove");
    expect(
      decideStarboardAction({ count: 1, threshold: 3, alreadyPosted: false }),
    ).toBe("noop");
  });

  it("solo cuenta emojis configurados", () => {
    expect(isConfiguredStarEmoji("unicode:⭐", [STARBOARD_DEFAULT_EMOJI])).toBe(
      true,
    );
    expect(isConfiguredStarEmoji("unicode:🔥", [STARBOARD_DEFAULT_EMOJI])).toBe(
      false,
    );
    expect(isConfiguredStarEmoji(null, [STARBOARD_DEFAULT_EMOJI])).toBe(false);
  });
});

describe("origen", () => {
  it("salta el canal del tablón, ignorados, bots y posts propios", () => {
    const base = {
      enabled: true,
      destinationChannelId: "board",
      sourceChannelId: "chat",
      ignoreChannelIds: [] as string[],
      authorIsBot: false,
      allowBots: false,
      sourceIsStarboardPost: false,
    };
    expect(shouldSkipStarboardSource(base)).toBe(false);
    expect(
      shouldSkipStarboardSource({ ...base, sourceChannelId: "board" }),
    ).toBe(true);
    expect(
      shouldSkipStarboardSource({
        ...base,
        ignoreChannelIds: ["chat"],
      }),
    ).toBe(true);
    expect(shouldSkipStarboardSource({ ...base, authorIsBot: true })).toBe(
      true,
    );
    expect(
      shouldSkipStarboardSource({
        ...base,
        authorIsBot: true,
        allowBots: true,
      }),
    ).toBe(false);
    expect(
      shouldSkipStarboardSource({ ...base, sourceIsStarboardPost: true }),
    ).toBe(true);
    expect(shouldSkipStarboardSource({ ...base, enabled: false })).toBe(true);
  });
});
