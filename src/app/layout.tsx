import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/providers";

const serif = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pitchlink: creator ad slots, priced by real conversion",
  description:
    "Brands bid SOL for a slot in a small creator's next video. The winner gets a tracked link and every click is recorded on Solana.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <body className="bg-paper text-ink antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
