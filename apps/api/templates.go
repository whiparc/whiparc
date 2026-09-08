package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Template is a publicly browsable, forkable snapshot of a project's canvas.
// Unlike projects.visibility=PUBLIC (which lists a live, joinable project),
// a template is a frozen copy: publishing one does not change who can edit
// the source project, and editing the source project after publishing does
// not change the template. See product-memory 01.3 (whiparc/cloud) for the
// full data-model rationale.
type Template struct {
	ID              string    `json:"id"`
	SourceProjectID *string   `json:"source_project_id,omitempty"`
	AuthorUserID    string    `json:"author_user_id"`
	AuthorName      string    `json:"author_name,omitempty"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	Category        string    `json:"category"`
	Tags            []string  `json:"tags"`
	InstallCount    int       `json:"install_count"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`

	// Canvas payload — only populated on the single-template detail
	// response, omitted from list responses to keep the catalog page's
	// payload light (list can return 100 templates; nobody needs their
	// full node graphs just to render a card grid).
	NodesJSON    string `json:"nodes_json,omitempty"`
	EdgesJSON    string `json:"edges_json,omitempty"`
	ViewportJSON string `json:"viewport_json,omitempty"`
}

func parseDBTimestamp(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t, _ = time.Parse("2006-01-02 15:04:05", s)
	}
	return t
}

func scanTemplateTags(tagsJSON string) []string {
	tags := []string{}
	_ = json.Unmarshal([]byte(tagsJSON), &tags)
	return tags
}

// GET /api/templates?q=&category=&tag=&sort=popular|newest&limit=&offset=
// Public — no auth required. Only PUBLISHED templates are ever listed here.
func handleListTemplates(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	tag := strings.TrimSpace(r.URL.Query().Get("tag"))
	sort := r.URL.Query().Get("sort")

	limit := 24
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
		limit = v
	}
	if limit > 100 {
		limit = 100
	}
	offset := 0
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v >= 0 {
		offset = v
	}

	where := []string{"t.status = 'PUBLISHED'"}
	args := []any{}

	if q != "" {
		where = append(where, "(t.title LIKE ? OR t.description LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if category != "" {
		where = append(where, "t.category = ?")
		args = append(args, category)
	}
	if tag != "" {
		// Tags are stored as a JSON array TEXT column (no separate tags
		// table yet — see product-memory 07.2 "Technical Pitfalls" for
		// why a LIKE-on-JSON match is a known-limited stopgap: it can
		// false-positive on tag substrings, e.g. tag=aws also matching a
		// stored tag "aws-lambda"). Fine for the catalog's current scale.
		where = append(where, "t.tags LIKE ?")
		args = append(args, "%\""+tag+"\"%")
	}

	orderBy := "t.created_at DESC"
	if sort == "popular" {
		orderBy = "t.install_count DESC, t.created_at DESC"
	}

	countQuery := "SELECT COUNT(*) FROM templates t WHERE " + strings.Join(where, " AND ")
	var total int
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	listQuery := fmt.Sprintf(`
		SELECT t.id, t.source_project_id, t.author_user_id, COALESCE(u.name, ''), t.title, t.description,
		       t.category, t.tags, t.install_count, t.created_at, t.updated_at
		FROM templates t
		LEFT JOIN users u ON u.id = t.author_user_id
		WHERE %s
		ORDER BY %s
		LIMIT ? OFFSET ?`, strings.Join(where, " AND "), orderBy)

	rows, err := db.Query(listQuery, append(append([]any{}, args...), limit, offset)...)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	templates := []Template{}
	for rows.Next() {
		var t Template
		var sourceProjectID sql.NullString
		var tagsJSON, createdAtStr, updatedAtStr string
		err := rows.Scan(&t.ID, &sourceProjectID, &t.AuthorUserID, &t.AuthorName, &t.Title, &t.Description,
			&t.Category, &tagsJSON, &t.InstallCount, &createdAtStr, &updatedAtStr)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if sourceProjectID.Valid {
			t.SourceProjectID = &sourceProjectID.String
		}
		t.Tags = scanTemplateTags(tagsJSON)
		t.CreatedAt = parseDBTimestamp(createdAtStr)
		t.UpdatedAt = parseDBTimestamp(updatedAtStr)
		templates = append(templates, t)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"templates": templates,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
	})
}

// GET /api/templates/{id} — public, includes the full canvas payload so a
// future "Get Started" flow (Phase 3) can fork it without a second call.
func handleGetTemplateByID(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var t Template
	var sourceProjectID sql.NullString
	var tagsJSON, createdAtStr, updatedAtStr string
	err := db.QueryRow(`
		SELECT t.id, t.source_project_id, t.author_user_id, COALESCE(u.name, ''), t.title, t.description,
		       t.category, t.tags, t.install_count, t.created_at, t.updated_at,
		       t.nodes_json, t.edges_json, t.viewport_json
		FROM templates t
		LEFT JOIN users u ON u.id = t.author_user_id
		WHERE t.id = ? AND t.status = 'PUBLISHED'`, id).Scan(
		&t.ID, &sourceProjectID, &t.AuthorUserID, &t.AuthorName, &t.Title, &t.Description,
		&t.Category, &tagsJSON, &t.InstallCount, &createdAtStr, &updatedAtStr,
		&t.NodesJSON, &t.EdgesJSON, &t.ViewportJSON)
	if err == sql.ErrNoRows {
		http.Error(w, "Template not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if sourceProjectID.Valid {
		t.SourceProjectID = &sourceProjectID.String
	}
	t.Tags = scanTemplateTags(tagsJSON)
	t.CreatedAt = parseDBTimestamp(createdAtStr)
	t.UpdatedAt = parseDBTimestamp(updatedAtStr)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(t)
}

// seedOfficialTemplates seeds a handful of curated, official templates on
// first boot so /templates has content before the publish flow (Phase 5)
// ships. Officially-authored templates have source_project_id = NULL and
// author_user_id = "whiparc_official" (a sentinel, not a real users row —
// deliberately not FK'd to users so seeding doesn't depend on any account
// existing yet). Idempotent: no-ops if templates already exist.
//
// NOTE: the node/edge graphs below are intentionally minimal placeholders
// (customNode entries with plausible labels, not fully-parameterized nodes
// matching every field the canvas editor can produce). They're enough to
// exercise list/detail/fork end-to-end; richer, hand-authored graphs should
// replace them before this feature is publicly launched. Tracked in
// product-memory 08.1 (Non-Implemented & Mocked Features).
func seedOfficialTemplates() error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM templates").Scan(&count); err != nil {
		return fmt.Errorf("failed to count templates: %w", err)
	}
	if count > 0 {
		return nil
	}

	type seed struct {
		title, description, category string
		tags                          []string
		nodes                         []map[string]any
		edges                         []map[string]any
	}

	seeds := []seed{
		{
			title:       "AWS Web Server + Security Group",
			description: "A single EC2 instance behind a security group — the fastest way to get a public web server running on AWS.",
			category:    "AWS",
			tags:        []string{"aws", "ec2", "beginner"},
			nodes: []map[string]any{
				{"id": "sg_1", "type": "customNode", "position": map[string]int{"x": 100, "y": 100},
					"data": map[string]any{"label": "Security Group", "tech": "Terraform", "categoryLabel": "AWS Resource", "description": "Allows HTTP/HTTPS/SSH", "status": "Validated"}},
				{"id": "web_1", "type": "customNode", "position": map[string]int{"x": 400, "y": 100},
					"data": map[string]any{"label": "Web Server", "tech": "Terraform", "categoryLabel": "AWS Resource", "description": "EC2 instance", "status": "Validated"}},
			},
			edges: []map[string]any{
				{"id": "e_sg_web", "source": "sg_1", "target": "web_1"},
			},
		},
		{
			title:       "Three-Tier Web App (EC2 + RDS)",
			description: "Web server, application server, and a managed Postgres database — a classic three-tier starting point.",
			category:    "AWS",
			tags:        []string{"aws", "ec2", "rds", "postgres"},
			nodes: []map[string]any{
				{"id": "web_1", "type": "customNode", "position": map[string]int{"x": 100, "y": 100},
					"data": map[string]any{"label": "Web Server", "tech": "Terraform", "categoryLabel": "AWS Resource", "status": "Validated"}},
				{"id": "app_1", "type": "customNode", "position": map[string]int{"x": 400, "y": 100},
					"data": map[string]any{"label": "App Server", "tech": "Terraform", "categoryLabel": "AWS Resource", "status": "Validated"}},
				{"id": "db_1", "type": "customNode", "position": map[string]int{"x": 700, "y": 100},
					"data": map[string]any{"label": "Postgres (RDS)", "tech": "Terraform", "categoryLabel": "AWS Resource", "status": "Validated"}},
			},
			edges: []map[string]any{
				{"id": "e_web_app", "source": "web_1", "target": "app_1"},
				{"id": "e_app_db", "source": "app_1", "target": "db_1"},
			},
		},
		{
			title:       "Kubernetes Deployment + Service",
			description: "A Deployment fronted by a Service — the minimal building block for running a containerized app on Kubernetes.",
			category:    "Kubernetes",
			tags:        []string{"kubernetes", "k8s", "beginner"},
			nodes: []map[string]any{
				{"id": "deploy_1", "type": "customNode", "position": map[string]int{"x": 100, "y": 100},
					"data": map[string]any{"label": "Deployment", "tech": "Kubernetes", "categoryLabel": "K8s Resource", "status": "Validated"}},
				{"id": "svc_1", "type": "customNode", "position": map[string]int{"x": 400, "y": 100},
					"data": map[string]any{"label": "Service", "tech": "Kubernetes", "categoryLabel": "K8s Resource", "status": "Validated"}},
			},
			edges: []map[string]any{
				{"id": "e_deploy_svc", "source": "deploy_1", "target": "svc_1"},
			},
		},
		{
			title:       "Ansible Provisioned App Server",
			description: "A target host provisioned by an Ansible playbook — install dependencies and deploy an app in one pass.",
			category:    "Ansible",
			tags:        []string{"ansible", "provisioning"},
			nodes: []map[string]any{
				{"id": "target_1", "type": "customNode", "position": map[string]int{"x": 100, "y": 100},
					"data": map[string]any{"label": "Target Host", "tech": "Target", "categoryLabel": "Cloud Target", "status": "Validated"}},
				{"id": "playbook_1", "type": "customNode", "position": map[string]int{"x": 400, "y": 100},
					"data": map[string]any{"label": "App Provisioning", "tech": "Ansible", "categoryLabel": "Ansible Task", "status": "Validated"}},
			},
			edges: []map[string]any{
				{"id": "e_target_playbook", "source": "target_1", "target": "playbook_1"},
			},
		},
	}

	for _, s := range seeds {
		id := fmt.Sprintf("tmpl_%d", time.Now().UnixNano())
		nodesJSON, err := json.Marshal(s.nodes)
		if err != nil {
			return fmt.Errorf("failed to marshal seed nodes for %q: %w", s.title, err)
		}
		edgesJSON, err := json.Marshal(s.edges)
		if err != nil {
			return fmt.Errorf("failed to marshal seed edges for %q: %w", s.title, err)
		}
		tagsJSON, err := json.Marshal(s.tags)
		if err != nil {
			return fmt.Errorf("failed to marshal seed tags for %q: %w", s.title, err)
		}

		_, err = db.Exec(`
			INSERT INTO templates (id, source_project_id, author_user_id, title, description, category, tags, nodes_json, edges_json, viewport_json, status)
			VALUES (?, NULL, 'whiparc_official', ?, ?, ?, ?, ?, ?, '{"x":0,"y":0,"zoom":1}', 'PUBLISHED')`,
			id, s.title, s.description, s.category, string(tagsJSON), string(nodesJSON), string(edgesJSON))
		if err != nil {
			return fmt.Errorf("failed to seed template %q: %w", s.title, err)
		}
		// Stagger nanosecond-based IDs so seeds don't collide when the
		// loop runs faster than the clock's resolution on some platforms.
		time.Sleep(time.Microsecond)
	}

	return nil
}
