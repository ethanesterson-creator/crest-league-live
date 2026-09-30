import { Geist, Geist_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";
import GlobalErrorReporter from "./GlobalErrorReporter";
import SiteHeader from "./SiteHeader";

// ============================================================================
// OFF-SEASON LOCK
// Set to true to close the entire app for the off-season. Every page — home,
// admin, post, display, all of it — is replaced by the closed screen below,
// so nobody can log games, change settings, or touch any data over the winter.
// The database stays frozen and untouched. Set back to false next summer to
// reopen the app exactly as it was.
// ============================================================================
const OFF_SEASON = true;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Condensed, all-caps display face for hero headlines, scoreboard numbers,
// and page titles -- the app's one deliberately loud typographic choice.
// Body copy stays on Geist Sans; this is only ever used via .bc-display /
// .bc-page-title, never for running text.
const bebasNeue = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
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
  themeColor: "#0B1B3A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} antialiased`}>
        {OFF_SEASON ? (
          <div style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", textAlign: "center",
            padding: "24px",
            background: "radial-gradient(circle at 50% 30%, #12305c 0%, #0b1f3b 50%, #050d1c 100%)",
            color: "#fff",
          }}>
            <div style={{ fontSize: "72px" }}>🏆</div>
            <div style={{
              fontSize: "14px", fontWeight: 900, letterSpacing: "0.5em",
              textTransform: "uppercase", color: "#f5c451", marginTop: "8px",
            }}>
              Camp Bauercrest
            </div>
            <h1 style={{
              fontSize: "clamp(40px, 8vw, 84px)", fontWeight: 900, lineHeight: 1.05,
              margin: "12px 0", fontFamily: "Georgia, serif",
              background: "linear-gradient(180deg, #ffe9a8, #f5c451 55%, #b8860b)",
              WebkitBackgroundClip: "text", backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              See You Next Summer
            </h1>
            <div style={{ fontSize: "18px", color: "rgba(255,255,255,0.6)", fontWeight: 600, maxWidth: "480px" }}>
              Crest League Live is closed for the season. Thanks for an incredible summer of camp sports.
            </div>
            <div style={{
              marginTop: "28px", fontSize: "13px", fontWeight: 800,
              letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,196,81,0.6)",
            }}>
              2026 Season Complete
            </div>
          </div>
        ) : (
        <>
        <GlobalErrorReporter />
        <SiteHeader />

        {/* Page content */}
        <main className="bc-container">{children}</main>

        {/* Footer */}
        <footer
          className="bc-container bc-faint"
          style={{ paddingTop: 24, paddingBottom: 32, fontSize: 12, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
        >
          <span>Built for Camp Bauercrest — Crest League Live</span>
          <span>Created by Ethan Esterson</span>
        </footer>
        </>
        )}
      </body>
    </html>
  );
}