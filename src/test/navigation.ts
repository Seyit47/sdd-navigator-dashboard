// @req SCD-FLT-001
// Test double for next/navigation (jsdom only), modelling what the dashboard relies on:
// - router.replace starts a server navigation whose URL change only lands later; tests
//   land it explicitly with commitNavigation().
// - window.history.replaceState changes the URL immediately and useSearchParams follows it.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const listeners = new Set<() => void>();
const realReplaceState = window.history.replaceState.bind(window.history);
let pendingHref: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export const historyReplace = vi.fn((...args: Parameters<History["replaceState"]>) => {
  realReplaceState(...args);
  notify();
});
window.history.replaceState = historyReplace;

/** Simulates a URL change from outside the component (link click, back button, shared link). */
export function setSearch(next: string): void {
  realReplaceState(null, "", `/${next === "" || next.startsWith("?") ? next : `?${next}`}`);
  notify();
}

export const replace = vi.fn((...args: [href: string, options?: { scroll?: boolean }]) => {
  pendingHref = args[0];
});
export const refresh = vi.fn();
export const push = vi.fn();

/** Lands the last router.replace navigation, as the server response would. */
export function commitNavigation(): void {
  if (pendingHref === null) return;
  realReplaceState(null, "", pendingHref);
  pendingHref = null;
  notify();
}

/** The last href passed to router.replace. */
export function lastNavigation(): string | undefined {
  return replace.mock.lastCall?.[0];
}

/** The last URL written with history.replaceState. */
export function lastHref(): string | undefined {
  const url = historyReplace.mock.lastCall?.[2];
  return url === undefined || url === null ? undefined : String(url);
}

export function resetNavigation(): void {
  realReplaceState(null, "", "/");
  pendingHref = null;
  historyReplace.mockClear();
  replace.mockClear();
  refresh.mockClear();
  push.mockClear();
}

export const navigationMock = {
  useSearchParams: () =>
    new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search, () => "")),
  useRouter: () => ({ replace, refresh, push, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  notFound: (): never => {
    throw new Error("NEXT_NOT_FOUND");
  },
};
