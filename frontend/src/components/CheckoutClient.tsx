"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  Snowflake,
  Sparkles,
  Trash2,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { useCart } from "./CartProvider";
import { calculateCartPreview, formatRupiah } from "@/lib/cart-preview";
import type {
  FulfillmentMethod,
  MemberTier,
  OrderRecord,
  PoPeriodSummary,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

function formatDateIndo(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatDateTimeIndo(isoStr: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));
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

function buildClientWaInvoiceUrl(order: OrderRecord): string {
  const rawDigits = order.recipientWhatsapp.replace(/\D+/g, "");
  const normalizedPhone = rawDigits.startsWith("0")
    ? `62${rawDigits.slice(1)}`
    : rawDigits.startsWith("8")
      ? `62${rawDigits}`
      : rawDigits;

  const isPaid =
    order.status === "diproses" ||
    order.status === "siap" ||
    order.status === "selesai";

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const itemsText = order.items
    .map(
      (it) =>
        `• ${it.productNameSnapshot}${it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ""
        } x${it.quantity} = ${formatRupiah(it.lineTotalSnapshot)}`
    )
    .join("\n");

  const text = [
    isPaid
      ? `*BUKTI PEMBAYARAN LUNAS — BANATIER*`
      : `*INVOICE PRE-ORDER — BANATIER*`,
    `Kode Pesanan: *${order.orderCode}*`,
    `Penerima: ${order.recipientName} (${order.recipientWhatsapp})`,
    `Status: *${isPaid ? "LUNAS" : "Menunggu Pembayaran QRIS"}*`,
    ``,
    itemsText,
    order.discountAmount > 0
      ? `Diskon ${order.tierNameSnapshot}: -${formatRupiah(order.discountAmount)}`
      : null,
    order.thermalBagCount > 0
      ? `Thermal Bag (x${order.thermalBagCount}): ${formatRupiah(order.thermalBagCost)}`
      : null,
    order.shippingCost > 0
      ? `Biaya Antar: ${formatRupiah(order.shippingCost)}`
      : null,
    `*Total: ${formatRupiah(order.grandTotal)}*`,
    `Jadwal: ${order.fulfillmentDate}`,
    origin ? `\nCek status pesanan: ${origin}/orders` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

function buildAdminWaConfirmUrl(order: OrderRecord, adminWhatsapp: string): string {
  const rawDigits = (adminWhatsapp || "081219048439").replace(/\D+/g, "");
  const normalizedPhone = rawDigits.startsWith("0")
    ? `62${rawDigits.slice(1)}`
    : rawDigits.startsWith("8")
      ? `62${rawDigits}`
      : rawDigits || "6281219048439";

  const itemsText = order.items
    .map(
      (it) =>
        `• ${it.productNameSnapshot}${
          it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ""
        }${
          it.addonsSnapshot.length
            ? ` + ${it.addonsSnapshot.map((a) => a.name).join(", ")}`
            : ""
        } x${it.quantity} = ${formatRupiah(it.lineTotalSnapshot)}`
    )
    .join("\n");

  const methodLine =
    order.fulfillmentMethod === "delivery"
      ? `Diantar (${order.deliveryAddress})`
      : `Ambil di Tempat`;

  const text = [
    `*INVOICE PEMBAYARAN LUNAS — BANATIER*`,
    `Halo Admin Banatier, pembayaran QRIS telah dilakukan dengan rincian invoice berikut:`,
    ``,
    `• Kode Pesanan: *${order.orderCode}*`,
    `• Status: *Dibayar / Diproses*`,
    `• Penerima: ${order.recipientName} (${order.recipientWhatsapp})`,
    `• Jadwal: ${order.fulfillmentDate}`,
    `• Penerimaan: ${methodLine}`,
    order.notes ? `• Catatan: ${order.notes}` : null,
    ``,
    `*Rincian Pesanan:*`,
    itemsText,
    order.discountAmount > 0
      ? `Diskon ${order.tierNameSnapshot}: -${formatRupiah(order.discountAmount)}`
      : null,
    order.thermalBagCount > 0
      ? `Thermal Bag (x${order.thermalBagCount}): ${formatRupiah(order.thermalBagCost)}`
      : null,
    order.shippingCost > 0
      ? `Biaya Pengantaran: ${formatRupiah(order.shippingCost)}`
      : null,
    `*Total Dibayar (QRIS): ${formatRupiah(order.grandTotal)}*`,
    ``,
    `Berikut saya lampirkan bukti pembayaran QRIS-nya. Terima kasih!`,
  ]
    .filter(Boolean)
    .join("\n");

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text)}`;
}

export function CheckoutClient({
  user,
  settings,
  poPeriod,
  tiers,
  serverInstanceId,
  initialOrder,
  initialQrisImageUrl,
  demoMode,
}: {
  user: SessionUser | null;
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  tiers: MemberTier[];
  serverInstanceId: string;
  initialOrder: OrderRecord | null;
  initialQrisImageUrl: string;
  demoMode: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items, hydrated, updateQuantity, removeItem, clearCart } = useCart();

  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(initialOrder);
  const [qrisImageUrl, setQrisImageUrl] = useState<string>(initialQrisImageUrl);

  const [recipientName, setRecipientName] = useState<string>(user?.name ?? "");
  const [recipientWhatsapp, setRecipientWhatsapp] = useState<string>(user?.whatsapp ?? "");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Sync if URL query ?order= changes
  const orderParam = searchParams.get("order");

  const refreshOrder = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.order) {
        setActiveOrder(data.order);
        if (data.qrisImageUrl) {
          setQrisImageUrl(data.qrisImageUrl);
        }
      }
    } catch {
      // Ignore transient network hiccups
    }
  }, []);

  useEffect(() => {
    if (orderParam && (!activeOrder || activeOrder.orderCode !== orderParam)) {
      refreshOrder(orderParam);
    } else if (!orderParam && activeOrder) {
      setActiveOrder(null);
    }
  }, [orderParam, activeOrder, refreshOrder]);

  // Determine current step (1, 2, or 3)
  const currentStep: 1 | 2 | 3 = useMemo(() => {
    if (!activeOrder) return 1;
    if (
      activeOrder.status === "diproses" ||
      activeOrder.status === "siap" ||
      activeOrder.status === "selesai"
    ) {
      return 3;
    }
    return 2;
  }, [activeOrder]);

  // Poll order status every 3s while waiting for QRIS payment (Step 2)
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "menunggu_pembayaran") return;
    const interval = setInterval(() => {
      refreshOrder(activeOrder.orderCode);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeOrder, refreshOrder]);

  // Countdown timer for QRIS payment deadline
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== "menunggu_pembayaran") return;
    const updateCountdown = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(activeOrder.qrisExpiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
      if (diff === 0) {
        refreshOrder(activeOrder.orderCode);
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [activeOrder, refreshOrder]);

  const userTier = useMemo(() => {
    if (!user?.isMember) return null;
    return tiers.find((t) => t.slug === user.memberTierSlug) ?? null;
  }, [user, tiers]);

  const defaultMemberTier = useMemo(
    () => tiers.find((t) => t.slug === "member") ?? tiers.find((t) => t.discountPercent > 0),
    [tiers]
  );

  // Live Order Summary calculation for Step 1
  const liveCalc = useMemo(() => {
    return calculateCartPreview({
      lines: items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        basePrice: it.basePrice,
        variantId: it.variantId,
        variantName: it.variantName,
        variantDelta: it.variantDelta,
        addons: it.addons,
        quantity: it.quantity,
        requiresThermalBag: it.requiresThermalBag,
      })),
      settings,
      tier: userTier,
      isMember: Boolean(user?.isMember),
      fulfillmentMethod,
    });
  }, [items, settings, userTier, user?.isMember, fulfillmentMethod]);

  const scheduleRange = useMemo(() => {
    return {
      start: poPeriod?.earliestFulfillmentDate ?? addDaysFromToday(PO_MIN_LEAD_DAYS),
      end: poPeriod?.latestFulfillmentDate ?? addDaysFromToday(PO_MAX_LEAD_DAYS),
    };
  }, [poPeriod]);

  async function handleSubmitStep1(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (items.length === 0) {
      setErrorMsg("Keranjang pesanan masih kosong.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName,
          recipientWhatsapp,
          fulfillmentMethod,
          deliveryAddress,
          notes,
          selections: items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            addonIds: it.addons.map((a) => a.id),
            quantity: it.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Gagal membuat pesanan.");
        return;
      }

      clearCart();
      setActiveOrder(data.order);
      setQrisImageUrl(data.qrisImageUrl || "");
      router.replace(`/checkout?order=${encodeURIComponent(data.order.orderCode)}`);
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan saat membuat pesanan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmPaymentDone() {
    if (!activeOrder) return;
    if (new Date(activeOrder.qrisExpiresAt).getTime() <= Date.now()) {
      await refreshOrder(activeOrder.orderCode);
      return;
    }

    const waAdminUrl = buildAdminWaConfirmUrl(activeOrder, settings.adminWhatsapp);
    window.open(waAdminUrl, "_blank", "noopener,noreferrer");

    setSimulating(true);
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(activeOrder.orderCode)}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.order) {
          setActiveOrder(data.order);
        }
        setErrorMsg(data.error || "Gagal memproses konfirmasi pembayaran.");
        return;
      }
      if (data.order) {
        setActiveOrder(data.order);
      }
    } catch {
      setErrorMsg("Gagal menghubungi server saat memproses pembayaran.");
    } finally {
      setSimulating(false);
    }
  }

  const minutesPart = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secondsPart = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar user={user} />

      <main className="animate-page-in mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* 3-Step Progress Stepper (PRD Section 6 & 9) */}
        <div className="no-print mx-auto mb-10 max-w-2xl">
          <ol className="grid grid-cols-3 items-center gap-2 text-xs sm:gap-4">
            {[
              { step: 1, label: "Data & jadwal" },
              { step: 2, label: "Pembayaran" },
              { step: 3, label: "Bukti pembayaran" },
            ].map((item) => {
              const done = currentStep > item.step;
              const active = currentStep === item.step;
              return (
                <li
                  key={item.step}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 sm:px-4 ${active
                    ? "border-[#4A2E1B] bg-[#FFF7CC] font-semibold text-[#4A2E1B]"
                    : done
                      ? "border-[#DCEAC0] bg-[#EEF6DC] font-medium text-[#4A2E1B]"
                      : "border-[#EFE4C6] bg-white text-[#7B5D47]"
                    }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${active
                      ? "bg-[#4A2E1B] text-[#FFFDF7]"
                      : done
                        ? "bg-[#6B912B] text-white"
                        : "bg-[#F5F0E3] text-[#7B5D47]"
                      }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : item.step}
                  </span>
                  <span className="truncate">{item.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* STEP 1: DATA & JADWAL (2-Column Desktop, Stacked Mobile) */}
        {currentStep === 1 && (
          <>
            {!hydrated ? (
              <div className="py-16 text-center text-sm text-[#7B5D47]">
                Memuat ringkasan pesanan...
              </div>
            ) : items.length === 0 ? (
              <div className="mx-auto max-w-md rounded-3xl border border-[#EFE4C6] bg-white p-10 text-center">
                <p className="font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
                  Keranjang Anda Kosong
                </p>
                <p className="mt-2 text-xs text-[#7B5D47]">
                  Silakan pilih menu kue pisang terlebih dahulu di halaman katalog.
                </p>
                <Link
                  href="/"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F7C942] px-5 py-2.5 text-xs font-semibold text-[#4A2E1B] hover:bg-[#EAB825]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Kembali ke Menu</span>
                </Link>
              </div>
            ) : (
              <form
                onSubmit={handleSubmitStep1}
                className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12"
              >
                {/* Left Column: Recipient Data & Fulfillment Schedule */}
                <section className="rounded-3xl border border-[#EFE4C6] bg-white p-6 sm:p-8 lg:col-span-7">
                  <h1 className="font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
                    Data Penerima & Jadwal
                  </h1>
                  <p className="mt-1 text-xs text-[#7B5D47]">
                    Pastikan nomor WhatsApp aktif untuk informasi pengambilan atau pengantaran.
                  </p>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A2E1B]">
                        Nama Penerima
                      </label>
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Contoh: Nadia Putri"
                        className="mt-1.5 w-full rounded-xl border border-[#EFE4C6] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#4A2E1B]">
                        Nomor WhatsApp
                      </label>
                      <input
                        type="tel"
                        required
                        value={recipientWhatsapp}
                        onChange={(e) => setRecipientWhatsapp(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="mt-1.5 w-full rounded-xl border border-[#EFE4C6] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                      />
                      <p className="mt-1.5 text-[11px] text-[#78583E]">
                        Invoice &amp; kode pelacakan pesanan akan dikirim ke nomor WhatsApp ini agar tidak lupa.
                      </p>
                    </div>

                    {/* PO Fulfillment Date Display */}
                    <div className="rounded-2xl border border-[#EFE4C6] bg-[#FFFBE2] p-4">
                      <span className="block text-[11px] font-medium uppercase tracking-wider text-[#7B5D47]">
                        Jadwal Pre-Order
                      </span>
                      <p className="mt-1 text-sm font-semibold text-[#4A2E1B]">
                        {poPeriod
                          ? `${formatDateIndo(scheduleRange.start)} – ${formatDateIndo(scheduleRange.end)}`
                          : "Periode PO sedang ditutup"}
                      </p>
                      {poPeriod && (
                        <>
                          <p className="mt-1 text-xs text-[#7B5D47]">
                            Pesanan siap di kisaran H+{PO_MIN_LEAD_DAYS}–H+{PO_MAX_LEAD_DAYS} ({PO_MIN_LEAD_DAYS}–
                            {PO_MAX_LEAD_DAYS} hari setelah pemesanan dibuat).
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#7B5D47]">{poPeriod.name}</p>
                        </>
                      )}
                    </div>

                    {/* Fulfillment Method */}
                    <div>
                      <label className="block text-xs font-semibold text-[#4A2E1B]">
                        Metode Penerimaan
                      </label>
                      <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setFulfillmentMethod("pickup")}
                          className={`rounded-2xl border p-3.5 text-left transition-colors ${fulfillmentMethod === "pickup"
                            ? "border-[#4A2E1B] bg-[#FFF7CC]"
                            : "border-[#EFE4C6] bg-[#FFFDF7] hover:border-[#C68B59]"
                            }`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-[#4A2E1B]">
                            <span>Ambil di Tempat</span>
                            <span>Gratis</span>
                          </div>
                          <p className="mt-1 text-[11px] text-[#7B5D47] line-clamp-2">
                            {settings.pickupLocation}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setFulfillmentMethod("delivery")}
                          className={`rounded-2xl border p-3.5 text-left transition-colors ${fulfillmentMethod === "delivery"
                            ? "border-[#4A2E1B] bg-[#FFF7CC]"
                            : "border-[#EFE4C6] bg-[#FFFDF7] hover:border-[#C68B59]"
                            }`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-[#4A2E1B]">
                            <span>Diantar Kurir Toko</span>
                            <span>+{formatRupiah(settings.deliveryFee)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-[#7B5D47]">
                            Pengantaran area dalam kota sesuai jadwal PO
                          </p>
                        </button>
                      </div>
                    </div>

                    {fulfillmentMethod === "delivery" && (
                      <div>
                        <label className="block text-xs font-semibold text-[#4A2E1B]">
                          Alamat Lengkap Pengantaran
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Nama jalan, nomor rumah, patokan..."
                          className="mt-1.5 w-full rounded-xl border border-[#EFE4C6] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[#4A2E1B]">
                        Catatan Pesanan <span className="font-normal text-[#7B5D47]">(Opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Contoh: Ucapan ulang tahun / jam ambil sore"
                        className="mt-1.5 w-full rounded-xl border border-[#EFE4C6] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                      />
                    </div>
                  </div>
                </section>

                {/* Right Column: Order Summary with Live Qty Controls & Pricing Rules */}
                <aside className="rounded-3xl border border-[#EFE4C6] bg-white p-6 sm:p-8 lg:col-span-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif-editorial text-xl font-semibold text-[#4A2E1B]">
                      Ringkasan Pesanan
                    </h2>
                    <Link href="/" className="text-xs font-medium text-[#7B5D47] hover:text-[#4A2E1B]">
                      + Tambah Menu
                    </Link>
                  </div>

                  {/* Editable Cart Items right inside Checkout (FR-009) */}
                  <div className="mt-4 divide-y divide-[#F5EED8]">
                    {items.map((item) => {
                      const unit =
                        item.basePrice +
                        item.variantDelta +
                        item.addons.reduce((s, a) => s + a.price, 0);
                      return (
                        <div key={item.key} className="py-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-semibold text-[#4A2E1B]">
                                {item.productName}
                              </p>
                              {item.variantName && (
                                <p className="text-[11px] text-[#7B5D47]">{item.variantName}</p>
                              )}
                              {item.addons.length > 0 && (
                                <p className="text-[11px] text-[#7B5D47]">
                                  + {item.addons.map((a) => a.name).join(", ")}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item.key)}
                              className="p-1 text-[#7B5D47] hover:text-[#B8424C]"
                              title="Hapus"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="inline-flex items-center rounded-full border border-[#EFE4C6] bg-[#FFFDF7] p-0.5">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.key, item.quantity - 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF7CC]"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-xs font-semibold text-[#4A2E1B]">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.key, item.quantity + 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-[#4A2E1B] hover:bg-[#FFF7CC]"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <span className="text-xs font-semibold text-[#4A2E1B]">
                              {formatRupiah(unit * item.quantity)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Member Status & Minimum Purchase Notice (FR-015) */}
                  <div className="mt-4">
                    {user?.isMember && userTier ? (
                      liveCalc.discountEligible ? (
                        <div className="rounded-xl bg-[#EEF6DC] px-3.5 py-2.5 text-xs text-[#4A2E1B] flex items-center gap-2">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#6B912B]" />
                          <span>
                            Diskon <strong>{userTier.name} ({userTier.discountPercent}%)</strong> diterapkan pada subtotal produk.
                          </span>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[#EFE4C6] bg-[#FFFBE2] px-3.5 py-2.5 text-xs text-[#4A2E1B]">
                          Tambah belanja <strong>{formatRupiah(liveCalc.shortfallToDiscount)}</strong> lagi untuk mengaktifkan diskon{" "}
                          {userTier.name} {userTier.discountPercent}% (min.{" "}
                          {formatRupiah(userTier.minPurchase)}).
                        </div>
                      )
                    ) : (
                      defaultMemberTier && (
                        <div className="rounded-xl border border-[#EFE4C6] bg-[#FFFDF7] px-3.5 py-2.5 text-xs text-[#7B5D47] flex items-center justify-between gap-2">
                          <span>Hemat {defaultMemberTier.discountPercent}% khusus Member</span>
                          <Link
                            href={user ? "/account" : "/login"}
                            className="font-semibold text-[#4A2E1B] underline underline-offset-2"
                          >
                            Aktifkan
                          </Link>
                        </div>
                      )
                    )}
                  </div>

                  {/* Breakdown Lines (Section 5.3 Order: Subtotal -> Discount -> Thermal Bag -> Shipping -> Total) */}
                  <div className="mt-5 space-y-2.5 border-t border-[#EFE4C6] pt-4 text-xs">
                    <div className="flex justify-between text-[#7B5D47]">
                      <span>Subtotal Produk</span>
                      <span className="font-medium text-[#4A2E1B]">
                        {formatRupiah(liveCalc.subtotal)}
                      </span>
                    </div>

                    {liveCalc.discountAmount > 0 && (
                      <div className="flex justify-between text-[#6B912B]">
                        <span>
                          Diskon {liveCalc.tierName} ({liveCalc.discountPercent}%)
                        </span>
                        <span className="font-semibold">
                          -{formatRupiah(liveCalc.discountAmount)}
                        </span>
                      </div>
                    )}

                    {/* Automatic Thermal Bag Separate Row (FR-011) */}
                    {liveCalc.thermalBagCount > 0 && (
                      <div className="flex justify-between text-[#7B5D47]">
                        <span className="inline-flex items-center gap-1">
                          <Snowflake className="h-3.5 w-3.5 text-[#6B912B]" />
                          <span>Thermal Bag Otomatis (×{liveCalc.thermalBagCount})</span>
                        </span>
                        <span className="font-medium text-[#4A2E1B]">
                          {formatRupiah(liveCalc.thermalBagCost)}
                        </span>
                      </div>
                    )}

                    {liveCalc.shippingCost > 0 && (
                      <div className="flex justify-between text-[#7B5D47]">
                        <span>Biaya Pengantaran</span>
                        <span className="font-medium text-[#4A2E1B]">
                          {formatRupiah(liveCalc.shippingCost)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-[#EFE4C6] pt-3 text-sm font-semibold text-[#4A2E1B]">
                      <span>Total Bayar</span>
                      <span className="text-base">{formatRupiah(liveCalc.grandTotal)}</span>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#FDEEEE] p-3 text-xs font-medium text-[#B8424C]">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !poPeriod?.isOpenNow}
                    className="mt-5 w-full rounded-full bg-[#F7C942] py-3.5 text-xs font-semibold text-[#4A2E1B] shadow-xs transition-colors hover:bg-[#EAB825] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting
                      ? "Membuat Pesanan & QRIS..."
                      : !poPeriod?.isOpenNow
                        ? "PO Sedang Ditutup"
                        : "Buat Pesanan & Bayar"}
                  </button>
                </aside>
              </form>
            )}
          </>
        )}

        {/* STEP 2: PEMBAYARAN QRIS (FR-019, FR-020) */}
        {currentStep === 2 && activeOrder && (
          <div className="mx-auto max-w-lg rounded-3xl border border-[#EFE4C6] bg-white p-6 text-center shadow-xs sm:p-8">
            {activeOrder.status === "menunggu_pembayaran" ? (
              <>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF7CC] px-3 py-1 text-xs font-semibold text-[#4A2E1B]">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Batas waktu pembayaran {minutesPart}:{secondsPart}
                  </span>
                </div>

                <h1 className="mt-4 font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
                  Pindai Kode QRIS
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs text-[#7B5D47]">
                  <span>
                    Kode Pesanan <strong className="text-[#4A2E1B]">{activeOrder.orderCode}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(activeOrder.orderCode)}
                    className="motion-btn inline-flex items-center gap-1 rounded-full border border-[#EFE0B4] bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-[#4A2E1B] hover:bg-[#FFF3B0]"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Salin</span>
                  </button>
                </div>

                <div className="mt-3">
                  <a
                    href={buildClientWaInvoiceUrl(activeOrder)}
                    target="_blank"
                    rel="noreferrer"
                    className="motion-btn inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3.5 py-1.5 text-xs font-bold text-[#2F4C00] hover:bg-[#D8EEAE]"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-[#5C8D1E]" />
                    <span>Simpan Invoice ke WhatsApp ({activeOrder.recipientWhatsapp})</span>
                  </a>
                </div>

                <div className="mx-auto mt-6 flex w-fit flex-col items-center rounded-2xl border border-[#EFE4C6] bg-white p-3.5 shadow-2xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrisImageUrl || "/qris-ayyas.jpg"}
                    alt={`QRIS ${activeOrder.orderCode}`}
                    className="h-auto w-full max-w-[290px] rounded-xl object-contain"
                  />
                  <span className="mt-2.5 text-[11px] font-medium tracking-wider text-[#7B5D47]">
                    QRIS · MENERIMA SEMUA E-WALLET &amp; M-BANKING
                  </span>
                </div>

                <div className="mt-6 rounded-2xl border border-[#EFE4C6] bg-[#FFFDF7] px-5 py-3.5">
                  <span className="block text-[11px] uppercase tracking-wider text-[#7B5D47]">
                    Total Tagihan
                  </span>
                  <span className="mt-0.5 block text-2xl font-bold text-[#4A2E1B]">
                    {formatRupiah(activeOrder.grandTotal)}
                  </span>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={simulating}
                    onClick={handleConfirmPaymentDone}
                    className="motion-btn inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F8C93A] px-5 py-3.5 text-xs font-extrabold text-[#4A2E1B] shadow-xs hover:bg-[#EAB522] disabled:opacity-50"
                  >
                    <MessageCircle className="h-4 w-4 text-[#4A2E1B]" />
                    <span>
                      {simulating
                        ? "Memproses Invoice..."
                        : "Saya Sudah Bayar — Proses & Kirim Invoice ke WA Admin"}
                    </span>
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#78583E]">
                    Klik setelah menyelesaikan pembayaran QRIS. Status pesanan langsung berubah menjadi{" "}
                    <strong className="text-[#4A2E1B]">Diproses</strong>, halaman invoice lunas terbuka, dan rincian invoice dikirim ke WhatsApp Admin.
                  </p>
                </div>

                {errorMsg && (
                  <p className="mt-3 text-xs font-medium text-[#B8424C]">{errorMsg}</p>
                )}
              </>
            ) : (
              <div className="py-6">
                <span className="inline-flex rounded-full bg-[#FDEEEE] px-3.5 py-1 text-xs font-semibold text-[#B8424C]">
                  {activeOrder.status === "kedaluwarsa"
                    ? "Pembayaran Kedaluwarsa"
                    : "Pesanan Dibatalkan"}
                </span>
                <h2 className="mt-4 font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
                  Tagihan QRIS Tidak Lagi Aktif
                </h2>
                <p className="mt-2 text-xs text-[#7B5D47]">
                  Kuota pesanan {activeOrder.orderCode} telah dikembalikan ke katalog. Silakan buat pesanan baru.
                </p>
                <Link
                  href="/"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F7C942] px-5 py-2.5 text-xs font-semibold text-[#4A2E1B] hover:bg-[#EAB825]"
                >
                  Kembali ke Menu
                </Link>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: BUKTI PEMBAYARAN (FR-021) */}
        {currentStep === 3 && activeOrder && (
          <div className="print-receipt mx-auto max-w-xl rounded-3xl border border-[#EFE4C6] bg-white p-6 shadow-xs sm:p-9">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF6DC] text-[#6B912B]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <span className="mt-3 inline-flex rounded-full bg-[#EEF6DC] px-3 py-1 text-[11px] font-semibold text-[#4A2E1B]">
                LUNAS · Pesanan Sedang Diproses
              </span>
              <h1 className="mt-3 font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
                Invoice &amp; Bukti Pembayaran Banatier
              </h1>
              <p className="mt-1 text-xs text-[#7B5D47]">
                Kode Pesanan <strong className="text-[#4A2E1B]">{activeOrder.orderCode}</strong>
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-[#EFE4C6] bg-[#FFFDF7] p-4 text-xs sm:grid-cols-2">
              <div>
                <span className="text-[#7B5D47]">Penerima</span>
                <p className="mt-0.5 font-semibold text-[#4A2E1B]">
                  {activeOrder.recipientName} ({activeOrder.recipientWhatsapp})
                </p>
              </div>
              <div>
                <span className="text-[#7B5D47]">Waktu Lunas</span>
                <p className="mt-0.5 font-semibold text-[#4A2E1B]">
                  {activeOrder.paidAt ? formatDateTimeIndo(activeOrder.paidAt) : "-"}
                </p>
              </div>
              <div>
                <span className="text-[#7B5D47]">Jadwal Ambil / Antar</span>
                <p className="mt-0.5 font-semibold text-[#4A2E1B]">
                  {formatDateIndo(activeOrder.fulfillmentDate)}
                </p>
              </div>
              <div>
                <span className="text-[#7B5D47]">Metode Penerimaan</span>
                <p className="mt-0.5 font-semibold text-[#4A2E1B]">
                  {activeOrder.fulfillmentMethod === "delivery"
                    ? `Diantar · ${activeOrder.deliveryAddress}`
                    : `Ambil di Tempat · ${settings.pickupLocation}`}
                </p>
              </div>
            </div>

            {/* Snapshot Items */}
            <div className="mt-6 divide-y divide-[#F5EED8]">
              {activeOrder.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between py-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#4A2E1B]">
                      {item.productNameSnapshot} × {item.quantity}
                    </p>
                    {item.variantNameSnapshot && (
                      <p className="text-[#7B5D47]">Varian: {item.variantNameSnapshot}</p>
                    )}
                    {item.addonsSnapshot.length > 0 && (
                      <p className="text-[#7B5D47]">
                        + {item.addonsSnapshot.map((a) => a.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold text-[#4A2E1B]">
                    {formatRupiah(item.lineTotalSnapshot)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-[#EFE4C6] pt-4 text-xs">
              <div className="flex justify-between text-[#7B5D47]">
                <span>Subtotal Produk</span>
                <span>{formatRupiah(activeOrder.subtotal)}</span>
              </div>
              {activeOrder.discountAmount > 0 && (
                <div className="flex justify-between text-[#6B912B]">
                  <span>
                    Diskon {activeOrder.tierNameSnapshot} ({activeOrder.discountPercentSnapshot}%)
                  </span>
                  <span>-{formatRupiah(activeOrder.discountAmount)}</span>
                </div>
              )}
              {activeOrder.thermalBagCount > 0 && (
                <div className="flex justify-between text-[#7B5D47]">
                  <span>Thermal Bag (×{activeOrder.thermalBagCount})</span>
                  <span>{formatRupiah(activeOrder.thermalBagCost)}</span>
                </div>
              )}
              {activeOrder.shippingCost > 0 && (
                <div className="flex justify-between text-[#7B5D47]">
                  <span>Biaya Pengantaran</span>
                  <span>{formatRupiah(activeOrder.shippingCost)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-[#EFE4C6] pt-3 text-sm font-bold text-[#4A2E1B]">
                <span>Total Dibayar (QRIS)</span>
                <span>{formatRupiah(activeOrder.grandTotal)}</span>
              </div>
            </div>

            <div className="no-print mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <a
                href={buildAdminWaConfirmUrl(activeOrder, settings.adminWhatsapp)}
                target="_blank"
                rel="noreferrer"
                className="motion-btn inline-flex items-center justify-center gap-2 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-4 py-3 text-xs font-bold text-[#2F4C00] hover:bg-[#D8EEAE]"
              >
                <MessageCircle className="h-3.5 w-3.5 text-[#5C8D1E]" />
                <span>Kirim Invoice ke WA Admin</span>
              </a>
              <a
                href={buildClientWaInvoiceUrl(activeOrder)}
                target="_blank"
                rel="noreferrer"
                className="motion-btn inline-flex items-center justify-center gap-2 rounded-full border border-[#EFE0B4] bg-[#FFFBEB] px-4 py-3 text-xs font-bold text-[#4A2E1B] hover:bg-[#FFF3B0]"
              >
                <MessageCircle className="h-3.5 w-3.5 text-[#B86B23]" />
                <span>Simpan ke WA Saya</span>
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="motion-btn inline-flex items-center justify-center gap-2 rounded-full bg-[#4A2E1B] px-4 py-3 text-xs font-semibold text-[#FFFDF7] hover:bg-[#382112]"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Cetak Invoice (PDF)</span>
              </button>
              <Link
                href="/orders"
                className="motion-btn inline-flex items-center justify-center rounded-full bg-[#F8C93A] px-4 py-3 text-xs font-bold text-[#4A2E1B] hover:bg-[#EAB522]"
              >
                Cek Status Pesanan
              </Link>
            </div>
          </div>
        )}
      </main>

      <Footer serverInstanceId={serverInstanceId} />
    </div>
  );
}
