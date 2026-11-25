export type OrderStatus =
  | "menunggu_pembayaran"
  | "diproses"
  | "siap"
  | "selesai"
  | "dibatalkan"
  | "kedaluwarsa";

export type FulfillmentMethod = "pickup" | "delivery";

export interface StoreSettings {
  brandName: string;
  tagline: string;
  thermalBagCapacity: number;
  thermalBagPrice: number;
  deliveryFee: number;
  pickupLocation: string;
  adminWhatsapp: string;
  paymentTimeoutMinutes: number;
}

export interface MemberTier {
  id: number;
  slug: string;
  name: string;
  discountPercent: number;
  minPurchase: number;
  minPaidOrders: number;
  sortOrder: number;
}

export interface ProductVariant {
  id: number;
  productId: number;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface ProductAddon {
  id: number;
  productId: number;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface ProductWithDetails {
  id: number;
  slug: string;
  name: string;
  shortDescription: string;
  basePrice: number;
  startingPrice: number;
  requiresThermalBag: boolean;
  hasVariants: boolean;
  variantLabel: string;
  illustrationKey: string;
  isActive: boolean;
  variants: ProductVariant[];
  addons: ProductAddon[];
  totalQuota: number;
  reservedCount: number;
  remainingQuota: number;
}

export interface PoPeriodSummary {
  id: number;
  name: string;
  opensAt: string;
  closesAt: string;
  fulfillmentDate: string;
  earliestFulfillmentDate?: string;
  latestFulfillmentDate?: string;
  isActive: boolean;
  isOpenNow: boolean;
  statusReason: "open" | "not_yet_open" | "closed" | "no_period";
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  whatsapp: string;
  role: "buyer" | "admin";
  isMember: boolean;
  memberTierSlug: string;
}

export interface AdminUserRecord {
  id: number;
  name: string;
  email: string;
  whatsapp: string;
  role: "buyer" | "admin";
  isMember: boolean;
  memberTierSlug: string;
  createdAt: string;
  totalOrders: number;
  paidOrders: number;
}

export interface OrderItemRecord {
  id: number;
  productId: number;
  productNameSnapshot: string;
  variantId: number | null;
  variantNameSnapshot: string;
  addonsSnapshot: Array<{ id: number; name: string; price: number }>;
  unitBasePriceSnapshot: number;
  variantDeltaSnapshot: number;
  addonsTotalSnapshot: number;
  unitTotalPriceSnapshot: number;
  quantity: number;
  lineTotalSnapshot: number;
  requiresThermalBagSnapshot: boolean;
}

export interface OrderRecord {
  id: number;
  orderCode: string;
  poPeriodId: number;
  poPeriodName?: string;
  userId: number | null;
  recipientName: string;
  recipientWhatsapp: string;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentDate: string;
  deliveryAddress: string;
  notes: string;
  subtotal: number;
  tierNameSnapshot: string;
  discountPercentSnapshot: number;
  minPurchaseSnapshot: number;
  discountAmount: number;
  thermalBagCount: number;
  thermalBagUnitPriceSnapshot: number;
  thermalBagCost: number;
  shippingCost: number;
  grandTotal: number;
  status: OrderStatus;
  paymentProvider: string;
  paymentReference: string;
  qrisString: string;
  qrisExpiresAt: string;
  paidAt: string | null;
  createdAt: string;
  items: OrderItemRecord[];
}
