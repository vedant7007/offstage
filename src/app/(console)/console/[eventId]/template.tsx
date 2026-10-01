import { PageTransition } from "@/components/ui/motion";

/**
 * A new instance per console page, so moving between sections cross-fades under the still sidebar and
 * top bar. The emergency banner and the voice dock sit in the layout, outside it, and never re-mount.
 */
export default function ConsoleTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
