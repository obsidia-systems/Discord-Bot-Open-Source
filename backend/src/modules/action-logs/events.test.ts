import { describe, expect, it } from "vitest";
import { registerActionLogListeners } from "./events.js";

describe("registerActionLogListeners", () => {
  it("listens for native audit, bulk delete and the rest of the stream", () => {
    const names: string[] = [];
    registerActionLogListeners({
      on: (event) => {
        names.push(String(event));
      },
    });
    expect(names).toContain("guildAuditLogEntryCreate");
    expect(names).toContain("messageDelete");
    expect(names).toContain("messageDeleteBulk");
    expect(names).toContain("guildMemberRemove");
    expect(names).toContain("guildMemberUpdate");
    expect(names).toContain("voiceStateUpdate");
    expect(names).toContain("inviteCreate");
    expect(names).toContain("threadCreate");
    expect(names).toContain("threadDelete");
    expect(names).toContain("guildUpdate");
    expect(names).not.toContain("messageCreate");
  });
});
