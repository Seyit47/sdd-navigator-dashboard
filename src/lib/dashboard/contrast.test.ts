// @req SCD-A11Y-001
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

// @req SCD-A11Y-001
describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("is 1:1 for identical colours, in either order", () => {
    expect(contrastRatio("#2a78d6", "#2a78d6")).toBe(1);
  });

  it("matches the WCAG reference for #777777 on white", () => {
    expect(contrastRatio("#ffffff", "#777777")).toBeCloseTo(4.48, 2);
  });
});
