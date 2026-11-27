import React from "react";
import { cookies } from "next/headers";
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
  user: SessionUser;
  serverInstanceId: string;
}

export default async function OrdersPage() {
  const cookieStore = await cookies();
  const hasSession = Boolean(cookieStore.get("banatier_session")?.value);

  if (hasSession) {
    const ordRes = await fetchBackendJson<OrdersResponse>("/api/orders");
    if (ordRes.ok) {
      return (
        <OrdersClient
          user={ordRes.data.user}
          orders={ordRes.data.orders}
          serverInstanceId={ordRes.data.serverInstanceId}
        />
      );
    }
    if (ordRes.offline) {
      return <BackendOfflineBanner />;
    }
  }

  const meRes = await fetchBackendJson<MeResponse>("/api/auth/me");
  if (!meRes.ok) {
    return <BackendOfflineBanner />;
  }

  return (
    <OrdersClient
      user={meRes.data.user}
      orders={[]}
      serverInstanceId={meRes.data.serverInstanceId}
    />
  );
}
