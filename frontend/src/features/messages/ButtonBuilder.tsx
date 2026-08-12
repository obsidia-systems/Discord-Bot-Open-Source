import { Plus, Trash2 } from "lucide-react";
import type { MessageActionRowInput, MessageButtonStyle } from "@adobos/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ButtonKind = "action" | "link";

const ACTION_STYLES: Exclude<MessageButtonStyle, "Link">[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
];

const STYLE_PREVIEW: Record<MessageButtonStyle, string> = {
  Primary: "bg-[#5865F2] text-white",
  Secondary: "bg-[#4e5058] text-white",
  Success: "bg-[#248046] text-white",
  Danger: "bg-[#DA373C] text-white",
  Link: "bg-transparent text-[#00a8fc] underline-offset-2 underline",
};

interface ButtonBuilderProps {
  rows: MessageActionRowInput[];
  onChange: (rows: MessageActionRowInput[]) => void;
  disabled?: boolean;
}

function emptyButton(): MessageActionRowInput["buttons"][number] {
  return {
    label: "Botón",
    style: "Primary",
    customId: `test_button_1`,
    url: "",
  };
}

function kindOf(
  button: MessageActionRowInput["buttons"][number],
): ButtonKind {
  return button.style === "Link" ? "link" : "action";
}

function sanitizeCustomId(value: string): string {
  return value.replace(/\s+/g, "_");
}

export function ButtonBuilder({ rows, onChange, disabled }: ButtonBuilderProps) {
  function addRow(): void {
    if (rows.length >= 5) return;
    onChange([...rows, { buttons: [emptyButton()] }]);
  }

  function removeRow(rowIndex: number): void {
    onChange(rows.filter((_, index) => index !== rowIndex));
  }

  function addButton(rowIndex: number): void {
    const row = rows[rowIndex];
    if (!row || row.buttons.length >= 5) return;
    const next = rows.map((item, index) =>
      index === rowIndex
        ? { buttons: [...item.buttons, emptyButton()] }
        : item,
    );
    onChange(next);
  }

  function removeButton(rowIndex: number, buttonIndex: number): void {
    const next = rows
      .map((item, index) => {
        if (index !== rowIndex) return item;
        return {
          buttons: item.buttons.filter((_, i) => i !== buttonIndex),
        };
      })
      .filter((item) => item.buttons.length > 0);
    onChange(next);
  }

  function updateButton(
    rowIndex: number,
    buttonIndex: number,
    patch: Partial<MessageActionRowInput["buttons"][number]>,
  ): void {
    const next = rows.map((item, index) => {
      if (index !== rowIndex) return item;
      return {
        buttons: item.buttons.map((button, i) =>
          i === buttonIndex ? { ...button, ...patch } : button,
        ),
      };
    });
    onChange(next);
  }

  function setKind(
    rowIndex: number,
    buttonIndex: number,
    kind: ButtonKind,
  ): void {
    if (kind === "link") {
      updateButton(rowIndex, buttonIndex, {
        style: "Link",
        customId: undefined,
        url: "",
      });
      return;
    }

    updateButton(rowIndex, buttonIndex, {
      style: "Primary",
      url: undefined,
      customId: `test_button_1`,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Componentes (Botones)</CardTitle>
        <CardDescription>
          Elige entre enlace externo o acción interna (`customId`). Prueba con{" "}
          <code className="font-mono text-xs">test_button_1</code> para el handler
          de ejemplo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay filas. Añade una para empezar.
          </p>
        )}

        {rows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Fila {rowIndex + 1}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || row.buttons.length >= 5}
                  onClick={() => addButton(rowIndex)}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Botón
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => removeRow(rowIndex)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {row.buttons.map((button, buttonIndex) => {
                const kind = kindOf(button);
                return (
                  <div
                    key={`row-${rowIndex}-btn-${buttonIndex}`}
                    className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-2"
                  >
                    <div className="space-y-2">
                      <Label>Etiqueta</Label>
                      <Input
                        value={button.label}
                        maxLength={80}
                        disabled={disabled}
                        onChange={(event) =>
                          updateButton(rowIndex, buttonIndex, {
                            label: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tipo de botón</Label>
                      <Select
                        value={kind}
                        disabled={disabled}
                        onValueChange={(value) =>
                          setKind(rowIndex, buttonIndex, value as ButtonKind)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="action">
                            Acción interna (Custom ID)
                          </SelectItem>
                          <SelectItem value="link">Enlace (URL)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {kind === "action" ? (
                      <>
                        <div className="space-y-2">
                          <Label>Estilo</Label>
                          <Select
                            value={
                              button.style === "Link" ? "Primary" : button.style
                            }
                            disabled={disabled}
                            onValueChange={(style) =>
                              updateButton(rowIndex, buttonIndex, {
                                style: style as MessageButtonStyle,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Estilo" />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_STYLES.map((style) => (
                                <SelectItem key={style} value={style}>
                                  {style}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>customId</Label>
                          <Input
                            value={button.customId ?? ""}
                            maxLength={100}
                            placeholder="test_button_1"
                            disabled={disabled}
                            onChange={(event) =>
                              updateButton(rowIndex, buttonIndex, {
                                customId: sanitizeCustomId(event.target.value),
                              })
                            }
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Sin espacios. Ej. <code className="font-mono">test_button_1</code>
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2 sm:col-span-2">
                        <Label>URL</Label>
                        <Input
                          value={button.url ?? ""}
                          placeholder="https://…"
                          disabled={disabled}
                          onChange={(event) =>
                            updateButton(rowIndex, buttonIndex, {
                              url: event.target.value,
                              style: "Link",
                            })
                          }
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 sm:col-span-2">
                      <span
                        className={cn(
                          "inline-flex h-8 items-center rounded px-3 text-xs font-medium",
                          STYLE_PREVIEW[button.style],
                        )}
                      >
                        {button.label || "Botón"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeButton(rowIndex, buttonIndex)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Quitar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          disabled={disabled || rows.length >= 5}
          onClick={addRow}
        >
          <Plus className="size-4" aria-hidden />
          Añadir fila de acción
        </Button>
      </CardContent>
    </Card>
  );
}
