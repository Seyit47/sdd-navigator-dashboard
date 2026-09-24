// @req SCD-FLT-001
// Test double for next/navigation (jsdom only). It models the real behaviour the dashboard
// relies on: useSearchParams follows window.history.replaceState immediately, while
// router.replace is a server navigation whose URL change would only land after a server
// render — so here it deliberately does not change the URL at all.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

const listeners = new Set<() => void>();
const realReplaceState = window.history.replaceState.bind(window.history);

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

export const replace = vi.fn();
export const refresh = vi.fn();
export const push = vi.fn();

/** The last URL the component wrote with history.replaceState. */
export function lastHref(): string | undefined {
  const url = historyReplace.mock.lastCall?.[2];
  return url === undefined || url === null ? undefined : String(url);
}

export function resetNavigation(): void {
  realReplaceState(null, "", "/");
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
