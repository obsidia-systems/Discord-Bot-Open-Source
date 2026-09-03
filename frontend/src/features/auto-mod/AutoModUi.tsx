import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

export function NestedSettings({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 pt-1">{children}</div>;
}

export function FilterToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  headerExtra,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  headerExtra?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {checked && headerExtra ? headerExtra : null}
          <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        </div>
      </div>
      {checked && children ? <NestedSettings>{children}</NestedSettings> : null}
    </div>
  );
}

export function TagListInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  emptyHint,
  maxItems,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyHint: string;
  maxItems?: number;
}) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const next = draft.trim();
    if (!next) return;
    if (maxItems !== undefined && values.length >= maxItems) return;
    const exists = values.some((v) => v.toLowerCase() === next.toLowerCase());
    if (!exists) onChange([...values, next]);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addValue();
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge
              key={value.toLowerCase()}
              className="gap-1 normal-case tracking-normal py-1 pl-2 pr-1 text-xs font-medium"
            >
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                onClick={() =>
                  onChange(
                    values.filter(
                      (v) => v.toLowerCase() !== value.toLowerCase(),
                    ),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}
