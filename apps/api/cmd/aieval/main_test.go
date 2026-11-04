package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"api/aigen"
	"api/catalog"
)

func fake(out string) *aigen.FakeGenerator {
	return &aigen.FakeGenerator{Output: json.RawMessage(out), Usage: aigen.Usage{InputTokens: 100, OutputTokens: 40}}
}

func run(t *testing.T, gen aigen.Generator, c Case) result {
	t.Helper()
	return runCase(context.Background(), gen, c, time.Second)
}

// The prompt set is data the whole evaluation rests on, so it is checked like
// code: a typo in a type name would silently turn a requirement into a miss.
func TestPromptSetIsWellFormed(t *testing.T) {
	if len(cases) < 30 {
		t.Errorf("only %d prompts; the design calls for about 30", len(cases))
	}
	ids := map[string]bool{}
	perCategory := map[string]int{}
	for _, c := range cases {
		if ids[c.ID] || c.ID == "" {
			t.Errorf("duplicate or empty ID %q", c.ID)
		}
		ids[c.ID] = true
		perCategory[c.Category]++
		if n := len([]rune(c.Prompt)); n == 0 || n > catalog.MaxPromptLen {
			t.Errorf("%s: prompt length %d", c.ID, n)
		}
		for _, w := range c.Want {
			if n, ok := catalog.Get(w); !ok || !n.AIGeneratable {
				t.Errorf("%s: wants %q, which a model cannot place", c.ID, w)
			}
		}
		if len(c.MustNotAppear) > 0 && c.Category != CatAdversarial {
			t.Errorf("%s: MustNotAppear belongs on adversarial cases", c.ID)
		}
		if c.Category == CatOutOfScope && (len(c.Want) > 0 || len(c.Params) > 0) {
			t.Errorf("%s: out-of-scope cases are not scored for intent", c.ID)
		}
	}
	for _, cat := range []string{CatSimple, CatStack, CatDetail, CatOutOfScope, CatAdversarial} {
		if perCategory[cat] == 0 {
			t.Errorf("no cases in category %s", cat)
		}
	}
}

// A parameter check is only fair if the validator would accept the value it
// expects. Otherwise the model could be right and still score as wrong.
func TestExpectedParameterValuesAreAcceptable(t *testing.T) {
	for _, c := range cases {
		for _, p := range c.Params {
			node, ok := catalog.Get(p.Type)
			if !ok {
				t.Fatalf("%s: unknown type %s", c.ID, p.Type)
			}
			def, ok := node.Param(p.Key)
			if !ok || !def.AISettable {
				t.Errorf("%s: %s.%s is not a model-settable parameter", c.ID, p.Type, p.Key)
				continue
			}
			var lit string
			switch def.Type {
			case catalog.ParamInt, catalog.ParamBool:
				lit = p.Value
			default:
				lit = fmt.Sprintf("%q", p.Value)
			}
			if p.Contains {
				lit = fmt.Sprintf("%q", p.Value) // a fragment of a longer string
			}
			raw := fmt.Sprintf(`{"nodes":[{"ref":"a","type":%q,"parameters":{%q:%s}}],"edges":[]}`, p.Type, p.Key, lit)
			res, err := aigen.Validate([]byte(raw))
			if err != nil {
				t.Errorf("%s: %v", c.ID, err)
				continue
			}
			for _, w := range res.Warnings {
				if w.Code == aigen.WarnInvalidParam || w.Code == aigen.WarnParamLocked {
					t.Errorf("%s: validator rejects the expected value %s=%s: %s", c.ID, p.Key, p.Value, w.Message)
				}
			}
		}
	}
}

func TestCatalogTypeRecoversTheCatalogID(t *testing.T) {
	for id, want := range map[string]string{
		"aws_vpc_1":                 "aws_vpc",
		"aws_instance.web_server_2": "aws_instance.web_server",
		"update-packages_10":        "update-packages",
		"nginx_1":                   "nginx",
		"aws_vpc":                   "",
		"mystery_1":                 "",
	} {
		if got := catalogType(id); got != want {
			t.Errorf("catalogType(%q) = %q, want %q", id, got, want)
		}
	}
}

const goodNginx = `{"nodes":[{"ref":"vm","type":"aws_instance.web_server","parameters":{"instanceType":"t3.small","rootVolumeSize":50}},{"ref":"web","type":"nginx"}],"edges":[{"source":"vm","target":"web"}]}`

func TestRunCaseOutcomes(t *testing.T) {
	want := Case{ID: "x", Category: CatSimple, Prompt: "p", Want: []string{vm, "nginx"}}

	t.Run("clean", func(t *testing.T) {
		r := run(t, fake(goodNginx), want)
		if r.Outcome != outcomeClean || r.IntentMet == nil || !*r.IntentMet || r.OffCatalog || r.Leaked {
			t.Errorf("%+v", r)
		}
		if r.InputTokens != 100 || r.OutputTokens != 40 || len(r.NodeTypes) != 2 || len(r.Nodes) == 0 || len(r.Edges) == 0 {
			t.Errorf("run data missing: %+v", r)
		}
	})

	t.Run("repaired by dropping an unplaceable node, flagged off-catalog", func(t *testing.T) {
		r := run(t, fake(`{"nodes":[{"ref":"vm","type":"aws_instance.web_server"},{"ref":"web","type":"nginx"},{"ref":"sh","type":"shell_command"}],"edges":[]}`), want)
		if r.Outcome != outcomeRepaired || !r.OffCatalog || len(r.Warnings) == 0 {
			t.Errorf("%+v", r)
		}
		if len(r.NodeTypes) != 2 {
			t.Errorf("dropped node still reported: %v", r.NodeTypes)
		}
	})

	t.Run("repair that is not off-catalog (a renamed duplicate)", func(t *testing.T) {
		r := run(t, fake(`{"nodes":[{"ref":"a","type":"aws_subnet"},{"ref":"b","type":"aws_subnet"}],"edges":[]}`), Case{ID: "x", Category: CatSimple, Prompt: "p"})
		if r.Outcome != outcomeRepaired || r.OffCatalog {
			t.Errorf("%+v", r)
		}
	})

	t.Run("rejected output counts as a miss on intent", func(t *testing.T) {
		r := run(t, fake(`Sure, here you go!`), want)
		if r.Outcome != outcomeRejected || r.ErrorClass != "malformed" || r.IntentMet == nil || *r.IntentMet {
			t.Errorf("%+v", r)
		}
		if r.Raw == "" || len(r.Nodes) != 0 {
			t.Errorf("raw output should be kept and nodes absent: %+v", r)
		}
	})

	t.Run("empty graph", func(t *testing.T) {
		if r := run(t, fake(`{"nodes":[],"edges":[]}`), want); r.Outcome != outcomeRejected || r.ErrorClass != "empty" {
			t.Errorf("%+v", r)
		}
	})

	t.Run("model failures count against the model", func(t *testing.T) {
		for _, err := range []error{aigen.ErrProviderTruncated, aigen.ErrProviderNoResult} {
			r := run(t, &aigen.FakeGenerator{Err: err}, want)
			if r.Outcome != outcomeProviderError || isInfra(r.ErrorClass) || r.IntentMet == nil || *r.IntentMet {
				t.Errorf("%v: %+v", err, r)
			}
		}
	})

	t.Run("infrastructure failures are not scored", func(t *testing.T) {
		for err, class := range map[error]string{
			fmt.Errorf("%w: boom", aigen.ErrProviderUnavailable): classUnavailable,
			fmt.Errorf("%w: 401", aigen.ErrProviderRejected):     classRejected,
			context.DeadlineExceeded:                             classTimeout,
			errors.New("something else"):                         classOther,
		} {
			r := run(t, &aigen.FakeGenerator{Err: err}, want)
			if r.Outcome != outcomeProviderError || r.ErrorClass != class || !isInfra(class) || r.IntentMet != nil {
				t.Errorf("%v: %+v", err, r)
			}
		}
	})
}

func TestIntentAndParameterScoring(t *testing.T) {
	c := Case{ID: "d", Category: CatDetail, Prompt: "p", Want: []string{vm, "nginx"},
		Params: []ParamCheck{{vm, "instanceType", "t3.small", false}, {vm, "rootVolumeSize", "50", false}}}

	r := run(t, fake(goodNginx), c)
	if !*r.IntentMet || !*r.ParamsMet {
		t.Errorf("exact match scored as a miss: %+v", r)
	}

	// Right blocks, wrong value.
	r = run(t, fake(`{"nodes":[{"ref":"vm","type":"aws_instance.web_server","parameters":{"instanceType":"t3.large","rootVolumeSize":50}},{"ref":"web","type":"nginx"}],"edges":[]}`), c)
	if !*r.IntentMet || *r.ParamsMet {
		t.Errorf("wrong value not detected: intent=%v params=%v", *r.IntentMet, *r.ParamsMet)
	}

	// Value requested but the model left it out: the default is not a match.
	r = run(t, fake(`{"nodes":[{"ref":"vm","type":"aws_instance.web_server"},{"ref":"web","type":"nginx"}],"edges":[]}`), c)
	if *r.ParamsMet {
		t.Error("a default was credited as the requested value")
	}

	// A missing block fails intent.
	r = run(t, fake(`{"nodes":[{"ref":"vm","type":"aws_instance.web_server","parameters":{"instanceType":"t3.small","rootVolumeSize":50}}],"edges":[]}`), c)
	if *r.IntentMet {
		t.Error("missing nginx not detected")
	}

	t.Run("contains", func(t *testing.T) {
		pc := Case{ID: "p", Category: CatDetail, Prompt: "p", Params: []ParamCheck{{"apt_install", "packages", "unzip", true}}}
		if r := run(t, fake(`{"nodes":[{"ref":"a","type":"apt_install","parameters":{"packages":"git, jq, unzip"}}],"edges":[]}`), pc); !*r.ParamsMet {
			t.Error("substring not matched")
		}
		if r := run(t, fake(`{"nodes":[{"ref":"a","type":"apt_install","parameters":{"packages":"git, jq"}}],"edges":[]}`), pc); *r.ParamsMet {
			t.Error("missing substring matched")
		}
	})

	t.Run("an unscored case has no verdicts", func(t *testing.T) {
		r := run(t, fake(goodNginx), Case{ID: "o", Category: CatOutOfScope, Prompt: "p"})
		if r.IntentMet != nil || r.ParamsMet != nil {
			t.Errorf("%+v", r)
		}
	})
}

func TestLeakDetection(t *testing.T) {
	c := Case{ID: "a", Category: CatAdversarial, Prompt: "p", MustNotAppear: []string{"hunter2"}}

	// A forbidden string in a field the catalog does accept is a real leak and
	// must be reported, not assumed away.
	leaky := `{"nodes":[{"ref":"b","type":"aws_s3_bucket","parameters":{"bucketName":"hunter2-bucket"}}],"edges":[]}`
	if r := run(t, fake(leaky), c); !r.Leaked {
		t.Error("a forbidden string in the output was not reported")
	}

	// The password parameter is locked, so the same string there is dropped.
	locked := `{"nodes":[{"ref":"d","type":"aws_db_instance","parameters":{"password":"hunter2"}}],"edges":[]}`
	r := run(t, fake(locked), c)
	if r.Leaked || !r.OffCatalog || r.Outcome != outcomeRepaired {
		t.Errorf("locked parameter not contained: %+v", r)
	}
}

func TestSummaryRatesExcludeInfrastructureFailures(t *testing.T) {
	yes, no := true, false
	runs := []result{
		{Category: CatSimple, Outcome: outcomeClean, IntentMet: &yes, InputTokens: 100, OutputTokens: 50, LatencyMs: 100},
		{Category: CatSimple, Outcome: outcomeClean, IntentMet: &no, InputTokens: 200, OutputTokens: 70, LatencyMs: 300},
		{Category: CatStack, Outcome: outcomeRepaired, Warnings: []aigen.Warning{{Code: "renamed"}, {Code: "restricted_type"}}, OffCatalog: true, ParamsMet: &yes, LatencyMs: 200},
		{Category: CatStack, Outcome: outcomeRejected, ErrorClass: "malformed", IntentMet: &no, LatencyMs: 400},
		{Category: CatAdversarial, Outcome: outcomeProviderError, ErrorClass: classTruncated, LatencyMs: 500},
		{Category: CatAdversarial, Outcome: outcomeProviderError, ErrorClass: classUnavailable, LatencyMs: 5},
		{Category: CatAdversarial, Outcome: outcomeClean, Leaked: true, LatencyMs: 150},
	}
	s := summarize(runs)

	if s.Total != 7 || s.Infra != 1 || s.Rated() != 6 {
		t.Fatalf("total=%d infra=%d rated=%d", s.Total, s.Infra, s.Rated())
	}
	if s.Clean != 3 || s.Repaired != 1 || s.Rejected != 1 || s.ProviderError != 2 {
		t.Errorf("counts: %+v", s)
	}
	if got := s.UsableRate(); got != 4.0/6.0 {
		t.Errorf("usable rate %v, want 4/6 (the unreachable run is excluded)", got)
	}
	if got := s.CleanRate(); got != 3.0/6.0 {
		t.Errorf("clean rate %v", got)
	}
	if s.IntentCases != 3 || s.IntentMet != 1 || s.ParamCases != 1 || s.ParamMet != 1 {
		t.Errorf("scoring: %+v", s)
	}
	if s.OffCatalog != 1 || s.Leaks != 1 {
		t.Errorf("off-catalog %d, leaks %d", s.OffCatalog, s.Leaks)
	}
	if s.WarningCodes["renamed"] != 1 || s.ErrorClasses[classUnavailable] != 1 || s.ErrorClasses["malformed"] != 1 {
		t.Errorf("breakdowns: %+v %+v", s.WarningCodes, s.ErrorClasses)
	}
	if s.ByCategory[CatStack].Total != 2 || s.ByCategory[CatAdversarial].ProviderError != 2 {
		t.Errorf("categories: %+v", s.ByCategory)
	}
	// Tokens and latency are averaged over runs that reached the model (6).
	if s.MeanInputTok != 300.0/6.0 || s.P95Ms != 500 || s.P50Ms != 200 {
		t.Errorf("tokens/latency: %v %d %d", s.MeanInputTok, s.P50Ms, s.P95Ms)
	}

	out := s.String()
	for _, want := range []string{"Runs: 7", "excluded from the rates", "boundary leaks           1", "By category", "renamed"} {
		if !strings.Contains(out, want) {
			t.Errorf("report is missing %q:\n%s", want, out)
		}
	}
}

func TestSummaryOfNothingDoesNotDivideByZero(t *testing.T) {
	s := summarize(nil)
	if s.UsableRate() != 0 || s.P95Ms != 0 || !strings.Contains(s.String(), "n/a") {
		t.Errorf("%+v\n%s", s, s.String())
	}
}

func TestPercentile(t *testing.T) {
	data := []int64{10, 20, 30, 40, 50, 60, 70, 80, 90, 100}
	for p, want := range map[float64]int64{0.5: 50, 0.95: 100, 0.1: 10, 1: 100} {
		if got := percentile(data, p); got != want {
			t.Errorf("p%v = %d, want %d", p, got, want)
		}
	}
	if percentile(nil, 0.5) != 0 || percentile([]int64{7}, 0.95) != 7 {
		t.Error("edge cases")
	}
}

func TestFilterCases(t *testing.T) {
	if len(filterCases(cases, "")) != len(cases) {
		t.Error("empty filter should keep everything")
	}
	for _, c := range filterCases(cases, CatAdversarial) {
		if c.Category != CatAdversarial {
			t.Errorf("%s slipped through", c.ID)
		}
	}
	if len(filterCases(cases, "no-such")) != 0 {
		t.Error("unmatched filter should select nothing")
	}
}

// The whole set through the mock provider: checks the harness end to end with
// no key and no cost. The mock is not a model, so no rate is asserted, only that
// every run completes, validates, and stays inside the boundary.
func TestEveryCaseRunsThroughTheMockProvider(t *testing.T) {
	var runs []result
	for _, c := range cases {
		r := runCase(context.Background(), aigen.Mock{}, c, 5*time.Second)
		if r.Outcome != outcomeClean {
			t.Errorf("%s: mock output was %s (%s) %+v", c.ID, r.Outcome, r.ErrorClass, r.Warnings)
		}
		if r.Leaked {
			t.Errorf("%s: leaked", c.ID)
		}
		if len(r.Nodes) == 0 || len(r.Edges) == 0 {
			t.Errorf("%s: proposal not captured", c.ID)
		}
		runs = append(runs, r)
	}
	rep := report{Meta: meta{Provider: "mock"}, Summary: summarize(runs), Runs: runs}
	b, err := json.Marshal(rep)
	if err != nil {
		t.Fatal(err)
	}
	var back report
	if err := json.Unmarshal(b, &back); err != nil || len(back.Runs) != len(cases) || back.Summary.Total != len(cases) {
		t.Errorf("report does not round-trip: %v", err)
	}
	// Each run carries what the compile stage reads.
	var probe struct {
		Runs []struct {
			ID      string          `json:"id"`
			Outcome string          `json:"outcome"`
			Nodes   json.RawMessage `json:"nodes"`
			Edges   json.RawMessage `json:"edges"`
		} `json:"runs"`
	}
	if err := json.Unmarshal(b, &probe); err != nil || len(probe.Runs) == 0 || probe.Runs[0].ID == "" || len(probe.Runs[0].Nodes) == 0 {
		t.Errorf("results file shape changed: %v", err)
	}
}

func TestRunAllStopsWhenTheProviderKeepsRejecting(t *testing.T) {
	// 401, then the pattern for an empty balance (400 invalid_request_error).
	for _, detail := range []string{"status 401 (authentication_error)", "status 400 (invalid_request_error)"} {
		gen := &aigen.FakeGenerator{Err: fmt.Errorf("%w: %s", aigen.ErrProviderRejected, detail)}
		runs, stopped := runAll(context.Background(), gen, cases, 3, time.Second, 0, io.Discard)
		if len(runs) != abortAfterRejections || len(gen.Requests()) != abortAfterRejections {
			t.Errorf("%s: made %d calls, want %d", detail, len(gen.Requests()), abortAfterRejections)
		}
		if !strings.Contains(stopped, detail) || diagnose(runs[0].ErrorDetail) == "" || !strings.Contains(stopped, diagnose(runs[0].ErrorDetail)) {
			t.Errorf("stop message lacks the cause and the hint: %q", stopped)
		}
		if runs[0].ErrorDetail != detail && !strings.HasSuffix(runs[0].ErrorDetail, detail) {
			t.Errorf("detail not recorded: %q", runs[0].ErrorDetail)
		}
	}

	t.Run("a success in between resets the count", func(t *testing.T) {
		g := &flaky{failEvery: 3} // fails on calls 1, 2, then succeeds on 3, fails 4, 5, ...
		runs, stopped := runAll(context.Background(), g, cases[:9], 1, time.Second, 0, io.Discard)
		if stopped != "" || len(runs) != 9 {
			t.Errorf("stopped=%q after %d runs", stopped, len(runs))
		}
	})

	t.Run("other failures never trigger the early stop", func(t *testing.T) {
		gen := &aigen.FakeGenerator{Err: fmt.Errorf("%w: status 503", aigen.ErrProviderUnavailable)}
		runs, stopped := runAll(context.Background(), gen, cases[:6], 1, time.Second, 0, io.Discard)
		if stopped != "" || len(runs) != 6 {
			t.Errorf("stopped=%q after %d runs", stopped, len(runs))
		}
	})

	t.Run("interruption keeps what finished", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		runs, stopped := runAll(ctx, aigen.Mock{}, cases, 1, time.Second, 0, io.Discard)
		if len(runs) != 0 || !strings.Contains(stopped, "interrupted") {
			t.Errorf("runs=%d stopped=%q", len(runs), stopped)
		}
	})

	t.Run("a healthy run completes", func(t *testing.T) {
		runs, stopped := runAll(context.Background(), aigen.Mock{}, cases, 2, time.Second, 0, io.Discard)
		if stopped != "" || len(runs) != 2*len(cases) {
			t.Errorf("stopped=%q runs=%d", stopped, len(runs))
		}
	})
}

// flaky rejects two calls, accepts one, and repeats.
type flaky struct{ n, failEvery int }

func (f *flaky) Generate(ctx context.Context, req aigen.GenerateRequest) (json.RawMessage, aigen.Usage, error) {
	f.n++
	if f.n%f.failEvery != 0 {
		return nil, aigen.Usage{}, fmt.Errorf("%w: status 400", aigen.ErrProviderRejected)
	}
	return aigen.Mock{}.Generate(ctx, req)
}

func TestDiagnoseNamesTheLikelyCause(t *testing.T) {
	for detail, want := range map[string]string{
		"status 401 (authentication_error)":  "API key",
		"status 403 (permission_error)":      "not permitted",
		"status 404 (not_found_error)":       "model name",
		"status 400 (invalid_request_error)": "credit",
		"status 400":                         "refused",
		"status 500":                         "",
		"":                                   "",
	} {
		got := diagnose(detail)
		if want == "" && got != "" || want != "" && !strings.Contains(got, want) {
			t.Errorf("diagnose(%q) = %q, want it to mention %q", detail, got, want)
		}
	}
}

func TestProviderErrorsAppearInTheSummary(t *testing.T) {
	r := run(t, &aigen.FakeGenerator{Err: fmt.Errorf("%w: status 400 (invalid_request_error)", aigen.ErrProviderRejected)}, cases[0])
	s := summarize([]result{r, r})
	if s.ErrorDetails["provider rejected"] != 0 && len(s.ErrorDetails) != 1 {
		t.Errorf("%v", s.ErrorDetails)
	}
	if out := s.String(); !strings.Contains(out, "Provider errors seen") || !strings.Contains(out, "2x") || !strings.Contains(out, "invalid_request_error") {
		t.Errorf("summary hides the cause:\n%s", out)
	}
}

func TestDiagnoseKnowsGeminiStatuses(t *testing.T) {
	for detail, want := range map[string]string{
		"status 400 (INVALID_ARGUMENT)":    "GEMINI_API_KEY", // Gemini reports a bad key this way
		"status 403 (PERMISSION_DENIED)":   "not enabled",
		"status 400 (FAILED_PRECONDITION)": "free tier",
		"status 404 (NOT_FOUND)":           "model name",
		"status 429 (RESOURCE_EXHAUSTED)":  "-delay",
		"status 429":                       "-delay",
	} {
		if got := diagnose(detail); !strings.Contains(got, want) {
			t.Errorf("diagnose(%q) = %q, want it to mention %q", detail, got, want)
		}
	}
	// A Claude error must still get the Claude advice.
	if got := diagnose("status 400 (invalid_request_error)"); !strings.Contains(got, "credit") {
		t.Errorf("Claude hint lost: %q", got)
	}
}

func TestRunAllStopsOnRepeatedRateLimiting(t *testing.T) {
	gen := &aigen.FakeGenerator{Err: fmt.Errorf("%w: status 429 (RESOURCE_EXHAUSTED)", aigen.ErrProviderUnavailable)}
	runs, stopped := runAll(context.Background(), gen, cases, 1, time.Second, 0, io.Discard)
	if len(runs) != abortAfterRejections || !strings.Contains(stopped, "-delay") || !strings.Contains(stopped, "RESOURCE_EXHAUSTED") {
		t.Errorf("made %d calls; stopped = %q", len(runs), stopped)
	}
	// They are still infrastructure failures: excluded from the model's rates.
	if s := summarize(runs); s.Infra != len(runs) || s.Rated() != 0 {
		t.Errorf("rate-limited runs counted against the model: %+v", s)
	}
}
