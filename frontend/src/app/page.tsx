import React from "react";
import { fetchBackendJson } from "@/lib/api-server";
import { StorefrontClient } from "@/components/StorefrontClient";
import { BackendOfflineBanner } from "@/components/BackendOfflineBanner";
import type {
  MemberTier,
  PoPeriodSummary,
  ProductWithDetails,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface CatalogResponse {
  user: SessionUser | null;
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  tiers: MemberTier[];
  products: ProductWithDetails[];
  serverInstanceId: string;
}

export default async function HomePage() {
  const res = await fetchBackendJson<CatalogResponse>("/api/catalog");
  if (!res.ok) {
    return <BackendOfflineBanner />;
  }

  return (
    <StorefrontClient
      user={res.data.user}
      settings={res.data.settings}
      poPeriod={res.data.poPeriod}
      tiers={res.data.tiers}
      products={res.data.products}
      serverInstanceId={res.data.serverInstanceId}
    />
  );
}
