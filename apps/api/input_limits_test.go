package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestValidateDisplayName(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"ordinary", "Alice Genuine", false},
		{"unicode", "Zoë 山田", false},
		{"exactly at the cap", strings.Repeat("a", maxDisplayNameLen), false},
		{"empty", "", true},
		{"over the cap", strings.Repeat("a", maxDisplayNameLen+1), true},
		{"newline", "Alice\nBob", true},
		{"nul byte", "Alice\x00", true},
		{"escape", "Alice\x1b[31m", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateDisplayName(tc.input)
			if (err != nil) != tc.wantErr {
				t.Fatalf("validateDisplayName(%q) error = %v, wantErr %v", tc.input, err, tc.wantErr)
			}
		})
	}
}

func TestSignupRejectsBadDisplayName(t *testing.T) {
	oldDB, oldLimiter := db, signupLimiter
	testDB := setupAuthTestDB(t)
	db = testDB
	signupLimiter = NewRateLimiter(100, time.Minute, 100)
	t.Cleanup(func() {
		db, signupLimiter = oldDB, oldLimiter
		testDB.Close()
	})

	for label, name := range map[string]string{
		"too long":           strings.Repeat("a", maxDisplayNameLen+1),
		"control characters": "Mallory\r\nBcc: victim@example.com",
	} {
		t.Run(label, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{
				"email":    "mallory@genuinecorp.com",
				"password": "SecurePassword123!",
				"name":     name,
			})
			w := httptest.NewRecorder()
			handleSignup(w, httptest.NewRequest(http.MethodPost, "/api/auth/signup", bytes.NewReader(body)))
			if w.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
			}
		})
	}

	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("rejected signups must not create users, found %d", n)
	}
}

func TestValidateCustomNodeRequiresAuth(t *testing.T) {
	h := AuthMiddleware(http.HandlerFunc(handleValidateCustomNode))
	req := httptest.NewRequest(http.MethodPost, "/api/custom-nodes/validate", strings.NewReader(`{"tech":"terraform","raw_code":""}`))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", w.Code)
	}
}

func TestValidateCustomNodeBodyCap(t *testing.T) {
	t.Run("oversized body is rejected with 413", func(t *testing.T) {
		huge, _ := json.Marshal(map[string]string{
			"tech":     "terraform",
			"raw_code": strings.Repeat("a", maxCustomNodeValidateBytes+1),
		})
		w := httptest.NewRecorder()
		handleValidateCustomNode(w, httptest.NewRequest(http.MethodPost, "/api/custom-nodes/validate", bytes.NewReader(huge)))
		if w.Code != http.StatusRequestEntityTooLarge {
			t.Fatalf("expected 413, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("normal body still validates", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{
			"tech":     "terraform",
			"raw_code": `resource "aws_s3_bucket" "b" { bucket = "x" }`,
		})
		w := httptest.NewRecorder()
		handleValidateCustomNode(w, httptest.NewRequest(http.MethodPost, "/api/custom-nodes/validate", bytes.NewReader(body)))
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})
}
