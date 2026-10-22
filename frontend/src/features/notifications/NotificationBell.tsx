import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu.tsx";
import { cn, timeAgo } from "@/lib/utils.ts";
import { apiRequest } from "@/shared/api/client.ts";
import { notificationsKey, useNotifications } from "@/shared/queries.ts";
import type { Notification } from "@/shared/types.ts";

/* The label of each notification type's action; null means no action. */
const ACTIONS: Record<string, string | null> = {
  "join_request.created": "Review request",
  "join_request.approved": "Open workspace",
  "join_request.rejected": null,
};

interface NotificationBellProps {
  onOpenSection?: (section: string, organizationId: string | null) => void;
  onChanged?: () => Promise<unknown>;
}

export default function NotificationBell({ onOpenSection, onChanged }: NotificationBellProps) {
  const { data, error, refetch } = useNotifications();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationsKey });

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
    // An approval changes the viewer's own memberships, so the account needs
    // to refetch before the new workspace can be selected.
    if (notification.type === "join_request.approved") await onChanged?.();
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void refetch();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-primary px-1 text-xs leading-4 font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Notifications">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="link" className="text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {error && <p className="px-4 py-6 text-sm text-danger">{error.message}</p>}
        {!error && items.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        )}

        <ul className="max-h-96 divide-y overflow-y-auto">
          {items.map((notification) => {
            const action = ACTIONS[notification.type] ?? null;
            return (
              <li
                key={notification.id}
                className={cn("grid gap-1 px-4 py-3", !notification.read && "bg-accent/40")}
              >
                <p className="text-sm font-medium">{notification.title}</p>
                <p className="text-sm text-muted-foreground">{notification.body}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{timeAgo(notification.created_at)}</span>
                  {notification.section && action && (
                    <Button
                      variant="link"
                      className="text-xs"
                      onClick={() => activate(notification)}
                    >
                      {action}
                    </Button>
                  )}
                  {!notification.read && (
                    <Button
                      variant="link"
                      className="text-xs"
                      onClick={() => markRead(notification)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
