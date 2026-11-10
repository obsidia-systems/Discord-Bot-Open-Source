//! Canal privado del ticket, permisos, modal y transcripción acotada.

use super::{InteractionCallback, TextChannel, TransportError, TwilightTransport, snowflake};
use twilight_model::{
    channel::{
        ChannelType,
        message::component::{
            ActionRow, Button, ButtonStyle, Component, Label, TextInput, TextInputStyle,
        },
        permission_overwrite::{PermissionOverwrite, PermissionOverwriteType},
    },
    guild::Permissions,
    http::{
        interaction::{InteractionResponse, InteractionResponseData, InteractionResponseType},
        permission_overwrite::{
            PermissionOverwrite as HttpOverwrite, PermissionOverwriteType as HttpOverwriteKind,
        },
    },
    id::marker::{ChannelMarker, GuildMarker, RoleMarker, UserMarker},
};

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
pub struct TicketMessage {
    pub message_id: String,
    pub author_id: String,
    pub body: String,
}

const TALK: Permissions = Permissions::VIEW_CHANNEL
    .union(Permissions::SEND_MESSAGES)
    .union(Permissions::READ_MESSAGE_HISTORY)
    .union(Permissions::ATTACH_FILES);

impl TwilightTransport {
    /// Crea el canal privado. Si la categoría tiene 50 canales, usa el desborde.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn create_ticket_channel(
        &self,
        guild: u64,
        name: &str,
        category: u64,
        overflow: Option<u64>,
        opener: u64,
        staff_role: u64,
    ) -> Result<String, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        let opener_id = snowflake::<UserMarker>(opener)?;
        let staff_id = snowflake::<RoleMarker>(staff_role)?;
        self.preflight()?;
        let parent = self.ticket_parent(guild_id, category, overflow).await?;
        let bot = self.current_bot_user().await?;
        let overwrites = [
            PermissionOverwrite {
                allow: Permissions::empty(),
                deny: Permissions::VIEW_CHANNEL,
                id: guild_id.cast(),
                kind: PermissionOverwriteType::Role,
            },
            PermissionOverwrite {
                allow: TALK,
                deny: Permissions::empty(),
                id: opener_id.cast(),
                kind: PermissionOverwriteType::Member,
            },
            PermissionOverwrite {
                allow: TALK,
                deny: Permissions::empty(),
                id: staff_id.cast(),
                kind: PermissionOverwriteType::Role,
            },
            PermissionOverwrite {
                allow: TALK
                    .union(Permissions::MANAGE_CHANNELS)
                    .union(Permissions::MANAGE_MESSAGES),
                deny: Permissions::empty(),
                id: bot.cast(),
                kind: PermissionOverwriteType::Member,
            },
        ];
        let channel = self
            .client
            .create_guild_channel(guild_id, name)
            .kind(ChannelType::GuildText)
            .parent_id(parent)
            .permission_overwrites(&overwrites)
            .await
            .map_err(|error| self.noted(&error))?
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(channel.id.to_string())
    }

    async fn ticket_parent(
        &self,
        guild: twilight_model::id::Id<GuildMarker>,
        category: u64,
        overflow: Option<u64>,
    ) -> Result<twilight_model::id::Id<ChannelMarker>, TransportError> {
        let channels = self
            .client
            .guild_channels(guild)
            .await
            .map_err(|error| self.noted(&error))?
            .models()
            .await
            .map_err(|error| self.note_text(error))?;
        let count = |parent: u64| {
            channels
                .iter()
                .filter(|channel| {
                    channel.parent_id.map(twilight_model::id::Id::get) == Some(parent)
                })
                .count()
        };
        let chosen = if count(category) < 50 {
            category
        } else {
            match overflow {
                Some(id) if count(id) < 50 => id,
                _ => return Err(TransportError::Rejected { status: 400 }),
            }
        };
        snowflake(chosen)
    }

    /// Ajusta la escritura del rol de staff y, si aplica, de un miembro.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn set_ticket_access(
        &self,
        channel: u64,
        staff_role: u64,
        member: Option<u64>,
        mode: &str,
    ) -> Result<(), TransportError> {
        let channel_id = snowflake::<ChannelMarker>(channel)?;
        let staff_id = snowflake::<RoleMarker>(staff_role)?;
        self.preflight()?;
        let read = Permissions::VIEW_CHANNEL.union(Permissions::READ_MESSAGE_HISTORY);
        let (allow, deny) = if mode == "open" {
            (Some(read.union(Permissions::SEND_MESSAGES)), None)
        } else {
            (Some(read), Some(Permissions::SEND_MESSAGES))
        };
        self.client
            .update_channel_permission(
                channel_id,
                &HttpOverwrite {
                    allow,
                    deny,
                    id: staff_id.cast(),
                    kind: HttpOverwriteKind::Role,
                },
            )
            .await
            .map_err(|error| self.noted(&error))?;
        if let Some(member) = member {
            let member_id = snowflake::<UserMarker>(member)?;
            let (member_allow, member_deny) = if mode == "closed" {
                (Some(read), Some(Permissions::SEND_MESSAGES))
            } else {
                (Some(read.union(Permissions::SEND_MESSAGES)), None)
            };
            self.client
                .update_channel_permission(
                    channel_id,
                    &HttpOverwrite {
                        allow: member_allow,
                        deny: member_deny,
                        id: member_id.cast(),
                        kind: HttpOverwriteKind::Member,
                    },
                )
                .await
                .map_err(|error| self.noted(&error))?;
        }
        Ok(())
    }

    /// Publica el mensaje de control.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn post_ticket_message(
        &self,
        channel: u64,
        content: &str,
        buttons: &[(String, String)],
    ) -> Result<String, TransportError> {
        let channel_id = snowflake::<ChannelMarker>(channel)?;
        let components = ticket_buttons(buttons);
        self.preflight()?;
        let message = self
            .client
            .create_message(channel_id)
            .content(content)
            .components(&components)
            .await
            .map_err(|error| self.noted(&error))?
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(message.id.to_string())
    }

    /// Lee como máximo 100 mensajes del canal.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn ticket_messages(
        &self,
        channel: u64,
    ) -> Result<Vec<TicketMessage>, TransportError> {
        let channel_id = snowflake::<ChannelMarker>(channel)?;
        self.preflight()?;
        let messages = self
            .client
            .channel_messages(channel_id)
            .limit(100)
            .await
            .map_err(|error| self.noted(&error))?
            .models()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(messages
            .into_iter()
            .map(|message| TicketMessage {
                message_id: message.id.to_string(),
                author_id: message.author.id.to_string(),
                body: message.content,
            })
            .collect())
    }

    /// Borra el canal. El caso y su número se quedan.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn delete_ticket_channel(&self, channel: u64) -> Result<(), TransportError> {
        let channel_id = snowflake::<ChannelMarker>(channel)?;
        self.preflight()?;
        self.client
            .delete_channel(channel_id)
            .await
            .map_err(|error| self.noted(&error))?;
        Ok(())
    }

    /// Manda la valoración al autor por mensaje directo.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn direct_ticket_message(
        &self,
        user: u64,
        content: &str,
        buttons: &[(String, String)],
    ) -> Result<(), TransportError> {
        let user_id = snowflake::<UserMarker>(user)?;
        self.preflight()?;
        let channel = self
            .client
            .create_private_channel(user_id)
            .await
            .map_err(|error| self.noted(&error))?
            .model()
            .await
            .map_err(|error| self.note_text(error))?;
        let components = ticket_buttons(buttons);
        self.client
            .create_message(channel.id)
            .content(content)
            .components(&components)
            .await
            .map_err(|error| self.noted(&error))?;
        Ok(())
    }

    /// El modal es la primera respuesta. No reserva cupo.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn support_modal(
        &self,
        callback: &InteractionCallback,
        title: &str,
        custom_id: &str,
        questions: &[(String, bool)],
    ) -> Result<(), TransportError> {
        let components = questions
            .iter()
            .take(5)
            .enumerate()
            .map(|(index, (label, required))| modal_question(index, label, *required))
            .collect();
        self.create_response(
            callback.clone(),
            InteractionResponse {
                kind: InteractionResponseType::Modal,
                data: Some(InteractionResponseData {
                    allowed_mentions: None,
                    attachments: None,
                    choices: None,
                    components: Some(components),
                    content: None,
                    custom_id: Some(custom_id.to_owned()),
                    embeds: None,
                    flags: None,
                    title: Some(title.chars().take(45).collect()),
                    tts: None,
                    poll: None,
                }),
            },
        )
        .await
    }

    /// Lista las categorías del servidor.
    /// # Errors
    /// Devuelve un error clasificado de Discord.
    pub async fn list_categories(&self, guild: u64) -> Result<Vec<TextChannel>, TransportError> {
        let guild_id = snowflake::<GuildMarker>(guild)?;
        self.preflight()?;
        let channels = self
            .client
            .guild_channels(guild_id)
            .await
            .map_err(|error| self.noted(&error))?
            .models()
            .await
            .map_err(|error| self.note_text(error))?;
        Ok(channels
            .into_iter()
            .filter(|channel| channel.kind == ChannelType::GuildCategory)
            .map(|channel| TextChannel {
                id: channel.id.to_string(),
                name: channel
                    .name
                    .clone()
                    .unwrap_or_else(|| "category".to_owned()),
            })
            .collect())
    }
}

fn ticket_buttons(buttons: &[(String, String)]) -> Vec<Component> {
    vec![Component::ActionRow(ActionRow {
        id: None,
        components: buttons
            .iter()
            .take(5)
            .map(|(id, label)| {
                Component::Button(Button {
                    id: None,
                    custom_id: Some(id.chars().take(100).collect()),
                    disabled: false,
                    emoji: None,
                    label: Some(label.chars().take(80).collect()),
                    style: ButtonStyle::Secondary,
                    url: None,
                    sku_id: None,
                })
            })
            .collect(),
    })]
}

#[allow(deprecated)]
fn modal_question(index: usize, label: &str, required: bool) -> Component {
    Component::Label(Label {
        id: None,
        label: label.chars().take(45).collect(),
        description: None,
        component: Box::new(Component::TextInput(TextInput {
            id: None,
            custom_id: format!("q{index}"),
            label: None,
            max_length: Some(500),
            min_length: required.then_some(1),
            placeholder: None,
            required: Some(required),
            style: TextInputStyle::Short,
            value: None,
        })),
    })
}
