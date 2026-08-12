import { useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  brandIcon as BrandIcon,
  dashboardNav,
  flattenNavItems,
} from "@/lib/nav";
import { NavCategoryGroup } from "@/components/nav/NavCategoryGroup";
import { NavItem } from "@/components/nav/NavItem";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Categoría fija: siempre abierta, fuera del acordeón. */
const STATIC_CATEGORY_ID = "general";

interface NavSidebarProps {
  currentPath: string;
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

function isActive(href: string, currentPath: string): boolean {
  const target = normalizePath(href);
  if (target === "/dashboard") {
    return currentPath === "/dashboard";
  }
  if (currentPath === target) return true;
  if (!currentPath.startsWith(`${target}/`)) return false;

  const hasMoreSpecific = flattenNavItems().some((item) => {
    const other = normalizePath(item.href);
    return (
      other !== target &&
      other.startsWith(`${target}/`) &&
      (currentPath === other || currentPath.startsWith(`${other}/`))
    );
  });
  return !hasMoreSpecific;
}

/** Categoría acordeón que contiene la ruta activa (nunca `general`). */
function resolveOpenCategoryId(currentPath: string): string | null {
  for (const category of dashboardNav) {
    if (category.id === STATIC_CATEGORY_ID) continue;
    const match = category.items.some((item) =>
      isActive(item.href, currentPath),
    );
    if (match) return category.id;
  }
  return null;
}

function NavLinks({
  currentPath,
  openCategoryId,
  onOpenCategory,
  onNavigate,
}: {
  currentPath: string;
  openCategoryId: string | null;
  onOpenCategory: (id: string | null) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4"
      aria-label="Navegación del panel"
    >
      {dashboardNav.map((category) => {
        const isStatic = category.id === STATIC_CATEGORY_ID;
        return (
          <NavCategoryGroup
            key={category.id}
            id={category.id}
            label={category.label}
            icon={category.icon}
            staticOpen={isStatic}
            open={!isStatic && openCategoryId === category.id}
            onOpenChange={(nextOpen) => {
              if (isStatic) return;
              onOpenCategory(nextOpen ? category.id : null);
            }}
          >
            {category.items.map((item) => (
              <NavItem
                key={`${category.id}-${item.href}-${item.label}`}
                label={item.label}
                href={item.href}
                icon={item.icon}
                soon={item.soon}
                active={isActive(item.href, currentPath)}
                onNavigate={onNavigate}
              />
            ))}
          </NavCategoryGroup>
        );
      })}
    </nav>
  );
}

export function NavSidebar({ currentPath }: NavSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [path, setPath] = useState(() => normalizePath(currentPath));
  const routeCategoryId = useMemo(() => resolveOpenCategoryId(path), [path]);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(
    () => resolveOpenCategoryId(normalizePath(currentPath)),
  );

  useEffect(() => {
    setPath(normalizePath(currentPath));
  }, [currentPath]);

  useEffect(() => {
    setOpenCategoryId(routeCategoryId);
  }, [routeCategoryId]);

  useEffect(() => {
    function syncPath(): void {
      const next = normalizePath(window.location.pathname);
      setPath(next);
      setOpenCategoryId(resolveOpenCategoryId(next));
      setDrawerOpen(false);
    }

    document.addEventListener("astro:page-load", syncPath);
    document.addEventListener("astro:after-swap", syncPath);
    return () => {
      document.removeEventListener("astro:page-load", syncPath);
      document.removeEventListener("astro:after-swap", syncPath);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <>
      <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border/80 bg-card/90 px-4 backdrop-blur-md lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="border-primary/20"
          aria-label={drawerOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={drawerOpen}
          aria-controls="adobos-sidebar"
          onClick={() => setDrawerOpen((value) => !value)}
        >
          {drawerOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
            <BrandIcon className="size-3.5" aria-hidden />
          </span>
          <span className="font-display text-sm font-semibold tracking-wide">
            Adobos Bot
          </span>
        </div>
      </div>

      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside
        id="adobos-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-[17.5rem] flex-col",
          "border-r border-border/80 bg-card/95 backdrop-blur-xl",
          "transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="relative hidden shrink-0 overflow-hidden border-b border-border/80 px-4 py-4 lg:block">
          <div
            className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary/20 blur-2xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-10 left-6 size-24 rounded-full bg-[hsl(195_100%_55%/0.12)] blur-2xl"
            aria-hidden
          />
          <div className="relative flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-[hsl(265_80%_50%/0.35)] text-primary shadow-[0_0_24px_hsl(var(--primary)/0.25)]">
              <BrandIcon className="size-5" aria-hidden />
            </div>
            <div>
              <p className="font-display text-sm font-semibold leading-none tracking-wide">
                Adobos Bot
              </p>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Panel · estética Ado
              </p>
            </div>
          </div>
        </div>

        <NavLinks
          currentPath={path}
          openCategoryId={openCategoryId}
          onOpenCategory={setOpenCategoryId}
          onNavigate={() => setDrawerOpen(false)}
        />

        <div className="shrink-0 space-y-3 border-t border-border/80 p-4">
          <ThemeToggle />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Modular · SQLite · Discord.js
          </p>
        </div>
      </aside>
    </>
  );
}

/** Alias de compatibilidad con imports existentes. */
export { NavSidebar as Sidebar };
