// Every agent config. The worker registers these; adding an agent is adding it here.
import { commander } from "./commander/config";
import { crewChief } from "./crew-chief/config";
import { finance } from "./finance/config";
import { helpdesk } from "./helpdesk/config";
import { herald } from "./herald/config";
import { radar } from "./radar/config";
import { register } from "./runtime/registry";
import { scheduler } from "./scheduler/config";

export const ALL_AGENTS = [commander, scheduler, crewChief, herald, helpdesk, radar, finance];

export function registerAllAgents(): void {
  for (const config of ALL_AGENTS) register(config as never);
}
