import { describe, it, expect } from "vitest";
import { getSportRules, SPORT_RULES } from "./sportRules";

describe("getSportRules", () => {
  it("returns the real rules for a known sport", () => {
    const rules = getSportRules("hoop");
    expect(rules).toBe(SPORT_RULES.hoop);
    expect(rules.clock.enabled).toBe(true);
    expect(rules.scoreButtons).toEqual([1, 2, 3]);
  });

  it("resolves basketball/bb/hoops aliases to hoop", () => {
    for (const alias of ["basketball", "bb", "hoops"]) {
      expect(getSportRules(alias)).toBe(SPORT_RULES.hoop);
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(getSportRules("  Soccer  ")).toBe(SPORT_RULES.soccer);
    expect(getSportRules("HOOP")).toBe(SPORT_RULES.hoop);
  });

  it("falls back to a safe default shape for an unknown sport instead of throwing", () => {
    const rules = getSportRules("dodgeball");
    expect(rules.label).toBe("dodgeball");
    expect(rules.clock.enabled).toBe(false);
    expect(rules.scoreButtons).toEqual([1]);
    expect(rules.stats).toEqual([]);
  });

  it("handles missing/empty input without throwing", () => {
    expect(() => getSportRules(undefined)).not.toThrow();
    expect(() => getSportRules(null)).not.toThrow();
    expect(() => getSportRules("")).not.toThrow();
  });

  it("clock-disabled sports (no live timer) report clock.enabled === false", () => {
    for (const sport of ["softball", "volleyball", "kickball", "newcomb"]) {
      expect(getSportRules(sport).clock.enabled).toBe(false);
    }
  });

  it("every clock-enabled sport has at least one clock mode with presets", () => {
    for (const [sport, rules] of Object.entries(SPORT_RULES)) {
      if (!rules.clock.enabled) continue;
      expect(rules.clock.modes?.length, `${sport} should have clock modes`).toBeGreaterThan(0);
      for (const mode of rules.clock.modes) {
        expect(mode.presets?.length, `${sport} mode ${mode.id} should have presets`).toBeGreaterThan(0);
      }
      // defaultMode must actually name one of the modes that exist
      expect(rules.clock.modes.some((m) => m.id === rules.clock.defaultMode)).toBe(true);
    }
  });
});
