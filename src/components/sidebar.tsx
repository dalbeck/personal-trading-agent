"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Left navigation rail. Icon-only on small screens (w-16); icon + label on
 * md+ (w-60). Active route is highlighted and marked `aria-current="page"`.
 */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-16 shrink-0 flex-col border-r border-line bg-surface-raised md:w-64">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-3 md:px-5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 18 L10 11 L14 15 L20 6" />
          </svg>
        </span>
        <span className="hidden text-sm font-semibold tracking-tight text-fg md:inline">
          Trading Cockpit
        </span>
      </div>

      <nav
        aria-label="Primary"
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3"
      >
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={label}
              className={[
                "flex items-center gap-3 rounded-input px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out",
                "max-md:justify-center",
                active
                  ? "bg-accent/10 text-fg"
                  : "text-fg-muted hover:bg-surface-overlay hover:text-fg",
              ].join(" ")}
            >
              <Icon
                className={`size-5 shrink-0 ${active ? "text-accent" : ""}`}
              />
              <span className="hidden truncate md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-line p-3 text-xs text-fg-muted md:block">
        <p className="text-pretty leading-relaxed">
          Live · human-approved.
          <br />
          No order placed without your approval.
        </p>
      </div>
    </aside>
  );
}
