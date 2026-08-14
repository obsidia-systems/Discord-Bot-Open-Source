import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface HeaderEnableSwitchProps {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (value: boolean) => void;
  /** Prefijo de id para desktop/móvil (accesibilidad). */
  idPrefix?: string;
}

/**
 * Switch ON/OFF portaleado al header del DashboardLayout
 * (`#dashboard-header-actions` / mobile), centrado verticalmente a la derecha.
 */
export function HeaderEnableSwitch({
  checked,
  disabled,
  onCheckedChange,
  idPrefix = "module",
}: HeaderEnableSwitchProps) {
  const [desktopHost, setDesktopHost] = useState<HTMLElement | null>(null);
  const [mobileHost, setMobileHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDesktopHost(document.getElementById("dashboard-header-actions"));
    setMobileHost(document.getElementById("dashboard-header-actions-mobile"));
  }, []);

  function renderControl(id: string) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 shadow-sm">
        <Label
          htmlFor={id}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {checked ? "ON" : "OFF"}
        </Label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          className="h-7 w-12 [&>span]:size-6 [&>span]:data-[state=checked]:translate-x-5"
        />
      </div>
    );
  }

  return (
    <>
      {desktopHost
        ? createPortal(renderControl(`${idPrefix}-enabled`), desktopHost)
        : null}
      {mobileHost
        ? createPortal(
            renderControl(`${idPrefix}-enabled-mobile`),
            mobileHost,
          )
        : null}
    </>
  );
}
