import { describe, expect, it } from "vitest";
import type { BotGateway } from "#core/discord/botGateway.js";
import { GuildAssetsError, getGuildAssets } from "./controller.js";

function fakeGateway(over: Partial<BotGateway> = {}): BotGateway {
  return {
    isReady: () => true,
    getGuild: async () => ({
      id: "g1",
      name: "Guild One",
      iconUrl: "https://cdn/icon.png",
      boosterRoleId: "role-boost",
    }),
    listChannels: async () => [
      { id: "c1", name: "general", type: 0, parentId: null, position: 1 },
      { id: "c0", name: "cat", type: 4, parentId: null, position: 0 },
      { id: "cx", name: "thread", type: 11, parentId: "c1", position: 5 },
    ],
    listRoles: async () => [
      {
        id: "g1",
        name: "@everyone",
        color: 0,
        hexColor: "#000",
        position: 0,
        managed: false,
      },
      {
        id: "role-boost",
        name: "Booster",
        color: 1,
        hexColor: "#f0f",
        position: 5,
        managed: true,
      },
      {
        id: "r-mod",
        name: "Mod",
        color: 2,
        hexColor: "#0f0",
        position: 3,
        managed: false,
      },
    ],
    listEmojis: async () => [
      { id: "e1", name: "wave", animated: false, url: "https://cdn/e1.png" },
      { id: "e2", name: "party", animated: true, url: "https://cdn/e2.gif" },
    ],
    listStickers: async () => [
      {
        id: "s1",
        name: "hi",
        description: "greeting",
        format: "1",
        url: "https://cdn/s1.png",
      },
    ],
    getChannel: async () => null,
    deleteChannel: async () => {},
    ...over,
  };
}

describe("getGuildAssets", () => {
  it("ensambla la respuesta del panel desde el puerto BotGateway", async () => {
    const res = await getGuildAssets(fakeGateway(), "g1");

    expect(res.guildId).toBe("g1");
    expect(res.guildName).toBe("Guild One");
    expect(res.iconUrl).toBe("https://cdn/icon.png");

    // canales: solo tipos de asset, ordenados por posición
    expect(res.channels.map((c) => c.id)).toEqual(["c0", "c1"]);

    // emojis: mention según animated, orden alfabético
    expect(res.emojis.map((e) => e.name)).toEqual(["party", "wave"]);
    expect(res.emojis.find((e) => e.name === "party")?.mention).toBe(
      "<a:party:e2>",
    );
    expect(res.emojis.find((e) => e.name === "wave")?.mention).toBe(
      "<:wave:e1>",
    );

    // roles: @everyone fuera, booster marcado, orden por posición desc
    expect(res.roles.map((r) => r.id)).toEqual(["role-boost", "r-mod"]);
    expect(
      res.roles.find((r) => r.id === "role-boost")?.premiumSubscriber,
    ).toBe(true);

    expect(res.stickers).toHaveLength(1);
  });

  it("503 si el gateway no está listo", async () => {
    await expect(
      getGuildAssets(fakeGateway({ isReady: () => false }), "g1"),
    ).rejects.toMatchObject({ status: 503, code: "BOT_NOT_READY" });
  });

  it("400 sin guildId", async () => {
    await expect(getGuildAssets(fakeGateway(), "  ")).rejects.toBeInstanceOf(
      GuildAssetsError,
    );
  });

  it("404 si el bot no está en el guild", async () => {
    await expect(
      getGuildAssets(fakeGateway({ getGuild: async () => null }), "g1"),
    ).rejects.toMatchObject({ status: 404, code: "GUILD_NOT_FOUND" });
  });
});
