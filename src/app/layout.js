import { Barlow, Barlow_Condensed, Geist_Mono, Big_Shoulders } from "next/font/google";
import "./globals.css";
import GlobalErrorReporter from "./GlobalErrorReporter";
import AppShell from "./AppShell";

// ============================================================================
// OFF-SEASON LOCK
// Set to true to close the entire app for the off-season. Every page — home,
// admin, post, display, all of it — is replaced by the closed screen below,
// so nobody can log games, change settings, or touch any data over the winter.
// The database stays frozen and untouched. Set back to false next summer to
// reopen the app exactly as it was.
// ============================================================================
const OFF_SEASON = true;

// UI face: Barlow, the DIN-flavoured sports workhorse for body, forms, tables.
const barlow = Barlow({
  variable: "--font-ui",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

// Label face: Barlow Condensed for nav, tags, table heads, scoreboard captions.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-label",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Scoreboard face: condensed, engineered numerals and page titles. Used via
// .bc-display / .bc-num / .bc-page-title, never for running text.
const bigShoulders = Big_Shoulders({
  variable: "--font-display",
  axes: ["opsz"],
  adjustFontFallback: false,
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Crest League Live",
  description: "Live scoring, standings, stat leaders, highlights.",
  applicationName: "Crest League Live",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Crest Live",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#050D1C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable} ${bigShoulders.variable} antialiased`}>
        {OFF_SEASON ? (
          <div
            data-theme="night"
            style={{
              minHeight: "100vh", display: "flex", flexDirection: "column",
              justifyContent: "flex-end", padding: "32px 24px 48px",
              background: "var(--paper)", color: "var(--ink)",
            }}
          >
            <div style={{ maxWidth: 960, width: "100%", margin: "0 auto" }}>
              <div style={{
                fontSize: 14, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "var(--ink-2)",
                borderBottom: "2px solid var(--ink)", paddingBottom: 12, marginBottom: 24,
              }}>
                Camp Bauercrest &middot; Crest League Live
              </div>
              <h1 className="bc-display" style={{
                fontSize: "clamp(56px, 14vw, 160px)", lineHeight: 0.9, margin: 0,
              }}>
                See you<br />next summer
              </h1>
              <p style={{ fontSize: 18, color: "var(--ink-2)", maxWidth: 480, marginTop: 24 }}>
                Crest League Live is closed for the season. Thanks for an incredible summer of camp sports.
              </p>
              <div className="bc-num" style={{ marginTop: 32, fontSize: 28, color: "var(--ink-3)" }}>
                2026 season complete
              </div>
            </div>
          </div>
        ) : (
        <>
        <GlobalErrorReporter />
        <AppShell>{children}</AppShell>
        </>
        )}
      </body>
    </html>
  );
}