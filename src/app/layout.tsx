import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
      className={`${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-surface text-fg">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <div className="flex h-dvh overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
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
