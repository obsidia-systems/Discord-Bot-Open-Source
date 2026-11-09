//! Aplicación idempotente de fuentes comerciales; solo esta fachada escribe GRANT_SOURCE.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{CatalogBenefit, PlatformEntitlementStore, catalog::validate_benefits};

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommercialGrant {
    pub fact_id: Uuid,
    pub order_id: Uuid,
    pub tenant_id: Uuid,
    pub source_sequence: i64,
    pub source_version: String,
    pub schema_family: String,
    pub state: String,
    pub feature_key: String,
    #[serde(default)]
    pub benefits: Vec<CatalogBenefit>,
    pub valid_until: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntitlementProjection {
    pub tenant_id: Uuid,
    pub order_id: Uuid,
    pub generation: i64,
    pub state: String,
    pub feature_key: String,
    pub benefits: Vec<CatalogBenefit>,
    pub valid_until: Option<i64>,
    pub computed_at: i64,
    pub source_sequence: i64,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListedGuild {
    pub tenant_id: Uuid,
    pub guild_id: String,
    pub tenant_state: String,
    pub installation_state: Option<String>,
    pub plan_state: Option<String>,
    pub plan_active: bool,
    pub benefits: Vec<CatalogBenefit>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GuildList {
    pub servers: Vec<ListedGuild>,
    pub truncated: bool,
}

impl PlatformEntitlementStore {
    pub async fn apply_commercial_grant(&self, fact: &CommercialGrant) -> Result<(), sqlx::Error> {
        if fact.schema_family != "CommercialPayment"
            || fact.source_sequence <= 0
            || fact.source_version.is_empty()
            || !matches!(
                fact.state.as_str(),
                "Active" | "Grace" | "Restricted" | "Cancelled" | "Frozen" | "Reversed"
            )
            || fact.feature_key.is_empty()
            || fact.feature_key.len() > 120
        {
            return Err(sqlx::Error::Protocol("invalid commercial grant".to_owned()));
        }
        if !fact.benefits.is_empty() {
            validate_benefits(&fact.benefits)
                .map_err(|reason| sqlx::Error::Protocol(reason.to_owned()))?;
        }
        let valid_until = fact
            .valid_until
            .map(OffsetDateTime::from_unix_timestamp)
            .transpose()
            .map_err(|_| sqlx::Error::Protocol("invalid grant deadline".to_owned()))?;
        let benefits = serde_json::to_value(&fact.benefits)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let mut tx = self.pool.begin().await?;
        let previous: Option<serde_json::Value> = sqlx::query_scalar("SELECT benefits FROM platform_entitlement.grant_source WHERE order_id=$1 ORDER BY source_sequence DESC LIMIT 1")
            .bind(fact.order_id).fetch_optional(&mut *tx).await?;
        if previous.as_ref().is_some_and(|value| value != &benefits) {
            return Err(sqlx::Error::Protocol(
                "commercial grant benefits changed for order".to_owned(),
            ));
        }
        let inserted = sqlx::query("INSERT INTO platform_entitlement.grant_source (fact_id,order_id,tenant_id,source_sequence,source_version,schema_family,state,feature_key,benefits,valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (fact_id) DO NOTHING")
            .bind(fact.fact_id).bind(fact.order_id).bind(fact.tenant_id).bind(fact.source_sequence)
            .bind(&fact.source_version).bind(&fact.schema_family).bind(&fact.state).bind(&fact.feature_key)
            .bind(&benefits).bind(valid_until).execute(&mut *tx).await?;
        if inserted.rows_affected() == 0 {
            let same: Option<bool> = sqlx::query_scalar("SELECT order_id=$2 AND tenant_id=$3 AND source_sequence=$4 AND source_version=$5 AND state=$6 AND feature_key=$7 AND schema_family=$8 AND valid_until IS NOT DISTINCT FROM $9 AND benefits=$10 FROM platform_entitlement.grant_source WHERE fact_id=$1")
                .bind(fact.fact_id).bind(fact.order_id).bind(fact.tenant_id).bind(fact.source_sequence)
                .bind(&fact.source_version).bind(&fact.state).bind(&fact.feature_key).bind(&fact.schema_family).bind(valid_until).bind(&benefits).fetch_optional(&mut *tx).await?;
            if same != Some(true) {
                return Err(sqlx::Error::Protocol(
                    "commercial grant identity conflict".to_owned(),
                ));
            }
        }
        let existing = sqlx::query("SELECT order_id,source_sequence FROM platform_entitlement.projection WHERE tenant_id=$1 FOR UPDATE")
            .bind(fact.tenant_id).fetch_optional(&mut *tx).await?;
        if let Some(row) = existing {
            if row.try_get::<Uuid, _>("order_id")? != fact.order_id {
                return Err(sqlx::Error::Protocol(
                    "scope already funded by another order".to_owned(),
                ));
            }
            if row.try_get::<i64, _>("source_sequence")? >= fact.source_sequence {
                tx.commit().await?;
                return Ok(());
            }
        }
        sqlx::query("INSERT INTO platform_entitlement.projection (tenant_id,order_id,source_sequence,generation,state,feature_key,benefits,valid_until,last_fact_id) VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id) DO UPDATE SET source_sequence=EXCLUDED.source_sequence,generation=platform_entitlement.projection.generation+1,state=EXCLUDED.state,feature_key=EXCLUDED.feature_key,benefits=EXCLUDED.benefits,valid_until=EXCLUDED.valid_until,last_fact_id=EXCLUDED.last_fact_id,computed_at=now() WHERE platform_entitlement.projection.source_sequence<EXCLUDED.source_sequence")
            .bind(fact.tenant_id).bind(fact.order_id).bind(fact.source_sequence).bind(&fact.state)
            .bind(&fact.feature_key).bind(&benefits).bind(valid_until).bind(fact.fact_id).execute(&mut *tx).await?;
        tx.commit().await
    }

    pub async fn projection(
        &self,
        tenant: Uuid,
    ) -> Result<Option<EntitlementProjection>, sqlx::Error> {
        let row=sqlx::query("SELECT p.tenant_id,p.order_id,p.source_sequence,p.generation,p.state,p.feature_key,p.benefits,p.valid_until,p.computed_at FROM platform_entitlement.projection p JOIN installation.tenant t ON t.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND t.state='Active'")
            .bind(tenant).fetch_optional(&self.pool).await?;
        row.map(|row| {
            let state: String = row.try_get("state")?;
            let valid_until: Option<OffsetDateTime> = row.try_get("valid_until")?;
            let now = OffsetDateTime::now_utc();
            let active = matches!(state.as_str(), "Active" | "Grace")
                && valid_until.is_none_or(|until| until > now);
            Ok(EntitlementProjection {
                tenant_id: row.try_get("tenant_id")?,
                order_id: row.try_get("order_id")?,
                generation: row.try_get("generation")?,
                source_sequence: row.try_get("source_sequence")?,
                state,
                feature_key: row.try_get("feature_key")?,
                benefits: serde_json::from_value(row.try_get("benefits")?)
                    .map_err(|error| sqlx::Error::Decode(Box::new(error)))?,
                valid_until: valid_until.map(|value| value.unix_timestamp()),
                computed_at: row
                    .try_get::<OffsetDateTime, _>("computed_at")?
                    .unix_timestamp(),
                active,
            })
        })
        .transpose()
    }

    /// Registra un grant de compensación. No escribe lotes: solo el hecho y el acceso `ai.text`.
    /// # Errors
    /// Rechaza un origen repetido con otro importe, o un tenant que no existe.
    pub async fn apply_compensation(
        &self,
        fact_id: Uuid,
        tenant_id: Uuid,
        source_ref: Uuid,
        credit_minors: i64,
        expires_at: Option<OffsetDateTime>,
    ) -> Result<(), sqlx::Error> {
        if credit_minors <= 0 {
            return Err(sqlx::Error::Protocol(
                "invalid compensation amount".to_owned(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        let inserted = sqlx::query("INSERT INTO platform_entitlement.compensation_grant (fact_id,tenant_id,source_ref,credit_minors,expires_at,feature_key) VALUES ($1,$2,$3,$4,$5,'ai.text') ON CONFLICT (source_ref) DO NOTHING")
            .bind(fact_id).bind(tenant_id).bind(source_ref).bind(credit_minors).bind(expires_at)
            .execute(&mut *tx).await?;
        if inserted.rows_affected() == 0 {
            let same: Option<bool> = sqlx::query_scalar("SELECT fact_id=$2 AND tenant_id=$3 AND credit_minors=$4 AND expires_at IS NOT DISTINCT FROM $5 FROM platform_entitlement.compensation_grant WHERE source_ref=$1")
                .bind(source_ref).bind(fact_id).bind(tenant_id).bind(credit_minors).bind(expires_at)
                .fetch_optional(&mut *tx).await?;
            if same != Some(true) {
                return Err(sqlx::Error::Protocol(
                    "compensation grant conflict".to_owned(),
                ));
            }
        }
        sqlx::query("INSERT INTO platform_entitlement.ai_access (tenant_id,feature_key,generation,source_fact_id,state) VALUES ($1,'ai.text',1,$2,'Active') ON CONFLICT (tenant_id) DO UPDATE SET generation=platform_entitlement.ai_access.generation+1,source_fact_id=EXCLUDED.source_fact_id,computed_at=now()")
            .bind(tenant_id).bind(fact_id).execute(&mut *tx).await?;
        tx.commit().await
    }

    /// # Errors
    /// Devuelve error si la proyección de acceso no se puede leer.
    pub async fn ai_text_active(&self, tenant: Uuid) -> Result<bool, sqlx::Error> {
        let active: Option<bool> = sqlx::query_scalar("SELECT true FROM platform_entitlement.ai_access a JOIN installation.tenant t ON t.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.feature_key='ai.text' AND a.state='Active' AND t.state='Active'")
            .bind(tenant).fetch_optional(&self.pool).await?;
        Ok(active.unwrap_or(false))
    }

    /// # Errors
    /// Devuelve error si la cola de entrega no se puede leer.
    pub async fn pending_compensations(
        &self,
    ) -> Result<Vec<(Uuid, Uuid, Uuid, i64, Option<OffsetDateTime>)>, sqlx::Error> {
        sqlx::query_as("SELECT fact_id,tenant_id,source_ref,credit_minors,expires_at FROM platform_entitlement.compensation_grant WHERE delivered_at IS NULL ORDER BY applied_at LIMIT 20")
            .fetch_all(&self.pool).await
    }

    /// # Errors
    /// Devuelve error si no se puede marcar la entrega.
    pub async fn mark_compensation_delivered(&self, fact_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE platform_entitlement.compensation_grant SET delivered_at=now() WHERE fact_id=$1")
            .bind(fact_id).execute(&self.pool).await?;
        Ok(())
    }

    /// Una fila por servidor. El nombre de Discord no está guardado.
    ///
    /// # Errors
    ///
    /// Devuelve error si la lista o un beneficio no se pueden leer.
    pub async fn listed_guilds(&self) -> Result<GuildList, sqlx::Error> {
        let rows = sqlx::query(
            "SELECT t.tenant_id, t.provider_tenant_ref, t.state AS tenant_state, i.state AS installation_state, p.state AS plan_state, p.benefits, p.valid_until FROM installation.tenant t LEFT JOIN LATERAL (SELECT state FROM installation.installation WHERE tenant_id=t.tenant_id ORDER BY generation DESC LIMIT 1) i ON true LEFT JOIN platform_entitlement.projection p ON p.tenant_id=t.tenant_id WHERE t.tenant_type='Guild' ORDER BY t.provider_tenant_ref LIMIT 201",
        )
        .fetch_all(&self.pool)
        .await?;
        let truncated = rows.len() > 200;
        let mut servers = Vec::new();
        for row in rows.into_iter().take(200) {
            let plan_state: Option<String> = row.try_get("plan_state")?;
            let valid_until: Option<OffsetDateTime> = row.try_get("valid_until")?;
            let now = OffsetDateTime::now_utc();
            let benefits = match row.try_get::<Option<serde_json::Value>, _>("benefits")? {
                Some(value) => serde_json::from_value(value)
                    .map_err(|error| sqlx::Error::Decode(Box::new(error)))?,
                None => Vec::new(),
            };
            servers.push(ListedGuild {
                tenant_id: row.try_get("tenant_id")?,
                guild_id: row.try_get("provider_tenant_ref")?,
                tenant_state: row.try_get("tenant_state")?,
                installation_state: row.try_get("installation_state")?,
                plan_active: matches!(plan_state.as_deref(), Some("Active" | "Grace"))
                    && valid_until.is_none_or(|until| until > now),
                plan_state,
                benefits,
            });
        }
        Ok(GuildList { servers, truncated })
    }

    /// Snowflake de Discord para los tenants que el lector ya acotó.
    /// # Errors
    /// Devuelve un error si la instalación no se puede leer.
    pub async fn guild_snowflakes(&self, ids: &[Uuid]) -> Result<Vec<(Uuid, String)>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            "SELECT tenant_id, provider_tenant_ref FROM installation.tenant WHERE tenant_id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&self.pool)
        .await?;
        let mut found = Vec::new();
        for row in rows {
            found.push((
                row.try_get("tenant_id")?,
                row.try_get("provider_tenant_ref")?,
            ));
        }
        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn duplicate_and_older_grants_do_not_reactivate_a_frozen_scope() {
        let Ok(url) = std::env::var("TOBOT_S7_TEST_DATABASE_URL") else {
            return;
        };
        let store = PlatformEntitlementStore::connect(&url).await.unwrap();
        let tenant = Uuid::now_v7();
        sqlx::query("INSERT INTO installation.tenant (tenant_id,tenant_type,provider_tenant_ref,application_id,state) VALUES ($1,'Guild',$2,'s7-test','Active')")
            .bind(tenant).bind(tenant.as_u128().to_string()).execute(&store.pool).await.unwrap();
        let order = Uuid::now_v7();
        let first = CommercialGrant {
            fact_id: Uuid::now_v7(),
            order_id: order,
            tenant_id: tenant,
            source_sequence: 1,
            source_version: "in_test_paid".to_owned(),
            schema_family: "CommercialPayment".to_owned(),
            state: "Active".to_owned(),
            feature_key: "platform.test".to_owned(),
            benefits: vec![CatalogBenefit::Feature {
                key: "platform.base".to_owned(),
            }],
            valid_until: Some(
                (OffsetDateTime::now_utc() + time::Duration::days(30)).unix_timestamp(),
            ),
        };
        store.apply_commercial_grant(&first).await.unwrap();
        store.apply_commercial_grant(&first).await.unwrap();
        let active = store.projection(tenant).await.unwrap().unwrap();
        assert!(active.active);
        assert_eq!(active.generation, 1);
        let freeze = CommercialGrant {
            fact_id: Uuid::now_v7(),
            source_sequence: 2,
            source_version: "dp_test".to_owned(),
            state: "Frozen".to_owned(),
            valid_until: None,
            ..first.clone()
        };
        store.apply_commercial_grant(&freeze).await.unwrap();
        store.apply_commercial_grant(&first).await.unwrap();
        let frozen = store.projection(tenant).await.unwrap().unwrap();
        assert!(!frozen.active);
        assert_eq!(frozen.generation, 2);
        let wrong = CommercialGrant {
            fact_id: Uuid::now_v7(),
            source_sequence: 3,
            schema_family: "VirtualPayment".to_owned(),
            ..first
        };
        assert!(store.apply_commercial_grant(&wrong).await.is_err());
    }
}
