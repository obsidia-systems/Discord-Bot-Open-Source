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

describe("plantilla de nombre", () => {
  it("{user} usa displayName y recorta a 100", () => {
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

describe("hub y una sala por dueño", () => {
  it("nunca trata el hub como sala borrable", () => {
    expect(isVoiceRoomHub("hub", ["hub", "other"])).toBe(true);
    expect(isVoiceRoomHub("room-1", ["hub"])).toBe(false);
    expect(VOICE_HUB_CHANNEL_TYPE).toBe(2);
  });

  it("si el dueño ya tiene sala, se reusa", () => {
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

describe("claim y gracia", () => {
  it("claim solo si el dueño no está", () => {
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

describe("acciones y bitrate", () => {
  it("acciones vacías = todas on; staff puede apagar una", () => {
    const allowed = normalizeVoiceRoomActions({ ghost: false });
    expect(isVoiceRoomActionAllowed(allowed, "name")).toBe(true);
    expect(isVoiceRoomActionAllowed(allowed, "ghost")).toBe(false);
    expect(clampVoiceUserLimit(200)).toBe(99);
    expect(clampVoiceUserLimit(0)).toBe(0);
    expect(clampVoiceBitrateKbps(512, 96_000)).toBe(96);
    expect(clampVoiceBitrateKbps(8, 384_000)).toBe(8);
  });

  it("/voice es un grupo con subcomandos", () => {
    const body = voiceRoomsSlashCommandBody();
    expect(body.name).toBe("voice");
    const names = body.options.map((o) => o.name);
    expect(names).toContain("lock");
    expect(names).toContain("claim");
    expect(names).toContain("status");
    expect(names).not.toContain("lfm");
  });
});
