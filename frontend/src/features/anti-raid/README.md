# Feature: anti-raid

UI de **Anti-Raid**: flood de joins, edad de cuenta y lockdown. **Anti-Nuke** (Pro) vigila borrados masivos de staff.

No es Auto-Mod. No es Action Logs.

## Contenido

| Archivo | Rol |
|---------|-----|
| `AntiRaidDashboard.tsx` | Raid FREE + Anti-Nuke Pro |
| `index.ts` | Barrel público |

## Ruta Astro

`/dashboard/moderation/anti-raid`

## API

`fetchAntiRaid` / `saveAntiRaidSettings` / `setAntiRaidLockdown`. Backend: `modules/anti-raid` → `/api/anti-raid`. Slash: `/lockdown`.
