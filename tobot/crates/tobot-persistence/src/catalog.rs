//! Publicación inmutable del catálogo comercial y entrega a Billing.

use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::CommercialCatalogStore;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CatalogBenefit {
    Feature {
        key: String,
    },
    Perk {
        key: String,
    },
    Limit {
        key: String,
        quantity: i64,
        unit: String,
    },
}

#[derive(Clone, Debug, Serialize)]
pub struct CatalogCapability {
    pub kind: &'static str,
    pub key: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub unit: Option<&'static str>,
    pub minimum: Option<i64>,
    pub maximum: Option<i64>,
    pub owner: &'static str,
}

pub fn supported_catalog_capabilities() -> Vec<CatalogCapability> {
    vec![
        CatalogCapability {
            kind: "feature",
            key: "platform.base",
            label: "Platform plan access",
            description: "Required for every offer. Records the paid platform entitlement; it does not unlock other bot modules by itself.",
            unit: None,
            minimum: None,
            maximum: None,
            owner: "platform_entitlement",
        },
        CatalogCapability {
            kind: "limit",
            key: "support.max_open_tickets",
            label: "Open support tickets",
            description: "Checked with an empty number means no cap. A number from 1 to 1000 is the cap. Unchecked means support is not included.",
            unit: Some("tickets"),
            minimum: Some(1),
            maximum: Some(1000),
            owner: "support",
        },
    ]
}

pub(crate) fn validate_benefits(benefits: &[CatalogBenefit]) -> Result<(), &'static str> {
    if benefits.is_empty() || benefits.len() > 16 {
        return Err("invalid commercial benefit count");
    }
    let mut keys = std::collections::HashSet::new();
    for benefit in benefits {
        let (key, valid) = match benefit {
            CatalogBenefit::Feature { key } => {
                (key, key == "platform.base" || key == "support.closed")
            }
            CatalogBenefit::Perk { key } => (key, false),
            CatalogBenefit::Limit {
                key,
                quantity,
                unit,
            } => (
                key,
                key == "support.max_open_tickets"
                    && unit == "tickets"
                    && (1..=1000).contains(quantity),
            ),
        };
        if !valid || !keys.insert(key.as_str()) {
            return Err("unsupported or duplicate commercial benefit");
        }
    }
    if !keys.contains("platform.base") {
        return Err("base plan feature is required");
    }
    if keys.contains("support.closed") && keys.contains("support.max_open_tickets") {
        return Err("support cannot be closed and capped");
    }
    Ok(())
}

/// Plan de la app para un servidor sin proyección de pago. No tiene precio de Stripe.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct DefaultPlan {
    pub enabled: bool,
    pub support_open: bool,
    pub ticket_quantity: Option<i32>,
}

impl DefaultPlan {
    #[must_use]
    pub const fn open() -> Self {
        Self {
            enabled: true,
            support_open: true,
            ticket_quantity: None,
        }
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        if self.ticket_quantity.is_some_and(|quantity| !(1..=1000).contains(&quantity)) {
            return Err("ticket cap must be from 1 to 1000");
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CatalogPublication {
    pub revision_id: Uuid,
    pub product_key: String,
    pub product_kind: String,
    pub display_name: String,
    pub provider: String,
    pub environment: String,
    pub provider_account: String,
    pub provider_price_ref: String,
    pub currency: String,
    pub unit_amount: i64,
    pub interval_name: String,
    pub feature_key: String,
    #[serde(default)]
    pub benefits: Vec<CatalogBenefit>,
    pub regions: Vec<String>,
    pub tax_classification: String,
    pub merchant_of_record: String,
    pub terms_url: String,
    pub privacy_url: String,
    pub support_url: String,
    pub grace_seconds: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct CatalogPublicationStatus {
    pub revision: CatalogPublication,
    pub state: String,
    pub last_error: Option<String>,
}

impl CatalogPublication {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.product_key.len() < 2
            || self.product_key.len() > 80
            || !self
                .product_key
                .starts_with(|c: char| c.is_ascii_lowercase())
            || !self.product_key.bytes().all(|b| {
                b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-')
            })
            || self.product_kind != "BasePlan"
            || self.provider != "Stripe"
            || self.environment != "test"
            || !self.provider_account.starts_with("acct_")
            || !self.provider_price_ref.starts_with("price_")
            || self.currency.len() != 3
            || !self.currency.bytes().all(|b| b.is_ascii_lowercase())
            || self.unit_amount <= 0
            || self.unit_amount >= 9_000_000_000_000
            || !matches!(self.interval_name.as_str(), "month" | "year")
            || self.display_name.is_empty()
            || self.display_name.len() > 120
            || self.feature_key != "platform.base"
            || self.regions.is_empty()
            || self.regions.len() > 16
            || !self
                .regions
                .iter()
                .all(|region| region.len() == 2 && region.bytes().all(|b| b.is_ascii_uppercase()))
            || !self.tax_classification.starts_with("txcd_")
            || self.tax_classification.len() <= 5
            || self.tax_classification.len() > 120
            || !self
                .tax_classification
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || self.merchant_of_record.is_empty()
            || self.merchant_of_record.len() > 120
            || self.grace_seconds < 0
            || self.grace_seconds > 2_592_000
        {
            return Err("invalid commercial catalog terms");
        }
        validate_benefits(&self.benefits)?;
        for url in [&self.terms_url, &self.privacy_url, &self.support_url] {
            if !url.starts_with("https://")
                || url.len() > 500
                || url
                    .bytes()
                    .any(|b| b.is_ascii_whitespace() || matches!(b, b'@' | b'#'))
            {
                return Err("invalid commercial policy URL");
            }
        }
        Ok(())
    }
}

fn from_row(row: &sqlx::postgres::PgRow) -> Result<CatalogPublication, sqlx::Error> {
    Ok(CatalogPublication {
        revision_id: row.try_get("revision_id")?,
        product_key: row.try_get("product_key")?,
        product_kind: row.try_get("product_kind")?,
        display_name: row.try_get("display_name")?,
        provider: row.try_get("provider")?,
        environment: row.try_get("environment")?,
        provider_account: row.try_get("provider_account")?,
        provider_price_ref: row.try_get("provider_price_ref")?,
        currency: row.try_get("currency")?,
        unit_amount: row.try_get("unit_amount")?,
        interval_name: row.try_get("interval_name")?,
        feature_key: row.try_get("feature_key")?,
        benefits: serde_json::from_value(row.try_get("benefits")?)
            .map_err(|error| sqlx::Error::Decode(Box::new(error)))?,
        regions: row.try_get("regions")?,
        tax_classification: row.try_get("tax_classification")?,
        merchant_of_record: row.try_get("merchant_of_record")?,
        terms_url: row.try_get("terms_url")?,
        privacy_url: row.try_get("privacy_url")?,
        support_url: row.try_get("support_url")?,
        grace_seconds: row.try_get("grace_seconds")?,
    })
}

const FIELDS: &str = "revision_id,product_key,product_kind,display_name,provider,environment,provider_account,provider_price_ref,currency,unit_amount,interval_name,feature_key,benefits,regions,tax_classification,merchant_of_record,terms_url,privacy_url,support_url,grace_seconds";

impl CommercialCatalogStore {
    pub async fn request_publication(
        &self,
        revision: &CatalogPublication,
    ) -> Result<(), sqlx::Error> {
        revision
            .validate()
            .map_err(|reason| sqlx::Error::Protocol(reason.to_owned()))?;
        let mut tx = self.pool.begin().await?;
        let other_product: Option<String> = sqlx::query_scalar("SELECT product_key FROM commercial_catalog.revision WHERE provider=$1 AND environment=$2 AND provider_account=$3 AND provider_price_ref=$4 AND state IN ('Pending','Active') AND product_key<>$5 LIMIT 1")
            .bind(&revision.provider).bind(&revision.environment).bind(&revision.provider_account)
            .bind(&revision.provider_price_ref).bind(&revision.product_key).fetch_optional(&mut *tx).await?;
        if other_product.is_some() {
            return Err(sqlx::Error::Protocol(
                "provider Price is assigned to another offer".to_owned(),
            ));
        }
        let benefits = serde_json::to_value(&revision.benefits)
            .map_err(|error| sqlx::Error::Encode(Box::new(error)))?;
        let inserted=sqlx::query("INSERT INTO commercial_catalog.revision (revision_id,product_key,product_kind,display_name,provider,environment,provider_account,provider_price_ref,currency,unit_amount,interval_name,feature_key,benefits,regions,tax_classification,merchant_of_record,terms_url,privacy_url,support_url,grace_seconds,state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'Pending') ON CONFLICT (revision_id) DO NOTHING")
            .bind(revision.revision_id).bind(&revision.product_key).bind(&revision.product_kind)
            .bind(&revision.display_name).bind(&revision.provider).bind(&revision.environment)
            .bind(&revision.provider_account).bind(&revision.provider_price_ref).bind(&revision.currency)
            .bind(revision.unit_amount).bind(&revision.interval_name).bind(&revision.feature_key).bind(benefits)
            .bind(&revision.regions).bind(&revision.tax_classification).bind(&revision.merchant_of_record)
            .bind(&revision.terms_url).bind(&revision.privacy_url).bind(&revision.support_url)
            .bind(revision.grace_seconds).execute(&mut *tx).await?;
        if inserted.rows_affected() == 0 {
            let query =
                format!("SELECT {FIELDS} FROM commercial_catalog.revision WHERE revision_id=$1");
            let row = sqlx::query(&query)
                .bind(revision.revision_id)
                .fetch_one(&mut *tx)
                .await?;
            if from_row(&row)? != *revision {
                return Err(sqlx::Error::Protocol(
                    "catalog revision identity conflict".to_owned(),
                ));
            }
        }
        sqlx::query("INSERT INTO commercial_catalog.delivery_outbox (revision_id) VALUES ($1) ON CONFLICT (revision_id) DO NOTHING")
            .bind(revision.revision_id).execute(&mut *tx).await?;
        tx.commit().await
    }

    pub async fn pending_publications(&self) -> Result<Vec<CatalogPublication>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELDS} FROM commercial_catalog.revision r JOIN commercial_catalog.delivery_outbox o USING (revision_id) WHERE o.delivered_at IS NULL AND o.next_attempt_at<=now() ORDER BY r.requested_at LIMIT 8"
        );
        sqlx::query(&query)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(from_row)
            .collect()
    }

    pub async fn publication_retry(
        &self,
        revision_id: Uuid,
        reason: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE commercial_catalog.delivery_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '30 seconds',last_error=$2 WHERE revision_id=$1 AND delivered_at IS NULL")
            .bind(revision_id).bind(reason.chars().take(200).collect::<String>()).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn publication_delivered(&self, revision_id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let product_key: String = sqlx::query_scalar(
            "SELECT product_key FROM commercial_catalog.revision WHERE revision_id=$1",
        )
        .bind(revision_id)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(&product_key)
            .execute(&mut *tx)
            .await?;
        let pending: bool = sqlx::query_scalar("SELECT state='Pending' FROM commercial_catalog.revision WHERE revision_id=$1 FOR UPDATE")
            .bind(revision_id).fetch_one(&mut *tx).await?;
        if pending {
            sqlx::query("UPDATE commercial_catalog.revision SET state='Retired' WHERE product_key=$1 AND state='Active'")
                .bind(&product_key).execute(&mut *tx).await?;
            sqlx::query("UPDATE commercial_catalog.revision SET state='Active',published_at=COALESCE(published_at,now()) WHERE revision_id=$1 AND state='Pending'")
                .bind(revision_id).execute(&mut *tx).await?;
        }
        sqlx::query("UPDATE commercial_catalog.delivery_outbox SET delivered_at=now(),last_error=NULL WHERE revision_id=$1 AND delivered_at IS NULL")
            .bind(revision_id).execute(&mut *tx).await?;
        tx.commit().await
    }

    pub async fn active_revision(
        &self,
        revision_id: Uuid,
    ) -> Result<Option<CatalogPublication>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELDS} FROM commercial_catalog.revision WHERE revision_id=$1 AND state='Active' AND jsonb_array_length(benefits)>0"
        );
        sqlx::query(&query)
            .bind(revision_id)
            .fetch_optional(&self.pool)
            .await?
            .as_ref()
            .map(from_row)
            .transpose()
    }

    pub async fn active_offers(&self) -> Result<Vec<CatalogPublication>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELDS} FROM commercial_catalog.revision WHERE state='Active' AND product_kind='BasePlan' AND jsonb_array_length(benefits)>0 ORDER BY display_name,revision_id"
        );
        sqlx::query(&query)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(from_row)
            .collect()
    }

    pub async fn statuses(&self) -> Result<Vec<CatalogPublicationStatus>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELDS},r.state,o.last_error FROM commercial_catalog.revision r JOIN commercial_catalog.delivery_outbox o USING (revision_id) ORDER BY r.requested_at DESC LIMIT 100"
        );
        sqlx::query(&query)
            .fetch_all(&self.pool)
            .await?
            .iter()
            .map(|row| {
                Ok(CatalogPublicationStatus {
                    revision: from_row(row)?,
                    state: row.try_get("state")?,
                    last_error: row.try_get("last_error")?,
                })
            })
            .collect()
    }

    pub async fn latest_status(&self) -> Result<Option<CatalogPublicationStatus>, sqlx::Error> {
        let query = format!(
            "SELECT {FIELDS},r.state,o.last_error FROM commercial_catalog.revision r JOIN commercial_catalog.delivery_outbox o USING (revision_id) ORDER BY r.requested_at DESC LIMIT 1"
        );
        sqlx::query(&query)
            .fetch_optional(&self.pool)
            .await?
            .map(|row| {
                Ok(CatalogPublicationStatus {
                    revision: from_row(&row)?,
                    state: row.try_get("state")?,
                    last_error: row.try_get("last_error")?,
                })
            })
            .transpose()
    }

    pub async fn retire_revision(&self, revision_id: Uuid) -> Result<bool, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let retired = sqlx::query("UPDATE commercial_catalog.revision SET state='Retired' WHERE revision_id=$1 AND state IN ('Pending','Active')")
            .bind(revision_id).execute(&mut *tx).await?;
        if retired.rows_affected() != 0 {
            sqlx::query("UPDATE commercial_catalog.delivery_outbox SET delivered_at=COALESCE(delivered_at,now()),last_error='retired by operator' WHERE revision_id=$1")
                .bind(revision_id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(retired.rows_affected() != 0)
    }

    /// El plan free. Si la fila no existe, el comportamiento histórico: activo y sin tope.
    ///
    /// # Errors
    ///
    /// Devuelve error si la fila no se puede leer.
    pub async fn default_plan(&self) -> Result<DefaultPlan, sqlx::Error> {
        let row = sqlx::query(
            "SELECT enabled, support_open, ticket_quantity FROM commercial_catalog.default_plan WHERE plan_key='free'",
        )
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(DefaultPlan::open());
        };
        Ok(DefaultPlan {
            enabled: row.try_get("enabled")?,
            support_open: row.try_get("support_open")?,
            ticket_quantity: row.try_get("ticket_quantity")?,
        })
    }

    /// # Errors
    ///
    /// Rechaza un tope fuera de 1–1000. Un error de base de datos también se devuelve.
    pub async fn save_default_plan(&self, plan: &DefaultPlan) -> Result<(), sqlx::Error> {
        if let Err(reason) = plan.validate() {
            return Err(sqlx::Error::Protocol(reason.to_owned()));
        }
        sqlx::query(
            "INSERT INTO commercial_catalog.default_plan (plan_key, enabled, support_open, ticket_quantity) VALUES ('free',$1,$2,$3) ON CONFLICT (plan_key) DO UPDATE SET enabled=EXCLUDED.enabled, support_open=EXCLUDED.support_open, ticket_quantity=EXCLUDED.ticket_quantity",
        )
        .bind(plan.enabled)
        .bind(plan.support_open)
        .bind(plan.ticket_quantity)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Migrations;

    #[test]
    fn closed_support_is_explicit_and_cannot_also_set_a_cap() {
        let closed = vec![
            CatalogBenefit::Feature {
                key: "platform.base".to_owned(),
            },
            CatalogBenefit::Feature {
                key: "support.closed".to_owned(),
            },
        ];
        assert!(validate_benefits(&closed).is_ok());
        let both = vec![
            CatalogBenefit::Feature {
                key: "platform.base".to_owned(),
            },
            CatalogBenefit::Feature {
                key: "support.closed".to_owned(),
            },
            CatalogBenefit::Limit {
                key: "support.max_open_tickets".to_owned(),
                quantity: 1,
                unit: "tickets".to_owned(),
            },
        ];
        assert!(validate_benefits(&both).is_err());
        assert!(
            DefaultPlan {
                enabled: true,
                support_open: true,
                ticket_quantity: Some(0),
            }
            .validate()
            .is_err()
        );
    }

    #[tokio::test]
    async fn publication_is_immutable_and_retries_until_billing_ack() {
        let Ok(url) = std::env::var("TOBOT_S7_TEST_DATABASE_URL") else {
            return;
        };
        assert_eq!(
            url.split('?')
                .next()
                .and_then(|value| value.rsplit('/').next()),
            Some("tobot_test"),
            "S7 tests require a disposable tobot_test database"
        );
        Migrations::connect(&url)
            .await
            .unwrap()
            .migrate()
            .await
            .unwrap();
        let store = CommercialCatalogStore::connect(&url).await.unwrap();
        let revision = CatalogPublication {
            revision_id: Uuid::now_v7(),
            product_key: "base".to_owned(),
            product_kind: "BasePlan".to_owned(),
            display_name: "Test plan".to_owned(),
            provider: "Stripe".to_owned(),
            environment: "test".to_owned(),
            provider_account: "acct_test".to_owned(),
            provider_price_ref: "price_test".to_owned(),
            currency: "usd".to_owned(),
            unit_amount: 499,
            interval_name: "month".to_owned(),
            feature_key: "platform.base".to_owned(),
            benefits: vec![CatalogBenefit::Feature {
                key: "platform.base".to_owned(),
            }],
            regions: vec!["US".to_owned()],
            tax_classification: "txcd_10000000".to_owned(),
            merchant_of_record: "Tobot test".to_owned(),
            terms_url: "https://example.com/terms".to_owned(),
            privacy_url: "https://example.com/privacy".to_owned(),
            support_url: "https://example.com/support".to_owned(),
            grace_seconds: 86400,
        };
        store.request_publication(&revision).await.unwrap();
        store.request_publication(&revision).await.unwrap();
        let mut changed = revision.clone();
        changed.unit_amount = 500;
        assert!(store.request_publication(&changed).await.is_err());
        assert!(
            store
                .active_revision(revision.revision_id)
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            store.pending_publications().await.unwrap(),
            vec![revision.clone()]
        );
        store
            .publication_delivered(revision.revision_id)
            .await
            .unwrap();
        assert_eq!(
            store.active_revision(revision.revision_id).await.unwrap(),
            Some(revision.clone())
        );
        let mut second = revision.clone();
        second.revision_id = Uuid::now_v7();
        second.product_key = "second.offer".to_owned();
        second.provider_price_ref = "price_second".to_owned();
        second.benefits.push(CatalogBenefit::Limit {
            key: "support.max_open_tickets".to_owned(),
            quantity: 25,
            unit: "tickets".to_owned(),
        });
        store.request_publication(&second).await.unwrap();
        store
            .publication_delivered(second.revision_id)
            .await
            .unwrap();
        assert_eq!(store.active_offers().await.unwrap().len(), 2);
        let mut conflicting_price = second.clone();
        conflicting_price.revision_id = Uuid::now_v7();
        conflicting_price.product_key = "third.offer".to_owned();
        assert!(store.request_publication(&conflicting_price).await.is_err());
        let mut successor = second.clone();
        successor.revision_id = Uuid::now_v7();
        successor.benefits[1] = CatalogBenefit::Limit {
            key: "support.max_open_tickets".to_owned(),
            quantity: 50,
            unit: "tickets".to_owned(),
        };
        store.request_publication(&successor).await.unwrap();
        store
            .publication_delivered(successor.revision_id)
            .await
            .unwrap();
        assert!(
            store
                .active_revision(second.revision_id)
                .await
                .unwrap()
                .is_none()
        );
        assert_eq!(
            store.active_revision(successor.revision_id).await.unwrap(),
            Some(successor)
        );
        assert!(
            store
                .active_revision(revision.revision_id)
                .await
                .unwrap()
                .is_some()
        );
        assert!(store.pending_publications().await.unwrap().is_empty());
        assert!(store.retire_revision(revision.revision_id).await.unwrap());
        assert!(
            store
                .active_revision(revision.revision_id)
                .await
                .unwrap()
                .is_none()
        );
        let mut replacement = revision;
        replacement.revision_id = Uuid::now_v7();
        store.request_publication(&replacement).await.unwrap();
        assert_eq!(
            store.pending_publications().await.unwrap(),
            vec![replacement]
        );
    }

    #[test]
    fn rejects_unwired_and_invalid_benefits() {
        assert!(
            validate_benefits(&[CatalogBenefit::Feature {
                key: "support.priority".to_owned()
            }])
            .is_err()
        );
        assert!(
            validate_benefits(&[
                CatalogBenefit::Feature {
                    key: "platform.base".to_owned()
                },
                CatalogBenefit::Limit {
                    key: "support.max_open_tickets".to_owned(),
                    quantity: 0,
                    unit: "tickets".to_owned()
                },
            ])
            .is_err()
        );
    }
}
