package pairing

import "testing"

// TestPairingFlow proves the device-authorization flow works standalone, with
// no Gateway, WebSocket, or yamux involved — exactly the "get device-authorization
// pairing working standalone" goal in obsidian_memory/08.4's Phase 0 scope.
func TestPairingFlow(t *testing.T) {
	s := NewServer("https://www.infracanvas.dev/pair")

	auth, err := s.RequestDeviceCode()
	if err != nil {
		t.Fatalf("RequestDeviceCode: %v", err)
	}
	if auth.DeviceCode == "" || auth.UserCode == "" {
		t.Fatalf("expected non-empty codes, got %+v", auth)
	}

	if _, err := s.PollToken(auth.DeviceCode); err != ErrAuthorizationPending {
		t.Fatalf("expected ErrAuthorizationPending before approval, got %v", err)
	}

	if err := s.Approve(auth.UserCode, "acct_1", "proj_1"); err != nil {
		t.Fatalf("Approve: %v", err)
	}

	ident, err := s.PollToken(auth.DeviceCode)
	if err != nil {
		t.Fatalf("PollToken after approval: %v", err)
	}
	if ident.Token == "" {
		t.Fatal("expected a non-empty agent token")
	}
	if ident.AccountID != "acct_1" || ident.ProjectID != "proj_1" {
		t.Fatalf("unexpected scope: %+v", ident)
	}

	looked, ok := s.LookupToken(ident.Token)
	if !ok {
		t.Fatal("expected LookupToken to find the issued token")
	}
	if looked.AccountID != "acct_1" || looked.ProjectID != "proj_1" {
		t.Fatalf("unexpected scope from LookupToken: %+v", looked)
	}
}

func TestPairingDenied(t *testing.T) {
	s := NewServer("https://www.infracanvas.dev/pair")

	auth, err := s.RequestDeviceCode()
	if err != nil {
		t.Fatalf("RequestDeviceCode: %v", err)
	}
	if err := s.Deny(auth.UserCode); err != nil {
		t.Fatalf("Deny: %v", err)
	}
	if _, err := s.PollToken(auth.DeviceCode); err != ErrAccessDenied {
		t.Fatalf("expected ErrAccessDenied, got %v", err)
	}
}

func TestPairingUnknownCode(t *testing.T) {
	s := NewServer("https://www.infracanvas.dev/pair")
	if _, err := s.PollToken("does-not-exist"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := s.Approve("BOGUS-CODE", "acct", "proj"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
