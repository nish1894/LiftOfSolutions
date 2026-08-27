import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../shared/api/client.ts";
import type { Notification, NotificationType } from "../../shared/types.ts";
import { useNotifications, workspaceKeys } from "../platform/queries.ts";

/* Each notification type carries the section its "View" action should open.
   The backend sends `section`; these are the labels and glyphs for it. */
const TYPE_META: Record<NotificationType, { glyph: string; action: string | null }> = {
  "join_request.created": { glyph: "\u{1F464}", action: "Review request" },
  "join_request.approved": { glyph: "\u2705", action: "Open workspace" },
  "join_request.rejected": { glyph: "\u{1F6AB}", action: null },
};

function relativeTime(value: string | null | undefined) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface NotificationBellProps {
  onOpenSection?: (section: string, organizationId: string | null) => void;
  onChanged?: () => Promise<unknown>;
}

export default function NotificationBell({ onOpenSection, onChanged }: NotificationBellProps) {
  // Polling, refetch-on-focus and cache invalidation all come from the query
  // layer now; this component only owns the popover.
  const { data, error, refetch } = useNotifications();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKeys.notifications() });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function markRead(notification: Notification) {
    if (notification.read) return;
    try {
      await apiRequest(`/api/v1/notifications/${notification.id}/read`, { method: "POST" });
    } finally {
      await invalidate();
    }
  }

  async function markAllRead() {
    try {
      await apiRequest("/api/v1/notifications/read-all", { method: "POST" });
    } finally {
      await invalidate();
    }
  }

  async function activate(notification: Notification) {
    await markRead(notification);
    setOpen(false);
    if (notification.section) onOpenSection?.(notification.section, notification.organization_id);
    // An approval changes the viewer's own memberships, so the shell needs to
    // refetch before the new workspace can be selected.
    if (notification.type === "join_request.approved") await onChanged?.();
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) refetch();
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="notification-count">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="link-button" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {error && <p className="notification-empty error-text">{error.message}</p>}
          {!error && items.length === 0 && (
            <p className="notification-empty">You are all caught up.</p>
          )}

          <ul className="notification-list">
            {items.map((notification) => {
              const meta = TYPE_META[notification.type] ?? { glyph: "\u2022", action: null };
              return (
                <li key={notification.id} className={notification.read ? "" : "is-unread"}>
                  <span className="notification-glyph" aria-hidden="true">
                    {meta.glyph || "•"}
                  </span>
                  <div>
                    <strong>{notification.title}</strong>
                    <p>{notification.body}</p>
                    <div className="notification-meta">
                      <span>{relativeTime(notification.created_at)}</span>
                      {notification.section && meta.action && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => activate(notification)}
                        >
                          {meta.action}
                        </button>
                      )}
                      {!notification.read && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => markRead(notification)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
