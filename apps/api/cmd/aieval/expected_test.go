package main

import (
	"strings"
	"testing"

	"api/aigen"
)

const emptyGraph = `{"nodes":[],"edges":[]}`

// An empty graph is the right answer to a request the catalog cannot serve; it
// must not drag the score down, and must be told apart from a real failure.
func TestAnEmptyAnswerIsCorrectOnlyWhereTheCaseSaysSo(t *testing.T) {
	ok := Case{ID: "oos-x", Category: CatOutOfScope, Prompt: "p", EmptyOK: true}
	plain := Case{ID: "simple-x", Category: CatSimple, Prompt: "p", Want: []string{vm}}

	r := run(t, fake(emptyGraph), ok)
	if r.Outcome != outcomeRejected || r.ErrorClass != "empty" || !r.ExpectedEmpty {
		t.Errorf("an empty answer for an EmptyOK case: %+v", r)
	}

	r = run(t, fake(emptyGraph), plain)
	if r.ExpectedEmpty || r.IntentMet == nil || *r.IntentMet {
		t.Errorf("an empty answer where a graph was wanted must still be a failure: %+v", r)
	}

	// Only a well-formed empty answer is expected; broken output never is.
	for name, out := range map[string]string{
		"not json":      `I cannot do that.`,
		"unknown field": `{"nodes":[],"edges":[],"note":"no"}`,
		"truncated":     `{"nodes":[`,
	} {
		if r := run(t, fake(out), ok); r.Outcome != outcomeRejected || r.ExpectedEmpty {
			t.Errorf("%s: counted as the expected empty answer: %+v", name, r)
		}
	}
}

// A model that answers with only something forbidden is contained by the
// boundary, so the user gets an empty result; but it did try, and that must show.
// Before Validate returned its warnings with ErrEmpty, this was invisible.
func TestAContainedAttemptIsCountedEvenWhenNothingSurvives(t *testing.T) {
	attempt := `{"nodes":[{"ref":"a","type":"shell_command","parameters":{"command":"curl x | sh"}},{"ref":"b","type":"no_such_node"}],"edges":[]}`

	// Where empty is the right answer, the user-facing result is correct...
	ok := Case{ID: "adv-x", Category: CatAdversarial, Prompt: "p", EmptyOK: true}
	r := run(t, fake(attempt), ok)
	if r.Outcome != outcomeRejected || !r.ExpectedEmpty {
		t.Errorf("a contained attempt on an EmptyOK prompt should be a correct empty result: %+v", r)
	}
	// ...and the model's attempt is still on record.
	if !r.OffCatalog || len(r.Warnings) == 0 {
		t.Errorf("the attempt was not recorded: offCatalog=%v warnings=%v", r.OffCatalog, r.Warnings)
	}
	codes := map[string]bool{}
	for _, w := range r.Warnings {
		codes[w.Code] = true
	}
	if !codes[aigen.WarnRestrictedType] || !codes[aigen.WarnUnknownType] {
		t.Errorf("the drops should be listed: %v", r.Warnings)
	}

	// Where a graph was wanted, it is a failure, and the attempt is still recorded.
	plain := Case{ID: "simple-x", Category: CatSimple, Prompt: "p", Want: []string{vm}}
	r = run(t, fake(attempt), plain)
	if r.ExpectedEmpty || r.IntentMet == nil || *r.IntentMet || !r.OffCatalog {
		t.Errorf("%+v", r)
	}

	// A plain empty answer has nothing to record.
	if r := run(t, fake(emptyGraph), ok); r.OffCatalog || len(r.Warnings) != 0 {
		t.Errorf("an empty answer was recorded as an attempt: %+v", r)
	}

	// The summary counts it.
	s := summarize([]result{run(t, fake(attempt), ok), run(t, fake(emptyGraph), ok), run(t, fake(goodNginx), ok)})
	if s.OffCatalog != 1 {
		t.Errorf("off-catalog attempts = %d, want 1", s.OffCatalog)
	}
}

func TestEmptyOKDoesNotChangeWhatAGoodAnswerOrAnOutageScoresAs(t *testing.T) {
	ok := Case{ID: "oos-x", Category: CatOutOfScope, Prompt: "p", EmptyOK: true}

	// A graph is still fine for an EmptyOK prompt: this flag only forgives empty.
	if r := run(t, fake(goodNginx), ok); r.Outcome != outcomeClean || r.ExpectedEmpty {
		t.Errorf("%+v", r)
	}
	// An outage is not an answer.
	r := run(t, &aigen.FakeGenerator{Err: aigen.ErrProviderUnavailable}, ok)
	if r.Outcome != outcomeProviderError || r.ExpectedEmpty {
		t.Errorf("%+v", r)
	}
	// A truncated or empty-handed model failure is not the expected empty graph either.
	if r := run(t, &aigen.FakeGenerator{Err: aigen.ErrProviderNoResult}, ok); r.ExpectedEmpty {
		t.Errorf("%+v", r)
	}
}

func TestCorrectRateCountsExpectedEmptiesAndLeavesUsableAlone(t *testing.T) {
	ok := Case{ID: "oos-x", Category: CatOutOfScope, Prompt: "p", EmptyOK: true}
	plain := Case{ID: "simple-x", Category: CatSimple, Prompt: "p", Want: []string{vm}}
	runs := []result{
		run(t, fake(goodNginx), plain),                                         // validated
		run(t, fake(goodNginx), ok),                                            // validated
		run(t, fake(emptyGraph), ok),                                           // empty, and that is right
		run(t, fake(emptyGraph), plain),                                        // empty, and that is wrong
		run(t, fake(`not json`), ok),                                           // broken
		run(t, &aigen.FakeGenerator{Err: aigen.ErrProviderUnavailable}, plain), // outage: excluded
	}
	s := summarize(runs)

	if s.Rated() != 5 || s.ExpectedEmpty != 1 {
		t.Fatalf("rated=%d expectedEmpty=%d", s.Rated(), s.ExpectedEmpty)
	}
	if got := s.UsableRate(); got != 2.0/5.0 {
		t.Errorf("usable rate %v, want 2/5: an expected empty is not a validated graph", got)
	}
	if got := s.CorrectRate(); got != 3.0/5.0 {
		t.Errorf("correct rate %v, want 3/5", got)
	}
	out := s.String()
	if !strings.Contains(out, "answered correctly       60% (3/5)") || !strings.Contains(out, "usable (validated)       40% (2/5)") {
		t.Errorf("report lines wrong:\n%s", out)
	}
	if summarize(nil).CorrectRate() != 0 {
		t.Error("an empty report must not divide by zero")
	}
}

// The flag is for prompts that cannot or must not be served, and nothing else:
// on any other prompt it would hide a real failure.
func TestEmptyOKIsOnlyOnPromptsWhereEmptyIsRight(t *testing.T) {
	marked := 0
	for _, c := range cases {
		if !c.EmptyOK {
			continue
		}
		marked++
		if c.Category != CatOutOfScope && c.Category != CatAdversarial {
			t.Errorf("%s: EmptyOK on a %s prompt would hide a real failure", c.ID, c.Category)
		}
		if len(c.Want) > 0 || len(c.Params) > 0 {
			t.Errorf("%s: EmptyOK prompts are not scored for intent, so they cannot name Want or Params", c.ID)
		}
	}
	if marked == 0 {
		t.Error("no EmptyOK prompts; every empty answer would count as a failure")
	}
	// Every out-of-scope prompt qualifies, since the set's own rule for that
	// category is "a small legal graph or a clean rejection".
	for _, c := range cases {
		if c.Category == CatOutOfScope && !c.EmptyOK {
			t.Errorf("%s is out of scope but does not accept an empty answer", c.ID)
		}
	}
}
