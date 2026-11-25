import "./env";
import type { OrderRecord } from "./types";

export function normalizePhoneDigits(rawPhone: string): string {
  const digits = rawPhone.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith("8")) {
    return `62${digits}`;
  }
  return digits;
}

function formatRupiahText(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildWhatsappInvoiceMessage(
  order: OrderRecord,
  type: "created" | "paid"
): string {
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const itemsLines = order.items
    .map(
      (it) =>
        `• ${it.productNameSnapshot}${
          it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ""
        }${
          it.addonsSnapshot.length
            ? ` + ${it.addonsSnapshot.map((a) => a.name).join(", ")}`
            : ""
        } ×${it.quantity} = ${formatRupiahText(it.lineTotalSnapshot)}`
    )
    .join("\n");

  const header =
    type === "paid"
      ? `*BUKTI PEMBAYARAN LUNAS — BANATIER* ✅`
      : `*INVOICE PRE-ORDER — BANATIER* 🍌`;

  const statusLine =
    type === "paid"
      ? `Status: *LUNAS (Diproses)*`
      : `Status: *Menunggu Pembayaran QRIS*`;

  const methodLine =
    order.fulfillmentMethod === "delivery"
      ? `Diantar ke: ${order.deliveryAddress}`
      : `Ambil di Tempat (Pickup)`;

  return [
    header,
    `Kode Pesanan: *${order.orderCode}*`,
    `Penerima: ${order.recipientName} (${order.recipientWhatsapp})`,
    statusLine,
    ``,
    `*Rincian Pesanan:*`,
    itemsLines,
    order.discountAmount > 0
      ? `Diskon ${order.tierNameSnapshot}: -${formatRupiahText(order.discountAmount)}`
      : null,
    order.thermalBagCount > 0
      ? `Thermal Bag (×${order.thermalBagCount}): ${formatRupiahText(order.thermalBagCost)}`
      : null,
    order.shippingCost > 0
      ? `Biaya Pengantaran: ${formatRupiahText(order.shippingCost)}`
      : null,
    `*Total Tagihan: ${formatRupiahText(order.grandTotal)}*`,
    `Jadwal: ${order.fulfillmentDate} (${methodLine})`,
    ``,
    `Lacak status pesanan Anda di:`,
    `${frontendOrigin}/orders`,
    `(Gunakan Kode *${order.orderCode}* & nomor WhatsApp ini)`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Sends automatic WhatsApp invoice via Fonnte Gateway when FONNTE_TOKEN is configured.
 * Non-blocking and safe if token is absent.
 */
export async function sendWhatsappInvoiceNotification(
  order: OrderRecord,
  type: "created" | "paid"
): Promise<{ sent: boolean; provider: string }> {
  const token = process.env.FONNTE_TOKEN?.trim() || "";
  if (!token) {
    return { sent: false, provider: "none" };
  }

  const target = normalizePhoneDigits(order.recipientWhatsapp);
  if (!target) {
    return { sent: false, provider: "fonnte" };
  }

  try {
    const message = buildWhatsappInvoiceMessage(order, type);
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target,
        message,
        countryCode: "62",
      }),
    });
    return { sent: res.ok, provider: "fonnte" };
  } catch {
    return { sent: false, provider: "fonnte" };
  }
}

export async function sendWhatsappAdminInvoiceNotification(
  order: OrderRecord,
  adminWhatsapp: string
): Promise<{ sent: boolean; provider: string }> {
  const token = process.env.FONNTE_TOKEN?.trim() || "";
  if (!token) {
    return { sent: false, provider: "none" };
  }

  const target = normalizePhoneDigits(adminWhatsapp || "081219048439");
  if (!target) {
    return { sent: false, provider: "fonnte" };
  }

  try {
    const message = buildWhatsappInvoiceMessage(order, "paid");
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target,
        message,
        countryCode: "62",
      }),
    });
    return { sent: res.ok, provider: "fonnte" };
  } catch {
    return { sent: false, provider: "fonnte" };
  }
}
