package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// setupAuthTestDB creates an in-memory test database and applies migrations.
func setupAuthTestDB(t *testing.T) *dbHandle {
	t.Helper()
	rawDB, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite in-memory db: %v", err)
	}

	testDB := &dbHandle{DB: rawDB, backend: "sqlite"}
	if _, err := testDB.Exec(sqliteSchemaSQL); err != nil {
		t.Fatalf("failed to apply schema: %v", err)
	}

	if err := runMigrations(testDB); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	return testDB
}

func TestAuthHardeningFlow(t *testing.T) {
	oldDB := db
	oldLimiter := signupLimiter
	oldLoginLimiter := loginLimiter
	oldResendLimiter := resendLimiter
	oldEmailSender := emailSender

	testDB := setupAuthTestDB(t)
	defer testDB.Close()

	db = testDB
	signupLimiter = NewRateLimiter(100, 1*time.Minute, 100)
	loginLimiter = NewRateLimiter(100, 1*time.Minute, 100)
	resendLimiter = NewRateLimiter(100, 1*time.Minute, 100)
	emailSender = &ConsoleMailer{}

	defer func() {
		db = oldDB
		signupLimiter = oldLimiter
		loginLimiter = oldLoginLimiter
		resendLimiter = oldResendLimiter
		emailSender = oldEmailSender
	}()

	// 1. Test Rejection of Disposable Email Signup
	t.Run("Reject disposable email signup", func(t *testing.T) {
		payload := map[string]string{
			"email":    "attacker@mailinator.com",
			"password": "Password123!",
			"name":     "Attacker",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/auth/signup", bytes.NewReader(body))
		w := httptest.NewRecorder()

		handleSignup(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for disposable email, got %d. Body: %s", w.Code, w.Body.String())
		}
	})

	// 2. Test Successful Signup with Real Email
	var verificationToken string
	var initialSignupToken string
	validEmail := "alice@genuinecorp.com"
	t.Run("Valid signup generates unverified user and verification token", func(t *testing.T) {
		payload := map[string]string{
			"email":    validEmail,
			"password": "SecurePassword123!",
			"name":     "Alice Genuine",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/auth/signup", bytes.NewReader(body))
		w := httptest.NewRecorder()

		handleSignup(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200 for valid signup, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Token string `json:"token"`
			User  struct {
				ID            string `json:"id"`
				Email         string `json:"email"`
				EmailVerified bool   `json:"email_verified"`
			} `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal response: %v", err)
		}

		initialSignupToken = resp.Token
		if resp.User.EmailVerified {
			t.Fatalf("expected newly registered user to have email_verified = false")
		}

		// Verify /api/auth/me returns unverified
		meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
		meReq.Header.Set("Authorization", "Bearer "+initialSignupToken)
		meW := httptest.NewRecorder()
		AuthMiddleware(http.HandlerFunc(handleMe)).ServeHTTP(meW, meReq)
		if meW.Code != http.StatusOK {
			t.Fatalf("expected 200 from handleMe, got %d", meW.Code)
		}
		var meResp struct {
			EmailVerified bool `json:"email_verified"`
		}
		if err := json.Unmarshal(meW.Body.Bytes(), &meResp); err != nil || meResp.EmailVerified {
			t.Fatalf("expected handleMe to return email_verified = false before verification")
		}

		// Verify token exists in database
		var isVerified bool
		err := db.QueryRow("SELECT email_verified, verification_token FROM users WHERE email = ?", validEmail).Scan(&isVerified, &verificationToken)
		if err != nil {
			t.Fatalf("failed to query verification token from db: %v", err)
		}
		if isVerified {
			t.Fatalf("expected db email_verified to be false")
		}
		if verificationToken == "" {
			t.Fatalf("expected non-empty verification_token in db")
		}
	})

	// 3. Test Verification with Invalid Token
	t.Run("Invalid verification token fails", func(t *testing.T) {
		payload := map[string]string{
			"token": "invalid_random_token_12345",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/auth/verify-email", bytes.NewReader(body))
		w := httptest.NewRecorder()

		handleVerifyEmail(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for invalid token, got %d", w.Code)
		}
	})

	// 4. Test Verification with Real Token
	t.Run("Valid verification token activates account", func(t *testing.T) {
		payload := map[string]string{
			"token": verificationToken,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/auth/verify-email", bytes.NewReader(body))
		w := httptest.NewRecorder()

		handleVerifyEmail(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200 for valid token verification, got %d. Body: %s", w.Code, w.Body.String())
		}

		var resp struct {
			Success bool `json:"success"`
			User    struct {
				EmailVerified bool `json:"email_verified"`
			} `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal verify response: %v", err)
		}
		if !resp.Success || !resp.User.EmailVerified {
			t.Fatalf("expected success: true and email_verified: true, got %+v", resp)
		}

		// Check database status
		var isVerified bool
		var tokenInDB sql.NullString
		err := db.QueryRow("SELECT email_verified, verification_token FROM users WHERE email = ?", validEmail).Scan(&isVerified, &tokenInDB)
		if err != nil {
			t.Fatalf("failed to query user from db: %v", err)
		}
		if !isVerified {
			t.Fatalf("expected db email_verified to be true after verification")
		}
		if tokenInDB.Valid && tokenInDB.String != "" {
			t.Fatalf("expected verification_token to be cleared from db after use, got %s", tokenInDB.String)
		}

		// Verify that handleMe called with the OLD unverified token now returns email_verified = true
		meReq := httptest.NewRequest("GET", "/api/auth/me", nil)
		meReq.Header.Set("Authorization", "Bearer "+initialSignupToken)
		meW := httptest.NewRecorder()
		AuthMiddleware(http.HandlerFunc(handleMe)).ServeHTTP(meW, meReq)
		if meW.Code != http.StatusOK {
			t.Fatalf("expected 200 from handleMe, got %d", meW.Code)
		}
		var meResp struct {
			EmailVerified bool `json:"email_verified"`
		}
		if err := json.Unmarshal(meW.Body.Bytes(), &meResp); err != nil || !meResp.EmailVerified {
			t.Fatalf("expected handleMe with initial token to return live email_verified = true after verification, got %+v", meResp)
		}
	})

	// 5. Test Login Reflects Verified State
	t.Run("Login returns verified status", func(t *testing.T) {
		payload := map[string]string{
			"email":    validEmail,
			"password": "SecurePassword123!",
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
		w := httptest.NewRecorder()

		handleLogin(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200 for login, got %d", w.Code)
		}

		var resp struct {
			Token string `json:"token"`
			User  struct {
				EmailVerified bool `json:"email_verified"`
			} `json:"user"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to unmarshal login response: %v", err)
		}
		if !resp.User.EmailVerified {
			t.Fatalf("expected login response to have email_verified = true")
		}

		claims, err := VerifyToken(resp.Token)
		if err != nil {
			t.Fatalf("failed to verify JWT claims: %v", err)
		}
		if !claims.EmailVerified {
			t.Fatalf("expected JWT claims to have email_verified = true")
		}
	})
}
