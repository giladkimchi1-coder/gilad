import type { Metadata, Viewport } from "next";
import { Assistant, IBM_Plex_Mono, Secular_One } from "next/font/google";
import "./globals.css";

const body = Assistant({ variable: "--font-body", subsets: ["hebrew", "latin"], weight: ["400", "600", "700"] });
const display = Secular_One({ variable: "--font-display", subsets: ["hebrew", "latin"], weight: "400" });
const num = IBM_Plex_Mono({ variable: "--font-num", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "יומן אתר בינפלד",
  description: "ניהול אתר בנייה – יומן עבודה, גאנט, תעודות, תקציב והזמנות רכש",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "יומן אתר", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1E262C",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${body.variable} ${display.variable} ${num.variable}`}>{children}</body>
    </html>
  );
}
