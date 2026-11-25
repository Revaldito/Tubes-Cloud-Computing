import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FBF9F3] px-4 text-center text-[#291B0E]">
      <div className="max-w-md rounded-3xl border border-[#EADFCE] bg-[#FFFBEB] p-8 shadow-xs">
        <span className="font-display text-4xl font-extrabold text-[#8B5E34]">404</span>
        <h1 className="font-display mt-2 text-2xl font-bold text-[#291B0E]">
          Halaman Tidak Ditemukan
        </h1>
        <p className="mt-2 text-xs text-[#785D45]">
          Maaf, halaman yang kamu tuju tidak tersedia. Silakan kembali ke katalog menu Banatier.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[#291B0E] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#451A03]"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
