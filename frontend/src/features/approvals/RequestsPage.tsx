import { LoadingRows, PageContainer, PageHeader } from "@/components/app/page.tsx";
import { useAuth } from "@/features/auth/AuthContext.ts";
import { useOrgQuery, useWorkspace } from "@/features/workspace/workspace.ts";
import { useReviewJoinRequest } from "@/shared/queries.ts";
import type { JoinRequest } from "@/shared/types.ts";

import ApprovalsDashboard from "./ApprovalsDashboard.tsx";

export default function RequestsPage() {
  const { membership, businessId, can } = useWorkspace();
  const { refreshAuth } = useAuth();
  const canManage = can("organization.members.manage");
  const requests = useOrgQuery<JoinRequest[]>(["joinRequests"], "/join-requests", [], {
    enabled: canManage,
  });
  // Deliberately not caught here: the row shows the failure where it happened.
  const review = useReviewJoinRequest(businessId, { onSettled: refreshAuth });

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Access requests"
        description="People who entered your organization's join code and are waiting to be let in."
      />
      {requests.isLoading ? (
        <LoadingRows />
      ) : (
        <ApprovalsDashboard
          membership={membership}
          joinRequests={requests.data ?? []}
          canManage={canManage}
          onReview={(requestId, decision, role) =>
            review.mutateAsync({ requestId, decision, role }).then(() => undefined)
          }
        />
      )}
    </PageContainer>
  );
}
