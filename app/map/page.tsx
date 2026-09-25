import { redirect } from "next/navigation";
import type { Feature, Polygon } from "geojson";
import { AppShell } from "@/components/app-shell";
import { CanvassMapLoader } from "@/components/canvass-map-loader";
import { ImportButton } from "@/components/import-button";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { fetchAllAddressStatus } from "@/lib/data";

export default async function MapPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");

  if (!workspace.campaignId || !workspace.districtId) {
    return (
      <AppShell workspace={workspace} title="Canvass map">
        <div className="alert error">Create a campaign and district first.</div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  const isCanvasser = workspace.role === "canvasser";

  const addresses = await fetchAllAddressStatus(
    supabase,
    workspace.campaignId,
    100000,
    isCanvasser ? userId : undefined,
  );

  let assignedTerritories: Feature<Polygon>[] = [];

  if (isCanvasser && userId) {
    const { data: assignments } = await supabase
      .from("assignments")
      .select("territory_id")
      .eq("campaign_id", workspace.campaignId)
      .eq("assigned_to", userId)
      .eq("status", "assigned");

    const territoryIds = (assignments ?? [])
      .map((assignment) => assignment.territory_id)
      .filter((id): id is string => Boolean(id));

    if (territoryIds.length) {
      const { data: territories } = await supabase
        .from("territories")
        .select("boundary_geojson")
        .in("id", territoryIds);

      assignedTerritories = (territories ?? [])
        .map((territory) => territory.boundary_geojson as Feature<Polygon> | null)
        .filter((boundary): boundary is Feature<Polygon> => Boolean(boundary?.geometry));
    }
  }

  const canImport = ["owner", "admin"].includes(workspace.role);
  const canManageCoverage = [
    "owner",
    "admin",
    "coordinator",
    "team_lead",
    "canvasser",
  ].includes(workspace.role);
  const readOnly = workspace.role === "viewer";

  return (
    <AppShell workspace={workspace} title={isCanvasser ? "My territory" : "Canvass map"}>
      <div className="page-head">
        <div>
          <h1>{isCanvasser ? "My assigned territory" : workspace.districtName}</h1>
          <p>
            {isCanvasser
              ? "Only doors assigned to your account are shown."
              : "Official civic address points plus optional building coverage review."}
          </p>
        </div>

        <div className="actions">
          {canImport ? (
            <ImportButton
              organizationId={workspace.organizationId}
              campaignId={workspace.campaignId}
              districtId={workspace.districtId}
            />
          ) : null}
        </div>
      </div>

      <CanvassMapLoader
        addresses={addresses}
        campaignId={workspace.campaignId}
        organizationId={workspace.organizationId}
        districtId={workspace.districtId}
        readOnly={readOnly}
        focusAssigned={isCanvasser}
        assignedTerritories={assignedTerritories}
        canManageCoverage={canManageCoverage}
      />
    </AppShell>
  );
}
