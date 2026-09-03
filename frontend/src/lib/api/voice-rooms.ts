import type {
  UpdateVoiceRoomGeneratorRequest,
  UpsertVoiceRoomGeneratorRequest,
  VoiceRoomGenerator,
  VoiceRoomsConfigResponse,
} from "@adobos/shared";
import { apiFetch, readApiError } from "./client";

export async function fetchVoiceRooms(): Promise<VoiceRoomsConfigResponse> {
  const response = await apiFetch(`/api/voice-rooms`);
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't load Voice Rooms (${response.status})`,
      ),
    );
  }
  return response.json() as Promise<VoiceRoomsConfigResponse>;
}

export async function createVoiceRoomGenerator(
  input: UpsertVoiceRoomGeneratorRequest,
): Promise<VoiceRoomGenerator> {
  const response = await apiFetch(`/api/voice-rooms/generators`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't create the generator (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { generator: VoiceRoomGenerator };
  return json.generator;
}

export async function updateVoiceRoomGenerator(
  id: number,
  input: UpdateVoiceRoomGeneratorRequest,
): Promise<VoiceRoomGenerator> {
  const response = await apiFetch(`/api/voice-rooms/generators/${id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't save the generator (${response.status})`,
      ),
    );
  }
  const json = (await response.json()) as { generator: VoiceRoomGenerator };
  return json.generator;
}

export async function deleteVoiceRoomGenerator(id: number): Promise<void> {
  const response = await apiFetch(`/api/voice-rooms/generators/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        `Couldn't delete the generator (${response.status})`,
      ),
    );
  }
}
