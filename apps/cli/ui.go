package main

// Small terminal styling layer shared by every command's output: semantic
// colors (success/error/warn/info), a styled table renderer, and a spinner
// for network calls that take a moment. Built on lipgloss, which already
// auto-disables color when NO_COLOR is set or stdout isn't a terminal (e.g.
// piped output, CI logs) — the --no-color flag below is only needed to force
// that off explicitly.

import (
	"fmt"
	"strings"
	"time"

	"github.com/briandowns/spinner"
	"github.com/charmbracelet/lipgloss"
	"github.com/muesli/termenv"
)

var noColorFlag bool

// configureUI applies the explicit --no-color flag on top of lipgloss's own
// automatic NO_COLOR/non-TTY detection (which already runs correctly at
// package-init time regardless of flag-parsing order, since it only reads
// the environment). Called from rootCmd's PersistentPreRun, i.e. after
// cobra has parsed flags but before any command's Run.
func configureUI() {
	if noColorFlag {
		lipgloss.SetColorProfile(termenv.Ascii)
	}
}

var (
	colorSuccess = lipgloss.Color("42")  // green
	colorError   = lipgloss.Color("203") // red
	colorWarn    = lipgloss.Color("214") // amber
	colorInfo    = lipgloss.Color("39")  // cyan
	colorMuted   = lipgloss.Color("244") // grey
	colorAccent  = lipgloss.Color("135") // violet — Whiparc accent

	styleSuccess = lipgloss.NewStyle().Foreground(colorSuccess).Bold(true)
	styleError   = lipgloss.NewStyle().Foreground(colorError).Bold(true)
	styleWarn    = lipgloss.NewStyle().Foreground(colorWarn).Bold(true)
	styleInfo    = lipgloss.NewStyle().Foreground(colorInfo)
	styleMuted   = lipgloss.NewStyle().Foreground(colorMuted)
	styleAccent  = lipgloss.NewStyle().Foreground(colorAccent).Bold(true)
	styleHeading = lipgloss.NewStyle().Bold(true)
)

func printSuccess(format string, args ...any) {
	fmt.Println(styleSuccess.Render("✓") + " " + fmt.Sprintf(format, args...))
}

func printError(format string, args ...any) {
	fmt.Println(styleError.Render("✗") + " " + fmt.Sprintf(format, args...))
}

func printWarn(format string, args ...any) {
	fmt.Println(styleWarn.Render("!") + " " + fmt.Sprintf(format, args...))
}

func printInfo(format string, args ...any) {
	fmt.Println(styleInfo.Render("→") + " " + fmt.Sprintf(format, args...))
}

// printBanner is shown when `whiparc` is run with no subcommand, ahead of
// cobra's own usage listing.
func printBanner() {
	fmt.Println(styleAccent.Render("whiparc") + styleMuted.Render(" — provision, validate, and manage workspaces from your terminal."))
	fmt.Println()
}

// withSpinner runs fn with an animated spinner and label next to it,
// stopping the spinner (and clearing the line) before fn's own output — if
// any — or the caller's next print statement appears. No-ops down to a
// plain label print when color is disabled or stdout isn't a terminal,
// since an animated spinner has no meaning in a log file or CI output.
func withSpinner(label string, fn func() error) error {
	if lipgloss.ColorProfile() == termenv.Ascii {
		fmt.Println(label)
		return fn()
	}

	s := spinner.New(spinner.CharSets[14], 80*time.Millisecond)
	s.Suffix = " " + label
	s.Color("cyan")
	s.Start()
	err := fn()
	s.Stop()
	return err
}

// printTable renders a simple styled table: a bold header row, a muted rule
// beneath it, and left-aligned columns padded to the widest cell in each.
func printTable(headers []string, rows [][]string) {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}

	printRow := func(cells []string, style lipgloss.Style) {
		padded := make([]string, len(cells))
		for i, cell := range cells {
			padded[i] = style.Render(padCell(cell, widths[i]))
		}
		fmt.Println(strings.Join(padded, "  "))
	}

	fmt.Println()
	printRow(headers, styleHeading)

	ruleWidth := 0
	for _, w := range widths {
		ruleWidth += w + 2
	}
	fmt.Println(styleMuted.Render(strings.Repeat("─", ruleWidth)))

	for _, row := range rows {
		printRow(row, lipgloss.NewStyle())
	}
	fmt.Println()
}

func padCell(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}

// styleAgentStatus colorizes a Sandbox Agent's status value (e.g. ACTIVE,
// DISCONNECTED, REVOKED, PENDING) for `sandbox status` output.
func styleAgentStatus(status string) string {
	switch status {
	case "ACTIVE":
		return styleSuccess.Render(status)
	case "REVOKED", "DISCONNECTED":
		return styleError.Render(status)
	default:
		return styleWarn.Render(status)
	}
}

// deployLogStyle colorizes one line of streamed deploy output by the
// `[SYSTEM]`/status markers runDeploy already prints — raw pipeline log
// lines pass through unstyled since they may carry their own formatting.
func styleSystemLine(line string) string {
	switch {
	case strings.Contains(line, "SUCCESS"):
		return styleSuccess.Render(line)
	case strings.Contains(line, "FAILED"):
		return styleError.Render(line)
	default:
		return styleInfo.Render(line)
	}
}
