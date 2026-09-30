import { describe, expect, it } from "vitest";
import {
  formatIndianNumber,
  formatInr,
  formatInrShort,
  formatPercent,
  maskEmail,
  maskPhone,
  shortName,
} from "@/lib/format";

describe("format helpers", () => {
  it("groups digits the Indian way", () => {
    expect(formatIndianNumber(300000)).toBe("3,00,000");
    expect(formatIndianNumber(12345678)).toBe("1,23,45,678");
    expect(formatIndianNumber(999)).toBe("999");
    expect(formatIndianNumber(1000)).toBe("1,000");
    expect(formatIndianNumber(1234.5, 2)).toBe("1,234.50");
    expect(formatIndianNumber(-150000)).toBe("-1,50,000");
  });

  it("formats rupees", () => {
    expect(formatInr(300000)).toBe("₹3,00,000");
    expect(formatInr(-2500)).toBe("-₹2,500");
    expect(formatInr(123456, { paise: true, fractionDigits: 2 })).toBe("₹1,234.56");
    expect(formatInrShort(300000)).toBe("₹3 L");
    expect(formatInrShort(12500000)).toBe("₹1.25 Cr");
    expect(formatInrShort(45000)).toBe("₹45 K");
    expect(formatInrShort(750)).toBe("₹750");
  });

  it("formats percentages from ratios", () => {
    expect(formatPercent(0.923)).toBe("92%");
    expect(formatPercent(1.05, 1)).toBe("105.0%");
  });

  it("masks phone numbers", () => {
    expect(maskPhone("+919876543210")).toBe("+91 ******3210");
    expect(maskPhone("+91 98765 43210")).toBe("+91 ******3210");
    expect(maskPhone("9876543210")).toBe("******3210");
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
  });

  it("masks emails", () => {
    expect(maskEmail("sneha.reddy@gmail.com")).toBe("sn***@gmail.com");
    expect(maskEmail("ab@x.in")).toBe("a***@x.in");
    expect(maskEmail("not-an-email")).toBe("***");
  });

  it("shortens names", () => {
    expect(shortName("Sneha Reddy")).toBe("Sneha R.");
    expect(shortName("Ravi")).toBe("Ravi");
  });
});
