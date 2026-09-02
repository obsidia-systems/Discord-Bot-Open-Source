# Feature: messages

UI del dominio **Messages** (embed builder, texto plano, botones Link).

## Contenido

| Archivo | Rol |
|---------|-----|
| `EmbedBuilder.tsx` | Constructor de embeds + preview Discord |
| `EmbedFieldsBuilder.tsx` | Fields name/value/inline |
| `MessageSender.tsx` | Envío de texto plano |
| `ButtonBuilder.tsx` | Filas de botones Link |
| `index.ts` | Barrel público |

## Rutas Astro

- `/dashboard/messages` → `EmbedBuilder`
- `/dashboard/messages/legacy` → `MessageSender`

## API

Usa `@/lib/api` (`sendEmbedToLibrary`, `sendChannelMessage`, `fetchGuildAssets`). Tipos en `@adobos/shared` (`messages.ts`).
