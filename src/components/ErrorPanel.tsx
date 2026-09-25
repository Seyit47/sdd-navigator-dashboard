"use client";
// @req SCD-STATE-002
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/api";

export function ErrorPanel({ title, error }: { title: string; error: ApiError }) {
  const router = useRouter();
  return (
    <div role="alert" className="surface-card border-l-4 border-critical p-5">
      <p className="font-semibold">
        <span aria-hidden="true">✕ </span>
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-2">{error.message}</p>
      {error.kind === "invalid_response" && error.issues.length > 0 ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">Details</summary>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {error.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-3 rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink hover:text-ink-2"
      >
        Retry
      </button>
    </div>
  );
}
