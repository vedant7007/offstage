// Event-type templates: which agents start on, the budget split, and the dated checklist.
// Types without their own file use the closest one (see FOR_TYPE).
import { z } from "zod";
import { AgentName, Domain, type EventType } from "@/contracts";
import charityDrive from "./charity_drive.json";
import hackathon from "./hackathon.json";
import other from "./other.json";
import workshop from "./workshop.json";

export const Template = z.object({
  agentsOff: z.array(AgentName),
  budget: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
        name: z.string(),
        pct: z.number().positive(),
      }),
    )
    .refine((b) => b.reduce((a, c) => a + c.pct, 0) === 100, "Budget split must add up to 100"),
  milestones: z.array(
    z.object({ title: z.string(), domain: Domain, daysBefore: z.int().min(0), critical: z.boolean() }),
  ),
});
export type Template = z.infer<typeof Template>;

const FILES = {
  hackathon: Template.parse(hackathon),
  workshop: Template.parse(workshop),
  charity_drive: Template.parse(charityDrive),
  other: Template.parse(other),
};

const FOR_TYPE: Record<EventType, keyof typeof FILES> = {
  hackathon: "hackathon",
  tech_fest: "hackathon",
  workshop: "workshop",
  conference: "workshop",
  community_meetup: "workshop",
  charity_drive: "charity_drive",
  marathon: "charity_drive",
  cultural_night: "other",
  product_launch: "other",
  wedding: "other",
  school_function: "other",
  other: "other",
};

export const templateFor = (type: EventType): Template => FILES[FOR_TYPE[type]];
