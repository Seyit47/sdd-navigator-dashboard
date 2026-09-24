// @req SCD-STATE-002
import Link from "next/link";

export default function RequirementNotFound() {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-6">
      <h2 className="text-lg font-semibold">Requirement not found</h2>
      <p className="mt-2 text-sm text-ink-2">No requirement with this ID exists in the current scan.</p>
      <p className="mt-3">
        <Link href="/" className="text-link hover:underline">
          ← Back to requirements
        </Link>
      </p>
    </div>
  );
}
