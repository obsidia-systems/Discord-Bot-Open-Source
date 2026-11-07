use subtle::ConstantTimeEq;
use time::OffsetDateTime;
use uuid::Uuid;

use super::{
    ActiveAuthorizationSession, AuditFact, ConsumedOAuthTransaction, CreatedAuthorization,
    GuildDiscoveryObservation, IdentityStore, NewDiscordAuthorization, NewOAuthTransaction,
    insert_audit_event, revoke_other_sessions,
};

impl IdentityStore {
    /// Verifica que la cuenta existe y puede actuar como propietaria de facturación.
    pub async fn active_account(&self, account_id: Uuid) -> Result<bool, sqlx::Error> {
        let found: Option<Uuid> = sqlx::query_scalar(
            "SELECT account_id FROM identity.account WHERE account_id=$1 AND state='Active'",
        )
        .bind(account_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(found.is_some())
    }
    /// # Errors
    /// Devuelve un error si la identidad Discord no se puede leer.
    pub async fn discord_user_id(&self, account_id: Uuid) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("SELECT provider_user_id FROM identity.external_identity WHERE provider='discord' AND account_id=$1")
            .bind(account_id).fetch_optional(&self.pool).await
    }
    /// Validates all server-side session authorities and advances only the
    /// idle deadline, never the absolute deadline.
    ///
    /// # Errors
    ///
    /// Returns a database error if session authorization cannot be checked.
    pub async fn authorize_session(
        &self,
        session_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<Option<ActiveAuthorizationSession>, sqlx::Error> {
        sqlx::query_as(
            "UPDATE identity.authorization_session AS session \
             SET idle_expires_at = LEAST($2 + INTERVAL '12 hours', session.absolute_expires_at) \
             FROM identity.account AS account, identity.oauth_credential AS credential \
             WHERE session.session_id = $1 \
               AND session.account_id = account.account_id \
               AND session.revoked_at IS NULL \
               AND session.idle_expires_at >= $2 \
               AND session.absolute_expires_at >= $2 \
               AND account.state = 'Active' \
               AND session.credential_generation = account.credential_generation \
               AND credential.account_id = session.account_id \
               AND credential.generation = session.credential_generation \
               AND credential.revoked_at IS NULL \
             RETURNING session.account_id, credential.credential_id, \
                       credential.access_token_ciphertext, credential.refresh_token_ciphertext, \
                       credential.expires_at AS credential_expires_at, \
                       session.csrf_secret_ciphertext, \
                       session.idle_expires_at, session.absolute_expires_at",
        )
        .bind(session_id)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
    }
    /// Names the deadline a still-present session has already passed.
    /// Revocation is recorded when the session is revoked, not here.
    ///
    /// # Errors
    ///
    /// Returns a database error if the session row cannot be read.
    pub async fn observed_session_expiry(
        &self,
        session_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT CASE \
               WHEN absolute_expires_at < $2 THEN 'session_absolute_expired' \
               WHEN idle_expires_at < $2 THEN 'session_idle_expired' \
             END \
             FROM identity.authorization_session \
             WHERE session_id = $1 AND revoked_at IS NULL \
               AND (absolute_expires_at < $2 OR idle_expires_at < $2)",
        )
        .bind(session_id)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
    }
    /// Replaces the OAuth credential ciphertext after a refresh grant. Session
    /// absolute expiry is not a column of this update.
    ///
    /// # Errors
    ///
    /// Returns a database error if the credential row cannot be updated.
    pub async fn refresh_oauth_credential(
        &self,
        credential_id: Uuid,
        access_token_ciphertext: &[u8],
        refresh_token_ciphertext: &[u8],
        expires_at: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query(
            "UPDATE identity.oauth_credential \
             SET access_token_ciphertext = $2, refresh_token_ciphertext = $3, expires_at = $4 \
             WHERE credential_id = $1 AND revoked_at IS NULL",
        )
        .bind(credential_id)
        .bind(access_token_ciphertext)
        .bind(refresh_token_ciphertext)
        .bind(expires_at)
        .execute(&self.pool)
        .await?
        .rows_affected();
        Ok(updated == 1)
    }
    /// Compares a presented CSRF digest with the active session. An expired,
    /// revoked, or unknown session does not match.
    ///
    /// # Errors
    ///
    /// Returns a database error if the session digest cannot be read.
    pub async fn active_session_csrf_matches(
        &self,
        session_id: Uuid,
        presented_hash: &[u8],
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        let stored: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT csrf_secret_hash FROM identity.authorization_session \
             WHERE session_id = $1 AND revoked_at IS NULL \
               AND idle_expires_at >= $2 AND absolute_expires_at >= $2",
        )
        .bind(session_id)
        .bind(now)
        .fetch_optional(&self.pool)
        .await?;
        Ok(stored.is_some_and(|hash| hash.as_slice().ct_eq(presented_hash).unwrap_u8() == 1))
    }
    /// Replaces one account's guild discovery snapshot atomically. The
    /// snapshot is presentation data and is never queried as mutation authority.
    ///
    /// # Errors
    ///
    /// Returns a database error without publishing a partial snapshot.
    pub async fn replace_guild_discovery(
        &self,
        account_id: Uuid,
        observations: &[GuildDiscoveryObservation<'_>],
        observed_at: OffsetDateTime,
        expires_at: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM identity.guild_discovery_observation WHERE account_id = $1")
            .bind(account_id)
            .execute(&mut *transaction)
            .await?;
        for observation in observations {
            sqlx::query(
                "INSERT INTO identity.guild_discovery_observation \
                 (account_id, provider_guild_id, guild_name, icon_hash, owner_hint, \
                  permissions_hint, observed_at, expires_at) \
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            )
            .bind(account_id)
            .bind(observation.provider_guild_id)
            .bind(observation.guild_name)
            .bind(observation.icon_hash)
            .bind(observation.owner_hint)
            .bind(observation.permissions_hint)
            .bind(observed_at)
            .bind(expires_at)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "INSERT INTO identity.guild_discovery_snapshot (account_id, observed_at, expires_at) \
             VALUES ($1, $2, $3) \
             ON CONFLICT (account_id) DO UPDATE \
             SET observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at",
        )
        .bind(account_id)
        .bind(observed_at)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await
    }
    /// True while this account's discovery snapshot is inside its 15-minute
    /// window, including a snapshot whose manageable guild list is empty.
    ///
    /// # Errors
    ///
    /// Returns a database error if the snapshot row cannot be read.
    pub async fn discovery_snapshot_fresh(
        &self,
        account_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<bool, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT EXISTS ( \
               SELECT 1 FROM identity.guild_discovery_snapshot \
               WHERE account_id = $1 AND expires_at >= $2 \
             )",
        )
        .bind(account_id)
        .bind(now)
        .fetch_one(&self.pool)
        .await
    }
    /// Returns presentation-only guild identifiers that remain within the
    /// 15-minute freshness window. Callers pass them as an explicit predicate
    /// to the separate Query owner.
    ///
    /// # Errors
    ///
    /// Returns a database error if Identity observations cannot be read.
    pub async fn fresh_discovered_guild_ids(
        &self,
        account_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT provider_guild_id FROM identity.guild_discovery_observation \
             WHERE account_id = $1 AND expires_at >= $2 ORDER BY provider_guild_id",
        )
        .bind(account_id)
        .bind(now)
        .fetch_all(&self.pool)
        .await
    }
    /// Idempotently revokes a browser session.
    ///
    /// # Errors
    ///
    /// Returns a database error if revocation cannot be recorded.
    pub async fn revoke_session(
        &self,
        session_id: Uuid,
        now: OffsetDateTime,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE identity.authorization_session SET revoked_at = COALESCE(revoked_at, $2) \
             WHERE session_id = $1",
        )
        .bind(session_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Records an audit fact that contains no token, cookie, code, or verifier.
    ///
    /// # Errors
    ///
    /// Returns a database error if the fact cannot be stored. Unknown outcomes
    /// fail the table check.
    pub async fn record_audit_event(&self, fact: AuditFact<'_>) -> Result<(), sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        insert_audit_event(&mut transaction, fact).await?;
        transaction.commit().await
    }
    /// Atomically binds a Discord identity to one account, rotates its OAuth
    /// credential generation, and creates the browser authorization session.
    /// Concurrent first logins converge on the provider identity key.
    ///
    /// # Errors
    ///
    /// Returns a database error and commits none of the authorization state.
    pub async fn create_discord_authorization(
        &self,
        request: NewDiscordAuthorization<'_>,
    ) -> Result<CreatedAuthorization, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("INSERT INTO identity.account (account_id, state) VALUES ($1, 'Active')")
            .bind(request.candidate_account_id)
            .execute(&mut *transaction)
            .await?;
        let identity_inserted = sqlx::query(
            "INSERT INTO identity.external_identity \
             (provider, provider_user_id, account_id, username, display_name) \
             VALUES ('discord', $1, $2, $3, $4) \
             ON CONFLICT (provider, provider_user_id) DO NOTHING",
        )
        .bind(request.provider_user_id)
        .bind(request.candidate_account_id)
        .bind(request.username)
        .bind(request.display_name)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
            == 1;
        let account_id: Uuid = sqlx::query_scalar(
            "SELECT account_id FROM identity.external_identity \
             WHERE provider = 'discord' AND provider_user_id = $1 FOR UPDATE",
        )
        .bind(request.provider_user_id)
        .fetch_one(&mut *transaction)
        .await?;
        if !identity_inserted {
            sqlx::query("DELETE FROM identity.account WHERE account_id = $1")
                .bind(request.candidate_account_id)
                .execute(&mut *transaction)
                .await?;
            sqlx::query(
                "UPDATE identity.external_identity SET username = $2, display_name = $3, \
                 updated_at = CURRENT_TIMESTAMP WHERE provider = 'discord' AND provider_user_id = $1",
            )
            .bind(request.provider_user_id)
            .bind(request.username)
            .bind(request.display_name)
            .execute(&mut *transaction)
            .await?;
        }
        let generation: i64 = sqlx::query_scalar(
            "UPDATE identity.account SET credential_generation = credential_generation + 1 \
             WHERE account_id = $1 AND state = 'Active' RETURNING credential_generation",
        )
        .bind(account_id)
        .fetch_one(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE identity.oauth_credential SET revoked_at = CURRENT_TIMESTAMP \
             WHERE account_id = $1 AND revoked_at IS NULL",
        )
        .bind(account_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO identity.oauth_credential \
             (credential_id, account_id, generation, access_token_ciphertext, \
              refresh_token_ciphertext, scopes, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(request.credential_id)
        .bind(account_id)
        .bind(generation)
        .bind(request.access_token_ciphertext)
        .bind(request.refresh_token_ciphertext)
        .bind(request.scopes)
        .bind(request.credential_expires_at)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO identity.authorization_session \
             (session_id, account_id, credential_generation, csrf_secret_hash, \
              csrf_secret_ciphertext, idle_expires_at, absolute_expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(request.session_id)
        .bind(account_id)
        .bind(generation)
        .bind(request.csrf_secret_hash)
        .bind(request.csrf_secret_ciphertext)
        .bind(request.idle_expires_at)
        .bind(request.absolute_expires_at)
        .execute(&mut *transaction)
        .await?;
        revoke_other_sessions(&mut transaction, account_id, request.session_id).await?;
        transaction.commit().await?;
        Ok(CreatedAuthorization {
            account_id,
            credential_generation: generation,
        })
    }
    /// Persists only the state digest and Vault ciphertext. The raw state and
    /// PKCE verifier are never database values.
    ///
    /// # Errors
    ///
    /// Returns a database error if the transaction cannot be created.
    pub async fn create_oauth_transaction(
        &self,
        request: NewOAuthTransaction<'_>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO identity.oauth_transaction \
             (transaction_id, state_hash, verifier_ciphertext, redirect_uri, requested_scopes, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(request.transaction_id)
        .bind(request.state_hash)
        .bind(request.verifier_ciphertext)
        .bind(request.redirect_uri)
        .bind(request.requested_scopes)
        .bind(request.expires_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
    /// Atomically consumes an unexpired OAuth transaction by state digest.
    /// Replays, expired states, and unknown states all fail closed as `None`.
    ///
    /// # Errors
    ///
    /// Returns a database error if consumption cannot be recorded.
    pub async fn consume_oauth_transaction(
        &self,
        state_hash: &[u8],
        now: OffsetDateTime,
    ) -> Result<Option<ConsumedOAuthTransaction>, sqlx::Error> {
        sqlx::query_as(
            "UPDATE identity.oauth_transaction SET consumed_at = $2 \
             WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at >= $2 \
             RETURNING transaction_id, verifier_ciphertext, redirect_uri, requested_scopes",
        )
        .bind(state_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
    }
    /// OAuth and install rejections since `since`. The count has no subject.
    ///
    /// # Errors
    ///
    /// Returns a database error if the count cannot be read.
    pub async fn recent_auth_rejection_count(
        &self,
        since: OffsetDateTime,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT count(*)::bigint FROM identity.audit_event \
             WHERE outcome IN ('oauth_rejected', 'install_rejected', 'login_rejected') \
               AND occurred_at >= $1",
        )
        .bind(since)
        .fetch_one(&self.pool)
        .await
    }
}
