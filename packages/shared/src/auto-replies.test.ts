import { describe, expect, it } from "vitest";
import {
  type AutoReply,
  applyAutoReplyTokens,
  clampAutoReplyCooldown,
  isAutoReplyChannelAllowed,
  isAutoReplyOnCooldown,
  messageMatchesTrigger,
  normalizeAutoReplyTrigger,
  pickMatchingAutoReply,
} from "./auto-replies.js";

function reply(
  partial: Partial<AutoReply> & Pick<AutoReply, "id" | "trigger">,
): AutoReply {
  return {
    guildId: "g",
    matchMode: "contains",
    response: "ok",
    enabled: true,
    caseSensitive: false,
    wholeWord: false,
    useReply: true,
    cooldownSeconds: 0,
    allowedChannelIds: [],
    ignoredChannelIds: [],
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("normalize and cooldown", () => {
  it("trims an empty trigger and the cap", () => {
    expect(normalizeAutoReplyTrigger("  hola  ")).toBe("hola");
    expect(normalizeAutoReplyTrigger("")).toBeNull();
    expect(normalizeAutoReplyTrigger("x".repeat(201))).toBeNull();
  });

  it("clampa cooldown 0–3600", () => {
    expect(clampAutoReplyCooldown(-1)).toBe(0);
    expect(clampAutoReplyCooldown(12)).toBe(12);
    expect(clampAutoReplyCooldown(99999)).toBe(3600);
  });

  it("cooldown: no prior fire or 0s does not block", () => {
    expect(isAutoReplyOnCooldown(null, 10, 1000)).toBe(false);
    expect(isAutoReplyOnCooldown(900, 0, 1000)).toBe(false);
    expect(isAutoReplyOnCooldown(500, 1, 1000)).toBe(true);
    expect(isAutoReplyOnCooldown(0, 1, 1500)).toBe(false);
  });
});

describe("messageMatchesTrigger", () => {
  it("exact ignora espacios alrededor; case-insensitive por defecto", () => {
    expect(
      messageMatchesTrigger({
        content: "  Hola  ",
        trigger: "hola",
        matchMode: "exact",
        caseSensitive: false,
        wholeWord: false,
      }),
    ).toBe(true);
    expect(
      messageMatchesTrigger({
        content: "Hola!",
        trigger: "hola",
        matchMode: "exact",
        caseSensitive: false,
        wholeWord: false,
      }),
    ).toBe(false);
    expect(
      messageMatchesTrigger({
        content: "Hola",
        trigger: "hola",
        matchMode: "exact",
        caseSensitive: true,
        wholeWord: false,
      }),
    ).toBe(false);
  });

  it("contains: hola inside holanda; wholeWord does not", () => {
    expect(
      messageMatchesTrigger({
        content: "di holanda ya",
        trigger: "hola",
        matchMode: "contains",
        caseSensitive: false,
        wholeWord: false,
      }),
    ).toBe(true);
    expect(
      messageMatchesTrigger({
        content: "di holanda ya",
        trigger: "hola",
        matchMode: "contains",
        caseSensitive: false,
        wholeWord: true,
      }),
    ).toBe(false);
    expect(
      messageMatchesTrigger({
        content: "di hola ya",
        trigger: "hola",
        matchMode: "contains",
        caseSensitive: false,
        wholeWord: true,
      }),
    ).toBe(true);
  });

  it("starts_with + wholeWord: hola mundo yes, holanda no", () => {
    expect(
      messageMatchesTrigger({
        content: " holanda",
        trigger: "hola",
        matchMode: "starts_with",
        caseSensitive: false,
        wholeWord: true,
      }),
    ).toBe(false);
    expect(
      messageMatchesTrigger({
        content: " hola mundo",
        trigger: "hola",
        matchMode: "starts_with",
        caseSensitive: false,
        wholeWord: true,
      }),
    ).toBe(true);
  });
});

describe("pickMatchingAutoReply", () => {
  it("exact beats contains; longer wins; a single reply", () => {
    const picked = pickMatchingAutoReply(
      [
        reply({ id: 1, trigger: "hola", matchMode: "contains" }),
        reply({ id: 2, trigger: "hola", matchMode: "exact" }),
        reply({ id: 3, trigger: "hola mundo", matchMode: "contains" }),
      ],
      "hola",
      "c1",
    );
    expect(picked?.id).toBe(2);
  });

  it("respects allow/ignore channels and enabled", () => {
    expect(
      pickMatchingAutoReply(
        [
          reply({
            id: 1,
            trigger: "hola",
            ignoredChannelIds: ["c1"],
          }),
        ],
        "hola",
        "c1",
      ),
    ).toBeNull();
    expect(
      pickMatchingAutoReply(
        [
          reply({
            id: 1,
            trigger: "hola",
            allowedChannelIds: ["c2"],
          }),
        ],
        "hola",
        "c1",
      ),
    ).toBeNull();
    expect(
      pickMatchingAutoReply(
        [reply({ id: 1, trigger: "hola", enabled: false })],
        "hola",
        "c1",
      ),
    ).toBeNull();
  });

  it("isAutoReplyChannelAllowed", () => {
    expect(isAutoReplyChannelAllowed("a", [], [])).toBe(true);
    expect(isAutoReplyChannelAllowed("a", ["a"], [])).toBe(true);
    expect(isAutoReplyChannelAllowed("a", ["b"], [])).toBe(false);
    expect(isAutoReplyChannelAllowed("a", [], ["a"])).toBe(false);
  });
});

describe("tokens", () => {
  it("username before user to avoid splitting the token", () => {
    expect(
      applyAutoReplyTokens("hey {user} ({username}) en {server} #{channel}", {
        user: "<@1>",
        username: "Ada",
        server: "Casa",
        channel: "general",
      }),
    ).toBe("hey <@1> (Ada) en Casa #general");
  });
});
