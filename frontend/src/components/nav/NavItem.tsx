import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NavItemProps {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  soon?: boolean;
  onNavigate?: () => void;
}

export function NavItem({
  label,
  href,
  icon: Icon,
  active,
  soon,
  onNavigate,
}: NavItemProps) {
  return (
    <li>
      <a
        href={href}
        onClick={onNavigate}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          active
            ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
            : "text-muted-foreground hover:bg-accent/80 hover:text-foreground",
        )}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <span
            className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
            aria-hidden
          />
        )}
        <Icon
          className={cn(
            "size-4 shrink-0 transition-colors",
            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {soon && (
          <Badge className="border-primary/20 bg-primary/10 text-primary opacity-80 group-hover:opacity-100">
            Soon
          </Badge>
        )}
      </a>
    </li>
  );
}
