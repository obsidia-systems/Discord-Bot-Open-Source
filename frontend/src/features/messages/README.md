# Feature: messages

UI del dominio **Mensajes** (embed builder, texto legacy, botones).

## Contenido

| Archivo | Rol |
|---------|-----|
| `EmbedBuilder.tsx` | Constructor de embeds + preview Discord |
| `MessageSender.tsx` | Envío de texto plano (legacy) |
| `ButtonBuilder.tsx` | Filas de botones de acción |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/messages` → `EmbedBuilder`
- `/dashboard/messages/legacy` → `MessageSender`

## API

Usa `@/lib/api` (`sendEmbedMessage`, `sendChannelMessage`, `fetchGuildAssets`). Tipos en `@adobos/shared` (`messages.ts`).
