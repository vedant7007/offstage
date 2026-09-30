import { redirect } from "next/navigation";
import { getMe } from "@/components/attendee/server";

/** The crew app is for signed-in volunteers and staff; the check-in API checks the scan permission. */
export default async function CrewLayout({ children }: LayoutProps<"/crew">) {
  const me = await getMe();
  if (!me) redirect("/login?next=/crew");
  return <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6">{children}</main>;
}
