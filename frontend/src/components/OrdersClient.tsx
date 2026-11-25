"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { formatRupiah } from "@/lib/cart-preview";
import type { OrderRecord, OrderStatus, SessionUser } from "@/lib/types";

const STATUS_STYLE: Record<OrderStatus, { label: string; bg: string; text: string }> = {
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

function OrderSummaryCard({ ord }: { ord: OrderRecord }) {
  const badge = STATUS_STYLE[ord.status];
  return (
    <Link
      href={`/checkout?order=${encodeURIComponent(ord.orderCode)}`}
      className="motion-card block rounded-2xl border border-[#EFE0B4] bg-white p-5 hover:border-[#C68B59] hover:shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-sm font-extrabold text-[#4A2E1B]">
            {ord.orderCode}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.bg} ${badge.text}`}
          >
            {badge.label}
          </span>
        </div>
        <span className="font-display text-sm font-extrabold text-[#4A2E1B]">
          {formatRupiah(ord.grandTotal)}
        </span>
      </div>

      <p className="mt-2 text-xs text-[#78583E]">
        {ord.items
          .map(
            (it) =>
              `${it.productNameSnapshot}${it.variantNameSnapshot ? ` (${it.variantNameSnapshot})` : ""
              } ×${it.quantity}`
          )
          .join(" · ")}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-[#F4E9C8] pt-3 text-[11px] text-[#78583E]">
        <span>
          Jadwal {ord.fulfillmentMethod === "delivery" ? "Antar" : "Ambil"}:{" "}
          <strong className="text-[#4A2E1B]">{ord.fulfillmentDate}</strong>
        </span>
        <span className="inline-flex items-center gap-1 font-bold text-[#4A2E1B]">
          <span>
            {ord.status === "menunggu_pembayaran"
              ? "Bayar QRIS"
              : "Lihat Bukti Pembayaran"}
          </span>
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

export function OrdersClient({
  user,
  orders,
}: {
  user: SessionUser | null;
  orders: OrderRecord[];
  serverInstanceId?: string;
}) {
  const [orderCode, setOrderCode] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [trackedOrder, setTrackedOrder] = useState<OrderRecord | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [searching, setSearching] = useState(false);

  async function handleTrackSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = orderCode.trim().toUpperCase();
    const cleanWa = whatsapp.trim();
    if (!cleanCode || !cleanWa) return;

    setSearching(true);
    setLookupError("");
    setTrackedOrder(null);

    try {
      const res = await fetch(
        `/api/orders/track?code=${encodeURIComponent(cleanCode)}&whatsapp=${encodeURIComponent(
          cleanWa
        )}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.order) {
        setLookupError(
          data.error ||
          "Pesanan tidak ditemukan. Pastikan kode pesanan dan nomor WhatsApp sesuai."
        );
        return;
      }
      setTrackedOrder(data.order);
    } catch {
      setLookupError("Gagal memeriksa status pesanan. Coba lagi sesaat.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF3] text-[#4A2E1B]">
      <Navbar user={user} />

      <main className="animate-page-in mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        {!user ? (
          /* =========================================================
             GUEST VIEW: CLEAN TRACKING FORM MATCHING REFERENCE IMAGE 2
             ========================================================= */
          <div className="mx-auto max-w-md">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#4A2E1B] sm:text-[34px]">
              Cek Pesanan
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#78583E] sm:text-sm">
              Masukkan kode pesanan dan nomor WhatsApp yang dipakai saat memesan.
            </p>

            <form
              onSubmit={handleTrackSubmit}
              className="mt-6 space-y-4 rounded-3xl border border-[#EFE0B4] bg-white p-6 shadow-2xs sm:p-7"
            >
              <div>
                <label className="block text-xs font-bold text-[#4A2E1B]">
                  Kode pesanan
                </label>
                <input
                  type="text"
                  required
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                  placeholder="BNT-261124-ABCD"
                  className="mt-1.5 w-full rounded-xl border border-[#E5D5A7] bg-[#FFFDF9] px-3.5 py-2.5 text-sm uppercase text-[#4A2E1B] placeholder:normal-case placeholder:text-[#A68E77] outline-none transition-colors focus:border-[#4A2E1B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4A2E1B]">
                  Nomor WhatsApp
                </label>
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  className="mt-1.5 w-full rounded-xl border border-[#E5D5A7] bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-[#4A2E1B] placeholder:text-[#A68E77] outline-none transition-colors focus:border-[#4A2E1B]"
                />
              </div>

              {lookupError && (
                <div className="flex items-start gap-2 rounded-xl bg-[#FEE2E2] p-3 text-xs font-semibold text-[#DC2626]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={searching}
                className="motion-btn mt-2 w-full rounded-full bg-[#4A2E1B] py-3.5 text-xs sm:text-[13px] font-bold text-[#FFFDF3] shadow-xs hover:bg-[#382112] disabled:opacity-50"
              >
                {searching ? "Mencari Pesanan..." : "Cek Status"}
              </button>
            </form>

            {/* Tracked Order Result Card */}
            {trackedOrder && (
              <div className="animate-page-in mt-6 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5C8D1E]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Pesanan ditemukan</span>
                </div>
                <OrderSummaryCard ord={trackedOrder} />
              </div>
            )}
          </div>
        ) : (
          /* =========================================================
             LOGGED-IN MEMBER VIEW: AUTOMATIC ORDER HISTORY + TRACKER
             ========================================================= */
          <div>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h1 className="font-display text-3xl font-extrabold text-[#4A2E1B]">
                  Pesanan Saya
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-[#78583E]">
                  Riwayat pre-order akun Anda tersimpan otomatis di sini.
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="mt-8 rounded-3xl border border-[#EFE0B4] bg-white p-10 text-center">
                <p className="font-display text-lg font-bold text-[#4A2E1B]">
                  Belum ada pesanan tercatat di akun ini
                </p>
                <p className="mt-1 text-xs text-[#78583E]">
                  Pilih kue pisang favoritmu di katalog menu pre-order.
                </p>
                <Link
                  href="/"
                  className="motion-btn mt-5 inline-flex rounded-full bg-[#F8C93A] px-5 py-2.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#EAB522]"
                >
                  Lihat Menu Pre-Order
                </Link>
              </div>
            ) : (
              <div className="mt-7 space-y-3.5">
                {orders.map((ord) => (
                  <OrderSummaryCard key={ord.id} ord={ord} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
