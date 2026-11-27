"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Check, ShieldCheck, LogOut, ArrowRight } from "lucide-react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { formatRupiah } from "@/lib/cart-preview";
import type { MemberTier, SessionUser } from "@/lib/types";

export function AccountClient({
  user: initialUser,
  tiers,
}: {
  user: SessionUser | null;
  tiers: MemberTier[];
  serverInstanceId?: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [tab, setTab] = useState<"login" | "register">("login");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [joinAsMember, setJoinAsMember] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const memberTiersOnly = tiers.filter((t) => t.discountPercent > 0);
  const currentTier = user?.isMember
    ? tiers.find((t) => t.slug === user.memberTierSlug)
    : null;

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const endpoint = tab === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        tab === "login"
          ? { email, password }
          : { name, email, whatsapp, password, joinAsMember };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal memproses autentikasi.");
        setLoading(false);
        return;
      }

      // Fast SPA redirect based on role: Admin -> /admin, Member/Buyer -> /
      if (data.user?.role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/");
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan koneksi.");
      setLoading(false);
    }
  }

  async function handleUpgradeMember() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/me", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengaktifkan membership.");
        return;
      }
      setUser(data.user);
      setMessage("Selamat! Membership Banatier Anda sudah aktif.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF3] text-[#4A2E1B]">
      <Navbar user={user} />

      <main className="animate-page-in mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          {/* Left: Account / Auth Form */}
          <div className="rounded-3xl border border-[#EFE0B4] bg-white p-6 sm:p-8 md:col-span-7">
            {user ? (
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3 py-1 text-xs font-bold text-[#2F4C00]">
                  {user.role === "admin" ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Administrator</span>
                    </>
                  ) : user.isMember ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-[#5C8D1E]" />
                      <span>{currentTier?.name || "Banatier Member"}</span>
                    </>
                  ) : (
                    <span>Akun Pembeli Reguler</span>
                  )}
                </span>

                <h1 className="font-display mt-4 text-2xl font-bold text-[#4A2E1B]">
                  Halo, {user.name}
                </h1>
                <p className="mt-1 text-xs text-[#78583E]">
                  {user.email} {user.whatsapp ? `· ${user.whatsapp}` : ""}
                </p>

                {message && (
                  <div className="mt-4 rounded-xl bg-[#E7F5C8] px-4 py-2.5 text-xs font-semibold text-[#2F4C00]">
                    {message}
                  </div>
                )}

                {user.role === "buyer" && !user.isMember && (
                  <div className="mt-6 rounded-2xl border border-[#EFE0B4] bg-[#FFFBEB] p-5">
                    <h2 className="font-display text-sm font-bold text-[#4A2E1B]">
                      Belum terdaftar sebagai Member
                    </h2>
                    <p className="mt-1 text-xs text-[#78583E]">
                      Aktifkan membership secara gratis untuk langsung menikmati potongan harga setiap pre-order mencapai minimum transaksi.
                    </p>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleUpgradeMember}
                      className="motion-btn mt-4 rounded-full bg-[#F8C93A] px-5 py-2.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#EAB522]"
                    >
                      {loading ? "Mengaktifkan..." : "Aktifkan Member Sekarang"}
                    </button>
                  </div>
                )}

                {user.role === "buyer" && user.isMember && currentTier && (
                  <div className="mt-6 rounded-2xl border border-[#C3DF8A] bg-[#E7F5C8]/60 p-5">
                    <p className="text-xs font-bold text-[#2F4C00]">
                      Keuntungan Tier Aktif: Diskon {currentTier.discountPercent}%
                    </p>
                    <p className="mt-1 text-xs text-[#4A2E1B]">
                      Berlaku otomatis saat subtotal produk mencapai minimal{" "}
                      {formatRupiah(currentTier.minPurchase)}.
                    </p>
                  </div>
                )}

                <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#F4E9C8] pt-5">
                  <Link
                    href="/"
                    className="motion-btn inline-flex items-center gap-1.5 rounded-full bg-[#F8C93A] px-5 py-2.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#EAB522]"
                  >
                    <span>Ke Katalog Menu</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="motion-btn inline-flex items-center gap-1.5 rounded-full border border-[#EFE0B4] bg-white px-4 py-2.5 text-xs font-bold text-[#78583E] hover:border-[#DC2626] hover:text-[#DC2626]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Keluar</span>
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="inline-flex rounded-full border border-[#EFE0B4] bg-[#FFF6C7] p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setTab("login");
                      setError("");
                    }}
                    className={`motion-btn rounded-full px-4 py-1.5 font-bold ${tab === "login"
                      ? "bg-[#F8C93A] text-[#4A2E1B] shadow-2xs"
                      : "text-[#78583E]"
                      }`}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("register");
                      setError("");
                    }}
                    className={`motion-btn rounded-full px-4 py-1.5 font-bold ${tab === "register"
                      ? "bg-[#F8C93A] text-[#4A2E1B] shadow-2xs"
                      : "text-[#78583E]"
                      }`}
                  >
                    Daftar Akun
                  </button>
                </div>

                <h1 className="font-display mt-5 text-2xl font-bold text-[#4A2E1B]">
                  {tab === "login" ? "Masuk ke Banatier" : "Daftar & Gabung Member"}
                </h1>

                <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
                  {tab === "register" && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-[#4A2E1B]">
                          Nama Lengkap
                        </label>
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Nama Anda"
                          className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
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
                          placeholder="0812xxxxxxxx"
                          className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[#4A2E1B]">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#4A2E1B]">Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="mt-1 w-full rounded-xl border border-[#EFE0B4] bg-[#FFFDF7] px-3.5 py-2.5 text-sm text-[#4A2E1B] outline-none focus:border-[#4A2E1B]"
                    />
                  </div>

                  {tab === "register" && (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#EFE0B4] bg-[#FFFBEB] p-3 text-xs text-[#4A2E1B]">
                      <input
                        type="checkbox"
                        checked={joinAsMember}
                        onChange={(e) => setJoinAsMember(e.target.checked)}
                        className="mt-0.5 accent-[#4A2E1B]"
                      />
                      <span>
                        <strong>Sekaligus aktifkan Banatier Member</strong> untuk menikmati diskon otomatis setiap mencapai minimum pembelian.
                      </span>
                    </label>
                  )}

                  {error && <p className="text-xs font-semibold text-[#DC2626]">{error}</p>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="motion-btn w-full rounded-full bg-[#F8C93A] py-3 text-xs font-bold text-[#4A2E1B] shadow-xs hover:bg-[#EAB522] disabled:opacity-50"
                  >
                    {loading ? "Memproses..." : tab === "login" ? "Masuk" : "Buat Akun"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right: Clean Member Tier Card */}
          <div className="rounded-3xl border border-[#EFE0B4] bg-[#FFF8D8] p-6 sm:p-8 md:col-span-5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3 py-1 text-xs font-bold text-[#2F4C00]">
              <Sparkles className="h-3.5 w-3.5 text-[#5C8D1E]" />
              <span>Program Member</span>
            </div>
            <h2 className="font-display mt-4 text-xl font-bold text-[#4A2E1B]">
              Keistimewaan Pelanggan Tetap
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#78583E]">
              Potongan diterapkan khusus pada subtotal kue dan tambahan, serta otomatis naik tier seiring jumlah pesanan lunas.
            </p>

            <div className="mt-5 space-y-3">
              {memberTiersOnly.map((tier) => (
                <div
                  key={tier.id}
                  className="rounded-2xl border border-[#EFE0B4] bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-bold text-[#4A2E1B]">
                      {tier.name}
                    </span>
                    <span className="rounded-full bg-[#E7F5C8] px-2.5 py-0.5 text-[11px] font-bold text-[#2F4C00]">
                      Diskon {tier.discountPercent}%
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-1 text-[11px] text-[#78583E]">
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-[#5C8D1E]" />
                      <span>Minimum belanja {formatRupiah(tier.minPurchase)}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-[#5C8D1E]" />
                      <span>
                        {tier.minPaidOrders === 0
                          ? "Langsung aktif saat mendaftar"
                          : `Otomatis aktif setelah ${tier.minPaidOrders}× pesanan lunas`}
                      </span>
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
