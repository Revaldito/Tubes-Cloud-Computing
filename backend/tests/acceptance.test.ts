import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

process.env.PGLITE_DATA_DIR = "memory://";
process.env.DATABASE_URL = "";
process.env.PAYMENT_MODE = "demo";
process.env.WEBHOOK_SECRET = "test-webhook-secret";
process.env.ADMIN_EMAIL = "test-admin@banatier.local";
process.env.ADMIN_PASSWORD = "TestAdmin#2026";

import { dbQuery, resetTestDatabase } from "../src/db";
import { calculateOrderTotals } from "../src/pricing";
import {
  applyPaymentWebhookTransition,
  createCheckoutOrder,
  getCatalogWithQuotas,
  getOrderByCode,
} from "../src/store-service";
import { computeDemoWebhookSignature, verifyWebhookSignature } from "../src/payment";
import { buildWhatsappInvoiceMessage } from "../src/whatsapp";
import { handleApiRequest } from "../src/app";

/**
 * Helper to invoke Backend HTTP API router directly in-memory without requiring TCP sockets.
 */
async function callApi(
  method: string,
  url: string,
  body?: unknown,
  cookie?: string,
  origin?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ statusCode: number; json: any; headers: Record<string, string> }> {
  const payload = body ? Buffer.from(JSON.stringify(body), "utf8") : Buffer.alloc(0);
  const stream = Readable.from(payload.length > 0 ? [payload] : []) as unknown as IncomingMessage;
  stream.method = method;
  stream.url = url;
  stream.headers = {
    host: "localhost:4000",
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    ...(origin ? { origin } : {}),
  };

  const headers: Record<string, string> = {};
  let rawBody = "";
  const res = {
    statusCode: 200,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = String(v);
    },
    end(chunk?: string) {
      if (chunk) rawBody += chunk;
    },
  } as unknown as ServerResponse;

  await handleApiRequest(stream, res);
  return {
    statusCode: res.statusCode,
    json: rawBody ? JSON.parse(rawBody) : null,
    headers,
  };
}

async function runTests() {
  console.log("=== Banatier Separated Backend Acceptance & API Tests ===");
  await resetTestDatabase();

  // 1. Health & Catalog HTTP API checks
  const healthRes = await callApi("GET", "/api/health");
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.json.status, "healthy");

  const catalogRes = await callApi("GET", "/api/catalog");
  assert.equal(catalogRes.statusCode, 200);
  assert.equal(catalogRes.json.products.length, 5, "Harus menampilkan kelima produk utama (FR-001)");
  console.log("✔ API /api/health & /api/catalog merespons 200 OK dengan 5 produk utama");

  // 2. FR-011 Thermal bag calculation & FR-016 calculation order
  const withThreeSplits = calculateOrderTotals({
    lines: [
      {
        productId: 3,
        productName: "Banana Split",
        basePrice: 32000,
        variantId: 5,
        variantName: "Vanilla Bean",
        variantDelta: 0,
        addons: [],
        quantity: 3,
        requiresThermalBag: true,
      },
    ],
    settings: { thermalBagCapacity: 2, thermalBagPrice: 8000, deliveryFee: 12000 },
    tier: { name: "Banatier Member", discountPercent: 10, minPurchase: 75000 },
    isMember: true,
    fulfillmentMethod: "delivery",
  });
  assert.equal(withThreeSplits.thermalBagCount, 2);
  assert.equal(withThreeSplits.thermalBagCost, 16000);
  assert.equal(withThreeSplits.discountAmount, 9600);
  assert.equal(withThreeSplits.grandTotal, 114400);
  console.log("✔ FR-011 & FR-016: Thermal bag otomatis ceil(N/K) & urutan perhitungan diskon/total tepat");

  // 3. FR-015 Minimum purchase shortfall check
  const belowMin = calculateOrderTotals({
    lines: [
      {
        productId: 4,
        productName: "Banofee",
        basePrice: 38000,
        variantId: null,
        variantName: "",
        variantDelta: 0,
        addons: [],
        quantity: 1,
        requiresThermalBag: false,
      },
    ],
    settings: { thermalBagCapacity: 2, thermalBagPrice: 8000, deliveryFee: 12000 },
    tier: { name: "Banatier Member", discountPercent: 10, minPurchase: 75000 },
    isMember: true,
    fulfillmentMethod: "pickup",
  });
  assert.equal(belowMin.discountAmount, 0);
  assert.equal(belowMin.shortfallToDiscount, 37000);
  console.log("✔ FR-015: Subtotal < minimum purchase tidak mendapat diskon & menghitung selisih akurat");

  // 4. FR-008 Concurrent checkout when remaining quota = 1
  const catalog = await getCatalogWithQuotas(false);
  const banofee = catalog.products.find((p) => p.slug === "banofee")!;
  await dbQuery(`UPDATE po_quotas SET total_quota = 1, reserved_count = 0 WHERE product_id = $1`, [
    banofee.id,
  ]);

  const [attemptA, attemptB] = await Promise.allSettled([
    createCheckoutOrder({
      userId: null,
      recipientName: "Pembeli Satu",
      recipientWhatsapp: "081211111111",
      fulfillmentMethod: "pickup",
      selections: [{ productId: banofee.id, quantity: 1 }],
    }),
    createCheckoutOrder({
      userId: null,
      recipientName: "Pembeli Dua",
      recipientWhatsapp: "081222222222",
      fulfillmentMethod: "pickup",
      selections: [{ productId: banofee.id, quantity: 1 }],
    }),
  ]);

  const fulfilled = [attemptA, attemptB].filter((r) => r.status === "fulfilled");
  const rejected = [attemptA, attemptB].filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  console.log("✔ FR-008: Checkout paralel pada sisa kuota 1 mencegah overselling (1 sukses, 1 kuota habis)");

  // 5. FR-012 Snapshot price immutability
  const winningOrder = (
    fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createCheckoutOrder>>>
  ).value;
  const expiryMinutes = Math.round(
    (new Date(winningOrder.qrisExpiresAt).getTime() - new Date(winningOrder.createdAt).getTime()) /
      60000
  );
  assert.equal(expiryMinutes, 10, "Batas waktu pembayaran QRIS harus 10 menit");
  const originalTotal = winningOrder.grandTotal;
  await dbQuery(`UPDATE products SET base_price = 99000 WHERE id = $1`, [banofee.id]);
  const reloadedOrder = await getOrderByCode(winningOrder.orderCode);
  assert.equal(reloadedOrder?.grandTotal, originalTotal);
  console.log("✔ FR-012: Perubahan harga menu oleh Admin tidak mengubah total pesanan lama");

  // 6. FR-019..021 & NFR-004 Webhook Signature + Idempotency via HTTP API
  const badWebhook = await callApi("POST", "/api/webhooks/payment", {
    orderCode: winningOrder.orderCode,
    transactionStatus: "settlement",
    grossAmount: winningOrder.grandTotal,
    signatureKey: "invalid-signature",
  });
  assert.equal(badWebhook.statusCode, 401);

  const validSig = computeDemoWebhookSignature(
    winningOrder.orderCode,
    "settlement",
    winningOrder.grandTotal
  );
  assert.equal(
    verifyWebhookSignature({
      provider: "demo",
      orderCode: winningOrder.orderCode,
      transactionStatus: "settlement",
      grossAmount: winningOrder.grandTotal,
      signatureKey: validSig,
    }),
    true
  );

  const goodWebhook = await callApi("POST", "/api/webhooks/payment", {
    orderCode: winningOrder.orderCode,
    transactionStatus: "settlement",
    grossAmount: winningOrder.grandTotal,
    signatureKey: validSig,
  });
  assert.equal(goodWebhook.statusCode, 200);
  assert.equal(goodWebhook.json.order.status, "diproses");

  const dupWebhook = await applyPaymentWebhookTransition({
    orderCode: winningOrder.orderCode,
    transactionStatus: "settlement",
  });
  assert.equal(dupWebhook.changed, false);
  console.log("✔ FR-019..021 & NFR-004: Endpoint HTTP Webhook menolak signature palsu & memproses lunas idempotent");

  // 6b. Guest Order Tracking (Kode Pesanan + Nomor WhatsApp) & WhatsApp Invoice Builder
  const wrongWaTrack = await callApi(
    "GET",
    `/api/orders/track?code=${encodeURIComponent(winningOrder.orderCode)}&whatsapp=089999999999`
  );
  assert.equal(wrongWaTrack.statusCode, 404, "Nomor WA yang tidak cocok wajib ditolak (404)");

  const normalizedPhoneVariant = winningOrder.recipientWhatsapp.replace(/^0/, "+62");
  const validTrack = await callApi(
    "GET",
    `/api/orders/track?code=${encodeURIComponent(winningOrder.orderCode)}&whatsapp=${encodeURIComponent(
      normalizedPhoneVariant
    )}`
  );
  assert.equal(validTrack.statusCode, 200);
  assert.equal(validTrack.json.order.orderCode, winningOrder.orderCode);

  const invoiceMsg = buildWhatsappInvoiceMessage(validTrack.json.order, "paid");
  assert.ok(invoiceMsg.includes(winningOrder.orderCode));
  assert.ok(invoiceMsg.includes("/orders"));
  console.log("✔ FR-022 & WA Invoice: Lacak pesanan Kode+WA tervalidasi aman & format invoice WA lengkap");

  // 7. Auth Login via HTTP API + Admin Overview Protection
  const unauthAdmin = await callApi("GET", "/api/admin/overview");
  assert.equal(unauthAdmin.statusCode, 403);

  // Pastikan akun demo publik lama sudah tidak ada, dan registrasi pembeli asli berjalan normal
  const oldDemoLogin = await callApi("POST", "/api/auth/login", {
    email: "admin@banatier.id",
    password: "admin123",
  });
  assert.equal(oldDemoLogin.statusCode, 401, "Akun demo admin publik lama wajib tidak aktif");

  const regBuyer = await callApi("POST", "/api/auth/register", {
    name: "Pelanggan Asli",
    email: "pelanggan@banatier.id",
    whatsapp: "081277776666",
    password: "password123",
    joinAsMember: true,
  });
  assert.equal(regBuyer.statusCode, 201);

  const adminLogin = await callApi("POST", "/api/auth/login", {
    email: "test-admin@banatier.local",
    password: "TestAdmin#2026",
  });
  assert.equal(adminLogin.statusCode, 200);
  const setCookie = adminLogin.headers["set-cookie"]?.split(";")[0] ?? "";
  const authAdmin = await callApi("GET", "/api/admin/overview", undefined, setCookie);
  assert.equal(authAdmin.statusCode, 200);
  assert.ok(Array.isArray(authAdmin.json.users) && authAdmin.json.users.length >= 2);

  // Admin CRUD Menu: Create -> Update -> Delete + PO Toggle OFF/ON sync to Customer Catalog
  const createdMenu = await callApi(
    "POST",
    "/api/admin/catalog",
    {
      name: "Pisang Karamel Crispy",
      shortDescription: "Pisang raja renyah dengan saus karamel.",
      basePrice: 29000,
      initialQuota: 15,
      illustrationKey: "bolen",
      requiresThermalBag: false,
      variants: [{ name: "Original", priceDelta: 0 }],
      addons: [{ name: "Extra Keju", price: 4000 }],
    },
    setCookie
  );
  assert.equal(createdMenu.statusCode, 201);
  const newProdId = createdMenu.json.productId;

  const afterCreateCatalog = await callApi("GET", "/api/catalog");
  assert.equal(afterCreateCatalog.json.products.length, 6);

  const updateMenu = await callApi(
    "PATCH",
    "/api/admin/catalog",
    {
      kind: "product",
      id: newProdId,
      name: "Pisang Karamel Spesial",
      shortDescription: "Pisang raja renyah dengan saus karamel butter.",
      basePrice: 31000,
      isActive: true,
      requiresThermalBag: false,
      totalQuota: 18,
      variants: [{ name: "Original", priceDelta: 0 }],
      addons: [],
    },
    setCookie
  );
  assert.equal(updateMenu.statusCode, 200);

  const deleteMenu = await callApi(
    "DELETE",
    `/api/admin/catalog?id=${newProdId}`,
    undefined,
    setCookie
  );
  assert.equal(deleteMenu.statusCode, 200);
  const afterDeleteCatalog = await callApi("GET", "/api/catalog");
  assert.equal(afterDeleteCatalog.json.products.length, 5);
  console.log("✔ FR-023..025: Admin daftar pengguna & CRUD Menu (Tambah, Edit, Hapus) berjalan mulus");

  // 8. FR-006 Admin Toggle PO OFF -> Customer Catalog reflects PO Closed & blocks ordering
  const activePeriodId = authAdmin.json.poPeriod.id;
  const toggleOff = await callApi(
    "PATCH",
    "/api/admin/po-periods",
    { periodId: activePeriodId, isActive: false },
    setCookie
  );
  assert.equal(toggleOff.statusCode, 200);
  assert.equal(toggleOff.json.poPeriod.isOpenNow, false);

  const closedCatalog = await callApi("GET", "/api/catalog");
  assert.equal(closedCatalog.json.poPeriod.isOpenNow, false);

  const closedPost = await callApi("POST", "/api/orders", {
    recipientName: "Pembeli Tiga",
    recipientWhatsapp: "081233333333",
    fulfillmentMethod: "pickup",
    selections: [
      {
        productId: catalog.products[0].id,
        variantId: catalog.products[0].variants[0].id,
        quantity: 1,
      },
    ],
  });
  assert.equal(closedPost.statusCode, 409);

  // Toggle PO back ON via Admin button -> Customer Catalog reflects PO Open again
  const toggleOn = await callApi(
    "PATCH",
    "/api/admin/po-periods",
    { periodId: activePeriodId, isActive: true },
    setCookie
  );
  assert.equal(toggleOn.statusCode, 200);
  assert.equal(toggleOn.json.poPeriod.isOpenNow, true);
  console.log("✔ FR-006: Klik Status PO Mati/Aktif di Admin langsung tersinkron ke halaman Customer");

  // 9. Admin Order Status Transitions (`PATCH /api/admin/orders/:code`)
  for (const nextStatus of ["siap", "selesai", "dibatalkan", "menunggu_pembayaran"] as const) {
    const statusRes = await callApi(
      "PATCH",
      `/api/admin/orders/${encodeURIComponent(winningOrder.orderCode)}`,
      { status: nextStatus },
      setCookie
    );
    assert.equal(statusRes.statusCode, 200, `Ubah status ke ${nextStatus} harus 200 OK`);
    assert.equal(statusRes.json.order.status, nextStatus);
  }

  // 10. Customer Direct Payment Confirmation (`POST /api/orders/:code/confirm-payment`) + Demo Disabled
  const demoBlocked = await callApi(
    "POST",
    `/api/orders/${encodeURIComponent(winningOrder.orderCode)}/simulate-payment`,
    { action: "settlement" }
  );
  assert.equal(demoBlocked.statusCode, 403, "Simulasi demo harus nonaktif");

  const confirmPaidRes = await callApi(
    "POST",
    `/api/orders/${encodeURIComponent(winningOrder.orderCode)}/confirm-payment`
  );
  assert.equal(confirmPaidRes.statusCode, 200);
  assert.equal(confirmPaidRes.json.order.status, "diproses");
  assert.ok(confirmPaidRes.json.order.paidAt);
  console.log("✔ Konfirmasi Pembayaran: Simulasi demo nonaktif & konfirmasi bayar langsung ubah ke Diproses + Invoice");

  // 11. CORS Origin Whitelist (blokir origin asing, izinkan FRONTEND_ORIGIN & same-host ALB)
  const evilCors = await callApi("GET", "/api/health", undefined, undefined, "https://evil.example.com");
  assert.notEqual(evilCors.headers["access-control-allow-origin"], "https://evil.example.com");
  const sameHostCors = await callApi("GET", "/api/health", undefined, undefined, "http://localhost:4000");
  assert.equal(sameHostCors.headers["access-control-allow-origin"], "http://localhost:4000");
  console.log("✔ NFR Keamanan AWS: CORS memblokir origin asing dan mengizinkan same-host/FRONTEND_ORIGIN");

  console.log("\nALL BACKEND ACCEPTANCE & HTTP API TESTS PASSED (13/13)");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Backend test failed:", err);
  process.exit(1);
});
