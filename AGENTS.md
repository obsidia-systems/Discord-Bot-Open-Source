# AGENTS.md

Guía para agentes de código (y personas nuevas) trabajando en **Adobos Bot**.
Arquitectura: [README.md](README.md) · Plan de producto: [ROADMAP.md](ROADMAP.md).

## Estructura

Monorepo pnpm workspaces:

- `backend/` — discord.js v14 + Express (API). PostgreSQL 16 + Drizzle ORM.
- `frontend/` — Astro + islas React + Tailwind + Shadcn UI.
- `packages/shared/` — `@adobos/shared`: DTOs, contratos y catálogos compartidos FE + BE.

## Comandos

| Acción | Comando |
|---|---|
| Typecheck (todo el repo) | `pnpm typecheck` |
| Lint | `pnpm lint` (biome; **solo** cubre `backend/src/core` y `packages/shared/src`) |
| Format | `pnpm format` |
| Tests backend | `pnpm --filter @adobos/backend test` |
| Tests shared | `pnpm --filter @adobos/shared test` |
| Build shared (si tocaste contratos, antes de typechear FE/BE) | `pnpm --filter @adobos/shared build` |

## Migraciones de base de datos (Drizzle)

Flujo canónico — **nunca a mano**:

1. Editas `backend/src/db/schema.ts`.
2. `pnpm db:generate` → escribe el `.sql` y actualiza `backend/drizzle/meta/<n>_snapshot.json` + `meta/_journal.json`.
3. Revisas el SQL generado. Ojo con los renames: Drizzle no distingue "renombré" de "borré y añadí" — pregunta de forma interactiva.
4. `pnpm db:migrate` aplica contra la DB. El backend también corre `migrate()` al arrancar (`initDatabase`).

Reglas:

- **Commitea `backend/drizzle/` completo** — `.sql`, `meta/*_snapshot.json` y `_journal.json` van en el mismo commit que el cambio de `schema.ts`. Nunca en `.gitignore`.
- **No edites ni borres a mano** un `.sql` ya generado ni `_journal.json`. `generate` compara `schema.ts` contra el último snapshot; si el snapshot se queda stale, genera un diff contra la baseline equivocada y pide prompts interactivos (que no corren en entornos no-interactivos).
- **SQL crudo** (DDL que Drizzle no cubre, data migrations, seeds) → `pnpm db:generate --custom`: crea un `.sql` vacío ya numerado y registrado en el journal. Mantenlo pequeño e idempotente.
- **`drizzle-kit push` solo en DB local desechable.** Nunca en un entorno con historial de migraciones ni en producción: aplica al instante, sin migración, y deja la DB por delante del journal.
- No mezcles `push` y `generate` en el mismo entorno.
- En equipo: `git pull` antes de generar. Si dos ramas generan en paralelo, el conflicto sale en `_journal.json` / snapshots → rebasar y regenerar.

Re-baseline / squash — **solo pre-producción**, rompe el tracking de cualquier DB ya desplegada:

1. `rm -rf backend/drizzle/`
2. `pnpm --filter @adobos/backend db:generate --name initial_schema` → baseline única `0000`.
3. Resetear cada DB de dev: recrearla (`docker compose down` + borrar el volumen `*_adobos_pgdata`, o `DROP DATABASE` + `CREATE DATABASE`), o vaciar `drizzle.__drizzle_migrations` y stampear la baseline como aplicada.

Verificación sin DB: correr `pnpm db:generate` otra vez debe decir **"No schema changes, nothing to migrate"** → el snapshot cuadra con `schema.ts`.

## Convenciones de código

- biome: 2 espacios, comillas dobles, `;` siempre. `noExplicitAny` y `noNonNullAssertion` desactivados.
- Comentarios de código en español; strings visibles al usuario en inglés (la i18n va después, sobre una base estable en inglés).
- Los parsers de entrada multi-idioma aceptan tokens ES + EN **a propósito** — no "traducirlos": `packages/shared/src/reminders.ts` (unidades de duración), `backend/src/modules/moderation/duration.ts`, `backend/src/modules/auto-mod/filters.ts` (clases de caracteres), `packages/shared/src/auto-delete.ts`, `packages/shared/src/economy.ts` (`parseBankAmount` acepta `all`/`todo`/`max`).
- `packages/shared/tsconfig.tsbuildinfo` lo reescribe el build de shared — revértelo, no lo commitees.
- El nav del panel (`frontend/src/lib/nav.ts`) es la única fuente de verdad del menú; los `href` reflejan la estructura de carpetas en `frontend/src/pages/dashboard/<categoría>/`. Rutas renombradas dejan un stub de redirect en la ruta vieja.
