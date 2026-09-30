import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en.json";
import hi from "@/lib/i18n/hi.json";
import hinglish from "@/lib/i18n/hinglish.json";
import { getMessages } from "@/lib/i18n/messages";
import { createTranslator } from "@/lib/i18n/translate";

type Tree = { [key: string]: string | Tree };

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

// The /design review page is internal and stays English only.
const productKeys = keys(en).filter((k) => !k.startsWith("design."));

describe("translations", () => {
  it.each([
    ["hi", hi],
    ["hinglish", hinglish],
  ])("%s has every product key and nothing English lacks", (_name, messages) => {
    const own = keys(messages as Tree);
    expect(productKeys.filter((k) => !own.includes(k))).toEqual([]);
    expect(own.filter((k) => !keys(en).includes(k))).toEqual([]);
  });
});

describe("t()", () => {
  const t = createTranslator(getMessages("en"));

  it("fills variables", () => {
    expect(t("drafted.approvedBy", { role: "Lead" })).toBe("Drafted by Sutradhar, approved by Lead");
  });

  it("uses the _one key for a count of one", () => {
    expect(t("impact.sessions", { count: 1 })).toBe("1 session");
    expect(t("impact.sessions", { count: 3 })).toBe("3 sessions");
  });

  it("falls back to English for keys a translation does not have", () => {
    const tHi = createTranslator(getMessages("hi"));
    expect(tHi("status.pending")).toBe("बाकी");
    expect(tHi("design.title")).toBe("Design system");
  });
});
