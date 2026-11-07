//! Reglas puras del plano de créditos. El almacén las aplica; no deciden solas.

use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AttemptClass {
    ConfirmedResult,
    ConfirmedFailure,
    RateLimited,
    TimeoutNotSent,
    TimeoutAfterSend,
    Uncertain,
}

impl AttemptClass {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "ConfirmedResult" => Self::ConfirmedResult,
            "ConfirmedFailure" => Self::ConfirmedFailure,
            "RateLimited" => Self::RateLimited,
            "TimeoutNotSent" => Self::TimeoutNotSent,
            "TimeoutAfterSend" => Self::TimeoutAfterSend,
            "Uncertain" => Self::Uncertain,
            _ => return None,
        })
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ConfirmedResult => "ConfirmedResult",
            Self::ConfirmedFailure => "ConfirmedFailure",
            Self::RateLimited => "RateLimited",
            Self::TimeoutNotSent => "TimeoutNotSent",
            Self::TimeoutAfterSend => "TimeoutAfterSend",
            Self::Uncertain => "Uncertain",
        }
    }

    #[must_use]
    pub const fn may_retry(self) -> bool {
        matches!(self, Self::RateLimited | Self::TimeoutNotSent)
    }

    /// HTTP 429 nunca es incierto. Un corte después de enviar no se reintenta.
    #[must_use]
    pub const fn from_http(status: u16, sent: bool) -> Self {
        if status == 429 {
            Self::RateLimited
        } else if !sent {
            Self::TimeoutNotSent
        } else if status >= 500 {
            Self::Uncertain
        } else {
            Self::ConfirmedFailure
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct LotView {
    pub id: Uuid,
    pub available: i64,
    pub expires_at: Option<OffsetDateTime>,
    pub granted_at: OffsetDateTime,
}

#[must_use]
pub fn allocation_order(mut lots: Vec<LotView>, now: OffsetDateTime) -> Vec<LotView> {
    lots.retain(|lot| lot.available > 0 && lot.expires_at.is_none_or(|expires| expires > now));
    lots.sort_by(|left, right| {
        match (left.expires_at, right.expires_at) {
            (Some(earlier), Some(later)) => earlier.cmp(&later),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
        .then(left.granted_at.cmp(&right.granted_at))
        .then(left.id.cmp(&right.id))
    });
    lots
}

#[must_use]
pub fn allocate(lots: &[LotView], amount: i64) -> Option<Vec<(Uuid, i64)>> {
    if amount <= 0 {
        return None;
    }
    let mut remaining = amount;
    let mut taken = Vec::new();
    for lot in lots {
        if remaining == 0 {
            break;
        }
        let share = remaining.min(lot.available);
        if share > 0 {
            taken.push((lot.id, share));
            remaining -= share;
        }
    }
    (remaining == 0).then_some(taken)
}

#[must_use]
pub fn rated_charge(estimate: i64, unit_charge: i64, characters: i64) -> Option<i64> {
    let usage = unit_charge.checked_mul(characters)?;
    Some(usage.min(estimate))
}

#[must_use]
pub fn reservation_after_ttl(state: &str) -> &str {
    if state == "Reserved" {
        "Uncertain"
    } else {
        state
    }
}

#[must_use]
pub fn reservation_after_deadline(state: &str) -> &str {
    if state == "Uncertain" {
        "Disputed"
    } else {
        state
    }
}

#[must_use]
pub fn operation_while_reviewing<'a>(
    reservation_state: &'a str,
    operation_state: &'a str,
) -> &'a str {
    if reservation_state == "Uncertain" || reservation_state == "Disputed" {
        "Uncertain"
    } else {
        operation_state
    }
}

#[must_use]
pub fn review_is_completed(reservation_state: &str) -> bool {
    !matches!(reservation_state, "Uncertain" | "Disputed")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lot(id: u128, available: i64, expires: Option<i64>, granted: i64) -> LotView {
        LotView {
            id: Uuid::from_u128(id),
            available,
            expires_at: expires.map(|value| {
                OffsetDateTime::from_unix_timestamp(value).unwrap_or(OffsetDateTime::UNIX_EPOCH)
            }),
            granted_at: OffsetDateTime::from_unix_timestamp(granted)
                .unwrap_or(OffsetDateTime::UNIX_EPOCH),
        }
    }

    #[test]
    fn http_429_retries_and_timeout_after_send_does_not() {
        assert_eq!(
            AttemptClass::from_http(429, true),
            AttemptClass::RateLimited
        );
        assert!(AttemptClass::RateLimited.may_retry());
        assert!(AttemptClass::TimeoutNotSent.may_retry());
        assert!(!AttemptClass::TimeoutAfterSend.may_retry());
        assert_ne!(AttemptClass::from_http(429, true), AttemptClass::Uncertain);
        assert_eq!(AttemptClass::from_http(503, true), AttemptClass::Uncertain);
    }

    #[test]
    fn lots_are_consumed_earliest_expiry_first_and_skip_expired() {
        let now = OffsetDateTime::from_unix_timestamp(1_000).unwrap_or(OffsetDateTime::UNIX_EPOCH);
        let ordered = allocation_order(
            vec![
                lot(3, 5, None, 10),
                lot(2, 5, Some(900), 1),
                lot(1, 4, Some(1_100), 2),
                lot(4, 7, Some(1_050), 3),
            ],
            now,
        );
        assert_eq!(
            ordered
                .iter()
                .map(|item| item.id.as_u128())
                .collect::<Vec<_>>(),
            vec![4, 1, 3]
        );
        assert!(allocate(&ordered, 20).is_none());
        let taken = allocate(&ordered, 9).unwrap_or_default();
        assert_eq!(taken.first().map(|item| item.1), Some(7));
        assert_eq!(taken.get(1).map(|item| item.1), Some(2));
    }

    #[test]
    fn ttl_does_not_release_and_dispute_stays_unsettled() {
        assert_eq!(reservation_after_ttl("Reserved"), "Uncertain");
        assert_ne!(reservation_after_ttl("Reserved"), "Released");
        assert_eq!(reservation_after_deadline("Uncertain"), "Disputed");
        assert_eq!(
            operation_while_reviewing("Disputed", "Succeeded"),
            "Uncertain"
        );
        assert!(!review_is_completed("Disputed"));
        assert!(!review_is_completed("Uncertain"));
        assert_eq!(rated_charge(10, 3, 2), Some(6));
        assert_eq!(rated_charge(10, 8, 2), Some(10));
        assert!(rated_charge(10, i64::MAX, 3).is_none());
    }
}
