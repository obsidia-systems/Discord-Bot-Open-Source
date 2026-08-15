import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Gamepad2,
  Gift,
  Hammer,
  HandMetal,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MessageSquareText,
  Mic2,
  Pickaxe,
  Rocket,
  ScrollText,
  Shield,
  ShieldAlert,
  Sparkles,
  Swords,
  Target,
  Terminal,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
  Bot,
} from "lucide-react";

export interface NavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Ruta aún sin implementación completa. */
  soon?: boolean;
  /** Descripción corta para la home del dashboard. */
  blurb?: string;
}

export interface NavCategoryConfig {
  id: string;
  label: string;
  /** Icono de la categoría (cabecera del grupo). */
  icon: LucideIcon;
  /**
   * @deprecated El acordeón del sidebar abre la categoría de la ruta activa;
   * `general` siempre queda abierta. Se ignora en runtime.
   */
  defaultCollapsed?: boolean;
  items: NavItemConfig[];
}

/**
 * Fuente única de verdad del menú.
 * Los `href` reflejan `pages/dashboard/<dominio>/…` (rutas anidadas).
 */
export const dashboardNav: NavCategoryConfig[] = [
  {
    id: "general",
    label: "General",
    icon: LayoutDashboard,
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        blurb: "Estado del bot, API y accesos rápidos.",
      },
      {
        label: "Perfil del bot",
        href: "/dashboard/general/bot-profile",
        icon: Bot,
        blurb: "Apodo y avatar del bot en este servidor.",
      },
    ],
  },
  {
    id: "messages",
    label: "Mensajes",
    icon: MessageSquareText,
    items: [
      {
        label: "Mensajes Embed",
        href: "/dashboard/messages",
        icon: MessageSquareText,
        blurb: "Constructor de embeds y botones.",
      },
      {
        label: "Mensajes Legacy",
        href: "/dashboard/messages/legacy",
        icon: MessageSquare,
        blurb: "Envío rápido de texto plano.",
      },
    ],
  },
  {
    id: "automated",
    label: "Mensajes automatizados",
    icon: Zap,
    items: [
      {
        label: "Bienvenida",
        href: "/dashboard/welcome",
        icon: UserPlus,
        blurb: "Tarjetas PNG al unirse al servidor.",
      },
      {
        label: "Despedida",
        href: "/dashboard/leave",
        icon: LogOut,
        blurb: "Tarjeta PNG al salir del servidor.",
      },
      {
        label: "Baneo",
        href: "/dashboard/ban",
        icon: Ban,
        blurb: "Tarjeta PNG al banear a un miembro.",
      },
      {
        label: "Boosts",
        href: "/dashboard/boost",
        icon: Rocket,
        blurb: "Celebrar boosts del servidor.",
      },
    ],
  },
  {
    id: "moderation",
    label: "Moderación",
    icon: Shield,
    items: [
      {
        label: "Herramientas",
        href: "/dashboard/moderation",
        icon: Shield,
        blurb: "Ban, mute, purge y utilidades.",
      },
      {
        label: "Auditoría General",
        href: "/dashboard/server-audit",
        icon: ClipboardList,
        blurb: "Espejo del Audit Log nativo de Discord.",
      },
      {
        label: "Action Logs",
        href: "/dashboard/moderation/action-logs",
        icon: ScrollText,
        blurb: "Auditoría de mensajes, miembros y roles.",
      },
      {
        label: "Auto-Mod",
        href: "/dashboard/moderation/auto-mod",
        icon: ShieldAlert,
        blurb: "Filtros anti-spam y palabras bloqueadas.",
      },
      {
        label: "Auto-delete",
        href: "/dashboard/moderation/auto-delete",
        icon: Trash2,
        soon: true,
        blurb: "Borrado automático en canales.",
      },
    ],
  },
  {
    id: "community",
    label: "Roles y comunidad",
    icon: Users,
    defaultCollapsed: true,
    items: [
      {
        label: "Autoroles",
        href: "/dashboard/community/autoroles",
        icon: HandMetal,
        blurb: "Roles por reacción, menú o botón.",
      },
      {
        label: "Rangos y XP",
        href: "/dashboard/community/levels",
        icon: TrendingUp,
        blurb: "Niveles por texto, voz y gamificación.",
      },
      {
        label: "Formularios",
        href: "/dashboard/community/forms",
        icon: ClipboardList,
        soon: true,
        blurb: "Encuestas y formularios interactivos.",
      },
    ],
  },
  {
    id: "automation",
    label: "Automatización",
    icon: CalendarClock,
    defaultCollapsed: true,
    items: [
      {
        label: "Mensajes programados",
        href: "/dashboard/automation/scheduled",
        icon: CalendarClock,
        soon: true,
        blurb: "Anuncios y recordatorios en horario.",
      },
      {
        label: "Comandos custom",
        href: "/dashboard/automation/custom-commands",
        icon: Terminal,
        soon: true,
        blurb: "Respuestas y slash commands propios.",
      },
    ],
  },
  {
    id: "utilities",
    label: "Utilidades y juegos",
    icon: Gamepad2,
    defaultCollapsed: true,
    items: [
      {
        label: "Minecraft",
        href: "/dashboard/plugins/minecraft",
        icon: Pickaxe,
        soon: true,
        blurb: "Estado del server y comandos RCON.",
      },
      {
        label: "Osu!",
        href: "/dashboard/plugins/osu",
        icon: Target,
        soon: true,
        blurb: "Salas, mapas, replays y skins.",
      },
      {
        label: "Valorant",
        href: "/dashboard/plugins/valorant",
        icon: Swords,
        soon: true,
        blurb: "Tienda, night market y trackers.",
      },
      {
        label: "Alertas stream",
        href: "/dashboard/plugins/alerts",
        icon: Mic2,
        soon: true,
        blurb: "Twitch, Kick, TikTok y más.",
      },
      {
        label: "Juegos gratis",
        href: "/dashboard/plugins/free-games",
        icon: Gift,
        soon: true,
        blurb: "Epic Games, Steam y ofertas.",
      },
      {
        label: "Gachas",
        href: "/dashboard/plugins/gachas",
        icon: Sparkles,
        soon: true,
        blurb: "Genshin, WuWa, NTE y builds.",
      },
    ],
  },
  {
    id: "economy",
    label: "Economía",
    icon: CircleDollarSign,
    defaultCollapsed: true,
    items: [
      {
        label: "Economía y casino",
        href: "/dashboard/economy",
        icon: CircleDollarSign,
        soon: true,
        blurb: "Monedas, gambling y recompensas por roles.",
      },
    ],
  },
];

export const brandIcon = Hammer;

export function flattenNavItems(
  nav: NavCategoryConfig[] = dashboardNav,
): NavItemConfig[] {
  return nav.flatMap((category) => category.items);
}

export function findNavItemByHref(
  href: string,
  nav: NavCategoryConfig[] = dashboardNav,
): NavItemConfig | undefined {
  const normalized = href.replace(/\/$/, "") || "/";
  return flattenNavItems(nav).find((item) => {
    const itemHref = item.href.replace(/\/$/, "") || "/";
    return itemHref === normalized;
  });
}

/** Módulos listos para destacar en la home (sin `soon`). */
export function getReadyModules(): NavItemConfig[] {
  return flattenNavItems().filter(
    (item) => !item.soon && item.href !== "/dashboard",
  );
}

/** Próximos módulos (con `soon`), limitados para no saturar la home. */
export function getSoonModules(limit = 8): NavItemConfig[] {
  return flattenNavItems()
    .filter((item) => item.soon)
    .slice(0, limit);
}
