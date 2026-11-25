"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface CartItem {
  key: string;
  productId: number;
  productName: string;
  illustrationKey: string;
  basePrice: number;
  variantId: number | null;
  variantName: string;
  variantDelta: number;
  addons: Array<{ id: number; name: string; price: number }>;
  quantity: number;
  requiresThermalBag: boolean;
  maxQuota: number;
}

interface CartContextValue {
  items: CartItem[];
  hydrated: boolean;
  totalItems: number;
  addItem: (item: Omit<CartItem, "key">) => { ok: boolean; error?: string };
  updateQuantity: (key: string, nextQty: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "banatier_cart_v1";

export function buildCartKey(
  productId: number,
  variantId: number | null,
  addonIds: number[]
): string {
  const sortedAddons = [...addonIds].sort((a, b) => a - b).join(",");
  return `${productId}::${variantId ?? "none"}::${sortedAddons}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch {
      // Ignore malformed localStorage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage quota errors
    }
  }, [items, hydrated]);

  const addItem: CartContextValue["addItem"] = (incoming) => {
    const key = buildCartKey(
      incoming.productId,
      incoming.variantId,
      incoming.addons.map((a) => a.id)
    );

    const currentForProduct = items
      .filter((it) => it.productId === incoming.productId)
      .reduce((acc, it) => acc + it.quantity, 0);

    if (currentForProduct + incoming.quantity > incoming.maxQuota) {
      return {
        ok: false,
        error: `Sisa kuota ${incoming.productName} tinggal ${incoming.maxQuota} porsi.`,
      };
    }

    setItems((prev) => {
      const idx = prev.findIndex((p) => p.key === key);
      if (idx === -1) {
        return [...prev, { ...incoming, key }];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: next[idx].quantity + incoming.quantity,
        maxQuota: incoming.maxQuota,
      };
      return next;
    });

    return { ok: true };
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (key, nextQty) => {
    setItems((prev) => {
      const target = prev.find((it) => it.key === key);
      if (!target) return prev;
      if (nextQty <= 0) {
        return prev.filter((it) => it.key !== key);
      }

      const otherQtySameProduct = prev
        .filter((it) => it.productId === target.productId && it.key !== key)
        .reduce((acc, it) => acc + it.quantity, 0);

      const clampedQty = Math.min(nextQty, Math.max(1, target.maxQuota - otherQtySameProduct));
      return prev.map((it) => (it.key === key ? { ...it, quantity: clampedQty } : it));
    });
  };

  const removeItem: CartContextValue["removeItem"] = (key) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        hydrated,
        totalItems,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
