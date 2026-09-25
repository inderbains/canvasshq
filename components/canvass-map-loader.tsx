"use client";

import dynamic from "next/dynamic";
import type { Feature, Polygon } from "geojson";
import type { AddressPoint } from "@/lib/types";

const CanvassMap = dynamic(() => import("@/components/canvass-map"), {
  ssr: false,
  loading: () => (
    <div
      className="map-canvas"
      style={{ display: "grid", placeItems: "center" }}
    >
      Loading map…
    </div>
  ),
});

export function CanvassMapLoader({
  addresses,
  campaignId,
  organizationId,
  districtId,
  readOnly = false,
  focusAssigned = false,
  assignedTerritories = [],
  canManageCoverage = false,
}: {
  addresses: AddressPoint[];
  campaignId: string;
  organizationId: string;
  districtId: string;
  readOnly?: boolean;
  focusAssigned?: boolean;
  assignedTerritories?: Feature<Polygon>[];
  canManageCoverage?: boolean;
}) {
  return (
    <CanvassMap
      addresses={addresses}
      campaignId={campaignId}
      organizationId={organizationId}
      districtId={districtId}
      readOnly={readOnly}
      focusAssigned={focusAssigned}
      assignedTerritories={assignedTerritories}
      canManageCoverage={canManageCoverage}
    />
  );
}
