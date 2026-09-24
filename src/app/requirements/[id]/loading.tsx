// @req SCD-STATE-001
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function Loading() {
  return <LoadingSkeleton label="Loading requirement…" blocks={3} />;
}
