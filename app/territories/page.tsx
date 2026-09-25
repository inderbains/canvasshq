import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TerritoryMapLoader } from "@/components/territory-map-loader";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";
import { fetchAllAddressStatus } from "@/lib/data";

export default async function TerritoriesPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");
  const supabase = await createClient();

  if (!workspace.campaignId) {
    return <AppShell workspace={workspace} title="Territories"><div className="alert error">Create a campaign first.</div></AppShell>;
  }

  const [addresses, territoriesResult, membersResult] = await Promise.all([
    fetchAllAddressStatus(supabase, workspace.campaignId),
    supabase.from("territories").select("id,name,status,created_at").eq("campaign_id", workspace.campaignId).order("name"),
    supabase.from("organization_member_directory").select("user_id,email,display_name,role").eq("organization_id", workspace.organizationId).eq("is_active", true),
  ]);

  const territories = territoriesResult.data ?? [];
  const members = membersResult.data ?? [];
  const canManage = ["owner", "admin", "coordinator", "team_lead"].includes(workspace.role);

  return (
    <AppShell workspace={workspace} title="Territories">
      <div className="page-head"><div><h1>Territories & assignments</h1><p>Draw an area, attach every address inside it, and optionally assign the territory to a team member.</p></div></div>
      {canManage ? (
        <TerritoryMapLoader organizationId={workspace.organizationId} campaignId={workspace.campaignId} addresses={addresses} members={members} />
      ) : <div className="alert">Your role can view territories but cannot create assignments.</div>}
      <div className="card panel" style={{ marginTop: 18 }}>
        <h2>Existing territories</h2>
        <div className="table-wrap">
          <table><thead><tr><th>Territory</th><th>Status</th><th>Created</th></tr></thead><tbody>
            {territories.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.status}</td><td>{new Date(t.created_at).toLocaleDateString()}</td></tr>)}
            {territories.length === 0 ? <tr><td colSpan={3} className="muted">No territories yet. Draw the first one above.</td></tr> : null}
          </tbody></table>
        </div>
      </div>
    </AppShell>
  );
}
