import { FileTextIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu.tsx";
import { describeCitation } from "@/shared/citations.ts";
import type { Citation } from "@/shared/types.ts";

/* Shown under every AI answer. An answer without sources says so plainly:
   "answers with the source attached" is the product's promise. */
export function Citations({ citations }: { citations: Citation[] }) {
  if (!citations.length) {
    return <p className="mt-2 text-xs text-muted-foreground">No source attached</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>Sources</span>
      {citations.map((citation, index) => {
        const info = describeCitation(citation, index);
        return (
          <Popover key={index}>
            <PopoverTrigger
              className="inline-flex h-5 max-w-52 items-center gap-1 rounded-sm border border-citation-border bg-citation-bg px-1.5 font-medium text-citation"
              aria-label={`Source ${index + 1}: ${info.title}`}
            >
              <span className="tabular-nums">{index + 1}</span>
              <span className="truncate">{info.title}</span>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-72 gap-1 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <FileTextIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {info.title}
              </p>
              {info.location && <p className="text-xs text-muted-foreground">{info.location}</p>}
              {info.snippet && (
                <blockquote className="mt-1 border-l-2 pl-2 text-sm text-muted-foreground">
                  {info.snippet}
                </blockquote>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}
