import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { PwaBoot } from "@/components/pwa";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MONICAL Ops",
  description: "Điều phối vận hành MONICAL hotel dalat — không thay thế ezCloudhotel PMS",
  applicationName: "MONICAL Ops",
  icons: { icon: "/logo.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "MONICAL Ops", statusBarStyle: "black-translucent" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#5c1a1b",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnam.variable} h-full antialiased`}>
      <body className="min-h-full bg-sand font-sans text-ink">
        <PwaBoot />
        {children}
      </body>
    </html>
  );
}
