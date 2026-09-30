import { WhatIfView } from "@/components/console/whatif-view";

export default async function WhatIfPage({ params }: PageProps<"/console/[eventId]/whatif">) {
  const { eventId } = await params;
  return <WhatIfView eventId={eventId} />;
}
