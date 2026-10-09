import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CarePulse — Hospital Management Platform",
  description:
    "CarePulse is an editorial-grade hospital management platform: appointments, records, billing, wards and labs in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground selection:bg-primary/15 selection:text-primary">
        <Providers />
        {children}
      </body>
    </html>
  );
}

