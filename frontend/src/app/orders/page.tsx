import React from "react";
import { fetchBackendJson } from "@/lib/api-server";
import { OrdersClient } from "@/components/OrdersClient";
import { BackendOfflineBanner } from "@/components/BackendOfflineBanner";
import type { OrderRecord, SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: SessionUser | null;
  serverInstanceId: string;
}

interface OrdersResponse {
  orders: OrderRecord[];
}

export default async function OrdersPage() {
  const meRes = await fetchBackendJson<MeResponse>("/api/auth/me");
  if (!meRes.ok) {
    return <BackendOfflineBanner />;
  }

  let orders: OrderRecord[] = [];
  if (meRes.data.user) {
    const ordRes = await fetchBackendJson<OrdersResponse>("/api/orders");
    if (ordRes.ok) {
      orders = ordRes.data.orders;
    }
  }

  return (
    <OrdersClient
      user={meRes.data.user}
      orders={orders}
      serverInstanceId={meRes.data.serverInstanceId}
    />
  );
}
