export type OrgRole =
  | "owner"
  | "admin"
  | "coordinator"
  | "team_lead"
  | "canvasser"
  | "viewer";

export type CanvassOutcome =
  | "not_visited"
  | "no_answer"
  | "contacted"
  | "refused"
  | "follow_up"
  | "completed";

export type AddressPoint = {
  id: string;
  full_address: string;
  house_number: number | null;
  road_name: string | null;
  latitude: number;
  longitude: number;
  latest_outcome?: CanvassOutcome | null;
  assigned_to?: string | null;
};

export type Workspace = {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  campaignId: string | null;
  campaignName: string | null;
  districtId: string | null;
  districtName: string | null;
};
