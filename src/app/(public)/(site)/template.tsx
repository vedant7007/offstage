import { PageTransition } from "@/components/ui/motion";

/** A new instance per public page (event, sign-in, About our AI), so they cross-fade under the header. */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
