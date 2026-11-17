// Public availability uses null for the count of an active, unlimited offering.
// Unknown or closed entries are unavailable; checkout still has its own payment gates.
export function hasAvailability(info, quantity = 1) {
  if (!info || info.open === false || !Number.isSafeInteger(quantity) || quantity < 1) return false;
  if (info.unlimited === true) return true;
  return Number.isSafeInteger(info.available) && info.available >= quantity;
}

export function madeToOrderLabel(info) {
  if (!hasAvailability(info) || info.unlimited !== true) return '';
  const days = info.leadTimeDays;
  return Number.isSafeInteger(days) && days >= 0 ? `Made to order — about ${days} days to make` : 'Made to order';
}
