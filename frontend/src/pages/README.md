# Pages (Astro)

Capa de **enrutamiento** del panel. Cada archivo `.astro` bajo `dashboard/` define una URL.

## Reglas

1. **Thin pages:** solo layout + import de un island desde `src/features/<dominio>`. Sin estado, sin fetch, sin formularios largos.
2. **Jerarquía = dominio:** las carpetas bajo `dashboard/` reflejan features/módulos (`messages/`, `welcome/`, `moderation/`, …).
3. **ComingSoon:** stubs usan `components/shared/ComingSoon.astro` hasta que exista UI en `features/`.
4. **Redirects:** rutas legacy (`bienvenidas.astro`, `autoroles.astro`, …) redirigen a la URL anidada nueva.

## Estructura

Ver `dashboard/` — subcarpetas por dominio. La home del panel es `dashboard/index.astro`.
