// @req SCD-VAL-002, SCD-A11Y-001, SCD-UI-007, SCD-THEME-001, SCD-DEP-002
// Browser checks that jsdom cannot do: layout at phone width, pending filter feedback,
// server-side filtering, theme switching, and no console errors.
// Usage: pnpm build && pnpm check:browser        (starts `next start` on a free port)
//        BASE_URL=https://example.app pnpm check:browser   (checks a deployment)
// Needs Chrome (CHROME_PATH, default "google-chrome"). Exit code 1 if any check fails.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3939;
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

  // 1. Phone width: nothing widens the page.
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  for (const path of ["/", "/?type=AR&status=missing", "/requirements/FR-API-002"]) {
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
  const empty = await evaluate(`document.body.textContent.includes("No requirements match these filters")`);
  check("FR + missing shows the empty state", empty, "no empty state");

  await open("/?status=partial&status=missing&sort=updatedAt&order=desc");
  const ids = await evaluate(`[...${region}.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent)`);
  check("the server returns filtered, sorted rows", JSON.stringify(ids) === JSON.stringify(["AR-SEC-001", "FR-API-003", "AR-PERF-001"]), JSON.stringify(ids));

  // 3. Theme: OS preference by default, the toggle overrides it.
  const background = `getComputedStyle(document.body).backgroundColor`;
  for (const [label, scheme, stored, expected] of [
    ["OS dark", "dark", null, "rgb(14, 14, 13)"],
    ["OS light", "light", null, "rgb(250, 250, 249)"],
    ["toggle dark over OS light", "light", "dark", "rgb(14, 14, 13)"],
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
