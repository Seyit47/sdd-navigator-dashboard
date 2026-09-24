// @req SCD-A11Y-002
import axe from "axe-core";

/**
 * Runs axe on a rendered component. Colour contrast is checked separately against the
 * theme tokens (jsdom cannot compute it), and "region" only applies to whole pages.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
}
