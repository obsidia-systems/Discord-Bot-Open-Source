//! Las pruebas S5 solo usan la base desechable `tobot_test`.

use std::env;
use time::OffsetDateTime;
use tobot_persistence::{
    CatalogBenefit, CommercialGrant, PlatformEntitlementStore, QueryStore, SupportClick,
    SupportDecision, SupportStore,
};
use uuid::Uuid;

async fn fixture() -> Result<Option<(SupportStore, sqlx::PgPool, Uuid, String)>, String> {
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
    tobot_persistence::Migrations::connect(&url)
        .await
        .map_err(|e| e.to_string())?
        .migrate()
        .await
        .map_err(|e| e.to_string())?;
    let pool = sqlx::PgPool::connect(&url)
        .await
        .map_err(|e| e.to_string())?;
    let tenant = Uuid::now_v7();
    let guild = format!(
        "{}",
        (Uuid::now_v7().as_u128() % 900_000_000_000_000) + 1_000
    );
    sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'123','Active')")
        .bind(tenant).bind(&guild).execute(&pool).await.map_err(|e|e.to_string())?;
    sqlx::query("INSERT INTO installation.installation (installation_id,tenant_id,generation,state,manifest) VALUES ($1,$2,1,'Installed','{}'::jsonb)")
        .bind(Uuid::now_v7()).bind(tenant).execute(&pool).await.map_err(|e|e.to_string())?;
    let store = SupportStore::connect(&url)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Some((store, pool, tenant, guild)))
}

fn click<'a>(
    tenant: Uuid,
    guild: &'a str,
    channel: &'a str,
    message: &'a str,
    button: &'a str,
    interaction: &'a str,
    member: &'a str,
) -> SupportClick<'a> {
    SupportClick {
        tenant_id: tenant,
        guild_id: guild,
        application_id: "123",
        channel_id: channel,
        message_id: message,
        custom_id: button,
        interaction_id: interaction,
        member_id: member,
        answers: &[],
    }
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn panel_binding_capacity_numbers_and_case_versions() -> Result<(), String> {
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let first = store
        .prepare_panel(tenant, &guild, "200", "Open ticket", "Open ticket", now)
        .await
        .map_err(|e| e.to_string())?;
    assert_eq!(first.state, "Preparing");
    assert!(first.nonce.parse::<u64>().map_err(|e| e.to_string())? < (1_u64 << 53));
    let base = (Uuid::now_v7().as_u128() % 900_000_000_000_000) as u64 + 1_000;
    let i1 = base.to_string();
    let i2 = (base + 1).to_string();
    let i3 = (base + 2).to_string();
    let first_button = format!("support:{}", first.revision_id);
    let published = store
        .publish_panel(
            tenant,
            &guild,
            "123",
            first.revision_id,
            "300",
            &first_button,
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert_eq!(published.state, "Published");
    let mismatch = store
        .admit_click(
            &click(tenant, &guild, "200", "300", "support:wrong", &i1, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(mismatch, SupportDecision::UnknownButton));
    let no_number: i64 =
        sqlx::query_scalar("SELECT count(*) FROM support.support_number WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!(no_number, 0);
    let opened = store
        .admit_click(
            &click(tenant, &guild, "200", "300", &first_button, &i1, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    let SupportDecision::Opened(case) = opened else {
        return Err("first click did not open".to_owned());
    };
    assert_eq!(case.support_number, 1);
    let duplicate = store
        .admit_click(
            &click(tenant, &guild, "200", "300", &first_button, &i1, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(duplicate,SupportDecision::Opened(ref row) if row.case_id==case.case_id));
    let second = store
        .admit_click(
            &click(tenant, &guild, "200", "300", &first_button, &i2, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(second,SupportDecision::AlreadyOpen(ref row) if row.case_id==case.case_id));
    let entitlement = PlatformEntitlementStore::connect(
        &env::var("TOBOT_TEST_DATABASE_URL").map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    entitlement
        .apply_commercial_grant(&CommercialGrant {
            fact_id: Uuid::now_v7(),
            order_id: Uuid::now_v7(),
            tenant_id: tenant,
            source_sequence: 1,
            source_version: "paid-test".to_owned(),
            schema_family: "CommercialPayment".to_owned(),
            state: "Active".to_owned(),
            feature_key: "platform.base".to_owned(),
            benefits: vec![
                CatalogBenefit::Feature {
                    key: "platform.base".to_owned(),
                },
                CatalogBenefit::Limit {
                    key: "support.max_open_tickets".to_owned(),
                    quantity: 1,
                    unit: "tickets".to_owned(),
                },
            ],
            valid_until: Some((now + time::Duration::days(30)).unix_timestamp()),
        })
        .await
        .map_err(|e| e.to_string())?;
    let limited = store
        .admit_click(
            &click(
                tenant,
                &guild,
                "200",
                "300",
                &first_button,
                &(base + 4).to_string(),
                "501",
            ),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(limited, SupportDecision::AtCapacity));
    let counter: i64 =
        sqlx::query_scalar("SELECT next_number FROM support.support_number WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!(counter, 2);
    let newer = store
        .prepare_panel(tenant, &guild, "201", "Help", "Help", now)
        .await
        .map_err(|e| e.to_string())?;
    let second_button = format!("support:{}", newer.revision_id);
    store
        .publish_panel(
            tenant,
            &guild,
            "123",
            newer.revision_id,
            "301",
            &second_button,
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    let replay_after_publish = store
        .admit_click(
            &click(tenant, &guild, "200", "300", &first_button, &i1, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(
        matches!(replay_after_publish, SupportDecision::Opened(ref row) if row.case_id == case.case_id)
    );
    let old_new_click = store
        .admit_click(
            &click(tenant, &guild, "200", "300", &first_button, &i3, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(
        matches!(old_new_click, SupportDecision::AlreadyOpen(ref row) if row.case_id == case.case_id)
    );
    let pinned: Uuid = sqlx::query_scalar(
        "SELECT template_revision_id FROM support.support_case WHERE case_id=$1",
    )
    .bind(case.case_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;
    assert_eq!(pinned, first.template_revision_id);
    let claimed = store
        .transition(
            tenant,
            &guild,
            "123",
            case.case_id,
            1,
            Uuid::now_v7(),
            false,
            now,
        )
        .await
        .map_err(|e| e.to_string())?
        .ok_or("claim lost")?;
    assert_eq!(claimed.state, "Claimed");
    assert!(
        store
            .transition(
                tenant,
                &guild,
                "123",
                case.case_id,
                1,
                Uuid::now_v7(),
                true,
                now
            )
            .await
            .map_err(|e| e.to_string())?
            .is_none()
    );
    let closed = store
        .transition(
            tenant,
            &guild,
            "123",
            case.case_id,
            2,
            Uuid::now_v7(),
            true,
            now,
        )
        .await
        .map_err(|e| e.to_string())?
        .ok_or("close lost")?;
    assert_eq!(closed.state, "Closed");
    let next = store
        .admit_click(
            &click(tenant, &guild, "201", "301", &second_button, &i3, "500"),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(next,SupportDecision::Opened(ref row) if row.support_number==2));
    sqlx::query("INSERT INTO installation.installation (installation_id,tenant_id,generation,state,manifest) VALUES ($1,$2,2,'Installed','{}'::jsonb)")
        .bind(Uuid::now_v7()).bind(tenant).execute(&pool).await.map_err(|e|e.to_string())?;
    let newer_generation_click = store
        .admit_click(
            &click(
                tenant,
                &guild,
                "201",
                "301",
                &second_button,
                &(base + 3).to_string(),
                "501",
            ),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(matches!(
        newer_generation_click,
        SupportDecision::UnknownButton
    ));
    let raw: Vec<u8> = sqlx::query_scalar("SELECT envelope FROM support.event_outbox WHERE tenant_id=$1 AND topic='SupportCaseOpened' ORDER BY available_at LIMIT 1")
        .bind(tenant).fetch_one(&pool).await.map_err(|e|e.to_string())?;
    let event = tobot_envelope::EventEnvelope::parse_s0(&raw)
        .map_err(|e| e.to_string())?
        .event;
    let url = env::var("TOBOT_TEST_DATABASE_URL").map_err(|e| e.to_string())?;
    let query = QueryStore::connect(&url).await.map_err(|e| e.to_string())?;
    query
        .apply_support_ticket(&event, &raw, "1-0", now)
        .await
        .map_err(|e| e.to_string())?;
    query
        .apply_support_ticket(&event, &raw, "1-0", now)
        .await
        .map_err(|e| e.to_string())?;
    let projected = query
        .support_tickets(tenant)
        .await
        .map_err(|e| e.to_string())?;
    assert_eq!(projected.len(), 1);
    assert_eq!(projected[0].support_number, 1);
    Ok(())
}

#[tokio::test]
async fn concurrent_clicks_keep_one_active_case_per_member() -> Result<(), String> {
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let panel = store
        .prepare_panel(tenant, &guild, "200", "Open", "Open", now)
        .await
        .map_err(|e| e.to_string())?;
    let button = format!("support:{}", panel.revision_id);
    store
        .publish_panel(
            tenant,
            &guild,
            "123",
            panel.revision_id,
            "300",
            &button,
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut tasks = Vec::new();
    let base = (Uuid::now_v7().as_u128() % 900_000_000_000_000) as u64 + 1_000;
    for (interaction, member) in [
        (base.to_string(), "500"),
        ((base + 1).to_string(), "500"),
        ((base + 2).to_string(), "501"),
    ] {
        let store = store.clone();
        let guild = guild.clone();
        let button = button.clone();
        let member = member.to_owned();
        tasks.push(tokio::spawn(async move {
            store
                .admit_click(
                    &click(tenant, &guild, "200", "300", &button, &interaction, &member),
                    now,
                )
                .await
        }));
    }
    let mut opened = 0;
    let mut already = 0;
    for task in tasks {
        match task
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
        {
            SupportDecision::Opened(_) => opened += 1,
            SupportDecision::AlreadyOpen(_) => already += 1,
            SupportDecision::AtCapacity => return Err("unexpected paid ticket limit".to_owned()),
            SupportDecision::NotIncluded => return Err("support closed".to_owned()),
            SupportDecision::UnknownButton => return Err("published button rejected".to_owned()),
            SupportDecision::OutsideHours => {
                return Err("hours blocked an unrestricted panel".to_owned());
            }
            SupportDecision::MissingAnswers => {
                return Err("answers required without a form".to_owned());
            }
        }
    }
    assert_eq!((opened, already), (2, 1));
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM support.support_case WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    let next: i64 =
        sqlx::query_scalar("SELECT next_number FROM support.support_number WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!((count, next), (2, 3));
    Ok(())
}

#[tokio::test]
async fn uncertain_panel_create_reconciles_its_nonce_once() -> Result<(), String> {
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let panel = store
        .prepare_panel(tenant, &guild, "220", "Support", "Support", now)
        .await
        .map_err(|e| e.to_string())?;
    store
        .degrade_panel(tenant, panel.revision_id)
        .await
        .map_err(|e| e.to_string())?;
    assert!(
        !store
            .reconcile_panel_nonce(
                &panel.nonce,
                "220",
                "330",
                "123",
                "999",
                &format!("support:{}", panel.revision_id),
                "Support",
                now
            )
            .await
            .map_err(|e| e.to_string())?
    );
    assert!(
        !store
            .reconcile_panel_nonce(
                &panel.nonce,
                "220",
                "330",
                "123",
                "123",
                &format!("support:{}", panel.revision_id),
                "Wrong label",
                now
            )
            .await
            .map_err(|e| e.to_string())?
    );
    assert!(
        store
            .reconcile_panel_nonce(
                &panel.nonce,
                "220",
                "330",
                "123",
                "123",
                &format!("support:{}", panel.revision_id),
                "Support",
                now
            )
            .await
            .map_err(|e| e.to_string())?
    );
    assert!(
        !store
            .reconcile_panel_nonce(
                &panel.nonce,
                "220",
                "330",
                "123",
                "123",
                &format!("support:{}", panel.revision_id),
                "Support",
                now
            )
            .await
            .map_err(|e| e.to_string())?
    );
    let published = store
        .published_panel(tenant)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("panel missing")?;
    assert_eq!(published.message_id.as_deref(), Some("330"));
    let binding_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM support.support_panel_binding WHERE tenant_id=$1")
            .bind(tenant)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!(binding_count, 1);
    Ok(())
}

#[tokio::test]
async fn older_uncertain_revision_stays_beside_the_newer_panel() -> Result<(), String> {
    let Some((store, pool, tenant, guild)) = fixture().await? else {
        return Ok(());
    };
    let now = OffsetDateTime::now_utc();
    let older = store
        .prepare_panel(tenant, &guild, "220", "First", "First", now)
        .await
        .map_err(|e| e.to_string())?;
    store
        .degrade_panel(tenant, older.revision_id)
        .await
        .map_err(|e| e.to_string())?;
    let newer = store
        .prepare_panel(tenant, &guild, "221", "Second", "Second", now)
        .await
        .map_err(|e| e.to_string())?;
    store
        .publish_panel(
            tenant,
            &guild,
            "123",
            newer.revision_id,
            "331",
            &format!("support:{}", newer.revision_id),
            now,
        )
        .await
        .map_err(|e| e.to_string())?;
    assert!(
        store
            .reconcile_panel_nonce(
                &older.nonce,
                "220",
                "330",
                "123",
                "123",
                &format!("support:{}", older.revision_id),
                "First",
                now
            )
            .await
            .map_err(|e| e.to_string())?
    );
    let published_count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM support.support_panel_revision WHERE tenant_id=$1 AND state='Published'",
    )
    .bind(tenant)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;
    assert_eq!(published_count, 2);
    let newer_state: String =
        sqlx::query_scalar("SELECT state FROM support.support_panel_revision WHERE revision_id=$1")
            .bind(newer.revision_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    assert_eq!(newer_state, "Published");
    Ok(())
}
