import type { ComponentType, SVGProps } from "react";
import {
  ChatIcon,
  CoachingIcon,
  EvaluationIcon,
  JournalIcon,
  LogsIcon,
  NewsIcon,
  OperationsIcon,
  OverviewIcon,
  PositionsIcon,
  ProposalsIcon,
  RoutinesIcon,
  StrategyIcon,
} from "@/components/icons";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Primary navigation. The views themselves land in later Phase 1 milestones
 * (M3); M1 ships the shell + navigable placeholder routes.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: OverviewIcon },
  { label: "Positions", href: "/positions", icon: PositionsIcon },
  { label: "Decision Journal", href: "/journal", icon: JournalIcon },
  { label: "Coaching", href: "/coaching", icon: CoachingIcon },
  { label: "Proposals", href: "/proposals", icon: ProposalsIcon },
  { label: "News", href: "/news", icon: NewsIcon },
  { label: "Strategy", href: "/strategy", icon: StrategyIcon },
  { label: "Chat", href: "/chat", icon: ChatIcon },
  { label: "Routines", href: "/routines", icon: RoutinesIcon },
  { label: "Logs", href: "/logs", icon: LogsIcon },
  { label: "Operations", href: "/operations", icon: OperationsIcon },
  { label: "Evaluation", href: "/evaluation", icon: EvaluationIcon },
];
