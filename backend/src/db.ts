import "./env";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { BACKEND_ROOT } from "./env";

export interface QueryResultRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface DbExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
}

interface GlobalDbState {
  pgPool?: Pool;
  pglite?: PGlite;
  initPromise?: Promise<void>;
}

const globalForDb = globalThis as unknown as { __banatierBackendDb?: GlobalDbState };
if (!globalForDb.__banatierBackendDb) {
  globalForDb.__banatierBackendDb = {};
}
const dbState = globalForDb.__banatierBackendDb;

function isExternalPostgres(): boolean {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function getDbEngineMode(): "aws-rds-postgres" | "embedded-pglite" {
  return isExternalPostgres() ? "aws-rds-postgres" : "embedded-pglite";
}

function getPgPool(): Pool {
  if (!dbState.pgPool) {
    const sslEnabled = process.env.DATABASE_SSL === "true";
    dbState.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 15,
      idleTimeoutMillis: 30000,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    });
  }
  return dbState.pgPool;
}

function cleanStalePgliteLocks(targetDir: string): void {
  if (!fs.existsSync(targetDir)) return;
  for (const lockFile of ["postmaster.pid", ".s.PGSQL.5432.lock", ".s.PGSQL.5432.lock.out"]) {
    const fullPath = path.join(targetDir, lockFile);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Ignore if already removed
      }
    }
  }
}

async function openHealthyPglite(): Promise<PGlite> {
  if (dbState.pglite) return dbState.pglite;

  const customDataDir = process.env.PGLITE_DATA_DIR?.trim();
  if (customDataDir === "memory://") {
    const mem = new PGlite();
    await mem.waitReady;
    dbState.pglite = mem;
    return mem;
  }

  const targetDir = customDataDir || path.join(BACKEND_ROOT, "data", "banatier-pg");
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  cleanStalePgliteLocks(targetDir);

  try {
    const pg = new PGlite(targetDir);
    await pg.waitReady;
    dbState.pglite = pg;
    return pg;
  } catch {
    console.warn(
      "[Banatier Backend] Detected interrupted local PGlite state. Auto-recovering database..."
    );
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {
      // If a file handle is lingering on Windows, fall back to a fresh suffixed folder
      const fallbackDir = `${targetDir}-recovered-${Date.now()}`;
      const recovered = new PGlite(fallbackDir);
      await recovered.waitReady;
      dbState.pglite = recovered;
      return recovered;
    }
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    const freshPg = new PGlite(targetDir);
    await freshPg.waitReady;
    dbState.pglite = freshPg;
    return freshPg;
  }
}

async function rawQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[] }> {
  if (isExternalPostgres()) {
    const res = await getPgPool().query(sql, params);
    return { rows: res.rows as T[] };
  }
  const pg = await openHealthyPglite();
  const res = await pg.query<T>(sql, params);
  return { rows: res.rows };
}

export async function ensureDbInitialized(): Promise<void> {
  if (!dbState.initPromise) {
    dbState.initPromise = initializeSchemaAndSeed().catch((err) => {
      dbState.initPromise = undefined;
      throw err;
    });
  }
  return dbState.initPromise;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<{ rows: T[] }> {
  await ensureDbInitialized();
  return rawQuery<T>(sql, params);
}

export async function withTransaction<R>(fn: (tx: DbExecutor) => Promise<R>): Promise<R> {
  await ensureDbInitialized();

  if (isExternalPostgres()) {
    const client = await getPgPool().connect();
    try {
      await client.query("BEGIN");
      const executor: DbExecutor = {
        async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
          const res = await client.query(sql, params);
          return { rows: res.rows as T[] };
        },
      };
      const result = await fn(executor);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const pglite = await openHealthyPglite();
  return pglite.transaction(async (tx) => {
    const executor: DbExecutor = {
      async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
        const res = await tx.query<T>(sql, params);
        return { rows: res.rows };
      },
    };
    return fn(executor);
  });
}

async function initializeSchemaAndSeed(): Promise<void> {
  if (isExternalPostgres()) {
    const lockClient = await getPgPool().connect();
    try {
      // Serialize schema migration & initial seed across multiple AWS EC2 instances
      await lockClient.query("SELECT pg_advisory_lock(8462819)");
      await runSchemaAndSeedBody();
    } finally {
      await lockClient.query("SELECT pg_advisory_unlock(8462819)").catch(() => { });
      lockClient.release();
    }
    return;
  }
  await runSchemaAndSeedBody();
}

async function runSchemaAndSeedBody(): Promise<void> {
  const schemaPath = path.join(BACKEND_ROOT, "sql", "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  if (isExternalPostgres()) {
    await getPgPool().query(schemaSql);
  } else {
    const pglite = await openHealthyPglite();
    await pglite.exec(schemaSql);
  }

  await rawQuery(
    `INSERT INTO store_settings (id, brand_name, tagline, thermal_bag_capacity, thermal_bag_price, delivery_fee, pickup_location, payment_timeout_minutes)
     VALUES (1, 'Banatier', 'Artisanal Banana Patisserie', 2, 8000, 12000, 'Studio Banatier, Jl. Progo No. 14, Bandung', 10)
     ON CONFLICT (id) DO NOTHING`
  );

  const tiersCount = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM member_tiers`
  );
  if (Number(tiersCount.rows[0]?.count ?? 0) === 0) {
    await rawQuery(
      `INSERT INTO member_tiers (slug, name, discount_percent, min_purchase, min_paid_orders, sort_order) VALUES
       ('non-member', 'Reguler', 0, 0, 0, 0),
       ('member', 'Banatier Member', 10, 75000, 0, 1),
       ('gold', 'Banatier Gold', 15, 100000, 3, 2)
       ON CONFLICT (slug) DO NOTHING`
    );
  }

  const adminEmail = (
    process.env.ADMIN_EMAIL?.trim() || "admin-internal@banatier.local"
  ).toLowerCase();
  const adminPassword =
    process.env.ADMIN_PASSWORD?.trim() ||
    process.env.ADMIN_INITIAL_PASSWORD?.trim() ||
    "Banatier#Internal2026!";

  // Hapus akun demo publik lama jika belum pernah memiliki riwayat pesanan
  await rawQuery(
    `DELETE FROM users
     WHERE email = 'member@banatier.id'
       AND role = 'buyer'
       AND id NOT IN (SELECT user_id FROM orders WHERE user_id IS NOT NULL)`
  );

  // Sinkronkan akun khusus Admin secara privat dari konfigurasi .env
  const existingAdminRes = await rawQuery<{
    id: number;
    email: string;
    password_hash: string;
  }>(`SELECT id, email, password_hash FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`);

  if (existingAdminRes.rows.length === 0) {
    const adminHash = await bcrypt.hash(adminPassword, 10);
    await rawQuery(
      `INSERT INTO users (name, email, whatsapp, password_hash, role, is_member, member_tier_slug)
       VALUES ('Admin Banatier', $1, '081219048439', $2, 'admin', FALSE, 'non-member')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', password_hash = EXCLUDED.password_hash`,
      [adminEmail, adminHash]
    );
  } else {
    const currentAdmin = existingAdminRes.rows[0];
    const samePassword = await bcrypt.compare(adminPassword, currentAdmin.password_hash);
    if (currentAdmin.email !== adminEmail || !samePassword) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await rawQuery(`UPDATE users SET email = $1, password_hash = $2 WHERE id = $3`, [
        adminEmail,
        adminHash,
        currentAdmin.id,
      ]);
    }
  }

  const productsCount = await rawQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM products`
  );
  if (Number(productsCount.rows[0]?.count ?? 0) === 0) {
    const seededProducts = [
      {
        slug: "banana-strudel",
        name: "Banana Strudel",
        shortDescription:
          "Lapisan puff pastry renyah keemasan berisi pisang raja matang panggang yang manis legit.",
        basePrice: 45000,
        requiresThermalBag: false,
        hasVariants: true,
        variantLabel: "Pilih Varian Rasa",
        illustrationKey: "strudel",
        sortOrder: 1,
        quota: 25,
        variants: [
          { name: "Coklat", priceDelta: 0 },
          { name: "Coklat Keju", priceDelta: 5000 },
        ],
        addons: [{ name: "Extra Topping", price: 5000 }],
      },
      {
        slug: "bolu-pisang",
        name: "Bolu Pisang",
        shortDescription:
          "Loaf cake pisang lembut beraroma butter hangat dengan tekstur moist di setiap irisan.",
        basePrice: 42000,
        requiresThermalBag: false,
        hasVariants: true,
        variantLabel: "Pilih Varian Bolu",
        illustrationKey: "bolu",
        sortOrder: 2,
        quota: 25,
        variants: [
          { name: "Biasa (Original Butter)", priceDelta: 0 },
          { name: "Double Choc", priceDelta: 8000 },
        ],
        addons: [{ name: "Extra Topping", price: 5000 }],
      },
      {
        slug: "banana-split",
        name: "Banana Split",
        shortDescription:
          "Pisang segar pilihan berpadu dengan es krim lembut, whipped cream, dan saus coklat.",
        basePrice: 32000,
        requiresThermalBag: true,
        hasVariants: true,
        variantLabel: "Pilih Rasa Es Krim",
        illustrationKey: "split",
        sortOrder: 3,
        quota: 20,
        variants: [
          { name: "Vanilla Bean", priceDelta: 0 },
          { name: "Belgian Chocolate", priceDelta: 3000 },
          { name: "Strawberry Cream", priceDelta: 3000 },
        ],
        addons: [],
      },
      {
        slug: "banofee",
        name: "Banofee",
        shortDescription:
          "Dessert pie klasik dengan remahan biskuit butter, pisang segar, karamel dulce, dan krim lembut.",
        basePrice: 38000,
        requiresThermalBag: false,
        hasVariants: false,
        variantLabel: "",
        illustrationKey: "banofee",
        sortOrder: 4,
        quota: 20,
        variants: [],
        addons: [{ name: "Extra Sauce Karamel", price: 4000 }],
      },
      {
        slug: "bolen",
        name: "Bolen Pisang",
        shortDescription:
          "Pastry panggang khas Bandung berisi potongan pisang lembut dalam satu kotak isi 8 potong.",
        basePrice: 40000,
        requiresThermalBag: false,
        hasVariants: true,
        variantLabel: "Pilih Isian Bolen",
        illustrationKey: "bolen",
        sortOrder: 5,
        quota: 30,
        variants: [
          { name: "Pisang Coklat Lumer", priceDelta: 0 },
          { name: "Pisang Keju Spesial", priceDelta: 4000 },
          { name: "Mix Coklat & Keju", priceDelta: 3000 },
        ],
        addons: [{ name: "Extra Keju Parut", price: 4000 }],
      },
    ];

    const now = new Date();
    const opensAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const closesAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fulfillDate = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const periodInsert = await rawQuery<{ id: number }>(
      `INSERT INTO po_periods (name, opens_at, closes_at, fulfillment_date, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      ["Pre-Order Pekan Ini", opensAt.toISOString(), closesAt.toISOString(), fulfillDate]
    );
    const periodId = periodInsert.rows[0].id;

    for (const p of seededProducts) {
      const prodRes = await rawQuery<{ id: number }>(
        `INSERT INTO products (slug, name, short_description, base_price, requires_thermal_bag, has_variants, variant_label, illustration_key, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          p.slug,
          p.name,
          p.shortDescription,
          p.basePrice,
          p.requiresThermalBag,
          p.hasVariants,
          p.variantLabel,
          p.illustrationKey,
          p.sortOrder,
        ]
      );
      const productId = prodRes.rows[0].id;

      for (let i = 0; i < p.variants.length; i++) {
        const v = p.variants[i];
        await rawQuery(
          `INSERT INTO product_variants (product_id, name, price_delta, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [productId, v.name, v.priceDelta, i + 1]
        );
      }

      for (let i = 0; i < p.addons.length; i++) {
        const a = p.addons[i];
        await rawQuery(
          `INSERT INTO product_addons (product_id, name, price, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [productId, a.name, a.price, i + 1]
        );
      }

      await rawQuery(
        `INSERT INTO po_quotas (po_period_id, product_id, total_quota, reserved_count)
         VALUES ($1, $2, $3, 0)`,
        [periodId, productId, p.quota]
      );
    }
  }
  // Clean any legacy "Batch" label in existing seeded periods & allow product deletion without breaking order history
  await rawQuery(
    `UPDATE po_periods SET name = REPLACE(REPLACE(name, 'Batch ', ''), 'batch ', '') WHERE name ILIKE '%batch%'`
  );
  await rawQuery(
    `ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS admin_whatsapp VARCHAR(30) NOT NULL DEFAULT '081219048439'`
  ).catch(() => { });
  await rawQuery(
    `UPDATE store_settings SET admin_whatsapp = '081219048439' WHERE id = 1 AND admin_whatsapp = '081234567890'`
  );
  await rawQuery(
    `UPDATE users SET whatsapp = '081219048439' WHERE role = 'admin' AND whatsapp = '081234567890'`
  );
  await rawQuery(
    `UPDATE store_settings SET payment_timeout_minutes = 10 WHERE id = 1 AND payment_timeout_minutes != 10`
  );
  await rawQuery(`ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL`).catch(() => { });
  await rawQuery(`ALTER TABLE products ALTER COLUMN illustration_key TYPE TEXT`).catch(() => { });
}

export async function closeDatabase(): Promise<void> {
  if (dbState.pglite) {
    try {
      await dbState.pglite.close();
    } catch {
      // Ignore shutdown close errors
    }
    dbState.pglite = undefined;
  }
  if (dbState.pgPool) {
    try {
      await dbState.pgPool.end();
    } catch {
      // Ignore pool end errors
    }
    dbState.pgPool = undefined;
  }
  dbState.initPromise = undefined;
}

export async function resetTestDatabase(): Promise<void> {
  if (dbState.pglite) {
    await dbState.pglite.close();
    dbState.pglite = undefined;
  }
  dbState.initPromise = undefined;
  await ensureDbInitialized();
}
