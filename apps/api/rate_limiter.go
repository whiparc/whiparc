package main

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

type rateBucket struct {
	tokens     int
	lastRefill time.Time
}

// RateLimiter implements an in-memory token bucket rate limiter.
type RateLimiter struct {
	mu          sync.Mutex
	buckets     map[string]*rateBucket
	rate        int           // tokens added per window
	window      time.Duration // window duration
	capacity    int           // max token capacity
	stopJanitor chan struct{}
}

// NewRateLimiter creates a RateLimiter that allows `capacity` requests, refilling `rate` tokens every `window`.
func NewRateLimiter(rate int, window time.Duration, capacity int) *RateLimiter {
	rl := &RateLimiter{
		buckets:     make(map[string]*rateBucket),
		rate:        rate,
		window:      window,
		capacity:    capacity,
		stopJanitor: make(chan struct{}),
	}

	// Background cleanup of idle keys
	go rl.janitor(10 * time.Minute)
	return rl
}

func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, exists := rl.buckets[key]
	if !exists {
		rl.buckets[key] = &rateBucket{
			tokens:     rl.capacity - 1,
			lastRefill: now,
		}
		return true
	}

	// Refill tokens proportional to elapsed time
	elapsed := now.Sub(b.lastRefill)
	if elapsed >= rl.window {
		periods := int(elapsed / rl.window)
		b.tokens += periods * rl.rate
		if b.tokens > rl.capacity {
			b.tokens = rl.capacity
		}
		b.lastRefill = b.lastRefill.Add(time.Duration(periods) * rl.window)
	}

	if b.tokens > 0 {
		b.tokens--
		return true
	}

	return false
}

func (rl *RateLimiter) janitor(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			for k, b := range rl.buckets {
				if now.Sub(b.lastRefill) > 2*rl.window && b.tokens >= rl.capacity {
					delete(rl.buckets, k)
				}
			}
			rl.mu.Unlock()
		case <-rl.stopJanitor:
			return
		}
	}
}

// ClientIP extracts the remote client IP from headers (X-Forwarded-For, X-Real-IP) or RemoteAddr.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	parts := strings.Split(r.RemoteAddr, ":")
	if len(parts) > 0 {
		return parts[0]
	}
	return r.RemoteAddr
}
