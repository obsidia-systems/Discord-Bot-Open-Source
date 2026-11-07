//! Adaptador de texto. La clave de Google y la URL local no salen de este proceso ni entran en logs.

use std::time::Duration;

use reqwest::Client;

use crate::rules::AttemptClass;

const GENERATE_CONTENT: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const REPLY_LIMIT: usize = 1_800;
const WITHHELD: &str = "The output was withheld.";
const LOCAL_SYSTEM: &str =
    "Eres un bot de Discord amigable. Responde en español, de forma breve (máximo 3 frases).";

#[derive(Clone, Copy)]
enum Backend {
    Gemini,
    Local,
}

#[derive(Clone)]
pub struct TextProvider {
    http: Client,
    backend: Backend,
    /// Clave de Google o URL de Ollama. No se registra.
    credential: String,
}

pub struct ProviderOutcome {
    pub class: AttemptClass,
    pub reply: Option<String>,
    pub characters: i64,
}

impl TextProvider {
    /// Una URL local tiene prioridad. Sin URL, usa la clave de Google. Sin ninguna, no hay proveedor.
    /// # Errors
    /// Devuelve error si el cliente HTTP no puede construirse o la URL no es http(s).
    pub fn from_env() -> anyhow::Result<Option<Self>> {
        let url = std::env::var("TOBOT_AI_PROVIDER_URL").unwrap_or_default();
        let url = url.trim();
        if !url.is_empty() {
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                anyhow::bail!("text provider URL must be http or https");
            }
            return Ok(Some(Self::build(Backend::Local, url.to_owned(), 45)?));
        }
        let key = std::env::var("TOBOT_AI_PROVIDER_KEY").unwrap_or_default();
        if key.is_empty() {
            return Ok(None);
        }
        Ok(Some(Self::build(Backend::Gemini, key, 20)?))
    }

    pub const fn kind(&self) -> &'static str {
        match self.backend {
            Backend::Gemini => "gemini",
            Backend::Local => "local",
        }
    }

    /// # Errors
    /// Devuelve error si el cliente HTTP no puede construirse.
    fn build(backend: Backend, credential: String, timeout_secs: u64) -> anyhow::Result<Self> {
        let http = Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|error| anyhow::anyhow!("text provider client: {error}"))?;
        Ok(Self {
            http,
            backend,
            credential,
        })
    }

    pub async fn generate(&self, model: &str, prompt: &str) -> ProviderOutcome {
        let prompt_chars = i64::try_from(prompt.chars().count()).unwrap_or(i64::MAX);
        let local = matches!(self.backend, Backend::Local);
        if !model_id_ok(model, local) {
            return ProviderOutcome {
                class: AttemptClass::ConfirmedFailure,
                reply: None,
                characters: 0,
            };
        }
        let response = match self.backend {
            Backend::Gemini => {
                self.http
                    .post(format!("{GENERATE_CONTENT}/{model}:generateContent"))
                    .header("x-goog-api-key", &self.credential)
                    .json(&serde_json::json!({
                        "contents": [{"parts": [{"text": prompt}]}]
                    }))
                    .send()
                    .await
            }
            Backend::Local => {
                self.http
                    .post(&self.credential)
                    .json(&serde_json::json!({
                        "model": model,
                        "messages": [
                            {"role": "system", "content": LOCAL_SYSTEM},
                            {"role": "user", "content": prompt}
                        ],
                        "think": false,
                        "stream": false,
                        "options": {"num_ctx": 4096}
                    }))
                    .send()
                    .await
            }
        };
        match response {
            Err(error) => ProviderOutcome {
                class: transport_class(&error),
                reply: None,
                characters: 0,
            },
            Ok(response) => {
                let status = response.status().as_u16();
                if status != 200 {
                    tracing::warn!(
                        status,
                        class = AttemptClass::from_http(status, true).as_str(),
                        "text provider rejected the attempt"
                    );
                    return ProviderOutcome {
                        class: AttemptClass::from_http(status, true),
                        reply: None,
                        characters: 0,
                    };
                }
                let raw = response.text().await.unwrap_or_default();
                match self.backend {
                    Backend::Gemini => interpret_body(&raw, prompt_chars),
                    Backend::Local => interpret_local(&raw),
                }
            }
        }
    }
}

fn model_id_ok(model: &str, local: bool) -> bool {
    (1..=40).contains(&model.len())
        && model.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '-' | '.' | '_')
                || (local && character == ':')
        })
}

fn transport_class(error: &reqwest::Error) -> AttemptClass {
    if error.is_connect() || error.is_request() {
        AttemptClass::TimeoutNotSent
    } else {
        AttemptClass::TimeoutAfterSend
    }
}

fn interpret_body(raw: &str, prompt_chars: i64) -> ProviderOutcome {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return ProviderOutcome {
            class: AttemptClass::Uncertain,
            reply: None,
            characters: 0,
        };
    };
    let finish = value["candidates"][0]["finishReason"].as_str();
    let blocked = value["promptFeedback"]["blockReason"].is_string()
        || matches!(
            finish,
            Some("SAFETY" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII")
        );
    if blocked {
        return ProviderOutcome {
            class: AttemptClass::ConfirmedResult,
            reply: Some(WITHHELD.to_owned()),
            characters: prompt_chars,
        };
    }
    let text = value["candidates"][0]["content"]["parts"]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part["text"].as_str())
                .collect::<String>()
        })
        .unwrap_or_default();
    let reply = clip(&text);
    if reply.is_empty() {
        return ProviderOutcome {
            class: AttemptClass::ConfirmedFailure,
            reply: None,
            characters: 0,
        };
    }
    let characters = i64::try_from(reply.chars().count()).unwrap_or(i64::MAX);
    ProviderOutcome {
        class: AttemptClass::ConfirmedResult,
        reply: Some(reply),
        characters,
    }
}

fn interpret_local(raw: &str) -> ProviderOutcome {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return ProviderOutcome {
            class: AttemptClass::Uncertain,
            reply: None,
            characters: 0,
        };
    };
    let reply = clip(value["message"]["content"].as_str().unwrap_or_default());
    if reply.is_empty() {
        return ProviderOutcome {
            class: AttemptClass::ConfirmedFailure,
            reply: None,
            characters: 0,
        };
    }
    let characters = i64::try_from(reply.chars().count()).unwrap_or(i64::MAX);
    ProviderOutcome {
        class: AttemptClass::ConfirmedResult,
        reply: Some(reply),
        characters,
    }
}

fn clip(text: &str) -> String {
    text.chars().take(REPLY_LIMIT).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_content_text_is_kept_and_safety_is_withheld() {
        let body =
            r#"{"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}]}"#;
        let outcome = interpret_body(body, 4);
        assert_eq!(outcome.class, AttemptClass::ConfirmedResult);
        assert_eq!(outcome.reply.as_deref(), Some("Hello"));
        assert_eq!(outcome.characters, 5);
        let blocked = r#"{"promptFeedback":{"blockReason":"SAFETY"}}"#;
        let withheld = interpret_body(blocked, 4);
        assert_eq!(withheld.reply.as_deref(), Some(WITHHELD));
        assert_eq!(withheld.characters, 4);
        assert!(!model_id_ok("gemini/flash", false));
        assert!(model_id_ok("gemini-2.5-flash", false));
        assert!(!model_id_ok("gemma4:12b", false));
        assert!(model_id_ok("gemma4:12b-it-qat", true));
        let local = r#"{"message":{"role":"assistant","content":"Hola."},"done":true}"#;
        let outcome = interpret_local(local);
        assert_eq!(outcome.reply.as_deref(), Some("Hola."));
        assert_eq!(outcome.characters, 5);
    }
}
