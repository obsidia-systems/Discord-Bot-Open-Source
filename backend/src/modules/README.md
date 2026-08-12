# Módulos Lego (backend)

Añadir un módulo:

1. Crear `backend/src/modules/<id>/index.ts` exportando un `AdobosModule`.
2. Añadirlo a `ENABLED_MODULES` en `backend/src/modules/index.ts`.
3. Crear `frontend/src/features/<id>/` + thin page en `pages/dashboard/`.
4. (Opcional) entrada en `frontend/src/lib/nav.ts`.

No editar `core/http/createApp` ni `core/bot/interactionRouter` para features nuevas.
