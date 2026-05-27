import {
  isUsableHeading,
  normalizeHeading,
  shortestHeadingTarget,
} from '../src/utils/headingAnimation';

describe('headingAnimation', () => {
  it('normalizes headings into [0, 360)', () => {
    expect(normalizeHeading(370)).toBe(10);
    expect(normalizeHeading(-10)).toBe(350);
    expect(normalizeHeading(720)).toBe(0);
    expect(normalizeHeading(Number.NaN)).toBe(0);
  });

  it('identifies usable heading values', () => {
    expect(isUsableHeading(0)).toBe(true);
    expect(isUsableHeading(359.9)).toBe(true);
    expect(isUsableHeading(null)).toBe(false);
    expect(isUsableHeading(undefined)).toBe(false);
    expect(isUsableHeading(Number.NaN)).toBe(false);
  });

  it('chooses the shortest clockwise or counterclockwise target', () => {
    expect(shortestHeadingTarget(350, 10)).toBe(370);
    expect(shortestHeadingTarget(10, 350)).toBe(-10);
    expect(shortestHeadingTarget(725, 10)).toBe(730);
    expect(shortestHeadingTarget(-5, 350)).toBe(-10);
  });
});
