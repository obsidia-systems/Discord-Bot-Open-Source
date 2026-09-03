import { z } from "zod";
import { snowflakeList, snowflakeNull } from "../../../core/http/schemas.js";

const panelButtonSchema = z.object({
  typeKey: z.string().min(1).max(32),
  label: z.string().min(1).max(80),
  style: z
    .enum(["Primary", "Secondary", "Success", "Danger"])
    .default("Primary"),
});

export const updateTicketSettingsSchema = z.object({
  categoryId: snowflakeNull,
  staffRoleIds: snowflakeList.max(20).optional(),
  nameTemplate: z.string().max(80).optional(),
  maxOpenPerUser: z.number().int().min(1).max(5).optional(),
  logChannelId: snowflakeNull,
  openerCanClose: z.boolean().optional(),
});

export const createTicketPanelSchema = z.object({
  channelId: snowflakeNull,
  embedTitle: z.string().max(256).optional(),
  embedDescription: z.string().max(4096).optional(),
  embedColor: z.string().max(32).optional(),
  buttons: z.array(panelButtonSchema).max(5).optional(),
});

export const updateTicketPanelSchema = createTicketPanelSchema.partial();

export const closeTicketSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const ticketUserSchema = z.object({
  userId: z.string().min(1).max(40),
});
