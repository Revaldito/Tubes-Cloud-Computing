import React from "react";

/**
 * Cute kawaii banana mascot logo mark with locked 1:1 pixel dimensions.
 */
export function BanatierLogoMark({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        display: "block",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {/* Warm circular badge */}
      <circle cx="24" cy="24" r="22" fill="#FFE885" stroke="#4A2E1B" strokeWidth="2.2" />
      <circle cx="24" cy="24" r="18.5" fill="#FFF9D6" />

      {/* Little cheerful sparkle */}
      <path
        d="M12.5 13.5 L14.8 16 M10.5 17.5 L13.5 18.5"
        stroke="#F4B41A"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Left & right curved peels */}
      <path
        d="M16.2 27.5 C11.5 26, 9.2 29.2, 11 33.2 C13 34.4, 16 33, 18.2 30.2"
        fill="#F8C93A"
        stroke="#4A2E1B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M31.8 27.5 C36.5 26, 38.8 29.2, 37 33.2 C35 34.4, 32 33, 29.8 30.2"
        fill="#F8C93A"
        stroke="#4A2E1B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Natural proportioned creamy banana head */}
      <path
        d="M16 30.5 C15.6 19.5, 19 11.2, 24 10.2 C29 11.2, 32.4 19.5, 32 30.5 Z"
        fill="#FFF6C4"
        stroke="#4A2E1B"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />

      {/* Green-gold banana stem */}
      <path
        d="M22.2 10.4 C22.2 7.8, 25.8 7.8, 25.8 10.4 Z"
        fill="#9DC43B"
        stroke="#4A2E1B"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Kawaii eyes + highlights */}
      <circle cx="20.4" cy="21.2" r="2" fill="#4A2E1B" />
      <circle cx="27.6" cy="21.2" r="2" fill="#4A2E1B" />
      <circle cx="21" cy="20.6" r="0.7" fill="#FFFFFF" />
      <circle cx="28.2" cy="20.6" r="0.7" fill="#FFFFFF" />

      {/* Rosy pink cheeks */}
      <ellipse cx="18" cy="23.8" rx="2.1" ry="1.3" fill="#F593A0" />
      <ellipse cx="30" cy="23.8" rx="2.1" ry="1.3" fill="#F593A0" />

      {/* Happy smile */}
      <path
        d="M22.1 22.6 C22.4 25.8, 25.6 25.8, 25.9 22.6 Z"
        fill="#E57373"
        stroke="#4A2E1B"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Bottom golden peel */}
      <path
        d="M15.2 29.8 C17.8 36.8, 30.2 36.8, 32.8 29.8 C29.4 32, 26.8 28.8, 24 31.2 C21.2 28.8, 18.6 32, 15.2 29.8 Z"
        fill="#F8C93A"
        stroke="#4A2E1B"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Balanced, compact showcase card matching the original wide Hero card footprint,
 * with seamless #FDF2C8 background so the 1:1 illustration sits cleanly without stretching or squeezing.
 */
export function HeroBolenBoluIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="motion-card relative overflow-hidden rounded-[30px] border border-[#EAD496] bg-[#FDF2C8] p-4 sm:p-5 shadow-[0_12px_30px_rgba(107,63,29,0.09)]">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3 py-1 text-[11px] font-bold text-[#2F4C00]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5C8D1E]" />
            Freshly Baked PO
          </span>
          <span className="rounded-full bg-[#F8C93A] px-3 py-1 text-[11px] font-bold text-[#4A2E1B] shadow-2xs">
            Artisanal Banana
          </span>
        </div>

        <div className="mx-auto flex h-[230px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#FDF2C8] sm:h-[248px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-banatier-v2.jpg"
            alt="Ilustrasi Kue Pisang Banatier"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            style={{
              height: "100%",
              width: "auto",
              maxWidth: "100%",
              aspectRatio: "1 / 1",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const MENU_PHOTO_MAP: Record<string, { src: string; alt: string; position: string }> = {
  strudel: { src: "/menu/strudel.jpg", alt: "Banana Strudel", position: "50% 52%" },
  bolu: { src: "/menu/bolu.jpg", alt: "Bolu Pisang", position: "50% 58%" },
  split: { src: "/menu/split.jpg", alt: "Banana Split", position: "50% 48%" },
  banofee: { src: "/menu/banofee.jpg", alt: "Banofee", position: "50% 65%" },
  bolen: { src: "/menu/bolen.jpg", alt: "Bolen Pisang", position: "50% 60%" },
};

/**
 * Real photography for Banatier's menu catalog items, locked to fill its compact frame.
 */
export function ProductIllustration({
  illustrationKey,
  className = "h-full w-full object-cover",
}: {
  illustrationKey: string;
  className?: string;
}) {
  const isDirectUrl =
    illustrationKey.startsWith("/") ||
    illustrationKey.startsWith("http://") ||
    illustrationKey.startsWith("https://") ||
    illustrationKey.startsWith("data:image/");

  const resolved = isDirectUrl
    ? { src: illustrationKey, alt: "Menu Banatier", position: "50% 50%" }
    : MENU_PHOTO_MAP[illustrationKey] ?? MENU_PHOTO_MAP.bolen;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved.src}
      alt={resolved.alt}
      loading="lazy"
      decoding="async"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: resolved.position,
        display: "block",
      }}
    />
  );
}
