import { PageTransition } from "@/components/ui/motion";

/** A new instance per portal page, so moving between tabs cross-fades under the still chrome. */
export default function MeTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
