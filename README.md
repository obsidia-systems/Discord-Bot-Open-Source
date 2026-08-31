# Documento de Diseño y Arquitectura de Software

## Proyecto: Adobos Bot (Discord Bot Open Source)

---

### 1. Resumen Ejecutivo y Problemática

Las comunidades de Discord actuales dependen de múltiples bots de terceros para cubrir sus necesidades (moderación, bienvenida, logs, integración con juegos). Esto genera problemas de fragmentación, dependencias de servicios con muros de pago (paywalls), configuraciones dispersas en distintas páginas web y falta de personalización profunda.

**La Solución:** "Adobos Bot" nace como una solución centralizada, de código abierto y auto-hospedada (self-hosted). El objetivo es crear un bot modular y un panel de control web integrados en un mismo ecosistema. Esto permite tener control total de los datos, personalizar la experiencia al 100% (orientado a la temática del servidor "Adobos" que hace referencia a la cantante Japonesa ADO) y crear una base de código robusta que cualquier otro usuario pueda clonar y adaptar para sus propias comunidades.

---

### 2. Arquitectura del Sistema e Infraestructura

El sistema se orquesta con Docker Compose en **tres servicios**: PostgreSQL, backend (Discord + API) y frontend (panel).

* **Entorno de Desarrollo:** Computadora local (OrbStack / Docker Desktop). Astro en `:4321` hace proxy same-origin a la API.
* **Entorno de Producción:** TrueNAS SCALE u otro host. nginx publica el panel y proxifica `/api`, `/auth` y `/uploads`; Postgres y el backend no se exponen al host.
* **Estrategia de Compilación:** `docker buildx` para canvas nativo en ARM64 (dev) y AMD64 (prod).
* **Orquestación:** `docker-compose.yml` (dev, hot reload) y `docker-compose.prod.yml` (imágenes multi-etapa).

---

### 3. Stack Tecnológico (Adobos-Stack)

El proyecto se construirá como un **Monorepo** utilizando `pnpm workspaces` (o `npm workspaces`) para separar lógicamente el backend del frontend, pero manteniendo una única base de código y compartiendo tipos de TypeScript de extremo a extremo.

| Capa / Módulo | Tecnología Elegida | Justificación |
| --- | --- | --- |
| **Lenguaje Base** | TypeScript | Tipado estricto, autocompletado y seguridad en toda la pila. |
| **Bot Core** | Node.js + `discord.js` | El estándar de la industria para bots de Discord; robusto y documentado. |
| **API / Web Server** | Express.js (o Fastify) | Servirá los endpoints para el panel web y los archivos estáticos. |
| **Base de Datos** | PostgreSQL 16 | Servicio Compose; soporta varias instancias del bot contra el mismo store. |
| **ORM** | Drizzle ORM | Ligero, tipado, dialecto `postgresql`. |
| **Frontend Framework** | Astro | Velocidad extrema y generación estática para el panel de control. |
| **UI Interactiva** | React + Tailwind CSS | Componentes dinámicos (Astro Islands) con diseño responsivo. |
| **Librería de UI** | Shadcn UI + Lucide | Componentes prefabricados, accesibles y con estética moderna. |

---

### 4. Requerimientos Funcionales (Alcance del Proyecto)

#### 4.1 Núcleo y Utilidades Base

* **Mensajes y Embeds:** Creación, edición y envío de mensajes enriquecidos (embeds) desde el panel web.
* **Action Logs (Auditoría):** Registro detallado de eventos de mensajes (borrado, edición), miembros (entradas, salidas, baneos), roles y canales. Posibilidad de ignorar canales o roles específicos.
* **Gestión de Miembros:** Sistema de bienvenidas y despedidas personalizadas (mensajes y tarjetas visuales).
* **Automatización:** Auto-eliminación de mensajes en canales específicos y mensajes automáticos programados.
* **Formularios:** Generación de encuestas y formularios interactivos vía menús y modales de Discord.

#### 4.2 Moderación y Gestión de Roles

* **Comandos de Moderación:** Herramientas para banear, desbanear, silenciar y limpiar canales.
* **Autoroles:** Asignación automática de roles a nuevos miembros e interfaces (menús/botones) para que los usuarios elijan sus preferencias (ej. juegos, pronombres).
* **Auto-Mod (Opcional):** Filtros básicos de protección contra spam o palabras bloqueadas.

#### 4.3 Engagement y Gamificación

* **Sistema de Niveles:** Otorgamiento de XP por mensajes de texto e interacción en canales de voz, con roles asignados automáticamente por nivel.
* **Economía Virtual:** Sistema de monedas canjeables por recompensas (ej. roles especiales), incluyendo minijuegos (ruleta, casino).

#### 4.4 Sistema de Plugins Opcionales (Módulos Integrados)

* **Integración Minecraft:** Conexión con la API de Crafty Controller para ver estado del servidor, cantidad de jugadores y enviar comandos RCON (encender, apagar, op).
* **Integración Osu!:** Consumo de la API oficial para trackear salas, compartir mapas, replays y estadísticas.
* **Integración Valorant:** Visualización de la tienda diaria, night market y trackers (mediante APIs comunitarias).
* **Alertas y Trackers:** Notificaciones de streams en Twitch/Kick, juegos gratis (Epic/Steam) y novedades de juegos Gacha (Genshin Impact, WuWa, NTE).

---

### 5. Requerimientos No Funcionales

1. **Datos en Postgres:** El bot y el panel hablan con PostgreSQL (servicio Compose). Los uploads siguen en `DATA_DIR` (volumen `/data`).
2. **Disponibilidad 24/7:** El sistema debe manejar reconexiones automáticas al WebSocket de Discord en caso de micro-cortes de red en el host TrueNAS.
3. **Modularidad:** El código debe estar diseñado de forma que añadir o quitar un plugin (ej. el módulo de Minecraft) no afecte el funcionamiento del núcleo del bot.
4. **Aislamiento de Datos:** Postgres y `DATA_DIR` van en volúmenes persistentes del host para no perder datos al actualizar la imagen.

---

```text
adobos-bot/
├── packages/shared/          # Contratos DTOs (FE ↔ BE)
├── backend/src/
│   ├── core/                 # Kernel: Client, Express, ModuleRegistry
│   ├── modules/              # Bloques Lego (welcome, messages, autoroles, …)
│   ├── db/                   # Postgres + Drizzle (infra compartida)
│   └── lib/                  # Utilidades de infra (uploads paths, media)
└── frontend/src/
    ├── pages/                # Thin routes Astro
    ├── features/             # UI por dominio (simétrico a modules/)
    ├── components/ui/        # Shadcn agnóstico
    ├── components/shared/    # Piezas reutilizables (HybridImage, ComingSoon)
    └── lib/api/              # Clientes HTTP por dominio
```

**Regla Lego:** nuevo feature = carpeta en `backend/src/modules/<id>` + `frontend/src/features/<id>` + entrada en `ENABLED_MODULES` (+ opcional nav). Sin tocar el kernel.

### 6. Estructura del Repositorio (Monorepo) — detalle histórico

```text
adobos-bot/
├── .env                        # Variables globales (Discord Token, Puertos)
├── .gitignore
├── Dockerfile                  # Backend de producción (API + bot)
├── docker-compose.yml          # Dev: postgres + backend + frontend
├── docker-compose.prod.yml     # Prod: postgres interno + backend + nginx
├── docker/                     # Dockerfile.dev, Dockerfile.frontend, nginx.conf
├── package.json                # Define los workspaces ("backend" y "frontend")
│
├── backend/                    # EL CEREBRO (Bot + API + Base de datos)
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts       # Configuración para migraciones de DB
│   └── src/
│       ├── index.ts            # Entrypoint: Levanta Express y conecta discord.js
│       ├── api/                # Endpoints de Express (ej. /api/stats, /api/modules)
│       │   ├── controllers/
│       │   └── routes/
│       ├── bot/                # Todo lo relacionado a Discord
│       │   ├── commands/       # Comandos Slash (/chisme, /play)
│       │   ├── events/         # Listeners (messageCreate, guildMemberAdd)
│       │   └── utils/          # Helpers (Embed builders personalizados)
│       └── db/                 # Base de Datos (Postgres)
│           ├── schema.ts       # Tablas (Usuarios, Economía, Logs) definidas en Drizzle
│           └── client.ts       # Pool postgres.js + migraciones al arranque
│
└── frontend/                   # EL ROSTRO (Dashboard web)
    ├── package.json
    ├── astro.config.mjs
    ├── tailwind.config.mjs
    ├── components.json         # Configuración de Shadcn UI
    ├── tsconfig.json
    ├── public/                 # Assets crudos (Imágenes, favicon)
    └── src/
        ├── pages/              # Rutas de Astro (ej. /dashboard, /login, /modules)
        ├── layouts/            # Plantillas base de Astro
        ├── components/         # Componentes React interactivos
        │   ├── ui/             # Componentes de Shadcn (Botones, Inputs, Tablas)
        │   └── custom/         # Tus propios componentes (EmbedPreview, ModuleSwitch)
        └── lib/                # Utilidades de frontend
            └── api.ts          # Funciones para hacer fetch a tu backend de Express

```

### 7. Todas las funciones

Los alcances o funcionalidades (Requerimientos funcionales) que he pensado son:

[x] - Mensajes Embed

[x] - Autoroles (reaccion, menus, etc)

[x] - Bienvenida/Despedida/Ban

[ ] - Integracion con servidor de minecraft (colocando credenciales o algo asi)
	[ ] -> Estatus del servidor (Online u Offline / Cantidad de Players)
	[ ] -> Comandos de administrador (Apagar / Prender / Reiniciar / Banear / Unban / Lista de OP / etc. )

[x] - Action logs (Eventos)
	[x] -> De mensajes: delete, edit, etc.
	[x] -> De miembros: join, leave, role add, rol remove, ban, unban
	[x] -> De roles: Creacion, borrado, actualizacion
	[x] -> Canales: creacion, borrado, actualizacion
	[x] -> Emojis/Stickers/Sonidos: creacion, borrado, actualizacion
	[x] -> Opcion de ignorar eventos de ciertos canales de texto o voz y de ciertos roles

[ ] - Auto delete de mensajes

[ ] - Mensajes automaticos (Como programar eventos o que con ciertos comandos se lancen o asi)

[x] - Auto mod (No se si implementarlo o no realmente)

[ ] - auto roles
	[x] -> Que pueda dar un rol en especifico a los nuevos miembros
	[ ] -> Rangos (Asiganr roles por nivel de interaccion en texto, tiempo en chat de voz, niveles de XP, etc - gamificar los roles)

[ ] - Generar comandos custom

[ ] - Generar formulacios o encuestas

[x] - Moderacion (funciones)

[x] - Customizacion del perfil del bot: Avatar, nombre, y asi

[ ] - Anuncios de encendido de Twitch, Kick, nuevo TikTok, etc, linkeando cuentas que deben trackearse.

[ ] - Opciones de OSU!, como trackear sala o un comando para que pueda compartir la sala a jugar, compartir mapas, o compartir una repeticion o skins del juego (consumiento api de OSU? o como lo hacen otros bots?)

[ ] - Utilidades de valorant
	-> Ver tienda, night market, tracker etc.

[ ] - Anuncios de juegos gratis en EpicGames o en Steam

[ ] - Anuncios de actualizacion de gatchas como NTE, Genshin, WuWa que serian de version, eventos o builds de personajes

[ ] - Economia (metodos de ganar economia, casino tipo gambling, ruleta pocker etc, y que se pueda canjear esto por recompensas - roles?)

[ ] - Pokemon: Formacion de equipos competitivos, objetos, formas, debilidades, coberturas, movesets, stats, donde conseguir cierto pokemon, etc.

[ ] - League of Legends: ...

[ ] - Esports transmiciones: Valorant, rocket, LoL, etc.

[ ] - TTS bot con voz custom (basado en TTS Bot - repo anexo despues)

[ ] - Posible integracion de webhoks para creacion de salas temporales como lo hace el bot voicemaster.

[ ] - Integracion de reproduccion de musica. (checar si el bot puede reproducir en multiples canales a la vez con diferente musica o asi)



### Posible migracion a SaaS
Ver la forma de portar esto a un SaaS y darlo como servicio a multiples usuarios linkeando discor dy generar la verificacion de la app general, branding etc.
