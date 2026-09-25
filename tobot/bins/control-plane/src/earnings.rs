//! Admisión de `/daily`, reconciliación por clave y lectura de cartera propia.

use axum::{Json,extract::{Path,State},http::{HeaderMap,StatusCode,header},response::{IntoResponse,Response}};
use time::{OffsetDateTime,format_description::well_known::Rfc3339};
use tobot_bus::RedisStreamConsumer;
use tobot_core::Clock;
use tobot_delivery_client::SupportDeliveryClient;
use tobot_discord_adapter::{InteractionCallback,TransportError};
use tobot_outbox::MessagingOutboxRelay;
use tobot_persistence::{DailyAction,DailyDecision,EarningsStore,QueryStore};
use tobot_envelope::{CommandEnvelope,TraceContext};
use tracing::{error,info,warn};
use uuid::Uuid;

use super::{AppState,authorize_browser_session,authorize_mutation,live_user_guilds,session_id};
use crate::{ledger_client::{LedgerClient,LedgerError},welcome::access};

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PublishDaily {
    starting_grant:i64, wallet_ceiling:i64, issuance_ceiling:i64, daily_amount:i64,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CircuitRequest {credit_enabled:bool,daily_enabled:bool}

pub(super) async fn status(State(state):State<AppState>,Path(tenant):Path<Uuid>,headers:HeaderMap) -> Response {
    if let Err(code)=access(&state,&headers,tenant).await {return code.into_response();}
    let currency = match state.ledger.policy(tenant).await {
        Ok(value)=>Some(value),Err(LedgerError::Missing)=>None,Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let daily = match state.earnings.published_daily(tenant).await {
        Ok(value)=>value,Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let compatible = currency.as_ref().and_then(|value|value["revision_id"].as_str())
        == daily.as_ref().map(|value|value.currency_revision_id.to_string()).as_deref();
    let ready=compatible && daily.as_ref().is_some_and(|value|value.enabled)
        && currency.as_ref().is_some_and(|value|value["credit_enabled"]==true && value["write_ready"]==true);
    ([(header::CACHE_CONTROL,"private, no-store")],Json(serde_json::json!({
        "currency":currency,"daily":daily,"ready":ready,
    }))).into_response()
}

pub(super) async fn circuit(State(state):State<AppState>,Path(tenant):Path<Uuid>,headers:HeaderMap,
    Json(request):Json<CircuitRequest>) -> Response {
    let (_,session)=match authorize_mutation(&state,&headers).await {Ok(value)=>value,Err(code)=>return code.into_response()};
    if let Err(code)=access(&state,&headers,tenant).await {return code.into_response();}
    let now=OffsetDateTime::from(state.clock.now());
    let audit=match state.earnings.request_circuit_change(tenant,session.account_id,
        request.credit_enabled,request.daily_enabled,now).await {
        Ok(value)=>value,Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let ledger=state.ledger.set_credit_enabled(tenant,request.credit_enabled).await;
    let result=match ledger {
        Ok(_)=>state.earnings.set_daily_enabled(tenant,session.account_id,request.daily_enabled,now).await.map_err(|_|"daily_switch_failed"),
        Err(_)=>Err("ledger_switch_failed"),
    };
    let _=state.earnings.finish_circuit_change(audit,result.is_ok(),result.as_ref().err().copied(),OffsetDateTime::now_utc()).await;
    match result {Ok(())=>StatusCode::NO_CONTENT.into_response(),Err(_)=>StatusCode::SERVICE_UNAVAILABLE.into_response()}
}

pub(super) async fn publish(State(state):State<AppState>,Path(tenant):Path<Uuid>,headers:HeaderMap,
    Json(request):Json<PublishDaily>) -> Response {
    let (_,session)=match authorize_mutation(&state,&headers).await {Ok(value)=>value,Err(code)=>return code.into_response()};
    let guild=match access(&state,&headers,tenant).await {Ok(value)=>value,Err(code)=>return code.into_response()};
    if request.daily_amount<=0 || request.daily_amount>9_000_000_000_000 || request.starting_grant<0 ||
        request.wallet_ceiling<=0 || request.issuance_ceiling<=0 || request.starting_grant>request.wallet_ceiling ||
        request.daily_amount>request.wallet_ceiling || request.starting_grant>request.issuance_ceiling {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let currency=match state.ledger.command("PublishCurrencyPolicy",tenant,session.account_id,Uuid::now_v7(),
        serde_json::json!({"guild_id":guild,"starting_grant":request.starting_grant,
            "wallet_ceiling":request.wallet_ceiling,"issuance_ceiling":request.issuance_ceiling})).await {
        Ok(value)=>value,Err(LedgerError::Rejected(_)|LedgerError::Conflict)=>return StatusCode::BAD_REQUEST.into_response(),
        Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let Some(revision)=currency["revision_id"].as_str().and_then(|value|value.parse::<Uuid>().ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let correlation=Uuid::now_v7();
    let Ok(deadline)=(OffsetDateTime::now_utc()+time::Duration::seconds(30)).format(&Rfc3339) else {return StatusCode::INTERNAL_SERVER_ERROR.into_response();};
    let income_command=CommandEnvelope {command_id:Uuid::now_v7(),schema_name:"PublishIncomePolicy".to_owned(),
        schema_version:1,schema_family:Some("VirtualPayment".to_owned()),actor_account_id:session.account_id,
        tenant_id:tenant,idempotency_key:Uuid::now_v7(),
        deadline_at:deadline,
        correlation_id:correlation,trace_context:TraceContext {trace_id:correlation.to_string(),span_id:Uuid::now_v7().to_string()},
        payload:serde_json::json!({"guild_id":guild,"currency_revision_id":revision,"amount":request.daily_amount,"cooldown_seconds":86400})};
    let valid_income=serde_json::to_vec(&income_command).ok().and_then(|raw|CommandEnvelope::parse_s0(&raw).ok()).is_some();
    if !valid_income {return StatusCode::BAD_REQUEST.into_response();}
    match state.earnings.publish_daily(tenant,&guild,&state.discord_application_id,revision,
        request.daily_amount,OffsetDateTime::from(state.clock.now())).await {
        Ok(policy)=>(StatusCode::CREATED,Json(serde_json::json!({"currency":currency,"daily":policy}))).into_response(),
        Err(cause)=>{error!(%cause,"daily policy publish failed after currency policy");StatusCode::SERVICE_UNAVAILABLE.into_response()},
    }
}

pub(super) async fn wallet(State(state):State<AppState>,Path(tenant):Path<Uuid>,headers:HeaderMap) -> Response {
    let Some(cookie)=session_id(&headers) else {return StatusCode::UNAUTHORIZED.into_response();};
    let now=OffsetDateTime::from(state.clock.now());
    let session=match authorize_browser_session(&state,cookie,now).await {
        Ok(Some(value))=>value,Ok(None)=>return StatusCode::UNAUTHORIZED.into_response(),
        Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let member=match state.identity.discord_user_id(session.account_id).await {
        Ok(Some(value))=>value,_=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let guilds=match live_user_guilds(&state,&session).await {
        Ok(value)=>value,Err(code)=>return code.into_response(),
    };
    let shell=match state.query.guild_shell_summaries_for_provider_guilds(
        &guilds.into_iter().map(|guild|guild.id).collect::<Vec<_>>()).await {
        Ok(value)=>value,Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    if !shell.iter().any(|value|value.tenant_id==tenant && value.installation_state=="Installed") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let authoritative=match state.ledger.wallet(tenant,&member).await {
        Ok(value)=>value,Err(LedgerError::Missing)=>return ([(header::CACHE_CONTROL,"private, no-store")],Json(serde_json::json!({"wallet":null}))).into_response(),
        Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let projection=state.query.wallet_projection(tenant,&member).await.ok().flatten();
    let projected=projection.as_ref().map(|(_,balance,sequence,watermark)|serde_json::json!({
        "balance":balance,"journal_sequence":sequence,"projection_watermark_unix":watermark.unix_timestamp(),
    }));
    ([(header::CACHE_CONTROL,"private, no-store")],Json(serde_json::json!({
        "wallet":authoritative,"projection":projected,
    }))).into_response()
}

pub(super) async fn member_guilds(State(state):State<AppState>,headers:HeaderMap) -> Response {
    let Some(cookie)=session_id(&headers) else {return StatusCode::UNAUTHORIZED.into_response();};
    let now=OffsetDateTime::from(state.clock.now());
    let session=match authorize_browser_session(&state,cookie,now).await {
        Ok(Some(value))=>value,Ok(None)=>return StatusCode::UNAUTHORIZED.into_response(),
        Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let guilds=match live_user_guilds(&state,&session).await {
        Ok(value)=>value,Err(code)=>return code.into_response(),
    };
    let ids=guilds.iter().map(|guild|guild.id.clone()).collect::<Vec<_>>();
    let shells=match state.query.guild_shell_summaries_for_provider_guilds(&ids).await {
        Ok(value)=>value,Err(_)=>return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    let visible:Vec<_>=shells.into_iter().filter(|shell|shell.installation_state=="Installed")
        .map(|shell|serde_json::json!({"tenant_id":shell.tenant_id,"guild_id":shell.provider_guild_id,
            "name":guilds.iter().find(|guild|Some(&guild.id)==shell.provider_guild_id.as_ref()).map(|guild|guild.name.as_str())})).collect();
    ([(header::CACHE_CONTROL,"private, no-store")],Json(serde_json::json!({"guilds":visible}))).into_response()
}

pub(super) async fn run_admission(store:EarningsStore,ledger:LedgerClient,delivery:SupportDeliveryClient,
    consumer:RedisStreamConsumer) -> anyhow::Result<()> {
    loop {
        match consume_admission(&store,&ledger,&delivery,&consumer).await {
            Ok(())=>{},Err(error)=>{error!(%error,"daily admission paused");tokio::time::sleep(std::time::Duration::from_secs(1)).await;}
        }
    }
}

async fn consume_admission(store:&EarningsStore,ledger:&LedgerClient,delivery:&SupportDeliveryClient,
    consumer:&RedisStreamConsumer) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed=tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        let event=parsed.event;
        if event.schema_name=="GatewayEventAccepted" && event.payload["kind"]=="DailyCommand" {
            let tenant=event.tenant_id.ok_or_else(||anyhow::anyhow!("daily interaction has no tenant"))?;
            let guild=event.guild_id.as_deref().ok_or_else(||anyhow::anyhow!("daily interaction has no guild"))?;
            let member=event.payload["member_id"].as_str().ok_or_else(||anyhow::anyhow!("daily interaction has no member"))?;
            let interaction=event.payload["interaction_id"].as_str().ok_or_else(||anyhow::anyhow!("daily interaction has no id"))?;
            if let Some(old)=store.action_for_interaction(tenant,interaction).await? {
                if old.member_id!=member || old.guild_id!=guild || old.application_id!=event.application_id {
                    anyhow::bail!("daily interaction identity mismatch");
                }
                let content=if old.state=="Settled" {format!("You received {} units. Wallet balance: {}.",old.amount,old.balance_after.unwrap_or(0))}
                    else if old.state=="Rejected" {"Your daily claim could not be settled.".to_owned()}
                    else {"Your daily claim is still processing.".to_owned()};
                let _=edit_response(store,delivery,tenant,&event.application_id,interaction,&content).await?;
                consumer.acknowledge(&message.stream_id).await?;
                continue;
            }
            let daily=store.published_daily(tenant).await?;
            let currency=ledger.policy(tenant).await;
            let configured=daily.as_ref().is_some_and(|policy|policy.enabled)
                && currency.as_ref().is_ok_and(|value|value["revision_id"].as_str()==daily.as_ref().map(|policy|policy.currency_revision_id.to_string()).as_deref()
                    && value["credit_enabled"]==true && value["write_ready"]==true);
            if !configured {
                let _=edit_response(store,delivery,tenant,&event.application_id,interaction,"Daily rewards are not available yet.").await?;
                consumer.acknowledge(&message.stream_id).await?;
                continue;
            }
            let decision=store.admit_daily(tenant,guild,&event.application_id,member,interaction,OffsetDateTime::now_utc()).await?;
            let message=match decision {
                DailyDecision::Ineligible(at)=>Some(format!("Daily is available again <t:{}:R>.",at.unix_timestamp())),
                DailyDecision::Pending=>Some("Your daily claim is still processing.".to_owned()),
                DailyDecision::NotConfigured=>Some("Daily rewards are not configured yet.".to_owned()),
                DailyDecision::Duplicate(action) if action.state=="Settled"=>Some(format!("You received {} units. Wallet balance: {}.",action.amount,action.balance_after.unwrap_or(0))),
                DailyDecision::Duplicate(action) if action.state=="Rejected"=>Some("Your daily claim could not be settled.".to_owned()),
                DailyDecision::Duplicate(_)|DailyDecision::Admitted(_)=>None,
            };
            if let Some(content)=message { let _=edit_response(store,delivery,tenant,&event.application_id,interaction,&content).await?; }
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}

pub(super) async fn run_settlement(store:EarningsStore,ledger:LedgerClient,
    delivery:SupportDeliveryClient) -> anyhow::Result<()> {
    loop {
        match settle_due(&store,&ledger,&delivery).await {
            Ok(0)=>tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            Ok(count)=>info!(count,"daily settlements processed"),
            Err(error)=>{error!(%error,"daily settlement paused");tokio::time::sleep(std::time::Duration::from_secs(1)).await;}
        }
        if let Err(error)=dispatch_due(&store,&delivery).await {warn!(%error,"daily response retry paused");}
    }
}

async fn settle_due(store:&EarningsStore,ledger:&LedgerClient,delivery:&SupportDeliveryClient) -> anyhow::Result<usize> {
    let actions=store.claim_pending(OffsetDateTime::now_utc(),Uuid::now_v7()).await?;
    let count=actions.len();
    for action in actions {
        if let Err(error)=edit_response(store,delivery,action.tenant_id,&action.application_id,&action.interaction_id,
            "Your daily claim is processing.").await {
            warn!(%error,action_id=%action.action_id,"daily pending response could not be delivered");
        }
        let result=settle_one(ledger,&action).await;
        let now=OffsetDateTime::now_utc();
        match result {
            Ok((id,balance))=>{
                if !store.complete(&action,Some(id),Some(balance),None,now).await? {continue;}
            }
            Err(LedgerError::Rejected(code))=>{
                if code=="credits_disabled" {continue;}
                if !store.complete(&action,None,None,Some(&code),now).await? {continue;}
            }
            Err(LedgerError::Conflict)=>{
                if !store.complete(&action,None,None,Some("idempotency_conflict"),now).await? {continue;}
            }
            Err(LedgerError::Missing|LedgerError::Unavailable)=>continue,
        }
    }
    Ok(count)
}

async fn dispatch_due(store:&EarningsStore,delivery:&SupportDeliveryClient) -> anyhow::Result<()> {
    for action in store.claim_responses(OffsetDateTime::now_utc(),Uuid::now_v7()).await? {
        let content=if action.state=="Settled" {
            format!("You received {} units. Wallet balance: {}.",action.amount,action.balance_after.unwrap_or(0))
        } else {"Your daily claim could not be settled.".to_owned()};
        match edit_response(store,delivery,action.tenant_id,&action.application_id,&action.interaction_id,&content).await {
            Ok(outcome)=>{store.finish_response(&action,matches!(outcome,EditOutcome::Delivered),OffsetDateTime::now_utc()).await?;}
            Err(error)=>warn!(%error,action_id=%action.action_id,"daily response will be retried"),
        }
    }
    Ok(())
}

async fn settle_one(ledger:&LedgerClient,action:&DailyAction) -> Result<(Uuid,i64),LedgerError> {
    let actor=Uuid::from_u128(1);
    let wallet_key=Uuid::new_v5(&Uuid::NAMESPACE_OID,format!("{}:ensure",action.action_id).as_bytes());
    ledger.command("EnsureMemberWallet",action.tenant_id,actor,wallet_key,
        serde_json::json!({"member_id":action.member_id})).await?;
    let receipt=ledger.command("SettleIncomeAction",action.tenant_id,actor,action.ledger_key,
        serde_json::json!({"member_id":action.member_id,"income_action_id":action.action_id,
            "policy_revision_id":action.policy_revision_id,"interaction_id":action.interaction_id,
            "amount":action.amount})).await?;
    let id=receipt["transaction_id"].as_str().and_then(|value|value.parse().ok()).ok_or(LedgerError::Unavailable)?;
    let balance=receipt["balance_after"].as_i64().ok_or(LedgerError::Unavailable)?;
    Ok((id,balance))
}

enum EditOutcome {Delivered,Expired}

async fn edit_response(store:&EarningsStore,delivery:&SupportDeliveryClient,tenant:Uuid,
    application:&str,interaction:&str,content:&str) -> anyhow::Result<EditOutcome> {
    let Some(token)=store.interaction_token(tenant,interaction).await? else {return Ok(EditOutcome::Expired);};
    let callback=InteractionCallback {application_id:application.parse()?,interaction_id:interaction.parse()?,
        interaction_token:token,ephemeral:true};
    match delivery.edit_deferred(callback,content).await {
        Ok(())=>Ok(EditOutcome::Delivered),Err(TransportError::Rejected{status:400|404})=>Ok(EditOutcome::Expired),Err(error)=>Err(error.into()),
    }
}

pub(super) async fn run_relay(relay:MessagingOutboxRelay) -> anyhow::Result<()> {
    loop { match relay.relay_once(OffsetDateTime::now_utc()).await {
        Ok(0)=>tokio::time::sleep(std::time::Duration::from_millis(250)).await,
        Ok(_)=>{},Err(error)=>{error!(%error,"earnings outbox paused");tokio::time::sleep(std::time::Duration::from_secs(1)).await;}
    }}
}

pub(super) async fn run_projector(query:QueryStore,consumer:RedisStreamConsumer) -> anyhow::Result<()> {
    loop { match project(&query,&consumer).await {
        Ok(())=>{},Err(error)=>{error!(%error,"wallet projection paused");tokio::time::sleep(std::time::Duration::from_secs(1)).await;}
    }}
}
async fn project(query:&QueryStore,consumer:&RedisStreamConsumer) -> anyhow::Result<()> {
    for message in consumer.read().await? {
        let parsed=tobot_envelope::EventEnvelope::parse_s0(&message.envelope)?;
        if parsed.event.schema_name=="BalanceProjectionChanged" {
            query.apply_wallet(&parsed.event,&message.envelope,&message.stream_id,OffsetDateTime::now_utc()).await?;
        }
        consumer.acknowledge(&message.stream_id).await?;
    }
    Ok(())
}
