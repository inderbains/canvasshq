import { NextResponse } from "next/server";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, Point, Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const managerRoles = new Set(["owner", "admin", "coordinator", "team_lead"]);

function parseAddress(fullAddress: string) {
  const cleaned = fullAddress.trim().replace(/,?\s*surrey\s*(bc)?\s*$/i, "").trim();
  const match = cleaned.match(/^(\d+)\s+(.+)$/);
  if (!match) return { houseNumber: null, roadName: null };
  return { houseNumber: Number(match[1]), roadName: match[2].trim() };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId || "");
    const campaignId = String(body.campaignId || "");
    const districtId = String(body.districtId || "");
    const fullAddress = String(body.fullAddress || "").trim().slice(0, 250);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (
      !organizationId ||
      !campaignId ||
      !districtId ||
      !fullAddress ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return NextResponse.json(
        { error: "Address and map location are required." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Workspace access is required." }, { status: 403 });
    }

    const isManager = managerRoles.has(membership.role);
    const isCanvasser = membership.role === "canvasser";
    if (!isManager && !isCanvasser) {
      return NextResponse.json({ error: "This role cannot add a door." }, { status: 403 });
    }

    const { data: campaign } = await admin
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { data: district } = await admin
      .from("districts")
      .select("id")
      .eq("id", districtId)
      .eq("campaign_id", campaignId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!campaign || !district) {
      return NextResponse.json(
        { error: "Campaign or district does not belong to this workspace." },
        { status: 400 },
      );
    }

    const { data: nearby } = await admin
      .from("addresses")
      .select("id,full_address,latitude,longitude")
      .eq("campaign_id", campaignId)
      .gte("longitude", longitude - 0.00012)
      .lte("longitude", longitude + 0.00012)
      .gte("latitude", latitude - 0.00009)
      .lte("latitude", latitude + 0.00009);

    if (
      (nearby ?? []).some(
        (address) => address.full_address.toLowerCase() === fullAddress.toLowerCase(),
      )
    ) {
      return NextResponse.json(
        { error: "That address already exists in this campaign." },
        { status: 409 },
      );
    }

    const point: Feature<Point> = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [longitude, latitude] },
    };

    const { data: territories, error: territoryError } = await admin
      .from("territories")
      .select("id,boundary_geojson")
      .eq("campaign_id", campaignId)
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (territoryError) throw territoryError;

    let matchedTerritoryId: string | null = null;
    for (const territory of territories ?? []) {
      const boundary = territory.boundary_geojson as Feature<Polygon> | null;
      if (!boundary?.geometry) continue;
      if (booleanPointInPolygon(point, boundary)) {
        matchedTerritoryId = territory.id;
        break;
      }
    }

    let assignedTo: string | null = null;
    if (matchedTerritoryId) {
      const { data: assignment } = await admin
        .from("assignments")
        .select("assigned_to")
        .eq("territory_id", matchedTerritoryId)
        .eq("campaign_id", campaignId)
        .eq("status", "assigned")
        .not("assigned_to", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      assignedTo = assignment?.assigned_to ?? null;
    }

    if (isCanvasser) {
      if (!matchedTerritoryId || assignedTo !== authData.user.id) {
        return NextResponse.json(
          { error: "You can only add a missing door inside your assigned territory." },
          { status: 403 },
        );
      }
      assignedTo = authData.user.id;
    }

    const { houseNumber, roadName } = parseAddress(fullAddress);
    const manualId = `manual-${crypto.randomUUID()}`;

    const { data: created, error: insertError } = await admin
      .from("addresses")
      .insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        district_id: districtId,
        source: isCanvasser
          ? "Canvasser verified missing door"
          : "Manual coverage review",
        source_object_id: manualId,
        house_number: houseNumber,
        road_name: roadName,
        full_address: fullAddress,
        latitude,
        longitude,
        municipal_status: "Manual verified",
        address_type: "Manual door",
        assigned_to: assignedTo,
      })
      .select("id,full_address")
      .single();

    if (insertError) throw insertError;

    if (matchedTerritoryId) {
      const { error: linkError } = await admin.from("territory_addresses").upsert(
        { territory_id: matchedTerritoryId, address_id: created.id },
        { onConflict: "territory_id,address_id" },
      );
      if (linkError) throw linkError;
    }

    await admin.from("activity_logs").insert({
      organization_id: organizationId,
      actor_user_id: authData.user.id,
      action: "manual_door_added",
      details: {
        address_id: created.id,
        full_address: created.full_address,
        territory_id: matchedTerritoryId,
        assigned_to: assignedTo,
      },
    });

    return NextResponse.json({
      ok: true,
      address: created,
      territoryId: matchedTerritoryId,
      assignedTo,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add the manual door." },
      { status: 500 },
    );
  }
}
