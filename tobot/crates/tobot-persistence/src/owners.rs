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

/// The three facades Control Plane is allowed to hold. The projector receives
/// installation and query on their own; this bundle does not add cross-module methods.
#[derive(Clone)]
pub struct ControlPlaneDatabase {
    pub identity: IdentityStore,
    pub installation: InstallationStore,
    pub query: QueryStore,
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
            query: QueryStore { pool },
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
