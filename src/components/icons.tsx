import type { ComponentType, SVGProps } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  type LucideProps,
  MessageSquare,
  Moon,
  Newspaper,
  NotebookPen,
  RefreshCw,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";

/**
 * App icon set — a single library (lucide-react), exported under semantic
 * names so call-sites stay stable. Every icon inherits `currentColor`, shares
 * one stroke width, and defaults to a 20px square; pass `className` to resize
 * (e.g. `size-4` inline, `size-5` nav). See `.agents/design-system.md`
 * → "Iconography".
 */
type IconProps = SVGProps<SVGSVGElement>;

function lucideIcon(
  Lucide: ComponentType<LucideProps>,
): ComponentType<IconProps> {
  function Icon({ className = "size-5", ...rest }: IconProps) {
    return (
      <Lucide
        className={className}
        strokeWidth={1.75}
        aria-hidden
        {...(rest as LucideProps)}
      />
    );
  }
  Icon.displayName = "Icon";
  return Icon;
}

// Navigation
export const OverviewIcon = lucideIcon(LayoutDashboard);
export const PositionsIcon = lucideIcon(BarChart3);
export const JournalIcon = lucideIcon(NotebookPen);
export const CoachingIcon = lucideIcon(GraduationCap);
export const NewsIcon = lucideIcon(Newspaper);
export const ProposalsIcon = lucideIcon(Lightbulb);
export const StrategyIcon = lucideIcon(Target);
export const RoutinesIcon = lucideIcon(RefreshCw);
export const LogsIcon = lucideIcon(ScrollText);
export const ChatIcon = lucideIcon(MessageSquare);
export const EvaluationIcon = lucideIcon(ClipboardCheck);
export const OperationsIcon = lucideIcon(SlidersHorizontal);
export const GoLiveIcon = lucideIcon(ShieldCheck);
export const RiskIcon = lucideIcon(ShieldAlert);

// Theme toggle
export const SunIcon = lucideIcon(Sun);
export const MoonIcon = lucideIcon(Moon);

// Finance / KPI + delta pills
export const WalletIcon = lucideIcon(Wallet);
export const BanknotesIcon = lucideIcon(Banknote);
export const ZapIcon = lucideIcon(Zap);
export const ScaleIcon = lucideIcon(Scale);
export const TrendingUpIcon = lucideIcon(TrendingUp);
export const TrendingDownIcon = lucideIcon(TrendingDown);
export const ArrowUpRightIcon = lucideIcon(ArrowUpRight);
export const ArrowDownRightIcon = lucideIcon(ArrowDownRight);
export const XIcon = lucideIcon(X);
