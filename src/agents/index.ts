// Every agent config. The worker registers these; adding an agent is adding it here.
import { chronicler } from "./chronicler/config";
import { commander } from "./commander/config";
import { crewChief } from "./crew-chief/config";
import { finance } from "./finance/config";
import { helpdesk } from "./helpdesk/config";
import { herald } from "./herald/config";
import { logistics } from "./logistics/config";
import { marketing } from "./marketing/config";
import { planner } from "./planner/config";
import { radar } from "./radar/config";
import { registrar } from "./registrar/config";
import { register } from "./runtime/registry";
import { scheduler } from "./scheduler/config";
import { speakerLiaison } from "./speaker-liaison/config";
import { sponsorship } from "./sponsorship/config";

export const ALL_AGENTS = [
  commander,
  planner,
  finance,
  sponsorship,
  marketing,
  registrar,
  scheduler,
  speakerLiaison,
  crewChief,
  logistics,
  herald,
  helpdesk,
  radar,
  chronicler,
];

export function registerAllAgents(): void {
  for (const config of ALL_AGENTS) register(config as never);
}
