import type { Metadata, Viewport } from "next";
import { Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

// 路線號碼與分鐘數用的窄體，像站牌上的路線牌
const signFace = Barlow_Semi_Condensed({
  variable: "--font-sign-face",
  weight: ["600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "公車路線圖",
  description: "在地圖上查看全台公車與公路客運的行駛路線、站牌與即時動態",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9edf3" },
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${signFace.variable} h-full antialiased`}>
      <body className="h-full overflow-clip font-sans">{children}</body>
    </html>
  );
}
