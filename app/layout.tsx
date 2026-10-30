import type { Metadata } from "next";
import { RunBar } from "@/components/RunBar";
import { SessionProvider } from "@/components/SessionProvider";
import "@fontsource-variable/geist/wght.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "TasteAudit",
  description: "Check whether an AI assistant recommends things that fit a customer's explicit cultural interests.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <a className="skip" href="#content">Skip to content</a>
          <RunBar />
          <div id="content">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
