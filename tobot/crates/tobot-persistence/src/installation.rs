use time::OffsetDateTime;
use tobot_installation::{aggregate_installation_state, s0_verification_evidence};
use uuid::Uuid;

use super::{
    AuditFact, ClaimedInstallationVerification, ClaimedOutboxEntry, ConsumedInstallAuthorization,
    INSTALLATION_RELAY_GAUGE, InstallationStateEvent, InstallationStore, NewInstallAuthorization,
    RelayGauge, VerifyingInstallation, insert_audit_event, insert_installation_state_event,
    lock_latest_installation, mark_bot_presence_absent, missing_capability_allows_repair,
};

impl InstallationStore {
    /// Atomically consumes a pending installation transaction bound to the
    /// active browser session. Unknown, expired, mismatched, and replayed
    /// states all fail closed as `None`.
    ///
    /// # Errors
    ///
    /// Returns a database error if consumption cannot be recorded.
    pub async fn consume_install_authorization(
        &self,
        state_hash: &[u8],
        account_id: Uuid,
        session_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<Option<ConsumedInstallAuthorization>, sqlx::Error> {
        sqlx::query_as(
            "UPDATE installation.authorization_transaction SET consumed_at = $4 \
             WHERE state_hash = $1 AND account_id = $2 AND session_id = $3 \
               AND consumed_at IS NULL AND expires_at >= $4 \
             RETURNING transaction_id, provider_guild_id, generation, verifier_ciphertext, \
                       redirect_uri, requested_scopes, frozen_manifest, preset",
        )
        .bind(state_hash)
        .bind(account_id)
        .bind(session_id)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
    }
    /// Records the callback receipt and the `Verifying` installation in one
    /// transaction. It deliberately performs no capability inference.
    ///
    /// # Errors
    ///
    /// Returns a database error and leaves no partial tenant/install state.
    pub async fn record_verifying_installation(
        &self,
        request: VerifyingInstallation<'_>,
    ) -> Result<Uuid, sqlx::Error> {
        self.insert_verifying_installation(request, false)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }
    /// Opens the next installation generation only when the current one is
    /// `Degraded` or `Removed` and a required capability is not Healthy.
    /// Discord inspection still decides the resulting state.
    ///
    /// # Errors
    ///
    /// Returns a database error and leaves the current generation unchanged.
    pub async fn record_repair_installation(
        &self,
        request: VerifyingInstallation<'_>,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        self.insert_verifying_installation(request, true).await
    }
    async fn insert_verifying_installation(
        &self,
        request: VerifyingInstallation<'_>,
        repair_only: bool,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query(
            "INSERT INTO installation.tenant \
             (tenant_id, tenant_type, provider_tenant_ref, application_id, state) \
             VALUES ($1, 'Guild', $2, $3, 'Active') \
             ON CONFLICT (tenant_type, provider_tenant_ref, application_id) DO NOTHING",
        )
        .bind(request.candidate_tenant_id)
        .bind(request.provider_guild_id)
        .bind(request.application_id)
        .execute(&mut *transaction)
        .await?;
        let tenant_id: Uuid = sqlx::query_scalar(
            "SELECT tenant_id FROM installation.tenant \
             WHERE tenant_type = 'Guild' AND provider_tenant_ref = $1 AND application_id = $2 \
             FOR UPDATE",
        )
        .bind(request.provider_guild_id)
        .bind(request.application_id)
        .fetch_one(&mut *transaction)
        .await?;
        if repair_only
            && !missing_capability_allows_repair(&mut transaction, tenant_id, request.generation)
                .await?
        {
            return Ok(None);
        }
        let installation_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO installation.installation \
             (installation_id, tenant_id, generation, state, manifest) \
             VALUES ($1, $2, $3, 'Verifying', $4)",
        )
        .bind(installation_id)
        .bind(tenant_id)
        .bind(request.generation)
        .bind(request.frozen_manifest)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO installation.callback_receipt \
             (transaction_id, tenant_id, provider_guild_hint, permissions_hint, \
              provider_observed_guild_id, received_at) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(request.transaction_id)
        .bind(tenant_id)
        .bind(request.provider_guild_hint)
        .bind(request.permissions_hint)
        .bind(request.provider_guild_id)
        .bind(request.received_at)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO installation.module_capability \
             (installation_id, module_key, capability_key, health_state, reason_code, observed_at) \
             VALUES ($1, 'platform_probe', 'application_install_context', \
                     'Healthy', 'oauth_guild_context_observed', $2)",
        )
        .bind(installation_id)
        .bind(request.received_at)
        .execute(&mut *transaction)
        .await?;
        insert_installation_state_event(
            &mut transaction,
            InstallationStateEvent {
                tenant_id,
                provider_guild_id: request.provider_guild_id,
                application_id: request.application_id,
                generation: request.generation,
                state: "Verifying",
                capabilities: serde_json::json!({"application_install_context": "Healthy"}),
                occurred_at: request.received_at,
            },
        )
        .await?;
        transaction.commit().await?;
        Ok(Some(tenant_id))
    }
    /// Claims one due verification with a short lease and fencing token.
    ///
    /// # Errors
    ///
    /// Returns a database error if claiming fails.
    pub async fn claim_installation_verification(
        &self,
        now: OffsetDateTime,
    ) -> Result<Option<ClaimedInstallationVerification>, sqlx::Error> {
        sqlx::query_as(
            "WITH candidate AS ( \
               SELECT installation_id FROM installation.installation \
               WHERE state = 'Verifying' \
                 AND (verification_claimed_until IS NULL OR verification_claimed_until < $1) \
               ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1 \
             ) \
             UPDATE installation.installation AS install \
             SET verification_claimed_until = $1 + INTERVAL '15 seconds', \
                 verification_fencing_token = verification_fencing_token + 1, \
                 verification_attempts = verification_attempts + 1 \
             FROM candidate, installation.tenant AS tenant \
             WHERE install.installation_id = candidate.installation_id \
               AND tenant.tenant_id = install.tenant_id \
             RETURNING install.installation_id, install.tenant_id, \
                       tenant.provider_tenant_ref AS provider_guild_id, tenant.application_id, install.generation, \
                       install.verification_fencing_token AS fencing_token",
        )
        .bind(now)
        .fetch_optional(&self.pool)
        .await
    }
    /// Applies provider presence evidence and derives aggregate state from all
    /// required S0 capability rows under the active fencing token.
    ///
    /// # Errors
    ///
    /// Returns a database error or `RowNotFound` for a stale worker.
    pub async fn complete_installation_verification(
        &self,
        claim: &ClaimedInstallationVerification,
        bot_present: bool,
        observed_at: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let still_owner: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM installation.installation \
             WHERE installation_id = $1 AND state = 'Verifying' \
               AND verification_fencing_token = $2 AND verification_claimed_until >= $3)",
        )
        .bind(claim.installation_id)
        .bind(claim.fencing_token)
        .bind(observed_at)
        .fetch_one(&mut *transaction)
        .await?;
        if !still_owner {
            return Err(sqlx::Error::RowNotFound);
        }
        let evidence = s0_verification_evidence(bot_present);
        let candidate_state = aggregate_installation_state(&evidence);
        let Some(bot) = evidence.into_iter().find(|row| row.key == "bot_presence") else {
            return Err(sqlx::Error::RowNotFound);
        };
        let health = match bot.health {
            tobot_installation::CapabilityHealth::Healthy => "Healthy",
            tobot_installation::CapabilityHealth::Degraded => "Degraded",
        };
        let reason = bot.reason;
        sqlx::query(
            "INSERT INTO installation.module_capability \
             (installation_id, module_key, capability_key, health_state, reason_code, observed_at) \
             VALUES ($1, 'platform_probe', 'bot_presence', $2, $3, $4) \
             ON CONFLICT (installation_id, module_key, capability_key) DO UPDATE SET \
               health_state = EXCLUDED.health_state, reason_code = EXCLUDED.reason_code, \
               observed_at = EXCLUDED.observed_at",
        )
        .bind(claim.installation_id)
        .bind(health)
        .bind(reason)
        .bind(observed_at)
        .execute(&mut *transaction)
        .await?;
        let persisted_state: String = sqlx::query_scalar(
            "UPDATE installation.installation AS install SET \
               state = CASE WHEN $3 = 'Installed' \
                 AND EXISTS ( \
                   SELECT 1 FROM installation.module_capability AS capability \
                   WHERE capability.installation_id = install.installation_id \
                     AND capability.capability_key = 'application_install_context' \
                     AND capability.health_state = 'Healthy') \
                 AND EXISTS ( \
                   SELECT 1 FROM installation.module_capability AS capability \
                   WHERE capability.installation_id = install.installation_id \
                     AND capability.capability_key = 'bot_presence' \
                     AND capability.health_state = 'Healthy') \
                 THEN 'Installed' ELSE 'Degraded' END, \
               verification_claimed_until = NULL \
             WHERE installation_id = $1 AND verification_fencing_token = $2 \
             RETURNING state",
        )
        .bind(claim.installation_id)
        .bind(claim.fencing_token)
        .bind(candidate_state)
        .fetch_one(&mut *transaction)
        .await?;
        insert_installation_state_event(
            &mut transaction,
            InstallationStateEvent {
                tenant_id: claim.tenant_id,
                provider_guild_id: &claim.provider_guild_id,
                application_id: &claim.application_id,
                generation: claim.generation,
                state: &persisted_state,
                capabilities: serde_json::json!({
                    "application_install_context": "Healthy",
                    "bot_presence": health
                }),
                occurred_at: observed_at,
            },
        )
        .await?;
        transaction.commit().await
    }
    /// Newest `Installed` guild ids for one application. A departure that already
    /// moved the newest generation off `Installed` is not listed.
    ///
    /// # Errors
    ///
    /// Returns a database error if the installation rows cannot be read.
    pub async fn installed_provider_guild_ids(
        &self,
        application_id: &str,
    ) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT tenant.provider_tenant_ref \
             FROM installation.installation AS install \
             JOIN installation.tenant AS tenant ON tenant.tenant_id = install.tenant_id \
             WHERE tenant.tenant_type = 'Guild' \
               AND tenant.application_id = $1 \
               AND install.state = 'Installed' \
               AND install.generation = ( \
                 SELECT MAX(newest.generation) FROM installation.installation AS newest \
                 WHERE newest.tenant_id = install.tenant_id \
               ) \
             ORDER BY tenant.provider_tenant_ref",
        )
        .bind(application_id)
        .fetch_all(&self.pool)
        .await
    }
    /// Guild tenant for one application, when Installation already created it.
    ///
    /// # Errors
    ///
    /// Returns a database error if the tenant row cannot be read.
    pub async fn guild_tenant_id(
        &self,
        application_id: &str,
        provider_guild_id: &str,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT tenant_id FROM installation.tenant \
             WHERE tenant_type = 'Guild' AND provider_tenant_ref = $1 AND application_id = $2",
        )
        .bind(provider_guild_id)
        .bind(application_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Tenant whose newest generation is `Installed` and whose tenant row is `Active`.
    ///
    /// # Errors
    ///
    /// Returns a database error if the installation cannot be read.
    pub async fn installed_guild_tenant(
        &self,
        application_id: &str,
        provider_guild_id: &str,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT tenant.tenant_id FROM installation.tenant AS tenant \
             JOIN installation.installation AS install ON install.tenant_id = tenant.tenant_id \
             WHERE tenant.tenant_type = 'Guild' AND tenant.provider_tenant_ref = $1 \
               AND tenant.application_id = $2 AND tenant.state = 'Active' \
               AND install.state = 'Installed' \
               AND install.generation = ( \
                 SELECT MAX(newest.generation) FROM installation.installation AS newest \
                 WHERE newest.tenant_id = tenant.tenant_id \
               )",
        )
        .bind(provider_guild_id)
        .bind(application_id)
        .fetch_optional(&self.pool)
        .await
    }

    /// Marks the newest `Installed` generation `Removed` after Discord reports
    /// that the bot left the guild. The tenant row stays. An outage is not this
    /// call. A guild with no installed generation is left unchanged.
    ///
    /// # Errors
    ///
    /// Returns a database error and leaves the installation unchanged.
    pub async fn record_bot_departure(
        &self,
        application_id: &str,
        provider_guild_id: &str,
        observed_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        let latest =
            lock_latest_installation(&mut transaction, provider_guild_id, application_id).await?;
        let Some((installation_id, tenant_id, generation)) = latest else {
            return Ok(false);
        };
        mark_bot_presence_absent(&mut transaction, installation_id, observed_at).await?;
        insert_installation_state_event(
            &mut transaction,
            InstallationStateEvent {
                tenant_id,
                provider_guild_id,
                application_id,
                generation,
                state: "Removed",
                capabilities: serde_json::json!({
                    "application_install_context": "Healthy",
                    "bot_presence": "Degraded"
                }),
                occurred_at: observed_at,
            },
        )
        .await?;
        transaction.commit().await?;
        Ok(true)
    }
    /// Releases a transiently failed claim for bounded retry.
    ///
    /// # Errors
    ///
    /// Returns a database error if the active fenced claim cannot be released.
    pub async fn release_installation_verification(
        &self,
        claim: &ClaimedInstallationVerification,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE installation.installation SET verification_claimed_until = NULL \
             WHERE installation_id = $1 AND state = 'Verifying' \
               AND verification_fencing_token = $2",
        )
        .bind(claim.installation_id)
        .bind(claim.fencing_token)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Creates a generation-bound named `GuildInstall` authorization after the
    /// caller has performed live provider authority inspection.
    ///
    /// # Errors
    ///
    /// Returns a database error if the generation cannot be reserved.
    pub async fn create_guild_install_authorization(
        &self,
        request: NewInstallAuthorization<'_>,
    ) -> Result<i64, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(request.provider_guild_id)
            .execute(&mut *transaction)
            .await?;
        let generation: i64 = sqlx::query_scalar(
            "SELECT GREATEST( \
               COALESCE((SELECT MAX(generation) FROM installation.authorization_transaction \
                         WHERE provider_guild_id = $1), 0), \
               COALESCE((SELECT MAX(install.generation) \
                         FROM installation.installation AS install \
                         JOIN installation.tenant AS tenant \
                           ON tenant.tenant_id = install.tenant_id \
                         WHERE tenant.tenant_type = 'Guild' \
                           AND tenant.provider_tenant_ref = $1), 0) \
             ) + 1",
        )
        .bind(request.provider_guild_id)
        .fetch_one(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO installation.authorization_transaction \
             (transaction_id, state_hash, verifier_ciphertext, account_id, session_id, \
              provider_guild_id, generation, preset, redirect_uri, requested_scopes, \
              frozen_manifest, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        )
        .bind(request.transaction_id)
        .bind(request.state_hash)
        .bind(request.verifier_ciphertext)
        .bind(request.account_id)
        .bind(request.session_id)
        .bind(request.provider_guild_id)
        .bind(generation)
        .bind(request.preset)
        .bind(request.redirect_uri)
        .bind(request.requested_scopes)
        .bind(request.frozen_manifest)
        .bind(request.expires_at)
        .execute(&mut *transaction)
        .await?;
        if request.preset == "GuildRepair" {
            insert_audit_event(
                &mut transaction,
                AuditFact {
                    outcome: "repair_admitted",
                    reason_code: "guild_repair_generation",
                    account_id: Some(request.account_id),
                    session_id: Some(request.session_id),
                    subject_ref: Some(request.provider_guild_id),
                    occurred_at: request.occurred_at,
                },
            )
            .await?;
        }
        transaction.commit().await?;
        Ok(generation)
    }
    /// Capability keys on the newest installation that are not Healthy.
    ///
    /// # Errors
    ///
    /// Returns a database error if the capability rows cannot be read.
    pub async fn missing_capability_keys(
        &self,
        tenant_id: Uuid,
    ) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT capability.capability_key \
             FROM installation.installation AS install \
             JOIN installation.module_capability AS capability \
               ON capability.installation_id = install.installation_id \
             WHERE install.tenant_id = $1 \
               AND install.generation = ( \
                 SELECT MAX(generation) FROM installation.installation WHERE tenant_id = $1 \
               ) \
               AND capability.health_state <> 'Healthy' \
             ORDER BY capability.capability_key",
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await
    }
    /// Aggregate installation-outbox age. The caller supplies Clock-port time.
    ///
    /// # Errors
    ///
    /// Returns a database error if the aggregate cannot be read.
    pub async fn installation_relay_gauge(
        &self,
        now: OffsetDateTime,
    ) -> Result<RelayGauge, sqlx::Error> {
        super::relay_gauge(&self.pool, INSTALLATION_RELAY_GAUGE, now).await
    }
    /// Extends the Installation lease while the same owner is still publishing.
    ///
    /// # Errors
    ///
    /// Returns a database error if the lease cannot be extended.
    pub async fn renew_installation_outbox_lease(
        &self,
        lease_token: Uuid,
        lease_until: OffsetDateTime,
    ) -> Result<u64, sqlx::Error> {
        super::renew_outbox_lease(
            &self.pool,
            "UPDATE installation.event_outbox SET lease_expires_at = $2 \
             WHERE lease_token = $1 AND published_at IS NULL",
            lease_token,
            lease_until,
        )
        .await
    }
    /// # Errors
    ///
    /// Returns a database error when installation outbox work cannot be claimed.
    pub async fn claim_installation_outbox(
        &self,
        now: OffsetDateTime,
        lease_until: OffsetDateTime,
        lease_token: Uuid,
        limit: i64,
    ) -> Result<Vec<ClaimedOutboxEntry>, sqlx::Error> {
        sqlx::query_as(
            "WITH candidate AS (SELECT outbox_id FROM installation.event_outbox \
               WHERE published_at IS NULL AND available_at <= $1 \
                 AND (lease_expires_at IS NULL OR lease_expires_at < $1) \
               ORDER BY available_at, outbox_id LIMIT $2 FOR UPDATE SKIP LOCKED) \
             UPDATE installation.event_outbox AS outbox SET lease_token = $3, \
               lease_expires_at = $4, fencing_token = outbox.fencing_token + 1, \
               publish_attempts = outbox.publish_attempts + 1 FROM candidate \
             WHERE outbox.outbox_id = candidate.outbox_id \
             RETURNING outbox.outbox_id, outbox.event_id, outbox.envelope, outbox.fencing_token",
        )
        .bind(now)
        .bind(limit)
        .bind(lease_token)
        .bind(lease_until)
        .fetch_all(&self.pool)
        .await
    }
    /// # Errors
    ///
    /// Returns a database error when the fenced receipt cannot be recorded.
    pub async fn mark_installation_outbox_published(
        &self,
        outbox_id: Uuid,
        lease_token: Uuid,
        fencing_token: i64,
        published_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE installation.event_outbox SET published_at = $4, lease_token = NULL, \
             lease_expires_at = NULL WHERE outbox_id = $1 AND lease_token = $2 \
             AND fencing_token = $3 AND published_at IS NULL",
        )
        .bind(outbox_id)
        .bind(lease_token)
        .bind(fencing_token)
        .bind(published_at)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
}
