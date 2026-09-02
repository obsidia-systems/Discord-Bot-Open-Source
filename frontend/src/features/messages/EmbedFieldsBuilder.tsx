import { Plus, Trash2 } from "lucide-react";
import {
  EMBED_FIELDS_MAX,
  EMBED_FIELD_NAME_MAX,
  EMBED_FIELD_VALUE_MAX,
  type EmbedFieldInput,
} from "@adobos/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EmbedFieldsBuilderProps {
  fields: EmbedFieldInput[];
  onChange: (fields: EmbedFieldInput[]) => void;
  disabled?: boolean;
}

function emptyField(): EmbedFieldInput {
  return { name: "", value: "", inline: false };
}

export function EmbedFieldsBuilder({
  fields,
  onChange,
  disabled,
}: EmbedFieldsBuilderProps) {
  function addField(): void {
    if (fields.length >= EMBED_FIELDS_MAX) return;
    onChange([...fields, emptyField()]);
  }

  function removeField(index: number): void {
    onChange(fields.filter((_, i) => i !== index));
  }

  function updateField(
    index: number,
    patch: Partial<EmbedFieldInput>,
  ): void {
    onChange(
      fields.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Fields</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || fields.length >= EMBED_FIELDS_MAX}
          onClick={addField}
        >
          <Plus className="size-3.5" aria-hidden />
          Field
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Hasta {EMBED_FIELDS_MAX}. Nombre 256, valor 1024. Inline agrupa de a 3
        como Discord.
      </p>
      {fields.map((field, index) => (
        <div
          key={`field-${index}`}
          className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Field {index + 1}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => removeField(index)}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
          <Input
            value={field.name}
            maxLength={EMBED_FIELD_NAME_MAX}
            placeholder="Nombre"
            disabled={disabled}
            onChange={(event) =>
              updateField(index, { name: event.target.value })
            }
          />
          <Textarea
            value={field.value}
            maxLength={EMBED_FIELD_VALUE_MAX}
            rows={2}
            placeholder="Valor"
            disabled={disabled}
            onChange={(event) =>
              updateField(index, { value: event.target.value })
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(field.inline)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                updateField(index, { inline: checked === true })
              }
            />
            Inline
          </label>
        </div>
      ))}
    </div>
  );
}
