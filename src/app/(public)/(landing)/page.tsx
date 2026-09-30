import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "OFFSTAGE",
  description:
    "The show goes on. We run everything behind it. An AI event operations team with a human lead on every agent.",
};

export default function Page() {
  return <LandingPage />;
}
