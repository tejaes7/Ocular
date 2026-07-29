/**
 * Alert rules. Pure — no chrome APIs — so it can be unit tested directly.
 *
 * Percent and median rules are anchored to the **90-day median**, not to the
 * previous price and not to the retailer's listed M.R.P. That choice is the
 * whole point: it defeats the pre-sale price hike, where a price is raised for a
 * week so the "sale" reads as a discount, and it ignores permanently inflated
 * M.R.P. figures.
 */

export function evaluateAlert({ target, stats, previousPrice, price, settings = {} }) {
  const median = stats?.median90;

  if (target?.type === 'absolute' && Number.isFinite(target.value) && price <= target.value) {
    return { fire: true, kind: 'target', label: 'Target price reached' };
  }

  if (target?.type === 'median' && median && price <= median) {
    return { fire: true, kind: 'target', label: 'Below its usual price' };
  }

  if (target?.type === 'percent' && median && Number.isFinite(target.value)) {
    const threshold = median * (1 - target.value / 100);
    if (price <= threshold) {
      return { fire: true, kind: 'target', label: `${target.value}% below usual` };
    }
  }

  if (settings.notifyOnAnyDrop && previousPrice > 0) {
    const dropPercent = ((previousPrice - price) / previousPrice) * 100;
    if (dropPercent >= (settings.minDropPercentToNotify ?? 0) && dropPercent > 0) {
      return {
        fire: true,
        kind: 'drop',
        label: `Price dropped ${dropPercent.toFixed(0)}%`,
        dropPercent,
      };
    }
  }

  return { fire: false };
}
