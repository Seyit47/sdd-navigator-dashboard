// @req SCD-VAL-002, SCD-A11Y-001, SCD-UI-007, SCD-THEME-001, SCD-DEP-002
// Browser checks that jsdom cannot do: layout at phone width, pending filter feedback,
// server-side filtering, theme switching, and no console errors.
// Usage: pnpm build && pnpm check:browser        (starts `next start` on a free port)
//        BASE_URL=https://example.app pnpm check:browser   (checks a deployment)
//        EXPECT_DATA_MODE=api|mock also checks the header's data-mode badge.
// Expectations are derived, not hard-coded: colours from the theme tokens in globals.css,
// rows from their own status and date columns, the detail page from the first table link.
// Needs Chrome (CHROME_PATH, default "google-chrome"). Exit code 1 if any check fails.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3939;
const MODE_BADGES = { api: "Live API", mock: "Mock data" };

/** The page background (--plane) in each theme, as computed styles report it. */
function planeColours() {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const match = /--plane:\s*light-dark\(\s*#([0-9a-f]{6})\s*,\s*#([0-9a-f]{6})\s*\)/i.exec(css);
  if (!match) throw new Error("--plane token not found in src/app/globals.css");
  const rgb = (hex) => `rgb(${[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  return { light: rgb(match[1]), dark: rgb(match[2]) };
}
const DEBUG_PORT = 9339;
const base = (process.env.BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const failures = [];
const children = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${detail}`}`);
  if (!ok) {
    failures.push(name);
    // On GitHub Actions, also report the failure as an annotation, which is visible on the
    // pull request and through the public API without access to the job log.
    if (process.env.GITHUB_ACTIONS === "true") {
      const message = `${name} — ${detail}`.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
      console.log(`::error title=Browser check failed::${message}`);
    }
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`${url} did not respond within ${timeoutMs} ms`);
}

async function startServer() {
  if (process.env.BASE_URL) {
    await waitForHttp(`${base}/`, 30_000);
    return;
  }
  const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { stdio: "ignore" });
  children.push(server);
  await waitForHttp(`${base}/`, 30_000);
}

async function connectChrome() {
  const profile = mkdtempSync(join(tmpdir(), "check-browser-"));
  const chrome = spawn(
    process.env.CHROME_PATH ?? "google-chrome",
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-sandbox", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "about:blank"],
    { stdio: "ignore" },
  );
  children.push(chrome);
  process.on("exit", () => {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      // Chrome may still be writing its profile while shutting down; it is a temp directory.
    }
  });

  let wsUrl;
  const deadline = Date.now() + 15_000;
  while (!wsUrl && Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) throw new Error("Chrome did not start");

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description).join(" "));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  return { send, consoleErrors, close: () => ws.close() };
}

async function main() {
  await startServer();
  const { send, consoleErrors, close } = await connectChrome();
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.result?.value;
  const waitFor = async (expression, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return true;
      await sleep(100);
    }
    return false;
  };
  const open = async (path) => {
    await send("Page.navigate", { url: `${base}${path}` });
    // Page.navigate returns before the new document replaces the old one, so wait for the
    // new URL; the theme toggle's label changes only after hydration, which signals that
    // React has attached its event handlers.
    const url = JSON.stringify(`${base}${path}`);
    const loaded = await waitFor(
      `location.href === ${url} && document.readyState === "complete" && !!document.querySelector('header button[aria-label^="Switch to"]')`,
      20_000,
    );
    if (!loaded) check(`${path} loads and hydrates`, false, `still at ${await evaluate("location.href")}`);
    return loaded;
  };
  const region = `document.querySelector('[aria-labelledby="requirements-heading"]')`;

  // 0. Data mode, and a real requirement to open.
  await open("/");
  const expectedMode = process.env.EXPECT_DATA_MODE;
  if (expectedMode) {
    const badge = await evaluate(`document.querySelector("header span")?.textContent`);
    check(`runs in ${expectedMode} mode`, badge === MODE_BADGES[expectedMode], `header shows "${badge}"`);
  }
  const detailPath = await evaluate(
    `document.querySelector('a[href^="/requirements/"]')?.getAttribute("href")?.split("?")[0]`,
  );
  check("the table links to a requirement page", typeof detailPath === "string", "no requirement link");

  // 1. Phone width: nothing widens the page.
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  for (const path of ["/", "/?type=AR&status=missing", detailPath ?? "/"]) {
    await open(path);
    const width = await evaluate("document.documentElement.scrollWidth");
    check(`${path} fits a 360px viewport`, width === 360, `scrollWidth ${width}`);
  }

  // 2. Filters: immediate pending feedback, the URL lands, the server filters.
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await open("/");
  // Next.js hydrates the page after the layout (~400 ms vs ~100 ms), so wait until the
  // segment buttons themselves have React's event handlers attached.
  const segmentsHydrated = await waitFor(
    `[...document.querySelectorAll('[aria-label="Filter by coverage status"] button')].every((b) => Object.keys(b).some((k) => k.startsWith("__reactProps")))`,
  );
  check("the filters hydrate", segmentsHydrated, "segment buttons never hydrated");
  const early = await evaluate(`(async () => {
    const segment = (group, name) => [...document.querySelector('[aria-label="' + group + '"]').querySelectorAll("button")]
      .find((b) => b.textContent.trim() === name);
    segment("Filter by type", "FR").click();
    await new Promise((r) => setTimeout(r, 50));
    const pressed = segment("Filter by type", "FR").getAttribute("aria-pressed");
    const busy = ${region}.getAttribute("aria-busy");
    segment("Filter by coverage status", "Missing").click();
    return { pressed, busy };
  })()`);
  check("a filter click shows as pressed and pending within 50 ms", early?.pressed === "true" && early?.busy === "true", JSON.stringify(early));
  const landed = await waitFor(`location.search === "?type=FR&status=missing" && !${region}.hasAttribute("aria-busy")`);
  check("quick consecutive clicks land as one combined URL", landed, await evaluate("location.search"));
  const narrowed = await evaluate(`(() => {
    const rows = [...${region}.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    return {
      count: rows.length,
      matching: rows.every((cells) => cells[1] === "FR" && cells[3] === "Missing"),
      empty: ${region}.textContent.includes("No requirements match these filters"),
    };
  })()`);
  check(
    "FR + Missing shows only FR, missing rows (or the empty state)",
    !!narrowed && narrowed.matching && (narrowed.count > 0 || narrowed.empty),
    JSON.stringify(narrowed),
  );

  await open("/?status=partial&status=missing&sort=updatedAt&order=desc");
  const rows = await evaluate(`[...${region}.querySelectorAll("tbody tr")].map((tr) => ({
    status: tr.children[3].textContent.trim(),
    updated: tr.querySelector("time")?.getAttribute("datetime") ?? "",
  }))`);
  const onlyRequested = Array.isArray(rows) && rows.length > 0 && rows.every((r) => r.status === "Partial" || r.status === "Missing");
  const newestFirst = Array.isArray(rows) && rows.every((r, i) => i === 0 || rows[i - 1].updated >= r.updated);
  check("the server returns only the requested statuses, newest first", onlyRequested && newestFirst, JSON.stringify(rows));

  // 3. Theme: OS preference by default, the toggle overrides it.
  const background = `getComputedStyle(document.body).backgroundColor`;
  const plane = planeColours();
  for (const [label, scheme, stored, expected] of [
    ["OS dark", "dark", null, plane.dark],
    ["OS light", "light", null, plane.light],
    ["toggle dark over OS light", "light", "dark", plane.dark],
  ]) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await open("/");
    await evaluate(stored ? `localStorage.setItem("theme", "${stored}")` : "localStorage.clear()");
    await open("/");
    const actual = await evaluate(background);
    check(`theme: ${label}`, actual === expected, actual);
  }

  check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  close();
}

try {
  await main();
} catch (error) {
  check("browser checks ran", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const child of children) child.kill();
}
console.log(failures.length === 0 ? "\nAll browser checks passed." : `\n${failures.length} browser check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
