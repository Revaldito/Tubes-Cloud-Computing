import React from "react";
import { fetchBackendJson } from "@/lib/api-server";
import { CheckoutClient } from "@/components/CheckoutClient";
import { BackendOfflineBanner } from "@/components/BackendOfflineBanner";
import type {
  MemberTier,
  OrderRecord,
  PoPeriodSummary,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface CatalogResponse {
  user: SessionUser | null;
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  tiers: MemberTier[];
  serverInstanceId: string;
}

interface SingleOrderResponse {
  order: OrderRecord;
  qrisImageUrl: string;
  demoMode: boolean;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  const orderCode = params.order?.trim() || "";

  const [catalogRes, orderRes] = await Promise.all([
    fetchBackendJson<CatalogResponse>("/api/catalog"),
    orderCode
      ? fetchBackendJson<SingleOrderResponse>(`/api/orders/${encodeURIComponent(orderCode)}`)
      : Promise.resolve(null),
  ]);

  if (!catalogRes.ok) {
    return <BackendOfflineBanner />;
  }

  const initialOrder = orderRes && orderRes.ok ? orderRes.data.order : null;
  const initialQrisImageUrl = orderRes && orderRes.ok ? orderRes.data.qrisImageUrl : "";
  const demoMode = false;

  return (
    <CheckoutClient
      user={catalogRes.data.user}
      settings={catalogRes.data.settings}
      poPeriod={catalogRes.data.poPeriod}
      tiers={catalogRes.data.tiers}
      serverInstanceId={catalogRes.data.serverInstanceId}
      initialOrder={initialOrder}
      initialQrisImageUrl={initialQrisImageUrl}
      demoMode={demoMode}
    />
  );
}
