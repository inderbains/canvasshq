"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);

    const supabase = createClient();

    await supabase.auth.signOut();

    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      style={{
        width: "100%",
        padding: "11px 12px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.06)",
        color: "white",
        fontWeight: 600,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: "12px",
      }}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
