import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AnalyticsConsent } from "@/components/shared/analytics-consent";
import { CookieBanner } from "@/components/shared/cookie-banner";
import { appConfig } from "@/lib/config";
import { marketingThemeBootstrapScript } from "@/lib/marketing-theme";

import "./globals.css";

const barlow = localFont({
  src: [
    { path: "../../public/fonts/Barlow-Regular.ttf", weight: "400" },
    { path: "../../public/fonts/Barlow-Medium.ttf", weight: "500" },
    { path: "../../public/fonts/Barlow-SemiBold.ttf", weight: "600" },
    { path: "../../public/fonts/Barlow-Bold.ttf", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

const rajdhani = localFont({
  src: [
    { path: "../../public/fonts/Rajdhani-Medium.ttf", weight: "500" },
    { path: "../../public/fonts/Rajdhani-SemiBold.ttf", weight: "600" },
    { path: "../../public/fonts/Rajdhani-Bold.ttf", weight: "700" },
  ],
  variable: "--font-rajdhani",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F9FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1114" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(appConfig.siteUrl),
  title: { default: "V3l0city — Drive data, in focus", template: "%s | V3l0city" },
  description: "A focused driving dashboard for your browser and native device, built around privacy and calm, readable trip data.",
  applicationName: "V3l0city",
  keywords: ["driving dashboard", "trip history", "speed insights", "privacy-first driving data", "manual trip recording"],
  creator: "V3l0city",
  publisher: appConfig.legalEntityName,
  category: "UtilitiesApplication",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "V3l0city", title: "V3l0city — Drive data, in focus", description: "A focused, privacy-minded driving dashboard.", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "V3l0city driving dashboard" }] },
  twitter: { card: "summary_large_image", title: "V3l0city — Drive data, in focus", description: "A focused, privacy-minded driving dashboard.", images: ["/opengraph-image"] },
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${barlow.variable} ${rajdhani.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: marketingThemeBootstrapScript }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
        <CookieBanner />
        <AnalyticsConsent />
      </body>
    </html>
  );
}
