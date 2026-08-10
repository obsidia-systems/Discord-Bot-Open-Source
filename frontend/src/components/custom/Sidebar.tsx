import { useState } from "react";
import { Menu, X } from "lucide-react";
import { brandIcon as BrandIcon, dashboardNav } from "@/lib/nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPath: string;
}

function isActive(href: string, currentPath: string): boolean {
  if (href === "/dashboard") {
    return currentPath === "/dashboard" || currentPath === "/dashboard/";
  }
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function NavLinks({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {dashboardNav.map((section) => (
        <div key={section.id}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {section.label}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, currentPath);
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.soon && (
                      <Badge className="opacity-70 group-hover:opacity-100">
                        Soon
                      </Badge>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ currentPath }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <div className="flex items-center gap-2">
          <BrandIcon className="size-4 text-primary" aria-hidden />
          <span className="font-display text-sm font-semibold tracking-wide">
            Adobos Bot
          </span>
        </div>
      </div>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
          aria-label="Cerrar overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="hidden h-14 items-center gap-2 border-b border-border px-4 lg:flex">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BrandIcon className="size-4" aria-hidden />
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-none">
              Adobos Bot
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Panel self-hosted</p>
          </div>
        </div>

        <NavLinks currentPath={currentPath} onNavigate={() => setOpen(false)} />

        <div className="border-t border-border p-4 text-xs text-muted-foreground">
          Modular · SQLite · Discord.js
        </div>
      </aside>
    </>
  );
}
