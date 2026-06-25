import type { ComponentType } from "react";
import AU from "country-flag-icons/react/3x2/AU";
import BR from "country-flag-icons/react/3x2/BR";
import CA from "country-flag-icons/react/3x2/CA";
import CH from "country-flag-icons/react/3x2/CH";
import CN from "country-flag-icons/react/3x2/CN";
import DE from "country-flag-icons/react/3x2/DE";
import ES from "country-flag-icons/react/3x2/ES";
import FR from "country-flag-icons/react/3x2/FR";
import GB from "country-flag-icons/react/3x2/GB";
import IE from "country-flag-icons/react/3x2/IE";
import IL from "country-flag-icons/react/3x2/IL";
import IN from "country-flag-icons/react/3x2/IN";
import IT from "country-flag-icons/react/3x2/IT";
import JP from "country-flag-icons/react/3x2/JP";
import KR from "country-flag-icons/react/3x2/KR";
import MX from "country-flag-icons/react/3x2/MX";
import NL from "country-flag-icons/react/3x2/NL";
import SE from "country-flag-icons/react/3x2/SE";
import TW from "country-flag-icons/react/3x2/TW";
import US from "country-flag-icons/react/3x2/US";
import { countryCode } from "@/lib/format";

/**
 * A crisp SVG country flag (via `country-flag-icons`) — replaces the emoji flag,
 * which renders inconsistently across platforms. Only the countries we map are
 * imported (tree-shaken), so the bundle carries a small set, not every flag.
 * Decorative + labelled: the SVG `title` announces the country to assistive tech.
 */
// The flag components accept `title` + `className` (plus more); type to the
// minimal props we pass and cast the lookup, since the package's own prop type
// is non-standard.
type FlagComponent = ComponentType<{ title?: string; className?: string }>;

const FLAGS = {
  AU,
  BR,
  CA,
  CH,
  CN,
  DE,
  ES,
  FR,
  GB,
  IE,
  IL,
  IN,
  IT,
  JP,
  KR,
  MX,
  NL,
  SE,
  TW,
  US,
} as unknown as Record<string, FlagComponent>;

export function CountryFlag({
  country,
  className = "h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-line",
}: {
  country: string | null;
  className?: string;
}) {
  const code = countryCode(country);
  if (!code) return null;
  const Flag = FLAGS[code];
  if (!Flag) return null;
  return <Flag title={country ?? code} className={className} />;
}
