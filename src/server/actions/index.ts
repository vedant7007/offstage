/**
 * The proposal engine. Agents call `actions.propose`; the console calls the decision functions.
 * Nothing else writes domain tables.
 */
import { approve, edit, reject, undo } from "./decide";
import { executeProposal } from "./execute";
import { propose } from "./propose";

export const actions = { propose, approve, reject, edit, undo, execute: executeProposal };
export { propose, approve, reject, edit, undo, executeProposal };
export { supportedKinds } from "./executors";
