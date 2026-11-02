import { type ReactNode, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthContext.ts";
import WorkspaceSetup from "@/features/workspace/WorkspaceSetup.tsx";
import TermsGate from "@/features/workspace/TermsGate.tsx";
import InvitationVerificationGate from "@/features/workspace/InvitationVerificationGate.tsx";
import { hasPermission } from "@/shared/permissions.ts";

import { WorkspaceContext, type WorkspaceValue } from "./workspace.ts";

const STORAGE_KEY = "chatbot-active-business";
const PROJECT_STORAGE_KEY = "chatbot-active-project";

function readStoredBusiness(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Picks the active organization, or shows setup when the user has none. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, memberships, projects } = useAuth();
  const location = useLocation();
  const [activeId, setActiveId] = useState(
    () => readStoredBusiness() || user?.default_organization_id || null,
  );
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      return localStorage.getItem(PROJECT_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const membership = memberships.find((item) => item.business_id === activeId) ?? memberships[0];
  const availableProjects = projects.filter(
    (item) => item.org_id === membership?.business_id && item.status !== "deleted",
  );
  const project =
    availableProjects.find((item) => item.id === activeProjectId) ?? availableProjects[0];

  const value = useMemo<WorkspaceValue | null>(() => {
    if (!user || !membership || !project) return null;
    return {
      user,
      membership,
      memberships,
      projects: availableProjects,
      businessId: membership.business_id,
      projectId: project.id,
      can: (permission) => {
        if (
          /^(agents|customers|conversations|channels|knowledge|integrations|tools|analytics|usage)\./.test(
            permission,
          )
        ) {
          const key = permission.replace(/^customers\./, "contacts.");
          return project.effective_permissions.includes(key);
        }
        return hasPermission(membership, permission);
      },
      selectBusiness: (businessId) => {
        setActiveId(businessId);
        try {
          localStorage.setItem(STORAGE_KEY, businessId);
        } catch {
          // Storage can be blocked; the switch still applies for this visit.
        }
      },
      selectProject: (projectId) => {
        setActiveProjectId(projectId);
        try {
          localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
        } catch {
          /* Optional local preference. */
        }
      },
    };
  }, [user, membership, memberships, project, availableProjects]);

  if (user?.terms_required)
    return <TermsGate version={user.current_terms_version ?? ""} url={user.terms_url ?? null} />;
  if (user && !user.email_verified && new URLSearchParams(location.search).has("invite"))
    return <InvitationVerificationGate />;
  if (!value) return <WorkspaceSetup />;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
