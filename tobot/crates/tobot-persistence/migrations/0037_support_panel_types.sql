-- Varios paneles publicados conviven. El servidor solo conserva el cupo y un caso activo por miembro.
DROP INDEX support.support_one_template_published;
DROP INDEX support.support_one_panel_published;

ALTER TABLE support.support_panel_revision
  ADD COLUMN name TEXT;

UPDATE support.support_panel_revision
SET name = button_label
WHERE name IS NULL;

ALTER TABLE support.support_panel_revision
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE support.support_panel_revision
  ADD CONSTRAINT support_panel_name_present CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);

-- Un panel que ya tiene mensaje vuelve a estar activo. Preparing, Failed y Degraded se quedan como están.
UPDATE support.support_panel_revision AS panel
SET state = 'Published'
WHERE panel.state = 'Superseded'
  AND EXISTS (
    SELECT 1
    FROM support.support_panel_binding AS binding
    WHERE binding.revision_id = panel.revision_id
  );

UPDATE support.ticket_template_revision AS revision
SET state = 'Published'
WHERE revision.state = 'Superseded'
  AND EXISTS (
    SELECT 1
    FROM support.support_panel_revision AS panel
    JOIN support.support_panel_binding AS binding
      ON binding.revision_id = panel.revision_id
    WHERE panel.template_revision_id = revision.revision_id
      AND panel.state = 'Published'
  );
