"use client";

import { useState } from "react";

export function ImportButton({ organizationId, campaignId, districtId }: { organizationId: string; campaignId: string; districtId: string }) {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function runImport() {
    setLoading(true);
    setStatus("Loading official boundary and Surrey address points…");
    const response = await fetch("/api/import/surrey-north", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, campaignId, districtId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || "Import failed");
      setLoading(false);
      return;
    }
    setStatus(`Imported ${data.imported.toLocaleString()} addresses inside Surrey North.`);
    setLoading(false);
    window.setTimeout(() => window.location.reload(), 900);
  }

  return (
    <div>
      <button className="btn" disabled={loading} onClick={runImport}>{loading ? "Importing…" : "Sync official Surrey North addresses"}</button>
      {status ? <div className="alert" style={{ marginTop: 10 }}>{status}</div> : null}
    </div>
  );
}
