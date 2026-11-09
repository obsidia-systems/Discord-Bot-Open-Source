ALTER TABLE ai_execution.binding
    ADD COLUMN system_prompt text NOT NULL DEFAULT 'Eres un bot de Discord amigable. Responde en español, de forma breve (máximo 3 frases).';

ALTER TABLE ai_execution.binding
    ADD CONSTRAINT binding_system_prompt_length CHECK (char_length(system_prompt) BETWEEN 1 AND 2000);
