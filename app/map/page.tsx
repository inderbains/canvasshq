import { redirect } from "next/navigation";
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
  const assignedTo = workspace.role === "canvasser" ? authData.user?.id : undefined;
  const addresses = await fetchAllAddressStatus(supabase, workspace.campaignId, 100000, assignedTo);
  const canImport = ["owner", "admin"].includes(workspace.role);
  const readOnly = workspace.role === "viewer";

  return (
    <AppShell workspace={workspace} title="Canvass map">
      <div className="page-head">
        <div>
          <h1>{workspace.districtName}</h1>
          <p>Official boundary plus civic address points. Select a door to record a visit.</p>
        </div>
        <div className="actions">
          {canImport ? <ImportButton organizationId={workspace.organizationId} campaignId={workspace.campaignId} districtId={workspace.districtId} /> : null}
        </div>
      </div>
      <CanvassMapLoader addresses={addresses} campaignId={workspace.campaignId} readOnly={readOnly} />
    </AppShell>
  );
}
