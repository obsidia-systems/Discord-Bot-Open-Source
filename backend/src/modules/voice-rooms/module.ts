import {
  VOICE_ROOM_SELECT_PREFIX,
  voiceRoomsSlashCommandBody,
} from "@adobos/shared";
import { GatewayIntentBits } from "discord.js";
import type { AdobosModule } from "#core/modules/types.js";
import { handleVoiceCommand, handleVoiceRoomSelect } from "./commands.js";
import { registerVoiceRoomListeners } from "./gateway.js";
import { voiceRoomsRoutes } from "./http/routes.js";

const slash = voiceRoomsSlashCommandBody();

export const voiceRoomsModule: AdobosModule = {
  id: "voice-rooms",
  name: "Voice Rooms",
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  register(ctx) {
    ctx.route("/api/voice-rooms", voiceRoomsRoutes(ctx.botGateway), {
      feature: "voice-rooms",
    });
    ctx.command({
      name: slash.name,
      description: slash.description,
      handle: (interaction) => handleVoiceCommand(interaction),
    });
    ctx.select(VOICE_ROOM_SELECT_PREFIX, (interaction) =>
      handleVoiceRoomSelect(interaction),
    );
    registerVoiceRoomListeners(ctx);
  },
};

export {
  createGenerator,
  deleteGenerator,
  listVoiceRoomsConfig,
  updateGenerator,
  VoiceRoomsError,
} from "./domain/voice-rooms.js";
export { reconcileVoiceRooms } from "./gateway.js";
