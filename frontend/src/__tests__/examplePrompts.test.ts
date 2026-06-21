import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getSeasonalCards, getSeasonalChips, ALL_TEMPLATE_SPECS } from "../lib/examplePrompts";

// Helper to mock the current month
function withMonth(month: number, fn: () => void) {
  const real = Date;
  const MockDate = class extends real {
    constructor(...args: any[]) {
      if (args.length === 0) super();
      else super(...(args as []));
    }
    getMonth() { return month - 1; } // getMonth() is 0-indexed
  };
  vi.stubGlobal("Date", MockDate);
  try { fn(); } finally { vi.unstubAllGlobals(); }
}

describe("getSeasonalCards", () => {
  it("returns exactly 10 cards", () => {
    expect(getSeasonalCards()).toHaveLength(10);
  });

  it("always includes all 5 static destinations", () => {
    const cards = getSeasonalCards();
    const statics = ALL_TEMPLATE_SPECS.filter(s => s.tier === "static");
    for (const s of statics) {
      expect(cards.some(c => c.destination === s.destination)).toBe(true);
    }
  });

  it("includes 5 summer destinations in June", () => {
    withMonth(6, () => {
      const cards = getSeasonalCards();
      const summerCards = cards.filter(c => c.season === "summer");
      expect(summerCards).toHaveLength(5);
    });
  });

  it("includes 5 monsoon destinations in August", () => {
    withMonth(8, () => {
      const cards = getSeasonalCards();
      const monsoonCards = cards.filter(c => c.season === "monsoon");
      expect(monsoonCards).toHaveLength(5);
    });
  });

  it("includes 5 winter destinations in January", () => {
    withMonth(1, () => {
      const cards = getSeasonalCards();
      const winterCards = cards.filter(c => c.season === "winter");
      expect(winterCards).toHaveLength(5);
    });
  });
});

describe("getSeasonalChips", () => {
  it("returns exactly 4 chips", () => {
    expect(getSeasonalChips()).toHaveLength(4);
  });

  it("chips have no destination overlap with cards", () => {
    const cardDests = new Set(getSeasonalCards().map(c => c.destination));
    const chips = getSeasonalChips();
    for (const chip of chips) {
      expect(cardDests.has(chip.destination)).toBe(false);
    }
  });

  it("chips come from exactly 2 different seasons", () => {
    const chipSeasons = new Set(getSeasonalChips().map(c => c.season));
    expect(chipSeasons.size).toBe(2);
  });

  it("has 2 chips from each of the other 2 seasons in June (summer)", () => {
    withMonth(6, () => {
      const chips = getSeasonalChips();
      const monsoon = chips.filter(c => c.season === "monsoon");
      const winter  = chips.filter(c => c.season === "winter");
      expect(monsoon).toHaveLength(2);
      expect(winter).toHaveLength(2);
    });
  });

  it("chips never include a static-tier destination", () => {
    const chips = getSeasonalChips();
    for (const chip of chips) {
      expect(chip.tier).toBe("dynamic");
    }
  });
});
