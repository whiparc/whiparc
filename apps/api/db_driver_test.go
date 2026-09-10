package main

import "testing"

func TestRebindSQLSqlitePassthrough(t *testing.T) {
	q := "SELECT * FROM users WHERE email = ? AND name LIKE ?"
	if got := rebindSQL("sqlite", q); got != q {
		t.Fatalf("sqlite backend must not rewrite the query, got %q", got)
	}
}

func TestRebindSQLPlaceholders(t *testing.T) {
	cases := []struct{ in, want string }{
		{"SELECT * FROM t WHERE a = ?", "SELECT * FROM t WHERE a = $1"},
		{"SELECT * FROM t WHERE a = ? AND b = ?", "SELECT * FROM t WHERE a = $1 AND b = $2"},
		// projects.go's reused-value query: four placeholders, four distinct
		// $N even though the caller happens to pass the same value four times.
		{"WHERE a = ? OR b = ? OR c = ? OR d = ?", "WHERE a = $1 OR b = $2 OR c = $3 OR d = $4"},
		{"no placeholders here", "no placeholders here"},
	}
	for _, c := range cases {
		if got := rebindSQL("postgres", c.in); got != c.want {
			t.Errorf("rebindSQL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestRebindSQLIgnoresPlaceholdersInsideStringLiterals(t *testing.T) {
	in := `SELECT * FROM t WHERE note = 'what?' AND a = ?`
	want := `SELECT * FROM t WHERE note = 'what?' AND a = $1`
	if got := rebindSQL("postgres", in); got != want {
		t.Errorf("rebindSQL(%q) = %q, want %q", in, got, want)
	}
}

func TestRebindSQLDatetimeNow(t *testing.T) {
	in := "UPDATE t SET updated_at = datetime('now') WHERE id = ?"
	want := "UPDATE t SET updated_at = now() WHERE id = $1"
	if got := rebindSQL("postgres", in); got != want {
		t.Errorf("rebindSQL(%q) = %q, want %q", in, got, want)
	}
}

func TestRebindSQLLikeToILike(t *testing.T) {
	in := "(t.title LIKE ? OR t.description LIKE ?)"
	want := "(t.title ILIKE $1 OR t.description ILIKE $2)"
	if got := rebindSQL("postgres", in); got != want {
		t.Errorf("rebindSQL(%q) = %q, want %q", in, got, want)
	}
}

func TestPgSchemaTypeSwap(t *testing.T) {
	in := "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, nonce BLOB NOT NULL"
	want := "created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, nonce BYTEA NOT NULL"
	if got := pgSchema(in); got != want {
		t.Errorf("pgSchema(%q) = %q, want %q", in, got, want)
	}
}
