import { describe, expect, it } from "vitest";
import {
  applyVoiceRoomNameTemplate,
  canClaimVoiceRoom,
  clampVoiceBitrateKbps,
  clampVoiceUserLimit,
  existingOwnerRoomId,
  isVoiceRoomActionAllowed,
  isVoiceRoomHub,
  normalizeVoiceRoomActions,
  sanitizeVoiceRoomName,
  VOICE_HUB_CHANNEL_TYPE,
  VOICE_ROOM_EMPTY_GRACE_MS,
  VOICE_ROOM_NAME_MAX,
  voiceRoomsSlashCommandBody,
} from "./voice-rooms.js";

describe("name template", () => {
  it("{user} uses displayName and trims to 100", () => {
    expect(
      applyVoiceRoomNameTemplate("{user}'s room", {
        displayName: "Kevin",
        username: "kevinx",
      }),
    ).toBe("Kevin's room");
    expect(
      applyVoiceRoomNameTemplate("{user}", {
        displayName: "a".repeat(200),
        username: "x",
      }).length,
    ).toBeLessThanOrEqual(VOICE_ROOM_NAME_MAX);
    expect(sanitizeVoiceRoomName("  \n  ")).toBe("room");
  });
});

describe("hub and one room per owner", () => {
  it("never treats the hub as a deletable room", () => {
    expect(isVoiceRoomHub("hub", ["hub", "other"])).toBe(true);
    expect(isVoiceRoomHub("room-1", ["hub"])).toBe(false);
    expect(VOICE_HUB_CHANNEL_TYPE).toBe(2);
  });

  it("if the owner already has a room, it is reused", () => {
    expect(
      existingOwnerRoomId("u1", [
        { ownerId: "u1", channelId: "c1" },
        { ownerId: "u2", channelId: "c2" },
      ]),
    ).toBe("c1");
    expect(
      existingOwnerRoomId("u3", [{ ownerId: "u1", channelId: "c1" }]),
    ).toBe(null);
  });
});

describe("claim and grace", () => {
  it("claim only if the owner is absent", () => {
    expect(
      canClaimVoiceRoom({
        ownerId: "o",
        actorId: "a",
        ownerInChannel: false,
      }),
    ).toBe(true);
    expect(
      canClaimVoiceRoom({
        ownerId: "o",
        actorId: "o",
        ownerInChannel: false,
      }),
    ).toBe(false);
    expect(
      canClaimVoiceRoom({
        ownerId: "o",
        actorId: "a",
        ownerInChannel: true,
      }),
    ).toBe(false);
    expect(VOICE_ROOM_EMPTY_GRACE_MS).toBe(5_000);
  });
});

describe("actions and bitrate", () => {
  it("empty actions = all on; staff can turn one off", () => {
    const allowed = normalizeVoiceRoomActions({ ghost: false });
    expect(isVoiceRoomActionAllowed(allowed, "name")).toBe(true);
    expect(isVoiceRoomActionAllowed(allowed, "ghost")).toBe(false);
    expect(clampVoiceUserLimit(200)).toBe(99);
    expect(clampVoiceUserLimit(0)).toBe(0);
    expect(clampVoiceBitrateKbps(512, 96_000)).toBe(96);
    expect(clampVoiceBitrateKbps(8, 384_000)).toBe(8);
  });

  it("/voice is a group with subcommands", () => {
    const body = voiceRoomsSlashCommandBody();
    expect(body.name).toBe("voice");
    const names = body.options.map((o) => o.name);
    expect(names).toContain("lock");
    expect(names).toContain("claim");
    expect(names).toContain("status");
    expect(names).not.toContain("lfm");
  });
});
