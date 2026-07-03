import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-ui",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-osd",
});

export const metadata: Metadata = {
  title: "open-hik — live view",
  description: "Open source live viewer for Hikvision DVRs. No plugins, no Internet Explorer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <head>
        {/* go2rtc player web component (MIT, vendored from AlexxIT/go2rtc) */}
        <script type="module" src="/video-stream.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
