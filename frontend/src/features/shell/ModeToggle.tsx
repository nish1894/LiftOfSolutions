import { useSyncExternalStore } from "react";
import { ChevronDownIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu.tsx";
import { setTheme } from "@/shared/theme.ts";

// Other theme controls and the system preference use the same root class.
function subscribeToAppearance(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** A tactile day/night switch; the existing menu keeps System available. */
export default function ModeToggle() {
  const dark = useSyncExternalStore(subscribeToAppearance, isDark, () => false);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-label="Dark mode"
        aria-checked={dark}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="theme-switch"
      >
        <span className="theme-switch-thumb" aria-hidden="true">
          <SunIcon className="theme-switch-sun" />
          <MoonIcon className="theme-switch-moon" />
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="w-6"
            aria-label="Change theme"
            title="Theme options"
          >
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuItem onSelect={() => setTheme("light")}>
            <SunIcon />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme("dark")}>
            <MoonIcon />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTheme("system")}>
            <MonitorIcon />
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
