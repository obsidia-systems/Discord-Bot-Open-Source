import type { LucideIcon } from "lucide-react";
import {
  Coins,
  Gamepad2,
  Hammer,
  LayoutDashboard,
  MessageSquareText,
  Pickaxe,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Target,
  UserPlus,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Si true, la ruta aún no tiene funcionalidad completa. */
  soon?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/** Navegación del dashboard — una sola fuente de verdad para el Sidebar. */
export const dashboardNav: NavSection[] = [
  {
    id: "main",
    label: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "core",
    label: "Core",
    items: [
      {
        label: "Mensajes & Embeds",
        href: "/dashboard/messages",
        icon: MessageSquareText,
      },
      {
        label: "Action Logs",
        href: "/dashboard/action-logs",
        icon: ScrollText,
        soon: true,
      },
      {
        label: "Bienvenidas",
        href: "/dashboard/welcomes",
        icon: UserPlus,
        soon: true,
      },
    ],
  },
  {
    id: "management",
    label: "Gestión",
    items: [
      {
        label: "Autoroles",
        href: "/dashboard/autoroles",
        icon: Users,
        soon: true,
      },
      {
        label: "Moderación",
        href: "/dashboard/moderation",
        icon: Shield,
        soon: true,
      },
      {
        label: "Economía",
        href: "/dashboard/economy",
        icon: Coins,
        soon: true,
      },
    ],
  },
  {
    id: "plugins",
    label: "Plugins",
    items: [
      {
        label: "Minecraft",
        href: "/dashboard/plugins/minecraft",
        icon: Pickaxe,
        soon: true,
      },
      {
        label: "Osu!",
        href: "/dashboard/plugins/osu",
        icon: Target,
        soon: true,
      },
      {
        label: "Valorant",
        href: "/dashboard/plugins/valorant",
        icon: Swords,
        soon: true,
      },
      {
        label: "Gachas",
        href: "/dashboard/plugins/gachas",
        icon: Sparkles,
        soon: true,
      },
      {
        label: "Alertas",
        href: "/dashboard/plugins/alerts",
        icon: Gamepad2,
        soon: true,
      },
    ],
  },
];

export const brandIcon = Hammer;
