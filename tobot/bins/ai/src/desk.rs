//! Registro del proveedor, modelos y la asignación de Ask. La clave no sale en el JSON.

use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

use crate::{
    AppState, authorized,
    provider::{self, TextProvider},
    secret::{self, SecretBox},
    store::{AiError, AiStore, PricingInput},
};

const PRICE_CAP: i64 = 1_000_000_000_000;

#[derive(Clone)]
pub struct ResolvedCall {
    pub provider: Option<TextProvider>,
    pub prices: Option<(i64, i64)>,
    pub system_prompt: String,
}

#[must_use]
pub fn prices_ready(input: Option<i64>, output: Option<i64>) -> bool {
    match (input, output) {
        (Some(input), Some(output)) => {
            (0..=PRICE_CAP).contains(&input) && (0..=PRICE_CAP).contains(&output)
        }
        _ => false,
    }
}

pub async fn resolve_call(
    store: &AiStore,
    pricing_revision_id: Uuid,
    secrets: Option<&SecretBox>,
) -> Result<ResolvedCall, AiError> {
    let enabled: Option<Uuid> =
        sqlx::query_scalar("SELECT provider_id FROM ai_execution.provider WHERE enabled")
            .fetch_optional(&store.pool)
            .await?;
    let Some(enabled) = enabled else {
        return Err(AiError::Unavailable("ask is not assigned"));
    };
    let row = sqlx::query(
        "SELECT b.provider_id, b.pricing_revision_id, b.system_prompt, m.model_name, m.input_micro_usd, m.output_micro_usd, p.kind, p.base_url, p.secret_ciphertext FROM ai_execution.binding b JOIN ai_execution.model m ON m.model_id=b.model_id JOIN ai_execution.provider p ON p.provider_id=b.provider_id WHERE b.capability='ask'",
    )
    .fetch_optional(&store.pool)
    .await?;
    let Some(row) = row else {
        return Err(AiError::Unavailable("ask is not assigned"));
    };
    let provider_id: Uuid = row.try_get("provider_id")?;
    let bound_price: Uuid = row.try_get("pricing_revision_id")?;
    let input: Option<i64> = row.try_get("input_micro_usd")?;
    let output: Option<i64> = row.try_get("output_micro_usd")?;
    let (Some(input_price), Some(output_price)) = (input, output) else {
        return Err(AiError::Unavailable("ask is not assigned"));
    };
    if provider_id != enabled
        || bound_price != pricing_revision_id
        || !prices_ready(Some(input_price), Some(output_price))
    {
        return Err(AiError::Unavailable("ask is not assigned"));
    }
    let secret = open_secret(row.try_get("secret_ciphertext")?, secrets)?;
    let kind: String = row.try_get("kind")?;
    if matches!(kind.as_str(), "gemini" | "openai") && secret.is_empty() {
        return Err(AiError::Unavailable("ask is not assigned"));
    }
    let provider =
        TextProvider::from_stored(&kind, &row.try_get::<String, _>("base_url")?, &secret)
            .map_err(|_| AiError::Unavailable("ask is not assigned"))?;
    let stored: String = row.try_get("system_prompt")?;
    Ok(ResolvedCall {
        provider: Some(provider),
        prices: Some((input_price, output_price)),
        system_prompt: stored_prompt(&stored),
    })
}

fn open_secret(packed: Option<Vec<u8>>, secrets: Option<&SecretBox>) -> Result<String, AiError> {
    let Some(packed) = packed else {
        return Ok(String::new());
    };
    let Some(secrets) = secrets else {
        return Err(AiError::Unavailable("ask is not assigned"));
    };
    secrets
        .open(&packed)
        .map_err(|()| AiError::Unavailable("ask is not assigned"))
}

pub async fn desk(State(state): State<AppState>, uri: Uri, headers: HeaderMap) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match read_desk(&state).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn read_desk(state: &AppState) -> Result<Value, DeskError> {
    let providers = sqlx::query(
        "SELECT provider_id, display_name, kind, base_url, secret_hint, secret_ciphertext IS NOT NULL AS secret_configured, enabled FROM ai_execution.provider ORDER BY created_at",
    )
    .fetch_all(&state.store.pool)
    .await?;
    let mut provider_rows = Vec::new();
    for row in providers {
        provider_rows.push(json!({
            "provider_id": row.try_get::<Uuid, _>("provider_id")?,
            "display_name": row.try_get::<String, _>("display_name")?,
            "kind": row.try_get::<String, _>("kind")?,
            "base_url": row.try_get::<String, _>("base_url")?,
            "secret_hint": row.try_get::<Option<String>, _>("secret_hint")?,
            "secret_configured": row.try_get::<bool, _>("secret_configured")?,
            "enabled": row.try_get::<bool, _>("enabled")?,
        }));
    }
    let models = sqlx::query(
        "SELECT model_id, provider_id, model_name, input_micro_usd, output_micro_usd FROM ai_execution.model ORDER BY model_name",
    )
    .fetch_all(&state.store.pool)
    .await?;
    let mut model_rows = Vec::new();
    for row in models {
        model_rows.push(json!({
            "model_id": row.try_get::<Uuid, _>("model_id")?,
            "provider_id": row.try_get::<Uuid, _>("provider_id")?,
            "model_name": row.try_get::<String, _>("model_name")?,
            "input_micro_usd": row.try_get::<Option<i64>, _>("input_micro_usd")?,
            "output_micro_usd": row.try_get::<Option<i64>, _>("output_micro_usd")?,
        }));
    }
    let ask = read_ask(&state.store).await?;
    let active_price = read_active_price(&state.store).await?;
    Ok(json!({
        "secret_storage": state.secrets.is_some(),
        "providers": provider_rows,
        "models": model_rows,
        "ask": ask,
        "active_price": active_price,
    }))
}

async fn read_ask(store: &AiStore) -> Result<Value, DeskError> {
    let row = sqlx::query(
        "SELECT b.provider_id, b.model_id, b.system_prompt, m.model_name, m.input_micro_usd, m.output_micro_usd, p.pricing_revision_id, p.estimate_amount, p.maximum_amount, p.unit_charge, p.user_daily_ceiling, p.guild_daily_ceiling FROM ai_execution.binding b JOIN ai_execution.model m ON m.model_id=b.model_id JOIN ai_ledger.pricing p ON p.pricing_revision_id=b.pricing_revision_id WHERE b.capability='ask'",
    )
    .fetch_optional(&store.pool)
    .await?;
    let Some(row) = row else {
        return Ok(Value::Null);
    };
    Ok(json!({
        "provider_id": row.try_get::<Uuid, _>("provider_id")?,
        "model_id": row.try_get::<Uuid, _>("model_id")?,
        "model_name": row.try_get::<String, _>("model_name")?,
        "system_prompt": row.try_get::<String, _>("system_prompt")?,
        "input_micro_usd": row.try_get::<Option<i64>, _>("input_micro_usd")?,
        "output_micro_usd": row.try_get::<Option<i64>, _>("output_micro_usd")?,
        "pricing_revision_id": row.try_get::<Uuid, _>("pricing_revision_id")?,
        "estimate_amount": row.try_get::<i64, _>("estimate_amount")?,
        "maximum_amount": row.try_get::<i64, _>("maximum_amount")?,
        "unit_charge": row.try_get::<i64, _>("unit_charge")?,
        "user_daily_ceiling": row.try_get::<i64, _>("user_daily_ceiling")?,
        "guild_daily_ceiling": row.try_get::<i64, _>("guild_daily_ceiling")?,
    }))
}

async fn read_active_price(store: &AiStore) -> Result<Value, DeskError> {
    let row = sqlx::query(
        "SELECT pricing_revision_id, model_class, estimate_amount, maximum_amount, unit_charge, user_daily_ceiling, guild_daily_ceiling FROM ai_ledger.pricing WHERE operation_class='text' AND active",
    )
    .fetch_optional(&store.pool)
    .await?;
    let Some(row) = row else {
        return Ok(Value::Null);
    };
    Ok(json!({
        "pricing_revision_id": row.try_get::<Uuid, _>("pricing_revision_id")?,
        "model_class": row.try_get::<String, _>("model_class")?,
        "estimate_amount": row.try_get::<i64, _>("estimate_amount")?,
        "maximum_amount": row.try_get::<i64, _>("maximum_amount")?,
        "unit_charge": row.try_get::<i64, _>("unit_charge")?,
        "user_daily_ceiling": row.try_get::<i64, _>("user_daily_ceiling")?,
        "guild_daily_ceiling": row.try_get::<i64, _>("guild_daily_ceiling")?,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderBody {
    provider_id: Option<Uuid>,
    display_name: String,
    kind: String,
    base_url: String,
    secret: Option<String>,
}

pub async fn save_provider(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<ProviderBody>(&body) else {
        return invalid("Enter a provider name, type, and http(s) base URL.");
    };
    match write_provider(&state, input).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn write_provider(state: &AppState, input: ProviderBody) -> Result<Value, DeskError> {
    let name = input.display_name.trim();
    let kind = input.kind.as_str();
    let base = input.base_url.trim().trim_end_matches('/').to_owned();
    if !(1..=80).contains(&name.chars().count())
        || name.chars().any(char::is_control)
        || !matches!(kind, "gemini" | "ollama" | "openai")
        || !provider::base_url_ok(&base)
    {
        return Err(DeskError::Invalid(
            "Enter a provider name, type, and http(s) base URL.",
        ));
    }
    let secret = clean_secret(input.secret)?;
    let existing = match input.provider_id {
        Some(provider_id) => Some(load_provider(&state.store, provider_id).await?),
        None => None,
    };
    let needs_key = matches!(kind, "gemini" | "openai");
    let already_keyed = existing.as_ref().is_some_and(|row| row.keyed);
    if needs_key && secret.is_none() && !already_keyed {
        return Err(DeskError::Invalid("This provider needs an API key."));
    }
    let sealed = match &secret {
        Some(value) => Some(seal_secret(state.secrets.as_ref(), value)?),
        None => None,
    };
    let provider_id = input.provider_id.unwrap_or_else(Uuid::now_v7);
    if existing.is_some() {
        sqlx::query("UPDATE ai_execution.provider SET display_name=$2, kind=$3, base_url=$4 WHERE provider_id=$1")
            .bind(provider_id)
            .bind(name)
            .bind(kind)
            .bind(&base)
            .execute(&state.store.pool)
            .await?;
        if let Some((ciphertext, hint)) = &sealed {
            sqlx::query("UPDATE ai_execution.provider SET secret_ciphertext=$2, secret_hint=$3 WHERE provider_id=$1")
                .bind(provider_id)
                .bind(ciphertext)
                .bind(hint)
                .execute(&state.store.pool)
                .await?;
        }
    } else {
        sqlx::query("INSERT INTO ai_execution.provider (provider_id, display_name, kind, base_url, secret_ciphertext, secret_hint, enabled, created_at) VALUES ($1,$2,$3,$4,$5,$6,false,$7)")
            .bind(provider_id)
            .bind(name)
            .bind(kind)
            .bind(&base)
            .bind(sealed.as_ref().map(|item| item.0.clone()))
            .bind(sealed.as_ref().map(|item| item.1.clone()))
            .bind(OffsetDateTime::now_utc())
            .execute(&state.store.pool)
            .await?;
    }
    let saved = load_provider(&state.store, provider_id).await?;
    Ok(provider_json(&saved))
}

struct StoredProvider {
    provider_id: Uuid,
    display_name: String,
    kind: String,
    base_url: String,
    secret_hint: Option<String>,
    keyed: bool,
    enabled: bool,
    secret_ciphertext: Option<Vec<u8>>,
}

fn provider_json(row: &StoredProvider) -> Value {
    json!({
        "provider_id": row.provider_id,
        "display_name": row.display_name,
        "kind": row.kind,
        "base_url": row.base_url,
        "secret_hint": row.secret_hint,
        "secret_configured": row.keyed,
        "enabled": row.enabled,
    })
}

async fn load_provider(store: &AiStore, provider_id: Uuid) -> Result<StoredProvider, DeskError> {
    let row = sqlx::query(
        "SELECT provider_id, display_name, kind, base_url, secret_hint, secret_ciphertext, enabled FROM ai_execution.provider WHERE provider_id=$1",
    )
    .bind(provider_id)
    .fetch_optional(&store.pool)
    .await?;
    let Some(row) = row else {
        return Err(DeskError::Invalid("Choose a provider from the list."));
    };
    let secret_ciphertext: Option<Vec<u8>> = row.try_get("secret_ciphertext")?;
    Ok(StoredProvider {
        provider_id: row.try_get("provider_id")?,
        display_name: row.try_get("display_name")?,
        kind: row.try_get("kind")?,
        base_url: row.try_get("base_url")?,
        secret_hint: row.try_get("secret_hint")?,
        keyed: secret_ciphertext.is_some(),
        enabled: row.try_get("enabled")?,
        secret_ciphertext,
    })
}

fn clean_secret(secret: Option<String>) -> Result<Option<String>, DeskError> {
    let Some(secret) = secret else {
        return Ok(None);
    };
    let secret = secret.trim().to_owned();
    if secret.is_empty() {
        return Ok(None);
    }
    if !(1..=512).contains(&secret.chars().count()) || secret.chars().any(char::is_control) {
        return Err(DeskError::Invalid(
            "Enter an API key of at most 512 characters.",
        ));
    }
    Ok(Some(secret))
}

fn seal_secret(secrets: Option<&SecretBox>, secret: &str) -> Result<(Vec<u8>, String), DeskError> {
    let Some(secrets) = secrets else {
        return Err(DeskError::Unavailable(
            "The AI process has no encryption key, so a new API key cannot be saved.",
        ));
    };
    let ciphertext = secrets
        .seal(secret)
        .map_err(|()| DeskError::Unavailable("The provider key could not be saved."))?;
    Ok((ciphertext, secret::hint(secret)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderIdBody {
    provider_id: Uuid,
}

pub async fn enable_provider(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<ProviderIdBody>(&body) else {
        return invalid("Choose a provider from the list.");
    };
    match enable(&state.store, input.provider_id).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn enable(store: &AiStore, provider_id: Uuid) -> Result<Value, DeskError> {
    let mut tx = store.pool.begin().await?;
    sqlx::query("UPDATE ai_execution.provider SET enabled=false WHERE enabled")
        .execute(&mut *tx)
        .await?;
    let updated = sqlx::query("UPDATE ai_execution.provider SET enabled=true WHERE provider_id=$1")
        .bind(provider_id)
        .execute(&mut *tx)
        .await?;
    if updated.rows_affected() != 1 {
        return Err(DeskError::Invalid("Choose a provider from the list."));
    }
    tx.commit().await?;
    Ok(json!({"provider_id": provider_id, "enabled": true}))
}

pub async fn refresh_models(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<ProviderIdBody>(&body) else {
        return invalid("Choose a provider from the list.");
    };
    match fetch_models(&state, input.provider_id).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn fetch_models(state: &AppState, provider_id: Uuid) -> Result<Value, DeskError> {
    let row = load_provider(&state.store, provider_id).await?;
    let secret = open_secret(row.secret_ciphertext.clone(), state.secrets.as_ref())
        .map_err(|_| DeskError::Unavailable("The provider key could not be read."))?;
    if matches!(row.kind.as_str(), "gemini" | "openai") && secret.is_empty() {
        return Err(DeskError::Invalid("This provider needs an API key."));
    }
    let provider = TextProvider::from_stored(&row.kind, &row.base_url, &secret)
        .map_err(|_| DeskError::Invalid("Enter a provider name, type, and http(s) base URL."))?;
    let models = provider.list_models().await.map_err(DeskError::Invalid)?;
    for name in &models {
        sqlx::query(
            "INSERT INTO ai_execution.model (model_id, provider_id, model_name) VALUES ($1,$2,$3) ON CONFLICT (provider_id, model_name) DO NOTHING",
        )
        .bind(Uuid::now_v7())
        .bind(provider_id)
        .bind(name)
        .execute(&state.store.pool)
        .await?;
    }
    Ok(json!({"count": models.len()}))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PriceBody {
    model_id: Uuid,
    input_micro_usd: i64,
    output_micro_usd: i64,
}

pub async fn save_price(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<PriceBody>(&body) else {
        return invalid("Enter both token prices before assigning this model.");
    };
    if !prices_ready(Some(input.input_micro_usd), Some(input.output_micro_usd)) {
        return invalid("Enter both token prices before assigning this model.");
    }
    let updated = sqlx::query(
        "UPDATE ai_execution.model SET input_micro_usd=$2, output_micro_usd=$3 WHERE model_id=$1",
    )
    .bind(input.model_id)
    .bind(input.input_micro_usd)
    .bind(input.output_micro_usd)
    .execute(&state.store.pool)
    .await;
    match updated {
        Ok(result) if result.rows_affected() == 1 => Json(json!({
            "model_id": input.model_id,
            "input_micro_usd": input.input_micro_usd,
            "output_micro_usd": input.output_micro_usd,
        }))
        .into_response(),
        Ok(_) => invalid("Choose a model from the list."),
        Err(error) => {
            tracing::error!(%error, "ai model price failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AskBody {
    provider_id: Uuid,
    model_id: Uuid,
    pricing_revision_id: Uuid,
    estimate_amount: i64,
    maximum_amount: i64,
    unit_charge: i64,
    user_daily_ceiling: i64,
    guild_daily_ceiling: i64,
    #[serde(default)]
    system_prompt: String,
}

pub async fn save_ask(
    State(state): State<AppState>,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    if !authorized(&state, &headers, "POST", &uri, &body) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(input) = serde_json::from_slice::<AskBody>(&body) else {
        return invalid("Enter both token prices before assigning this model.");
    };
    match write_ask(&state.store, &input).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn write_ask(store: &AiStore, input: &AskBody) -> Result<Value, DeskError> {
    if input.pricing_revision_id.is_nil()
        || input.estimate_amount <= 0
        || input.maximum_amount < input.estimate_amount
        || input.unit_charge <= 0
        || input.user_daily_ceiling <= 0
        || input.guild_daily_ceiling < input.user_daily_ceiling
    {
        return Err(DeskError::Invalid("Check the credit amounts."));
    }
    let row = sqlx::query(
        "SELECT m.provider_id, m.model_name, m.input_micro_usd, m.output_micro_usd, p.enabled FROM ai_execution.model m JOIN ai_execution.provider p ON p.provider_id=m.provider_id WHERE m.model_id=$1",
    )
    .bind(input.model_id)
    .fetch_optional(&store.pool)
    .await?;
    let Some(row) = row else {
        return Err(DeskError::Invalid("Choose a model from the list."));
    };
    let provider_id: Uuid = row.try_get("provider_id")?;
    let enabled: bool = row.try_get("enabled")?;
    let input_price: Option<i64> = row.try_get("input_micro_usd")?;
    let output_price: Option<i64> = row.try_get("output_micro_usd")?;
    if provider_id != input.provider_id || !enabled {
        return Err(DeskError::Invalid(
            "Enable the provider before assigning it to Ask.",
        ));
    }
    if !prices_ready(input_price, output_price) {
        return Err(DeskError::Invalid(
            "Enter both token prices before assigning this model.",
        ));
    }
    let model_name: String = row.try_get("model_name")?;
    let system_prompt = clean_system_prompt(&input.system_prompt)?;
    let pricing = PricingInput {
        pricing_revision_id: input.pricing_revision_id,
        model_class: model_name,
        estimate_amount: input.estimate_amount,
        maximum_amount: input.maximum_amount,
        unit_charge: input.unit_charge,
        user_daily_ceiling: input.user_daily_ceiling,
        guild_daily_ceiling: input.guild_daily_ceiling,
    };
    publish_and_bind(store, input, &pricing, &system_prompt).await?;
    Ok(json!({"pricing_revision_id": input.pricing_revision_id, "model_id": input.model_id}))
}

fn stored_prompt(raw: &str) -> String {
    let text = raw.trim();
    if text.is_empty() {
        provider::ASK_SYSTEM_DEFAULT.to_owned()
    } else {
        text.to_owned()
    }
}

fn clean_system_prompt(raw: &str) -> Result<String, DeskError> {
    let text = raw.trim();
    if text.is_empty() {
        return Ok(provider::ASK_SYSTEM_DEFAULT.to_owned());
    }
    let plain = text
        .chars()
        .all(|character| !character.is_control() || matches!(character, '\n' | '\r' | '\t'));
    if !plain || text.chars().count() > 2_000 {
        return Err(DeskError::Invalid(
            "The Ask prompt must be plain text, up to 2000 characters.",
        ));
    }
    Ok(text.to_owned())
}

async fn publish_and_bind(
    store: &AiStore,
    input: &AskBody,
    pricing: &PricingInput,
    system_prompt: &str,
) -> Result<(), DeskError> {
    let mut tx = store.pool.begin().await?;
    let previous: Option<(i64, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT estimate_amount,maximum_amount,unit_charge,user_daily_ceiling,guild_daily_ceiling FROM ai_ledger.pricing WHERE pricing_revision_id=$1",
    )
    .bind(pricing.pricing_revision_id)
    .fetch_optional(&mut *tx)
    .await?;
    if let Some(existing) = previous {
        let same = existing
            == (
                pricing.estimate_amount,
                pricing.maximum_amount,
                pricing.unit_charge,
                pricing.user_daily_ceiling,
                pricing.guild_daily_ceiling,
            );
        if !same {
            return Err(DeskError::Conflict);
        }
    } else {
        sqlx::query(
            "UPDATE ai_ledger.pricing SET active=false WHERE operation_class='text' AND active",
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query("INSERT INTO ai_ledger.pricing (pricing_revision_id,operation_class,model_class,estimate_amount,maximum_amount,unit_charge,user_daily_ceiling,guild_daily_ceiling,active,published_at) VALUES ($1,'text',$2,$3,$4,$5,$6,$7,true,$8)")
            .bind(pricing.pricing_revision_id)
            .bind(&pricing.model_class)
            .bind(pricing.estimate_amount)
            .bind(pricing.maximum_amount)
            .bind(pricing.unit_charge)
            .bind(pricing.user_daily_ceiling)
            .bind(pricing.guild_daily_ceiling)
            .bind(OffsetDateTime::now_utc())
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query(
        "INSERT INTO ai_execution.binding (capability, provider_id, model_id, pricing_revision_id, system_prompt, updated_at) VALUES ('ask',$1,$2,$3,$4,$5) ON CONFLICT (capability) DO UPDATE SET provider_id=EXCLUDED.provider_id, model_id=EXCLUDED.model_id, pricing_revision_id=EXCLUDED.pricing_revision_id, system_prompt=EXCLUDED.system_prompt, updated_at=EXCLUDED.updated_at",
    )
    .bind(input.provider_id)
    .bind(input.model_id)
    .bind(pricing.pricing_revision_id)
    .bind(system_prompt)
    .bind(OffsetDateTime::now_utc())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Deserialize)]
pub(crate) struct OperationQuery {
    tenant_id: Option<Uuid>,
    actor_id: Option<String>,
    from: Option<i64>,
    to: Option<i64>,
}

pub async fn operations(
    State(state): State<AppState>,
    Query(query): Query<OperationQuery>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    if !authorized(&state, &headers, "GET", &uri, &[]) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    match read_operations(&state.store, &query).await {
        Ok(value) => Json(value).into_response(),
        Err(error) => fail(error),
    }
}

async fn read_operations(store: &AiStore, query: &OperationQuery) -> Result<Value, DeskError> {
    if query.actor_id.as_ref().is_some_and(|actor| {
        !actor.chars().all(|character| character.is_ascii_digit())
            || !(1..=32).contains(&actor.chars().count())
    }) {
        return Err(DeskError::Invalid("Enter a member id made of digits."));
    }
    let from = unix_time(query.from)?;
    let to = unix_time(query.to)?;
    if from.is_some() && to.is_some() && from > to {
        return Err(DeskError::Invalid("The start date is after the end date."));
    }
    let rows = sqlx::query(
        "SELECT o.operation_id, o.tenant_id, o.actor_id, r.captured_amount, a.model_name, a.input_tokens, a.output_tokens, a.cost_micro_usd, a.occurred_at FROM ai_execution.operation o JOIN ai_ledger.reservation r ON r.operation_id=o.operation_id LEFT JOIN LATERAL (SELECT model_name, input_tokens, output_tokens, cost_micro_usd, occurred_at FROM ai_execution.attempt WHERE operation_id=o.operation_id ORDER BY attempt_number DESC LIMIT 1) a ON true WHERE ($1::uuid IS NULL OR o.tenant_id=$1) AND ($2::text IS NULL OR o.actor_id=$2) AND ($3::timestamptz IS NULL OR a.occurred_at>=$3) AND ($4::timestamptz IS NULL OR a.occurred_at<$4) ORDER BY a.occurred_at DESC NULLS LAST, o.operation_id DESC LIMIT 201",
    )
    .bind(query.tenant_id)
    .bind(query.actor_id.as_deref())
    .bind(from)
    .bind(to)
    .fetch_all(&store.pool)
    .await?;
    let truncated = rows.len() > 200;
    let mut operations = Vec::new();
    for row in rows.into_iter().take(200) {
        let input_tokens: Option<i64> = row.try_get("input_tokens")?;
        let output_tokens: Option<i64> = row.try_get("output_tokens")?;
        let occurred: Option<OffsetDateTime> = row.try_get("occurred_at")?;
        operations.push(json!({
            "operation_id": row.try_get::<Uuid, _>("operation_id")?,
            "tenant_id": row.try_get::<Uuid, _>("tenant_id")?,
            "actor_id": row.try_get::<String, _>("actor_id")?,
            "occurred_at": occurred.and_then(|value| value.format(&Rfc3339).ok()),
            "model_name": row.try_get::<Option<String>, _>("model_name")?,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "captured": row.try_get::<i64, _>("captured_amount")?,
            "cost_micro_usd": row.try_get::<Option<i64>, _>("cost_micro_usd")?,
            "usage_reported": input_tokens.is_some() && output_tokens.is_some(),
        }));
    }
    Ok(json!({"operations": operations, "truncated": truncated}))
}

fn unix_time(value: Option<i64>) -> Result<Option<OffsetDateTime>, DeskError> {
    value
        .map(OffsetDateTime::from_unix_timestamp)
        .transpose()
        .map_err(|_| DeskError::Invalid("Enter a valid date."))
}

enum DeskError {
    Invalid(&'static str),
    Unavailable(&'static str),
    Conflict,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for DeskError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

fn invalid(code: &'static str) -> Response {
    (
        StatusCode::UNPROCESSABLE_ENTITY,
        Json(json!({"code": code})),
    )
        .into_response()
}

fn fail(error: DeskError) -> Response {
    match error {
        DeskError::Invalid(code) => invalid(code),
        DeskError::Unavailable(code) => {
            (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"code": code}))).into_response()
        }
        DeskError::Conflict => (
            StatusCode::CONFLICT,
            Json(json!({"code": "This price was already published with different amounts."})),
        )
            .into_response(),
        DeskError::Database(error) => {
            tracing::error!(%error, "ai desk failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assigning_requires_both_token_prices_including_zero() {
        assert!(!prices_ready(None, Some(0)));
        assert!(!prices_ready(Some(1), None));
        assert!(prices_ready(Some(0), Some(0)));
        assert!(!prices_ready(Some(-1), Some(0)));
    }

    #[test]
    fn provider_view_has_no_secret_field() {
        let view = provider_json(&StoredProvider {
            provider_id: Uuid::nil(),
            display_name: "Local".to_owned(),
            kind: "ollama".to_owned(),
            base_url: "http://127.0.0.1:11434".to_owned(),
            secret_hint: Some("wxyz".to_owned()),
            keyed: true,
            enabled: false,
            secret_ciphertext: Some(b"sk-live-provider-key".to_vec()),
        });
        let raw = serde_json::to_string(&view).unwrap_or_default();
        assert!(!raw.contains("sk-live"));
        assert!(raw.contains("secret_configured"));
        assert!(!raw.contains("secret_ciphertext"));
    }
}
