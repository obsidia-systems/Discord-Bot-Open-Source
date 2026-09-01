import { describe, expect, it } from "vitest";
import {
  buildFormResponsesCsv,
  clampFormCooldownMinutes,
  escapeCsvCell,
  FORMS_MAX_PER_GUILD,
  FORMS_MAX_QUESTIONS,
  FORMS_MAX_SELECT_OPTIONS,
  formMemberGateReason,
  normalizeFormQuestions,
  normalizeFormSelectOptions,
  normalizeFormSubmitMode,
  parseFormNumericId,
} from "./forms.js";

describe("normalizeFormQuestions", () => {
  it("recorta a 5, exige label y deduplica ids", () => {
    const questions = normalizeFormQuestions([
      {
        id: "q1",
        label: "  Nombre  ",
        style: "SHORT",
        required: true,
        placeholder: "",
        options: [],
      },
      {
        id: "q1",
        label: "Duplicada",
        style: "PARAGRAPH",
        required: false,
        placeholder: "x".repeat(120),
        options: [],
      },
      {
        id: "skip",
        label: "   ",
        style: "SHORT",
        required: true,
        placeholder: "",
        options: [],
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `extra${i}`,
        label: `P${i}`,
        style: "SHORT" as const,
        required: false,
        placeholder: "",
        options: [],
      })),
    ]);
    expect(questions).toHaveLength(FORMS_MAX_QUESTIONS);
    expect(questions[0]?.label).toBe("Nombre");
    expect(questions[1]?.id).not.toBe("q1");
    expect(questions[1]?.placeholder.length).toBe(100);
    expect(questions[1]?.style).toBe("PARAGRAPH");
  });

  it("normaliza select y file", () => {
    const [select, file] = normalizeFormQuestions([
      {
        id: "plat",
        label: "Plataforma",
        style: "SELECT",
        required: true,
        placeholder: "",
        options: ["PC", "PC", "PlayStation"],
      },
      {
        id: "cv",
        label: "CV",
        style: "FILE",
        required: true,
        placeholder: "",
        options: [{ label: "ignorar", value: "x" }],
      },
    ]);
    expect(select?.style).toBe("STRING_SELECT");
    expect(select?.options).toHaveLength(2);
    expect(file?.style).toBe("FILE_UPLOAD");
    expect(file?.options).toEqual([]);
  });
});

describe("normalizeFormSelectOptions", () => {
  it("recorta al tope Discord y slugifica values", () => {
    const many = Array.from(
      { length: FORMS_MAX_SELECT_OPTIONS + 3 },
      (_, i) => `Option ${i}`,
    );
    const options = normalizeFormSelectOptions(many);
    expect(options).toHaveLength(FORMS_MAX_SELECT_OPTIONS);
    expect(options[0]?.value).toBe("option_0");
  });
});

describe("gates y cooldown", () => {
  it("bloquea rol prohibido y exige uno requerido", () => {
    expect(
      formMemberGateReason({
        memberRoleIds: ["1"],
        requiredRoleIds: [],
        blockedRoleIds: ["1"],
      }),
    ).toBeTruthy();
    expect(
      formMemberGateReason({
        memberRoleIds: ["9"],
        requiredRoleIds: ["2"],
        blockedRoleIds: [],
      }),
    ).toBeTruthy();
    expect(
      formMemberGateReason({
        memberRoleIds: ["2"],
        requiredRoleIds: ["2"],
        blockedRoleIds: [],
      }),
    ).toBeNull();
  });

  it("clamp de cooldown y modo once", () => {
    expect(clampFormCooldownMinutes(-3)).toBe(0);
    expect(clampFormCooldownMinutes(99_999)).toBe(60 * 24 * 30);
    expect(normalizeFormSubmitMode("ONCE")).toBe("once");
    expect(normalizeFormSubmitMode("nope")).toBe("cooldown");
  });
});

describe("csv y customId", () => {
  it("escapa comillas y arma columnas por pregunta", () => {
    expect(escapeCsvCell('a "b"')).toBe('"a ""b"""');
    const csv = buildFormResponsesCsv(
      {
        modalTitle: "App",
        questions: [
          {
            id: "q1",
            label: "Edad",
            style: "SHORT",
            required: true,
            placeholder: "",
            options: [],
          },
        ],
      },
      [
        {
          id: 7,
          formId: 1,
          guildId: "g",
          userId: "u",
          username: "ada",
          displayName: "Ada",
          avatarUrl: null,
          answers: [{ questionId: "q1", label: "Edad", value: "18" }],
          status: "pending",
          reviewedBy: null,
          reviewedAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    );
    expect(csv).toContain("Edad");
    expect(csv).toContain("18");
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("parsea ids de botón y rechaza snowflakes legacy", () => {
    expect(parseFormNumericId("form_open_12", "form_open_")).toBe(12);
    expect(parseFormNumericId("form_open_abc", "form_open_")).toBeNull();
    expect(
      parseFormNumericId("form_open_1536203607190540308", "form_open_"),
    ).toBeNull();
    expect(FORMS_MAX_PER_GUILD).toBe(25);
  });
});
