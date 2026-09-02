import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Dices,
  Gamepad2,
  Gift,
  Hammer,
  HandMetal,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageSquare,
  MessageSquareText,
  Mic2,
  Palette,
  Pickaxe,
  Rocket,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  Sparkles,
  Store,
  Swords,
  Target,
  Terminal,
  Ticket,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
  Bot,
  Landmark,
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
        label: "Plan y facturación",
        href: "/dashboard/general/billing",
        icon: CreditCard,
        blurb: "Planes Gratis, Pro y Business. Checkout y portal de Stripe.",
      },
      {
        label: "Perfil del bot",
        href: "/dashboard/general/bot-profile",
        icon: Bot,
        blurb: "Apodo y avatar del bot en este servidor.",
      },
      {
        label: "Comandos del Sistema",
        href: "/dashboard/general/commands",
        icon: Terminal,
        blurb: "Activa o restringe los slash commands nativos.",
      },
    ],
  },
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquareText,
    items: [
      {
        label: "Embeds",
        href: "/dashboard/messages",
        icon: MessageSquareText,
        blurb: "Constructor de embeds, fields y botones Link.",
      },
      {
        label: "Texto plano",
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
        label: "Auto-Delete",
        href: "/dashboard/moderation/auto-delete",
        icon: Trash2,
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
        label: "Levels",
        href: "/dashboard/community/levels",
        icon: TrendingUp,
        blurb: "Niveles por texto, voz y gamificación.",
      },
      {
        label: "Roles Builder",
        href: "/dashboard/community/roles-builder",
        icon: Palette,
        blurb: "Crea y edita roles con color, permisos y jerarquía.",
      },
      {
        label: "Forms",
        href: "/dashboard/community/forms",
        icon: ClipboardList,
        blurb: "Solicitudes y formularios en Discord.",
      },
      {
        label: "Sorteos",
        href: "/dashboard/community/giveaways",
        icon: Gift,
        soon: true,
        blurb: "Giveaways con requisitos y ganadores.",
      },
    ],
  },
  {
    id: "support",
    label: "Soporte y Tickets",
    icon: LifeBuoy,
    defaultCollapsed: true,
    items: [
      {
        label: "Paneles",
        href: "/dashboard/support/panels",
        icon: Ticket,
        soon: true,
        blurb: "Mensajes y botones para abrir tickets.",
      },
      {
        label: "Ajustes de Tickets",
        href: "/dashboard/support/settings",
        icon: Settings2,
        soon: true,
        blurb: "Categorías, staff, transcripts y cierre.",
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
        label: "Scheduled Messages",
        href: "/dashboard/automation/scheduled",
        icon: CalendarClock,
        blurb: "Anuncios y recordatorios en horario.",
      },
      {
        label: "Custom Commands",
        href: "/dashboard/automation/custom-commands",
        icon: Terminal,
        blurb: "Respuestas y slash commands propios.",
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
        label: "Banco y Ajustes",
        href: "/dashboard/economy/settings",
        icon: Landmark,
        blurb: "Moneda, impuesto y clasificación.",
      },
      {
        label: "Ingresos y Trabajos",
        href: "/dashboard/economy/jobs",
        icon: Briefcase,
        blurb: "Work, daily, crímenes y salarios por rol.",
      },
      {
        label: "Tienda",
        href: "/dashboard/economy/shop",
        icon: Store,
        blurb: "Ítems y roles canjeables.",
      },
      {
        label: "Casino",
        href: "/dashboard/economy/casino",
        icon: Dices,
        blurb: "Juegos de azar y apuestas.",
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
];

export const brandIcon = Hammer;

export function visibleDashboardNav(
  nav: NavCategoryConfig[] = dashboardNav,
): NavCategoryConfig[] {
  return nav
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !item.soon),
    }))
    .filter((category) => category.items.length > 0);
}

export function flattenNavItems(
  nav: NavCategoryConfig[] = visibleDashboardNav(),
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
