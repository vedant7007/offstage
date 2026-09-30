import { Anton, Inter, JetBrains_Mono } from "next/font/google";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

/** The landing film brings its own chrome (fixed nav, cue rail, short footer) and its own type. */
export default function LandingLayout({ children }: LayoutProps<"/">) {
  return <div className={`${anton.variable} ${inter.variable} ${mono.variable}`}>{children}</div>;
}
