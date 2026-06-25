import "server-only";

import { cookies } from "next/headers";
import { VIEW_MODE_COOKIE, parseViewMode, type ViewMode } from "@/lib/mode";

/**
 * The current account **view mode**, read from the persisted cookie. Server
 * components call this to render the correct book (paper vs live) on first
 * paint — so there is no flash of the wrong panel data on toggle.
 *
 * This is a display preference only. It can never open the order gate or change
 * what the engines do (see `@/lib/mode`).
 */
export async function getViewMode(): Promise<ViewMode> {
  const store = await cookies();
  return parseViewMode(store.get(VIEW_MODE_COOKIE)?.value);
}
