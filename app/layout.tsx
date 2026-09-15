import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "CarePulse — Smart Hospital Platform",
  description:
    "CarePulse is a smart hospital management and patient portal: appointments, records, billing, wards and labs in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers />
        <SplashOverlay />
        {children}
      </body>
    </html>
  );
}

function SplashOverlay() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  try {
    var raw = localStorage.getItem("carepulse-v1");
    var hasSession = false;
    if (raw) { hasSession = !!JSON.parse(raw).state.session; }
    if (hasSession) {
      document.documentElement.setAttribute("data-cp-boot", "1");
    }
  } catch (e) {}
})();
`,
      }}
    />
  );
}
