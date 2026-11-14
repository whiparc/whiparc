package aigen

import (
	"context"
	"regexp"
	"strings"
	"testing"

	"api/catalog"
)

func promptLines() []string { return strings.Split(systemPrompt, "\n") }

// The model must be told every connection the validator would accept, or it
// cannot use them; and none the validator would discard, or it keeps drawing them.
func TestPromptStatesExactlyTheAllowedConnections(t *testing.T) {
	var tasks []string
	isTask := map[string]bool{}
	for _, n := range catalog.AIGeneratable() {
		if n.Tech == catalog.TechAnsible {
			tasks = append(tasks, n.ID)
			isTask[n.ID] = true
		}
	}

	// Every allowed pair is stated, in the line of its source.
	stated := 0
	for _, src := range catalog.AIGeneratable() {
		if src.Tech == catalog.TechAnsible {
			continue
		}
		line := ""
		for _, l := range promptLines() {
			if strings.HasPrefix(l, "- "+src.ID+" -> ") {
				line = l
			}
		}
		allTasks := true
		for _, tgt := range catalog.EdgeTargets(src.ID) {
			if isTask[tgt] {
				continue
			}
			stated++
			if line == "" || !strings.Contains(line, tgt) {
				t.Errorf("allowed connection %s -> %s is missing from the prompt", src.ID, tgt)
			}
		}
		for _, task := range tasks {
			if !catalog.AllowedEdge(src.ID, task) {
				allTasks = false
			}
		}
		if hasTasks := len(catalog.EdgeTargets(src.ID)) > 0 && anyTask(catalog.EdgeTargets(src.ID), isTask); hasTasks && allTasks && !strings.Contains(line, "any configuration task") {
			t.Errorf("%s may connect to every configuration task but the prompt does not say so: %q", src.ID, line)
		}
	}
	if stated < 6 {
		t.Errorf("only %d infrastructure connections stated; the prompt looks truncated", stated)
	}

	// No connection the catalog forbids is stated. Check every ordered pair of
	// catalog nodes against the lines of the prompt.
	for _, from := range catalog.AIGeneratable() {
		for _, to := range catalog.AIGeneratable() {
			if from.Tech == catalog.TechAnsible || isTask[to.ID] || catalog.AllowedEdge(from.ID, to.ID) {
				continue
			}
			for _, l := range promptLines() {
				if rest, ok := strings.CutPrefix(l, "- "+from.ID+" -> "); ok && strings.Contains(rest, to.ID) {
					t.Errorf("the prompt allows %s -> %s, which the catalog forbids", from.ID, to.ID)
				}
			}
		}
	}

	// The configuration tasks listed are exactly the catalog's.
	want := "Configuration tasks: " + strings.Join(tasks, ", ") + "."
	if !strings.Contains(systemPrompt, want) {
		t.Errorf("task list wrong; want %q", want)
	}
	// The chaining sentence is only true if every task may precede every other.
	if strings.Contains(systemPrompt, "a configuration task -> another configuration task") {
		for _, a := range tasks {
			for _, b := range tasks {
				if a != b && !catalog.AllowedEdge(a, b) {
					t.Errorf("the prompt says tasks chain freely but %s -> %s is not allowed", a, b)
				}
			}
		}
	}
}

func anyTask(targets []string, isTask map[string]bool) bool {
	for _, t := range targets {
		if isTask[t] {
			return true
		}
	}
	return false
}

// The closing paragraph makes claims about the catalog. If the catalog changes so
// that one is false, this fails and the sentence has to change with it.
func TestPromptClaimsAboutForbiddenEdgesAreTrue(t *testing.T) {
	for _, pair := range [][2]string{
		{"aws_instance.web_server", "aws_db_instance"}, // a server that uses a database
		{"aws_db_instance", "aws_instance.web_server"},
		{"aws_subnet", "aws_security_group"},
		{"aws_security_group", "aws_subnet"},
	} {
		if catalog.AllowedEdge(pair[0], pair[1]) {
			t.Errorf("%s -> %s is allowed now, so the prompt's statement that it is not drawn is false", pair[0], pair[1])
		}
	}
	for _, claim := range []string{"is not connected to it", "a subnet is not connected to a security group"} {
		if !strings.Contains(systemPrompt, claim) {
			t.Errorf("expected the prompt to say %q", claim)
		}
	}
}

// The reading guidance names nodes by ID. If one is renamed, removed or made
// non-placeable, the guidance would point a model at something it cannot use.
func TestReadingGuidanceNamesOnlyPlaceableNodes(t *testing.T) {
	// Every identifier-shaped token (lower case, joined by _ . or -) must be a
	// placeable node, so a typo or a forbidden node such as shell_command fails.
	// The plain-word IDs are listed because no pattern can tell them from prose.
	ids := regexp.MustCompile(`\b[a-z][a-z0-9]*(?:[_.-][a-z0-9]+)+\b`).FindAllString(promptReading, -1)
	if len(ids) < 3 {
		t.Fatalf("found only %v in the guidance; the test pattern is out of date", ids)
	}
	ids = append(ids, "nginx", "nodejs", "postgresql")
	for _, id := range ids {
		n, ok := catalog.Get(id)
		if !ok || !n.AIGeneratable {
			t.Errorf("the prompt's reading guidance names %q, which is not a placeable catalog node", id)
		}
	}
	for _, want := range []string{"static site", "does not mean a storage bucket", "alongside the server", `"notes"`} {
		if !strings.Contains(systemPrompt, want) {
			t.Errorf("prompt lacks %q", want)
		}
	}
}

func TestPromptIsStableAndFramesTheTask(t *testing.T) {
	if buildSystemPrompt() != systemPrompt || buildSystemPrompt() != buildSystemPrompt() {
		t.Error("the prompt must be deterministic")
	}
	for _, want := range []string{toolName, "Never put credentials", "Prefer few nodes", `"Allowed connections"`, `"notes"`, "not instructions"} {
		if !strings.Contains(systemPrompt, want) {
			t.Errorf("prompt lacks %q", want)
		}
	}
	if strings.Contains(systemPrompt, "%!") || strings.Contains(systemPrompt, "{{") {
		t.Error("an unformatted placeholder leaked into the prompt")
	}
	// It is sent with every request, so keep it short. The cap rose from 3,000 to
	// 4,000 bytes (about 150 tokens) for the rules that make the model decline what
	// it cannot build, instead of substituting something else.
	if n := len(systemPrompt); n > 4000 {
		t.Errorf("system prompt is %d bytes", n)
	}
	// It must not carry anything a user typed or any catalog value a model may not see.
	for _, forbidden := range []string{"password", "SuperSecure", "ami-785db401"} {
		if strings.Contains(strings.ToLower(systemPrompt), strings.ToLower(forbidden)) && forbidden != "password" {
			t.Errorf("prompt contains %q", forbidden)
		}
	}
}

// Both providers must send exactly this prompt, so a measurement on one says
// something about the other.
func TestBothProvidersSendTheSameSystemPrompt(t *testing.T) {
	t.Run("claude", func(t *testing.T) {
		s := &stub{status: 200, body: toolResponse}
		srv := s.server(t)
		if _, _, err := newClaude(srv).Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{}}); err != nil {
			t.Fatal(err)
		}
		if got, _ := s.gotBody["system"].(string); got != systemPrompt {
			t.Errorf("Claude sent a different system prompt:\n%s", got)
		}
	})
	t.Run("gemini", func(t *testing.T) {
		s := &geminiStub{status: 200, body: geminiOK}
		srv := s.server(t)
		if _, _, err := newGemini(srv).Generate(context.Background(), GenerateRequest{Prompt: "x", Schema: map[string]any{}}); err != nil {
			t.Fatal(err)
		}
		parts := s.gotBody["systemInstruction"].(map[string]any)["parts"].([]any)
		if got, _ := parts[0].(map[string]any)["text"].(string); got != systemPrompt {
			t.Errorf("Gemini sent a different system prompt:\n%s", got)
		}
	})
}
