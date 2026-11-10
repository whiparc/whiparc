package aigen

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"

	"api/catalog"
)

func notesOf(t *testing.T, raw string) []string {
	t.Helper()
	return CleanNotes(json.RawMessage(raw))
}

func TestCleanNotesKeepsPlainSentences(t *testing.T) {
	got := notesOf(t, `["Google Cloud is not available, so it is not included.","The database password cannot be set here."]`)
	want := []string{"Google Cloud is not available, so it is not included.", "The database password cannot be set here."}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %q", got)
	}
}

func TestCleanNotesNeverReturnsNil(t *testing.T) {
	// A nil slice would marshal to JSON null and break a client that maps over it.
	for _, raw := range []string{``, `null`, `[]`, `{}`, `"text"`, `7`, `[1,2]`} {
		got := CleanNotes(json.RawMessage(raw))
		if got == nil || len(got) != 0 {
			t.Errorf("%q: got %#v", raw, got)
		}
	}
}

func TestCleanNotesSkipsWhatIsNotAString(t *testing.T) {
	got := notesOf(t, `[1,null,{"a":1},["x"],"kept"]`)
	if !reflect.DeepEqual(got, []string{"kept"}) {
		t.Errorf("got %q", got)
	}
}

func TestCleanNotesFlattensWhitespaceAndControlCharacters(t *testing.T) {
	got := notesOf(t, `["line one\nline two\r\n\ttabbed\u0000nul‮flipped  spaced"]`)
	if len(got) != 1 {
		t.Fatalf("got %q", got)
	}
	if strings.ContainsAny(got[0], "\n\r\t\x00‮") || strings.Contains(got[0], "  ") {
		t.Errorf("control characters or runs of spaces survived: %q", got[0])
	}
	if got[0] != "line one line two tabbed nul flipped spaced" {
		t.Errorf("got %q", got[0])
	}
}

func TestCleanNotesDropsLinks(t *testing.T) {
	for _, s := range []string{
		"See https://example.test/docs for more.",
		"Visit HTTP://example.test",
		"Go to www.example.test now",
		"Mail mailto:a@example.test",
		"ftp://example.test/file",
	} {
		raw, _ := json.Marshal([]string{s, "kept"})
		got := CleanNotes(raw)
		if !reflect.DeepEqual(got, []string{"kept"}) {
			t.Errorf("%q: got %q", s, got)
		}
	}
}

func TestCleanNotesLimitsCountAndDropsDuplicatesAndBlanks(t *testing.T) {
	in := []string{"", "   ", "A", "a", "B", "C", "D", "E", "F", "G"}
	raw, _ := json.Marshal(in)
	got := CleanNotes(raw)
	if !reflect.DeepEqual(got, []string{"A", "B", "C", "D", "E"}) {
		t.Errorf("got %q", got)
	}
	if len(got) != catalog.MaxNotes {
		t.Errorf("limit is %d, got %d", catalog.MaxNotes, len(got))
	}
}

func TestCleanNotesShortensLongOnesOnARuneBoundary(t *testing.T) {
	long := strings.Repeat("é", catalog.MaxNoteLen*3)
	raw, _ := json.Marshal([]string{long})
	got := CleanNotes(raw)
	if len(got) != 1 {
		t.Fatalf("got %q", got)
	}
	if n := len([]rune(got[0])); n != catalog.MaxNoteLen {
		t.Errorf("length %d, want %d", n, catalog.MaxNoteLen)
	}
	if !strings.HasSuffix(got[0], "...") || strings.ContainsRune(got[0], '�') {
		t.Errorf("bad truncation: %q", got[0])
	}
	// A note exactly at the limit is left alone.
	exact := strings.Repeat("x", catalog.MaxNoteLen)
	raw, _ = json.Marshal([]string{exact})
	if got := CleanNotes(raw); len(got) != 1 || got[0] != exact {
		t.Errorf("a note at the limit was altered")
	}
}

func TestValidateReturnsNotesWithAValidGraph(t *testing.T) {
	res, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"notes":["No Kubernetes."]}`))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Notes, []string{"No Kubernetes."}) {
		t.Errorf("notes = %q", res.Notes)
	}
}

func TestValidateReturnsNotesWhenTheGraphIsEmpty(t *testing.T) {
	// The useful answer to an unsupported request is exactly this: no nodes and a reason.
	res, err := Validate([]byte(`{"nodes":[],"edges":[],"notes":["Google Cloud is not available."]}`))
	if !errors.Is(err, ErrEmpty) || res == nil {
		t.Fatalf("err=%v res=%v", err, res)
	}
	if !reflect.DeepEqual(res.Notes, []string{"Google Cloud is not available."}) {
		t.Errorf("notes = %q", res.Notes)
	}
}

func TestMalformedNotesCostOnlyTheNotes(t *testing.T) {
	for _, notes := range []string{`"a string"`, `{"a":1}`, `7`, `[[1]]`, `null`} {
		res, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"notes":` + notes + `}`))
		if err != nil || res == nil || len(res.Nodes) != 1 {
			t.Errorf("notes=%s: err=%v res=%v", notes, err, res)
			continue
		}
		if res.Notes == nil || len(res.Notes) != 0 {
			t.Errorf("notes=%s: got %#v", notes, res.Notes)
		}
	}
}

func TestNoNotesIsAnEmptyListNotNull(t *testing.T) {
	res, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(res.Notes)
	if string(b) != "[]" {
		t.Errorf("marshals to %s", b)
	}
}

func TestOtherUnknownTopLevelFieldsAreStillRejected(t *testing.T) {
	// Accepting "notes" must not loosen the rule for anything else.
	for _, field := range []string{"note", "comment", "explanation", "system", "notess"} {
		_, err := Validate([]byte(`{"nodes":[{"ref":"a","type":"nginx"}],"edges":[],"` + field + `":["x"]}`))
		if !errors.Is(err, ErrMalformed) {
			t.Errorf("%s: err=%v", field, err)
		}
	}
}
