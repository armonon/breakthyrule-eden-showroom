// Quotes use the same integer-cent price function as the cart and checkout.
// This prices selected options only; normalizeItem still validates every saved/order item.
import { OFFERINGS, offeringFor, COLORS, ARTWORK, FITS, MAX_QUANTITY } from '../labkit/catalog.mjs';
import { priceItem } from '../labkit/pricing.mjs';

export function quoteGarment(config) {
  if (!config || typeof config !== 'object') return null;
  const { construction, garment, color, artwork } = config;
  const labMode = config.baseMode ?? config.labMode;
  const quantity = config.quantity ?? 1;
  if (labMode === 'random' && (construction !== 'canvas' || color !== 'random')) return null;
  if (!Object.hasOwn(OFFERINGS, construction) || !offeringFor({ construction, garment, labMode }) || !Object.hasOwn(COLORS, color) || !Object.hasOwn(ARTWORK, artwork)) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > (construction === 'cut-sew' ? 1 : MAX_QUANTITY)) return null;
  const priced = priceItem({ product: 'garment', construction, labMode, garment, color, artwork, customColor: config.customColor || '', quantity });
  if (![priced.unitCents, priced.totalCents].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return { ...priced, quantity };
}

const validFit = (construction, fit) => FITS[construction].some(option => option.id === fit) ? fit : FITS[construction].length === 1 ? FITS[construction][0].id : null;
export function modeSelection(state, mode) {
  if (!state || !['random', 'blank', 'cut-sew'].includes(mode)) return null;
  const construction = mode === 'cut-sew' ? 'cut-sew' : 'canvas';
  if (!offeringFor({ construction, garment: state.garment, labMode: mode })) return null;
  const color = mode === 'random' ? 'random' : state.baseMode === 'random' ? 'black' : state.color;
  return { baseMode: mode, construction, color, customColor: color === 'custom' ? state.customColor : '', fit: validFit(construction, state.fit), quantity: construction === 'cut-sew' ? 1 : state.quantity ?? 1 };
}
export function garmentSelection(state, garment) {
  if (!state) return null;
  if (state.baseMode === 'random' && offeringFor({ construction: 'canvas', garment, labMode: 'random' })) return { garment, construction: 'canvas', baseMode: 'random', color: 'random', fit: 'blank', quantity: state.quantity ?? 1 };
  const construction = Object.hasOwn(OFFERINGS, state.construction) && Object.hasOwn(OFFERINGS[state.construction], garment) ? state.construction : Object.keys(OFFERINGS).find(key => Object.hasOwn(OFFERINGS[key], garment));
  if (!construction) return null;
  return { garment, construction, baseMode: construction === state.construction ? state.baseMode : construction === 'cut-sew' ? 'cut-sew' : 'blank', fit: validFit(construction, state.fit), quantity: construction === 'cut-sew' ? 1 : state.quantity ?? 1 };
}
