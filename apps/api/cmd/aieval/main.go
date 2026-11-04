// Command aieval measures how reliably a model provider turns plain-language
// prompts into catalog-legal graphs, which is the Phase 1 exit metric of AI
// mode (docs/plans/ai-mode-phase-1-design.md, section 3).
//
// Each prompt goes through the same path as production: the provider, then
// aigen.Validate, then the layout step. The proposals that validate are written
// to the results file, where a second stage (apps/web, vitest) compiles them
// with the real Terraform and Ansible generators.
//
// It is a manual tool, never run in CI. With the claude provider it makes paid
// API calls, so it refuses to start without -yes.
//
//	ANTHROPIC_API_KEY=... go run ./cmd/aieval -yes
//	go run ./cmd/aieval -provider mock          # free; checks the harness only
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"sort"
	"strings"
	"time"

	"api/aigen"
	"api/catalog"
	"api/importer"
)

const (
	outcomeClean         = "clean"          // validated with no adjustments
	outcomeRepaired      = "repaired"       // validated; the validator dropped or replaced something
	outcomeRejected      = "rejected"       // the model answered but the output was unusable
	outcomeProviderError = "provider_error" // no answer
)

// Error classes. The first three are about reaching or configuring the
// provider, not about the model, so they are excluded from the model's rates.
const (
	classUnavailable = "unavailable"
	classTimeout     = "timeout"
	classRejected    = "provider_rejected" // bad key, bad model name, bad request
	classTruncated   = "truncated"
	classNoResult    = "no_result"
	classOther       = "other"
)

func isInfra(class string) bool {
	return class == classUnavailable || class == classTimeout || class == classRejected || class == classOther
}

// offCatalogCodes are validator warnings that mean the model reached outside
// what the schema allowed.
var offCatalogCodes = map[string]bool{
	aigen.WarnRestrictedType: true, aigen.WarnForbiddenField: true, aigen.WarnParamLocked: true,
	aigen.WarnUnknownType: true, aigen.WarnUnknownParam: true,
}

type result struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Prompt   string `json:"prompt"`

	Outcome    string `json:"outcome"`
	ErrorClass string `json:"errorClass,omitempty"`
	// ErrorDetail is the error text for provider failures. The provider errors
	// carry the HTTP status and error type but never response text.
	ErrorDetail string `json:"errorDetail,omitempty"`

	Warnings  []aigen.Warning `json:"warnings,omitempty"`
	NodeTypes []string        `json:"nodeTypes,omitempty"`

	// IntentMet and ParamsMet are nil when the case does not score them, or when
	// the run never reached the model (infrastructure errors).
	IntentMet  *bool `json:"intentMet,omitempty"`
	ParamsMet  *bool `json:"paramsMet,omitempty"`
	OffCatalog bool  `json:"offCatalog"`
	Leaked     bool  `json:"leaked"`

	InputTokens  int   `json:"inputTokens"`
	OutputTokens int   `json:"outputTokens"`
	LatencyMs    int64 `json:"latencyMs"`

	// Nodes and Edges are the proposal exactly as the endpoint would return it.
	// Raw is kept for unusable answers only, so they can be inspected.
	Nodes json.RawMessage `json:"nodes,omitempty"`
	Edges json.RawMessage `json:"edges,omitempty"`
	Raw   string          `json:"raw,omitempty"`
}

func classify(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return classTimeout
	case errors.Is(err, aigen.ErrProviderTruncated):
		return classTruncated
	case errors.Is(err, aigen.ErrProviderNoResult):
		return classNoResult
	case errors.Is(err, aigen.ErrProviderRejected):
		return classRejected
	case errors.Is(err, aigen.ErrProviderUnavailable):
		return classUnavailable
	}
	return classOther
}

func rejectClass(err error) string {
	switch {
	case errors.Is(err, aigen.ErrTooLarge):
		return "too_large"
	case errors.Is(err, aigen.ErrEmpty):
		return "empty"
	}
	return "malformed"
}

// catalogType recovers the catalog ID from a server-assigned node ID
// ("aws_vpc_1" gives "aws_vpc").
func catalogType(id string) string {
	best := ""
	for _, n := range catalog.AIGeneratable() {
		if !strings.HasPrefix(id, n.ID+"_") || len(n.ID) <= len(best) {
			continue
		}
		if rest := id[len(n.ID)+1:]; rest != "" && strings.Trim(rest, "0123456789") == "" {
			best = n.ID
		}
	}
	return best
}

func ptr(b bool) *bool { return &b }

func runCase(ctx context.Context, gen aigen.Generator, c Case, timeout time.Duration) result {
	r := result{ID: c.ID, Category: c.Category, Prompt: c.Prompt}

	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	start := time.Now()
	raw, usage, err := gen.Generate(cctx, aigen.GenerateRequest{Prompt: c.Prompt, Schema: catalog.JSONSchema()})
	r.LatencyMs = time.Since(start).Milliseconds()
	r.InputTokens, r.OutputTokens = usage.InputTokens, usage.OutputTokens

	scored := func(met bool) {
		if len(c.Want) > 0 {
			r.IntentMet = ptr(met)
		}
		if len(c.Params) > 0 {
			r.ParamsMet = ptr(met)
		}
	}

	if err != nil {
		r.Outcome, r.ErrorClass, r.ErrorDetail = outcomeProviderError, classify(err), truncate(err.Error(), 300)
		if !isInfra(r.ErrorClass) {
			scored(false) // the model was reached and produced nothing usable
		}
		return r
	}

	res, err := aigen.Validate(raw)
	if err != nil {
		r.Outcome, r.ErrorClass = outcomeRejected, rejectClass(err)
		r.Raw = truncate(string(raw), 4000)
		scored(false)
		return r
	}

	r.Warnings = res.Warnings
	r.Outcome = outcomeClean
	if len(res.Warnings) > 0 {
		r.Outcome = outcomeRepaired
	}
	for _, w := range res.Warnings {
		if offCatalogCodes[w.Code] {
			r.OffCatalog = true
		}
	}

	byType := map[string]map[string]any{} // first node of each type: its parameters
	for _, n := range res.Nodes {
		t := catalogType(n.ID)
		r.NodeTypes = append(r.NodeTypes, t)
		if _, seen := byType[t]; !seen {
			byType[t] = n.Data.Parameters
		}
	}

	if len(c.Want) > 0 {
		met := true
		for _, want := range c.Want {
			if _, ok := byType[want]; !ok {
				met = false
			}
		}
		r.IntentMet = ptr(met)
	}
	if len(c.Params) > 0 {
		met := true
		for _, p := range c.Params {
			params, ok := byType[p.Type]
			if !ok {
				met = false
				continue
			}
			got := fmt.Sprint(params[p.Key])
			if (p.Contains && !strings.Contains(got, p.Value)) || (!p.Contains && got != p.Value) {
				met = false
			}
		}
		r.ParamsMet = ptr(met)
	}

	nodes, edges, err := importer.ArrangeNodesAndMerge("", res.Nodes, res.Edges)
	if err != nil {
		r.Outcome, r.ErrorClass = outcomeRejected, "layout"
		return r
	}
	r.Nodes, r.Edges = json.RawMessage(nodes), json.RawMessage(edges)
	for _, bad := range c.MustNotAppear {
		if strings.Contains(nodes, bad) || strings.Contains(edges, bad) {
			r.Leaked = true
		}
	}
	return r
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "...[truncated]"
}

type catStats struct {
	Total         int `json:"total"`
	Clean         int `json:"clean"`
	Repaired      int `json:"repaired"`
	Rejected      int `json:"rejected"`
	ProviderError int `json:"providerError"`
}

type summary struct {
	Total         int `json:"total"`
	Clean         int `json:"clean"`
	Repaired      int `json:"repaired"`
	Rejected      int `json:"rejected"`
	ProviderError int `json:"providerError"`
	// Infra counts runs that never reached the model for reasons that are not
	// the model's doing (network, key, timeout). They are left out of the rates.
	Infra int `json:"infra"`

	IntentCases int `json:"intentCases"`
	IntentMet   int `json:"intentMet"`
	ParamCases  int `json:"paramCases"`
	ParamMet    int `json:"paramMet"`

	OffCatalog int `json:"offCatalog"`
	Leaks      int `json:"leaks"`

	ErrorClasses  map[string]int       `json:"errorClasses"`
	ErrorDetails  map[string]int       `json:"errorDetails,omitempty"`
	WarningCodes  map[string]int       `json:"warningCodes"`
	ByCategory    map[string]*catStats `json:"byCategory"`
	MeanInputTok  float64              `json:"meanInputTokens"`
	MeanOutputTok float64              `json:"meanOutputTokens"`
	P50Ms         int64                `json:"p50Ms"`
	P95Ms         int64                `json:"p95Ms"`
}

// Rated is the number of runs the rates are computed over.
func (s summary) Rated() int { return s.Total - s.Infra }

func rate(n, d int) float64 {
	if d == 0 {
		return 0
	}
	return float64(n) / float64(d)
}

func (s summary) UsableRate() float64 { return rate(s.Clean+s.Repaired, s.Rated()) }
func (s summary) CleanRate() float64  { return rate(s.Clean, s.Rated()) }

func summarize(runs []result) summary {
	s := summary{ErrorClasses: map[string]int{}, ErrorDetails: map[string]int{}, WarningCodes: map[string]int{}, ByCategory: map[string]*catStats{}}
	var latencies []int64
	var inTok, outTok, tokRuns int

	for _, r := range runs {
		s.Total++
		cs := s.ByCategory[r.Category]
		if cs == nil {
			cs = &catStats{}
			s.ByCategory[r.Category] = cs
		}
		cs.Total++

		if r.ErrorClass != "" {
			s.ErrorClasses[r.ErrorClass]++
		}
		if r.ErrorDetail != "" {
			s.ErrorDetails[r.ErrorDetail]++
		}
		infra := r.Outcome == outcomeProviderError && isInfra(r.ErrorClass)
		if infra {
			s.Infra++
		}
		switch r.Outcome {
		case outcomeClean:
			s.Clean++
			cs.Clean++
		case outcomeRepaired:
			s.Repaired++
			cs.Repaired++
		case outcomeRejected:
			s.Rejected++
			cs.Rejected++
		case outcomeProviderError:
			s.ProviderError++
			cs.ProviderError++
		}

		if infra {
			continue
		}
		latencies = append(latencies, r.LatencyMs)
		inTok += r.InputTokens
		outTok += r.OutputTokens
		tokRuns++
		for _, w := range r.Warnings {
			s.WarningCodes[w.Code]++
		}
		if r.IntentMet != nil {
			s.IntentCases++
			if *r.IntentMet {
				s.IntentMet++
			}
		}
		if r.ParamsMet != nil {
			s.ParamCases++
			if *r.ParamsMet {
				s.ParamMet++
			}
		}
		if r.OffCatalog {
			s.OffCatalog++
		}
		if r.Leaked {
			s.Leaks++
		}
	}

	if tokRuns > 0 {
		s.MeanInputTok = float64(inTok) / float64(tokRuns)
		s.MeanOutputTok = float64(outTok) / float64(tokRuns)
	}
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	s.P50Ms = percentile(latencies, 0.50)
	s.P95Ms = percentile(latencies, 0.95)
	return s
}

func percentile(sorted []int64, p float64) int64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(p*float64(len(sorted))+0.9999999) - 1 // nearest rank
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func pct(n, d int) string {
	if d == 0 {
		return "n/a"
	}
	return fmt.Sprintf("%.0f%% (%d/%d)", 100*float64(n)/float64(d), n, d)
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func (s summary) String() string {
	var b strings.Builder
	fmt.Fprintf(&b, "Runs: %d", s.Total)
	if s.Infra > 0 {
		fmt.Fprintf(&b, " (%d did not reach the model and are excluded from the rates below)", s.Infra)
	}
	fmt.Fprintf(&b, "\n\n")
	fmt.Fprintf(&b, "  usable (validated)       %s\n", pct(s.Clean+s.Repaired, s.Rated()))
	fmt.Fprintf(&b, "  clean (no adjustments)   %s\n", pct(s.Clean, s.Rated()))
	fmt.Fprintf(&b, "  repaired                 %d\n", s.Repaired)
	fmt.Fprintf(&b, "  rejected / no answer     %d\n", s.Rejected+s.ProviderError-s.Infra)
	fmt.Fprintf(&b, "  understood the request   %s   (every required block present)\n", pct(s.IntentMet, s.IntentCases))
	fmt.Fprintf(&b, "  set requested values     %s   (parameters the prompt specified)\n", pct(s.ParamMet, s.ParamCases))
	fmt.Fprintf(&b, "  tried off-catalog        %s   (type, field or parameter the schema forbids)\n", pct(s.OffCatalog, s.Rated()))
	fmt.Fprintf(&b, "  boundary leaks           %d   (must be 0)\n", s.Leaks)
	fmt.Fprintf(&b, "\n  tokens per run           %.0f in, %.0f out\n", s.MeanInputTok, s.MeanOutputTok)
	fmt.Fprintf(&b, "  latency                  p50 %dms, p95 %dms\n", s.P50Ms, s.P95Ms)

	fmt.Fprintf(&b, "\nBy category (clean / repaired / rejected / error):\n")
	for _, k := range sortedKeys(s.ByCategory) {
		c := s.ByCategory[k]
		fmt.Fprintf(&b, "  %-13s %2d runs: %d / %d / %d / %d\n", k, c.Total, c.Clean, c.Repaired, c.Rejected, c.ProviderError)
	}
	if len(s.WarningCodes) > 0 {
		fmt.Fprintf(&b, "\nAdjustments by type:\n")
		for _, k := range sortedKeys(s.WarningCodes) {
			fmt.Fprintf(&b, "  %-24s %d\n", k, s.WarningCodes[k])
		}
	}
	if len(s.ErrorClasses) > 0 {
		fmt.Fprintf(&b, "\nFailures by class:\n")
		for _, k := range sortedKeys(s.ErrorClasses) {
			fmt.Fprintf(&b, "  %-24s %d\n", k, s.ErrorClasses[k])
		}
	}
	if len(s.ErrorDetails) > 0 {
		fmt.Fprintf(&b, "\nProvider errors seen:\n")
		for _, k := range sortedKeys(s.ErrorDetails) {
			fmt.Fprintf(&b, "  %3dx  %s\n", s.ErrorDetails[k], k)
		}
	}
	return b.String()
}

// diagnose turns a provider error into the likely cause, for the common
// account and configuration problems. It reads only the status and error type
// the provider error already carries.
func diagnose(detail string) string {
	switch {
	// Google reports its errors by status name. These come first because the
	// same HTTP codes mean something different from Anthropic's.
	case strings.Contains(detail, "status 429"):
		return "The provider is rate limiting or the quota is used up. Free tiers allow only a few requests per minute: raise -delay (for example -delay 8s), wait, or enable billing."
	case strings.Contains(detail, "INVALID_ARGUMENT"):
		return "Gemini refused the request. For Gemini this status is also what an invalid API key returns, so check GEMINI_API_KEY first (copied in full, from Google AI Studio). If the key is right, the model name or the request schema was refused."
	case strings.Contains(detail, "PERMISSION_DENIED"):
		return "The key was rejected, or the Gemini API is not enabled for its project or region."
	case strings.Contains(detail, "FAILED_PRECONDITION"):
		return "The free tier is not available for this account or region. Enable billing on the project in Google AI Studio."
	case strings.Contains(detail, "NOT_FOUND"):
		return "The model name was not found. Check -model / AI_MODEL against the models listed in Google AI Studio."
	case strings.Contains(detail, "status 401"):
		return "The API key was rejected. Check ANTHROPIC_API_KEY (copied in full, no spaces, created in the Console, not a claude.ai login)."
	case strings.Contains(detail, "status 403"):
		return "The key is valid but not permitted to use this model or workspace."
	case strings.Contains(detail, "status 404"):
		return "The model name was not found. Check -model / AI_MODEL against the models your account can use."
	case strings.Contains(detail, "status 400") && strings.Contains(detail, "invalid_request_error"):
		return "The request was refused as invalid. The most common cause for a request that is otherwise well formed is an empty credit balance: API usage is billed separately from a Claude Pro subscription, so check Plans & Billing in the Console and add credit."
	case strings.Contains(detail, "status 400"):
		return "The request was refused as invalid. Check the model name and the Console for account or billing notices."
	}
	return ""
}

type report struct {
	Meta    meta     `json:"meta"`
	Summary summary  `json:"summary"`
	Runs    []result `json:"runs"`
}

type meta struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	StartedAt string `json:"startedAt"`
	Repeat    int    `json:"repeat"`
}

func filterCases(all []Case, only string) []Case {
	if only == "" {
		return all
	}
	var out []Case
	for _, c := range all {
		if strings.Contains(c.ID, only) || strings.Contains(c.Category, only) {
			out = append(out, c)
		}
	}
	return out
}

func main() {
	var (
		provider = flag.String("provider", "claude", "claude, gemini or mock")
		model    = flag.String("model", os.Getenv("AI_MODEL"), "model name; defaults to the provider's own default")
		out      = flag.String("out", "aieval-results.json", "results file")
		repeat   = flag.Int("repeat", 1, "runs per prompt; use 3 or more to see variance")
		only     = flag.String("only", "", "run only cases whose ID or category contains this")
		timeout  = flag.Duration("timeout", 60*time.Second, "limit per call")
		delay    = flag.Duration("delay", 300*time.Millisecond, "pause between calls")
		maxTok   = flag.Int("max-tokens", 0, "output token limit per call; 0 uses the provider's default")
		yes      = flag.Bool("yes", false, "confirm that real provider calls will be made (billed by the provider unless on a free tier)")
	)
	flag.Parse()

	selected := filterCases(cases, *only)
	if len(selected) == 0 || *repeat < 1 {
		fmt.Fprintln(os.Stderr, "no cases selected")
		os.Exit(2)
	}
	calls := len(selected) * *repeat

	// confirm enforces the key and the -yes flag for providers that make real
	// calls, then returns the key.
	confirm := func(keyEnv, modelDefault string) string {
		key := strings.TrimSpace(os.Getenv(keyEnv))
		if key == "" {
			fmt.Fprintf(os.Stderr, "%s is not set. (Use -provider mock to check the harness without a key.)\n", keyEnv)
			os.Exit(2)
		}
		if *model == "" {
			*model = modelDefault
		}
		if !*yes {
			limit := "the provider's default output limit"
			if *maxTok > 0 {
				limit = fmt.Sprintf("an output limit of %d tokens", *maxTok)
			}
			fmt.Fprintf(os.Stderr, "This will make %d calls to model %q (%s each), billed by the provider unless your account is on a free tier.\nRe-run with -yes to proceed.\n", calls, *model, limit)
			os.Exit(2)
		}
		return key
	}

	var gen aigen.Generator
	switch *provider {
	case "mock":
		gen = aigen.Mock{}
	case "claude":
		key := confirm("ANTHROPIC_API_KEY", "claude-sonnet-5-5")
		gen = &aigen.Claude{APIKey: key, Model: *model, MaxTokens: *maxTok, BaseURL: strings.TrimSpace(os.Getenv("ANTHROPIC_BASE_URL"))}
	case "gemini":
		key := confirm("GEMINI_API_KEY", aigen.DefaultGeminiModel)
		gen = &aigen.Gemini{APIKey: key, Model: *model, MaxTokens: *maxTok, BaseURL: strings.TrimSpace(os.Getenv("GEMINI_BASE_URL"))}
	default:
		fmt.Fprintf(os.Stderr, "unknown provider %q\n", *provider)
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	rep := report{Meta: meta{Provider: *provider, Model: *model, StartedAt: time.Now().UTC().Format(time.RFC3339), Repeat: *repeat}}
	fmt.Fprintf(os.Stderr, "Running %d calls (%d prompts x %d)...\n", calls, len(selected), *repeat)
	var stopped string
	rep.Runs, stopped = runAll(ctx, gen, selected, *repeat, *timeout, *delay, os.Stderr)

	rep.Summary = summarize(rep.Runs)
	fmt.Println()
	fmt.Print(rep.Summary.String())
	if stopped != "" {
		fmt.Printf("\nStopped early: %s\n", stopped)
	}

	data, err := json.MarshalIndent(rep, "", "  ")
	if err == nil {
		err = os.WriteFile(*out, data, 0o644)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "could not write %s: %v\n", *out, err)
		os.Exit(1)
	}
	fmt.Printf("\nResults written to %s. To compile the validated proposals with the real generators:\n  cd ../web && AI_EVAL_RESULTS=<path to that file> npx vitest run app/lib/__tests__/aiEval.compile.test.ts\n", *out)
	if stopped != "" {
		os.Exit(1) // a run that ended early did not measure what was asked
	}
}

// abortAfterRejections is how many provider rejections in a row end the run. A
// bad key, a bad model name or an empty balance fails every call the same way,
// so continuing only repeats the failure.
const abortAfterRejections = 3

// runAll runs every selected case, repeat times over. It stops early, returning
// why, when the run is interrupted or the provider rejects consecutive requests.
// Whatever completed is returned either way.
func runAll(ctx context.Context, gen aigen.Generator, selected []Case, repeat int, timeout, delay time.Duration, progress io.Writer) (runs []result, stopped string) {
	rejected := 0
	for i := 0; i < repeat; i++ {
		for _, c := range selected {
			if ctx.Err() != nil {
				return runs, "interrupted; the runs completed so far are kept"
			}
			r := runCase(ctx, gen, c, timeout)
			runs = append(runs, r)
			fmt.Fprintf(progress, "  %-22s %-14s %5dms\n", c.ID, r.Outcome+suffix(r.ErrorClass), r.LatencyMs)

			// Rejections and rate limiting both repeat identically on every
			// following call, so neither is worth continuing through.
			if r.ErrorClass == classRejected || strings.Contains(r.ErrorDetail, "status 429") {
				rejected++
			} else {
				rejected = 0
			}
			if rejected >= abortAfterRejections {
				msg := fmt.Sprintf("the provider refused %d requests in a row (%s).", rejected, r.ErrorDetail)
				if hint := diagnose(r.ErrorDetail); hint != "" {
					msg += "\n" + hint
				}
				return runs, msg
			}
			time.Sleep(delay)
		}
	}
	return runs, ""
}

func suffix(class string) string {
	if class == "" {
		return ""
	}
	return " (" + class + ")"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
