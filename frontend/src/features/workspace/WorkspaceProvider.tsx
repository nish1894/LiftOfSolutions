import { type ReactNode, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/AuthContext.ts";
import WorkspaceSetup from "@/features/workspace/WorkspaceSetup.tsx";
import { hasPermission } from "@/shared/permissions.ts";

import { WorkspaceContext, type WorkspaceValue } from "./workspace.ts";

const STORAGE_KEY = "chatbot-active-business";

function readStoredBusiness(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Picks the active organization, or shows setup when the user has none. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, memberships } = useAuth();
  const [activeId, setActiveId] = useState(
    () => readStoredBusiness() || user?.default_organization_id || null,
  );

  const membership = memberships.find((item) => item.business_id === activeId) ?? memberships[0];

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!user || !membership) return null;
    return {
      user,
      membership,
      memberships,
      businessId: membership.business_id,
      can: (permission) => hasPermission(membership, permission),
      selectBusiness: (businessId) => {
        setActiveId(businessId);
        try {
          localStorage.setItem(STORAGE_KEY, businessId);
        } catch {
          // Storage can be blocked; the switch still applies for this visit.
        }
      },
    };
  }, [user, membership, memberships]);

  if (!value) return <WorkspaceSetup />;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
