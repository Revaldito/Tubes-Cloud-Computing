import React from "react";
import { redirect } from "next/navigation";
import { fetchBackendJson } from "@/lib/api-server";
import { AccountClient } from "@/components/AccountClient";
import { BackendOfflineBanner } from "@/components/BackendOfflineBanner";
import type { MemberTier, SessionUser } from "@/lib/types";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: SessionUser | null;
  tiers: MemberTier[];
  serverInstanceId: string;
}

export default async function AccountPage() {
  const res = await fetchBackendJson<MeResponse>("/api/auth/me");
  if (!res.ok) {
    return <BackendOfflineBanner />;
  }

  if (!res.data.user) {
    redirect("/login");
  }

  if (res.data.user.role === "admin") {
    redirect("/admin");
  }

  return (
    <AccountClient
      user={res.data.user}
      tiers={res.data.tiers}
      serverInstanceId={res.data.serverInstanceId}
    />
  );
}
