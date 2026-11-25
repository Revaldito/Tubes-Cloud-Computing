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

export default async function LoginPage() {
  const res = await fetchBackendJson<MeResponse>("/api/auth/me");
  if (!res.ok) {
    return <BackendOfflineBanner />;
  }

  if (res.data.user) {
    if (res.data.user.role === "admin") {
      redirect("/admin");
    }
    redirect("/");
  }

  return (
    <AccountClient
      user={null}
      tiers={res.data.tiers}
      serverInstanceId={res.data.serverInstanceId}
    />
  );
}
