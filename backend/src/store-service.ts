import os from "node:os";
import crypto from "node:crypto";
import { dbQuery, withTransaction, getDbEngineMode, type DbExecutor } from "./db";
import { calculateOrderTotals, type PricedLineInput } from "./pricing";
import { createQrisCharge } from "./payment";
import type {
  CartSelectionInput,
  FulfillmentMethod,
  MemberTier,
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  PoPeriodSummary,
  ProductWithDetails,
  StoreSettings,
} from "./types";

export class BusinessRuleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BusinessRuleError";
    this.statusCode = statusCode;
  }
}

export function getServerInstanceId(): string {
  return process.env.SERVER_INSTANCE_ID?.trim() || os.hostname();
}

let lastExpirySweepMs = 0;

export async function expireOverdueOrders(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastExpirySweepMs < 3000) {
    return 0;
  }
  lastExpirySweepMs = now;

  // Fast read pre-check avoids write-transaction lock overhead when no orders are overdue
  const hasOverdue = await dbQuery<{ id: number }>(
    `SELECT id FROM orders
     WHERE status = 'menunggu_pembayaran'
       AND quota_released = FALSE
       AND qris_expires_at < NOW()
     LIMIT 1`
  );
  if (hasOverdue.rows.length === 0) return 0;

  return withTransaction(async (tx) => {
    const overdueRes = await tx.query<{ id: number; po_period_id: number }>(
      `SELECT id, po_period_id
       FROM orders
       WHERE status = 'menunggu_pembayaran'
         AND quota_released = FALSE
         AND qris_expires_at < NOW()
       FOR UPDATE`
    );

    if (overdueRes.rows.length === 0) return 0;

    for (const ord of overdueRes.rows) {
      await releaseOrderQuotaInTx(tx, ord.id, ord.po_period_id);
      await tx.query(
        `UPDATE orders
         SET status = 'kedaluwarsa', quota_released = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [ord.id]
      );
    }

    return overdueRes.rows.length;
  });
}

async function releaseOrderQuotaInTx(
  tx: DbExecutor,
  orderId: number,
  poPeriodId: number
): Promise<void> {
  const itemsRes = await tx.query<{ product_id: number; qty: string }>(
    `SELECT product_id, SUM(quantity)::text AS qty
     FROM order_items
     WHERE order_id = $1 AND product_id IS NOT NULL
     GROUP BY product_id
     ORDER BY product_id ASC`,
    [orderId]
  );

  for (const row of itemsRes.rows) {
    await tx.query(
      `UPDATE po_quotas
       SET reserved_count = GREATEST(0, reserved_count - $1)
       WHERE po_period_id = $2 AND product_id = $3`,
      [Number(row.qty), poPeriodId, row.product_id]
    );
  }
}

export async function getStoreSettings(): Promise<StoreSettings> {
  const res = await dbQuery<{
    brand_name: string;
    tagline: string;
    thermal_bag_capacity: number;
    thermal_bag_price: number;
    delivery_fee: number;
    pickup_location: string;
    admin_whatsapp?: string;
    payment_timeout_minutes: number;
  }>(`SELECT * FROM store_settings WHERE id = 1`);

  const row = res.rows[0];
  return {
    brandName: row?.brand_name ?? "Banatier",
    tagline: row?.tagline ?? "Artisanal Banana Patisserie",
    thermalBagCapacity: Number(row?.thermal_bag_capacity ?? 2),
    thermalBagPrice: Number(row?.thermal_bag_price ?? 8000),
    deliveryFee: Number(row?.delivery_fee ?? 12000),
    pickupLocation: row?.pickup_location ?? "Studio Banatier, Bandung",
    adminWhatsapp: row?.admin_whatsapp || "081219048439",
    paymentTimeoutMinutes: Number(row?.payment_timeout_minutes ?? 10),
  };
}

export async function getMemberTiers(): Promise<MemberTier[]> {
  const res = await dbQuery<{
    id: number;
    slug: string;
    name: string;
    discount_percent: string;
    min_purchase: number;
    min_paid_orders: number;
    sort_order: number;
  }>(`SELECT * FROM member_tiers ORDER BY sort_order ASC, id ASC`);

  return res.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    discountPercent: Number(r.discount_percent),
    minPurchase: Number(r.min_purchase),
    minPaidOrders: Number(r.min_paid_orders),
    sortOrder: Number(r.sort_order),
  }));
}

const PO_MIN_LEAD_DAYS = 3;
const PO_MAX_LEAD_DAYS = 4;

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export async function getActivePoPeriod(): Promise<PoPeriodSummary | null> {
  const res = await dbQuery<{
    id: number;
    name: string;
    opens_at: string | Date;
    closes_at: string | Date;
    fulfillment_date: string | Date;
    is_active: boolean;
  }>(`SELECT * FROM po_periods ORDER BY is_active DESC, id DESC LIMIT 1`);

  const row = res.rows[0];
  if (!row) return null;

  const now = Date.now();
  const opensAtDate = new Date(row.opens_at);
  const closesAtDate = new Date(row.closes_at);
  const fulfillmentStr =
    row.fulfillment_date instanceof Date
      ? row.fulfillment_date.toISOString().slice(0, 10)
      : String(row.fulfillment_date).slice(0, 10);

  let statusReason: PoPeriodSummary["statusReason"] = "closed";
  let isOpenNow = false;

  if (!row.is_active) {
    statusReason = "closed";
  } else if (now < opensAtDate.getTime()) {
    statusReason = "not_yet_open";
  } else if (now > closesAtDate.getTime()) {
    statusReason = "closed";
  } else {
    statusReason = "open";
    isOpenNow = true;
  }

  return {
    id: row.id,
    name: row.name,
    opensAt: opensAtDate.toISOString(),
    closesAt: closesAtDate.toISOString(),
    fulfillmentDate: fulfillmentStr,
    earliestFulfillmentDate: addDaysFromToday(PO_MIN_LEAD_DAYS),
    latestFulfillmentDate: addDaysFromToday(PO_MAX_LEAD_DAYS),
    isActive: row.is_active,
    isOpenNow,
    statusReason,
  };
}

export async function getCatalogWithQuotas(includeInactive = false): Promise<{
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  tiers: MemberTier[];
  products: ProductWithDetails[];
  serverInstanceId: string;
  dbEngine: string;
}> {
  void expireOverdueOrders().catch(() => {});

  const [settings, poPeriod, tiers, productsRes, variantsRes, addonsRes, quotasRes] =
    await Promise.all([
      getStoreSettings(),
      getActivePoPeriod(),
      getMemberTiers(),
      dbQuery<{
        id: number;
        slug: string;
        name: string;
        short_description: string;
        base_price: number;
        requires_thermal_bag: boolean;
        has_variants: boolean;
        variant_label: string;
        illustration_key: string;
        is_active: boolean;
        sort_order: number;
      }>(
        includeInactive
          ? `SELECT * FROM products ORDER BY sort_order ASC, id ASC`
          : `SELECT * FROM products WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`
      ),
      dbQuery<{
        id: number;
        product_id: number;
        name: string;
        price_delta: number;
        is_available: boolean;
      }>(`SELECT * FROM product_variants ORDER BY sort_order ASC, id ASC`),
      dbQuery<{
        id: number;
        product_id: number;
        name: string;
        price: number;
        is_available: boolean;
      }>(`SELECT * FROM product_addons ORDER BY sort_order ASC, id ASC`),
      dbQuery<{
        product_id: number;
        total_quota: number;
        reserved_count: number;
      }>(
        `SELECT product_id, total_quota, reserved_count
         FROM po_quotas
         WHERE po_period_id = (SELECT id FROM po_periods ORDER BY is_active DESC, id DESC LIMIT 1)`
      ),
    ]);

  const quotaMap = new Map<number, { totalQuota: number; reservedCount: number }>();
  for (const q of quotasRes.rows) {
    quotaMap.set(q.product_id, {
      totalQuota: Number(q.total_quota),
      reservedCount: Number(q.reserved_count),
    });
  }

  const products: ProductWithDetails[] = productsRes.rows.map((p) => {
    const variants = variantsRes.rows
      .filter((v) => v.product_id === p.id && (includeInactive || v.is_available))
      .map((v) => ({
        id: v.id,
        productId: v.product_id,
        name: v.name,
        priceDelta: Number(v.price_delta),
        isAvailable: v.is_available,
      }));

    const addons = addonsRes.rows
      .filter((a) => a.product_id === p.id && (includeInactive || a.is_available))
      .map((a) => ({
        id: a.id,
        productId: a.product_id,
        name: a.name,
        price: Number(a.price),
        isAvailable: a.is_available,
      }));

    const availableDeltas = variants.filter((v) => v.isAvailable).map((v) => v.priceDelta);
    const minDelta =
      p.has_variants && availableDeltas.length > 0 ? Math.min(...availableDeltas) : 0;

    const q = quotaMap.get(p.id) ?? { totalQuota: 0, reservedCount: 0 };
    const remainingQuota = Math.max(0, q.totalQuota - q.reservedCount);

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.short_description,
      basePrice: Number(p.base_price),
      startingPrice: Number(p.base_price) + minDelta,
      requiresThermalBag: p.requires_thermal_bag,
      hasVariants: p.has_variants,
      variantLabel: p.variant_label,
      illustrationKey: p.illustration_key,
      isActive: p.is_active,
      variants,
      addons,
      totalQuota: q.totalQuota,
      reservedCount: q.reservedCount,
      remainingQuota,
    };
  });

  return {
    settings,
    poPeriod,
    tiers,
    products,
    serverInstanceId: getServerInstanceId(),
    dbEngine: getDbEngineMode(),
  };
}

function generateOrderCode(): string {
  const now = new Date();
  const ymd = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;
  // 32-bit cryptographic entropy (4.29 billion combinations/day) prevents order enumeration
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `BNT-${ymd}-${suffix}`;
}

export async function createCheckoutOrder(params: {
  userId: number | null;
  recipientName: string;
  recipientWhatsapp: string;
  fulfillmentMethod: FulfillmentMethod;
  fulfillmentDate?: string;
  deliveryAddress?: string;
  notes?: string;
  selections: CartSelectionInput[];
}): Promise<OrderRecord> {
  const recipientName = params.recipientName.trim();
  const recipientWhatsapp = params.recipientWhatsapp.trim();
  const fulfillmentMethod = params.fulfillmentMethod;
  const deliveryAddress = (params.deliveryAddress ?? "").trim();
  const notes = (params.notes ?? "").trim();

  if (!recipientName || recipientName.length > 120) {
    throw new BusinessRuleError("Nama penerima wajib diisi (maksimal 120 karakter).");
  }
  if (!/^[0-9+\-\s]{9,20}$/.test(recipientWhatsapp)) {
    throw new BusinessRuleError("Nomor WhatsApp tidak valid.");
  }
  if (fulfillmentMethod !== "pickup" && fulfillmentMethod !== "delivery") {
    throw new BusinessRuleError("Metode penerimaan pesanan tidak valid.");
  }
  if (fulfillmentMethod === "delivery" && (deliveryAddress.length < 6 || deliveryAddress.length > 500)) {
    throw new BusinessRuleError("Alamat pengantaran wajib diisi lengkap (6–500 karakter).");
  }
  if (notes.length > 500) {
    throw new BusinessRuleError("Catatan pesanan maksimal 500 karakter.");
  }
  if (!Array.isArray(params.selections) || params.selections.length === 0 || params.selections.length > 30) {
    throw new BusinessRuleError("Keranjang pesanan tidak valid.");
  }

  await expireOverdueOrders(true);

  const orderCode = generateOrderCode();

  const createdOrderId = await withTransaction(async (tx) => {
    const periodRes = await tx.query<{
      id: number;
      name: string;
      opens_at: string | Date;
      closes_at: string | Date;
      fulfillment_date: string | Date;
      is_active: boolean;
    }>(`SELECT * FROM po_periods WHERE is_active = TRUE ORDER BY id DESC LIMIT 1`);

    const period = periodRes.rows[0];
    if (!period) {
      throw new BusinessRuleError("PO ditutup. Belum ada periode pre-order yang aktif.", 409);
    }

    const nowMs = Date.now();
    if (
      nowMs < new Date(period.opens_at).getTime() ||
      nowMs > new Date(period.closes_at).getTime()
    ) {
      throw new BusinessRuleError(
        "PO ditutup. Pesanan hanya dapat dibuat saat periode pre-order berlangsung.",
        409
      );
    }

    const qtyByProduct = new Map<number, number>();
    for (const sel of params.selections) {
      const qty = Math.floor(Number(sel.quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BusinessRuleError("Jumlah item pesanan harus minimal 1.");
      }
      qtyByProduct.set(sel.productId, (qtyByProduct.get(sel.productId) ?? 0) + qty);
    }

    const sortedProductIds = Array.from(qtyByProduct.keys()).sort((a, b) => a - b);

    const productMap = new Map<
      number,
      {
        id: number;
        name: string;
        base_price: number;
        requires_thermal_bag: boolean;
        has_variants: boolean;
        is_active: boolean;
      }
    >();

    for (const pid of sortedProductIds) {
      const prodRes = await tx.query<{
        id: number;
        name: string;
        base_price: number;
        requires_thermal_bag: boolean;
        has_variants: boolean;
        is_active: boolean;
      }>(
        `SELECT id, name, base_price, requires_thermal_bag, has_variants, is_active
         FROM products WHERE id = $1`,
        [pid]
      );
      const prod = prodRes.rows[0];
      if (!prod || !prod.is_active) {
        throw new BusinessRuleError("Salah satu produk di keranjang tidak tersedia.");
      }
      productMap.set(pid, prod);

      const quotaRes = await tx.query<{
        id: number;
        total_quota: number;
        reserved_count: number;
      }>(
        `SELECT id, total_quota, reserved_count
         FROM po_quotas
         WHERE po_period_id = $1 AND product_id = $2
         FOR UPDATE`,
        [period.id, pid]
      );

      const quota = quotaRes.rows[0];
      const remaining = quota ? Number(quota.total_quota) - Number(quota.reserved_count) : 0;
      const requested = qtyByProduct.get(pid) ?? 0;

      if (!quota || remaining < requested) {
        const msg =
          remaining <= 0
            ? `Maaf, kuota untuk ${prod.name} sudah habis.`
            : `Maaf, sisa kuota untuk ${prod.name} tinggal ${remaining} porsi.`;
        throw new BusinessRuleError(msg, 409);
      }
    }

    const pricedLines: PricedLineInput[] = [];
    for (const sel of params.selections) {
      const prod = productMap.get(sel.productId)!;
      let variantId: number | null = null;
      let variantName = "";
      let variantDelta = 0;

      if (prod.has_variants) {
        if (!sel.variantId) {
          throw new BusinessRuleError(`Varian wajib dipilih untuk ${prod.name}.`);
        }
        const varRes = await tx.query<{
          id: number;
          name: string;
          price_delta: number;
          is_available: boolean;
        }>(
          `SELECT id, name, price_delta, is_available
           FROM product_variants
           WHERE id = $1 AND product_id = $2`,
          [sel.variantId, prod.id]
        );
        const variant = varRes.rows[0];
        if (!variant || !variant.is_available) {
          throw new BusinessRuleError(`Varian yang dipilih untuk ${prod.name} tidak tersedia.`);
        }
        variantId = variant.id;
        variantName = variant.name;
        variantDelta = Number(variant.price_delta);
      }

      const uniqueAddonIds = Array.from(new Set(sel.addonIds ?? []));
      const resolvedAddons: Array<{ id: number; name: string; price: number }> = [];
      for (const aid of uniqueAddonIds) {
        const addonRes = await tx.query<{
          id: number;
          name: string;
          price: number;
          is_available: boolean;
        }>(
          `SELECT id, name, price, is_available
           FROM product_addons
           WHERE id = $1 AND product_id = $2`,
          [aid, prod.id]
        );
        const addon = addonRes.rows[0];
        if (!addon || !addon.is_available) {
          throw new BusinessRuleError(`Tambahan yang dipilih untuk ${prod.name} tidak tersedia.`);
        }
        resolvedAddons.push({
          id: addon.id,
          name: addon.name,
          price: Number(addon.price),
        });
      }

      pricedLines.push({
        productId: prod.id,
        productName: prod.name,
        basePrice: Number(prod.base_price),
        variantId,
        variantName,
        variantDelta,
        addons: resolvedAddons,
        quantity: Math.floor(Number(sel.quantity)),
        requiresThermalBag: prod.requires_thermal_bag,
      });
    }

    const settingsRes = await tx.query<{
      thermal_bag_capacity: number;
      thermal_bag_price: number;
      delivery_fee: number;
      payment_timeout_minutes: number;
    }>(`SELECT * FROM store_settings WHERE id = 1`);
    const sRow = settingsRes.rows[0];

    let isMember = false;
    let tierObj: Pick<MemberTier, "name" | "discountPercent" | "minPurchase"> | null = null;

    if (params.userId) {
      const userRes = await tx.query<{
        is_member: boolean;
        member_tier_slug: string;
      }>(`SELECT is_member, member_tier_slug FROM users WHERE id = $1`, [params.userId]);
      const uRow = userRes.rows[0];
      if (uRow?.is_member) {
        isMember = true;
        const tRes = await tx.query<{
          name: string;
          discount_percent: string;
          min_purchase: number;
        }>(`SELECT name, discount_percent, min_purchase FROM member_tiers WHERE slug = $1`, [
          uRow.member_tier_slug,
        ]);
        if (tRes.rows[0]) {
          tierObj = {
            name: tRes.rows[0].name,
            discountPercent: Number(tRes.rows[0].discount_percent),
            minPurchase: Number(tRes.rows[0].min_purchase),
          };
        }
      }
    }

    const calc = calculateOrderTotals({
      lines: pricedLines,
      settings: {
        thermalBagCapacity: Number(sRow?.thermal_bag_capacity ?? 2),
        thermalBagPrice: Number(sRow?.thermal_bag_price ?? 8000),
        deliveryFee: Number(sRow?.delivery_fee ?? 12000),
      },
      tier: tierObj,
      isMember,
      fulfillmentMethod,
    });

    for (const pid of sortedProductIds) {
      const requested = qtyByProduct.get(pid) ?? 0;
      await tx.query(
        `UPDATE po_quotas
         SET reserved_count = reserved_count + $1
         WHERE po_period_id = $2 AND product_id = $3`,
        [requested, period.id, pid]
      );
    }

    const timeoutMinutes = Number(sRow?.payment_timeout_minutes ?? 10);
    const qrisCharge = await createQrisCharge({
      orderCode,
      grandTotal: calc.grandTotal,
      timeoutMinutes,
      customerName: recipientName,
    });

    const chosenDate = addDaysFromToday(PO_MIN_LEAD_DAYS);
    const orderInsert = await tx.query<{ id: number }>(
      `INSERT INTO orders (
        order_code, po_period_id, user_id, recipient_name, recipient_whatsapp,
        fulfillment_method, fulfillment_date, delivery_address, notes,
        subtotal, tier_name_snapshot, discount_percent_snapshot, min_purchase_snapshot, discount_amount,
        thermal_bag_count, thermal_bag_unit_price_snapshot, thermal_bag_cost,
        shipping_cost, grand_total, status, payment_provider, payment_reference,
        qris_string, qris_expires_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, 'menunggu_pembayaran', $20, $21,
        $22, $23
      ) RETURNING id`,
      [
        orderCode,
        period.id,
        params.userId,
        recipientName,
        recipientWhatsapp,
        fulfillmentMethod,
        chosenDate,
        deliveryAddress,
        notes,
        calc.subtotal,
        calc.tierName,
        calc.discountPercent,
        calc.minPurchase,
        calc.discountAmount,
        calc.thermalBagCount,
        calc.thermalBagUnitPrice,
        calc.thermalBagCost,
        calc.shippingCost,
        calc.grandTotal,
        qrisCharge.provider,
        qrisCharge.paymentReference,
        qrisCharge.qrisString,
        qrisCharge.expiresAt.toISOString(),
      ]
    );

    const newOrderId = orderInsert.rows[0].id;

    for (const line of calc.items) {
      await tx.query(
        `INSERT INTO order_items (
          order_id, product_id, product_name_snapshot,
          variant_id, variant_name_snapshot, addons_snapshot,
          unit_base_price_snapshot, variant_delta_snapshot, addons_total_snapshot,
          unit_total_price_snapshot, quantity, line_total_snapshot, requires_thermal_bag_snapshot
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13)`,
        [
          newOrderId,
          line.productId,
          line.productName,
          line.variantId,
          line.variantName,
          JSON.stringify(line.addons),
          line.basePrice,
          line.variantDelta,
          line.addonsTotal,
          line.unitTotalPrice,
          line.quantity,
          line.lineTotal,
          line.requiresThermalBag,
        ]
      );
    }

    return newOrderId;
  });

  const fullOrder = await getOrderByCode(orderCode);
  if (!fullOrder || fullOrder.id !== createdOrderId) {
    throw new Error("Gagal memuat pesanan yang baru dibuat.");
  }
  return fullOrder;
}

export async function getOrderByCode(orderCode: string): Promise<OrderRecord | null> {
  await expireOverdueOrders();

  const res = await dbQuery<{
    id: number;
    order_code: string;
    po_period_id: number;
    po_period_name: string;
    user_id: number | null;
    recipient_name: string;
    recipient_whatsapp: string;
    fulfillment_method: FulfillmentMethod;
    fulfillment_date: string | Date;
    delivery_address: string;
    notes: string;
    subtotal: number;
    tier_name_snapshot: string;
    discount_percent_snapshot: string;
    min_purchase_snapshot: number;
    discount_amount: number;
    thermal_bag_count: number;
    thermal_bag_unit_price_snapshot: number;
    thermal_bag_cost: number;
    shipping_cost: number;
    grand_total: number;
    status: OrderStatus;
    payment_provider: string;
    payment_reference: string;
    qris_string: string;
    qris_expires_at: string | Date;
    paid_at: string | Date | null;
    created_at: string | Date;
  }>(
    `SELECT o.*, p.name AS po_period_name
     FROM orders o
     LEFT JOIN po_periods p ON p.id = o.po_period_id
     WHERE o.order_code = $1`,
    [orderCode]
  );

  const row = res.rows[0];
  if (!row) return null;

  const itemsRes = await dbQuery<{
    id: number;
    product_id: number;
    product_name_snapshot: string;
    variant_id: number | null;
    variant_name_snapshot: string;
    addons_snapshot: unknown;
    unit_base_price_snapshot: number;
    variant_delta_snapshot: number;
    addons_total_snapshot: number;
    unit_total_price_snapshot: number;
    quantity: number;
    line_total_snapshot: number;
    requires_thermal_bag_snapshot: boolean;
  }>(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC`, [row.id]);

  return mapOrderRow(row, itemsRes.rows);
}

export async function listOrders(filter?: {
  userId?: number;
  poPeriodId?: number;
}): Promise<OrderRecord[]> {
  void expireOverdueOrders().catch(() => {});

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.userId !== undefined) {
    params.push(filter.userId);
    clauses.push(`o.user_id = $${params.length}`);
  }
  if (filter?.poPeriodId !== undefined) {
    params.push(filter.poPeriodId);
    clauses.push(`o.po_period_id = $${params.length}`);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const ordersRes = await dbQuery<{
    id: number;
    order_code: string;
    po_period_id: number;
    po_period_name: string;
    user_id: number | null;
    recipient_name: string;
    recipient_whatsapp: string;
    fulfillment_method: FulfillmentMethod;
    fulfillment_date: string | Date;
    delivery_address: string;
    notes: string;
    subtotal: number;
    tier_name_snapshot: string;
    discount_percent_snapshot: string;
    min_purchase_snapshot: number;
    discount_amount: number;
    thermal_bag_count: number;
    thermal_bag_unit_price_snapshot: number;
    thermal_bag_cost: number;
    shipping_cost: number;
    grand_total: number;
    status: OrderStatus;
    payment_provider: string;
    payment_reference: string;
    qris_string: string;
    qris_expires_at: string | Date;
    paid_at: string | Date | null;
    created_at: string | Date;
  }>(
    `SELECT o.*, p.name AS po_period_name
     FROM orders o
     LEFT JOIN po_periods p ON p.id = o.po_period_id
     ${whereSql}
     ORDER BY o.created_at DESC, o.id DESC`,
    params
  );

  if (ordersRes.rows.length === 0) return [];

  const orderIds = ordersRes.rows.map((r) => r.id);
  const placeholders = orderIds.map((_, idx) => `$${idx + 1}`).join(",");
  const allItemsRes = await dbQuery<{
    id: number;
    order_id: number;
    product_id: number;
    product_name_snapshot: string;
    variant_id: number | null;
    variant_name_snapshot: string;
    addons_snapshot: unknown;
    unit_base_price_snapshot: number;
    variant_delta_snapshot: number;
    addons_total_snapshot: number;
    unit_total_price_snapshot: number;
    quantity: number;
    line_total_snapshot: number;
    requires_thermal_bag_snapshot: boolean;
  }>(`SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`, orderIds);

  const itemsByOrder = new Map<number, typeof allItemsRes.rows>();
  for (const item of allItemsRes.rows) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  }

  return ordersRes.rows.map((row) => mapOrderRow(row, itemsByOrder.get(row.id) ?? []));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrderRow(row: any, itemRows: any[]): OrderRecord {
  const items: OrderItemRecord[] = itemRows.map((ir) => {
    let parsedAddons: Array<{ id: number; name: string; price: number }> = [];
    if (Array.isArray(ir.addons_snapshot)) {
      parsedAddons = ir.addons_snapshot;
    } else if (typeof ir.addons_snapshot === "string") {
      try {
        parsedAddons = JSON.parse(ir.addons_snapshot);
      } catch {
        parsedAddons = [];
      }
    }
    return {
      id: ir.id,
      productId: ir.product_id,
      productNameSnapshot: ir.product_name_snapshot,
      variantId: ir.variant_id,
      variantNameSnapshot: ir.variant_name_snapshot,
      addonsSnapshot: parsedAddons,
      unitBasePriceSnapshot: Number(ir.unit_base_price_snapshot),
      variantDeltaSnapshot: Number(ir.variant_delta_snapshot),
      addonsTotalSnapshot: Number(ir.addons_total_snapshot),
      unitTotalPriceSnapshot: Number(ir.unit_total_price_snapshot),
      quantity: Number(ir.quantity),
      lineTotalSnapshot: Number(ir.line_total_snapshot),
      requiresThermalBagSnapshot: Boolean(ir.requires_thermal_bag_snapshot),
    };
  });

  const fulfillmentDate =
    row.fulfillment_date instanceof Date
      ? row.fulfillment_date.toISOString().slice(0, 10)
      : String(row.fulfillment_date).slice(0, 10);

  return {
    id: row.id,
    orderCode: row.order_code,
    poPeriodId: row.po_period_id,
    poPeriodName: row.po_period_name ?? undefined,
    userId: row.user_id,
    recipientName: row.recipient_name,
    recipientWhatsapp: row.recipient_whatsapp,
    fulfillmentMethod: row.fulfillment_method,
    fulfillmentDate,
    deliveryAddress: row.delivery_address,
    notes: row.notes,
    subtotal: Number(row.subtotal),
    tierNameSnapshot: row.tier_name_snapshot,
    discountPercentSnapshot: Number(row.discount_percent_snapshot),
    minPurchaseSnapshot: Number(row.min_purchase_snapshot),
    discountAmount: Number(row.discount_amount),
    thermalBagCount: Number(row.thermal_bag_count),
    thermalBagUnitPriceSnapshot: Number(row.thermal_bag_unit_price_snapshot),
    thermalBagCost: Number(row.thermal_bag_cost),
    shippingCost: Number(row.shipping_cost),
    grandTotal: Number(row.grand_total),
    status: row.status,
    paymentProvider: row.payment_provider,
    paymentReference: row.payment_reference,
    qrisString: row.qris_string,
    qrisExpiresAt: new Date(row.qris_expires_at).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    items,
  };
}

export async function applyPaymentWebhookTransition(params: {
  orderCode: string;
  transactionStatus: "settlement" | "capture" | "paid" | "expire" | "cancel" | "deny";
}): Promise<{ order: OrderRecord; changed: boolean }> {
  const { orderCode, transactionStatus } = params;

  const changed = await withTransaction(async (tx) => {
    const res = await tx.query<{
      id: number;
      po_period_id: number;
      user_id: number | null;
      status: OrderStatus;
      quota_released: boolean;
    }>(
      `SELECT id, po_period_id, user_id, status, quota_released
       FROM orders
       WHERE order_code = $1
       FOR UPDATE`,
      [orderCode]
    );

    const ord = res.rows[0];
    if (!ord) {
      throw new BusinessRuleError("Pesanan tidak ditemukan.", 404);
    }

    if (
      transactionStatus === "settlement" ||
      transactionStatus === "capture" ||
      transactionStatus === "paid"
    ) {
      if (ord.status === "diproses" || ord.status === "siap" || ord.status === "selesai") {
        return false;
      }
      if (ord.status !== "menunggu_pembayaran") {
        throw new BusinessRuleError(
          `Pesanan berstatus ${ord.status} tidak dapat ditandai lunas.`,
          409
        );
      }

      await tx.query(
        `UPDATE orders
         SET status = 'diproses', paid_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [ord.id]
      );

      if (ord.user_id) {
        const userRes = await tx.query<{ is_member: boolean }>(
          `SELECT is_member FROM users WHERE id = $1`,
          [ord.user_id]
        );
        if (userRes.rows[0]?.is_member) {
          const countRes = await tx.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt FROM orders
             WHERE user_id = $1 AND status IN ('diproses', 'siap', 'selesai')`,
            [ord.user_id]
          );
          const paidCount = Number(countRes.rows[0]?.cnt ?? 0);

          const bestTierRes = await tx.query<{ slug: string }>(
            `SELECT slug FROM member_tiers
             WHERE slug != 'non-member' AND min_paid_orders <= $1
             ORDER BY discount_percent DESC, min_paid_orders DESC
             LIMIT 1`,
            [paidCount]
          );
          if (bestTierRes.rows[0]?.slug) {
            await tx.query(`UPDATE users SET member_tier_slug = $1 WHERE id = $2`, [
              bestTierRes.rows[0].slug,
              ord.user_id,
            ]);
          }
        }
      }

      return true;
    }

    const nextStatus: OrderStatus =
      transactionStatus === "expire" ? "kedaluwarsa" : "dibatalkan";

    if (ord.status === nextStatus) {
      return false;
    }
    if (ord.status !== "menunggu_pembayaran") {
      return false;
    }

    if (!ord.quota_released) {
      await releaseOrderQuotaInTx(tx, ord.id, ord.po_period_id);
    }

    await tx.query(
      `UPDATE orders
       SET status = $1, quota_released = TRUE, updated_at = NOW()
       WHERE id = $2`,
      [nextStatus, ord.id]
    );

    return true;
  });

  const updated = await getOrderByCode(orderCode);
  if (!updated) throw new BusinessRuleError("Pesanan tidak ditemukan.", 404);
  return { order: updated, changed };
}

export async function updateOrderStatusByAdmin(
  orderCode: string,
  nextStatus: OrderStatus
): Promise<OrderRecord> {
  const allowed: OrderStatus[] = [
    "menunggu_pembayaran",
    "diproses",
    "siap",
    "selesai",
    "dibatalkan",
    "kedaluwarsa",
  ];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleError("Status pesanan tidak valid.");
  }

  await withTransaction(async (tx) => {
    const res = await tx.query<{
      id: number;
      po_period_id: number;
      user_id: number | null;
      status: OrderStatus;
      quota_released: boolean;
      paid_at: string | Date | null;
    }>(
      `SELECT id, po_period_id, user_id, status, quota_released, paid_at
       FROM orders
       WHERE order_code = $1
       FOR UPDATE`,
      [orderCode]
    );
    const ord = res.rows[0];
    if (!ord) throw new BusinessRuleError("Pesanan tidak ditemukan.", 404);

    const isCancelledOrExpired =
      nextStatus === "dibatalkan" || nextStatus === "kedaluwarsa";
    const isPaidStage =
      nextStatus === "diproses" || nextStatus === "siap" || nextStatus === "selesai";

    let nextQuotaReleased = Boolean(ord.quota_released);

    if (isCancelledOrExpired && !ord.quota_released) {
      await releaseOrderQuotaInTx(tx, ord.id, ord.po_period_id);
      nextQuotaReleased = true;
    } else if (!isCancelledOrExpired && ord.quota_released) {
      const itemsRes = await tx.query<{ product_id: number; qty: string }>(
        `SELECT product_id, SUM(quantity)::text AS qty
         FROM order_items
         WHERE order_id = $1 AND product_id IS NOT NULL
         GROUP BY product_id
         ORDER BY product_id ASC`,
        [ord.id]
      );
      for (const row of itemsRes.rows) {
        await tx.query(
          `UPDATE po_quotas
           SET reserved_count = reserved_count + $1
           WHERE po_period_id = $2 AND product_id = $3`,
          [Number(row.qty), ord.po_period_id, row.product_id]
        );
      }
      nextQuotaReleased = false;
    }

    const nextPaidAt = isPaidStage
      ? ord.paid_at
        ? new Date(ord.paid_at).toISOString()
        : new Date().toISOString()
      : null;

    if (nextStatus === "menunggu_pembayaran") {
      const sRes = await tx.query<{ payment_timeout_minutes: number }>(
        `SELECT payment_timeout_minutes FROM store_settings WHERE id = 1`
      );
      const timeoutMin = Number(sRes.rows[0]?.payment_timeout_minutes ?? 10);
      const extendedExpiresAt = new Date(Date.now() + timeoutMin * 60_000).toISOString();
      await tx.query(
        `UPDATE orders
         SET status = $1,
             quota_released = $2,
             paid_at = $3,
             qris_expires_at = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [nextStatus, nextQuotaReleased, nextPaidAt, extendedExpiresAt, ord.id]
      );
    } else {
      await tx.query(
        `UPDATE orders
         SET status = $1,
             quota_released = $2,
             paid_at = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [nextStatus, nextQuotaReleased, nextPaidAt, ord.id]
      );
    }

    if (ord.user_id) {
      const userRes = await tx.query<{ is_member: boolean }>(
        `SELECT is_member FROM users WHERE id = $1`,
        [ord.user_id]
      );
      if (userRes.rows[0]?.is_member) {
        const countRes = await tx.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM orders
           WHERE user_id = $1 AND status IN ('diproses', 'siap', 'selesai')`,
          [ord.user_id]
        );
        const paidCount = Number(countRes.rows[0]?.cnt ?? 0);
        const bestTierRes = await tx.query<{ slug: string }>(
          `SELECT slug FROM member_tiers
           WHERE slug != 'non-member' AND min_paid_orders <= $1
           ORDER BY discount_percent DESC, min_paid_orders DESC
           LIMIT 1`,
          [paidCount]
        );
        if (bestTierRes.rows[0]?.slug) {
          await tx.query(`UPDATE users SET member_tier_slug = $1 WHERE id = $2`, [
            bestTierRes.rows[0].slug,
            ord.user_id,
          ]);
        }
      }
    }
  });

  const updated = await getOrderByCode(orderCode);
  if (!updated) throw new BusinessRuleError("Pesanan tidak ditemukan.", 404);
  return updated;
}
