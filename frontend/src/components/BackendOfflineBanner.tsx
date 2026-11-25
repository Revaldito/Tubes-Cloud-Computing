import React from "react";
import { ServerCrash } from "lucide-react";

export function BackendOfflineBanner() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFFDF7] px-4 text-center">
      <div className="max-w-md rounded-3xl border border-[#EFE4C6] bg-white p-8 shadow-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7CC] text-[#4A2E1B]">
          <ServerCrash className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-serif-editorial text-2xl font-semibold text-[#4A2E1B]">
          Server Backend Belum Aktif
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#7B5D47]">
          Frontend berjalan di port <strong>3000</strong>, namun belum terhubung ke REST API Backend di port{" "}
          <strong>4000</strong>.
        </p>
        <div className="mt-5 rounded-2xl border border-[#EFE4C6] bg-[#FFFDF7] p-3.5 text-left font-mono text-xs text-[#4A2E1B]">
          cd backend &amp;&amp; npm run dev
        </div>
        <p className="mt-3 text-[11px] text-[#7B5D47]">
          Atau jalankan <code className="font-semibold">npm run dev</code> dari folder utama proyek untuk menyalakan keduanya sekaligus.
        </p>
      </div>
    </div>
  );
}
