// @req SCD-A11Y-001, SCD-THEME-002
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/dashboard/contrast";

const css = readFileSync("src/app/globals.css", "utf8");

/** Custom properties declared in the first `:root { … }` block. */
function rootTokens(): Record<string, string> {
  const match = /:root\s*\{([^}]*)\}/.exec(css);
  if (!match) throw new Error(":root block not found in globals.css");
  const found: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) found[name] = value.trim();
  return found;
}

/** Resolves `light-dark(a, b)` to a (light) or b (dark); other values apply to both themes. */
function resolve(tokens: Record<string, string>, theme: "light" | "dark"): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => {
      const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(value);
      return [name, pair ? (theme === "light" ? pair[1] : pair[2]) : value];
    }),
  );
}

const root = rootTokens();
const light = resolve(root, "light");
const dark = resolve(root, "dark");

const TEXT = ["ink", "ink-2", "muted", "link"];
const BACKGROUNDS = ["surface", "plane", "surface-2"];
const TINTS = ["good-tint", "warning-tint", "critical-tint"];
const textPairs = TEXT.flatMap((text) => BACKGROUNDS.map((background) => [text, background] as const));

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_theme, t) => {
  it.each(textPairs)("--%s on --%s is at least 4.5:1", (text, background) => {
    expect(contrastRatio(t[text], t[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TINTS)("--ink on --%s is at least 4.5:1", (tint) => {
    expect(contrastRatio(t.ink, t[tint])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme tokens", () => {
  it("define the fixed status colours", () => {
    expect([light.good, light.warning, light.critical]).toEqual(["#0ca30c", "#fab219", "#d03b3b"]);
  });

  it("declares every token once, in :root, with both themes via light-dark()", () => {
    const declarations = [...css.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]);
    const tokenBlock = /@theme inline\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const outsideTheme = declarations.filter((name) => !tokenBlock.includes(`--${name}:`));
    expect(outsideTheme.sort()).toEqual(Object.keys(root).sort());
    for (const name of ["plane", "surface", "surface-2", "ink", "ink-2", "muted", "link", "good-tint", "warning-tint", "critical-tint"]) {
      expect(root[name]).toMatch(/^light-dark\(/);
    }
  });

  it("switches themes with color-scheme only", () => {
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;\s*\}/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;\s*\}/);
  });

  it("are the only colours used by components", () => {
    const files = readdirSync("src/components", { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
    );
    const offenders = files.filter((f) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(readFileSync(join("src/components", f), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
