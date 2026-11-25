package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// exportFormatVersion is bumped whenever the shape of the export changes so a
// future import tool can tell old files from new ones.
const exportFormatVersion = 1

type exportUser struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Plan      string `json:"plan"`
	CreatedAt string `json:"created_at"`
}

type exportCanvas struct {
	Version  int             `json:"version"`
	Nodes    json.RawMessage `json:"nodes"`
	Edges    json.RawMessage `json:"edges"`
	Viewport json.RawMessage `json:"viewport"`
}

type exportSnapshot struct {
	Version       int             `json:"version"`
	CommitMessage string          `json:"commit_message"`
	Nodes         json.RawMessage `json:"nodes"`
	Edges         json.RawMessage `json:"edges"`
	CreatedAt     string          `json:"created_at"`
}

type exportCustomNode struct {
	Title       string `json:"title"`
	Tech        string `json:"tech"`
	Category    string `json:"category"`
	Description string `json:"description"`
	CodeType    string `json:"code_type"`
	RawCode     string `json:"raw_code"`
	CreatedAt   string `json:"created_at"`
}

type exportProject struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Visibility  string             `json:"visibility"`
	CreatedAt   string             `json:"created_at"`
	Canvas      *exportCanvas      `json:"canvas"`
	Snapshots   []exportSnapshot   `json:"snapshots"`
	CustomNodes []exportCustomNode `json:"custom_nodes"`
}

type exportTeam struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Slug      string          `json:"slug"`
	CreatedAt string          `json:"created_at"`
	Projects  []exportProject `json:"projects"`
}

type exportTemplate struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Category    string          `json:"category"`
	Tags        json.RawMessage `json:"tags"`
	Status      string          `json:"status"`
	Nodes       json.RawMessage `json:"nodes"`
	Edges       json.RawMessage `json:"edges"`
	Viewport    json.RawMessage `json:"viewport"`
	CreatedAt   string          `json:"created_at"`
}

type accountExport struct {
	FormatVersion int              `json:"format_version"`
	ExportedAt    string           `json:"exported_at"`
	User          exportUser       `json:"user"`
	Teams         []exportTeam     `json:"teams"`
	Templates     []exportTemplate `json:"templates"`
	NotIncluded   []string         `json:"not_included"`
}

// exportNotIncluded is written into every export so the file itself says what
// it leaves out; a user deciding whether it is safe to delete should not have
// to find that in the docs.
var exportNotIncluded = []string{
	"Cloud credentials and agent keys: stored encrypted and never leave the server. Re-enter them in a new project.",
	"Password hash, OAuth tokens and session data.",
	"Work you created inside teams owned by other people: it stays with that team when your account is deleted.",
	"Activity history and the avatar image.",
}

// rawJSON embeds a stored JSON text column as structured JSON. A column that
// does not hold valid JSON is emitted as a string instead of failing the whole
// export on one corrupt row.
func rawJSON(s string) json.RawMessage {
	if s != "" && json.Valid([]byte(s)) {
		return json.RawMessage(s)
	}
	b, _ := json.Marshal(s)
	return b
}

// GET /api/auth/export — the caller's data as a downloadable JSON file.
//
// Scope mirrors what DELETE /api/auth/account destroys: the profile, every
// team the user owns with its projects (canvas, snapshots, custom nodes), and
// the marketplace templates they published. Secrets are deliberately out of
// scope (see exportNotIncluded). Rate limited per user because the query fan-out
// is proportional to the size of the account.
func handleExportAccount(w http.ResponseWriter, r *http.Request) {
	user, ok := GetUserFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !exportLimiter.Allow(user.ID) {
		http.Error(w, "Too many export requests. Please wait a few minutes before trying again.", http.StatusTooManyRequests)
		return
	}

	out := accountExport{
		FormatVersion: exportFormatVersion,
		ExportedAt:    time.Now().UTC().Format(time.RFC3339),
		Teams:         []exportTeam{},
		Templates:     []exportTemplate{},
		NotIncluded:   exportNotIncluded,
	}

	fail := func(step string, err error) {
		log.Printf("[ACCOUNT] export %s failed at %s: %v\n", user.ID, step, err)
		http.Error(w, "Failed to build your export", http.StatusInternalServerError)
	}

	var createdAt sql.NullString
	if err := db.QueryRow("SELECT id, email, name, plan, created_at FROM users WHERE id = ?", user.ID).
		Scan(&out.User.ID, &out.User.Email, &out.User.Name, &out.User.Plan, &createdAt); err != nil {
		http.Error(w, "Account not found", http.StatusNotFound)
		return
	}
	out.User.CreatedAt = createdAt.String

	teamRows, err := db.Query("SELECT id, name, slug, created_at FROM teams WHERE owner_id = ? ORDER BY created_at, id", user.ID)
	if err != nil {
		fail("list teams", err)
		return
	}
	for teamRows.Next() {
		var t exportTeam
		var ts sql.NullString
		if err := teamRows.Scan(&t.ID, &t.Name, &t.Slug, &ts); err != nil {
			teamRows.Close()
			fail("scan team", err)
			return
		}
		t.CreatedAt = ts.String
		t.Projects = []exportProject{}
		out.Teams = append(out.Teams, t)
	}
	teamRows.Close()

	for i := range out.Teams {
		projects, err := exportTeamProjects(out.Teams[i].ID)
		if err != nil {
			fail("team projects", err)
			return
		}
		out.Teams[i].Projects = projects
	}

	tplRows, err := db.Query(`SELECT title, description, category, tags, status, nodes_json, edges_json, viewport_json, created_at
		FROM templates WHERE author_user_id = ? ORDER BY created_at, id`, user.ID)
	if err != nil {
		fail("list templates", err)
		return
	}
	for tplRows.Next() {
		var t exportTemplate
		var desc, ts sql.NullString
		var tags, nodes, edges, viewport string
		if err := tplRows.Scan(&t.Title, &desc, &t.Category, &tags, &t.Status, &nodes, &edges, &viewport, &ts); err != nil {
			tplRows.Close()
			fail("scan template", err)
			return
		}
		t.Description, t.CreatedAt = desc.String, ts.String
		t.Tags, t.Nodes, t.Edges, t.Viewport = rawJSON(tags), rawJSON(nodes), rawJSON(edges), rawJSON(viewport)
		out.Templates = append(out.Templates, t)
	}
	tplRows.Close()

	body, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fail("encode", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="whiparc-export-%s.json"`, time.Now().UTC().Format("2006-01-02")))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(body)
}

func exportTeamProjects(teamID string) ([]exportProject, error) {
	projects := []exportProject{}
	rows, err := db.Query("SELECT id, name, description, visibility, created_at FROM projects WHERE team_id = ? ORDER BY created_at, id", teamID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p exportProject
		var desc, ts sql.NullString
		if err := rows.Scan(&p.ID, &p.Name, &desc, &p.Visibility, &ts); err != nil {
			rows.Close()
			return nil, err
		}
		p.Description, p.CreatedAt = desc.String, ts.String
		p.Snapshots = []exportSnapshot{}
		p.CustomNodes = []exportCustomNode{}
		projects = append(projects, p)
	}
	rows.Close()

	for i := range projects {
		p := &projects[i]

		var c exportCanvas
		var nodes, edges, viewport string
		switch err := db.QueryRow("SELECT version, nodes_json, edges_json, viewport_json FROM canvas_states WHERE project_id = ?", p.ID).
			Scan(&c.Version, &nodes, &edges, &viewport); err {
		case nil:
			c.Nodes, c.Edges, c.Viewport = rawJSON(nodes), rawJSON(edges), rawJSON(viewport)
			p.Canvas = &c
		case sql.ErrNoRows:
			// A project that was never opened has no canvas yet.
		default:
			return nil, err
		}

		srows, err := db.Query("SELECT version, commit_message, nodes_json, edges_json, created_at FROM canvas_snapshots WHERE project_id = ? ORDER BY version", p.ID)
		if err != nil {
			return nil, err
		}
		for srows.Next() {
			var s exportSnapshot
			var msg, ts sql.NullString
			var n, e string
			if err := srows.Scan(&s.Version, &msg, &n, &e, &ts); err != nil {
				srows.Close()
				return nil, err
			}
			s.CommitMessage, s.CreatedAt = msg.String, ts.String
			s.Nodes, s.Edges = rawJSON(n), rawJSON(e)
			p.Snapshots = append(p.Snapshots, s)
		}
		srows.Close()

		crows, err := db.Query("SELECT title, tech, category, description, code_type, raw_code, created_at FROM custom_nodes WHERE project_id = ? ORDER BY created_at, id", p.ID)
		if err != nil {
			return nil, err
		}
		for crows.Next() {
			var cn exportCustomNode
			var desc, ts sql.NullString
			if err := crows.Scan(&cn.Title, &cn.Tech, &cn.Category, &desc, &cn.CodeType, &cn.RawCode, &ts); err != nil {
				crows.Close()
				return nil, err
			}
			cn.Description, cn.CreatedAt = desc.String, ts.String
			p.CustomNodes = append(p.CustomNodes, cn)
		}
		crows.Close()
	}
	return projects, nil
}
