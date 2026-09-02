# Feature: voice-rooms

UI de **Voice Rooms**: generadores Join to Create (hub de voz → sala temporal).

No es Levels (XP). No se llama VoiceMaster.

## Contenido

| Archivo | Rol |
|---------|-----|
| `VoiceRoomsDashboard.tsx` | Lista de generadores + toggles de acciones |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/community/voice-rooms`

## API

`fetchVoiceRooms` / `createVoiceRoomGenerator` / `updateVoiceRoomGenerator` / `deleteVoiceRoomGenerator`. Backend: `modules/voice-rooms` → `/api/voice-rooms`. Slash: `/voice`.
