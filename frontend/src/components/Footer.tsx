import React from "react";
import { Instagram, MessageCircle } from "lucide-react";

export function Footer(_props?: {
  serverInstanceId?: string;
  pickupLocation?: string;
}) {
  return (
    <footer className="mt-auto w-full border-t border-[#EFE0B4] bg-[#FFF8D8]">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E6C86E] bg-[#FFF3B0]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path
                  d="M6 16.5C10.5 18 16.5 14.5 18 7.5C19.2 12.2 15.8 18.8 9.2 19.2C7.4 19.3 6.2 18 6 16.5Z"
                  fill="#F8C93A"
                  stroke="#4A2E1B"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-[#4A2E1B]">
              banatier
            </span>
          </div>
          <p className="text-xs text-[#78583E]">
            © 2026 Banatier · Kue pisang artisanal pre-order.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <a
            href="https://instagram.com/banatier.id"
            target="_blank"
            rel="noreferrer"
            className="motion-btn inline-flex items-center gap-2 rounded-full border border-[#EAD496] bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#4A2E1B] hover:bg-[#F8C93A]/40"
          >
            <Instagram className="h-3.5 w-3.5 text-[#B86B23]" />
            <span>@banatier.id</span>
          </a>

          <a
            href="https://wa.me/6281219048439"
            target="_blank"
            rel="noreferrer"
            className="motion-btn inline-flex items-center gap-2 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3.5 py-1.5 text-xs font-bold text-[#2F4C00] hover:bg-[#D8EEAE]"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#5C8D1E]" />
            <span>0812-1904-8439</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
