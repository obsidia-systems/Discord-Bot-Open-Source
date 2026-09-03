import { describe, expect, it } from "vitest";
import {
  applyWelcomeVariables,
  defaultWelcomeTextLayers,
  isWelcomeRemoteBackground,
  isWelcomeSendChannelType,
  normalizeTextLayers,
  shouldDispatchLeave,
  WELCOME_LEGACY_UNSPLASH_BACKGROUND,
  WELCOME_TEXT_LAYERS_MAX,
} from "./welcome.js";

const ctx = {
  userMention: "<@9>",
  username: "alice",
  displayName: "Alice",
  serverName: "Adobos",
  memberCount: 12,
};

describe("applyWelcomeVariables", () => {
  it("in the message {user} is a mention; in the layer it's the name", () => {
    expect(applyWelcomeVariables("{user} en {server}", ctx, "message")).toBe(
      "<@9> en Adobos",
    );
    expect(applyWelcomeVariables("{user} / {username}", ctx, "card")).toBe(
      "Alice / alice",
    );
  });
});

describe("shouldDispatchLeave", () => {
  it("does not dispatch leave if the user is banned", () => {
    expect(shouldDispatchLeave(true)).toBe(false);
    expect(shouldDispatchLeave(false)).toBe(true);
  });
});

describe("normalizeTextLayers", () => {
  it("old layers become left; trims to 12", () => {
    const layers = normalizeTextLayers([
      { id: "a", text: "  Hola  ", x: 10, y: 20, fontSize: 40, color: "#fff" },
      {
        id: "b",
        text: "Centro",
        align: "center",
        x: 1,
        y: 2,
        fontSize: 30,
        color: "#000",
      },
      { text: "   " },
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `x${i}`,
        text: `L${i}`,
        x: 0,
        y: 0,
        fontSize: 20,
        color: "#FFFFFF",
        align: "center",
      })),
    ]);
    expect(layers).toHaveLength(WELCOME_TEXT_LAYERS_MAX);
    expect(layers[0]?.align).toBe("left");
    expect(layers[0]?.text).toBe("Hola");
    expect(layers[1]?.align).toBe("center");
  });

  it("defaults nuevos van centrados", () => {
    expect(defaultWelcomeTextLayers()[0]?.align).toBe("center");
  });
});

describe("backgrounds and channels", () => {
  it("legacy Unsplash is not a remote background", () => {
    expect(isWelcomeRemoteBackground(WELCOME_LEGACY_UNSPLASH_BACKGROUND)).toBe(
      false,
    );
    expect(isWelcomeRemoteBackground("")).toBe(false);
    expect(isWelcomeRemoteBackground("https://cdn.example.com/bg.png")).toBe(
      true,
    );
  });

  it("text and announcements only", () => {
    expect(isWelcomeSendChannelType(0)).toBe(true);
    expect(isWelcomeSendChannelType(5)).toBe(true);
    expect(isWelcomeSendChannelType(2)).toBe(false);
    expect(isWelcomeSendChannelType(15)).toBe(false);
  });
});
