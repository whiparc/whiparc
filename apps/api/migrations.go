package main

import (
	"fmt"
	"log"
)

// migration is one versioned, forward-only schema change applied after the
// legacy bootstrap in main() (the CREATE TABLE IF NOT EXISTS schema plus the
// three ad hoc SQLite-only rebuild migrations above it). New schema changes
// should be a new entry appended here instead of another ad hoc ALTER TABLE
// call in main() — see runMigrations for how these get tracked and applied.
//
// up receives a sqlExecer (satisfied by both *dbTx and *sql.Tx) so it runs
// through the same rebindSQL translation as every other query in this
// package, and so it never needs to know which wrapper it got.
type migration struct {
	version     int
	description string
	up          func(tx sqlExecer) error
}

// migrations must stay ordered by version, and a version must never be
// reused or reordered once it has shipped — schema_migrations records which
// versions have already run, per database.
var migrations = []migration{
	{
		version:     1,
		description: "baseline",
		up: func(tx sqlExecer) error {
			// No-op. Every table this version would have created already
			// exists in every environment, including production, via the
			// legacy `db.Exec(schemaQuery)` CREATE TABLE IF NOT EXISTS
			// bootstrap in main(). This entry only establishes version 1 as
			// the point schema_migrations starts tracking from — future
			// schema changes are migration 2 onward.
			return nil
		},
	},
}

// runMigrations applies, in version order, any migration above not yet
// recorded in schema_migrations. Each migration runs in its own
// transaction: a failure rolls back that migration's own changes and stops
// startup (the caller treats a non-nil error as fatal) rather than leaving
// the schema half-migrated or silently skipping the rest.
func runMigrations(db *dbHandle) error {
	applied := make(map[int]bool)
	rows, err := db.Query("SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("failed to read schema_migrations: %w", err)
	}
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			rows.Close()
			return fmt.Errorf("failed to scan schema_migrations row: %w", err)
		}
		applied[v] = true
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("failed to read schema_migrations: %w", err)
	}
	rows.Close()

	for _, m := range migrations {
		if applied[m.version] {
			continue
		}
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("migration %d (%s): failed to start transaction: %w", m.version, m.description, err)
		}
		if err := m.up(tx); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d (%s): %w", m.version, m.description, err)
		}
		if _, err := tx.Exec("INSERT INTO schema_migrations (version, description) VALUES (?, ?)", m.version, m.description); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d (%s): failed to record as applied: %w", m.version, m.description, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("migration %d (%s): failed to commit: %w", m.version, m.description, err)
		}
		log.Printf("[DB] Applied migration %d: %s\n", m.version, m.description)
	}
	return nil
}
