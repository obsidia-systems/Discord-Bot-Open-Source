import { describe, expect, it } from "vitest";
import {
  applyTicketNameTemplate,
  canApplyTicketAction,
  canCloseTicket,
  clampTicketOpenPerUser,
  isTicketStaff,
  normalizeTicketCloseReason,
  normalizeTicketPanelButtons,
  normalizeTicketTypeKey,
  parseTicketOpenCustomId,
  parseTicketRecordId,
  parseTicketUserMention,
  TICKET_ACTIONS,
  TICKET_CLAIM_PREFIX,
  TICKET_OPEN_PREFIX,
  TICKET_STATUSES,
  TICKETS_MAX_OPEN_GUILD,
  ticketOpenBlocked,
  ticketOpenCustomId,
  ticketStatusAfter,
} from "./tickets.js";

describe("state machine", () => {
  it("accepts the flow open → claimed → waiting → closed and reopen", () => {
    expect(ticketStatusAfter("open", "claim")).toBe("claimed");
    expect(ticketStatusAfter("claimed", "wait")).toBe("waiting");
    expect(ticketStatusAfter("waiting", "unwait")).toBe("claimed");
    expect(ticketStatusAfter("claimed", "close")).toBe("closed");
    expect(ticketStatusAfter("closed", "reopen")).toBe("open");
  });

  it("closes from open, claimed or waiting", () => {
    expect(ticketStatusAfter("open", "close")).toBe("closed");
    expect(ticketStatusAfter("waiting", "close")).toBe("closed");
  });

  it("unclaim returns to open; transfer stays claimed", () => {
    expect(ticketStatusAfter("claimed", "unclaim")).toBe("open");
    expect(ticketStatusAfter("waiting", "transfer")).toBe("claimed");
    expect(ticketStatusAfter("claimed", "transfer")).toBe("claimed");
  });

  it("rejects illegal transitions", () => {
    expect(ticketStatusAfter("closed", "claim")).toBeNull();
    expect(ticketStatusAfter("closed", "close")).toBeNull();
    expect(ticketStatusAfter("open", "wait")).toBeNull();
    expect(ticketStatusAfter("waiting", "unclaim")).toBeNull();
    expect(ticketStatusAfter("open", "reopen")).toBeNull();
    expect(ticketStatusAfter("claimed", "reopen")).toBeNull();
    expect(canApplyTicketAction("open", "claim")).toBe(true);
    expect(canApplyTicketAction("closed", "wait")).toBe(false);
  });

  it("covers all catalog actions and states", () => {
    expect(TICKET_STATUSES).toEqual(["open", "claimed", "waiting", "closed"]);
    expect(TICKET_ACTIONS).toContain("transfer");
  });
});

describe("caps operativos", () => {
  it("blocks 50 open per guild and 1 per user by default", () => {
    expect(
      ticketOpenBlocked({
        guildOpenCount: TICKETS_MAX_OPEN_GUILD,
        openerOpenCount: 0,
        maxOpenPerUser: 1,
      }),
    ).toBe("guild");
    expect(
      ticketOpenBlocked({
        guildOpenCount: 3,
        openerOpenCount: 1,
        maxOpenPerUser: 1,
      }),
    ).toBe("user");
    expect(
      ticketOpenBlocked({
        guildOpenCount: 3,
        openerOpenCount: 0,
        maxOpenPerUser: 1,
      }),
    ).toBeNull();
  });

  it("clampa maxOpenPerUser 1–5", () => {
    expect(clampTicketOpenPerUser(0)).toBe(1);
    expect(clampTicketOpenPerUser(3)).toBe(3);
    expect(clampTicketOpenPerUser(99)).toBe(5);
  });
});

describe("staff and closing", () => {
  it("Manage Guild or staff role", () => {
    expect(
      isTicketStaff({
        memberRoleIds: ["r1"],
        staffRoleIds: ["r1"],
        manageGuild: false,
      }),
    ).toBe(true);
    expect(
      isTicketStaff({
        memberRoleIds: [],
        staffRoleIds: ["r1"],
        manageGuild: true,
      }),
    ).toBe(true);
    expect(
      isTicketStaff({
        memberRoleIds: ["x"],
        staffRoleIds: ["r1"],
        manageGuild: false,
      }),
    ).toBe(false);
  });

  it("the opener closes their own if the toggle is on", () => {
    expect(
      canCloseTicket({
        status: "open",
        actorId: "u1",
        openerId: "u1",
        openerCanClose: true,
        isStaff: false,
      }),
    ).toBe(true);
    expect(
      canCloseTicket({
        status: "open",
        actorId: "u1",
        openerId: "u1",
        openerCanClose: false,
        isStaff: false,
      }),
    ).toBe(false);
    expect(
      canCloseTicket({
        status: "closed",
        actorId: "staff",
        openerId: "u1",
        openerCanClose: true,
        isStaff: true,
      }),
    ).toBe(false);
  });
});

describe("template and parsing", () => {
  it("ticket-{n}-{user} sobrevive caracteres raros", () => {
    expect(
      applyTicketNameTemplate("ticket-{n}-{user}", {
        n: 12,
        user: "Kevin X!",
        typeKey: "support",
      }),
    ).toBe("ticket-12-kevin-x");
    expect(
      applyTicketNameTemplate("{type}-{n}", {
        n: 1,
        user: "a",
        typeKey: "report",
      }),
    ).toBe("report-1");
  });

  it("parses the open and claim customIds", () => {
    const id = ticketOpenCustomId(4, "support");
    expect(id.startsWith(TICKET_OPEN_PREFIX)).toBe(true);
    expect(parseTicketOpenCustomId(id)).toEqual({
      panelId: 4,
      typeKey: "support",
    });
    expect(parseTicketOpenCustomId("ticket_open_abc_x")).toBeNull();
    expect(
      parseTicketRecordId(`${TICKET_CLAIM_PREFIX}12`, TICKET_CLAIM_PREFIX),
    ).toBe(12);
    expect(
      parseTicketRecordId("ticket_claim_abc", TICKET_CLAIM_PREFIX),
    ).toBeNull();
  });

  it("parses a mention or snowflake", () => {
    expect(parseTicketUserMention("<@123456789012345678>")).toBe(
      "123456789012345678",
    );
    expect(parseTicketUserMention("123456789012345678")).toBe(
      "123456789012345678",
    );
    expect(parseTicketUserMention("nope")).toBeNull();
  });

  it("normalizes panel buttons and typeKey", () => {
    expect(normalizeTicketTypeKey("Support")).toBe("support");
    expect(normalizeTicketTypeKey("A B")).toBeNull();
    expect(
      normalizeTicketPanelButtons([
        { typeKey: "support", label: "Ayuda", style: "Primary" },
        { typeKey: "support", label: "Dup", style: "Danger" },
        { typeKey: "report", label: "Reportar", style: "Danger" },
      ]),
    ).toEqual([
      { typeKey: "support", label: "Ayuda", style: "Primary" },
      { typeKey: "report", label: "Reportar", style: "Danger" },
    ]);
  });

  it("requires a non-empty close reason", () => {
    expect(normalizeTicketCloseReason("  listo  ")).toBe("listo");
    expect(normalizeTicketCloseReason("   ")).toBeNull();
  });
});
