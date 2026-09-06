// Package wsconn adapts a gorilla/websocket connection into an io.ReadWriteCloser
// so a byte-stream multiplexer (yamux) can run on top of a WebSocket the same way
// it would over a raw TCP socket.
//
// gorilla/websocket only exposes message framing (ReadMessage/WriteMessage,
// NextReader/NextWriter), not a plain byte stream. yamux needs the latter: a Read
// that returns whatever bytes are available and a Write that never fragments
// application data across message boundaries the caller doesn't control. This
// wrapper buffers partial reads across WS messages and writes one WS binary
// message per Write call.
package wsconn

import (
	"io"
	"net"
	"time"

	"github.com/gorilla/websocket"
)

// Conn wraps a *websocket.Conn as an io.ReadWriteCloser (and a best-effort net.Conn).
// Only one goroutine may call Read at a time, and only one goroutine may call Write
// at a time — the same concurrency contract gorilla/websocket itself requires, and
// the same one yamux's own use of the underlying conn relies on.
type Conn struct {
	ws     *websocket.Conn
	reader io.Reader
}

// New wraps ws for use as a yamux transport.
func New(ws *websocket.Conn) *Conn {
	return &Conn{ws: ws}
}

func (c *Conn) Read(p []byte) (int, error) {
	for {
		if c.reader == nil {
			msgType, r, err := c.ws.NextReader()
			if err != nil {
				return 0, err
			}
			if msgType != websocket.BinaryMessage {
				// Ignore non-binary frames (e.g. an errant text/control message)
				// and wait for the next one rather than surfacing an error.
				continue
			}
			c.reader = r
		}

		n, err := c.reader.Read(p)
		if n > 0 {
			return n, nil
		}
		if err == io.EOF {
			c.reader = nil
			continue
		}
		if err != nil {
			return 0, err
		}
	}
}

func (c *Conn) Write(p []byte) (int, error) {
	if err := c.ws.WriteMessage(websocket.BinaryMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func (c *Conn) Close() error {
	return c.ws.Close()
}

// The remaining methods satisfy net.Conn, which yamux does not require but which
// keeps this wrapper usable anywhere a net.Conn is expected.

func (c *Conn) LocalAddr() net.Addr  { return c.ws.LocalAddr() }
func (c *Conn) RemoteAddr() net.Addr { return c.ws.RemoteAddr() }

func (c *Conn) SetDeadline(t time.Time) error {
	if err := c.ws.SetReadDeadline(t); err != nil {
		return err
	}
	return c.ws.SetWriteDeadline(t)
}

func (c *Conn) SetReadDeadline(t time.Time) error  { return c.ws.SetReadDeadline(t) }
func (c *Conn) SetWriteDeadline(t time.Time) error { return c.ws.SetWriteDeadline(t) }
