// @req SCD-STATE-001
export function LoadingSkeleton({ label, blocks = 3 }: { label: string; blocks?: number }) {
  return (
    <div role="status" className="grid grid-cols-1 gap-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: blocks }, (_, index) => (
        <div key={index} aria-hidden="true" className="h-28 animate-pulse rounded-xl bg-surface shadow-card" />
      ))}
    </div>
  );
}
