import { describe, expect, it } from "vitest";
import { ciState, detectPerson, newEntries, parseEntries } from "../../scripts/sync";

const md = `# COORDINATION

Entry format:

\`\`\`
## <date time IST> | <name> | <area>
\`\`\`

---

## 2026-09-30 12:38 IST | Vedant | kickoff
- What changed: kickoff

## 2026-09-30 14:20 IST | Abhinav | platform
- What changed: platform

## 2026-09-30 14:38 IST | Thanishka | design
- What changed: design
`;

describe("sync", () => {
  it("parses entries and skips the format example", () => {
    const e = parseEntries(md);
    expect(e.map((x) => x.header)).toEqual([
      "## 2026-09-30 12:38 IST | Vedant | kickoff",
      "## 2026-09-30 14:20 IST | Abhinav | platform",
      "## 2026-09-30 14:38 IST | Thanishka | design",
    ]);
    expect(e[1]!.body).toContain("What changed: platform");
  });

  it("returns entries after the last seen one, or the last 3 without a marker", () => {
    const e = parseEntries(md);
    expect(newEntries(e, "## 2026-09-30 12:38 IST | Vedant | kickoff")).toHaveLength(2);
    expect(newEntries(e, e.at(-1)!.header)).toHaveLength(0);
    expect(newEntries(e, undefined)).toHaveLength(3);
    expect(newEntries(e, "## gone")).toHaveLength(3);
  });

  it("detects the person from --who or git user.name", () => {
    expect(detectPerson([], "Vedant Manmath Idlgave")).toBe("vedant");
    expect(detectPerson(["--who", "Thanishka"], "Vedant")).toBe("thanishka");
    expect(detectPerson([], "someone else")).toBeUndefined();
  });

  it("summarises CI checks", () => {
    expect(ciState(null)).toBe("none");
    expect(ciState([{ status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("passing");
    expect(ciState([{ status: "IN_PROGRESS", conclusion: "" }])).toBe("pending");
    expect(ciState([{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }])).toBe("failing");
  });
});
