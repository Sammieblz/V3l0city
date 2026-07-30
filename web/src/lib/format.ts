import type { Units } from "@/lib/types";

export const metersToDisplayDistance = (meters: number, units: Units = "MPH") =>
  units === "MPH" ? meters / 1609.344 : meters / 1000;

export const metersPerSecondToDisplay = (speed: number, units: Units = "MPH") =>
  units === "MPH" ? speed * 2.236936 : speed * 3.6;

export const distanceLabel = (meters: number, units: Units = "MPH", fractionDigits = 1) =>
  `${metersToDisplayDistance(meters, units).toFixed(fractionDigits)} ${units === "MPH" ? "mi" : "km"}`;

export const speedLabel = (speed: number, units: Units = "MPH", fractionDigits = 0) =>
  `${metersPerSecondToDisplay(speed, units).toFixed(fractionDigits)} ${units === "MPH" ? "mph" : "km/h"}`;

export const durationLabel = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
