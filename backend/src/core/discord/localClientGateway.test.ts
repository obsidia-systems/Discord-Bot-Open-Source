import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { LocalClientGateway } from "./localClientGateway.js";

/** Cliente falso mínimo: un guild con un mapa de canales. */
function fakeClient(channels: Map<string, unknown>): Client {
  const guild = {
    id: "g1",
    channels: {
      cache: channels,
      fetch: async (id: string) => channels.get(id) ?? null,
    },
  };
  return {
    isReady: () => true,
    guilds: { cache: new Map([["g1", guild]]) },
  } as unknown as Client;
}

function textChannel(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    guildId: "g1",
    isTextBased: () => true,
    send: vi.fn(async () => ({ id: "msg-1", channelId: "c1" })),
    messages: {
      fetch: vi.fn(async () => ({
        edit: vi.fn(async () => ({})),
        delete: vi.fn(async () => ({})),
      })),
    },
    ...over,
  };
}

describe("LocalClientGateway.sendMessage", () => {
  it("envía y devuelve { messageId, channelId }", async () => {
    const ch = textChannel();
    const gw = new LocalClientGateway(fakeClient(new Map([["c1", ch]])));
    const res = await gw.sendMessage("g1", "c1", { content: "hola" });
    expect(res).toEqual({ messageId: "msg-1", channelId: "c1" });
    expect(ch.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hola" }),
    );
  });

  it("404 GUILD_NOT_FOUND si el bot no está en el guild", async () => {
    const gw = new LocalClientGateway(fakeClient(new Map()));
    await expect(
      gw.sendMessage("otro", "c1", { content: "x" }),
    ).rejects.toMatchObject({ status: 404, code: "GUILD_NOT_FOUND" });
  });

  it("404 CHANNEL_NOT_FOUND si el canal no existe", async () => {
    const gw = new LocalClientGateway(fakeClient(new Map()));
    await expect(
      gw.sendMessage("g1", "nope", { content: "x" }),
    ).rejects.toMatchObject({ status: 404, code: "CHANNEL_NOT_FOUND" });
  });

  it("400 CHANNEL_NOT_SENDABLE si el canal no admite mensajes", async () => {
    const voice = { id: "c1", guildId: "g1", isTextBased: () => false };
    const gw = new LocalClientGateway(fakeClient(new Map([["c1", voice]])));
    await expect(
      gw.sendMessage("g1", "c1", { content: "x" }),
    ).rejects.toMatchObject({ status: 400, code: "CHANNEL_NOT_SENDABLE" });
  });
});
