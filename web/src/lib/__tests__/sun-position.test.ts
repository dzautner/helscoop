import { describe, expect, it } from "vitest";
import {
  buildShadowStudySvg,
  calculateShadowStudy,
  calculateShadowVector,
  calculateSunPosition,
  calculateSunriseSunset,
} from "@/lib/sun-position";

const HELSINKI = { latitude: 60.17, longitude: 24.94 };

describe("sun-position", () => {
  it("computes a high summer-solstice sun for Helsinki", () => {
    const result = calculateSunPosition(
      HELSINKI.latitude,
      HELSINKI.longitude,
      new Date(2026, 5, 21, 13, 20),
    );

    expect(result.isAboveHorizon).toBe(true);
    expect(result.altitude).toBeGreaterThan(50);
    expect(result.altitude).toBeLessThan(55);
    expect(result.azimuth).toBeGreaterThan(170);
    expect(result.azimuth).toBeLessThan(210);
  });

  it("returns Finnish seasonal daylight extremes in realistic ranges", () => {
    const summer = calculateSunriseSunset(HELSINKI.latitude, HELSINKI.longitude, 5, 21);
    const winter = calculateSunriseSunset(HELSINKI.latitude, HELSINKI.longitude, 11, 21);

    expect(summer.daylightHours).toBeGreaterThan(18);
    expect(summer.sunrise).toBeGreaterThan(3);
    expect(summer.sunrise).toBeLessThan(5);
    expect(summer.sunset).toBeGreaterThan(22);

    expect(winter.daylightHours).toBeLessThan(6.5);
    expect(winter.sunrise).toBeGreaterThan(8.5);
    expect(winter.sunset).toBeLessThan(16);
  });

  it("projects south-sun shadows northward", () => {
    const shadow = calculateShadowVector(180, 45, 3);

    expect(shadow).not.toBeNull();
    expect(shadow?.length).toBeCloseTo(3, 1);
    expect(shadow?.vector[0]).toBeCloseTo(0, 5);
    expect(shadow?.vector[1]).toBeGreaterThan(0.99);
  });

  it("builds sampled shadow studies and SVG reports", () => {
    const study = calculateShadowStudy({
      ...HELSINKI,
      month: 5,
      day: 21,
      startHour: 8,
      endHour: 20,
      intervalMinutes: 60,
      objectHeightM: 3,
    });
    const svg = buildShadowStudySvg({
      title: "Helscoop shadow study",
      ...HELSINKI,
      month: 5,
      day: 21,
      study,
    });

    expect(study.samples.length).toBeGreaterThan(8);
    expect(study.samples[0].label).toMatch(/^\d\d:\d\d$/);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Helscoop shadow study");
    expect(svg).toContain("building footprint");
  });
});
