// @req SCD-A11Y-001, SCD-THEME-002
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/dashboard/contrast";

const css = readFileSync("src/app/globals.css", "utf8");

function tokens(block: RegExp): Record<string, string> {
  const match = block.exec(css);
  if (!match) throw new Error(`Block ${block} not found in globals.css`);
  const found: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) found[name] = value.trim();
  return found;
}

const light = tokens(/:root\s*\{([^}]*)\}/);
const darkMedia = tokens(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
const darkToggle = tokens(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

const TEXT = ["ink", "ink-2", "muted", "link"];
const BACKGROUNDS = ["surface", "plane"];
const pairs = TEXT.flatMap((text) => BACKGROUNDS.map((background) => [text, background] as const));

describe.each([
  ["light", light],
  ["dark", darkToggle],
])("%s theme", (_theme, t) => {
  it.each(pairs)("--%s on --%s is at least 4.5:1", (text, background) => {
    expect(contrastRatio(t[text], t[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("--ink on --chip and --code-bg is at least 4.5:1", () => {
    expect(contrastRatio(t.ink, t.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.ink, t["code-bg"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("theme tokens", () => {
  it("define the fixed status colours", () => {
    expect([light.good, light.warning, light.critical]).toEqual(["#0ca30c", "#fab219", "#d03b3b"]);
  });

  it("use identical dark values for the OS preference and the toggle", () => {
    expect(darkMedia).toEqual(darkToggle);
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
