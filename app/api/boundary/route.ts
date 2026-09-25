import { NextResponse } from "next/server";

const BC_BOUNDARY_LAYER = "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_admin_boundaries/MapServer/74/query";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const district = url.searchParams.get("district") || "Surrey North";
  const params = new URLSearchParams({
    where: `ED_NAME='${district.replaceAll("'", "''")}'`,
    outFields: "ED_NAME,ED_ABBREVIATION",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  const response = await fetch(`${BC_BOUNDARY_LAYER}?${params.toString()}`, { next: { revalidate: 86400 } });
  if (!response.ok) return NextResponse.json({ error: "Boundary service unavailable" }, { status: 502 });
  const data = await response.json();
  return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=86400" } });
}
