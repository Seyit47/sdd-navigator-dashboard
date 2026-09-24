// @req SCD-THEME-001, SCD-API-001
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { THEME_INIT_SCRIPT } from "@/lib/dashboard/theme";
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
  title: "SDD Navigator — Coverage Dashboard",
  description: "Specification coverage for an SDD project: which requirements are implemented, tested, or unaddressed.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The init script sets data-theme before hydration, so React must not warn about it.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-plane font-sans text-ink">
        <Header />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
