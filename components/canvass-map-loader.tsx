"use client";

import dynamic from "next/dynamic";
import type { AddressPoint } from "@/lib/types";

const CanvassMap = dynamic(() => import("@/components/canvass-map"), {
  ssr: false,
  loading: () => <div className="map-canvas" style={{ display: "grid", placeItems: "center" }}>Loading map…</div>,
});

export function CanvassMapLoader({ addresses, campaignId, readOnly = false }: { addresses: AddressPoint[]; campaignId: string; readOnly?: boolean }) {
  return <CanvassMap addresses={addresses} campaignId={campaignId} readOnly={readOnly} />;
}
