import React from "react";

/**
 * Appetizing artisanal bakery visual of sliced moist Bolu Pisang &
 * glossy golden Bandung-style Bolen Pisang in Banatier's signature
 * warm butter-banana cream, golden yellow, caramel, cocoa, and leaf-green palette.
 */
export function HeroBolenBoluIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      <div className="motion-card relative overflow-hidden rounded-[32px] border border-[#EAD496] bg-gradient-to-br from-[#FFF6C2] via-[#FFF9DA] to-[#FFECB3] p-6 sm:p-7 shadow-[0_14px_34px_rgba(107,63,29,0.09)]">
        {/* Top colorful status & category pills */}
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C3DF8A] bg-[#E7F5C8] px-3 py-1 text-[11px] font-bold text-[#2F4C00]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5C8D1E]" />
            Freshly Baked PO
          </span>
          <span className="rounded-full bg-[#F8C93A] px-3 py-1 text-[11px] font-bold text-[#4A2E1B] shadow-2xs">
            Bolu &amp; Bolen
          </span>
        </div>

        <svg
          viewBox="0 0 360 245"
          fill="none"
          className="h-auto w-full"
          aria-label="Ilustrasi Bolu Pisang dan Bolen Pisang"
        >
          <defs>
            <linearGradient id="boluCrust" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#DE9142" />
              <stop offset="100%" stopColor="#A85C20" />
            </linearGradient>
            <linearGradient id="boluCrumb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFF2A6" />
              <stop offset="100%" stopColor="#FAD665" />
            </linearGradient>
            <linearGradient id="bolenGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFE05D" />
              <stop offset="65%" stopColor="#F8B928" />
              <stop offset="100%" stopColor="#CE7918" />
            </linearGradient>
          </defs>

          {/* Soft golden shadow */}
          <ellipse cx="182" cy="212" rx="148" ry="18" fill="#E8CF88" opacity="0.65" />

          {/* Warm oven-fresh steam wisps */}
          <path
            d="M108 38 C103 28, 113 22, 108 12"
            stroke="#C68B59"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.65"
          />
          <path
            d="M142 32 C137 22, 147 16, 142 6"
            stroke="#C68B59"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M248 48 C244 38, 252 32, 248 22"
            stroke="#C68B59"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.6"
          />

          {/* Small decorative banana leaf accent behind platter */}
          <path
            d="M36 176 C56 154, 96 156, 114 176 C88 184, 54 184, 36 176 Z"
            fill="#8DB63B"
            stroke="#4A2E1B"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path d="M46 175 Q76 168 104 175" stroke="#4A2E1B" strokeWidth="1.6" strokeLinecap="round" />

          {/* Ceramic serving platter */}
          <ellipse
            cx="184"
            cy="196"
            rx="140"
            ry="24"
            fill="#FFFDF7"
            stroke="#4A2E1B"
            strokeWidth="2.5"
          />
          <ellipse cx="184" cy="193" rx="120" ry="15" fill="#FFF5CA" />

          {/* === BACK-LEFT: ARTISANAL BOLU PISANG LOAF + MOIST SLICES === */}
          <path
            d="M58 96 C58 62, 180 62, 180 96 L175 166 C175 173, 169 178, 162 178 L76 178 C69 178, 63 173, 63 166 Z"
            fill="url(#boluCrust)"
            stroke="#4A2E1B"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M82 75 Q119 66 156 75"
            stroke="#FFF4C2"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse
            cx="100"
            cy="77"
            rx="11"
            ry="6"
            fill="#FFFDF5"
            stroke="#4A2E1B"
            strokeWidth="2"
          />
          <ellipse
            cx="132"
            cy="76"
            rx="11"
            ry="6"
            fill="#FFFDF5"
            stroke="#4A2E1B"
            strokeWidth="2"
          />

          <rect
            x="74"
            y="98"
            width="92"
            height="70"
            rx="12"
            fill="url(#boluCrumb)"
            stroke="#4A2E1B"
            strokeWidth="2.3"
          />
          <circle cx="94" cy="118" r="3.5" fill="#4A2E1B" />
          <circle cx="120" cy="128" r="3.8" fill="#4A2E1B" />
          <circle cx="144" cy="115" r="3.4" fill="#4A2E1B" />
          <circle cx="102" cy="146" r="3.5" fill="#4A2E1B" />
          <circle cx="137" cy="148" r="3.6" fill="#4A2E1B" />

          {/* Leaning Front Slice of Bolu Pisang */}
          <g transform="rotate(8 122 176)">
            <rect
              x="80"
              y="128"
              width="82"
              height="60"
              rx="11"
              fill="#C8762E"
              stroke="#4A2E1B"
              strokeWidth="2.4"
            />
            <rect
              x="87"
              y="134"
              width="68"
              height="48"
              rx="8"
              fill="#FFE985"
              stroke="#4A2E1B"
              strokeWidth="2"
            />
            <circle cx="104" cy="152" r="3.2" fill="#4A2E1B" />
            <circle cx="126" cy="164" r="3.2" fill="#4A2E1B" />
            <circle cx="138" cy="148" r="3" fill="#4A2E1B" />
          </g>

          {/* === FRONT-RIGHT: GOLDEN BANDUNG BOLEN PISANG TRIO === */}
          <g transform="translate(188, 98)">
            <rect
              x="0"
              y="0"
              width="74"
              height="48"
              rx="14"
              fill="url(#bolenGold)"
              stroke="#4A2E1B"
              strokeWidth="2.4"
            />
            <path
              d="M14 13 C26 8, 48 8, 60 13"
              stroke="#FFFDF5"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M22 22 L32 19 M34 24 L46 20 M44 26 L54 22"
              stroke="#FFF9DB"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>

          <g transform="translate(216, 128)">
            <rect
              x="0"
              y="0"
              width="86"
              height="56"
              rx="16"
              fill="url(#bolenGold)"
              stroke="#4A2E1B"
              strokeWidth="2.5"
            />
            <path
              d="M14 14 C30 9, 56 9, 72 14"
              stroke="#FFFDF5"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <rect x="30" y="18" width="7" height="3" rx="1.5" fill="#4A2E1B" />
            <rect x="42" y="16" width="7" height="3" rx="1.5" fill="#4A2E1B" />
            <rect x="52" y="19" width="7" height="3" rx="1.5" fill="#4A2E1B" />
            <rect
              x="16"
              y="30"
              width="54"
              height="18"
              rx="9"
              fill="#5C3317"
              stroke="#4A2E1B"
              strokeWidth="1.8"
            />
            <circle cx="33" cy="39" r="5.5" fill="#FFF2A6" />
            <circle cx="53" cy="39" r="5.5" fill="#FFF2A6" />
          </g>

          <g transform="translate(156, 144)">
            <rect
              x="0"
              y="0"
              width="74"
              height="48"
              rx="14"
              fill="url(#bolenGold)"
              stroke="#4A2E1B"
              strokeWidth="2.5"
            />
            <path
              d="M12 13 C26 8, 48 8, 62 13"
              stroke="#FFFDF5"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <ellipse cx="37" cy="28" rx="18" ry="7" fill="#5C3317" />
            <path
              d="M28 27 L36 25 M39 29 L47 26"
              stroke="#FFF2A6"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
        </svg>
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
    illustrationKey.startsWith("https://");

  const resolved = isDirectUrl
    ? { src: illustrationKey, alt: "Menu Banatier", position: "50% 50%" }
    : MENU_PHOTO_MAP[illustrationKey] ?? MENU_PHOTO_MAP.bolen;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved.src}
      alt={resolved.alt}
      loading="lazy"
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
