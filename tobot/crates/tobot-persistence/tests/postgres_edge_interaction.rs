//! Regresión del `partition_key` de texto para interacciones recibidas por Gateway.

use std::env;
use time::{Duration, OffsetDateTime};
use tobot_core::{TenantContext, TenantId, TenantType};
use tobot_envelope::{EventEnvelope, TraceContext};
use tobot_persistence::{
    EdgeStore, GatewayInteractionAcceptance, InteractionAcceptance, Migrations,
};
use uuid::Uuid;

async fn fixture() -> Result<Option<(EdgeStore, sqlx::PgPool)>, String> {
    let Ok(url) = env::var("TOBOT_TEST_DATABASE_URL") else {
        if env::var("TOBOT_REQUIRE_POSTGRES").is_ok() {
            return Err("TOBOT_TEST_DATABASE_URL is required".to_owned());
        }
        return Ok(None);
    };
    if url
        .split('?')
        .next()
        .and_then(|path| path.rsplit('/').next())
        != Some("tobot_test")
    {
        return Err("refusing to use a database other than tobot_test".to_owned());
    }
    Migrations::connect(&url)
        .await
        .map_err(|error| error.to_string())?
        .migrate()
        .await
        .map_err(|error| error.to_string())?;
    let store = EdgeStore::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    let pool = sqlx::PgPool::connect(&url)
        .await
        .map_err(|error| error.to_string())?;
    Ok(Some((store, pool)))
}

fn event(schema_name: &str, tenant: Uuid, session_id: &str) -> EventEnvelope {
    EventEnvelope {
        event_id: Uuid::now_v7(),
        schema_name: schema_name.to_owned(),
        schema_version: 1,
        occurred_at: "2026-09-25T00:00:00Z".to_owned(),
        received_at: "2026-09-25T00:00:00Z".to_owned(),
        application_id: "123".to_owned(),
        tenant_id: Some(tenant),
        guild_id: Some("456".to_owned()),
        shard_id: Some(0),
        session_id: Some(session_id.to_owned()),
        gateway_sequence: Some(1),
        correlation_id: Uuid::now_v7(),
        causation_id: None,
        trace_context: TraceContext {
            trace_id: Uuid::now_v7().to_string(),
            span_id: Uuid::now_v7().to_string(),
        },
        payload: serde_json::json!({}),
    }
}

#[tokio::test]
async fn interaction_outbox_uses_utf8_partition_key() -> Result<(), String> {
    let Some((store, pool)) = fixture().await? else {
        return Ok(());
    };
    let tenant = TenantId::new();
    let context = TenantContext {
        tenant_id: tenant,
        tenant_type: TenantType::Guild,
    };
    let session_id = Uuid::now_v7().to_string();
    let gateway = event("GatewayEventAccepted", tenant.as_uuid(), &session_id);
    let interaction = event("InteractionAccepted", tenant.as_uuid(), &session_id);
    let gateway_raw = serde_json::to_vec(&gateway).map_err(|error| error.to_string())?;
    let interaction_raw = serde_json::to_vec(&interaction).map_err(|error| error.to_string())?;
    let interaction_id = Uuid::now_v7().to_string();
    let acceptance = GatewayInteractionAcceptance {
        context,
        interaction_id: &interaction_id,
        interaction_token: "test-token",
        receipt_id: Uuid::now_v7(),
        expires_at: OffsetDateTime::now_utc() + Duration::minutes(15),
        gateway_event: &gateway,
        gateway_raw: &gateway_raw,
        interaction_event: &interaction,
        interaction_raw: &interaction_raw,
    };
    assert_eq!(
        store
            .reserve_gateway_interaction(&acceptance)
            .await
            .map_err(|error| error.to_string())?,
        InteractionAcceptance::Accepted
    );
    store
        .enqueue_gateway_interaction(&acceptance)
        .await
        .map_err(|error| error.to_string())?;
    let keys: Vec<String> = sqlx::query_scalar(
        "SELECT partition_key FROM edge.event_outbox WHERE tenant_id=$1 ORDER BY event_id",
    )
    .bind(tenant.as_uuid())
    .fetch_all(&pool)
    .await
    .map_err(|error| error.to_string())?;
    assert_eq!(keys, vec![tenant.as_uuid().to_string(); 2]);

    let legacy_id = Uuid::now_v7().to_string();
    let legacy_event = event("InteractionAccepted", tenant.as_uuid(), &session_id);
    let legacy_raw = serde_json::to_vec(&legacy_event).map_err(|error| error.to_string())?;
    assert_eq!(
        store
            .accept_interaction_event(
                context,
                &legacy_id,
                Uuid::now_v7(),
                OffsetDateTime::now_utc() + Duration::minutes(15),
                &legacy_event,
                &legacy_raw,
            )
            .await
            .map_err(|error| error.to_string())?,
        InteractionAcceptance::Accepted
    );
    let legacy_key: String =
        sqlx::query_scalar("SELECT partition_key FROM edge.event_outbox WHERE event_id=$1")
            .bind(legacy_event.event_id)
            .fetch_one(&pool)
            .await
            .map_err(|error| error.to_string())?;
    assert_eq!(legacy_key, tenant.as_uuid().to_string());
    Ok(())
}
