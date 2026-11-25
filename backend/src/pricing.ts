import type { FulfillmentMethod, MemberTier, StoreSettings } from "./types";

export interface PricedLineInput {
  productId: number;
  productName: string;
  basePrice: number;
  variantId: number | null;
  variantName: string;
  variantDelta: number;
  addons: Array<{ id: number; name: string; price: number }>;
  quantity: number;
  requiresThermalBag: boolean;
}

export interface PricedLineOutput extends PricedLineInput {
  addonsTotal: number;
  unitTotalPrice: number;
  lineTotal: number;
}

export interface OrderCalculationResult {
  items: PricedLineOutput[];
  subtotal: number;
  bananaSplitQty: number;
  thermalBagCount: number;
  thermalBagUnitPrice: number;
  thermalBagCost: number;
  isMember: boolean;
  tierName: string;
  discountPercent: number;
  minPurchase: number;
  discountEligible: boolean;
  shortfallToDiscount: number;
  discountAmount: number;
  shippingCost: number;
  grandTotal: number;
}

export function calculateOrderTotals(params: {
  lines: PricedLineInput[];
  settings: Pick<StoreSettings, "thermalBagCapacity" | "thermalBagPrice" | "deliveryFee">;
  tier: Pick<MemberTier, "name" | "discountPercent" | "minPurchase"> | null;
  isMember: boolean;
  fulfillmentMethod: FulfillmentMethod;
}): OrderCalculationResult {
  const { lines, settings, tier, isMember, fulfillmentMethod } = params;

  const items: PricedLineOutput[] = lines.map((line) => {
    const addonsTotal = line.addons.reduce((acc, a) => acc + a.price, 0);
    const unitTotalPrice = line.basePrice + line.variantDelta + addonsTotal;
    const lineTotal = unitTotalPrice * line.quantity;
    return {
      ...line,
      addonsTotal,
      unitTotalPrice,
      lineTotal,
    };
  });

  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);

  const bananaSplitQty = items
    .filter((item) => item.requiresThermalBag)
    .reduce((acc, item) => acc + item.quantity, 0);

  const capacity = Math.max(1, settings.thermalBagCapacity);
  const thermalBagCount = bananaSplitQty > 0 ? Math.ceil(bananaSplitQty / capacity) : 0;
  const thermalBagUnitPrice = settings.thermalBagPrice;
  const thermalBagCost = thermalBagCount * thermalBagUnitPrice;

  const activeDiscountPercent = isMember && tier ? Number(tier.discountPercent) : 0;
  const minPurchase = isMember && tier ? Number(tier.minPurchase) : 0;
  const tierName = isMember && tier ? tier.name : "Non-member";

  const discountEligible = activeDiscountPercent > 0 && subtotal >= minPurchase;
  const shortfallToDiscount =
    activeDiscountPercent > 0 && subtotal < minPurchase ? minPurchase - subtotal : 0;

  const discountAmount = discountEligible
    ? Math.round((activeDiscountPercent / 100) * subtotal)
    : 0;

  const shippingCost = fulfillmentMethod === "delivery" ? settings.deliveryFee : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + thermalBagCost + shippingCost);

  return {
    items,
    subtotal,
    bananaSplitQty,
    thermalBagCount,
    thermalBagUnitPrice,
    thermalBagCost,
    isMember,
    tierName,
    discountPercent: activeDiscountPercent,
    minPurchase,
    discountEligible,
    shortfallToDiscount,
    discountAmount,
    shippingCost,
    grandTotal,
  };
}
