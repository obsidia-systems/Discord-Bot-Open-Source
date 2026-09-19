//! Platform primitives that deliberately carry no provider SDK types.

use std::time::SystemTime;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(transparent)]
pub struct TenantId(Uuid);

impl TenantId {
    #[must_use]
    pub fn new() -> Self {
        Self(Uuid::now_v7())
    }

    #[must_use]
    pub const fn as_uuid(self) -> Uuid {
        self.0
    }
}

impl Default for TenantId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum TenantType {
    Guild,
    User,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TenantContext {
    pub tenant_id: TenantId,
    pub tenant_type: TenantType,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum TenantAccessError {
    #[error("tenant predicate is required")]
    MissingPredicate,
    #[error("tenant predicate does not match the requested resource")]
    MismatchedPredicate,
}

impl TenantContext {
    /// Enforces that a caller cannot turn a globally unique identifier into
    /// cross-tenant authority.
    ///
    /// # Errors
    ///
    /// Returns an error if a tenant predicate is missing or differs from this
    /// server-bound context.
    pub fn require(self, requested: Option<TenantId>) -> Result<TenantId, TenantAccessError> {
        match requested {
            None => Err(TenantAccessError::MissingPredicate),
            Some(id) if id == self.tenant_id => Ok(id),
            Some(_) => Err(TenantAccessError::MismatchedPredicate),
        }
    }
}

#[async_trait]
pub trait Clock: Send + Sync {
    fn now(&self) -> SystemTime;
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

#[async_trait]
impl Clock for SystemClock {
    fn now(&self) -> SystemTime {
        SystemTime::now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tenant_context_rejects_missing_or_foreign_predicate() {
        let tenant = TenantId::new();
        let context = TenantContext {
            tenant_id: tenant,
            tenant_type: TenantType::Guild,
        };

        assert_eq!(
            context.require(None),
            Err(TenantAccessError::MissingPredicate)
        );
        assert_eq!(
            context.require(Some(TenantId::new())),
            Err(TenantAccessError::MismatchedPredicate)
        );
        assert_eq!(context.require(Some(tenant)), Ok(tenant));
    }
}
