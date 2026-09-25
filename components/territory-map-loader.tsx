"use client";

import dynamic from "next/dynamic";
import type { AddressPoint } from "@/lib/types";

const TerritoryMap = dynamic(() => import("@/components/territory-map"), {
  ssr: false,
  loading: () => <div className="map-canvas" style={{ display: "grid", placeItems: "center" }}>Loading territory map…</div>,
});

export function TerritoryMapLoader(props: {
  organizationId: string;
  campaignId: string;
  addresses: AddressPoint[];
  members: { user_id: string; email: string | null; display_name: string | null; role: string }[];
}) {
  return <TerritoryMap {...props} />;
}
