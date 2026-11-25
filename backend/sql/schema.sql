-- Banatier Pre-Order Database Schema (PostgreSQL / AWS RDS Compatible)

CREATE TABLE IF NOT EXISTS store_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name VARCHAR(100) NOT NULL DEFAULT 'Banatier',
  tagline VARCHAR(255) NOT NULL DEFAULT 'Artisanal Banana Patisserie',
  thermal_bag_capacity INTEGER NOT NULL DEFAULT 2 CHECK (thermal_bag_capacity > 0),
  thermal_bag_price INTEGER NOT NULL DEFAULT 8000 CHECK (thermal_bag_price >= 0),
  delivery_fee INTEGER NOT NULL DEFAULT 12000 CHECK (delivery_fee >= 0),
  pickup_location VARCHAR(255) NOT NULL DEFAULT 'Dapur Banatier, Jl. Buah Batu No. 24, Bandung',
  admin_whatsapp VARCHAR(30) NOT NULL DEFAULT '081219048439',
  payment_timeout_minutes INTEGER NOT NULL DEFAULT 10 CHECK (payment_timeout_minutes > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_tiers (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  min_purchase INTEGER NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  min_paid_orders INTEGER NOT NULL DEFAULT 0 CHECK (min_paid_orders >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  whatsapp VARCHAR(30) NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'admin')),
  is_member BOOLEAN NOT NULL DEFAULT FALSE,
  member_tier_slug VARCHAR(50) NOT NULL DEFAULT 'non-member' REFERENCES member_tiers(slug),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  short_description TEXT NOT NULL,
  base_price INTEGER NOT NULL CHECK (base_price >= 0),
  requires_thermal_bag BOOLEAN NOT NULL DEFAULT FALSE,
  has_variants BOOLEAN NOT NULL DEFAULT FALSE,
  variant_label VARCHAR(80) NOT NULL DEFAULT 'Pilihan Varian',
  illustration_key VARCHAR(50) NOT NULL DEFAULT 'strudel',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_addons (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS po_periods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  fulfillment_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_quotas (
  id SERIAL PRIMARY KEY,
  po_period_id INTEGER NOT NULL REFERENCES po_periods(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  total_quota INTEGER NOT NULL DEFAULT 0 CHECK (total_quota >= 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0 AND reserved_count <= total_quota),
  UNIQUE (po_period_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_code VARCHAR(40) UNIQUE NOT NULL,
  po_period_id INTEGER NOT NULL REFERENCES po_periods(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_name VARCHAR(120) NOT NULL,
  recipient_whatsapp VARCHAR(30) NOT NULL,
  fulfillment_method VARCHAR(20) NOT NULL CHECK (fulfillment_method IN ('pickup', 'delivery')),
  fulfillment_date DATE NOT NULL,
  delivery_address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  tier_name_snapshot VARCHAR(80) NOT NULL DEFAULT 'Non-member',
  discount_percent_snapshot NUMERIC(5,2) NOT NULL DEFAULT 0,
  min_purchase_snapshot INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  thermal_bag_count INTEGER NOT NULL DEFAULT 0 CHECK (thermal_bag_count >= 0),
  thermal_bag_unit_price_snapshot INTEGER NOT NULL DEFAULT 0,
  thermal_bag_cost INTEGER NOT NULL DEFAULT 0 CHECK (thermal_bag_cost >= 0),
  shipping_cost INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
  grand_total INTEGER NOT NULL CHECK (grand_total >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'menunggu_pembayaran'
    CHECK (status IN ('menunggu_pembayaran', 'diproses', 'siap', 'selesai', 'dibatalkan', 'kedaluwarsa')),
  quota_released BOOLEAN NOT NULL DEFAULT FALSE,
  payment_provider VARCHAR(30) NOT NULL DEFAULT 'demo',
  payment_reference VARCHAR(120) NOT NULL DEFAULT '',
  qris_string TEXT NOT NULL DEFAULT '',
  qris_expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot VARCHAR(120) NOT NULL,
  variant_id INTEGER,
  variant_name_snapshot VARCHAR(100) NOT NULL DEFAULT '',
  addons_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit_base_price_snapshot INTEGER NOT NULL,
  variant_delta_snapshot INTEGER NOT NULL DEFAULT 0,
  addons_total_snapshot INTEGER NOT NULL DEFAULT 0,
  unit_total_price_snapshot INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_snapshot INTEGER NOT NULL,
  requires_thermal_bag_snapshot BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_po_period_id ON orders(po_period_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_code ON orders(order_code);
CREATE INDEX IF NOT EXISTS idx_orders_pending_expiry ON orders(status, quota_released, qris_expires_at);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_addons_product_id ON product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_quotas_period_id ON po_quotas(po_period_id);
