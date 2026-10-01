import type { Metadata } from "next";
import { TheatrePage } from "@/components/landing-theatre/theatre-page";

export const metadata: Metadata = {
  title: { absolute: "OFFSTAGE: the show goes on" },
  description:
    "OFFSTAGE runs everything behind the show: fourteen AI agents, each with a human lead, on one shared source of truth. Built for Indian colleges, ready for any event.",
};

export default function Page() {
  return <TheatrePage />;
}
