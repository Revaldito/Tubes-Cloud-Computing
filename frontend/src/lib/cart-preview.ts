import type { FulfillmentMethod, MemberTier, StoreSettings } from "./types";

export interface CartPreviewLine {
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

export function calculateCartPreview(params: {
  lines: CartPreviewLine[];
  settings: Pick<StoreSettings, "thermalBagCapacity" | "thermalBagPrice" | "deliveryFee">;
  tier: Pick<MemberTier, "name" | "discountPercent" | "minPurchase"> | null;
  isMember: boolean;
  fulfillmentMethod: FulfillmentMethod;
}) {
  const { lines, settings, tier, isMember, fulfillmentMethod } = params;

  const subtotal = lines.reduce((acc, line) => {
    const addonsTotal = line.addons.reduce((s, a) => s + a.price, 0);
    return acc + (line.basePrice + line.variantDelta + addonsTotal) * line.quantity;
  }, 0);

  const bananaSplitQty = lines
    .filter((item) => item.requiresThermalBag)
    .reduce((acc, item) => acc + item.quantity, 0);

  const capacity = Math.max(1, settings.thermalBagCapacity);
  const thermalBagCount = bananaSplitQty > 0 ? Math.ceil(bananaSplitQty / capacity) : 0;
  const thermalBagCost = thermalBagCount * settings.thermalBagPrice;

  const discountPercent = isMember && tier ? Number(tier.discountPercent) : 0;
  const minPurchase = isMember && tier ? Number(tier.minPurchase) : 0;
  const tierName = isMember && tier ? tier.name : "Non-member";

  const discountEligible = discountPercent > 0 && subtotal >= minPurchase;
  const shortfallToDiscount =
    discountPercent > 0 && subtotal < minPurchase ? minPurchase - subtotal : 0;
  const discountAmount = discountEligible
    ? Math.round((discountPercent / 100) * subtotal)
    : 0;

  const shippingCost = fulfillmentMethod === "delivery" ? settings.deliveryFee : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + thermalBagCost + shippingCost);

  return {
    subtotal,
    thermalBagCount,
    thermalBagCost,
    tierName,
    discountPercent,
    minPurchase,
    discountEligible,
    shortfallToDiscount,
    discountAmount,
    shippingCost,
    grandTotal,
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
