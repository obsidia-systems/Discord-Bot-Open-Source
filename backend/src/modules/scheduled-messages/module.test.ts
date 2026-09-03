import {
  defaultScheduledEmbedData,
  defaultScheduledFrequency,
  type ScheduledMessage,
} from "@adobos/shared";
import { describe, expect, it } from "vitest";
import { nextRunAfterSend } from "./domain/scheduled-messages.js";
import { scheduledMessagesModule } from "./module.js";

function sample(over: Partial<ScheduledMessage> = {}): ScheduledMessage {
  const now = "2026-09-01T12:00:00.000Z";
  return {
    id: 1,
    guildId: "1",
    channelId: "2",
    label: "Test",
    timezone: "UTC",
    frequency: defaultScheduledFrequency(),
    embedData: defaultScheduledEmbedData(),
    content: "",
    pingRoleId: null,
    isActive: true,
    nextRunAt: now,
    lastSentAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("scheduled-messages module", () => {
  it("is named Scheduled Messages", () => {
    expect(scheduledMessagesModule.id).toBe("scheduled-messages");
    expect(scheduledMessagesModule.name).toBe("Scheduled Messages");
  });
});

describe("nextRunAfterSend", () => {
  it("pauses one-shot and schedules the next daily", () => {
    const sentAt = new Date("2026-09-01T18:00:00.000Z");
    const oneShot = nextRunAfterSend(
      sample({
        frequency: {
          ...defaultScheduledFrequency(),
          type: "specific_date",
          date: "2026-09-01",
          time: "18:00",
          repeatYearly: false,
        },
      }),
      sentAt,
    );
    expect(oneShot.isActive).toBe(false);
    expect(oneShot.nextRunAt).toBeNull();

    const daily = nextRunAfterSend(
      sample({
        frequency: { ...defaultScheduledFrequency(), time: "18:00" },
      }),
      sentAt,
    );
    expect(daily.isActive).toBe(true);
    expect(daily.nextRunAt?.toISOString()).toBe("2026-09-02T18:00:00.000Z");
  });
});
