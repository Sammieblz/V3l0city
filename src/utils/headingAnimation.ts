export const isUsableHeading = (
  heading: number | null | undefined
): heading is number =>
  typeof heading === 'number' && Number.isFinite(heading);

export const normalizeHeading = (heading: number): number => {
  if (!Number.isFinite(heading)) {
    return 0;
  }
  const normalized = heading % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const shortestHeadingTarget = (
  currentHeading: number,
  nextHeading: number
): number => {
  const current = normalizeHeading(currentHeading);
  const next = normalizeHeading(nextHeading);
  const diff = ((next - current + 540) % 360) - 180;
  return currentHeading + diff;
};
