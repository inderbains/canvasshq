import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const outcomes = new Set(["no_answer", "contacted", "refused", "follow_up", "completed"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const campaignId = String(body.campaignId || "");
    const addressId = String(body.addressId || "");
    const outcome = String(body.outcome || "");
    const notes = String(body.notes || "").trim().slice(0, 2000);
    if (!campaignId || !addressId || !outcomes.has(outcome)) {
      return NextResponse.json({ error: "Invalid canvass record." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { data: campaign } = await supabase.from("campaigns").select("organization_id").eq("id", campaignId).single();
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", campaign.organization_id)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership || !["owner", "admin", "coordinator", "team_lead", "canvasser"].includes(membership.role)) {
      return NextResponse.json({ error: "You do not have canvassing access." }, { status: 403 });
    }

    const { data: address } = await supabase.from("addresses").select("id").eq("id", addressId).eq("campaign_id", campaignId).eq("organization_id", campaign.organization_id).maybeSingle();
    if (!address) return NextResponse.json({ error: "Address is not part of this campaign." }, { status: 400 });

    const { error } = await supabase.from("canvass_visits").insert({
      organization_id: campaign.organization_id,
      campaign_id: campaignId,
      address_id: addressId,
      canvasser_user_id: authData.user.id,
      outcome,
      notes: notes || null,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save visit." }, { status: 500 });
  }
}
