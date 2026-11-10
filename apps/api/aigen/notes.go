package aigen

import (
	"encoding/json"
	"strings"
	"unicode"
	"unicode/utf8"

	"api/catalog"
)

// CleanNotes turns the model's optional "notes" value into text that is safe to
// show a user. Notes are the one place a model's free text reaches the screen, so
// they get the least trust of anything it sends:
//
//   - anything that is not a list of strings yields no notes, never an error;
//   - control characters and line breaks become single spaces, so a note cannot
//     fake a layout or hide text;
//   - a note containing a link is dropped, because a note is a statement about what
//     was left out and has no reason to point anywhere;
//   - notes are de-duplicated, and both their number and their length are capped.
//
// The result is plain text. The review step renders it as text, never as markup.
func CleanNotes(raw json.RawMessage) []string {
	out := []string{}
	var in []json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &in) != nil {
		return out
	}
	seen := map[string]bool{}
	for _, item := range in {
		var s string
		if json.Unmarshal(item, &s) != nil {
			continue
		}
		s = tidyNote(s)
		if s == "" || hasLink(s) || seen[strings.ToLower(s)] {
			continue
		}
		seen[strings.ToLower(s)] = true
		out = append(out, s)
		if len(out) == catalog.MaxNotes {
			break
		}
	}
	return out
}

// tidyNote collapses whitespace and control characters to single spaces and
// shortens the note to the length limit.
func tidyNote(s string) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || unicode.IsControl(r) || !unicode.IsPrint(r) && r != ' ' {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if utf8.RuneCountInString(s) > catalog.MaxNoteLen {
		r := []rune(s)
		s = strings.TrimSpace(string(r[:catalog.MaxNoteLen-3])) + "..."
	}
	return s
}

func hasLink(s string) bool {
	l := strings.ToLower(s)
	return strings.Contains(l, "://") || strings.Contains(l, "www.") || strings.Contains(l, "mailto:")
}
