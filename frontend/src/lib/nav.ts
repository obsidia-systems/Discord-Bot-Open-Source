import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  Ban,
  Bot,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Dices,
  DoorOpen,
  Gift,
  Hammer,
  HandMetal,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  Mic2,
  Palette,
  Pickaxe,
  Puzzle,
  Radio,
  Reply,
  Rocket,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldBan,
  Sparkles,
  Star,
  Store,
  Swords,
  Tags,
  Target,
  Terminal,
  Ticket,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

export interface NavItemConfig {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Route not fully implemented yet. */
  soon?: boolean;
  /** Short description for the dashboard home. */
  blurb?: string;
}

export interface NavCategoryConfig {
  id: string;
  label: string;
  /** Category icon (group header). */
  icon: LucideIcon;
  /**
   * @deprecated The sidebar accordion opens the category of the active route;
   * `general` stays open. Ignored at runtime.
   */
  defaultCollapsed?: boolean;
  items: NavItemConfig[];
}

/**
 * Single source of truth for the dashboard menu.
 * `href` values are kept stable on purpose and do not necessarily mirror the
 * category structure (page files still live under `pages/dashboard/<domain>/…`).
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
        blurb: "Bot and API status, quick links.",
      },
      {
        label: "Plan & Billing",
        href: "/dashboard/general/billing",
        icon: CreditCard,
        blurb: "Free, Pro and Business plans. Stripe checkout and portal.",
      },
      {
        label: "Bot Profile",
        href: "/dashboard/general/bot-profile",
        icon: Bot,
        blurb: "The bot's nickname and avatar on this server.",
      },
      {
        label: "System Commands",
        href: "/dashboard/general/commands",
        icon: Terminal,
        blurb: "Enable or restrict the native slash commands.",
      },
    ],
  },
  {
    id: "messages",
    label: "Messages & Announcements",
    icon: Megaphone,
    items: [
      {
        label: "Embeds",
        href: "/dashboard/messages",
        icon: MessageSquareText,
        blurb: "Embed builder: fields, images and link buttons.",
      },
      {
        label: "Plain Text",
        href: "/dashboard/messages/legacy",
        icon: MessageSquare,
        blurb: "Quick plain-text messages.",
      },
      {
        label: "Scheduled Messages",
        href: "/dashboard/automation/scheduled",
        icon: CalendarClock,
        blurb: "Post to a channel at a fixed time.",
      },
      {
        label: "Auto-Replies",
        href: "/dashboard/automation/auto-replies",
        icon: Reply,
        blurb: "Automatic response to a keyword.",
      },
    ],
  },
  {
    id: "welcome",
    label: "Welcome",
    icon: DoorOpen,
    items: [
      {
        label: "On Join",
        href: "/dashboard/welcome",
        icon: UserPlus,
        blurb: "PNG card when a member joins.",
      },
      {
        label: "On Leave",
        href: "/dashboard/leave",
        icon: LogOut,
        blurb: "PNG card when a member leaves.",
      },
      {
        label: "On Ban",
        href: "/dashboard/ban",
        icon: Ban,
        blurb: "PNG card when a member is banned.",
      },
      {
        label: "Boosts",
        href: "/dashboard/boost",
        icon: Rocket,
        blurb: "Celebrate server boosts.",
      },
    ],
  },
  {
    id: "moderation",
    label: "Moderation",
    icon: Shield,
    items: [
      {
        label: "Tools",
        href: "/dashboard/moderation",
        icon: Shield,
        blurb: "Ban, mute, purge and utilities.",
      },
      {
        label: "Server Audit",
        href: "/dashboard/server-audit",
        icon: ClipboardList,
        blurb: "Mirror of Discord's native audit log.",
      },
      {
        label: "Action Logs",
        href: "/dashboard/moderation/action-logs",
        icon: ScrollText,
        blurb: "Message, member and role audit trail.",
      },
      {
        label: "Auto-Mod",
        href: "/dashboard/moderation/auto-mod",
        icon: ShieldAlert,
        blurb: "Anti-spam filters and blocked words.",
      },
      {
        label: "Auto-Delete",
        href: "/dashboard/moderation/auto-delete",
        icon: Trash2,
        blurb: "Automatic message cleanup in channels.",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: ShieldBan,
    items: [
      {
        label: "Anti-Raid & Anti-Nuke",
        href: "/dashboard/moderation/anti-raid",
        icon: ShieldBan,
        blurb: "Join floods, lockdown and anti-nuke limits.",
      },
    ],
  },
  {
    id: "roles",
    label: "Roles",
    icon: Tags,
    items: [
      {
        label: "Autoroles",
        href: "/dashboard/community/autoroles",
        icon: HandMetal,
        blurb: "Roles by reaction, menu or button.",
      },
      {
        label: "Roles Builder",
        href: "/dashboard/community/roles-builder",
        icon: Palette,
        blurb: "Create and edit roles: color, permissions, hierarchy.",
      },
    ],
  },
  {
    id: "community",
    label: "Community & Engagement",
    icon: Users,
    items: [
      {
        label: "Levels",
        href: "/dashboard/community/levels",
        icon: TrendingUp,
        blurb: "XP from text, voice and level rewards.",
      },
      {
        label: "Starboard",
        href: "/dashboard/community/starboard",
        icon: Star,
        blurb: "Board for messages with enough reactions.",
      },
      {
        label: "Giveaways",
        href: "/dashboard/community/giveaways",
        icon: Gift,
        blurb: "Giveaways with requirements, entry button and reroll.",
      },
      {
        label: "Forms",
        href: "/dashboard/community/forms",
        icon: ClipboardList,
        blurb: "Requests and forms inside Discord.",
      },
      {
        label: "Voice Rooms",
        href: "/dashboard/community/voice-rooms",
        icon: Mic2,
        blurb: "Temporary voice channels (join to create).",
      },
    ],
  },
  {
    id: "economy",
    label: "Economy",
    icon: CircleDollarSign,
    items: [
      {
        label: "Bank & Settings",
        href: "/dashboard/economy/settings",
        icon: Landmark,
        blurb: "Currency, tax and leaderboard.",
      },
      {
        label: "Income & Jobs",
        href: "/dashboard/economy/jobs",
        icon: Briefcase,
        blurb: "Work, daily, crimes and per-role salaries.",
      },
      {
        label: "Shop",
        href: "/dashboard/economy/shop",
        icon: Store,
        blurb: "Redeemable items and roles.",
      },
      {
        label: "Casino",
        href: "/dashboard/economy/casino",
        icon: Dices,
        blurb: "Games of chance and betting.",
      },
    ],
  },
  {
    id: "support",
    label: "Support & Tickets",
    icon: LifeBuoy,
    items: [
      {
        label: "Panels",
        href: "/dashboard/support/panels",
        icon: Ticket,
        blurb: "Messages and buttons to open tickets.",
      },
      {
        label: "Ticket Settings",
        href: "/dashboard/support/settings",
        icon: Settings2,
        blurb: "Inbox, categories, staff, transcripts and closing.",
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    icon: CalendarClock,
    items: [
      {
        label: "Custom Commands",
        href: "/dashboard/automation/custom-commands",
        icon: Terminal,
        blurb: "Your own responses and slash commands.",
      },
      {
        label: "Reminders",
        href: "/dashboard/automation/reminders",
        icon: AlarmClock,
        blurb: "Personal reminders via /remind.",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Puzzle,
    items: [
      {
        label: "Stream Alerts",
        href: "/dashboard/plugins/alerts",
        icon: Radio,
        blurb: "Twitch, YouTube and Kick when going live.",
      },
      {
        label: "Minecraft",
        href: "/dashboard/plugins/minecraft",
        icon: Pickaxe,
        soon: true,
        blurb: "Server status and RCON commands.",
      },
      {
        label: "Osu!",
        href: "/dashboard/plugins/osu",
        icon: Target,
        soon: true,
        blurb: "Rooms, maps, replays and skins.",
      },
      {
        label: "Valorant",
        href: "/dashboard/plugins/valorant",
        icon: Swords,
        soon: true,
        blurb: "Store, night market and trackers.",
      },
      {
        label: "Free Games",
        href: "/dashboard/plugins/free-games",
        icon: Gift,
        soon: true,
        blurb: "Epic Games, Steam and deals.",
      },
      {
        label: "Gachas",
        href: "/dashboard/plugins/gachas",
        icon: Sparkles,
        soon: true,
        blurb: "Genshin, WuWa, NTE and builds.",
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

/** Modules ready to feature on the home page (without `soon`). */
export function getReadyModules(): NavItemConfig[] {
  return flattenNavItems().filter(
    (item) => !item.soon && item.href !== "/dashboard",
  );
}

/** Upcoming modules (with `soon`), capped so the home page stays tidy. */
export function getSoonModules(limit = 8): NavItemConfig[] {
  return flattenNavItems()
    .filter((item) => item.soon)
    .slice(0, limit);
}
