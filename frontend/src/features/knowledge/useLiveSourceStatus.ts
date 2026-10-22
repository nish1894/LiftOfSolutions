import { useOrgQuery } from "@/features/workspace/workspace.ts";
import { isIngesting } from "@/shared/statuses.ts";
import type { KnowledgeSource, SourceStatus } from "@/shared/types.ts";

/**
 * A source's live ingestion state. The list endpoint returns the stored value;
 * the status endpoint asks the RAG service, so poll it only while work is
 * actually running.
 */
export function useLiveSourceStatus(source: KnowledgeSource) {
  const watch = Boolean(source.external_job_id) && isIngesting(source.processing_status);
  const live = useOrgQuery<SourceStatus | null>(
    ["sourceStatus", source.id],
    `/knowledge/sources/${source.id}/status`,
    null,
    {
      enabled: watch,
      refetchInterval: (data) => (data && !isIngesting(data.status) ? false : 5_000),
    },
  );
  return {
    status: live.data?.status ?? source.processing_status,
    serviceUnavailable: live.data?.service_available === false,
  };
}
