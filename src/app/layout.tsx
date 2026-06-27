import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/header";
import { LiveBanner } from "@/components/live-banner";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Serif display face for titles / headlines / editorial moments (never numbers
// or labels — see .agents/design-system.md). Fraunces is a variable serif with
// an optical-size axis so it reads as a premium display face at title sizes
// while staying legible on small card titles.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Trading Cockpit",
  description: "Local paper-only trading research dashboard.",
};

// Applied before paint so the correct theme is set with no flash of the wrong
// palette. Honors an explicit saved choice, else the OS preference.
const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-surface text-fg">
        {/* No-flash theme bootstrap. `beforeInteractive` injects this into the
            initial server HTML so it runs before paint — keeping the no-flash
            behavior — while avoiding React 19's inline-<script> warning that a
            raw <script> in the component tree triggers on client renders. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <div className="flex h-dvh overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <LiveBanner />
            {/* Fluid full-width shell: comfortable 24–32px gutters, capped at
                1800px on ultra-wide so line lengths stay sane. The inner
                wrapper carries the height chain (flex-1) so pages that fill the
                viewport — e.g. chat — keep a definite height for h-full. */}
            <main className="flex flex-1 flex-col overflow-y-auto px-6 py-6 md:px-8 md:py-8">
              <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col">
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
