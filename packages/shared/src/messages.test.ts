import { describe, expect, it } from "vitest";
import {
  EMBED_TOTAL_MAX,
  embedCharacterCount,
  groupEmbedFields,
  parseEmbedHexColor,
  persistEmbedMediaUrl,
  sanitizeEmbedFields,
  sanitizeLinkActionRows,
} from "./messages.js";

describe("parseEmbedHexColor", () => {
  it("accepts #RRGGBB and RRGGBB", () => {
    expect(parseEmbedHexColor("#C45C26")).toBe(0xc45c26);
    expect(parseEmbedHexColor("00ff00")).toBe(0x00ff00);
  });

  it("rejects invalid values", () => {
    expect(parseEmbedHexColor("red")).toBeUndefined();
    expect(parseEmbedHexColor("#fff")).toBeUndefined();
    expect(parseEmbedHexColor("")).toBeUndefined();
  });
});

describe("sanitizeEmbedFields", () => {
  it("requires name and value, trims to 25 and clamps length", () => {
    const fields = sanitizeEmbedFields([
      { name: "  A  ", value: "  1  ", inline: true },
      { name: "   ", value: "x" },
      { name: "B", value: "" },
      ...Array.from({ length: 30 }, (_, i) => ({
        name: `F${i}`,
        value: "v",
      })),
    ]);
    expect(fields).toHaveLength(25);
    expect(fields?.[0]).toEqual({ name: "A", value: "1", inline: true });
    expect(fields?.[1]?.name).toBe("F0");
  });
});

describe("sanitizeLinkActionRows", () => {
  it("keeps only Link buttons with an http(s) URL", () => {
    const rows = sanitizeLinkActionRows([
      {
        buttons: [
          { label: "Hit", style: "Primary", customId: "bj_hit" },
          { label: "Docs", style: "Link", url: "https://example.com/a" },
          { label: "Bad", style: "Link", url: "javascript:alert(1)" },
          { label: "  Go  ", style: "Link", url: "http://localhost/x" },
        ],
      },
      { buttons: [{ label: "Action only", style: "Danger", customId: "x" }] },
    ]);
    expect(rows).toEqual([
      {
        buttons: [
          { label: "Docs", style: "Link", url: "https://example.com/a" },
          { label: "Go", style: "Link", url: "http://localhost/x" },
        ],
      },
    ]);
  });
});

describe("embedCharacterCount", () => {
  it("adds title, desc, author, footer and fields", () => {
    expect(
      embedCharacterCount({
        title: "ab",
        description: "cd",
        authorName: "ef",
        footerText: "gh",
        fields: [{ name: "ij", value: "kl" }],
      }),
    ).toBe(12);
    expect(embedCharacterCount({})).toBe(0);
    expect(EMBED_TOTAL_MAX).toBe(6000);
  });
});

describe("persistEmbedMediaUrl", () => {
  it("prioritizes http CDN and never stores attachment://", () => {
    expect(
      persistEmbedMediaUrl(
        "attachment://image.png",
        "https://cdn.discordapp.com/img.png",
      ),
    ).toBe("https://cdn.discordapp.com/img.png");
    expect(persistEmbedMediaUrl("attachment://image.png")).toBeUndefined();
    expect(persistEmbedMediaUrl("/uploads/templates/a.png")).toBe(
      "/uploads/templates/a.png",
    );
    expect(persistEmbedMediaUrl("https://i.imgur.com/a.png")).toBe(
      "https://i.imgur.com/a.png",
    );
  });
});

describe("groupEmbedFields", () => {
  it("packs inline in groups of 3 and breaks on non-inline", () => {
    const rows = groupEmbedFields([
      { name: "a", value: "1", inline: true },
      { name: "b", value: "2", inline: true },
      { name: "c", value: "3", inline: true },
      { name: "d", value: "4", inline: true },
      { name: "full", value: "x" },
      { name: "e", value: "5", inline: true },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.map((f) => f.name)).toEqual(["a", "b", "c"]);
    expect(rows[1]?.map((f) => f.name)).toEqual(["d"]);
    expect(rows[2]?.map((f) => f.name)).toEqual(["full"]);
    expect(rows[3]?.map((f) => f.name)).toEqual(["e"]);
  });
});
