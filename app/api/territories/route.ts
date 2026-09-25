import { NextResponse } from "next/server";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, Point, Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function fetchAllCampaignAddresses(admin: ReturnType<typeof createAdminClient>, campaignId: string) {
  const rows: { id: string; latitude: number; longitude: number }[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await admin
      .from("addresses")
      .select("id,latitude,longitude")
      .eq("campaign_id", campaignId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId || "");
    const campaignId = String(body.campaignId || "");
    const name = String(body.name || "").trim().slice(0, 100);
    const assignedTo = body.assignedTo ? String(body.assignedTo) : null;
    const boundary = body.boundary as Feature<Polygon> | undefined;

    if (!organizationId || !campaignId || !name || !boundary?.geometry) {
      return NextResponse.json({ error: "Territory name and polygon are required." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!membership || !["owner", "admin", "coordinator", "team_lead"].includes(membership.role)) {
      return NextResponse.json({ error: "You do not have territory management access." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: targetCampaign } = await admin.from("campaigns").select("id").eq("id", campaignId).eq("organization_id", organizationId).maybeSingle();
    if (!targetCampaign) return NextResponse.json({ error: "Campaign does not belong to this workspace." }, { status: 400 });
    if (assignedTo) {
      const { data: assignee } = await admin.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", assignedTo).eq("is_active", true).maybeSingle();
      if (!assignee) return NextResponse.json({ error: "Assigned person is not an active member of this workspace." }, { status: 400 });
    }

    const { data: territory, error: territoryError } = await admin
      .from("territories")
      .insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        name,
        status: "active",
        boundary_geojson: boundary,
        created_by: authData.user.id,
      })
      .select("id")
      .single();
    if (territoryError) throw territoryError;

    const addresses = await fetchAllCampaignAddresses(admin, campaignId);
    const selected = addresses.filter((a) => {
      const p: Feature<Point> = { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [a.longitude, a.latitude] } };
      return booleanPointInPolygon(p, boundary);
    });

    for (let i = 0; i < selected.length; i += 500) {
      const chunk = selected.slice(i, i + 500);
      const { error } = await admin.from("territory_addresses").insert(chunk.map(a => ({ territory_id: territory.id, address_id: a.id })));
      if (error) throw error;
      if (assignedTo) {
        const ids = chunk.map(a => a.id);
        const { error: assignError } = await admin.from("addresses").update({ assigned_to: assignedTo }).in("id", ids);
        if (assignError) throw assignError;
      }
    }

    const { error: assignmentError } = await admin.from("assignments").insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      territory_id: territory.id,
      assigned_to: assignedTo,
      status: assignedTo ? "assigned" : "unassigned",
      assigned_by: authData.user.id,
    });
    if (assignmentError) throw assignmentError;

    return NextResponse.json({ ok: true, territoryId: territory.id, addressCount: selected.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create territory." }, { status: 500 });
  }
}
