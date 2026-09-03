import { VOICE_ROOM_SELECT_PREFIX } from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { voiceRoomsModule } from "./module.js";

describe("voice-rooms module", () => {
  it("is named Voice Rooms and registers slash + select + voice", () => {
    expect(voiceRoomsModule.id).toBe("voice-rooms");
    expect(voiceRoomsModule.name).toBe("Voice Rooms");
    const commands: string[] = [];
    const selects: string[] = [];
    const events: string[] = [];
    voiceRoomsModule.register({
      client: {} as never,
      on: (event) => {
        events.push(String(event));
      },
      once: (event) => {
        events.push(`once:${String(event)}`);
      },
      route: () => undefined,
      rawRoute: () => undefined,
      command: (def) => {
        commands.push(def.name);
      },
      autocomplete: () => undefined,
      fallbackChat: () => undefined,
      button: () => undefined,
      select: (prefix) => {
        selects.push(prefix);
      },
      modal: () => undefined,
    });
    expect(commands).toEqual(["voice"]);
    expect(selects).toEqual([VOICE_ROOM_SELECT_PREFIX]);
    expect(events).toContain("voiceStateUpdate");
    expect(events).toContain("once:ready");
  });
});
