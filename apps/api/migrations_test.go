package main

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestRunMigrationsAppliesOnceAndIsIdempotent(t *testing.T) {
	rawDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer rawDB.Close()

	testDB := &dbHandle{DB: rawDB, backend: "sqlite"}
	if _, err := testDB.Exec(sqliteSchemaSQL); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if err := runMigrations(testDB); err != nil {
		t.Fatalf("first runMigrations: %v", err)
	}

	var count int
	if err := testDB.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 1").Scan(&count); err != nil {
		t.Fatalf("query schema_migrations v1: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected migration 1 to be recorded once, got count=%d", count)
	}

	var count2 int
	if err := testDB.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 2").Scan(&count2); err != nil {
		t.Fatalf("query schema_migrations v2: %v", err)
	}
	if count2 != 1 {
		t.Fatalf("expected migration 2 to be recorded once, got count=%d", count2)
	}

	// Verify columns were added to users table
	var emailVerified bool
	if _, err := testDB.Exec("INSERT INTO users (id, email, password_hash, name) VALUES ('u_test', 'test@test.com', 'hash', 'Test')"); err != nil {
		t.Fatalf("failed to insert test user after migration: %v", err)
	}
	if err := testDB.QueryRow("SELECT email_verified FROM users WHERE id = 'u_test'").Scan(&emailVerified); err != nil {
		t.Fatalf("failed to query email_verified from users: %v", err)
	}

	// A second run against an already-migrated database (the baseline case
	// for every pre-existing environment, including production) must be a
	// no-op rather than a duplicate-insert error.
	if err := runMigrations(testDB); err != nil {
		t.Fatalf("second runMigrations: %v", err)
	}
	if err := testDB.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 2").Scan(&count2); err != nil {
		t.Fatalf("query schema_migrations after rerun: %v", err)
	}
	if count2 != 1 {
		t.Fatalf("expected migration 2 still recorded exactly once after rerun, got count=%d", count2)
	}
}
