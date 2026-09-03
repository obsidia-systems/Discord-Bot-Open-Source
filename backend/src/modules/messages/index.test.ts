import {
  embedCharacterCount,
  persistEmbedMediaUrl,
  sanitizeLinkActionRows,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { messagesModule } from "./index.js";

describe("messages module", () => {
  it("is named Messages", () => {
    expect(messagesModule.id).toBe("messages");
    expect(messagesModule.name).toBe("Messages");
  });
});

describe("embed contract", () => {
  it("does not leave a casino customId on a Link button", () => {
    const rows = sanitizeLinkActionRows([
      {
        buttons: [
          { label: "Hit", style: "Primary", customId: "bj_hit" },
          { label: "Web", style: "Link", url: "https://example.com" },
        ],
      },
    ]);
    expect(rows?.[0]?.buttons).toEqual([
      { label: "Web", style: "Link", url: "https://example.com" },
    ]);
  });

  it("does not persist attachment:// and counts the 6000 cap", () => {
    expect(persistEmbedMediaUrl("attachment://x.png")).toBeUndefined();
    expect(
      embedCharacterCount({
        title: "a".repeat(256),
        description: "b".repeat(4096),
        footerText: "c".repeat(1648),
      }),
    ).toBe(6000);
  });
});
