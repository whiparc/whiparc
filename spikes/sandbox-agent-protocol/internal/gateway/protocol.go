package gateway

import (
	"encoding/json"
	"fmt"
	"io"
)

// streamHeader is the tiny routing envelope the Gateway writes as the first line
// of every yamux stream it opens toward an Agent. It is Gateway/Agent control
// protocol, not application payload — the Agent parses this one line to decide
// which local service to dial, then the connection becomes an opaque byte pipe
// that neither side interprets further (see 03.6's "deliberately dumb" Gateway).
type streamHeader struct {
	Service string `json:"service"`
}

// writeLine writes s followed by a single "\n" in one Write call.
func writeLine(w io.Writer, s string) error {
	_, err := w.Write([]byte(s + "\n"))
	return err
}

// readLine reads bytes one at a time up to and including a trailing "\n" (which is
// stripped), so it never reads past the line into bytes that belong to the raw
// stream that follows (a buffered reader would over-read into that data). This
// only runs once per stream, on a single short control line, so the per-byte
// read cost is negligible.
func readLine(r io.Reader) (string, error) {
	var buf []byte
	b := make([]byte, 1)
	for {
		n, err := r.Read(b)
		if n == 1 {
			if b[0] == '\n' {
				return string(buf), nil
			}
			buf = append(buf, b[0])
		}
		if err != nil {
			return "", err
		}
	}
}

func writeHeader(w io.Writer, service string) error {
	b, err := json.Marshal(streamHeader{Service: service})
	if err != nil {
		return err
	}
	return writeLine(w, string(b))
}

func readHeader(r io.Reader) (streamHeader, error) {
	line, err := readLine(r)
	if err != nil {
		return streamHeader{}, err
	}
	var h streamHeader
	if err := json.Unmarshal([]byte(line), &h); err != nil {
		return streamHeader{}, fmt.Errorf("gateway: malformed stream header: %w", err)
	}
	return h, nil
}

const (
	ackOK = "OK"
)

func ackErr(reason string) string {
	return "ERR: " + reason
}
