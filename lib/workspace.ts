import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/types";

export async function getWorkspace(): Promise<Workspace | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let district: { id: string; name: string } | null = null;
  if (campaign) {
    const result = await supabase
      .from("districts")
      .select("id, name")
      .eq("campaign_id", campaign.id)
      .limit(1)
      .maybeSingle();
    district = result.data;
  }

  const org = membership.organizations as unknown as { name: string } | null;
  return {
    organizationId: membership.organization_id,
    organizationName: org?.name ?? "Workspace",
    role: membership.role,
    campaignId: campaign?.id ?? null,
    campaignName: campaign?.name ?? null,
    districtId: district?.id ?? null,
    districtName: district?.name ?? null,
  };
}
