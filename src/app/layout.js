import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Top App Bar */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "rgba(8, 23, 44, 0.85)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div
            className="bc-container"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>
              Crest League Live
            </div>

            <div className="bc-faint" style={{ fontSize: 12 }}>
              Created By Ethan Esterson
            </div>

            {/* Nav links */}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 14,
                alignItems: "center",
              }}
            >
              <a className="bc-muted" href="/" style={{ fontSize: 14 }}>
                Home
              </a>

              <a className="bc-muted" href="/standings" style={{ fontSize: 14 }}>
                Standings
              </a>

              <a className="bc-muted" href="/leaders" style={{ fontSize: 14 }}>
                Leaders
              </a>

              <a className="bc-muted" href="/display" style={{ fontSize: 14 }}>
                Display
              </a>

              <a className="bc-muted" href="/highlights" style={{ fontSize: 14 }}>
                Highlights
              </a>

              <a className="bc-muted" href="/admin" style={{ fontSize: 14 }}>
                Admin
              </a>

              <a className="bc-muted" href="/install" style={{ fontSize: 14 }}>
                Install
              </a>

              <a className="bc-muted" href="/post" style={{ fontSize: 14 }}>
                Post Games
              </a>


              {/* Next later:
                  - Stat Leaders
                  - Display Board
              */}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="bc-container">{children}</main>

        {/* Footer */}
        <footer
          className="bc-container bc-faint"
          style={{ paddingTop: 24, paddingBottom: 24, fontSize: 12 }}
        >
          Built for Camp Bauercrest — Crest League Live
        </footer>
      </body>
    </html>
  );
}
