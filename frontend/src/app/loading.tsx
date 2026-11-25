import React from "react";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 animate-page-in">
      <div className="h-5 w-36 rounded-full bg-[#EFE7D8]" />
      <div className="mt-5 h-12 w-72 rounded-2xl bg-[#EFE7D8]" />
      <div className="mt-3 h-12 w-60 rounded-2xl bg-[#EFE7D8]" />
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-64 rounded-2xl border border-[#EADFCE] bg-[#FFFBEB]/60"
          />
        ))}
      </div>
    </div>
  );
}
