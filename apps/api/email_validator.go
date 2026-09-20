package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"time"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9.!#$%&'*+/=?^_` + "`" + `{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$`)

	// disposableDomains contains lowercase domain names of known disposable, temporary, and burner email providers.
	disposableDomains = map[string]struct{}{
		"0-mail.com":             {},
		"10minutemail.be":        {},
		"10minutemail.co.uk":     {},
		"10minutemail.co.za":     {},
		"10minutemail.com":       {},
		"10minutemail.net":       {},
		"10minutemail.org":       {},
		"20minutemail.com":       {},
		"airmail.cc":             {},
		"anonbox.net":            {},
		"anonymouse.org":         {},
		"armyspy.com":            {},
		"binkmail.com":           {},
		"bobmail.info":           {},
		"burnermail.io":          {},
		"cachedot.net":           {},
		"crazymailing.com":       {},
		"cuvox.de":               {},
		"dayrep.com":             {},
		"deadaddress.com":        {},
		"devnullmail.com":        {},
		"discard.email":          {},
		"discardmail.com":        {},
		"discardmail.de":         {},
		"disposablemail.com":     {},
		"dispostable.com":        {},
		"dropmail.me":            {},
		"einrot.com":             {},
		"emailondeck.com":        {},
		"emailtemporaneo.net":    {},
		"emkei.cz":               {},
		"example.com":            {},
		"example.net":            {},
		"example.org":            {},
		"eyepaste.com":           {},
		"fakeinbox.com":          {},
		"fakemailgenerator.com":  {},
		"fleckens.hu":            {},
		"fmail.cf":               {},
		"generator.email":        {},
		"getairmail.com":         {},
		"getnada.com":            {},
		"grr.la":                 {},
		"guerrillamail.biz":      {},
		"guerrillamail.com":      {},
		"guerrillamail.de":       {},
		"guerrillamail.net":      {},
		"guerrillamail.org":      {},
		"guerrillamailblock.com": {},
		"gustr.com":              {},
		"harakirimail.com":       {},
		"hidemail.de":            {},
		"inboxkitten.com":        {},
		"inboxproxy.com":         {},
		"invalid":                {},
		"jetable.org":            {},
		"jourrapide.com":         {},
		"kasmail.com":            {},
		"klzlk.com":              {},
		"localhost":              {},
		"lookugly.com":           {},
		"maildrop.cc":            {},
		"mailcatch.com":          {},
		"mailforspam.com":        {},
		"mailinator.com":         {},
		"mailinator.net":         {},
		"mailinator.org":         {},
		"mailinator2.com":        {},
		"mailnesia.com":          {},
		"mailnull.com":           {},
		"mailsac.com":            {},
		"mailtemp.net":           {},
		"meltmail.com":           {},
		"mintemail.com":          {},
		"mohmal.com":             {},
		"mohmal.im":              {},
		"mohmal.in":              {},
		"mytemp.email":           {},
		"mytempemail.com":        {},
		"mytrashmail.com":        {},
		"nada.ltd":               {},
		"nada.tempmail.com":      {},
		"netmails.net":           {},
		"noclickemail.com":       {},
		"nowmymail.com":          {},
		"oneoffemail.com":        {},
		"owlpic.com":             {},
		"pookmail.com":           {},
		"proxymail.eu":           {},
		"rhyta.com":              {},
		"safe-mail.net":          {},
		"safetymail.info":        {},
		"sharklasers.com":        {},
		"shieldemail.com":        {},
		"shortmail.net":          {},
		"spambog.com":            {},
		"spamex.com":             {},
		"spamfree24.org":         {},
		"spamgourmet.com":        {},
		"spamhole.com":           {},
		"spaminator.de":          {},
		"superrito.com":          {},
		"suremail.info":          {},
		"teleworm.us":            {},
		"temp-mail.org":          {},
		"temp-mail.ru":           {},
		"tempail.com":            {},
		"tempm.com":              {},
		"tempmail.address":       {},
		"tempmail.com":           {},
		"tempmail.de":            {},
		"tempmail.net":           {},
		"tempmailaddress.com":    {},
		"tempmailer.com":         {},
		"temporaryemail.net":     {},
		"temporarymail.com":      {},
		"throwawaymail.com":      {},
		"trash-mail.at":          {},
		"trash-mail.com":         {},
		"trashmail.at":           {},
		"trashmail.com":          {},
		"trashmail.de":           {},
		"trashmail.me":           {},
		"trashmail.net":          {},
		"trashmailer.com":        {},
		"trbvm.com":              {},
		"uggsrock.com":           {},
		"yopmail.com":            {},
		"yopmail.fr":             {},
		"yopmail.net":            {},
		"zippymail.info":         {},
	}
)

// ValidateEmail checks that an email is syntactically valid, not from a disposable
// email service, and has a legitimate domain structure.
func ValidateEmail(email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return errors.New("email address is required")
	}

	if len(email) > 254 {
		return errors.New("email address is too long")
	}

	// 1. Standard RFC parsing
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return errors.New("invalid email address format")
	}

	if !emailRegex.MatchString(email) {
		return errors.New("invalid email address format")
	}

	// 2. Extract domain
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return errors.New("invalid email address format")
	}
	domain := strings.TrimSpace(parts[1])

	if domain == "" || !strings.Contains(domain, ".") {
		return errors.New("email must include a valid domain extension")
	}

	// 3. Check disposable domain blocklist
	if isDisposableDomain(domain) {
		return errors.New("disposable or temporary email addresses are not allowed; please use a genuine email address")
	}

	// 4. DNS MX record validation (enabled in production or when STRICT_EMAIL_VALIDATION=true)
	if os.Getenv("STRICT_EMAIL_VALIDATION") == "true" {
		if err := verifyDomainMX(domain); err != nil {
			return fmt.Errorf("email domain %q cannot receive emails: %w", domain, err)
		}
	}

	return nil
}

// isDisposableDomain checks if domain or its parent domain is in the disposable list.
func isDisposableDomain(domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if _, ok := disposableDomains[domain]; ok {
		return true
	}

	// Check wildcard subdomains, e.g. "sub.mailinator.com" -> "mailinator.com"
	parts := strings.Split(domain, ".")
	for i := 1; i < len(parts)-1; i++ {
		parent := strings.Join(parts[i:], ".")
		if _, ok := disposableDomains[parent]; ok {
			return true
		}
	}

	return false
}

// verifyDomainMX performs a DNS lookup for MX records on the domain with a 2-second timeout.
func verifyDomainMX(domain string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var r net.Resolver
	mxs, err := r.LookupMX(ctx, domain)
	if err != nil {
		// Fallback to checking A/AAAA records (RFC 5321 implicit MX)
		addrs, aErr := r.LookupHost(ctx, domain)
		if aErr != nil || len(addrs) == 0 {
			return errors.New("domain has no valid mail exchange (MX) or host records")
		}
		return nil
	}

	if len(mxs) == 0 {
		return errors.New("domain has no MX records configured")
	}

	return nil
}
