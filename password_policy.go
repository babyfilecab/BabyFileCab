package main

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// minPasswordLength applies to new accounts and password changes. Existing
// shorter passwords keep working at sign-in; users are asked to pick a
// compliant password the next time they change it.
const minPasswordLength = 12

var commonPasswords = map[string]bool{
	"password1234": true, "password12345": true, "passw0rd1234": true, "123456789012": true,
	"qwertyuiop12": true, "qwerty123456": true, "iloveyou1234": true, "letmein12345": true,
	"welcome12345": true, "administrator": true, "babyfilecab1": true, "babyfilecab123": true,
	"changeme1234": true, "taxseason2026": true, "abcdefghijkl": true, "abc123456789": true,
}

// validateNewPassword checks a password chosen for a new account or a change.
func validateNewPassword(username, password string) error {
	n := utf8.RuneCountInString(password)
	if n < minPasswordLength {
		return errors.New("password must be at least 12 characters")
	}
	if n > 1024 {
		return errors.New("password must be at most 1024 characters")
	}
	lower := strings.ToLower(password)
	if commonPasswords[lower] {
		return errors.New("this password is too common; choose something less predictable")
	}
	if u := strings.ToLower(strings.TrimSpace(username)); len(u) >= 3 && strings.Contains(lower, u) {
		return errors.New("password must not contain your username")
	}
	first, _ := utf8.DecodeRuneInString(password)
	if strings.Trim(password, string(first)) == "" {
		return errors.New("password must not be a single repeated character")
	}
	return nil
}
