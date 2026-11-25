import React from "react";
import { redirect } from "next/navigation";
import { fetchBackendJson } from "@/lib/api-server";
import { AdminClient } from "@/components/AdminClient";
import { BackendOfflineBanner } from "@/components/BackendOfflineBanner";
import type { AdminTabKey } from "@/components/Navbar";
import type {
  AdminUserRecord,
  MemberTier,
  OrderRecord,
  PoPeriodSummary,
  ProductWithDetails,
  SessionUser,
  StoreSettings,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface AdminOverviewResponse {
  user: SessionUser;
  settings: StoreSettings;
  poPeriod: PoPeriodSummary | null;
  periods: Array<{
    id: number;
    name: string;
    opensAt: string;
    closesAt: string;
    fulfillmentDate: string;
    isActive: boolean;
  }>;
  tiers: MemberTier[];
  products: ProductWithDetails[];
  orders: OrderRecord[];
  users: AdminUserRecord[];
  serverInstanceId: string;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const requestedTab = params.tab as AdminTabKey | undefined;
  const validTabs: AdminTabKey[] = ["orders", "catalog", "users"];
  const initialTab: AdminTabKey =
    requestedTab && validTabs.includes(requestedTab) ? requestedTab : "orders";

  const res = await fetchBackendJson<AdminOverviewResponse>("/api/admin/overview");

  if (!res.ok) {
    if (res.offline) {
      return <BackendOfflineBanner />;
    }
    redirect("/login");
  }

  return (
    <AdminClient
      user={res.data.user}
      initialTab={initialTab}
      initialSettings={res.data.settings}
      initialPoPeriod={res.data.poPeriod}
      initialTiers={res.data.tiers}
      initialProducts={res.data.products}
      initialOrders={res.data.orders}
      initialUsers={res.data.users ?? []}
    />
  );
}
