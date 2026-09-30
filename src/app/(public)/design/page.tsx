import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignShowcase } from "./_components/design-showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** Team review page for every primitive and composite. Exists only when DEMO_MODE is on. */
export default async function DesignPage({ searchParams }: PageProps<"/design">) {
  if (process.env.DEMO_MODE !== "true") notFound();
  const { embed } = await searchParams;
  return (
    <main id="main">
      <DesignShowcase embedded={embed === "1"} />
    </main>
  );
}
