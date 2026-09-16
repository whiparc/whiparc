package main

import (
	"testing"
	"time"
)

func TestRateLimiterAllowsUpToCapacity(t *testing.T) {
	rl := NewRateLimiter(5, 1*time.Minute, 3)
	defer close(rl.stopJanitor)

	key := "test_ip_1"
	for i := 0; i < 3; i++ {
		if !rl.Allow(key) {
			t.Fatalf("expected request %d to be allowed", i+1)
		}
	}

	// 4th request exceeds capacity of 3
	if rl.Allow(key) {
		t.Fatalf("expected 4th request to be blocked")
	}

	// Different key should still be allowed
	if !rl.Allow("test_ip_2") {
		t.Fatalf("expected different key to be allowed")
	}
}
