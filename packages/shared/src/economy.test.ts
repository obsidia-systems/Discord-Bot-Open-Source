import { describe, expect, it } from "vitest";
import {
  clampEconomyBalance,
  clampStartBalance,
  clampTransferTax,
  computePayTax,
  defaultEconomyRob,
  incomeChoiceMode,
  MAX_ECONOMY_BALANCE,
  parseBankAmount,
} from "./economy.js";

describe("parseBankAmount", () => {
  it("acepta all/todo/max y enteros ≥ 1", () => {
    expect(parseBankAmount("all")).toBe("all");
    expect(parseBankAmount(" TODO ")).toBe("all");
    expect(parseBankAmount("max")).toBe("all");
    expect(parseBankAmount("1,000")).toBe(1000);
    expect(parseBankAmount("42")).toBe(42);
  });

  it("rechaza vacío, decimales y negativos", () => {
    expect(parseBankAmount("")).toBeNull();
    expect(parseBankAmount("1.5")).toBeNull();
    expect(parseBankAmount("0")).toBeNull();
    expect(parseBankAmount("-3")).toBeNull();
  });
});

describe("computePayTax", () => {
  it("10% de 100 deja 90 al destino", () => {
    expect(computePayTax(100, 10)).toEqual({
      sent: 100,
      tax: 10,
      received: 90,
    });
  });

  it("clampa el porcentaje a 0–100", () => {
    expect(computePayTax(50, 200).tax).toBe(50);
    expect(computePayTax(50, -5).tax).toBe(0);
  });
});

describe("clampEconomyBalance", () => {
  it("no baja de 0 ni pasa el techo", () => {
    expect(clampEconomyBalance(-1)).toBe(0);
    expect(clampEconomyBalance(MAX_ECONOMY_BALANCE + 1)).toBe(
      MAX_ECONOMY_BALANCE,
    );
    expect(clampStartBalance(10.9)).toBe(10);
    expect(clampTransferTax(150)).toBe(100);
  });
});

describe("incomeChoiceMode", () => {
  it("1 auto, 2–5 select, 6+ random", () => {
    expect(incomeChoiceMode(0)).toBe("auto");
    expect(incomeChoiceMode(1)).toBe("auto");
    expect(incomeChoiceMode(2)).toBe("select");
    expect(incomeChoiceMode(5)).toBe("select");
    expect(incomeChoiceMode(6)).toBe("random");
  });
});

describe("defaultEconomyRob", () => {
  it("arranca apagado y solo mira cartera", () => {
    const rob = defaultEconomyRob();
    expect(rob.enabled).toBe(false);
    expect(rob.minStealPercent).toBeLessThanOrEqual(rob.maxStealPercent);
  });
});
