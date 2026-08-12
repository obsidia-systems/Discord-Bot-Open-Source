# Features (UI por dominio)

Cada subcarpeta es un **bloque Lego de frontend**: UI, estado y (opcional) wrappers API del dominio.

## Reglas

1. **Un dominio = una carpeta** (`welcome/`, `messages/`, `autoroles/`, …), simétrica a `backend/src/modules/<id>/`.
2. **Exportar por barrel** (`index.ts`) lo que las thin pages importan.
3. **No importar** internals de otro feature; piezas compartidas van a `components/shared/` o `components/ui/`.
4. **Sin Discord.js / SQL** aquí: solo React + fetch a `/api/*` vía `@/lib/api` o `./api.ts`.

## Añadir un feature

1. Crear `features/<id>/` + componente principal + `index.ts`.
2. Thin page en `pages/dashboard/<dominio>/`.
3. Entrada en `lib/nav.ts`.
4. Backend: módulo en `backend/src/modules/<id>/` + `ENABLED_MODULES`.
