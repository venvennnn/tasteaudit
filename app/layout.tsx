import type { Metadata } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "@/components/SessionProvider";
import { Sky } from "@/components/Sky";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TasteAudit",
  description: "Check whether an AI assistant recommends things that fit a customer's explicit cultural interests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={manrope.className}>
        <Sky />
        <SessionProvider>
          <a className="skip" href="#content">Skip to content</a>
          <div id="content">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
