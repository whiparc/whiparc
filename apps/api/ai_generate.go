package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"api/aigen"
	"api/catalog"
	"api/importer"
)

// AI mode, Phase 1: prompt to canvas proposal. See
// docs/plans/ai-mode-phase-1-design.md.
//
// The endpoint is generate-only. It never writes to canvas_states: the
// proposal is returned to the client, the user reviews it, and accepting it
// goes through the ordinary canvas save. The existing canvas is not sent to the
// model; it is read only to place the proposed nodes below it and keep their IDs
// unique.

const (
	aiMaxBodyBytes     = 16 << 10
	defaultAIDailyCap  = 30
	defaultAITimeout   = 60 * time.Second
	defaultAIMaxTokens = 4096
	defaultAIModel     = "claude-sonnet-5-5"

	// Outcomes recorded in ai_generations.
	aiOutcomeSuccess       = "success"
	aiOutcomeProviderError = "provider_error"
	aiOutcomeRejected      = "rejected" // the model answered, the validator refused it
)

var (
	// aiGenerator is nil when AI mode is off. Everything else in this block is
	// read-only after initAIMode.
	aiGenerator aigen.Generator
	aiModel     = defaultAIModel
	aiDailyCap  = defaultAIDailyCap
	aiTimeout   = defaultAITimeout

	// A burst limit on top of the daily cap, per user.
	aiLimiter = NewRateLimiter(10, 10*time.Minute, 10)
)

// initAIMode reads the AI_* environment. The feature is off unless
// AI_MODE_ENABLED=true and a provider is usable; a misconfiguration leaves it
// off and says why, rather than failing startup of the whole API.
func initAIMode(getenv func(string) string) {
	aiGenerator = nil
	if !strings.EqualFold(strings.TrimSpace(getenv("AI_MODE_ENABLED")), "true") {
		return
	}

	if v := strings.TrimSpace(getenv("AI_MODEL")); v != "" {
		aiModel = v
	}
	if n, err := strconv.Atoi(strings.TrimSpace(getenv("AI_DAILY_CAP"))); err == nil && n > 0 {
		aiDailyCap = n
	}
	if n, err := strconv.Atoi(strings.TrimSpace(getenv("AI_TIMEOUT_SECONDS"))); err == nil && n > 0 {
		aiTimeout = time.Duration(n) * time.Second
	}
	maxTokens := defaultAIMaxTokens
	if n, err := strconv.Atoi(strings.TrimSpace(getenv("AI_MAX_OUTPUT_TOKENS"))); err == nil && n > 0 {
		maxTokens = n
	}

	switch provider := strings.ToLower(strings.TrimSpace(getenv("AI_PROVIDER"))); provider {
	case "", "claude":
		key := strings.TrimSpace(getenv("ANTHROPIC_API_KEY"))
		if key == "" {
			log.Println("[AI] AI_MODE_ENABLED=true but ANTHROPIC_API_KEY is not set; AI mode stays off.")
			return
		}
		aiGenerator = &aigen.Claude{APIKey: key, Model: aiModel, BaseURL: strings.TrimSpace(getenv("ANTHROPIC_BASE_URL")), MaxTokens: maxTokens}
		log.Printf("[AI] AI mode enabled (provider=claude model=%s dailyCap=%d)\n", aiModel, aiDailyCap)
	case "mock":
		aiGenerator = aigen.Mock{}
		log.Println("[AI] AI mode enabled with the MOCK provider. Development only: it is a keyword matcher, not a model.")
	default:
		log.Printf("[AI] Unknown AI_PROVIDER %q; AI mode stays off.\n", provider)
	}
}

// GET /api/ai/status lets the client decide whether to show the prompt box.
func handleAIStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := GetUserFromContext(r); !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSONStatus(w, http.StatusOK, map[string]any{
		"enabled":         aiGenerator != nil,
		"maxPromptLength": catalog.MaxPromptLen,
	})
}

type aiGenerateResponse struct {
	Nodes    json.RawMessage `json:"nodes"`
	Edges    json.RawMessage `json:"edges"`
	Warnings []aigen.Warning `json:"warnings"`
}

// POST /api/projects/{id}/ai/generate
func handleAIGenerate(w http.ResponseWriter, r *http.Request) {
	user, ok := GetUserFromContext(r)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	gen := aiGenerator
	if gen == nil {
		writeJSONError(w, http.StatusNotFound, "AI mode is not enabled.")
		return
	}
	projectID := r.PathValue("id")

	var body struct {
		Prompt string `json:"prompt"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, aiMaxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request.")
		return
	}
	prompt := strings.TrimSpace(body.Prompt)
	switch n := utf8.RuneCountInString(prompt); {
	case n == 0:
		writeJSONError(w, http.StatusBadRequest, "Describe the infrastructure you want.")
		return
	case n > catalog.MaxPromptLen:
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("The description is too long (limit %d characters).", catalog.MaxPromptLen))
		return
	}

	if !aiLimiter.Allow(user.ID) {
		writeJSONError(w, http.StatusTooManyRequests, "Too many requests. Please wait a few minutes before trying again.")
		return
	}
	if aiDailyLimitReached(user.ID) {
		writeJSONError(w, http.StatusTooManyRequests, "You have reached today's limit for AI generation. It resets on a rolling 24 hour window.")
		return
	}

	// Read the canvas before spending a provider call. It is used only to place
	// the proposal and keep its names unique; it is never sent to the model.
	existingNodes, existingEdges, err := loadCanvas(projectID)
	if err != nil {
		log.Printf("[AI] could not read canvas project=%s: %v\n", projectID, err)
		writeJSONError(w, http.StatusInternalServerError, "Could not prepare the proposal.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), aiTimeout)
	defer cancel()
	raw, usage, err := gen.Generate(ctx, aigen.GenerateRequest{Prompt: prompt, Schema: catalog.JSONSchema()})
	if err != nil {
		recordAIGeneration(user.ID, projectID, usage, aiOutcomeProviderError)
		log.Printf("[AI] generation failed project=%s user=%s: %v\n", projectID, user.ID, err)
		status, msg := http.StatusBadGateway, "The AI service could not produce a result. Please try again."
		if errors.Is(err, context.DeadlineExceeded) {
			status, msg = http.StatusGatewayTimeout, "The AI service took too long to respond. Please try again."
		}
		writeJSONError(w, status, msg)
		return
	}

	result, err := aigen.ValidateWithUsed(raw, aigen.UsedLabels(existingNodes))
	if err != nil {
		recordAIGeneration(user.ID, projectID, usage, aiOutcomeRejected)
		log.Printf("[AI] output rejected project=%s user=%s: %v\n", projectID, user.ID, err)
		writeJSONError(w, http.StatusUnprocessableEntity, "The AI could not produce a usable design for that description. Try rephrasing it, or describe fewer things at once.")
		return
	}

	nodes, edges, err := placeProposal(existingNodes, existingEdges, result)
	if err != nil {
		recordAIGeneration(user.ID, projectID, usage, aiOutcomeProviderError)
		log.Printf("[AI] layout failed project=%s: %v\n", projectID, err)
		writeJSONError(w, http.StatusInternalServerError, "Could not prepare the proposal.")
		return
	}

	recordAIGeneration(user.ID, projectID, usage, aiOutcomeSuccess)
	log.Printf("[AI] generated project=%s user=%s nodes=%d edges=%d warnings=%d tokens_in=%d tokens_out=%d\n",
		projectID, user.ID, len(result.Nodes), len(result.Edges), len(result.Warnings), usage.InputTokens, usage.OutputTokens)
	writeJSONStatus(w, http.StatusOK, aiGenerateResponse{Nodes: nodes, Edges: edges, Warnings: result.Warnings})
}

// placeProposal lays the validated nodes out below whatever is already on the
// canvas and makes their IDs unique against it, by reusing ArrangeNodesAndMerge,
// then returns only the proposed nodes and edges (not the existing ones).
func placeProposal(existingNodes, existingEdges string, res *aigen.Result) (nodes, edges json.RawMessage, err error) {
	existing := fmt.Sprintf(`{"nodes":%s,"edges":%s}`, orEmptyArray(existingNodes), orEmptyArray(existingEdges))

	mergedNodes, mergedEdges, err := importer.ArrangeNodesAndMerge(existing, res.Nodes, res.Edges)
	if err != nil {
		return nil, nil, err
	}
	var allNodes, allEdges []json.RawMessage
	if err := json.Unmarshal([]byte(mergedNodes), &allNodes); err != nil {
		return nil, nil, err
	}
	if err := json.Unmarshal([]byte(mergedEdges), &allEdges); err != nil {
		return nil, nil, err
	}
	// Imported entries are appended after the existing ones.
	tailNodes := allNodes[len(allNodes)-len(res.Nodes):]
	tailEdges := allEdges[len(allEdges)-len(res.Edges):]
	if nodes, err = json.Marshal(tailNodes); err != nil {
		return nil, nil, err
	}
	if edges, err = json.Marshal(tailEdges); err != nil {
		return nil, nil, err
	}
	return nodes, edges, nil
}

// loadCanvas returns the project's saved nodes and edges as JSON, or empty
// arrays when it has no canvas yet.
func loadCanvas(projectID string) (nodes, edges string, err error) {
	switch err := db.QueryRow("SELECT nodes_json, edges_json FROM canvas_states WHERE project_id = ?", projectID).Scan(&nodes, &edges); {
	case err == nil:
		return nodes, edges, nil
	case errors.Is(err, sql.ErrNoRows):
		return "[]", "[]", nil
	default:
		return "", "", err
	}
}

func orEmptyArray(s string) string {
	if strings.TrimSpace(s) == "" {
		return "[]"
	}
	return s
}

// aiDailyLimitReached counts attempts, successful or not, in the last 24 hours.
// It reads the newest aiDailyCap rows and counts those inside the window, which
// avoids backend-specific date arithmetic in SQL.
func aiDailyLimitReached(userID string) bool {
	rows, err := db.Query("SELECT created_at FROM ai_generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userID, aiDailyCap)
	if err != nil {
		// Fail closed: a cost control that cannot be checked is not a control.
		log.Printf("[AI] daily cap check failed for user %s: %v\n", userID, err)
		return true
	}
	defer rows.Close()
	cutoff := time.Now().Add(-24 * time.Hour)
	count := 0
	for rows.Next() {
		var at sql.NullTime
		if err := rows.Scan(&at); err != nil {
			return true
		}
		if at.Valid && at.Time.After(cutoff) {
			count++
		}
	}
	return count >= aiDailyCap
}

func recordAIGeneration(userID, projectID string, usage aigen.Usage, outcome string) {
	id := "aig_" + generateRandomHex(12)
	if _, err := db.Exec(
		"INSERT INTO ai_generations (id, user_id, project_id, model, input_tokens, output_tokens, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
		id, userID, projectID, aiModel, usage.InputTokens, usage.OutputTokens, outcome,
	); err != nil {
		log.Printf("[AI] failed to record usage for user %s: %v\n", userID, err)
	}
}
