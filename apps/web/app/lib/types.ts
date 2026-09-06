// Shared API-response shapes used by multiple pages/components (dashboard,
// workspace, project settings) so they don't drift into incompatible
// locally-declared duplicates.

export interface Project {
  id: string;
  team_id: string;
  name: string;
  description: string;
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  user_role: string;
}
