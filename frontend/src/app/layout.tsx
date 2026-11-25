import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";

export const metadata: Metadata = {
  title: "Banatier — Artisanal Banana Bakes",
  description:
    "Pre-order kue pisang artisanal: Banana Strudel, Bolu Pisang, Banana Split, Banofee, dan Bolen Pisang.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-[#FFFDF3] text-[#4A2E1B] antialiased selection:bg-[#F8C93A] selection:text-[#4A2E1B]">
        <CartProvider>{children}</CartProvider>
      </body>
    </html>
  );
}
