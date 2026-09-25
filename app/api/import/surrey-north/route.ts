import { NextResponse } from "next/server";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BOUNDARY_URL = "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_admin_boundaries/MapServer/74/query";
const ADDRESS_URL = "https://gisservices.surrey.ca/arcgis/rest/services/OpenData/MapServer/138/query";

type AddressProperties = {
  OBJECTID: number;
  HOUSE_NO?: number | null;
  GCROADS?: string | null;
  STATUS?: string | null;
  ADDRESS_TYPE2?: string | null;
  LOT_LINK?: number | null;
};

async function fetchBoundary() {
  const params = new URLSearchParams({
    where: "ED_NAME='Surrey North'",
    outFields: "ED_NAME,ED_ABBREVIATION",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const response = await fetch(`${BOUNDARY_URL}?${params}`);
  if (!response.ok) throw new Error("Could not retrieve the provincial riding boundary.");
  const fc = (await response.json()) as FeatureCollection<Polygon | MultiPolygon>;
  const feature = fc.features[0];
  if (!feature) throw new Error("Surrey North boundary was not returned by DataBC.");
  return { collection: fc, feature };
}

function boundaryBbox(feature: Feature<Polygon | MultiPolygon>) {
  const coords: number[][] = [];
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      coords.push(value as number[]);
      return;
    }
    value.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  return {
    xmin: Math.min(...coords.map(c => c[0])),
    ymin: Math.min(...coords.map(c => c[1])),
    xmax: Math.max(...coords.map(c => c[0])),
    ymax: Math.max(...coords.map(c => c[1])),
  };
}

async function fetchAddressIds(boundary: Feature<Polygon | MultiPolygon>): Promise<number[]> {
  const bbox = boundaryBbox(boundary);
  const params = new URLSearchParams({
    where: "1=1",
    returnIdsOnly: "true",
    geometry: JSON.stringify({ ...bbox, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryEnvelope",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    f: "json"
  });
  const response = await fetch(`${ADDRESS_URL}?${params}`);
  if (!response.ok) throw new Error("Could not retrieve Surrey address IDs.");
  const data = await response.json();
  return (data.objectIds || []) as number[];
}

async function fetchAddressChunk(ids: number[]) {
  const params = new URLSearchParams({
    objectIds: ids.join(","),
    outFields: "OBJECTID,HOUSE_NO,GCROADS,STATUS,ADDRESS_TYPE2,LOT_LINK",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });
  const response = await fetch(`${ADDRESS_URL}?${params}`);
  if (!response.ok) throw new Error("Could not retrieve a Surrey address batch.");
  return (await response.json()) as FeatureCollection<Point, AddressProperties>;
}

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId || "");
    const campaignId = String(body.campaignId || "");
    const districtId = String(body.districtId || "");
    if (!organizationId || !campaignId || !districtId) {
      return NextResponse.json({ error: "Missing workspace identifiers." }, { status: 400 });
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
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Owner or Admin access is required." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: targetCampaign } = await admin.from("campaigns").select("id").eq("id", campaignId).eq("organization_id", organizationId).maybeSingle();
    const { data: targetDistrict } = await admin.from("districts").select("id").eq("id", districtId).eq("campaign_id", campaignId).eq("organization_id", organizationId).maybeSingle();
    if (!targetCampaign || !targetDistrict) {
      return NextResponse.json({ error: "Campaign or district does not belong to this workspace." }, { status: 400 });
    }

    const { collection: boundaryCollection, feature: boundary } = await fetchBoundary();
    await admin.from("districts").update({ boundary_geojson: boundaryCollection }).eq("id", districtId).eq("organization_id", organizationId);

    const ids = await fetchAddressIds(boundary);
    let imported = 0;
    const CHUNK_SIZE = 1500;

    for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
      const fc = await fetchAddressChunk(ids.slice(start, start + CHUNK_SIZE));
      const rows = fc.features
        .filter((f): f is Feature<Point, AddressProperties> => Boolean(f.geometry?.coordinates?.length))
        .filter((f) => booleanPointInPolygon(f, boundary))
        .map((f) => {
          const [longitude, latitude] = f.geometry.coordinates;
          const house = f.properties?.HOUSE_NO ?? null;
          const road = f.properties?.GCROADS?.trim() || null;
          return {
            organization_id: organizationId,
            campaign_id: campaignId,
            district_id: districtId,
            source: "City of Surrey Open Data - Address Points",
            source_object_id: String(f.properties.OBJECTID),
            house_number: house,
            road_name: road,
            full_address: [house, road, "Surrey BC"].filter(Boolean).join(" "),
            latitude,
            longitude,
            municipal_status: f.properties?.STATUS ?? null,
            address_type: f.properties?.ADDRESS_TYPE2 ?? null,
            lot_link: f.properties?.LOT_LINK ?? null,
          };
        });

      for (let offset = 0; offset < rows.length; offset += 500) {
        const batch = rows.slice(offset, offset + 500);
        const { error } = await admin.from("addresses").upsert(batch, {
          onConflict: "organization_id,campaign_id,source_object_id",
          ignoreDuplicates: false,
        });
        if (error) throw error;
        imported += batch.length;
      }
    }

    await admin.from("activity_logs").insert({
      organization_id: organizationId,
      actor_user_id: authData.user.id,
      action: "surrey_north_address_sync",
      details: { imported, source_total_ids: ids.length },
    });

    return NextResponse.json({ ok: true, imported, sourceTotal: ids.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Address import failed." }, { status: 500 });
  }
}
