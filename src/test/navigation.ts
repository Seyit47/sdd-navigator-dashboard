// @req SCD-FLT-001
// Test double for next/navigation: an in-memory URL whose changes re-render subscribers,
// so components can be exercised end to end without the Next.js router.
import { useSyncExternalStore } from "react";
import { vi } from "vitest";

let search = "";
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function setSearch(next: string): void {
  search = next === "" || next.startsWith("?") ? next : `?${next}`;
  notify();
}

export const replace = vi.fn((...args: [href: string, options?: { scroll?: boolean }]) => {
  const href = args[0];
  const index = href.indexOf("?");
  search = index === -1 ? "" : href.slice(index);
  notify();
});
export const refresh = vi.fn();
export const push = vi.fn();

export function lastHref(): string | undefined {
  return replace.mock.lastCall?.[0];
}

export function resetNavigation(): void {
  search = "";
  replace.mockClear();
  refresh.mockClear();
  push.mockClear();
}

export const navigationMock = {
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => search, () => search)),
  useRouter: () => ({ replace, refresh, push, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  notFound: (): never => {
    throw new Error("NEXT_NOT_FOUND");
  },
};
