/** Road-group analysis: same-road allocations grouped for crosschecking.
 *
 * Works on road_group_candidates_2027.json — every group keyed by funding
 * zone + PAP + region + normalized road title base, with House and NEP
 * members, attachment status, chainage spans and cost per km. Exhausted
 * groups (all NEP rows attached, House leftovers) are the insertion /
 * scope-expansion candidates.
 */

export function roadGroupStats(groups) {
  const exhausted = groups.filter(g => g.leftover_house_rows > 0);
  const leftoverRows = exhausted.reduce((sum, g) => sum + g.leftover_house_rows, 0);
  const leftoverPhp = exhausted.reduce((sum, g) => sum + g.leftover_amount_php, 0);
  const withPerKm = exhausted.filter(g => g.members.some(m => m.amount_per_km_php != null));
  const roads = exhausted.filter(g => g.kind === 'road');
  const shells = exhausted.filter(g => g.kind === 'place_shell');
  return {groups: groups.length, exhausted: exhausted.length, leftoverRows, leftoverPhp, withPerKm, roads: roads.length, shells: shells.length};
}

/** Comparable per-km spread inside a group: max/min over members with a
 *  measurable length, plus the House-vs-NEP median per-km delta. */
export function groupPerKmProfile(group) {
  const house = group.members.filter(m => m.amount_per_km_php != null && m.status !== undefined && m.id && m.amount_per_km_php);
  const nep = group.members.filter(m => m.amount_per_km_php != null);
  const values = group.members.filter(m => m.amount_per_km_php != null).map(m => m.amount_per_km_php);
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
    spread: sorted[sorted.length - 1] / sorted[0],
    measurable: values.length,
  };
}

export function memberPerKm(member) {
  return member.amount_per_km_php ?? null;
}
