"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  Sparkles,
  User,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { useCart } from "./CartProvider";
import type { PoPeriodSummary, SessionUser } from "@/lib/types";

export type AdminTabKey = "orders" | "catalog" | "users";

export function Navbar({
  user,
  onOpenCart,
  adminActiveTab,
  onSelectAdminTab,
  onBeforeNavigate,
}: {
  user: SessionUser | null;
  onOpenCart?: () => void;
  poPeriod?: PoPeriodSummary | null;
  serverInstanceId?: string;
  adminActiveTab?: AdminTabKey;
  onSelectAdminTab?: (tab: AdminTabKey) => void;
  onBeforeNavigate?: () => boolean;
}) {
  const { totalItems } = useCart();
  const pathname = usePathname();

  function handleGuardedNavigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (onBeforeNavigate && !onBeforeNavigate()) {
      event.preventDefault();
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Tetap lanjutkan redirect ke halaman login meski koneksi sempat terputus
    }
    window.location.assign("/login");
  }

  const isHome = pathname === "/";
  const isAdminUser = user?.role === "admin";

  /* =========================================================
     ADMIN POV HEADER (No Cara Pesan / Cek Pesanan / Menu / Cart)
     ========================================================= */
  if (isAdminUser) {
    const adminNavItems: Array<{ id: AdminTabKey; label: string }> = [
      { id: "orders", label: "Pesanan Masuk" },
      { id: "catalog", label: "Kelola Menu" },
      { id: "users", label: "Daftar Pengguna" },
    ];

    return (
      <header className="sticky top-0 z-40 w-full border-b border-[#EFE0B4] bg-[#FFFBE8]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/admin" onClick={handleGuardedNavigate} className="motion-btn flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6C86E] bg-[#FFF3B0]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M6 16.5C10.5 18 16.5 14.5 18 7.5C19.2 12.2 15.8 18.8 9.2 19.2C7.4 19.3 6.2 18 6 16.5Z"
                  fill="#F8C93A"
                  stroke="#4A2E1B"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="font-display text-xl font-extrabold tracking-tight text-[#4A2E1B]">
              Banatier
            </span>
            <span className="rounded-full bg-[#4A2E1B] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFFDF3]">
              Admin
            </span>
          </Link>

          <nav className="flex items-center gap-1.5 sm:gap-2.5 text-xs font-semibold">
            {adminNavItems.map((item) => {
              const active = pathname.startsWith("/admin") && adminActiveTab === item.id;
              if (onSelectAdminTab && pathname.startsWith("/admin")) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectAdminTab(item.id)}
                    className={`motion-btn hidden md:inline-flex rounded-full px-3.5 py-1.5 transition-colors ${
                      active
                        ? "bg-[#F8C93A] font-bold text-[#4A2E1B] shadow-2xs"
                        : "text-[#78583E] hover:bg-[#FFF3B0]/60 hover:text-[#4A2E1B]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={`/admin?tab=${item.id}`}
                  onClick={handleGuardedNavigate}
                  className="motion-btn hidden md:inline-flex rounded-full px-3.5 py-1.5 text-[#78583E] hover:bg-[#FFF3B0]/60 hover:text-[#4A2E1B]"
                >
                  {item.label}
                </Link>
              );
            })}

            <Link
              href="/"
              target="_blank"
              title="Buka tampilan Landing Page Customer di tab baru"
              className="motion-btn inline-flex items-center gap-1 rounded-full border border-[#EFE0B4] bg-white px-3 py-1.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#FFF6C7]"
            >
              <span className="hidden sm:inline">Web Customer</span>
              <ExternalLink className="h-3.5 w-3.5 text-[#855300]" />
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              title="Keluar"
              className="motion-btn inline-flex items-center gap-1.5 rounded-full border border-[#EFE0B4] bg-white px-3 py-1.5 text-xs font-bold text-[#78583E] hover:border-[#DC2626] hover:text-[#DC2626]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </nav>
        </div>
      </header>
    );
  }

  /* =========================================================
     CUSTOMER / GUEST HEADER
     ========================================================= */
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#EFE0B4] bg-[#FFFBE8]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="motion-btn group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6C86E] bg-[#FFF3B0] transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M6 16.5C10.5 18 16.5 14.5 18 7.5C19.2 12.2 15.8 18.8 9.2 19.2C7.4 19.3 6.2 18 6 16.5Z"
                fill="#F8C93A"
                stroke="#4A2E1B"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-[#4A2E1B] sm:text-2xl">
            Banatier
          </span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-5 text-[13px] font-semibold text-[#78583E]">
          <Link
            href={isHome ? "#katalog-menu" : "/#katalog-menu"}
            className="hidden sm:inline-block transition-colors duration-150 hover:text-[#4A2E1B]"
          >
            Menu
          </Link>
          <Link
            href={isHome ? "#alur-po" : "/#alur-po"}
            className="hidden md:inline-block transition-colors duration-150 hover:text-[#4A2E1B]"
          >
            Cara Pesan
          </Link>
          <Link
            href="/orders"
            className={`transition-colors duration-150 hover:text-[#4A2E1B] ${
              pathname.startsWith("/orders")
                ? "rounded-full bg-[#FFF3B0] px-3 py-1 font-bold text-[#4A2E1B]"
                : ""
            }`}
          >
            Cek Pesanan
          </Link>

          {user ? (
            <div className="flex items-center gap-1">
              <Link
                href="/account"
                className="motion-btn inline-flex items-center gap-1.5 rounded-full border border-[#EFE0B4] bg-white px-3 py-1.5 text-xs font-bold text-[#4A2E1B] hover:border-[#C68B59]"
              >
                {user.isMember ? (
                  <Sparkles className="h-3.5 w-3.5 text-[#5C8D1E]" />
                ) : (
                  <User className="h-3.5 w-3.5 text-[#78583E]" />
                )}
                <span className="max-w-[80px] truncate">{user.name.split(" ")[0]}</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title="Keluar"
                className="motion-btn rounded-full p-1.5 text-[#78583E] hover:bg-[#FFF3B0] hover:text-[#4A2E1B]"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={`hidden sm:inline-block transition-colors duration-150 hover:text-[#4A2E1B] ${
                pathname.startsWith("/login") || pathname.startsWith("/account")
                  ? "rounded-full bg-[#FFF3B0] px-3 py-1 font-bold text-[#4A2E1B]"
                  : ""
              }`}
            >
              Masuk
            </Link>
          )}

          {onOpenCart ? (
            <button
              type="button"
              onClick={onOpenCart}
              className="motion-btn inline-flex items-center gap-2 rounded-full border border-[#E2B227] bg-[#F8C93A] px-4 py-1.5 text-xs font-bold text-[#4A2E1B] shadow-[0_2px_10px_rgba(248,201,58,0.3)] hover:bg-[#F0BE26]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Keranjang</span>
              {totalItems > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4A2E1B] px-1 text-[10px] font-bold text-[#FFFDF3]">
                  {totalItems}
                </span>
              )}
            </button>
          ) : (
            <Link
              href="/checkout"
              className="motion-btn inline-flex items-center gap-2 rounded-full border border-[#E2B227] bg-[#F8C93A] px-4 py-1.5 text-xs font-bold text-[#4A2E1B] shadow-[0_2px_10px_rgba(248,201,58,0.3)] hover:bg-[#F0BE26]"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Keranjang</span>
              {totalItems > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4A2E1B] px-1 text-[10px] font-bold text-[#FFFDF3]">
                  {totalItems}
                </span>
              )}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
