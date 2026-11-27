"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  ShoppingBag,
  Save,
  Plus,
  Power,
  Trash2,
  Users,
  Sparkles,
  ShieldCheck,
  X,
  Eye,
  EyeOff,
  Snowflake,
  Upload,
} from "lucide-react";
import { Navbar, type AdminTabKey } from "./Navbar";
import { Footer } from "./Footer";
import { ProductIllustration } from "./ProductIllustration";
import { formatRupiah } from "@/lib/cart-preview";
import type {
  AdminUserRecord,
  MemberTier,
  OrderRecord,
  OrderStatus,
  PoPeriodSummary,
  ProductWithDetails,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

const ORDER_STATUS_BADGE: Record<
  OrderStatus,
  { label: string; bg: string; text: string }
> = {
  menunggu_pembayaran: {
    label: "Menunggu Pembayaran",
    bg: "bg-[#FFF6C7]",
    text: "text-[#855300]",
  },
  diproses: {
    label: "Dibayar / Diproses",
    bg: "bg-[#E7F5C8]",
    text: "text-[#2F4C00]",
  },
  siap: {
    label: "Siap Diambil / Dikirim",
    bg: "bg-[#E7F5C8]",
    text: "text-[#2F4C00]",
  },
  selesai: {
    label: "Selesai",
    bg: "bg-[#F3ECE0]",
    text: "text-[#4A2E1B]",
  },
  dibatalkan: {
    label: "Dibatalkan",
    bg: "bg-[#FEE2E2]",
    text: "text-[#DC2626]",
  },
  kedaluwarsa: {
    label: "Kedaluwarsa",
    bg: "bg-[#FEE2E2]",
    text: "text-[#DC2626]",
  },
};

const ILLUSTRATION_OPTIONS = [
  { key: "strudel", label: "Banana Strudel" },
  { key: "bolu", label: "Bolu Pisang" },
  { key: "split", label: "Banana Split" },
  { key: "banofee", label: "Banofee" },
  { key: "bolen", label: "Bolen Pisang" },
];

const PRESET_KEYS = new Set(ILLUSTRATION_OPTIONS.map((o) => o.key));

async function compressImageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pilih file gambar (JPG, PNG, atau WebP).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Ukuran foto maksimal 10 MB.");
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Format gambar tidak dapat dimuat."));
    el.src = rawDataUrl;
  });

  const maxDim = 640;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return rawDataUrl;

  ctx.fillStyle = "#FFFDF7";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function catalogSnapshot(
  settings: StoreSettings,
  tiers: MemberTier[],
  products: ProductWithDetails[]
): string {
  return JSON.stringify({ settings, tiers, products });
}

export function AdminClient({
  user,
  initialTab = "orders",
  initialSettings,
  initialPoPeriod,
  initialTiers,
  initialProducts,
  initialOrders,
  initialUsers,
}: {
  user: SessionUser;
  initialTab?: AdminTabKey;
  initialSettings: StoreSettings;
  initialPoPeriod: PoPeriodSummary | null;
  initialTiers: MemberTier[];
  initialProducts: ProductWithDetails[];
  initialOrders: OrderRecord[];
  initialUsers: AdminUserRecord[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTabKey>(initialTab);

  const [orders, setOrders] = useState<OrderRecord[]>(initialOrders);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [products, setProducts] = useState<ProductWithDetails[]>(initialProducts);
  const [tiers, setTiers] = useState<MemberTier[]>(initialTiers);
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [usersList, setUsersList] = useState<AdminUserRecord[]>(initialUsers);
  const [poOpen, setPoOpen] = useState<boolean>(Boolean(initialPoPeriod?.isOpenNow));

  // New Menu Modal State (CREATE in CRUD Menu)
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [newBasePrice, setNewBasePrice] = useState<number>(35000);
  const [newInitialQuota, setNewInitialQuota] = useState<number>(20);
  const [newIllustration, setNewIllustration] = useState<string>("bolen");
  const [newThermalBag, setNewThermalBag] = useState<boolean>(false);
  const [newVariants, setNewVariants] = useState<Array<{ name: string; priceDelta: number }>>([
    { name: "Original", priceDelta: 0 },
  ]);
  const [newAddons, setNewAddons] = useState<Array<{ name: string; price: number }>>([]);

  const [feedback, setFeedback] = useState<string>("");
  const [feedbackTone, setFeedbackTone] = useState<"info" | "error">("info");
  const [busy, setBusy] = useState<boolean>(false);

  const catalogBaselineRef = useRef<string>(
    catalogSnapshot(initialSettings, initialTiers, initialProducts)
  );

  const catalogDirty = useMemo(
    () => catalogSnapshot(settings, tiers, products) !== catalogBaselineRef.current,
    [settings, tiers, products]
  );

  function notify(msg: string, tone: "info" | "error" = "info") {
    setFeedbackTone(tone);
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3000);
  }

  function isCatalogNavigationBlocked(): boolean {
    if (tab === "catalog" && catalogDirty) {
      notify(
        "Perubahan di Kelola Menu belum disimpan. Simpan dulu sebelum pindah halaman.",
        "error"
      );
      return true;
    }
    return false;
  }

  function requestTabChange(next: AdminTabKey) {
    if (next === tab) return;
    if (isCatalogNavigationBlocked()) return;
    setTab(next);
  }

  useEffect(() => {
    if (!catalogDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [catalogDirty]);

  async function reloadOverview() {
    const res = await fetch(`/api/admin/overview`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setOrders(data.orders);
    setProducts(data.products);
    setTiers(data.tiers);
    setSettings(data.settings);
    catalogBaselineRef.current = catalogSnapshot(
      data.settings as StoreSettings,
      data.tiers as MemberTier[],
      data.products as ProductWithDetails[]
    );
    if (Array.isArray(data.users)) {
      setUsersList(data.users);
    }
    if (data.poPeriod) {
      setPoOpen(Boolean(data.poPeriod.isOpenNow));
    } else {
      setPoOpen(false);
    }
  }

  async function handleOrderStatusChange(orderCode: string, status: OrderStatus) {
    const previousOrders = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.orderCode === orderCode
          ? {
            ...o,
            status,
            paidAt:
              status === "diproses" || status === "siap" || status === "selesai"
                ? o.paidAt ?? new Date().toISOString()
                : null,
          }
          : o
      )
    );
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrders(previousOrders);
        notify(data.error || "Gagal memperbarui status pesanan");
        return;
      }
      if (data.order) {
        setOrders((prev) =>
          prev.map((o) => (o.orderCode === orderCode ? data.order : o))
        );
      }
      notify(`Status ${orderCode} diperbarui menjadi "${ORDER_STATUS_BADGE[status].label}"`);
      void reloadOverview();
    } catch {
      setOrders(previousOrders);
      notify("Gagal menghubungi server saat mengubah status pesanan");
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePoOpen() {
    if (!initialPoPeriod) return;
    const nextState = !poOpen;
    setPoOpen(nextState);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/po-periods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId: initialPoPeriod.id,
          isActive: nextState,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const confirmedOpen = data.poPeriod ? Boolean(data.poPeriod.isOpenNow) : nextState;
        setPoOpen(confirmedOpen);
        notify(
          confirmedOpen
            ? "Status PO AKTIF — Pelanggan kini dapat memesan di Landing Page."
            : "Status PO MATI — Info PO Ditutup kini tampil di Landing Page Customer."
        );
        void reloadOverview();
      } else {
        setPoOpen(!nextState);
      }
    } catch {
      setPoOpen(!nextState);
    } finally {
      setBusy(false);
    }
  }

  // CREATE MENU (CRUD)
  async function handleCreateMenuSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newDesc.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          shortDescription: newDesc.trim(),
          basePrice: newBasePrice,
          initialQuota: newInitialQuota,
          illustrationKey: newIllustration,
          requiresThermalBag: newThermalBag,
          variants: newVariants.filter((v) => v.name.trim().length > 0),
          addons: newAddons.filter((a) => a.name.trim().length > 0),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || "Gagal menambah menu baru");
        return;
      }
      setShowCreateModal(false);
      setNewName("");
      setNewDesc("");
      setNewBasePrice(35000);
      setNewInitialQuota(20);
      setNewIllustration("bolen");
      setNewThermalBag(false);
      setNewVariants([{ name: "Original", priceDelta: 0 }]);
      setNewAddons([]);
      notify("Menu baru berhasil ditambahkan ke katalog!");
      await reloadOverview();
    } finally {
      setBusy(false);
    }
  }

  // UPDATE MENU (CRUD)
  async function handleSaveProduct(p: ProductWithDetails) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "product",
          id: p.id,
          name: p.name,
          shortDescription: p.shortDescription,
          basePrice: p.basePrice,
          isActive: p.isActive,
          requiresThermalBag: p.requiresThermalBag,
          illustrationKey: p.illustrationKey,
          totalQuota: p.totalQuota,
          variants: p.variants,
          addons: p.addons,
        }),
      });
      if (res.ok) {
        notify(`Perubahan menu "${p.name}" berhasil disimpan`);
        await reloadOverview();
      }
    } finally {
      setBusy(false);
    }
  }

  // DELETE MENU (CRUD)
  async function handleDeleteProduct(p: ProductWithDetails) {
    const confirmed = window.confirm(
      `Hapus menu "${p.name}" secara permanen dari katalog? (Riwayat struk pesanan lama tetap aman)`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/admin/catalog?id=${encodeURIComponent(String(p.id))}`, {
        method: "DELETE",
      });
      if (res.ok) {
        notify(`Menu "${p.name}" telah dihapus dari katalog`);
        await reloadOverview();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSettingsAndTiers() {
    setBusy(true);
    try {
      await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "settings",
          ...settings,
        }),
      });

      for (const t of tiers) {
        await fetch("/api/admin/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "tier",
            ...t,
          }),
        });
      }

      notify("Pengaturan Thermal Bag, Pengantaran & Tier Member disimpan");
      await reloadOverview();
    } finally {
      setBusy(false);
    }
  }

  const displayedOrders =
    statusFilter === "all"
      ? orders
      : statusFilter === "dibatalkan"
        ? orders.filter((o) => o.status === "dibatalkan" || o.status === "kedaluwarsa")
        : orders.filter((o) => o.status === statusFilter);

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF3] text-[#4A2E1B]">
      <Navbar
        user={user}
        adminActiveTab={tab}
        onSelectAdminTab={(next) => requestTabChange(next)}
        onBeforeNavigate={() => !isCatalogNavigationBlocked()}
      />

      {feedback && (
        <div
          className={`animate-modal-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-xs font-bold shadow-lg ${feedbackTone === "error"
            ? "bg-[#B8424C] text-[#FFFDF7]"
            : "bg-[#4A2E1B] text-[#FFFDF3]"
            }`}
        >
          {feedback}
        </div>
      )}

      <main className="animate-page-in mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-8 sm:py-11">
        {/* Top Bar: Title + Clickable Live PO Status Switch */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[#EFE0B4] bg-white p-6 sm:flex-row sm:items-center">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[#4A2E1B] sm:text-3xl">
              Dashboard Admin
            </h1>
            <p className="mt-1 text-xs text-[#78583E]">
              Kelola status pesanan masuk, CRUD menu kue, jadwal buka/tutup PO, dan daftar pengguna.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleTogglePoOpen}
            className={`motion-btn inline-flex items-center gap-2.5 rounded-full border px-5 py-2.5 text-xs font-extrabold shadow-2xs ${poOpen
              ? "border-[#B8DB7C] bg-[#E7F5C8] text-[#2F4C00] hover:bg-[#D8EEAE]"
              : "border-[#F5C2C7] bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FCD2D2]"
              }`}
          >
            <Power className="h-4 w-4" />
            <span>
              {poOpen
                ? "Status PO: AKTIF (Klik untuk Matikan)"
                : "Status PO: MATI / DITUTUP (Klik untuk Buka)"}
            </span>
          </button>
        </div>

        {/* Section Sub-Navigation Tabs (Mobile & Desktop) */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-[#EFE0B4] pb-3.5">
          {[
            { id: "orders", label: `Pesanan Masuk (${orders.length})`, icon: ShoppingBag },
            { id: "catalog", label: `Kelola Menu (${products.length})`, icon: Package },
            { id: "users", label: `Daftar Pengguna (${usersList.length})`, icon: Users },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => requestTabChange(t.id as AdminTabKey)}
                className={`motion-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${active
                  ? "bg-[#4A2E1B] text-[#FFFDF3]"
                  : "border border-[#EFE0B4] bg-white text-[#78583E] hover:bg-[#FFF6C7] hover:text-[#4A2E1B]"
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* =========================================================
            TAB 1: PESANAN MASUK & UBAH STATUS
           ========================================================= */}
        {tab === "orders" && (
          <section className="animate-page-in mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: "all", label: "Semua" },
                  { id: "menunggu_pembayaran", label: "Menunggu Bayar" },
                  { id: "diproses", label: "Diproses" },
                  { id: "siap", label: "Siap" },
                  { id: "selesai", label: "Selesai" },
                  { id: "dibatalkan", label: "Batal / Expire" },
                ].map((f) => {
                  const active = statusFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatusFilter(f.id as OrderStatus | "all")}
                      className={`motion-btn rounded-full px-3 py-1 text-xs font-bold ${active
                        ? "bg-[#F8C93A] text-[#4A2E1B]"
                        : "border border-[#EFE0B4] bg-white text-[#78583E] hover:text-[#4A2E1B]"
                        }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {displayedOrders.length === 0 ? (
              <div className="rounded-3xl border border-[#EFE0B4] bg-white p-10 text-center text-xs text-[#78583E]">
                Belum ada pesanan pada filter ini.
              </div>
            ) : (
              <div className="space-y-3">
                {displayedOrders.map((ord) => {
                  const badge = ORDER_STATUS_BADGE[ord.status];
                  return (
                    <div
                      key={ord.id}
                      className="rounded-2xl border border-[#EFE0B4] bg-white p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-extrabold text-[#4A2E1B]">
                              {ord.orderCode}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.bg} ${badge.text}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs font-semibold text-[#4A2E1B]">
                              · {ord.recipientName} ({ord.recipientWhatsapp})
                            </span>
                          </div>

                          <p className="text-xs text-[#78583E]">
                            {ord.items
                              .map(
                                (it) =>
                                  `${it.productNameSnapshot}${it.variantNameSnapshot ? ` [${it.variantNameSnapshot}]` : ""
                                  }${it.addonsSnapshot.length
                                    ? ` +${it.addonsSnapshot.map((a) => a.name).join(",")}`
                                    : ""
                                  } ×${it.quantity}`
                              )
                              .join(" · ")}
                          </p>

                          <p className="text-[11px] text-[#78583E]">
                            {ord.fulfillmentMethod === "delivery"
                              ? `Diantar ke: ${ord.deliveryAddress}`
                              : "Ambil di Tempat"}{" "}
                            · Jadwal <strong>{ord.fulfillmentDate}</strong>
                            {ord.thermalBagCount > 0 &&
                              ` · Thermal Bag ×${ord.thermalBagCount}`}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-right">
                            <span className="font-display block text-sm font-extrabold text-[#4A2E1B]">
                              {formatRupiah(ord.grandTotal)}
                            </span>
                            <span
                              className={`text-[11px] font-bold ${ord.paidAt ? "text-[#5C8D1E]" : "text-[#855300]"
                                }`}
                            >
                              {ord.paidAt ? "QRIS Lunas" : "Belum Lunas"}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#78583E]">
                              Ubah Status
                            </span>
                            <select
                              value={ord.status}
                              disabled={busy}
                              onChange={(e) =>
                                handleOrderStatusChange(
                                  ord.orderCode,
                                  e.target.value as OrderStatus
                                )
                              }
                              className="rounded-xl border border-[#DFC98B] bg-[#FFFBEB] px-3 py-1.5 text-xs font-bold text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                            >
                              <option value="menunggu_pembayaran">Menunggu Pembayaran</option>
                              <option value="diproses">Dibayar / Diproses</option>
                              <option value="siap">Siap Diambil / Dikirim</option>
                              <option value="selesai">Selesai</option>
                              <option value="dibatalkan">Dibatalkan</option>
                              <option value="kedaluwarsa">Kedaluwarsa</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================================================
            TAB 2: RULES + FULL CRUD MENU
           ========================================================= */}
        {tab === "catalog" && (
          <section className="animate-page-in mt-6 space-y-6">
            {/* Thermal Bag, Delivery & Member Tier Settings */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-3xl border border-[#EFE0B4] bg-white p-6 lg:col-span-5">
                <h3 className="font-display text-lg font-bold text-[#4A2E1B]">
                  Aturan Thermal Bag &amp; Kurir
                </h3>
                <div className="mt-4 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-[#4A2E1B]">Kapasitas / Bag</label>
                      <input
                        type="number"
                        min={1}
                        value={settings.thermalBagCapacity}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            thermalBagCapacity: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4A2E1B]">Harga Bag (Rp)</label>
                      <input
                        type="number"
                        min={0}
                        value={settings.thermalBagPrice}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            thermalBagPrice: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-[#4A2E1B]">Biaya Pengantaran (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      value={settings.deliveryFee}
                      onChange={(e) =>
                        setSettings({ ...settings, deliveryFee: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#4A2E1B]">Lokasi Ambil (Pickup)</label>
                    <input
                      type="text"
                      value={settings.pickupLocation}
                      onChange={(e) =>
                        setSettings({ ...settings, pickupLocation: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-[#4A2E1B]">Nomor WhatsApp Admin</label>
                    <input
                      type="tel"
                      value={settings.adminWhatsapp}
                      onChange={(e) =>
                        setSettings({ ...settings, adminWhatsapp: e.target.value })
                      }
                      placeholder="Contoh: 081219048439"
                      className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-2"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#EFE0B4] bg-white p-6 lg:col-span-7">
                <h3 className="font-display text-lg font-bold text-[#4A2E1B]">
                  Tier Membership &amp; Diskon
                </h3>
                <div className="mt-4 space-y-3">
                  {tiers
                    .filter((t) => t.slug !== "non-member")
                    .map((tier) => (
                      <div
                        key={tier.id}
                        className="grid grid-cols-1 gap-2.5 rounded-2xl border border-[#EFE0B4] bg-[#FFFDF7] p-3.5 text-xs sm:grid-cols-[1.6fr_0.9fr_1.1fr_0.9fr]"
                      >
                        <div>
                          <label className="text-[11px] text-[#78583E]">Nama Tier</label>
                          <input
                            type="text"
                            value={tier.name}
                            onChange={(e) =>
                              setTiers((prev) =>
                                prev.map((x) =>
                                  x.id === tier.id ? { ...x, name: e.target.value } : x
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5 font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#78583E]">Diskon (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={90}
                            value={tier.discountPercent}
                            onChange={(e) =>
                              setTiers((prev) =>
                                prev.map((x) =>
                                  x.id === tier.id
                                    ? { ...x, discountPercent: Number(e.target.value) }
                                    : x
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#78583E]">Min. Belanja</label>
                          <input
                            type="number"
                            min={0}
                            value={tier.minPurchase}
                            onChange={(e) =>
                              setTiers((prev) =>
                                prev.map((x) =>
                                  x.id === tier.id
                                    ? { ...x, minPurchase: Number(e.target.value) }
                                    : x
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-[#78583E]">Syarat Lunas</label>
                          <input
                            type="number"
                            min={0}
                            value={tier.minPaidOrders}
                            onChange={(e) =>
                              setTiers((prev) =>
                                prev.map((x) =>
                                  x.id === tier.id
                                    ? { ...x, minPaidOrders: Number(e.target.value) }
                                    : x
                                )
                              )
                            }
                            className="mt-0.5 w-full rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                          />
                        </div>
                      </div>
                    ))}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveSettingsAndTiers}
                  className="motion-btn mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#4A2E1B] px-5 py-2.5 text-xs font-bold text-[#FFFDF3] hover:bg-[#382112]"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Simpan Aturan &amp; Tier Member</span>
                </button>
              </div>
            </div>

            {/* Catalog CRUD Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EFE0B4] bg-[#FFFBEB] p-4 sm:px-6">
              <div>
                <h2 className="font-display text-lg font-bold text-[#4A2E1B]">
                  Katalog Menu Kue Pisang ({products.length} Menu)
                </h2>
                <p className="text-xs text-[#78583E]">
                  Tambah menu baru, ubah harga/varian/tambahan, sembunyikan, atau hapus menu.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="motion-btn inline-flex items-center gap-1.5 rounded-full bg-[#F8C93A] px-5 py-2.5 text-xs font-extrabold text-[#4A2E1B] shadow-2xs hover:bg-[#EAB522]"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Menu Baru</span>
              </button>
            </div>

            {/* Product CRUD Cards */}
            <div className="space-y-4">
              {products.map((prod) => (
                <div
                  key={prod.id}
                  className={`rounded-3xl border p-6 text-xs transition-opacity ${prod.isActive
                    ? "border-[#EFE0B4] bg-white"
                    : "border-[#E5DEC9] bg-[#FAF7EF] opacity-80"
                    }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-1 flex-wrap items-center gap-4">
                      <label
                        title="Klik untuk upload foto baru dari perangkat"
                        className="group relative shrink-0 cursor-pointer overflow-hidden rounded-xl border border-[#EFE0B4] bg-[#FFF3BC]"
                        style={{ width: "88px", height: "72px" }}
                      >
                        <ProductIllustration illustrationKey={prod.illustrationKey} />
                        <span className="absolute inset-0 flex items-center justify-center bg-[#382112]/55 text-[10px] font-bold text-[#FFFDF3] opacity-0 transition-opacity group-hover:opacity-100">
                          Ganti Foto
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            try {
                              const dataUrl = await compressImageFileToDataUrl(file);
                              setProducts((prev) =>
                                prev.map((x) =>
                                  x.id === prod.id ? { ...x, illustrationKey: dataUrl } : x
                                )
                              );
                              notify(
                                `Foto baru dipilih untuk "${prod.name}" — klik Simpan untuk menerapkan.`
                              );
                            } catch (err) {
                              notify(
                                err instanceof Error ? err.message : "Gagal memproses foto",
                                "error"
                              );
                            }
                          }}
                        />
                      </label>

                      <div className="flex-1 min-w-[220px] space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={prod.name}
                            onChange={(e) =>
                              setProducts((prev) =>
                                prev.map((x) =>
                                  x.id === prod.id ? { ...x, name: e.target.value } : x
                                )
                              )
                            }
                            className="font-display rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-1.5 text-base font-bold text-[#4A2E1B]"
                          />

                          <label className="motion-btn inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#DFC98B] bg-[#FFF6C7] px-3 py-1.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#F8C93A]/60">
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Foto Baru</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                try {
                                  const dataUrl = await compressImageFileToDataUrl(file);
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id ? { ...x, illustrationKey: dataUrl } : x
                                    )
                                  );
                                  notify(
                                    `Foto baru dipilih untuk "${prod.name}" — klik Simpan untuk menerapkan.`
                                  );
                                } catch (err) {
                                  notify(
                                    err instanceof Error ? err.message : "Gagal memproses foto",
                                    "error"
                                  );
                                }
                              }}
                            />
                          </label>

                          <select
                            value={
                              PRESET_KEYS.has(prod.illustrationKey)
                                ? prod.illustrationKey
                                : "__custom__"
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__custom__") return;
                              setProducts((prev) =>
                                prev.map((x) =>
                                  x.id === prod.id ? { ...x, illustrationKey: val } : x
                                )
                              );
                            }}
                            className="rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5 text-xs font-semibold text-[#4A2E1B]"
                          >
                            {!PRESET_KEYS.has(prod.illustrationKey) && (
                              <option value="__custom__">Foto: Gambar Kustom Baru</option>
                            )}
                            {ILLUSTRATION_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                Foto Bawaan: {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <input
                          type="text"
                          value={prod.shortDescription}
                          onChange={(e) =>
                            setProducts((prev) =>
                              prev.map((x) =>
                                x.id === prod.id
                                  ? { ...x, shortDescription: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder="Deskripsi singkat menu..."
                          className="w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3 py-1.5 text-xs text-[#4A2E1B]"
                        />
                      </div>
                    </div>

                    {/* Visibility, Save & Delete Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setProducts((prev) =>
                            prev.map((x) =>
                              x.id === prod.id ? { ...x, isActive: !x.isActive } : x
                            )
                          )
                        }
                        className={`motion-btn inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-bold ${prod.isActive
                          ? "border-[#C3DF8A] bg-[#E7F5C8] text-[#2F4C00]"
                          : "border-[#E5DEC9] bg-white text-[#78583E]"
                          }`}
                      >
                        {prod.isActive ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            <span>Tampil</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            <span>Disembunyikan</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleSaveProduct(prod)}
                        className="motion-btn inline-flex items-center gap-1.5 rounded-full bg-[#F8C93A] px-4 py-1.5 font-bold text-[#4A2E1B] hover:bg-[#EAB522]"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Simpan</span>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDeleteProduct(prod)}
                        title="Hapus Menu"
                        className="motion-btn inline-flex items-center gap-1 rounded-full border border-[#F5C2C7] bg-[#FEE2E2] px-3 py-1.5 font-bold text-[#DC2626] hover:bg-[#FCD2D2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>

                  {/* Price, Quota & Thermal Bag Row */}
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-[#F4E9C8] py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#78583E]">Harga Dasar (Rp):</span>
                      <input
                        type="number"
                        min={0}
                        value={prod.basePrice}
                        onChange={(e) =>
                          setProducts((prev) =>
                            prev.map((x) =>
                              x.id === prod.id
                                ? { ...x, basePrice: Number(e.target.value) }
                                : x
                            )
                          )
                        }
                        className="w-28 rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5 font-bold text-[#4A2E1B]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#78583E]">Total Kuota PO:</span>
                      <input
                        type="number"
                        min={prod.reservedCount}
                        value={prod.totalQuota}
                        onChange={(e) =>
                          setProducts((prev) =>
                            prev.map((x) =>
                              x.id === prod.id
                                ? { ...x, totalQuota: Number(e.target.value) }
                                : x
                            )
                          )
                        }
                        className="w-20 rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5 text-center font-bold text-[#4A2E1B]"
                      />
                      <span className="text-[11px] text-[#78583E]">
                        (Terpesan: {prod.reservedCount})
                      </span>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#BFE0F5] bg-[#E0F2FE]/60 px-3 py-1 font-semibold text-[#0369A1]">
                      <input
                        type="checkbox"
                        checked={prod.requiresThermalBag}
                        onChange={(e) =>
                          setProducts((prev) =>
                            prev.map((x) =>
                              x.id === prod.id
                                ? { ...x, requiresThermalBag: e.target.checked }
                                : x
                            )
                          )
                        }
                        className="accent-[#0369A1]"
                      />
                      <Snowflake className="h-3.5 w-3.5" />
                      <span>Wajib Thermal Bag</span>
                    </label>
                  </div>

                  {/* Variants & Add-ons Inline CRUD */}
                  <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                    {/* Variants */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#4A2E1B]">
                          Varian &amp; Selisih Harga
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setProducts((prev) =>
                              prev.map((x) =>
                                x.id === prod.id
                                  ? {
                                    ...x,
                                    variants: [
                                      ...x.variants,
                                      {
                                        id: 0,
                                        productId: prod.id,
                                        name: "",
                                        priceDelta: 0,
                                        isAvailable: true,
                                      },
                                    ],
                                  }
                                  : x
                              )
                            )
                          }
                          className="text-[11px] font-bold text-[#855300] hover:underline"
                        >
                          + Tambah Varian
                        </button>
                      </div>

                      {prod.variants.length === 0 ? (
                        <p className="mt-1.5 text-[#78583E]">Tanpa pilihan varian</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {prod.variants.map((v, vIdx) => (
                            <div key={v.id || `new-v-${vIdx}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Nama varian..."
                                value={v.name}
                                onChange={(e) =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          variants: x.variants.map((vx, idx) =>
                                            idx === vIdx
                                              ? { ...vx, name: e.target.value }
                                              : vx
                                          ),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="flex-1 rounded-lg border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5"
                              />
                              <input
                                type="number"
                                placeholder="+Rp"
                                value={v.priceDelta}
                                onChange={(e) =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          variants: x.variants.map((vx, idx) =>
                                            idx === vIdx
                                              ? { ...vx, priceDelta: Number(e.target.value) }
                                              : vx
                                          ),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="w-24 rounded-lg border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          variants: x.variants.filter((_, idx) => idx !== vIdx),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="rounded-lg p-1 text-[#78583E] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                                title="Hapus varian"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add-ons */}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#4A2E1B]">Tambahan (Add-on)</span>
                        <button
                          type="button"
                          onClick={() =>
                            setProducts((prev) =>
                              prev.map((x) =>
                                x.id === prod.id
                                  ? {
                                    ...x,
                                    addons: [
                                      ...x.addons,
                                      {
                                        id: 0,
                                        productId: prod.id,
                                        name: "",
                                        price: 4000,
                                        isAvailable: true,
                                      },
                                    ],
                                  }
                                  : x
                              )
                            )
                          }
                          className="text-[11px] font-bold text-[#855300] hover:underline"
                        >
                          + Tambah Add-on
                        </button>
                      </div>

                      {prod.addons.length === 0 ? (
                        <p className="mt-1.5 text-[#78583E]">Tanpa tambahan opsional</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {prod.addons.map((a, aIdx) => (
                            <div key={a.id || `new-a-${aIdx}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Nama tambahan..."
                                value={a.name}
                                onChange={(e) =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          addons: x.addons.map((ax, idx) =>
                                            idx === aIdx
                                              ? { ...ax, name: e.target.value }
                                              : ax
                                          ),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="flex-1 rounded-lg border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5"
                              />
                              <input
                                type="number"
                                min={0}
                                value={a.price}
                                onChange={(e) =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          addons: x.addons.map((ax, idx) =>
                                            idx === aIdx
                                              ? { ...ax, price: Number(e.target.value) }
                                              : ax
                                          ),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="w-24 rounded-lg border border-[#EFE0B4] bg-[#FFFDF7] px-2.5 py-1.5"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setProducts((prev) =>
                                    prev.map((x) =>
                                      x.id === prod.id
                                        ? {
                                          ...x,
                                          addons: x.addons.filter((_, idx) => idx !== aIdx),
                                        }
                                        : x
                                    )
                                  )
                                }
                                className="rounded-lg p-1 text-[#78583E] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                                title="Hapus tambahan"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =========================================================
            TAB 4: DAFTAR PENGGUNA & MEMBER
           ========================================================= */}
        {tab === "users" && (
          <section className="animate-page-in mt-6 space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#EFE0B4] bg-white p-5">
                <span className="text-xs text-[#78583E]">Total Akun Terdaftar</span>
                <p className="font-display mt-1 text-2xl font-extrabold text-[#4A2E1B]">
                  {usersList.length}
                </p>
              </div>
              <div className="rounded-2xl border border-[#C3DF8A] bg-[#E7F5C8]/60 p-5">
                <span className="text-xs text-[#2F4C00]">Member Aktif</span>
                <p className="font-display mt-1 text-2xl font-extrabold text-[#2F4C00]">
                  {usersList.filter((u) => u.isMember).length}
                </p>
              </div>
              <div className="rounded-2xl border border-[#EFE0B4] bg-[#FFFBEB] p-5">
                <span className="text-xs text-[#78583E]">Administrator</span>
                <p className="font-display mt-1 text-2xl font-extrabold text-[#4A2E1B]">
                  {usersList.filter((u) => u.role === "admin").length}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[#EFE0B4] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#EFE0B4] bg-[#FFFBEB] font-bold uppercase text-[#78583E]">
                      <th className="px-5 py-3.5">Nama Pengguna</th>
                      <th className="px-5 py-3.5">Email &amp; WhatsApp</th>
                      <th className="px-5 py-3.5">Peran / Tier</th>
                      <th className="px-5 py-3.5">Pesanan Lunas</th>
                      <th className="px-5 py-3.5">Terdaftar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4E9C8]">
                    {usersList.map((u) => {
                      const tierLabel =
                        tiers.find((t) => t.slug === u.memberTierSlug)?.name ??
                        u.memberTierSlug;
                      return (
                        <tr key={u.id} className="hover:bg-[#FFFDF7]">
                          <td className="px-5 py-3.5 font-bold text-[#4A2E1B]">{u.name}</td>
                          <td className="px-5 py-3.5 text-[#78583E]">
                            <div className="font-medium text-[#4A2E1B]">{u.email}</div>
                            {u.whatsapp && <div>{u.whatsapp}</div>}
                          </td>
                          <td className="px-5 py-3.5">
                            {u.role === "admin" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#4A2E1B] px-2.5 py-0.5 text-[11px] font-bold text-[#FFFDF3]">
                                <ShieldCheck className="h-3 w-3" />
                                Admin
                              </span>
                            ) : u.isMember ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F5C8] px-2.5 py-0.5 text-[11px] font-bold text-[#2F4C00]">
                                <Sparkles className="h-3 w-3 text-[#5C8D1E]" />
                                {tierLabel}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#F3ECE0] px-2.5 py-0.5 text-[11px] font-semibold text-[#78583E]">
                                Pembeli Reguler
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-[#4A2E1B]">
                            {u.paidOrders} lunas{" "}
                            <span className="font-normal text-[#78583E]">
                              (dari {u.totalOrders})
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[#78583E]">
                            {u.createdAt.slice(0, 10)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* =========================================================
          CREATE NEW MENU MODAL (CRUD - CREATE)
         ========================================================= */}
      {showCreateModal && (
        <div
          className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-[#382112]/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <form
            onSubmit={handleCreateMenuSubmit}
            onClick={(e) => e.stopPropagation()}
            className="animate-modal-in max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#EFE0B4] bg-[#FFFDF3] p-6 shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-[#EFE0B4] pb-3.5">
              <h3 className="font-display text-xl font-bold text-[#4A2E1B]">
                Tambah Menu Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full p-1.5 text-[#78583E] hover:bg-[#FFF3B0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="font-bold text-[#4A2E1B]">Nama Menu</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contoh: Pisang Crispy Keju"
                    className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#4A2E1B]">Foto Menu</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="relative shrink-0 overflow-hidden rounded-xl border border-[#EFE0B4] bg-[#FFF3BC]"
                      style={{ width: "48px", height: "40px" }}
                    >
                      <ProductIllustration illustrationKey={newIllustration} />
                    </div>
                    <label className="motion-btn inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#DFC98B] bg-[#FFF6C7] px-2.5 py-2 text-xs font-bold text-[#4A2E1B] hover:bg-[#F8C93A]/60">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            const dataUrl = await compressImageFileToDataUrl(file);
                            setNewIllustration(dataUrl);
                          } catch (err) {
                            notify(
                              err instanceof Error ? err.message : "Gagal memproses foto",
                              "error"
                            );
                          }
                        }}
                      />
                    </label>
                    <select
                      value={PRESET_KEYS.has(newIllustration) ? newIllustration : "__custom__"}
                      onChange={(e) => {
                        if (e.target.value !== "__custom__") {
                          setNewIllustration(e.target.value);
                        }
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-[#EFE0B4] bg-white px-2 py-2 text-xs"
                    >
                      {!PRESET_KEYS.has(newIllustration) && (
                        <option value="__custom__">Foto Kustom</option>
                      )}
                      {ILLUSTRATION_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-[#4A2E1B]">Deskripsi Singkat</label>
                <textarea
                  rows={2}
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Deskripsi rasa dan tekstur kue..."
                  className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-white px-3 py-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[#4A2E1B]">Harga Dasar (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newBasePrice}
                    onChange={(e) => setNewBasePrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-white px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#4A2E1B]">Kuota Awal PO</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newInitialQuota}
                    onChange={(e) => setNewInitialQuota(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-white px-3 py-2 font-bold"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#BFE0F5] bg-[#E0F2FE]/60 px-3 py-2 font-semibold text-[#0369A1]">
                <input
                  type="checkbox"
                  checked={newThermalBag}
                  onChange={(e) => setNewThermalBag(e.target.checked)}
                  className="accent-[#0369A1]"
                />
                <Snowflake className="h-3.5 w-3.5" />
                <span>Menu dingin — wajib menggunakan Thermal Bag</span>
              </label>

              {/* Dynamic Variants */}
              <div className="space-y-2 border-t border-[#EFE0B4] pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#4A2E1B]">
                    Pilihan Varian (Kosongkan jika tanpa varian)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewVariants((prev) => [...prev, { name: "", priceDelta: 0 }])
                    }
                    className="font-bold text-[#855300] hover:underline"
                  >
                    + Varian
                  </button>
                </div>
                {newVariants.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nama varian..."
                      value={v.name}
                      onChange={(e) =>
                        setNewVariants((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, name: e.target.value } : item
                          )
                        )
                      }
                      className="flex-1 rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                    />
                    <input
                      type="number"
                      placeholder="+Rp"
                      value={v.priceDelta}
                      onChange={(e) =>
                        setNewVariants((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, priceDelta: Number(e.target.value) } : item
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewVariants((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-[#78583E] hover:text-[#DC2626]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Dynamic Add-ons */}
              <div className="space-y-2 border-t border-[#EFE0B4] pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#4A2E1B]">Tambahan Opsional (Add-on)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewAddons((prev) => [...prev, { name: "", price: 4000 }])
                    }
                    className="font-bold text-[#855300] hover:underline"
                  >
                    + Add-on
                  </button>
                </div>
                {newAddons.map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nama tambahan..."
                      value={a.name}
                      onChange={(e) =>
                        setNewAddons((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, name: e.target.value } : item
                          )
                        )
                      }
                      className="flex-1 rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={a.price}
                      onChange={(e) =>
                        setNewAddons((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, price: Number(e.target.value) } : item
                          )
                        )
                      }
                      className="w-24 rounded-lg border border-[#EFE0B4] bg-white px-2.5 py-1.5"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewAddons((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-1 text-[#78583E] hover:text-[#DC2626]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-[#EFE0B4] pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full border border-[#EFE0B4] bg-white px-4 py-2 text-xs font-bold text-[#78583E]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={busy}
                className="motion-btn rounded-full bg-[#4A2E1B] px-6 py-2 text-xs font-bold text-[#FFFDF3] hover:bg-[#382112]"
              >
                {busy ? "Menyimpan..." : "Simpan Menu Baru"}
              </button>
            </div>
          </form>
        </div>
      )}

      <Footer />
    </div>
  );
}
