import type { ReactNode } from "react";

import EmptyState from "./EmptyState.tsx";

interface ResourceListProps<T> {
  items: T[];
  empty: ReactNode;
  render: (item: T, index: number) => ReactNode;
}

export default function ResourceList<T>({ items, empty, render }: ResourceListProps<T>) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return <div className="resource-list">{items.map(render)}</div>;
}
