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

// Mirrors apps/api/templates.go's Template struct. nodes_json/edges_json/
// viewport_json are only populated on the single-template detail response
// (GET /api/templates/{id}), never on the list response.
export interface Template {
  id: string;
  source_project_id?: string;
  author_user_id: string;
  author_name?: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  install_count: number;
  created_at: string;
  updated_at: string;
  nodes_json?: string;
  edges_json?: string;
  viewport_json?: string;
}

export interface TemplateListResponse {
  templates: Template[];
  total: number;
  limit: number;
  offset: number;
}
