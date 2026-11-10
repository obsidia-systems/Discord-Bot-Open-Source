//! Reglas puras del mostrador de soporte. La admisión sigue en `support`.

use time::{OffsetDateTime, UtcOffset, Weekday};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SupportQuestion {
    pub title: String,
    pub required: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WeeklyWindow {
    pub weekday: u8,
    pub start_minute: u16,
    pub end_minute: u16,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeskConfig {
    pub category_id: String,
    pub overflow_category_id: Option<String>,
    pub staff_role_id: String,
    pub questions: Vec<SupportQuestion>,
    pub timezone_offset_minutes: i32,
    pub weekly_hours: Vec<WeeklyWindow>,
    pub closed_hours: String,
    pub confirm_close: bool,
    pub inactivity_minutes: Option<i32>,
    pub transcript_enabled: bool,
    pub log_channel_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HoursGate {
    Open,
    Warn,
    Block,
}

/// Sin intervalos el panel está abierto. Con intervalos, `block` rechaza y `warn` deja abrir.
#[must_use]
pub fn hours_gate(config: &DeskConfig, now: OffsetDateTime) -> HoursGate {
    if config.weekly_hours.is_empty() || config.closed_hours == "open" {
        return HoursGate::Open;
    }
    let Ok(offset) = UtcOffset::from_whole_seconds(config.timezone_offset_minutes * 60) else {
        return HoursGate::Block;
    };
    let local = now.to_offset(offset);
    let weekday = match local.weekday() {
        Weekday::Monday => 0,
        Weekday::Tuesday => 1,
        Weekday::Wednesday => 2,
        Weekday::Thursday => 3,
        Weekday::Friday => 4,
        Weekday::Saturday => 5,
        Weekday::Sunday => 6,
    };
    let minute = u16::from(local.hour()) * 60 + u16::from(local.minute());
    let inside = config.weekly_hours.iter().any(|window| {
        window.weekday == weekday && minute >= window.start_minute && minute < window.end_minute
    });
    if inside {
        HoursGate::Open
    } else if config.closed_hours == "warn" {
        HoursGate::Warn
    } else {
        HoursGate::Block
    }
}

/// Nombre de canal derivado del número. No copia el nombre visible del miembro.
#[must_use]
pub fn ticket_channel_name(number: i64) -> String {
    let raw = format!("ticket-{number}");
    let mut name = String::new();
    let mut previous_hyphen = false;
    for character in raw.chars() {
        let mapped = if character.is_ascii_alphanumeric() {
            previous_hyphen = false;
            Some(character.to_ascii_lowercase())
        } else if !previous_hyphen {
            previous_hyphen = true;
            Some('-')
        } else {
            None
        };
        if let Some(mapped) = mapped {
            name.push(mapped);
        }
        if name.chars().count() == 100 {
            break;
        }
    }
    name.trim_matches('-').to_owned()
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TranscriptLine {
    pub message_id: String,
    pub author_id: String,
    pub body: Option<String>,
    pub observed_at: OffsetDateTime,
}

/// HTML propio. Un mensaje observado sin cuerpo queda como hueco, no como texto inventado.
#[must_use]
pub fn transcript_html(number: i64, lines: &[TranscriptLine]) -> (String, &'static str) {
    let mut incomplete = false;
    let mut body = format!(
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Ticket {number}</title></head><body><h1>Ticket {number}</h1>"
    );
    for line in lines {
        body.push_str("<article><p>");
        body.push_str(&escape(&line.author_id));
        body.push_str(" · ");
        body.push_str(&escape(&line.observed_at.to_string()));
        body.push_str("</p>");
        if let Some(text) = &line.body {
            body.push_str("<pre>");
            body.push_str(&escape(text));
            body.push_str("</pre>");
        } else {
            incomplete = true;
            body.push_str("<p>Message ");
            body.push_str(&escape(&line.message_id));
            body.push_str(" was not captured.</p>");
        }
        body.push_str("</article>");
    }
    body.push_str("</body></html>");
    (body, if incomplete { "incomplete" } else { "complete" })
}

fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::{
        DeskConfig, HoursGate, TranscriptLine, hours_gate, ticket_channel_name, transcript_html,
    };
    use time::{Date, Month, OffsetDateTime, Time};

    fn config(closed: &str, windows: bool) -> DeskConfig {
        DeskConfig {
            category_id: "1".to_owned(),
            overflow_category_id: None,
            staff_role_id: "2".to_owned(),
            questions: Vec::new(),
            timezone_offset_minutes: 0,
            weekly_hours: if windows {
                vec![super::WeeklyWindow {
                    weekday: 0,
                    start_minute: 9 * 60,
                    end_minute: 17 * 60,
                }]
            } else {
                Vec::new()
            },
            closed_hours: closed.to_owned(),
            confirm_close: false,
            inactivity_minutes: None,
            transcript_enabled: false,
            log_channel_id: None,
        }
    }

    fn at(
        weekday_offset_days: i64,
        hour: u8,
    ) -> Result<OffsetDateTime, time::error::ComponentRange> {
        let date = Date::from_calendar_date(2026, Month::November, 9)?
            .saturating_add(time::Duration::days(weekday_offset_days));
        Ok(date.with_time(Time::from_hms(hour, 0, 0)?).assume_utc())
    }

    #[test]
    fn hours_block_outside_the_window_and_warn_still_names_the_gap()
    -> Result<(), time::error::ComponentRange> {
        let monday = at(0, 10)?;
        assert_eq!(monday.weekday(), time::Weekday::Monday);
        assert_eq!(hours_gate(&config("block", true), monday), HoursGate::Open);
        assert_eq!(
            hours_gate(&config("block", true), at(0, 18)?),
            HoursGate::Block
        );
        assert_eq!(
            hours_gate(&config("warn", true), at(0, 18)?),
            HoursGate::Warn
        );
        assert_eq!(
            hours_gate(&config("block", false), at(0, 18)?),
            HoursGate::Open
        );
        assert_eq!(
            hours_gate(&config("open", true), at(0, 18)?),
            HoursGate::Open
        );
        Ok(())
    }

    #[test]
    fn channel_name_and_transcript_keep_missing_messages_visible() {
        assert_eq!(ticket_channel_name(12), "ticket-12");
        let observed = OffsetDateTime::now_utc();
        let (html, coverage) = transcript_html(
            4,
            &[TranscriptLine {
                message_id: "99".to_owned(),
                author_id: "42".to_owned(),
                body: None,
                observed_at: observed,
            }],
        );
        assert_eq!(coverage, "incomplete");
        assert!(html.contains("was not captured"));
        assert!(html.contains("Ticket 4"));
        let (complete, coverage) = transcript_html(
            4,
            &[TranscriptLine {
                message_id: "99".to_owned(),
                author_id: "<staff>".to_owned(),
                body: Some("a < b".to_owned()),
                observed_at: observed,
            }],
        );
        assert_eq!(coverage, "complete");
        assert!(complete.contains("&lt;staff&gt;"));
        assert!(complete.contains("a &lt; b"));
    }
}
