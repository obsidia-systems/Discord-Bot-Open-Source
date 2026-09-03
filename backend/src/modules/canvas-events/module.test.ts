import { describe, expect, it } from "vitest";
import { canvasEventsModule } from "./module.js";

describe("canvas-events module", () => {
  it("se llama Canvas Events", () => {
    expect(canvasEventsModule.id).toBe("canvas-events");
    expect(canvasEventsModule.name).toBe("Canvas Events");
  });
});
