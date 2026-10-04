import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { BigTextSync } from "@/components/demo/BigText";
import { WalletProvider } from "@/lib/wallet";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const cert = Fraunces({ subsets: ["latin"], variable: "--font-cert", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Mohar: certificates that cannot lie",
  description: "Certificates anyone can verify in seconds, against the blockchain, without trusting the issuer's website or ours.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%23e2402a'/%3E%3Cpath d='M10.5 21V11.5l5.5 6l5.5-6V21' fill='none' stroke='%23fff4ef' stroke-width='2.2' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#08080a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${serif.variable} ${cert.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <WalletProvider>
          <BigTextSync />
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
