import Link from "next/link";
import type { Workspace } from "@/lib/types";
import SignOutButton from "@/components/sign-out-button";

export function AppShell({
  workspace,
  title,
  children,
}: {
  workspace: Workspace;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge">C</span>
          CanvassHQ
        </div>

        <div className="workspace-card">
          <small>Workspace</small>

          <strong>
            {workspace.organizationName}
          </strong>

          <small style={{ marginTop: 8 }}>
            {workspace.campaignName ??
              "No campaign yet"}
          </small>
        </div>

        <nav className="nav">
          <Link href="/dashboard">
            Dashboard
          </Link>

          <Link href="/map">
            Canvass map
          </Link>

          <Link href="/territories">
            Territories
          </Link>

          <Link href="/team">
            Team & access
          </Link>
        </nav>

        <div className="sidebar-bottom">
          <SignOutButton />

          <div>
            Multi-tenant workspace • v0.1
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {title}
          </div>

          <span className="role-pill">
            {workspace.role.replace("_", " ")}
          </span>
        </header>

        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
