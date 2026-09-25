import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddressPoint } from "@/lib/types";

export async function fetchAllAddressStatus(supabase: SupabaseClient, campaignId: string, maxRows = 100000, assignedTo?: string): Promise<AddressPoint[]> {
  const all: AddressPoint[] = [];
  const pageSize = 1000;
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase
      .from("address_status_view")
      .select("id,full_address,house_number,road_name,latitude,longitude,latest_outcome,assigned_to")
      .eq("campaign_id", campaignId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    const { data, error } = await query;
    if (error) throw error;
    all.push(...((data ?? []) as AddressPoint[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}
