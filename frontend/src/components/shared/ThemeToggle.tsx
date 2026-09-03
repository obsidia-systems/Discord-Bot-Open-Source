import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  applyTheme,
  getStoredTheme,
  setThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS: {
  id: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("dark");

  useEffect(() => {
    const stored = getStoredTheme();
    setPreference(stored);
    applyTheme(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onSystemChange(): void {
      if (getStoredTheme() === "system") applyTheme("system");
    }
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  function onSelect(next: ThemePreference): void {
    setPreference(next);
    setThemePreference(next);
  }

  return (
    <div
      className="inline-flex w-full rounded-lg border border-border bg-muted/40 p-1"
      role="group"
      aria-label="Interface theme"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 flex-1 gap-1.5 px-2 text-xs",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={active}
            onClick={() => onSelect(option.id)}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{option.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
