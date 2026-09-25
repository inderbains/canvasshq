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
  readOnly = false,
  focusAssigned = false,
  assignedTerritories = [],
}: {
  addresses: AddressPoint[];
  campaignId: string;
  readOnly?: boolean;
  focusAssigned?: boolean;
  assignedTerritories?: Feature<Polygon>[];
}) {
  return (
    <CanvassMap
      addresses={addresses}
      campaignId={campaignId}
      readOnly={readOnly}
      focusAssigned={focusAssigned}
      assignedTerritories={assignedTerritories}
    />
  );
}
