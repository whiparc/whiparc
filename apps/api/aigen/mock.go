package aigen

import (
	"context"
	"encoding/json"
	"strings"

	"api/catalog"
)

// Mock is a keyword-driven Generator for local development and demos
// (AI_PROVIDER=mock). It needs no API key and makes no network call, so the
// whole path (endpoint, validator, review UI) can be exercised for free. It is
// not a language model: it recognises a few words and always returns the same
// small graph for the same words. Its output still goes through Validate like
// any provider's.
type Mock struct{}

func (Mock) Generate(_ context.Context, req GenerateRequest) (json.RawMessage, Usage, error) {
	p := strings.ToLower(req.Prompt)
	has := func(words ...string) bool {
		for _, w := range words {
			if strings.Contains(p, w) {
				return true
			}
		}
		return false
	}

	// Declines, as a real model is told to: build nothing and say why. The mock
	// recognises only a few obvious cases, enough to exercise the refusal path.
	infra := has("server", "vm", "bucket", "s3", "storage", "database", "postgres", "sql", "nginx", "node", "vpc", "subnet", "firewall", "network", "aws", "site", "web")
	decline := ""
	switch {
	case has("rawcode", "shell script", "ignore all previous", "ignore your instructions", "system prompt"), !infra && has("password", "credential"):
		decline = catalog.DeclineUnsafe
	case !infra && has("kubernetes", "k8s", "lambda", "gcp", "azure", "google cloud"):
		decline = catalog.DeclineUnsupported
	case !infra && has("poem", "joke", "weather", "recipe", "capital of", "who are you", "hello", "hi there"):
		decline = catalog.DeclineNotInfrastructure
	case !infra:
		decline = catalog.DeclineTooVague
	}
	if decline != "" {
		out, _ := json.Marshal(map[string]any{"nodes": []any{}, "edges": []any{}, "decline": decline})
		return out, Usage{InputTokens: len(req.Prompt) / 4, OutputTokens: len(out) / 4}, nil
	}

	nodes := []map[string]any{
		{"ref": "net", "type": "aws_vpc", "parameters": map[string]any{"vpcName": "app_vpc"}},
		{"ref": "sub", "type": "aws_subnet"},
		{"ref": "fw", "type": "aws_security_group"},
		{"ref": "vm", "type": "aws_instance.web_server"},
		{"ref": "upd", "type": "update-packages"},
	}
	edges := []map[string]string{
		{"source": "net", "target": "sub"}, {"source": "net", "target": "fw"},
		{"source": "sub", "target": "vm"}, {"source": "fw", "target": "vm"},
		{"source": "vm", "target": "upd"},
	}
	last := "upd"
	add := func(ref, typ string) {
		nodes = append(nodes, map[string]any{"ref": ref, "type": typ})
		edges = append(edges, map[string]string{"source": last, "target": ref})
		last = ref
	}

	switch {
	case has("node", "javascript", "express"):
		add("node", "nodejs")
	default:
		add("web", "nginx")
	}
	if has("postgres", "database", "sql") {
		nodes = append(nodes, map[string]any{"ref": "db", "type": "aws_db_instance"})
		edges = append(edges, map[string]string{"source": "sub", "target": "db"}, map[string]string{"source": "fw", "target": "db"})
	}
	if has("bucket", "s3", "storage", "upload") {
		nodes = append(nodes, map[string]any{"ref": "files", "type": "aws_s3_bucket", "parameters": map[string]any{"bucketName": "app-uploads"}})
	}

	doc := map[string]any{"nodes": nodes, "edges": edges}
	if has("kubernetes", "k8s", "lambda", "gcp", "azure") {
		doc["notes"] = []string{"Kubernetes, serverless functions, Google Cloud and Azure are not available here, so none of them is included."}
	}
	out, _ := json.Marshal(doc)
	return out, Usage{InputTokens: len(req.Prompt) / 4, OutputTokens: len(out) / 4}, nil
}
