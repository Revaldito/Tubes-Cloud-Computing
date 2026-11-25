import "./env";
import crypto from "node:crypto";
import QRCode from "qrcode";

export interface QrisChargeResult {
  provider: "demo" | "midtrans";
  paymentReference: string;
  qrisString: string;
  expiresAt: Date;
}

export async function createQrisCharge(params: {
  orderCode: string;
  grandTotal: number;
  timeoutMinutes: number;
  customerName: string;
}): Promise<QrisChargeResult> {
  const { orderCode, grandTotal, timeoutMinutes, customerName } = params;
  const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
  const mode = process.env.PAYMENT_MODE === "midtrans" ? "midtrans" : "demo";

  if (mode === "midtrans" && process.env.MIDTRANS_SERVER_KEY) {
    const isProd = process.env.MIDTRANS_IS_PRODUCTION === "true";
    const baseUrl = isProd
      ? "https://api.midtrans.com/v2/charge"
      : "https://api.sandbox.midtrans.com/v2/charge";

    const authHeader = Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString("base64");
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: {
          order_id: orderCode,
          gross_amount: grandTotal,
        },
        customer_details: {
          first_name: customerName,
        },
        custom_expiry: {
          expiry_duration: timeoutMinutes,
          unit: "minute",
        },
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || !data.qr_string) {
      throw new Error(String(data.status_message || "Gagal membuat tagihan QRIS di Midtrans"));
    }

    return {
      provider: "midtrans",
      paymentReference: String(data.transaction_id || orderCode),
      qrisString: String(data.qr_string),
      expiresAt: data.expiry_time ? new Date(String(data.expiry_time)) : expiresAt,
    };
  }

  const qrisString = `00020101021226580014ID.CO.BANATIER.WWW011893600914${orderCode}52045814530336054${String(
    grandTotal
  ).length.toString().padStart(2, "0")}${grandTotal}5802ID5908BANATIER6007BANDUNG6304A1B2`;

  return {
    provider: "demo",
    paymentReference: `QRIS-${orderCode}`,
    qrisString,
    expiresAt,
  };
}

export async function renderQrisDataUrl(qrisString: string): Promise<string> {
  if (process.env.PAYMENT_MODE !== "midtrans") {
    return "/qris-ayyas.jpg";
  }
  return QRCode.toDataURL(qrisString, {
    width: 300,
    margin: 2,
    color: {
      dark: "#4A2E1B",
      light: "#FFFDF7",
    },
  });
}

export function computeDemoWebhookSignature(
  orderCode: string,
  transactionStatus: string,
  grossAmount: number
): string {
  const secret = process.env.WEBHOOK_SECRET || "banatier-local-webhook-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderCode}:${transactionStatus}:${grossAmount}`)
    .digest("hex");
}

export function verifyWebhookSignature(params: {
  provider: string;
  orderCode: string;
  statusCode?: string;
  transactionStatus: string;
  grossAmount: string | number;
  signatureKey: string;
}): boolean {
  const { provider, orderCode, statusCode = "200", transactionStatus, grossAmount, signatureKey } =
    params;

  if (provider === "midtrans" && process.env.MIDTRANS_SERVER_KEY) {
    const expected = crypto
      .createHash("sha512")
      .update(`${orderCode}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest("hex");
    return safeEqualHex(expected, signatureKey);
  }

  const expectedDemo = computeDemoWebhookSignature(
    orderCode,
    transactionStatus,
    Number(grossAmount)
  );
  return safeEqualHex(expectedDemo, signatureKey);
}

function safeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
