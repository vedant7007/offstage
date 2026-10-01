"use client";

import { cn } from "@/lib/utils";
import {
  BellRing,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Compass,
  Handshake,
  Megaphone,
  MessageCircleQuestionMark,
  Mic,
  Radar,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AgentName } from "@/contracts";
import { useT } from "@/lib/i18n/provider";

/**
 * Each agent has its own icon. Colour is shared: every agent uses the purple "agent" tone so
 * agent activity is recognisable at a glance, and the Commander alone wears the curtain colour
 * because it leads the team.
 */
const AGENTS = {
  commander: Compass,
  planner: CalendarRange,
  finance: Wallet,
  sponsorship: Handshake,
  marketing: Megaphone,
  registrar: ClipboardList,
  scheduler: CalendarClock,
  speaker_liaison: Mic,
  crew_chief: Users,
  logistics: Truck,
  herald: BellRing,
  helpdesk: MessageCircleQuestionMark,
  radar: Radar,
  chronicler: BookOpen,
} satisfies Record<AgentName, LucideIcon>;

/** Same as AgentName from @/contracts. Kept as a published alias. */
export type AgentKey = AgentName;
export const AGENT_KEYS = Object.keys(AGENTS) as AgentKey[];

const isAgent = (value: string): value is AgentKey => value in AGENTS;

const SIZES = {
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-9 [&_svg]:size-4.5",
  lg: "size-12 [&_svg]:size-6",
} as const;

type AgentAvatarProps = {
  /** An AgentName. Unknown names get a generic bot icon rather than crashing. */
  agent: string;
  size?: keyof typeof SIZES;
  /** Show the agent's name beside the icon. */
  showName?: boolean;
  className?: string;
};

function AgentAvatar({ agent, size = "md", showName = false, className }: AgentAvatarProps) {
  const t = useT();
  const known = isAgent(agent);
  const Icon = known ? AGENTS[agent] : Bot;
  const name = known ? t(`agent.${agent}`) : t("agent.unknown");
  const lead = agent === "commander";

  const badge = (
    <span
      data-slot="agent-avatar"
      data-agent={agent}
      role={showName ? undefined : "img"}
      aria-label={showName ? undefined : name}
      aria-hidden={showName || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        lead ? "bg-curtain text-on-curtain" : "bg-agent text-on-agent",
        SIZES[size],
        !showName && className,
      )}
    >
      <Icon aria-hidden />
    </span>
  );

  if (!showName) return badge;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {badge}
      <span className="font-medium text-fg">{name}</span>
    </span>
  );
}

export { AgentAvatar };
