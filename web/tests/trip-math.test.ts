import { describe, expect, it } from "vitest";

import { coarseLocationCell, derivedSpeed, distanceBetween, tripInsights } from "@/lib/trip/math";
import { canRecordInMobileBrowser } from "@/lib/drive-capability";

describe("trip math", () => {
  it("calculates a short geodesic distance", () => {
    const distance = distanceBetween({ latitude: 40.0, longitude: -74.0, timestamp: 0 }, { latitude: 40.0009, longitude: -74.0, timestamp: 10_000 });
    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(105);
  });

  it("uses reported speed when the browser supplies a valid value", () => {
    expect(derivedSpeed({ latitude: 0, longitude: 0, timestamp: 0 }, { latitude: 1, longitude: 1, timestamp: 1000 }, 12.5)).toBe(12.5);
  });

  it("uses a deliberately coarse location cell", () => {
    expect(coarseLocationCell(40.71278, -74.00597)).toBe("40.7,-74.0");
  });

  it("summarizes completed trips without treating max speed as an average", () => {
    const summary = tripInsights([
      { totalDistanceMeters: 1_000, maxSpeedMps: 20, averageSpeedMps: 10, startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:40Z" },
      { totalDistanceMeters: 500, maxSpeedMps: 30, averageSpeedMps: 5, startedAt: "2026-01-02T00:00:00Z", endedAt: "2026-01-02T00:01:40Z" },
    ]);
    expect(summary.tripCount).toBe(2);
    expect(summary.totalDistanceMeters).toBe(1_500);
    expect(summary.maxSpeedMps).toBe(30);
    expect(summary.averageSpeedMps).toBe(7.5);
  });
});

describe("browser drive capability", () => {
  it("keeps desktop browsers read-only even when geolocation exists", () => {
    expect(canRecordInMobileBrowser({ secureContext: true, geolocationAvailable: true, finePointer: true, viewportWidth: 1280 })).toBe(false);
  });

  it("allows a secure coarse-pointer mobile browser to manually record", () => {
    expect(canRecordInMobileBrowser({ secureContext: true, geolocationAvailable: true, finePointer: false, viewportWidth: 390 })).toBe(true);
  });
});
