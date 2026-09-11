package main

import (
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// TestPostgresSchemaAndRebind is the "test both paths" item from the launch
// runbook: it exercises the real Postgres driver against the schema this
// package actually creates at startup, not just the string transforms in
// db_driver_test.go. Skipped locally (no Postgres available by default);
// CI provides a postgres service container and sets TEST_DATABASE_URL so
// this runs there on every push/PR alongside the SQLite-backed tests.
//
// Fixture IDs are suffixed with a nanosecond timestamp (the same
// ID-generation convention the rest of the codebase uses) rather than fixed
// strings, so re-running this against a real, persistent local Postgres
// instance — as opposed to CI's fresh-per-run service container — never
// collides with a previous run's rows.
func TestPostgresSchemaAndRebind(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping Postgres integration test")
	}

	rawDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql.Open: %v", err)
	}
	defer rawDB.Close()

	pg := &dbHandle{DB: rawDB, backend: "postgres"}

	if _, err := pg.Exec(pgSchema(sqliteSchemaSQL)); err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}

	suffix := time.Now().UnixNano()
	userID := fmt.Sprintf("usr_test_%d", suffix)
	userEmail := fmt.Sprintf("test_%d@example.com", suffix)
	teamID := fmt.Sprintf("team_test_%d", suffix)
	project1ID := fmt.Sprintf("proj_test_%d_1", suffix)
	project2ID := fmt.Sprintf("proj_test_%d_2", suffix)
	tokenHash := fmt.Sprintf("tok_test_%d", suffix)
	if _, err := pg.Exec(
		"INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
		userID, userEmail, "hash", "Test User",
	); err != nil {
		t.Fatalf("insert user: %v", err)
	}

	var name string
	if err := pg.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&name); err != nil {
		t.Fatalf("select user: %v", err)
	}
	if name != "Test User" {
		t.Errorf("got name %q, want %q", name, "Test User")
	}

	// Timestamp columns (DATETIME -> TIMESTAMPTZ) must still scan into a Go
	// string the same way SQLite's do — every read call site in the
	// codebase expects this.
	var createdAt string
	if err := pg.QueryRow("SELECT created_at FROM users WHERE id = ?", userID).Scan(&createdAt); err != nil {
		t.Fatalf("select created_at: %v", err)
	}
	if createdAt == "" {
		t.Error("expected a non-empty created_at string")
	}

	// agent_pairing_tokens.project_id has a real FK into projects(id), which
	// Postgres enforces and SQLite (with foreign_keys off, this codebase's
	// default) does not — so unlike the users insert above, this needs real
	// parent rows, not arbitrary strings, to exercise the same statement a
	// real pairing flow would run.
	if _, err := pg.Exec("INSERT INTO teams (id, name, slug, owner_id) VALUES (?, ?, ?, ?)", teamID, "Team", teamID, userID); err != nil {
		t.Fatalf("insert team: %v", err)
	}
	if _, err := pg.Exec("INSERT INTO projects (id, team_id, name, created_by) VALUES (?, ?, ?, ?)", project1ID, teamID, "Project", userID); err != nil {
		t.Fatalf("insert project 1: %v", err)
	}
	if _, err := pg.Exec("INSERT INTO projects (id, team_id, name, created_by) VALUES (?, ?, ?, ?)", project2ID, teamID, "Project 2", userID); err != nil {
		t.Fatalf("insert project 2: %v", err)
	}

	// The ON CONFLICT emulation of SQLite's INSERT OR REPLACE, used for
	// agent_pairing_tokens (see pairing.go).
	upsert := `INSERT INTO agent_pairing_tokens (token_hash, project_id, agent_id, issued_at, revoked_at)
		VALUES (?, ?, ?, datetime('now'), NULL)
		ON CONFLICT (token_hash) DO UPDATE SET
			project_id = EXCLUDED.project_id,
			agent_id = EXCLUDED.agent_id,
			issued_at = EXCLUDED.issued_at,
			revoked_at = EXCLUDED.revoked_at`
	if _, err := pg.Exec(upsert, tokenHash, project1ID, "agent_1"); err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	if _, err := pg.Exec(upsert, tokenHash, project2ID, "agent_2"); err != nil {
		t.Fatalf("second upsert (should replace): %v", err)
	}
	var projectID string
	if err := pg.QueryRow("SELECT project_id FROM agent_pairing_tokens WHERE token_hash = ?", tokenHash).Scan(&projectID); err != nil {
		t.Fatalf("select agent_pairing_tokens: %v", err)
	}
	if projectID != project2ID {
		t.Errorf("got project_id %q after replace, want %q", projectID, project2ID)
	}

	// A transaction, since Begin() rebinds separately from the top-level db.
	tx, err := pg.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if _, err := tx.Exec("UPDATE users SET name = ? WHERE id = ?", "Updated Name", userID); err != nil {
		t.Fatalf("tx exec: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("tx commit: %v", err)
	}
	if err := pg.QueryRow("SELECT name FROM users WHERE id = ?", userID).Scan(&name); err != nil {
		t.Fatalf("select user after tx: %v", err)
	}
	if name != "Updated Name" {
		t.Errorf("got name %q after tx commit, want %q", name, "Updated Name")
	}
}
