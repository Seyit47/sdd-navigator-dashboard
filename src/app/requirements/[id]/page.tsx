// @req SCD-UI-004, SCD-STATE-002
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ErrorPanel } from "@/components/ErrorPanel";
import { RequirementDetailView } from "@/components/RequirementDetailView";
import { getRequirement } from "@/lib/api";
import { parseDashboardQuery, searchParamsFromRecord, serializeDashboardQuery } from "@/lib/dashboard/query";

export default async function RequirementPage({ params, searchParams }: PageProps<"/requirements/[id]">) {
  await connection();
  const [{ id }, search] = await Promise.all([params, searchParams]);
  // Only recognised filters survive the round trip back to the table.
  const backHref = `/${serializeDashboardQuery(parseDashboardQuery(searchParamsFromRecord(search)))}`;

  const result = await getRequirement(id);
  if (!result.ok) {
    if (result.error.kind === "not_found") notFound();
    return <ErrorPanel title="Couldn't load this requirement" error={result.error} />;
  }
  return <RequirementDetailView requirement={result.data} backHref={backHref} />;
}
