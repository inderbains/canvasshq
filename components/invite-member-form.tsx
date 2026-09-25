"use client";

import { FormEvent, useState } from "react";
import type { OrgRole } from "@/lib/types";

const roles: { value: OrgRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "coordinator", label: "Coordinator" },
  { value: "team_lead", label: "Team lead" },
  { value: "canvasser", label: "Canvasser / volunteer" },
  { value: "viewer", label: "Viewer" },
];

export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    const response = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        email: String(form.get("email") || ""),
        role: String(form.get("role") || "canvasser"),
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error || "Could not send invitation.");
      return;
    }
    setMessage("Invitation sent.");
    e.currentTarget.reset();
    window.setTimeout(() => window.location.reload(), 800);
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label>Email</label><input name="email" type="email" required placeholder="volunteer@example.com" /></div>
      <div className="field"><label>Role</label><select name="role" defaultValue="canvasser">{roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
      {message ? <div className={message === "Invitation sent." ? "alert success" : "alert error"}>{message}</div> : null}
      <button className="btn" disabled={loading}>{loading ? "Sending…" : "Send invitation"}</button>
    </form>
  );
}
