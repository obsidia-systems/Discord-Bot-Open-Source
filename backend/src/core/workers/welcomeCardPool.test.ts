import { beforeAll, describe, expect, it, vi } from "vitest";

// Fuerza el camino inline (sin worker_threads) antes de importar el módulo.
vi.stubEnv("WELCOME_CARD_INLINE", "1");

const { renderWelcomeCard, welcomeCardPoolSize } = await import(
  "./welcomeCardPool.js"
);

describe("welcomeCardPool (fallback inline)", () => {
  beforeAll(() => {
    expect(welcomeCardPoolSize()).toBe(0);
  });

  it("renderWelcomeCard devuelve un PNG aunque el avatar no cargue", async () => {
    const png = await renderWelcomeCard({
      user: { username: "t", displayName: "T", avatarUrl: "" },
      textLayers: [],
    });
    expect(Buffer.isBuffer(png)).toBe(true);
    // firma PNG: 89 50 4E 47
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
  });
});
