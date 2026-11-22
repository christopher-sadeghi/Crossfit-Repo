import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/pwa/register";
import { Geist, Geist_Mono } from "next/font/google";
import { TimeZoneSync } from "@/components/time-zone-sync";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FitCoach AI",
  description: "Coaching platform for CrossFit coaches",
  appleWebApp: { capable: true, title: "FitCoach AI" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#171717" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <TimeZoneSync />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
