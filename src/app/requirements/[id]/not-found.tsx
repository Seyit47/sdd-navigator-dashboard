// @req SCD-STATE-002, SCD-UI-007
import Link from "next/link";

export default function RequirementNotFound() {
  return (
    <div className="surface-card p-8 text-center">
      <h2 className="text-lg font-semibold">Requirement not found</h2>
      <p className="mt-2 text-sm text-ink-2">No requirement with this ID exists in the current scan.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-link hover:underline">
        Back to requirements
      </Link>
    </div>
  );
}
