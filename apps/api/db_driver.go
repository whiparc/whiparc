package main

import (
	"database/sql"
	"strconv"
	"strings"
)

// dbHandle wraps *sql.DB so that the ~90 hand-written `?`-placeholder queries
// scattered across this package (SQLite's positional style) keep working
// unmodified against Postgres, whose driver requires `$1, $2, ...`. Query,
// QueryRow and Exec are overridden here and shadow the embedded *sql.DB's
// methods of the same name (Go method resolution prefers the outer type), so
// every existing `db.Query(...)`/`db.Exec(...)` call site in the codebase is
// rebound transparently — everything else (Close, Ping, SetMaxOpenConns, ...)
// still promotes straight through to the embedded *sql.DB. See
// rebindSQL for the actual dialect translation.
type dbHandle struct {
	*sql.DB
	backend string // "sqlite" (default) or "postgres"
}

// dbTx is the transaction-scoped counterpart of dbHandle: db.Begin() returns
// one of these instead of a raw *sql.Tx so that tx.Exec/Query/QueryRow calls
// inside transactions get the same rebinding. Commit/Rollback promote
// unchanged from the embedded *sql.Tx.
type dbTx struct {
	*sql.Tx
	backend string
}

// sqlExecer is satisfied by both *dbTx and (for tests or future callers)
// *sql.Tx directly, so helpers that only need to run an INSERT/UPDATE inside
// a caller-supplied transaction don't have to know which wrapper they got.
type sqlExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func (d *dbHandle) Exec(query string, args ...any) (sql.Result, error) {
	return d.DB.Exec(rebindSQL(d.backend, query), args...)
}

func (d *dbHandle) Query(query string, args ...any) (*sql.Rows, error) {
	return d.DB.Query(rebindSQL(d.backend, query), args...)
}

func (d *dbHandle) QueryRow(query string, args ...any) *sql.Row {
	return d.DB.QueryRow(rebindSQL(d.backend, query), args...)
}

func (d *dbHandle) Begin() (*dbTx, error) {
	tx, err := d.DB.Begin()
	if err != nil {
		return nil, err
	}
	return &dbTx{Tx: tx, backend: d.backend}, nil
}

func (t *dbTx) Exec(query string, args ...any) (sql.Result, error) {
	return t.Tx.Exec(rebindSQL(t.backend, query), args...)
}

func (t *dbTx) Query(query string, args ...any) (*sql.Rows, error) {
	return t.Tx.Query(rebindSQL(t.backend, query), args...)
}

func (t *dbTx) QueryRow(query string, args ...any) *sql.Row {
	return t.Tx.QueryRow(rebindSQL(t.backend, query), args...)
}

// rebindSQL translates the SQLite-flavored SQL text used throughout this
// package into Postgres-compatible text. It's a no-op for the sqlite
// backend, which is what every query in the codebase was written for.
//
// For postgres it:
//   - rewrites `?` positional placeholders to `$1, $2, ...` (skipping `?`
//     inside single-quoted string literals, so no query text needs editing
//     just because it uses more or fewer placeholders than another one)
//   - swaps the SQLite function datetime('now') for Postgres's now()
//   - swaps case-insensitive SQLite LIKE for Postgres's ILIKE, since the
//     templates search/tag filters rely on SQLite's default LIKE being
//     case-insensitive for ASCII
//
// SQLite-only statement *shapes* that have no mechanical text-substitution
// equivalent (INSERT OR REPLACE / INSERT OR IGNORE, PRAGMA/sqlite_master
// introspection in the legacy migration functions) are handled by branching
// at their call sites instead of here.
func rebindSQL(backend, query string) string {
	if backend != "postgres" {
		return query
	}
	query = strings.ReplaceAll(query, "datetime('now')", "now()")
	query = strings.ReplaceAll(query, " LIKE ", " ILIKE ")
	if !strings.ContainsRune(query, '?') {
		return query
	}

	var b strings.Builder
	b.Grow(len(query) + 8)
	n := 0
	inString := false
	for i := 0; i < len(query); i++ {
		c := query[i]
		switch {
		case c == '\'':
			inString = !inString
			b.WriteByte(c)
		case c == '?' && !inString:
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}

// sqliteSchemaSQL is the single source of truth for the schema, written in
// SQLite's dialect since that's the codebase's original and still-default
// backend. pgSchema derives the Postgres equivalent from this at startup
// (see main.go) instead of a hand-maintained second copy, so the two can
// never quietly drift apart from each other.
const sqliteSchemaSQL = `
CREATE TABLE IF NOT EXISTS pipeline_runs (
	id TEXT PRIMARY KEY,
	status TEXT NOT NULL,
	logs TEXT NOT NULL,
	canvas TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT,
	name TEXT NOT NULL,
	plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'PRO', 'ENTERPRISE')),
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS teams (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT UNIQUE NOT NULL,
	owner_id TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS team_members (
	id TEXT PRIMARY KEY,
	team_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
	joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(team_id, user_id),
	FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	team_id TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT,
	visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'TEAM', 'PUBLIC')),
	created_by TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS project_members (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
	added_by TEXT NOT NULL,
	joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(project_id, user_id),
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS project_join_requests (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	user_id TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
	note TEXT,
	reviewed_by TEXT,
	requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	reviewed_at DATETIME,
	UNIQUE(project_id, user_id, status),
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS invitations (
	id TEXT PRIMARY KEY,
	team_id TEXT NOT NULL,
	project_id TEXT,
	email TEXT NOT NULL,
	role TEXT NOT NULL,
	token TEXT UNIQUE NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED')),
	invited_by TEXT NOT NULL,
	expires_at DATETIME NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
	FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS canvas_states (
	project_id TEXT PRIMARY KEY,
	version INTEGER NOT NULL DEFAULT 1,
	nodes_json TEXT NOT NULL,
	edges_json TEXT NOT NULL,
	viewport_json TEXT NOT NULL,
	updated_by TEXT NOT NULL,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS canvas_snapshots (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	version INTEGER NOT NULL,
	commit_message TEXT,
	nodes_json TEXT NOT NULL,
	edges_json TEXT NOT NULL,
	created_by TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS custom_nodes (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	created_by TEXT NOT NULL,
	title TEXT NOT NULL,
	tech TEXT NOT NULL CHECK (tech IN ('Terraform', 'Ansible', 'Kubernetes')),
	category TEXT NOT NULL DEFAULT 'Custom Blocks',
	description TEXT,
	code_type TEXT NOT NULL CHECK (code_type IN ('tf', 'yml', 'yaml')),
	raw_code TEXT NOT NULL,
	parsed_meta_json TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS oauth_identities (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
	provider_user_id TEXT NOT NULL,
	email TEXT,
	access_token TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(provider, provider_user_id),
	UNIQUE(user_id, provider),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cloud_credentials (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	provider TEXT NOT NULL CHECK (provider IN ('AWS', 'GCP', 'SSH', 'GITHUB')),
	name TEXT NOT NULL,
	encrypted_data BLOB NOT NULL,
	nonce BLOB NOT NULL,
	auth_tag BLOB NOT NULL,
	key_fingerprint TEXT NOT NULL,
	created_by TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS paired_agents (
	id TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	agent_id TEXT UNIQUE NOT NULL,
	name TEXT NOT NULL,
	public_key TEXT NOT NULL,
	encrypted_private_key BLOB NOT NULL,
	nonce BLOB NOT NULL,
	auth_tag BLOB NOT NULL,
	key_fingerprint TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED', 'DISCONNECTED')),
	created_by TEXT NOT NULL,
	registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	last_seen_at DATETIME,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
	FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS agent_pairing_tokens (
	token_hash TEXT PRIMARY KEY,
	project_id TEXT NOT NULL,
	agent_id TEXT,
	issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	revoked_at DATETIME,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS templates (
	id TEXT PRIMARY KEY,
	source_project_id TEXT,
	author_user_id TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT,
	category TEXT NOT NULL DEFAULT 'General',
	tags TEXT NOT NULL DEFAULT '[]',
	nodes_json TEXT NOT NULL,
	edges_json TEXT NOT NULL,
	viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
	status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'UNPUBLISHED')),
	install_count INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations (
	version INTEGER PRIMARY KEY,
	description TEXT NOT NULL,
	applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`

// pgSchema derives the Postgres schema from the SQLite one used everywhere
// else, instead of maintaining two hand-written copies that can quietly
// drift apart. The only type-level differences between the two dialects in
// this schema are DATETIME -> TIMESTAMPTZ and BLOB -> BYTEA; every scan site
// in the codebase already reads timestamp/blob columns as string/[]byte,
// which database/sql's built-in conversions satisfy for both drivers, so no
// call site needs to change alongside this.
func pgSchema(sqliteSchema string) string {
	replacer := strings.NewReplacer(
		"DATETIME", "TIMESTAMPTZ",
		"BLOB", "BYTEA",
	)
	return replacer.Replace(sqliteSchema)
}
