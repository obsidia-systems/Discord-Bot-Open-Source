//! Sondas cortas hacia los procesos que el admin no puede alcanzar.

use std::time::Duration;

use reqwest::Client;
use serde_json::Value;

use crate::ai::AiClient;
use crate::ledger_client::LedgerClient;

const PROBE_BUDGET: Duration = Duration::from_millis(700);

#[derive(Clone)]
pub(super) struct RemoteHealth {
    http: Client,
    ai: Option<AiClient>,
    ledger: LedgerClient,
    ai_url: Option<String>,
    ledger_url: Option<String>,
    billing_url: Option<String>,
    stripe_url: Option<String>,
    stripe_token: Option<String>,
}

impl RemoteHealth {
    pub(super) fn new(ai: Option<AiClient>, ledger: LedgerClient) -> Self {
        let http = Client::builder()
            .timeout(PROBE_BUDGET)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            http,
            ai,
            ledger,
            ai_url: http_base("TOBOT_AI_URL"),
            ledger_url: http_base("TOBOT_LEDGER_URL"),
            billing_url: http_base("TOBOT_BILLING_URL"),
            stripe_url: http_base("TOBOT_PROVIDER_EDGE_URL"),
            stripe_token: std::env::var("TOBOT_PROVIDER_TO_BILLING_TOKEN")
                .ok()
                .filter(|value| value.len() >= 32),
        }
    }

    pub(super) async fn samples(&self) -> Vec<(&'static str, i64)> {
        let ai = self.ai.clone();
        let ledger = self.ledger.clone();
        let stripe_token = self.stripe_token.clone();
        let (
            ai_live,
            ai_ready,
            ledger_live,
            ledger_ready,
            billing_live,
            billing_ready,
            stripe_live,
            stripe_ready,
            ai_counts,
            ledger_counts,
            stripe_pending,
        ) = tokio::join!(
            probe(&self.http, self.ai_url.as_deref(), "/health/live"),
            probe(&self.http, self.ai_url.as_deref(), "/health/ready"),
            probe(&self.http, self.ledger_url.as_deref(), "/health/live"),
            probe(&self.http, self.ledger_url.as_deref(), "/health/ready"),
            probe(&self.http, self.billing_url.as_deref(), "/health/live"),
            probe(&self.http, self.billing_url.as_deref(), "/health/ready"),
            probe(&self.http, self.stripe_url.as_deref(), "/health/live"),
            probe(&self.http, self.stripe_url.as_deref(), "/health/ready"),
            ai_counts(ai),
            ledger_counts(ledger),
            stripe_pending(&self.http, self.stripe_url.clone(), stripe_token,),
        );
        let mut samples = vec![
            ("tobot_ai_live", ai_live),
            ("tobot_ai_ready", ai_ready),
            ("tobot_ledger_live", ledger_live),
            ("tobot_ledger_ready", ledger_ready),
            ("tobot_billing_live", billing_live),
            ("tobot_billing_ready", billing_ready),
            ("tobot_stripe_edge_live", stripe_live),
            ("tobot_stripe_edge_ready", stripe_ready),
        ];
        if ai_ready == 1
            && let Some((uncertain, disputed)) = ai_counts
        {
            samples.push(("tobot_ai_reservations_uncertain", uncertain));
            samples.push(("tobot_ai_reservations_disputed", disputed));
        }
        if ledger_ready == 1
            && let Some((unpublished, oldest, expired)) = ledger_counts
        {
            samples.push(("tobot_ledger_outbox_unpublished", unpublished));
            samples.push(("tobot_ledger_outbox_oldest_age_seconds", oldest));
            samples.push(("tobot_ledger_outbox_expired_leases", expired));
        }
        if stripe_ready == 1
            && let Some(pending) = stripe_pending
        {
            samples.push(("tobot_stripe_receipts_pending", pending));
        }
        samples
    }
}

fn http_base(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| value.starts_with("http://") || value.starts_with("https://"))
}

async fn probe(http: &Client, base: Option<&str>, path: &str) -> i64 {
    let Some(base) = base else {
        return 0;
    };
    let Ok(Ok(response)) =
        tokio::time::timeout(PROBE_BUDGET, http.get(format!("{base}{path}")).send()).await
    else {
        return 0;
    };
    i64::from(response.status().is_success())
}

async fn ai_counts(ai: Option<AiClient>) -> Option<(i64, i64)> {
    let ai = ai?;
    tokio::time::timeout(PROBE_BUDGET, ai.reservation_counts())
        .await
        .ok()
        .and_then(Result::ok)
}

async fn ledger_counts(ledger: LedgerClient) -> Option<(i64, i64, i64)> {
    tokio::time::timeout(PROBE_BUDGET, ledger.outbox_gauge())
        .await
        .ok()
        .and_then(Result::ok)
}

async fn stripe_pending(http: &Client, base: Option<String>, token: Option<String>) -> Option<i64> {
    let (base, token) = (base?, token?);
    let Ok(Ok(response)) = tokio::time::timeout(PROBE_BUDGET, async {
        http.get(format!("{base}/internal/v1/ingress/pending"))
            .header("x-provider-service-token", token)
            .send()
            .await
    })
    .await
    else {
        return None;
    };
    if !response.status().is_success() {
        return None;
    }
    let body: Value = response.json().await.ok()?;
    body["pending"].as_i64()
}
