//! Composition types. SQL lives on the owner impls; this module only opens the pool.

use sqlx::{PgPool, postgres::PgPoolOptions};

async fn connect_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

macro_rules! owner_store {
    ($name:ident, $doc:literal) => {
        #[doc = $doc]
        #[derive(Clone)]
        pub struct $name {
            pub(crate) pool: PgPool,
        }

        impl $name {
            /// # Errors
            ///
            /// Returns the driver error if a connection cannot be established.
            pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
                Ok(Self {
                    pool: connect_pool(database_url).await?,
                })
            }

            /// # Errors
            ///
            /// Returns a database error when PostgreSQL does not answer.
            pub async fn ping(&self) -> Result<(), sqlx::Error> {
                sqlx::query("SELECT 1").execute(&self.pool).await?;
                Ok(())
            }
        }
    };
}

owner_store!(
    EdgeStore,
    "Edge receipts, gateway session, and the foreign read of an active guild tenant."
);
owner_store!(
    EdgeRelayStore,
    "Claim, renew, and publish the Edge outbox. Delivery holds this type and nothing else."
);
owner_store!(
    IdentityStore,
    "Sessions, OAuth transactions, discovery snapshots, and identity audit."
);
owner_store!(
    InstallationStore,
    "Installation, repair, bot departure, and the installation outbox."
);
owner_store!(
    QueryStore,
    "Rebuildable guild-shell projection. It does not own identity or installation writes."
);
owner_store!(
    ModerationStore,
    "Cases, receipts, policy revisions, and the moderation outbox. No other facade exposes these writes."
);
owner_store!(
    LifecycleStore,
    "Published welcome revisions, join decisions, and lifecycle outbox."
);
owner_store!(
    DeliveryIntentStore,
    "Message intents, attempts, nonces, and delivery outbox."
);
owner_store!(
    AssignmentStore,
    "Automatic-role revisions, assignment intents, and the assignment outbox. No other facade writes these rows."
);
owner_store!(
    ProgressionStore,
    "Text XP revisions, the append-only ledger, and the progression outbox. No other facade writes these rows."
);

/// The facades Control Plane is allowed to hold. The projector receives
/// installation and query on their own; this bundle does not add cross-module methods.
#[derive(Clone)]
pub struct ControlPlaneDatabase {
    pub identity: IdentityStore,
    pub installation: InstallationStore,
    pub query: QueryStore,
    pub moderation: ModerationStore,
    pub lifecycle: LifecycleStore,
    pub assignment: AssignmentStore,
    pub progression: ProgressionStore,
}

impl ControlPlaneDatabase {
    /// # Errors
    ///
    /// Returns the driver error if a connection cannot be established.
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = connect_pool(database_url).await?;
        Ok(Self {
            identity: IdentityStore { pool: pool.clone() },
            installation: InstallationStore { pool: pool.clone() },
            query: QueryStore { pool: pool.clone() },
            moderation: ModerationStore { pool: pool.clone() },
            lifecycle: LifecycleStore { pool: pool.clone() },
            assignment: AssignmentStore { pool: pool.clone() },
            progression: ProgressionStore { pool },
        })
    }
}

/// Applies reviewed SQL migrations. Application processes do not hold this type.
#[derive(Clone)]
pub struct Migrations {
    pool: PgPool,
}

impl Migrations {
    /// # Errors
    ///
    /// Returns the driver error if a connection cannot be established.
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        Ok(Self {
            pool: connect_pool(database_url).await?,
        })
    }

    /// # Errors
    ///
    /// Returns a migration error if a reviewed migration cannot be applied.
    pub async fn migrate(&self) -> Result<(), sqlx::migrate::MigrateError> {
        super::MIGRATOR.run(&self.pool).await
    }
}
