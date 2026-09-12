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
		t.Fatalf("query schema_migrations: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected migration 1 to be recorded once, got count=%d", count)
	}

	// A second run against an already-migrated database (the baseline case
	// for every pre-existing environment, including production) must be a
	// no-op rather than a duplicate-insert error.
	if err := runMigrations(testDB); err != nil {
		t.Fatalf("second runMigrations: %v", err)
	}
	if err := testDB.QueryRow("SELECT COUNT(*) FROM schema_migrations WHERE version = 1").Scan(&count); err != nil {
		t.Fatalf("query schema_migrations after rerun: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected migration 1 still recorded exactly once after rerun, got count=%d", count)
	}
}
