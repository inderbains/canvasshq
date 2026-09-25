"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const organizationName = String(formData.get("organizationName") || "").trim();
  const campaignName = String(formData.get("campaignName") || "").trim();
  const districtName = String(formData.get("districtName") || "Surrey North").trim();
  const electionDate = String(formData.get("electionDate") || "") || null;

  if (!organizationName || !campaignName || !districtName) {
    throw new Error("Organization, campaign and district names are required.");
  }

  const slug = `${organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: organizationName, slug, created_by: authData.user.id })
    .select("id")
    .single();
  if (orgError) throw orgError;

  const { error: memberError } = await supabase.from("organization_members").insert({
    organization_id: org.id,
    user_id: authData.user.id,
    role: "owner",
  });
  if (memberError) throw memberError;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: org.id,
      name: campaignName,
      election_type: "provincial",
      election_date: electionDate,
      is_active: true,
    })
    .select("id")
    .single();
  if (campaignError) throw campaignError;

  const { error: districtError } = await supabase.from("districts").insert({
    organization_id: org.id,
    campaign_id: campaign.id,
    name: districtName,
    jurisdiction: "British Columbia",
    source: "DataBC 2023 electoral redistribution",
  });
  if (districtError) throw districtError;

  redirect("/dashboard");
}
