import { NextResponse } from "next/server";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUILDING_URL =
  "https://gisservices.surrey.ca/arcgis/rest/services/OpenData/MapServer/155/query";

const managerRoles = new Set(["owner", "admin", "coordinator", "team_lead"]);

type BuildingProperties = {
  OBJECTID: number;
  FACILITY_TYPE?: string | null;
  LOCATION?: string | null;
  NAME?: string | null;
  CIVIC_FACILITY?: string | null;
};

type DbAddress = {
  id: string;
  full_address: string;
  latitude: number;
  longitude: number;
};

function parseBbox(value: string | null) {
  if (!value) return null;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [xmin, ymin, xmax, ymax] = parts;
  if (xmin >= xmax || ymin >= ymax) return null;
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return null;
  return { xmin, ymin, xmax, ymax };
}

function flattenCoordinates(geometry: Polygon | MultiPolygon): number[][] {
  const points: number[][] = [];
  const walk = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      points.push([value[0], value[1]]);
      return;
    }
    value.forEach(walk);
  };
  walk(geometry.coordinates);
  return points;
}

function centroidOfGeometry(geometry: Polygon | MultiPolygon) {
  const points = flattenCoordinates(geometry);
  if (!points.length) return null;

  let longitude = 0;
  let latitude = 0;
  for (const [lng, lat] of points) {
    longitude += lng;
    latitude += lat;
  }

  return {
    longitude: longitude / points.length,
    latitude: latitude / points.length,
  };
}

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Approximate footprint area in square metres. This helps suppress very small
// accessory structures while keeping normal houses and larger buildings.
function approximateAreaSqM(geometry: Polygon | MultiPolygon) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 4) continue;
    const meanLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    const metersPerLng = 111_320 * Math.cos((meanLat * Math.PI) / 180);
    const metersPerLat = 110_540;

    let area2 = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[i + 1];
      const x1 = lng1 * metersPerLng;
      const y1 = lat1 * metersPerLat;
      const x2 = lng2 * metersPerLng;
      const y2 = lat2 * metersPerLat;
      area2 += x1 * y2 - x2 * y1;
    }
    total += Math.abs(area2) / 2;
  }

  return total;
}

async function fetchBuildings(
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number },
) {
  const features: Feature<Polygon | MultiPolygon, BuildingProperties>[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 2000; offset += pageSize) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "OBJECTID,FACILITY_TYPE,LOCATION,NAME,CIVIC_FACILITY",
      returnGeometry: "true",
      geometry: JSON.stringify({
        ...bbox,
        spatialReference: { wkid: 4326 },
      }),
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "geojson",
    });

    const response = await fetch(`${BUILDING_URL}?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load Surrey building footprints.");

    const collection = (await response.json()) as FeatureCollection<
      Polygon | MultiPolygon,
      BuildingProperties
    >;

    const page = (collection.features ?? []).filter(
      (feature): feature is Feature<Polygon | MultiPolygon, BuildingProperties> =>
        feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
    );

    features.push(...page);
    if (page.length < pageSize) break;
  }

  return features;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const campaignId = String(url.searchParams.get("campaignId") || "");
    const bbox = parseBbox(url.searchParams.get("bbox"));

    if (!campaignId || !bbox) {
      return NextResponse.json(
        { error: "Campaign and visible map bounds are required." },
        { status: 400 },
      );
    }

    if (bbox.xmax - bbox.xmin > 0.035 || bbox.ymax - bbox.ymin > 0.035) {
      return NextResponse.json(
        { error: "Zoom in closer to review missing buildings.", code: "ZOOM_IN" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: campaign } = await admin
      .from("campaigns")
      .select("id,organization_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }

    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", campaign.organization_id)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Workspace access is required." }, { status: 403 });
    }

    const isManager = managerRoles.has(membership.role);
    const isCanvasser = membership.role === "canvasser";
    if (!isManager && !isCanvasser) {
      return NextResponse.json({ error: "Coverage review is not available for this role." }, { status: 403 });
    }

    let assignedTerritories: Feature<Polygon>[] = [];
    if (isCanvasser) {
      const { data: assignments } = await admin
        .from("assignments")
        .select("territory_id")
        .eq("campaign_id", campaignId)
        .eq("assigned_to", authData.user.id)
        .eq("status", "assigned");

      const ids = (assignments ?? [])
        .map((row) => row.territory_id)
        .filter((id): id is string => Boolean(id));

      if (!ids.length) {
        return NextResponse.json({ candidates: [], matched: 0, buildings: 0 });
      }

      const { data: territories } = await admin
        .from("territories")
        .select("boundary_geojson")
        .in("id", ids);

      assignedTerritories = (territories ?? [])
        .map((row) => row.boundary_geojson as Feature<Polygon> | null)
        .filter((feature): feature is Feature<Polygon> => Boolean(feature?.geometry));
    }

    const { data: addressRows, error: addressError } = await admin
      .from("addresses")
      .select("id,full_address,latitude,longitude")
      .eq("campaign_id", campaignId)
      .gte("longitude", bbox.xmin)
      .lte("longitude", bbox.xmax)
      .gte("latitude", bbox.ymin)
      .lte("latitude", bbox.ymax);

    if (addressError) throw addressError;

    const addresses = (addressRows ?? []) as DbAddress[];
    const buildings = await fetchBuildings(bbox);

    let matched = 0;
    const candidates: Array<
      Feature<
        Polygon | MultiPolygon,
        BuildingProperties & {
          candidate_id: string;
          centroid_latitude: number;
          centroid_longitude: number;
          nearest_address: string | null;
          nearest_distance_m: number | null;
        }
      >
    > = [];

    for (const building of buildings) {
      // Ignore tiny accessory structures such as many sheds.
      if (approximateAreaSqM(building.geometry) < 25) continue;

      const centroid = centroidOfGeometry(building.geometry);
      if (!centroid) continue;

      if (isCanvasser) {
        const centroidPoint: Feature<Point> = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [centroid.longitude, centroid.latitude],
          },
        };

        if (!assignedTerritories.some((territory) => booleanPointInPolygon(centroidPoint, territory))) {
          continue;
        }
      }

      let nearest: DbAddress | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      let containsAddress = false;

      for (const address of addresses) {
        if (
          Math.abs(address.latitude - centroid.latitude) > 0.00025 ||
          Math.abs(address.longitude - centroid.longitude) > 0.00035
        ) {
          continue;
        }

        const point: Feature<Point> = {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [address.longitude, address.latitude],
          },
        };

        if (booleanPointInPolygon(point, building)) {
          containsAddress = true;
          nearest = address;
          nearestDistance = 0;
          break;
        }

        const distance = metersBetween(
          centroid.latitude,
          centroid.longitude,
          address.latitude,
          address.longitude,
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = address;
        }
      }

      // Previous version used 18 m. On normal Surrey lots that can incorrectly
      // match the next-door neighbour and hide a real missing house. Seven metres
      // is deliberately tighter: inside the footprint always matches; a point just
      // outside the house can still match, but a neighbouring house normally won't.
      const hasNearbyAddress = containsAddress || nearestDistance <= 7;
      if (hasNearbyAddress) {
        matched += 1;
        continue;
      }

      candidates.push({
        ...building,
        properties: {
          ...(building.properties ?? {}),
          candidate_id: String(building.properties?.OBJECTID ?? candidates.length + 1),
          centroid_latitude: centroid.latitude,
          centroid_longitude: centroid.longitude,
          nearest_address: nearest?.full_address ?? null,
          nearest_distance_m: Number.isFinite(nearestDistance)
            ? Math.round(nearestDistance * 10) / 10
            : null,
        },
      });
    }

    return NextResponse.json({
      candidates,
      matched,
      buildings: buildings.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not review building coverage." },
      { status: 500 },
    );
  }
}
