import { defaultVoiceRoomActions } from "@adobos/shared";
import { type GuildMember, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { VoiceRoomsError } from "./domain/voice-rooms.js";
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
  it("a non-owner can claim if the owner left", () => {
    expect(() =>
      assertCanControl(
        member("other", false),
        room,
        "claim",
        defaultVoiceRoomActions(),
      ),
    ).not.toThrow();
  });

  it("lock is blocked if not owner or staff", () => {
    expect(() =>
      assertCanControl(
        member("other", false),
        room,
        "lock",
        defaultVoiceRoomActions(),
      ),
    ).toThrow(VoiceRoomsError);
  });

  it("staff can lock even if not the owner", () => {
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
