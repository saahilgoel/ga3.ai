import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ga3.ai"),
  title: {
    default: "GA3 — You don't hate your data. You hate opening GA4.",
    template: "%s · GA3",
  },
  description:
    "GA3 brings back the Google Analytics dashboard you could actually read — then lets you just ask. Real answers, real charts, plain English. Read-only, set up in 30 seconds.",
  applicationName: "GA3",
  keywords: [
    "GA3",
    "GA4 alternative",
    "Google Analytics dashboard",
    "Universal Analytics",
    "conversational analytics",
    "ask your analytics",
  ],
  openGraph: {
    title: "GA3 — You don't hate your data. You hate opening GA4.",
    description:
      "The Google Analytics dashboard you missed, with a brain it never had. Read-only, 30 seconds to set up.",
    url: "https://ga3.ai",
    siteName: "GA3",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GA3 — Bring back the dashboard Google took away",
    description:
      "Read your Google Analytics like it's 2019. Then skip the dashboard and just ask.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${sourceSerif.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
