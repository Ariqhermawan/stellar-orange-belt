import { describe, it, expect } from "vitest";
import { progressPct, shortAddress, timeLeft } from "./format";

describe("progressPct", () => {
  it("computes a percentage of the goal", () => {
    expect(progressPct(50, 200)).toBe(25);
  });
  it("clamps above 100", () => {
    expect(progressPct(300, 200)).toBe(100);
  });
  it("returns 0 for a zero goal", () => {
    expect(progressPct(10, 0)).toBe(0);
  });
});

describe("shortAddress", () => {
  it("truncates a long address", () => {
    expect(shortAddress("GABCDEFGHIJKLMNOP")).toBe("GABCDE…MNOP");
  });
  it("leaves a short string unchanged", () => {
    expect(shortAddress("SHORT")).toBe("SHORT");
  });
});

describe("timeLeft", () => {
  it("shows days and hours remaining", () => {
    expect(timeLeft(1000 + 86400 * 2 + 3600 * 3, 1000)).toBe("2d 3h left");
  });
  it("reports ended once past the deadline", () => {
    expect(timeLeft(500, 1000)).toBe("ended");
  });
});
