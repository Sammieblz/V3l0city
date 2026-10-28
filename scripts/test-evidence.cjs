// Only Node's final top-level TAP summary qualifies as complete CI evidence.
// Missing, duplicate, truncated or skipped summaries must fail closed.
function hasCompleteEvidence(tap) {
  const count = (name) => {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)\\r?$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : NaN;
  };
  return count('tests') > 0 && count('pass') === count('tests') &&
    ['fail', 'skipped', 'cancelled', 'todo'].every((name) => count(name) === 0);
}

module.exports = { hasCompleteEvidence };
