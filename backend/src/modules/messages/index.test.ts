import { describe, expect, it } from "vitest";
import {
  embedCharacterCount,
  persistEmbedMediaUrl,
  sanitizeLinkActionRows,
} from "@adobos/shared";
import { messagesModule } from "./index.js";

describe("messages module", () => {
  it("se llama Messages", () => {
    expect(messagesModule.id).toBe("messages");
    expect(messagesModule.name).toBe("Messages");
  });
});

describe("contrato del embed", () => {
  it("no deja customId de casino en un botón Link", () => {
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

  it("no persiste attachment:// y cuenta el tope 6000", () => {
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
