import { Plus, Trash2 } from "lucide-react";
import type { MessageActionRowInput } from "@adobos/shared";
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

interface ButtonBuilderProps {
  rows: MessageActionRowInput[];
  onChange: (rows: MessageActionRowInput[]) => void;
  disabled?: boolean;
}

function emptyButton(): MessageActionRowInput["buttons"][number] {
  return {
    label: "Enlace",
    style: "Link",
    url: "https://",
  };
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
          i === buttonIndex
            ? { ...button, ...patch, style: "Link" as const }
            : button,
        ),
      };
    });
    onChange(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Link buttons</CardTitle>
        <CardDescription>
          Up to 5 rows × 5 buttons. Each one opens an http(s) URL. Role and
          form buttons live in Autoroles and Forms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rows yet. Add one to get started.
          </p>
        )}

        {rows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="space-y-3 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Row {rowIndex + 1}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || row.buttons.length >= 5}
                  onClick={() => addButton(rowIndex)}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Button
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
              {row.buttons.map((button, buttonIndex) => (
                <div
                  key={`row-${rowIndex}-btn-${buttonIndex}`}
                  className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-2"
                >
                  <div className="space-y-2">
                    <Label>Label</Label>
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
                  <div className="space-y-2 sm:col-span-2">
                    <Label>URL</Label>
                    <Input
                      value={button.url ?? ""}
                      placeholder="https://…"
                      disabled={disabled}
                      onChange={(event) =>
                        updateButton(rowIndex, buttonIndex, {
                          url: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-end sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => removeButton(rowIndex, buttonIndex)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
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
          Add row
        </Button>
      </CardContent>
    </Card>
  );
}
