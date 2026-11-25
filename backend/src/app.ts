import type { IncomingMessage, ServerResponse } from "node:http";
import bcrypt from "bcryptjs";
import { dbQuery, getDbEngineMode, withTransaction } from "./db";
import {
  buildSessionSetCookieHeader,
  getRequestUser,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from "./auth";
import {
  computeDemoWebhookSignature,
  renderQrisDataUrl,
  verifyWebhookSignature,
} from "./payment";
import {
  applyPaymentWebhookTransition,
  BusinessRuleError,
  createCheckoutOrder,
  getActivePoPeriod,
  getCatalogWithQuotas,
  getMemberTiers,
  getOrderByCode,
  getServerInstanceId,
  getStoreSettings,
  listOrders,
  updateOrderStatusByAdmin,
} from "./store-service";
import {
  normalizePhoneDigits,
  sendWhatsappAdminInvoiceNotification,
  sendWhatsappInvoiceNotification,
} from "./whatsapp";
import type { OrderStatus, SessionUser } from "./types";

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const configuredList = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const primaryOrigin = configuredList[0] || "http://localhost:3000";
  const reqOrigin = req.headers.origin?.trim().replace(/\/+$/, "");
  const host = req.headers.host?.trim();

  const allowedOrigins = new Set<string>(configuredList);
  if (host) {
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);
  }
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }

  const allowOrigin = reqOrigin && allowedOrigins.has(reqOrigin) ? reqOrigin : primaryOrigin;

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  res.setHeader("Cache-Control", "no-store, max-age=0");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): void {
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > 1024 * 1024) {
      throw new BusinessRuleError("Ukuran payload melebihi batas maksimum (1 MB).", 413);
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new BusinessRuleError("Format JSON tidak valid.", 400);
  }
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  setCorsHeaders(req, res);

  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost:4000"}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

  try {
    // 1. Health Check (AWS ALB - INF-003)
    if (method === "GET" && (pathname === "/api/health" || pathname === "/health")) {
      const startedAt = Date.now();
      await dbQuery("SELECT 1 AS ok");
      sendJson(res, 200, {
        status: "healthy",
        service: "banatier-backend",
        serverInstanceId: getServerInstanceId(),
        dbEngine: getDbEngineMode(),
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 2. Public Storefront Catalog + Current User
    if (method === "GET" && pathname === "/api/catalog") {
      const [catalog, user] = await Promise.all([
        getCatalogWithQuotas(false),
        getRequestUser(req),
      ]);
      sendJson(res, 200, { ...catalog, user });
      return;
    }

    // 3. Auth: Register
    if (method === "POST" && pathname === "/api/auth/register") {
      const body = await readJsonBody(req);
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const whatsapp = String(body.whatsapp ?? "").trim();
      const password = String(body.password ?? "");
      const joinAsMember = Boolean(body.joinAsMember ?? true);

      if (name.length < 2) {
        sendJson(res, 400, { error: "Nama lengkap minimal 2 karakter." });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: "Format email tidak valid." });
        return;
      }
      if (!/^[0-9+\-\s]{9,20}$/.test(whatsapp)) {
        sendJson(res, 400, { error: "Nomor WhatsApp tidak valid." });
        return;
      }
      if (password.length < 6) {
        sendJson(res, 400, { error: "Password minimal 6 karakter." });
        return;
      }

      const existing = await dbQuery<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [
        email,
      ]);
      if (existing.rows.length > 0) {
        sendJson(res, 409, { error: "Email sudah terdaftar. Silakan login." });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const tierSlug = joinAsMember ? "member" : "non-member";
      const insertRes = await dbQuery<{ id: number }>(
        `INSERT INTO users (name, email, whatsapp, password_hash, role, is_member, member_tier_slug)
         VALUES ($1, $2, $3, $4, 'buyer', $5, $6)
         RETURNING id`,
        [name, email, whatsapp, passwordHash, joinAsMember, tierSlug]
      );

      const sessionUser: SessionUser = {
        id: insertRes.rows[0].id,
        name,
        email,
        whatsapp,
        role: "buyer",
        isMember: joinAsMember,
        memberTierSlug: tierSlug,
      };
      const token = await signSessionToken(sessionUser);
      sendJson(
        res,
        201,
        { user: sessionUser, token },
        { "Set-Cookie": buildSessionSetCookieHeader(token) }
      );
      return;
    }

    // 4. Auth: Login
    if (method === "POST" && pathname === "/api/auth/login") {
      const body = await readJsonBody(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");

      if (!email || !password) {
        sendJson(res, 400, { error: "Email dan password wajib diisi." });
        return;
      }

      const userRes = await dbQuery<{
        id: number;
        name: string;
        email: string;
        whatsapp: string;
        password_hash: string;
        role: "buyer" | "admin";
        is_member: boolean;
        member_tier_slug: string;
      }>(`SELECT * FROM users WHERE email = $1`, [email]);

      const user = userRes.rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        sendJson(res, 401, { error: "Email atau password salah." });
        return;
      }

      const sessionUser: SessionUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp,
        role: user.role,
        isMember: user.is_member,
        memberTierSlug: user.member_tier_slug,
      };
      const token = await signSessionToken(sessionUser);
      sendJson(
        res,
        200,
        { user: sessionUser, token },
        { "Set-Cookie": buildSessionSetCookieHeader(token) }
      );
      return;
    }

    // 5. Auth: Logout
    if (method === "POST" && pathname === "/api/auth/logout") {
      sendJson(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        }
      );
      return;
    }

    // 6. Auth: Current User & Activate Membership
    if (pathname === "/api/auth/me") {
      if (method === "GET") {
        const [user, tiers] = await Promise.all([getRequestUser(req), getMemberTiers()]);
        sendJson(res, 200, {
          user,
          tiers,
          serverInstanceId: getServerInstanceId(),
        });
        return;
      }

      if (method === "POST") {
        const user = await getRequestUser(req);
        if (!user) {
          sendJson(res, 401, { error: "Silakan login terlebih dahulu." });
          return;
        }
        if (user.role === "admin") {
          sendJson(res, 400, { error: "Akun admin tidak memerlukan membership." });
          return;
        }

        await dbQuery(
          `UPDATE users
           SET is_member = TRUE,
               member_tier_slug = CASE WHEN member_tier_slug = 'non-member' THEN 'member' ELSE member_tier_slug END
           WHERE id = $1`,
          [user.id]
        );

        const updatedUser: SessionUser = {
          ...user,
          isMember: true,
          memberTierSlug: user.memberTierSlug === "non-member" ? "member" : user.memberTierSlug,
        };
        const token = await signSessionToken(updatedUser);
        sendJson(
          res,
          200,
          { user: updatedUser, token },
          { "Set-Cookie": buildSessionSetCookieHeader(token) }
        );
        return;
      }
    }

    // 7. Orders: List & Create Checkout
    if (pathname === "/api/orders") {
      if (method === "GET") {
        const user = await getRequestUser(req);
        if (!user) {
          sendJson(res, 401, { error: "Silakan login untuk melihat daftar pesanan." });
          return;
        }
        const orders = await listOrders(
          user.role === "admin" ? undefined : { userId: user.id }
        );
        sendJson(res, 200, {
          orders,
          user,
          serverInstanceId: getServerInstanceId(),
        });
        return;
      }

      if (method === "POST") {
        const user = await getRequestUser(req);
        const body = await readJsonBody(req);
        const order = await createCheckoutOrder({
          userId: user?.id ?? null,
          recipientName: String(body.recipientName ?? ""),
          recipientWhatsapp: String(body.recipientWhatsapp ?? ""),
          fulfillmentMethod: body.fulfillmentMethod === "delivery" ? "delivery" : "pickup",
          deliveryAddress: String(body.deliveryAddress ?? ""),
          notes: String(body.notes ?? ""),
          selections: Array.isArray(body.selections) ? body.selections : [],
        });
        const qrisImageUrl = order.qrisString
          ? await renderQrisDataUrl(order.qrisString)
          : "";

        // Fire-and-forget automatic WhatsApp invoice push if FONNTE_TOKEN is configured
        void sendWhatsappInvoiceNotification(order, "created");

        sendJson(res, 201, {
          order,
          qrisImageUrl,
          autoWaConfigured: Boolean(process.env.FONNTE_TOKEN?.trim()),
        });
        return;
      }
    }

    // 7b. Public Guest Order Tracking (`GET /api/orders/track?code=...&whatsapp=...`)
    if (method === "GET" && pathname === "/api/orders/track") {
      const code = (parsedUrl.searchParams.get("code") ?? "").trim().toUpperCase();
      const whatsapp = (parsedUrl.searchParams.get("whatsapp") ?? "").trim();

      if (!code || !whatsapp) {
        sendJson(res, 400, {
          error: "Kode pesanan dan nomor WhatsApp wajib diisi.",
        });
        return;
      }

      const order = await getOrderByCode(code);
      const expectedPhone = order ? normalizePhoneDigits(order.recipientWhatsapp) : "";
      const inputPhone = normalizePhoneDigits(whatsapp);

      if (!order || !inputPhone || expectedPhone !== inputPhone) {
        sendJson(res, 404, {
          error:
            "Pesanan tidak ditemukan. Pastikan kode pesanan dan nomor WhatsApp sesuai saat memesan.",
        });
        return;
      }

      const qrisImageUrl =
        order.status === "menunggu_pembayaran" && order.qrisString
          ? await renderQrisDataUrl(order.qrisString)
          : "";

      sendJson(res, 200, {
        order,
        qrisImageUrl,
        demoMode: false,
      });
      return;
    }

    // 8. Orders: Customer Payment Confirmation (`/api/orders/:code/confirm-payment`)
    const confirmPaymentMatch = pathname.match(/^\/api\/orders\/([^/]+)\/confirm-payment$/);
    if (method === "POST" && confirmPaymentMatch) {
      const code = decodeURIComponent(confirmPaymentMatch[1]);
      const existing = await getOrderByCode(code);
      if (!existing) {
        sendJson(res, 404, { error: "Pesanan tidak ditemukan." });
        return;
      }

      if (existing.status === "kedaluwarsa" || existing.status === "dibatalkan") {
        sendJson(res, 409, {
          error: "Batas waktu pembayaran pesanan ini telah berakhir.",
          order: existing,
        });
        return;
      }

      const result = await applyPaymentWebhookTransition({
        orderCode: code,
        transactionStatus: "paid",
      });

      if (result.changed && result.order.status === "diproses") {
        const settings = await getStoreSettings();
        void sendWhatsappInvoiceNotification(result.order, "paid");
        void sendWhatsappAdminInvoiceNotification(result.order, settings.adminWhatsapp);
      }

      sendJson(res, 200, { ok: true, changed: result.changed, order: result.order });
      return;
    }

    // 8b. Legacy Demo Simulation Endpoint (Disabled unless ALLOW_DEMO_SIMULATION=true)
    const simulateMatch = pathname.match(/^\/api\/orders\/([^/]+)\/simulate-payment$/);
    if (method === "POST" && simulateMatch) {
      if (process.env.ALLOW_DEMO_SIMULATION !== "true") {
        sendJson(res, 403, { error: "Mode simulasi demo telah dinonaktifkan." });
        return;
      }

      const code = decodeURIComponent(simulateMatch[1]);
      const body = await readJsonBody(req);
      const action = body.action === "expire" ? "expire" : "settlement";

      const existing = await getOrderByCode(code);
      if (!existing) {
        sendJson(res, 404, { error: "Pesanan tidak ditemukan." });
        return;
      }

      const signatureKey = computeDemoWebhookSignature(code, action, existing.grandTotal);
      const verified = verifyWebhookSignature({
        provider: "demo",
        orderCode: code,
        transactionStatus: action,
        grossAmount: existing.grandTotal,
        signatureKey,
      });
      if (!verified) {
        sendJson(res, 500, { error: "Verifikasi signature internal gagal." });
        return;
      }

      const result = await applyPaymentWebhookTransition({
        orderCode: code,
        transactionStatus: action,
      });
      if (result.changed && result.order.status === "diproses") {
        void sendWhatsappInvoiceNotification(result.order, "paid");
      }
      sendJson(res, 200, { ok: true, changed: result.changed, order: result.order });
      return;
    }

    // 9. Orders: Single Order by Code (`/api/orders/:code`)
    const singleOrderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (method === "GET" && singleOrderMatch) {
      const code = decodeURIComponent(singleOrderMatch[1]);
      const order = await getOrderByCode(code);
      if (!order) {
        sendJson(res, 404, { error: "Pesanan tidak ditemukan." });
        return;
      }

      const qrisImageUrl =
        order.status === "menunggu_pembayaran" && order.qrisString
          ? await renderQrisDataUrl(order.qrisString)
          : "";

      sendJson(res, 200, {
        order,
        qrisImageUrl,
        demoMode: false,
      });
      return;
    }

    // 10. Payment Gateway Signed Webhook (`POST /api/webhooks/payment`)
    if (method === "POST" && pathname === "/api/webhooks/payment") {
      const body = await readJsonBody(req);
      const orderCode = String(body.order_id ?? body.orderCode ?? "");
      const transactionStatus = String(
        body.transaction_status ?? body.transactionStatus ?? ""
      );
      const statusCode = String(body.status_code ?? "200");
      const grossAmount = body.gross_amount ?? body.grossAmount ?? 0;
      const signatureKey = String(body.signature_key ?? body.signatureKey ?? "");

      if (!orderCode || !transactionStatus || !signatureKey) {
        sendJson(res, 400, { error: "Payload webhook tidak lengkap." });
        return;
      }

      const existing = await getOrderByCode(orderCode);
      if (!existing) {
        sendJson(res, 404, { error: "Pesanan tidak ditemukan." });
        return;
      }

      const isValidSig = verifyWebhookSignature({
        provider: existing.paymentProvider,
        orderCode,
        statusCode,
        transactionStatus,
        grossAmount,
        signatureKey,
      });
      if (!isValidSig) {
        sendJson(res, 401, { error: "Signature webhook tidak valid." });
        return;
      }

      const allowedStatuses = [
        "settlement",
        "capture",
        "paid",
        "expire",
        "cancel",
        "deny",
      ] as const;
      type AllowedStatus = (typeof allowedStatuses)[number];
      if (!allowedStatuses.includes(transactionStatus as AllowedStatus)) {
        sendJson(res, 200, { ok: true, ignored: true, status: existing.status });
        return;
      }

      const result = await applyPaymentWebhookTransition({
        orderCode,
        transactionStatus: transactionStatus as AllowedStatus,
      });
      if (result.changed && result.order.status === "diproses") {
        void sendWhatsappInvoiceNotification(result.order, "paid");
      }
      sendJson(res, 200, { ok: true, changed: result.changed, order: result.order });
      return;
    }

    // 11. Admin Overview (`GET /api/admin/overview`)
    if (method === "GET" && pathname === "/api/admin/overview") {
      const user = await getRequestUser(req);
      if (!user || user.role !== "admin") {
        sendJson(res, 403, { error: "Akses khusus Admin." });
        return;
      }

      const periodParam = parsedUrl.searchParams.get("poPeriodId");
      const poPeriodId = periodParam ? Number(periodParam) : undefined;

      const [catalog, periodsRes, orders, usersRes] = await Promise.all([
        getCatalogWithQuotas(true),
        dbQuery<{
          id: number;
          name: string;
          opens_at: string | Date;
          closes_at: string | Date;
          fulfillment_date: string | Date;
          is_active: boolean;
        }>(`SELECT * FROM po_periods ORDER BY id DESC`),
        listOrders(poPeriodId ? { poPeriodId } : undefined),
        dbQuery<{
          id: number;
          name: string;
          email: string;
          whatsapp: string;
          role: "buyer" | "admin";
          is_member: boolean;
          member_tier_slug: string;
          created_at: string | Date;
          total_orders: number;
          paid_orders: number;
        }>(
          `SELECT u.id, u.name, u.email, u.whatsapp, u.role, u.is_member, u.member_tier_slug, u.created_at,
                  COUNT(o.id)::int AS total_orders,
                  COUNT(o.id) FILTER (WHERE o.status IN ('diproses', 'siap', 'selesai'))::int AS paid_orders
           FROM users u
           LEFT JOIN orders o ON o.user_id = u.id
           GROUP BY u.id
           ORDER BY u.role ASC, u.created_at DESC`
        ),
      ]);

      const periods = periodsRes.rows.map((p) => ({
        id: p.id,
        name: p.name,
        opensAt: new Date(p.opens_at).toISOString(),
        closesAt: new Date(p.closes_at).toISOString(),
        fulfillmentDate:
          p.fulfillment_date instanceof Date
            ? p.fulfillment_date.toISOString().slice(0, 10)
            : String(p.fulfillment_date).slice(0, 10),
        isActive: p.is_active,
      }));

      const users = usersRes.rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        whatsapp: u.whatsapp,
        role: u.role,
        isMember: u.is_member,
        memberTierSlug: u.member_tier_slug,
        createdAt: new Date(u.created_at).toISOString(),
        totalOrders: Number(u.total_orders ?? 0),
        paidOrders: Number(u.paid_orders ?? 0),
      }));

      sendJson(res, 200, {
        ...catalog,
        user,
        periods,
        orders,
        users,
      });
      return;
    }

    // 12. Admin PO Periods (`POST` & `PATCH /api/admin/po-periods`)
    if (pathname === "/api/admin/po-periods" && (method === "POST" || method === "PATCH")) {
      const user = await getRequestUser(req);
      if (!user || user.role !== "admin") {
        sendJson(res, 403, { error: "Akses khusus Admin." });
        return;
      }

      const body = await readJsonBody(req);

      if (method === "POST") {
        const name = String(body.name ?? "").trim();
        const opensAt = new Date(String(body.opensAt ?? ""));
        const closesAt = new Date(String(body.closesAt ?? ""));
        const fulfillmentDate = String(body.fulfillmentDate ?? "").slice(0, 10);
        const quotas: Array<{ productId: number; totalQuota: number }> = Array.isArray(
          body.quotas
        )
          ? body.quotas
          : [];

        if (
          !name ||
          Number.isNaN(opensAt.getTime()) ||
          Number.isNaN(closesAt.getTime()) ||
          !fulfillmentDate
        ) {
          sendJson(res, 400, { error: "Data jadwal periode PO tidak lengkap." });
          return;
        }
        if (closesAt <= opensAt) {
          sendJson(res, 400, { error: "Waktu tutup PO harus setelah waktu buka PO." });
          return;
        }

        const periodId = await withTransaction(async (tx) => {
          await tx.query(`UPDATE po_periods SET is_active = FALSE WHERE is_active = TRUE`);
          const ins = await tx.query<{ id: number }>(
            `INSERT INTO po_periods (name, opens_at, closes_at, fulfillment_date, is_active)
             VALUES ($1, $2, $3, $4, TRUE)
             RETURNING id`,
            [name, opensAt.toISOString(), closesAt.toISOString(), fulfillmentDate]
          );
          const newId = ins.rows[0].id;
          const prods = await tx.query<{ id: number }>(
            `SELECT id FROM products ORDER BY id ASC`
          );
          const quotaInputMap = new Map<number, number>();
          for (const q of quotas) {
            quotaInputMap.set(
              Number(q.productId),
              Math.max(0, Math.floor(Number(q.totalQuota)))
            );
          }

          for (const p of prods.rows) {
            const total = quotaInputMap.get(p.id) ?? 20;
            await tx.query(
              `INSERT INTO po_quotas (po_period_id, product_id, total_quota, reserved_count)
               VALUES ($1, $2, $3, 0)`,
              [newId, p.id, total]
            );
          }
          return newId;
        });

        sendJson(res, 201, { ok: true, periodId });
        return;
      }

      // PATCH
      const periodId = Number(body.periodId);
      if (!periodId) {
        sendJson(res, 400, { error: "ID periode PO wajib disertakan." });
        return;
      }

      await withTransaction(async (tx) => {
        if (typeof body.isActive === "boolean") {
          if (body.isActive) {
            await tx.query(`UPDATE po_periods SET is_active = FALSE WHERE id != $1`, [
              periodId,
            ]);
            // Ensure opening window covers NOW() when manually toggled ON by Admin
            await tx.query(
              `UPDATE po_periods
               SET is_active = TRUE,
                   opens_at = CASE WHEN opens_at > NOW() THEN NOW() - INTERVAL '1 minute' ELSE opens_at END,
                   closes_at = CASE WHEN closes_at <= NOW() THEN NOW() + INTERVAL '7 days' ELSE closes_at END
               WHERE id = $1`,
              [periodId]
            );
          } else {
            await tx.query(`UPDATE po_periods SET is_active = FALSE WHERE id = $1`, [
              periodId,
            ]);
          }
        }

        if (body.name && body.opensAt && body.closesAt && body.fulfillmentDate) {
          await tx.query(
            `UPDATE po_periods
             SET name = $1, opens_at = $2, closes_at = $3, fulfillment_date = $4
             WHERE id = $5`,
            [
              String(body.name).trim(),
              new Date(String(body.opensAt)).toISOString(),
              new Date(String(body.closesAt)).toISOString(),
              String(body.fulfillmentDate).slice(0, 10),
              periodId,
            ]
          );
        }

        if (Array.isArray(body.quotas)) {
          for (const q of body.quotas) {
            const pid = Number(q.productId);
            const nextQuota = Math.max(0, Math.floor(Number(q.totalQuota)));
            const existing = await tx.query<{ reserved_count: number }>(
              `SELECT reserved_count FROM po_quotas WHERE po_period_id = $1 AND product_id = $2 FOR UPDATE`,
              [periodId, pid]
            );
            if (existing.rows[0]) {
              const safeTotal = Math.max(existing.rows[0].reserved_count, nextQuota);
              await tx.query(
                `UPDATE po_quotas SET total_quota = $1 WHERE po_period_id = $2 AND product_id = $3`,
                [safeTotal, periodId, pid]
              );
            } else {
              await tx.query(
                `INSERT INTO po_quotas (po_period_id, product_id, total_quota, reserved_count)
                 VALUES ($1, $2, $3, 0)`,
                [periodId, pid, nextQuota]
              );
            }
          }
        }
      });

      const updatedPo = await getActivePoPeriod();
      sendJson(res, 200, { ok: true, poPeriod: updatedPo });
      return;
    }

    // 13. Admin Order Status Update (`PATCH /api/admin/orders/:code`)
    const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (method === "PATCH" && adminOrderMatch) {
      const user = await getRequestUser(req);
      if (!user || user.role !== "admin") {
        sendJson(res, 403, { error: "Akses khusus Admin." });
        return;
      }

      const code = decodeURIComponent(adminOrderMatch[1]);
      const body = await readJsonBody(req);
      const status = String(body.status ?? "") as OrderStatus;
      const order = await updateOrderStatusByAdmin(code, status);
      sendJson(res, 200, { ok: true, order });
      return;
    }

    // 14. Admin Catalog CRUD (`POST`, `PATCH`, `DELETE /api/admin/catalog`)
    if (pathname === "/api/admin/catalog") {
      const user = await getRequestUser(req);
      if (!user || user.role !== "admin") {
        sendJson(res, 403, { error: "Akses khusus Admin." });
        return;
      }

      // CREATE NEW PRODUCT (`POST /api/admin/catalog`)
      if (method === "POST") {
        const body = await readJsonBody(req);
        const name = String(body.name ?? "").trim();
        const shortDescription = String(body.shortDescription ?? "").trim();
        const basePrice = Math.max(0, Math.floor(Number(body.basePrice ?? 0)));
        const requiresThermalBag = Boolean(body.requiresThermalBag ?? false);
        const illustrationKey = String(body.illustrationKey ?? "bolen").trim() || "bolen";
        const variantLabel = String(body.variantLabel ?? "Pilih Varian").trim() || "Pilih Varian";
        const initialQuota = Math.max(0, Math.floor(Number(body.initialQuota ?? 20)));
        const rawVariants: Array<{ name?: string; priceDelta?: number }> = Array.isArray(
          body.variants
        )
          ? body.variants
          : [];
        const rawAddons: Array<{ name?: string; price?: number }> = Array.isArray(body.addons)
          ? body.addons
          : [];

        if (name.length < 2) {
          sendJson(res, 400, { error: "Nama menu minimal 2 karakter." });
          return;
        }
        if (!shortDescription) {
          sendJson(res, 400, { error: "Deskripsi singkat menu wajib diisi." });
          return;
        }

        const cleanVariants = rawVariants
          .map((v) => ({
            name: String(v.name ?? "").trim(),
            priceDelta: Math.floor(Number(v.priceDelta ?? 0)),
          }))
          .filter((v) => v.name.length > 0);

        const cleanAddons = rawAddons
          .map((a) => ({
            name: String(a.name ?? "").trim(),
            price: Math.max(0, Math.floor(Number(a.price ?? 0))),
          }))
          .filter((a) => a.name.length > 0);

        const baseSlug =
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "menu";

        const newProductId = await withTransaction(async (tx) => {
          const existingSlug = await tx.query<{ id: number }>(
            `SELECT id FROM products WHERE slug = $1`,
            [baseSlug]
          );
          const finalSlug =
            existingSlug.rows.length > 0
              ? `${baseSlug}-${Date.now().toString(36).slice(-4)}`
              : baseSlug;

          const sortRes = await tx.query<{ max_sort: number }>(
            `SELECT COALESCE(MAX(sort_order), 0)::int AS max_sort FROM products`
          );
          const nextSort = Number(sortRes.rows[0]?.max_sort ?? 0) + 1;

          const prodIns = await tx.query<{ id: number }>(
            `INSERT INTO products (
               slug, name, short_description, base_price,
               requires_thermal_bag, has_variants, variant_label,
               illustration_key, is_active, sort_order
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
             RETURNING id`,
            [
              finalSlug,
              name,
              shortDescription,
              basePrice,
              requiresThermalBag,
              cleanVariants.length > 0,
              variantLabel,
              illustrationKey,
              nextSort,
            ]
          );
          const pid = prodIns.rows[0].id;

          for (let i = 0; i < cleanVariants.length; i++) {
            await tx.query(
              `INSERT INTO product_variants (product_id, name, price_delta, is_available, sort_order)
               VALUES ($1, $2, $3, TRUE, $4)`,
              [pid, cleanVariants[i].name, cleanVariants[i].priceDelta, i + 1]
            );
          }

          for (let i = 0; i < cleanAddons.length; i++) {
            await tx.query(
              `INSERT INTO product_addons (product_id, name, price, is_available, sort_order)
               VALUES ($1, $2, $3, TRUE, $4)`,
              [pid, cleanAddons[i].name, cleanAddons[i].price, i + 1]
            );
          }

          const periods = await tx.query<{ id: number }>(`SELECT id FROM po_periods`);
          for (const per of periods.rows) {
            await tx.query(
              `INSERT INTO po_quotas (po_period_id, product_id, total_quota, reserved_count)
               VALUES ($1, $2, $3, 0)
               ON CONFLICT (po_period_id, product_id) DO NOTHING`,
              [per.id, pid, initialQuota]
            );
          }

          return pid;
        });

        sendJson(res, 201, { ok: true, productId: newProductId });
        return;
      }

      // DELETE PRODUCT (`DELETE /api/admin/catalog?id=...`)
      if (method === "DELETE") {
        const productId = Number(parsedUrl.searchParams.get("id"));
        if (!productId) {
          sendJson(res, 400, { error: "ID menu wajib disertakan." });
          return;
        }

        await withTransaction(async (tx) => {
          // Ensure historical order_items retain their snapshot even after product deletion
          await tx
            .query(`ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL`)
            .catch(() => {});
          await tx.query(`UPDATE order_items SET product_id = NULL WHERE product_id = $1`, [
            productId,
          ]);
          await tx.query(`DELETE FROM products WHERE id = $1`, [productId]);
        });

        sendJson(res, 200, { ok: true });
        return;
      }

      // UPDATE CATALOG / SETTINGS / TIERS (`PATCH /api/admin/catalog`)
      if (method === "PATCH") {
        const body = await readJsonBody(req);
        const kind = String(body.kind ?? "");

        if (kind === "settings") {
          await dbQuery(
            `UPDATE store_settings
             SET thermal_bag_capacity = $1,
                 thermal_bag_price = $2,
                 delivery_fee = $3,
                 pickup_location = $4,
                 admin_whatsapp = $5,
                 updated_at = NOW()
             WHERE id = 1`,
            [
              Math.max(1, Math.floor(Number(body.thermalBagCapacity ?? 2))),
              Math.max(0, Math.floor(Number(body.thermalBagPrice ?? 8000))),
              Math.max(0, Math.floor(Number(body.deliveryFee ?? 12000))),
              String(body.pickupLocation ?? "").trim() || "Studio Banatier, Bandung",
              String(body.adminWhatsapp ?? "").trim() || "081219048439",
            ]
          );
          sendJson(res, 200, { ok: true });
          return;
        }

        if (kind === "tier") {
          await dbQuery(
            `UPDATE member_tiers
             SET name = $1, discount_percent = $2, min_purchase = $3, min_paid_orders = $4
             WHERE id = $5`,
            [
              String(body.name ?? "").trim(),
              Math.min(90, Math.max(0, Number(body.discountPercent ?? 0))),
              Math.max(0, Math.floor(Number(body.minPurchase ?? 0))),
              Math.max(0, Math.floor(Number(body.minPaidOrders ?? 0))),
              Number(body.id),
            ]
          );
          sendJson(res, 200, { ok: true });
          return;
        }

        if (kind === "product") {
          await withTransaction(async (tx) => {
            const productId = Number(body.id);
            const submittedVariants = Array.isArray(body.variants) ? body.variants : [];
            const validVariants = submittedVariants.filter(
              (v) => String(v.name ?? "").trim().length > 0
            );
            const hasVariants = validVariants.length > 0;

            await tx.query(
              `UPDATE products
               SET name = $1,
                   short_description = $2,
                   base_price = $3,
                   is_active = $4,
                   requires_thermal_bag = $5,
                   has_variants = $6,
                   illustration_key = COALESCE(NULLIF($7, ''), illustration_key)
               WHERE id = $8`,
              [
                String(body.name ?? "").trim(),
                String(body.shortDescription ?? "").trim(),
                Math.max(0, Math.floor(Number(body.basePrice ?? 0))),
                Boolean(body.isActive ?? true),
                Boolean(body.requiresThermalBag ?? false),
                hasVariants,
                String(body.illustrationKey ?? "").trim(),
                productId,
              ]
            );

            // Sync variants (update existing, insert new, delete removed)
            const keptVariantIds: number[] = [];
            for (let i = 0; i < validVariants.length; i++) {
              const v = validVariants[i];
              if (v.id) {
                const vid = Number(v.id);
                keptVariantIds.push(vid);
                await tx.query(
                  `UPDATE product_variants
                   SET name = $1, price_delta = $2, is_available = $3, sort_order = $4
                   WHERE id = $5 AND product_id = $6`,
                  [
                    String(v.name).trim(),
                    Math.floor(Number(v.priceDelta ?? 0)),
                    Boolean(v.isAvailable ?? true),
                    i + 1,
                    vid,
                    productId,
                  ]
                );
              } else {
                const insV = await tx.query<{ id: number }>(
                  `INSERT INTO product_variants (product_id, name, price_delta, is_available, sort_order)
                   VALUES ($1, $2, $3, TRUE, $4)
                   RETURNING id`,
                  [productId, String(v.name).trim(), Math.floor(Number(v.priceDelta ?? 0)), i + 1]
                );
                keptVariantIds.push(insV.rows[0].id);
              }
            }

            if (keptVariantIds.length > 0) {
              const placeholders = keptVariantIds.map((_, idx) => `$${idx + 2}`).join(",");
              await tx.query(
                `DELETE FROM product_variants WHERE product_id = $1 AND id NOT IN (${placeholders})`,
                [productId, ...keptVariantIds]
              );
            } else {
              await tx.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);
            }

            // Sync add-ons (update existing, insert new, delete removed)
            const submittedAddons = Array.isArray(body.addons) ? body.addons : [];
            const validAddons = submittedAddons.filter(
              (a) => String(a.name ?? "").trim().length > 0
            );
            const keptAddonIds: number[] = [];

            for (let i = 0; i < validAddons.length; i++) {
              const a = validAddons[i];
              if (a.id) {
                const aid = Number(a.id);
                keptAddonIds.push(aid);
                await tx.query(
                  `UPDATE product_addons
                   SET name = $1, price = $2, is_available = $3, sort_order = $4
                   WHERE id = $5 AND product_id = $6`,
                  [
                    String(a.name).trim(),
                    Math.max(0, Math.floor(Number(a.price ?? 0))),
                    Boolean(a.isAvailable ?? true),
                    i + 1,
                    aid,
                    productId,
                  ]
                );
              } else {
                const insA = await tx.query<{ id: number }>(
                  `INSERT INTO product_addons (product_id, name, price, is_available, sort_order)
                   VALUES ($1, $2, $3, TRUE, $4)
                   RETURNING id`,
                  [
                    productId,
                    String(a.name).trim(),
                    Math.max(0, Math.floor(Number(a.price ?? 0))),
                    i + 1,
                  ]
                );
                keptAddonIds.push(insA.rows[0].id);
              }
            }

            if (keptAddonIds.length > 0) {
              const placeholders = keptAddonIds.map((_, idx) => `$${idx + 2}`).join(",");
              await tx.query(
                `DELETE FROM product_addons WHERE product_id = $1 AND id NOT IN (${placeholders})`,
                [productId, ...keptAddonIds]
              );
            } else {
              await tx.query(`DELETE FROM product_addons WHERE product_id = $1`, [productId]);
            }

            // Optional quota update for active PO period right from CRUD Menu
            if (body.totalQuota !== undefined) {
              const activePer = await tx.query<{ id: number }>(
                `SELECT id FROM po_periods ORDER BY is_active DESC, id DESC LIMIT 1`
              );
              if (activePer.rows[0]) {
                const pidPer = activePer.rows[0].id;
                const nextQ = Math.max(0, Math.floor(Number(body.totalQuota)));
                const exQ = await tx.query<{ reserved_count: number }>(
                  `SELECT reserved_count FROM po_quotas WHERE po_period_id = $1 AND product_id = $2 FOR UPDATE`,
                  [pidPer, productId]
                );
                if (exQ.rows[0]) {
                  await tx.query(
                    `UPDATE po_quotas SET total_quota = $1 WHERE po_period_id = $2 AND product_id = $3`,
                    [Math.max(exQ.rows[0].reserved_count, nextQ), pidPer, productId]
                  );
                } else {
                  await tx.query(
                    `INSERT INTO po_quotas (po_period_id, product_id, total_quota, reserved_count)
                     VALUES ($1, $2, $3, 0)`,
                    [pidPer, productId, nextQ]
                  );
                }
              }
            }
          });

          sendJson(res, 200, { ok: true });
          return;
        }

        sendJson(res, 400, { error: "Tipe pembaruan tidak dikenali." });
        return;
      }
    }

    sendJson(res, 404, { error: `Endpoint tidak ditemukan: ${method} ${pathname}` });
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      sendJson(res, error.statusCode, { error: error.message });
      return;
    }
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
}
