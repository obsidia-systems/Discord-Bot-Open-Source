import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import { defaultVoiceRoomActions } from "@adobos/shared";
import { VoiceRoomsError } from "./service.js";
import { assertCanControl } from "./rooms.js";

function member(id: string, staff: boolean): GuildMember {
  return {
    id,
    permissions: {
      has: (bit: bigint) => staff && bit === PermissionFlagsBits.ManageChannels,
    },
  } as unknown as GuildMember;
}

const room = {
  channelId: "c",
  guildId: "g",
  generatorId: 1,
  ownerId: "owner",
  textChannelId: null,
  locked: false,
  ghosted: false,
  createdAt: new Date().toISOString(),
};

describe("assertCanControl", () => {
  it("claim lo puede un no-dueño si el dueño se fue", () => {
    expect(() =>
      assertCanControl(
        member("other", false),
        room,
        "claim",
        defaultVoiceRoomActions(),
      ),
    ).not.toThrow();
  });

  it("lock lo bloquea si no es dueño ni staff", () => {
    expect(() =>
      assertCanControl(
        member("other", false),
        room,
        "lock",
        defaultVoiceRoomActions(),
      ),
    ).toThrow(VoiceRoomsError);
  });

  it("staff puede lock aunque no sea dueño", () => {
    expect(() =>
      assertCanControl(
        member("mod", true),
        room,
        "lock",
        defaultVoiceRoomActions(),
      ),
    ).not.toThrow();
  });
});
