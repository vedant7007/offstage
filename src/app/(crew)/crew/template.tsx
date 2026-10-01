import { PageTransition } from "@/components/ui/motion";

/** A new instance per crew page, so moving between pages cross-fades under the still chrome. */
export default function CrewTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition className="mx-auto flex w-full max-w-lg flex-col gap-4">{children}</PageTransition>;
}
