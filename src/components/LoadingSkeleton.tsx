// @req SCD-STATE-001
export function LoadingSkeleton({ label, blocks = 3 }: { label: string; blocks?: number }) {
  return (
    <div role="status" className="grid gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} aria-hidden="true" className="h-32 animate-pulse rounded-lg bg-surface" />
      ))}
    </div>
  );
}
