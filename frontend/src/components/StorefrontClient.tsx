"use client";

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  Leaf,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  ShoppingBag,
  Snowflake,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { HeroBolenBoluIllustration, ProductIllustration } from "./ProductIllustration";
import { useCart } from "./CartProvider";
import { formatRupiah } from "@/lib/cart-preview";
import type {
  MemberTier,
  PoPeriodSummary,
  ProductWithDetails,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

type CategoryFilter = "all" | "panggang" | "dingin" | "pastry";

function getProductCategories(slug: string): CategoryFilter[] {
  switch (slug) {
    case "banana-strudel":
      return ["all", "panggang", "pastry"];
    case "bolu-pisang":
      return ["all", "panggang"];
    case "banana-split":
      return ["all", "dingin"];
    case "banofee":
      return ["all", "dingin", "pastry"];
    default:
      return ["all", "panggang", "pastry"];
  }
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Memoized compact product card with Banatier's warm banana-butter, caramel, cocoa & leaf-green palette.
 */
const ProductCardItem = memo(function ProductCardItem({
  product,
  poOpen,
  onSelect,
}: {
  product: ProductWithDetails;
  poOpen: boolean;
  onSelect: (product: ProductWithDetails) => void;
}) {
  const soldOut = product.remainingQuota <= 0;
  const disabled = !poOpen || soldOut;

  return (
    <article
      onClick={() => {
        if (!disabled) onSelect(product);
      }}
      className={`group motion-card flex h-full flex-col justify-between rounded-2xl border border-[#EFE0B4] bg-[#FFFBEB] p-3.5 ${disabled
          ? "opacity-75"
          : "cursor-pointer hover:border-[#DFB858] hover:shadow-[0_10px_24px_rgba(107,63,29,0.08)]"
        }`}
    >
      <div>
        <div
          className="relative w-full shrink-0 overflow-hidden rounded-xl border border-[#EFE0B4]/70 bg-[#FFF3BC]"
          style={{ height: "176px" }}
        >
          <ProductIllustration
            illustrationKey={product.illustrationKey}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

          <div className="absolute top-2.5 right-2.5">
            {soldOut ? (
              <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-[11px] font-bold text-[#DC2626]">
                Habis
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5D399] bg-white/95 px-2.5 py-0.5 text-[11px] font-bold text-[#4A2E1B]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#5C8D1E]" />
                Sisa {product.remainingQuota}
              </span>
            )}
          </div>

          {product.requiresThermalBag && (
            <div className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full border border-[#BFE0F5] bg-[#E0F2FE] px-2.5 py-0.5 text-[10px] font-bold text-[#0369A1]">
              <Snowflake className="h-3 w-3" />
              <span>Thermal Bag</span>
            </div>
          )}
        </div>

        <div className="mt-3.5 space-y-1">
          <h3 className="font-display text-[17px] font-bold text-[#4A2E1B]">
            {product.name}
          </h3>
          <p className="line-clamp-2 text-xs leading-relaxed text-[#78583E]">
            {product.shortDescription}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#F3E6C0] pt-3.5">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#9C734B]">
            {product.hasVariants || product.addons.length > 0 ? "Mulai" : "Harga"}
          </span>
          <span className="font-display text-base font-extrabold text-[#855300]">
            {formatRupiah(product.startingPrice)}
          </span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onSelect(product);
          }}
          className={`motion-btn rounded-full px-4 py-1.5 text-xs font-bold ${!poOpen
              ? "cursor-not-allowed bg-[#EFE8D5] text-[#9A8470]"
              : soldOut
                ? "cursor-not-allowed bg-[#FEE2E2] text-[#DC2626]"
                : "bg-[#F8C93A] text-[#4A2E1B] shadow-2xs hover:bg-[#EAB522]"
            }`}
        >
          {!poOpen ? "PO Ditutup" : soldOut ? "Habis" : "Pilih"}
        </button>
      </div>
    </article>
  );
});

export function StorefrontClient({
  user,
  settings,
  poPeriod,
  tiers,
  products,
}: {
  user: SessionUser | null;
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  tiers: MemberTier[];
  products: ProductWithDetails[];
  serverInstanceId?: string;
}) {
  const router = useRouter();
  const { items, totalItems, addItem, updateQuantity, removeItem } = useCart();

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductWithDetails | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [qty, setQty] = useState<number>(1);
  const [modalError, setModalError] = useState<string>("");
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [toastText, setToastText] = useState<string>("");

  const [livePoPeriod, setLivePoPeriod] = useState<PoPeriodSummary | null>(poPeriod);
  const [liveProducts, setLiveProducts] = useState<ProductWithDetails[]>(products);

  // Sync live PO status & CRUD menu updates automatically when Customer tab regains focus
  useEffect(() => {
    setLivePoPeriod(poPeriod);
    setLiveProducts(products);
  }, [poPeriod, products]);

  useEffect(() => {
    let lastSyncAt = Date.now();
    async function syncCatalog() {
      const now = Date.now();
      if (now - lastSyncAt < 5000) return;
      lastSyncAt = now;
      try {
        const res = await fetch("/api/catalog", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if ("poPeriod" in data) setLivePoPeriod(data.poPeriod);
        if (Array.isArray(data.products)) setLiveProducts(data.products);
      } catch {
        // Ignore transient offline state
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncCatalog();
      }
    };
    window.addEventListener("focus", syncCatalog);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", syncCatalog);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const poOpen = Boolean(livePoPeriod?.isOpenNow);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "all") return liveProducts;
    return liveProducts.filter((p) => getProductCategories(p.slug).includes(categoryFilter));
  }, [liveProducts, categoryFilter]);

  const memberTiersOnly = useMemo(
    () => tiers.filter((t) => t.discountPercent > 0),
    [tiers]
  );

  const handleOpenProduct = useCallback((product: ProductWithDetails) => {
    setSelectedProduct(product);
    setSelectedVariantId(
      product.hasVariants && product.variants.length > 0 ? product.variants[0].id : null
    );
    setSelectedAddonIds([]);
    setQty(1);
    setModalError("");
  }, []);

  function toggleAddon(addonId: number) {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  }

  const modalUnitPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    const varDelta =
      selectedProduct.variants.find((v) => v.id === selectedVariantId)?.priceDelta ?? 0;
    const addonSum = selectedProduct.addons
      .filter((a) => selectedAddonIds.includes(a.id))
      .reduce((acc, a) => acc + a.price, 0);
    return selectedProduct.basePrice + varDelta + addonSum;
  }, [selectedProduct, selectedVariantId, selectedAddonIds]);

  function handleConfirmAdd() {
    if (!selectedProduct) return;
    if (selectedProduct.hasVariants && !selectedVariantId) {
      setModalError("Pilih salah satu varian terlebih dahulu.");
      return;
    }

    const chosenVariant = selectedProduct.variants.find((v) => v.id === selectedVariantId);
    const chosenAddons = selectedProduct.addons
      .filter((a) => selectedAddonIds.includes(a.id))
      .map((a) => ({ id: a.id, name: a.name, price: a.price }));

    const result = addItem({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      illustrationKey: selectedProduct.illustrationKey,
      basePrice: selectedProduct.basePrice,
      variantId: chosenVariant?.id ?? null,
      variantName: chosenVariant?.name ?? "",
      variantDelta: chosenVariant?.priceDelta ?? 0,
      addons: chosenAddons,
      quantity: qty,
      requiresThermalBag: selectedProduct.requiresThermalBag,
      maxQuota: selectedProduct.remainingQuota,
    });

    if (!result.ok) {
      setModalError(result.error || "Tidak dapat menambahkan ke keranjang.");
      return;
    }

    const addedName = selectedProduct.name;
    setSelectedProduct(null);
    setToastText(`${addedName} masuk keranjang`);
    setTimeout(() => setToastText(""), 2200);
  }

  const cartSubtotal = useMemo(() => {
    return items.reduce((acc, it) => {
      const addonsSum = it.addons.reduce((s, a) => s + a.price, 0);
      return acc + (it.basePrice + it.variantDelta + addonsSum) * it.quantity;
    }, 0);
  }, [items]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF3] text-[#4A2E1B]">
      <Navbar user={user} onOpenCart={() => setCartOpen(true)} />

      {/* Smooth Floating Toast */}
      {toastText && (
        <div className="animate-modal-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full bg-[#4A2E1B] px-4 py-2 text-xs font-bold text-[#FFFDF3] shadow-lg">
          <Check className="h-3.5 w-3.5 text-[#F8C93A]" />
          <span>{toastText}</span>
        </div>
      )}

      <main className="animate-page-in flex-1">
        {/* =========================================================
            1. SPACIOUS SPLIT HERO WITH WARM BANANA-CREAM-GREEN PALETTE
           ========================================================= */}
        <section className="relative overflow-hidden border-b border-[#F3E7BE] bg-gradient-to-b from-[#FFF9DC]/80 via-[#FFFDF3] to-[#FFFDF3]">
          <div className="mx-auto max-w-5xl px-5 pt-12 pb-16 sm:px-8 sm:pt-18 sm:pb-24">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
              {/* Left Column */}
              <div className="lg:col-span-7">
                {poOpen && livePoPeriod ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3.5 py-1 text-xs font-bold text-[#2F4C00]">
                    <span className="h-2 w-2 rounded-full bg-[#5C8D1E]" />
                    <span>
                      Pre-Order · Dibuka
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#F5C2C7] bg-[#FEE2E2] px-3.5 py-1 text-xs font-bold text-[#991B1B]">
                    <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                    <span>Pre-Order · Ditutup</span>
                  </div>
                )}

                <h1 className="font-display mt-4 text-[38px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#4A2E1B] sm:text-[48px] lg:text-[52px]">
                  <span className="block">Manisnya</span>
                  <span className="block">bolen renyah,</span>
                  <span className="block text-[#A65B1A] underline decoration-[#F8C93A] decoration-wavy decoration-2 underline-offset-4">
                    lembutnya
                  </span>
                  <span className="block">bolu pisang.</span>
                </h1>

                <p className="mt-5 max-w-md text-sm leading-relaxed text-[#78583E] sm:text-[15px]">
                  Pesan dari sekarang, pilih varian dan atur jadwalnya, lalu ambil di tempat atau diantar ke alamatmu. Bayar cukup scan QRIS, nominalnya langsung terisi.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <a
                    href="#katalog-menu"
                    onClick={(e) => {
                      const el = document.getElementById("katalog-menu");
                      if (el) {
                        e.preventDefault();
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                        window.history.replaceState(null, "", "#katalog-menu");
                      }
                    }}
                    className="motion-btn inline-flex items-center justify-center rounded-full border border-[#E2B227] bg-[#F8C93A] px-6 py-3 text-xs sm:text-[13px] font-bold text-[#4A2E1B] shadow-[0_4px_14px_rgba(248,201,58,0.38)] hover:bg-[#EAB522]"
                  >
                    Lihat Menu
                  </a>
                  <a
                    href="#alur-po"
                    onClick={(e) => {
                      const el = document.getElementById("alur-po");
                      if (el) {
                        e.preventDefault();
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                        window.history.replaceState(null, "", "#alur-po");
                      }
                    }}
                    className="motion-btn inline-flex items-center justify-center rounded-full border-[1.5px] border-[#D9C077] bg-[#FFF6C7] px-6 py-3 text-xs sm:text-[13px] font-bold text-[#4A2E1B] hover:bg-[#FFEE99]"
                  >
                    Cara Pesan
                  </a>
                </div>

                {/* Cheerful Color Accent Pills */}
                <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4E8A8] bg-[#EEF8D6] px-3 py-1 text-[#355808]">
                    <Leaf className="h-3.5 w-3.5 text-[#5C8D1E]" />
                    100% Pisang Raja Pilihan
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EDD892] bg-[#FFF5C0] px-3 py-1 text-[#6B3F1D]">
                    <Sparkles className="h-3.5 w-3.5 text-[#B86B23]" />
                    Diskon Otomatis Member
                  </span>
                </div>
              </div>

              {/* Right Column: Bolen & Bolu Pisang Visual */}
              <div className="lg:col-span-5">
                <HeroBolenBoluIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            2. MENU SECTION (Warm Butter Cards + Banana Gold Accents)
           ========================================================= */}
        <section id="katalog-menu" className="scroll-mt-16 mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-22">
          {!poOpen && (
            <div className="animate-page-in mb-8 flex items-start gap-3 rounded-2xl border border-[#F5C2C7] bg-[#FEE2E2]/80 p-4 text-xs text-[#991B1B] sm:items-center sm:px-5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
              <div>
                <strong className="font-bold">Pemesanan Pre-Order Sedang Ditutup: </strong>
                <span>
                  Saat ini pemesanan belum dibuka oleh Admin. Kamu tetap dapat melihat daftar menu di bawah ini dan memesan kembali saat periode pre-order aktif.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#A65B1A]">
                Katalog Pre-Order
              </span>
              <h2 className="font-display mt-0.5 text-2xl font-bold text-[#4A2E1B] sm:text-[28px]">
                Menu Pilihan
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#78583E]">
                Klik menu untuk memilih varian rasa dan tambahan sesuai seleramu.
              </p>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-full border border-[#EFE0B4] bg-[#FFF6C7] p-1">
              {[
                { id: "all", label: "Semua" },
                { id: "panggang", label: "Panggang" },
                { id: "dingin", label: "Dingin" },
                { id: "pastry", label: "Pastry" },
              ].map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id as CategoryFilter)}
                    className={`motion-btn whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs ${active
                        ? "bg-[#F8C93A] font-bold text-[#4A2E1B] shadow-2xs"
                        : "font-semibold text-[#78583E] hover:text-[#4A2E1B]"
                      }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <ProductCardItem
                key={product.id}
                product={product}
                poOpen={poOpen}
                onSelect={handleOpenProduct}
              />
            ))}
          </div>
        </section>

        {/* =========================================================
            3. CARA PESAN (Warm Pastel Banana Band + Step 2 Atur Jadwal)
           ========================================================= */}
        <section id="alur-po" className="scroll-mt-16 border-y border-[#EFE0B4] bg-[#FFF6C7]/60">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-22">
            <div className="max-w-lg">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#5C8D1E]">
                Mudah &amp; Transparan
              </span>
              <h2 className="font-display mt-0.5 text-2xl font-bold text-[#4A2E1B] sm:text-[28px]">
                Cara Pesan
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#78583E]">
                Empat langkah ringkas dari pilih kue hingga bukti lunas siap.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  num: "1",
                  title: "Pilih Menu",
                  desc: "Tentukan kue pisang, varian rasa, serta tambahan opsional.",
                  icon: ShoppingBag,
                  green: false,
                },
                {
                  num: "2",
                  title: "Atur Jadwal",
                  desc: "Isi kontak penerima lalu atur jadwal ambil di tempat atau diantar.",
                  icon: Calendar,
                  green: false,
                },
                {
                  num: "3",
                  title: "Bayar via QRIS",
                  desc: "Scan kode QRIS sesuai tagihan, terverifikasi otomatis tanpa kirim bukti.",
                  icon: QrCode,
                  green: false,
                },
                {
                  num: "4",
                  title: "Terima Pesanan",
                  desc: "Simpan struk digital lunas dan nikmati pesanan di hari pengambilan.",
                  icon: ReceiptText,
                  green: true,
                },
              ].map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.num}
                    className="motion-card rounded-2xl border border-[#EFE0B4] bg-[#FFFDF7] p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-display flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${step.green
                            ? "bg-[#C2F280] text-[#1E3A00]"
                            : "bg-[#F8C93A] text-[#4A2E1B]"
                          }`}
                      >
                        {step.num}
                      </span>
                      <Icon
                        className={`h-4 w-4 ${step.green ? "text-[#5C8D1E]" : "text-[#B86B23]"
                          }`}
                      />
                    </div>
                    <h3 className="font-display text-base font-bold text-[#4A2E1B]">
                      {step.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-[#78583E]">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* =========================================================
            4. WARM BANANA-CREAM MEMBER PRIVILEGE CARD
           ========================================================= */}
        {memberTiersOnly.length > 0 && (
          <section id="membership" className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-22">
            <div className="grid grid-cols-1 items-center gap-8 rounded-3xl border border-[#EAD496] bg-gradient-to-r from-[#FFF6C2] via-[#FFFBEB] to-[#EEF8D6] p-6 sm:p-9 lg:grid-cols-12 lg:gap-10">
              {/* Left Column: Badge, Heading, Copy & Aligned CTA */}
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3 py-1 text-[11px] font-bold text-[#2F4C00]">
                  <Sparkles className="h-3.5 w-3.5 text-[#5C8D1E]" />
                  <span>Program Member Banatier</span>
                </div>
                <h2 className="font-display mt-3 text-xl font-bold leading-snug text-[#4A2E1B] sm:text-2xl">
                  Potongan Harga Otomatis untuk Pelanggan Tetap
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[#78583E] sm:text-[13px]">
                  Daftar gratis dan nikmati diskon langsung pada subtotal kue setiap mencapai minimum pembelian.
                </p>
                <div className="mt-5">
                  <Link
                    href={user ? "/account" : "/login"}
                    className="motion-btn inline-flex items-center gap-2 rounded-full bg-[#4A2E1B] px-5 py-2.5 text-xs font-bold text-[#FFFDF3] shadow-xs hover:bg-[#382112]"
                  >
                    <span>{user?.isMember ? "Lihat Akun Member" : "Gabung Member"}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#F8C93A]" />
                  </Link>
                </div>
              </div>

              {/* Right Column: Symmetrical Equal-Height Tier Cards */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-6">
                {memberTiersOnly.map((t) => (
                  <div
                    key={t.id}
                    className="motion-card flex flex-col justify-between rounded-2xl border border-[#EAD496] bg-white/95 p-5 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[#4A2E1B]">
                          {t.name}
                        </span>
                        <span className="rounded-full bg-[#FFF6C7] px-2.5 py-0.5 text-[10px] font-bold text-[#855300]">
                          {t.minPaidOrders === 0 ? "Gratis" : `${t.minPaidOrders}× Order`}
                        </span>
                      </div>
                      <span className="font-display mt-3 block text-2xl font-extrabold text-[#5C8D1E]">
                        Hemat {t.discountPercent}%
                      </span>
                    </div>

                    <div className="mt-4 border-t border-[#F4E9C8] pt-2.5 text-[11px] font-medium text-[#78583E]">
                      Min. belanja {formatRupiah(t.minPurchase)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Mobile Sticky Quick Checkout Bar */}
      {totalItems > 0 && !cartOpen && (
        <div className="animate-modal-in fixed inset-x-0 bottom-4 z-30 mx-auto max-w-md px-4 sm:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="motion-btn flex w-full items-center justify-between rounded-full bg-[#4A2E1B] px-5 py-3.5 text-xs font-bold text-[#FFFDF3] shadow-lg"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-[#F8C93A]" />
              <span>{totalItems} item</span>
            </span>
            <span>{formatRupiah(cartSubtotal)} · Lihat Keranjang</span>
          </button>
        </div>
      )}

      {/* Smooth 60fps Product Customizer Modal */}
      {selectedProduct && (
        <div
          className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-[#382112]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="animate-modal-in max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#EFE0B4] bg-[#FFFDF3] p-6 shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative mb-4 w-full shrink-0 overflow-hidden rounded-2xl border border-[#EFE0B4] bg-[#FFF3BC]"
              style={{ height: "164px" }}
            >
              <ProductIllustration illustrationKey={selectedProduct.illustrationKey} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-[#4A2E1B]">
                  {selectedProduct.name}
                </h3>
                <p className="mt-0.5 text-xs text-[#78583E]">
                  Sisa kuota tersedia: {selectedProduct.remainingQuota} porsi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="motion-btn rounded-full p-1.5 text-[#78583E] hover:bg-[#FFF3B0] hover:text-[#4A2E1B]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedProduct.hasVariants && selectedProduct.variants.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#4A2E1B]">
                    {selectedProduct.variantLabel || "Pilih Varian"}
                  </label>
                  <span className="rounded-full bg-[#FFF3B0] px-2.5 py-0.5 text-[10px] font-bold text-[#4A2E1B]">
                    Wajib pilih 1
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {selectedProduct.variants.map((v) => {
                    const active = selectedVariantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVariantId(v.id);
                          setModalError("");
                        }}
                        className={`motion-btn flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs ${active
                            ? "border-[#4A2E1B] bg-[#FFF6C7] font-bold text-[#4A2E1B]"
                            : "border-[#EFE0B4] bg-white text-[#4A2E1B] hover:border-[#C68B59]"
                          }`}
                      >
                        <span>{v.name}</span>
                        <span className="text-[#78583E]">
                          {v.priceDelta > 0 ? `+${formatRupiah(v.priceDelta)}` : "Harga dasar"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedProduct.addons.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#4A2E1B]">Tambahan Opsional</label>
                  <span className="text-[10px] text-[#78583E]">Opsional</span>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {selectedProduct.addons.map((addon) => {
                    const checked = selectedAddonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        onClick={() => toggleAddon(addon.id)}
                        className={`motion-btn flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs ${checked
                            ? "border-[#4A2E1B] bg-[#FFF6C7] font-bold text-[#4A2E1B]"
                            : "border-[#EFE0B4] bg-white text-[#4A2E1B] hover:border-[#C68B59]"
                          }`}
                      >
                        <span>{addon.name}</span>
                        <span className="text-[#78583E]">+{formatRupiah(addon.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedProduct.requiresThermalBag && (
              <div className="mt-4 rounded-xl border border-[#C3DF8A] bg-[#E7F5C8]/70 px-3.5 py-2.5 text-[11px] text-[#2F4C00]">
                Otomatis menambahkan <strong>Thermal Bag</strong> ({formatRupiah(settings.thermalBagPrice)} / maks.{" "}
                {settings.thermalBagCapacity} porsi) saat checkout agar es krim tetap beku.
              </div>
            )}

            {modalError && (
              <p className="mt-3 text-xs font-semibold text-[#DC2626]">{modalError}</p>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-[#EFE0B4] pt-4">
              <div className="inline-flex items-center rounded-full border border-[#EFE0B4] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="motion-btn flex h-7 w-7 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF6C7]"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-bold text-[#4A2E1B]">{qty}</span>
                <button
                  type="button"
                  onClick={() =>
                    setQty((q) => Math.min(selectedProduct.remainingQuota, q + 1))
                  }
                  className="motion-btn flex h-7 w-7 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF6C7]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmAdd}
                className="motion-btn flex-1 rounded-full bg-[#F8C93A] px-5 py-3 text-xs font-bold text-[#4A2E1B] shadow-xs hover:bg-[#EAB522]"
              >
                Tambah · {formatRupiah(modalUnitPrice * qty)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smooth 60fps Slide-Over Cart Drawer */}
      {cartOpen && (
        <div
          className="animate-backdrop-in fixed inset-0 z-50 flex justify-end bg-[#382112]/40 backdrop-blur-[2px]"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="animate-drawer-in flex h-full w-full max-w-md flex-col bg-[#FFFDF3] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#EFE0B4] pb-4">
              <h3 className="font-display text-lg font-bold text-[#4A2E1B]">
                Keranjang Pesanan
              </h3>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="motion-btn rounded-full p-1.5 text-[#78583E] hover:bg-[#FFF3B0] hover:text-[#4A2E1B]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <ShoppingBag className="h-9 w-9 text-[#C68B59]/60" />
                <p className="font-display mt-3 text-sm font-bold text-[#4A2E1B]">
                  Keranjang masih kosong
                </p>
                <p className="mt-1 text-xs text-[#78583E]">
                  Pilih kue pisang favoritmu terlebih dahulu.
                </p>
              </div>
            ) : (
              <>
                <div className="flex-1 divide-y divide-[#EFE0B4] overflow-y-auto py-2">
                  {items.map((item) => {
                    const unit =
                      item.basePrice +
                      item.variantDelta +
                      item.addons.reduce((s, a) => s + a.price, 0);
                    return (
                      <div key={item.key} className="py-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-display text-sm font-bold text-[#4A2E1B]">
                              {item.productName}
                            </h4>
                            {item.variantName && (
                              <p className="text-xs text-[#78583E]">{item.variantName}</p>
                            )}
                            {item.addons.length > 0 && (
                              <p className="text-xs text-[#78583E]">
                                + {item.addons.map((a) => a.name).join(", ")}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="motion-btn p-1 text-[#78583E] hover:text-[#DC2626]"
                            title="Hapus"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-full border border-[#EFE0B4] bg-white p-0.5">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.key, item.quantity - 1)}
                              className="motion-btn flex h-6 w-6 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF6C7]"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-bold text-[#4A2E1B]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.key, item.quantity + 1)}
                              className="motion-btn flex h-6 w-6 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF6C7]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <span className="text-xs font-bold text-[#4A2E1B]">
                            {formatRupiah(unit * item.quantity)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-[#EFE0B4] pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#78583E]">Subtotal Kue</span>
                    <span className="font-display text-base font-bold text-[#4A2E1B]">
                      {formatRupiah(cartSubtotal)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#78583E]">
                    Atur jadwal, diskon member &amp; Thermal Bag di halaman berikutnya.
                  </p>
                  <button
                    type="button"
                    disabled={!poOpen}
                    onClick={() => {
                      setCartOpen(false);
                      router.push("/checkout");
                    }}
                    className="motion-btn mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#F8C93A] py-3 text-xs font-bold text-[#4A2E1B] shadow-xs hover:bg-[#EAB522] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Lanjut Atur Jadwal &amp; Bayar</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
