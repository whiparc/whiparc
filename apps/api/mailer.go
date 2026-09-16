package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/mail"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"
)

// sanitizeHeaderField removes CR, LF, and null characters to prevent SMTP header injection (CWE-640).
func sanitizeHeaderField(s string) string {
	s = strings.ReplaceAll(s, "\r", "")
	s = strings.ReplaceAll(s, "\n", "")
	s = strings.ReplaceAll(s, "\x00", "")
	return strings.TrimSpace(s)
}

// EmailSender defines the interface for delivering outbound transactional emails.
type EmailSender interface {
	SendVerificationEmail(toEmail, toName, verificationLink string) error
}

// ConsoleMailer logs transactional emails directly to the server logs for local development.
type ConsoleMailer struct{}

func (c *ConsoleMailer) SendVerificationEmail(toEmail, toName, verificationLink string) error {
	cleanName := sanitizeHeaderField(toName)
	cleanEmail := sanitizeHeaderField(toEmail)
	cleanLink := sanitizeHeaderField(verificationLink)

	divider := strings.Repeat("=", 70)
	log.Printf("\n%s\n[EMAIL DISPATCH - LOCAL/DEV CONSOLE MODE]\nTo: %s <%s>\nSubject: Verify your Whiparc account\nAction Link: %s\nExpires: in 24 hours\n%s\n",
		divider, cleanName, cleanEmail, cleanLink, divider)
	return nil
}

// ResendMailer sends emails via the Resend REST API (https://resend.com).
type ResendMailer struct {
	apiKey string
	from   string
	client *http.Client
}

func (r *ResendMailer) SendVerificationEmail(toEmail, toName, verificationLink string) error {
	cleanName := sanitizeHeaderField(toName)
	cleanEmail := sanitizeHeaderField(toEmail)
	cleanLink := sanitizeHeaderField(verificationLink)

	escapedName := html.EscapeString(cleanName)
	escapedLink := html.EscapeString(cleanLink)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify your Whiparc Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 32px;">
    <h1 style="color: #58a6ff; font-size: 24px; margin-top: 0;">Welcome to Whiparc, %s!</h1>
    <p style="font-size: 15px; line-height: 1.6; color: #8b949e;">Please verify your email address to activate your account and start orchestrating your cloud infrastructure.</p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="%s" style="display: inline-block; background-color: #238636; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">Verify Email Address</a>
    </div>
    <p style="font-size: 13px; color: #8b949e;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 12px; color: #58a6ff; word-break: break-all;">%s</p>
    <hr style="border: 0; border-top: 1px solid #30363d; margin: 32px 0 16px 0;" />
    <p style="font-size: 12px; color: #484f58; margin: 0;">If you did not sign up for Whiparc, please disregard this email. This link will expire in 24 hours.</p>
  </div>
</body>
</html>`, escapedName, escapedLink, escapedLink)

	textBody := fmt.Sprintf("Welcome to Whiparc, %s!\n\nPlease verify your email address by opening the following link:\n%s\n\nThis link expires in 24 hours.", cleanName, cleanLink)

	payload := map[string]interface{}{
		"from":    r.from,
		"to":      []string{cleanEmail},
		"subject": "Verify your Whiparc account",
		"html":    htmlBody,
		"text":    textBody,
	}

	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(payloadJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("resend api request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend returned status code %d", resp.StatusCode)
	}

	log.Printf("[EMAIL] Verification email sent to %s via Resend\n", cleanEmail)
	return nil
}

// SMTPMailer sends emails via standard SMTP server.
type SMTPMailer struct {
	host string
	port int
	user string
	pass string
	from string
}

func (s *SMTPMailer) SendVerificationEmail(toEmail, toName, verificationLink string) error {
	cleanName := sanitizeHeaderField(toName)
	cleanToEmail := sanitizeHeaderField(toEmail)
	cleanFrom := sanitizeHeaderField(s.from)
	cleanLink := sanitizeHeaderField(verificationLink)

	// Format address headers safely using net/mail to eliminate CRLF and header injection risks
	toAddress := (&mail.Address{Name: cleanName, Address: cleanToEmail}).String()
	fromAddress := cleanFrom
	if fromParsed, err := mail.ParseAddress(cleanFrom); err == nil {
		fromAddress = fromParsed.String()
	}

	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	subject := "Subject: Verify your Whiparc account\r\n"
	fromHeader := fmt.Sprintf("From: %s\r\n", fromAddress)
	toHeader := fmt.Sprintf("To: %s\r\n", toAddress)
	mimeHeader := "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n"
	body := fmt.Sprintf("Welcome to Whiparc, %s!\r\n\r\nPlease verify your email address by clicking the link below:\r\n%s\r\n\r\nThis link will expire in 24 hours.\r\n", cleanName, cleanLink)

	msg := []byte(fromHeader + toHeader + subject + mimeHeader + body)

	var auth smtp.Auth
	if s.user != "" {
		auth = smtp.PlainAuth("", s.user, s.pass, s.host)
	}

	err := smtp.SendMail(addr, auth, cleanFrom, []string{cleanToEmail}, msg)
	if err != nil {
		return fmt.Errorf("smtp send failed: %w", err)
	}

	log.Printf("[EMAIL] Verification email sent to %s via SMTP\n", cleanToEmail)
	return nil
}

// NewEmailSender constructs an EmailSender based on environment configuration.
func NewEmailSender() EmailSender {
	if apiKey := os.Getenv("RESEND_API_KEY"); apiKey != "" {
		from := os.Getenv("EMAIL_FROM")
		if from == "" {
			from = "Whiparc <noreply@whiparc.com>"
		}
		log.Println("[EMAIL] Initialized Resend mailer")
		return &ResendMailer{
			apiKey: apiKey,
			from:   from,
			client: &http.Client{Timeout: 10 * time.Second},
		}
	}

	if smtpHost := os.Getenv("SMTP_HOST"); smtpHost != "" {
		port := 587
		if pStr := os.Getenv("SMTP_PORT"); pStr != "" {
			if p, err := strconv.Atoi(pStr); err == nil {
				port = p
			}
		}
		from := os.Getenv("EMAIL_FROM")
		if from == "" {
			from = os.Getenv("SMTP_USER")
		}
		log.Printf("[EMAIL] Initialized SMTP mailer on %s:%d\n", smtpHost, port)
		return &SMTPMailer{
			host: smtpHost,
			port: port,
			user: os.Getenv("SMTP_USER"),
			pass: os.Getenv("SMTP_PASS"),
			from: from,
		}
	}

	log.Println("[EMAIL] No SMTP or Resend credentials configured — using ConsoleMailer (verification links printed to stdout)")
	return &ConsoleMailer{}
}
