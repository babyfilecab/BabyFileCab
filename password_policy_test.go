package main

import "testing"

func TestValidateNewPassword(t *testing.T) {
	for _, bad := range []struct{ user, pw string }{
		{"alice", "short-pass"},
		{"alice", "Password1234"},
		{"alice", "my-alice-secret-99"},
		{"alice", "aaaaaaaaaaaaaaa"},
	} {
		if validateNewPassword(bad.user, bad.pw) == nil {
			t.Fatalf("accepted weak password %q", bad.pw)
		}
	}
	for _, good := range []string{"correct horse battery", "Tax-Records!2026", "new-password"} {
		if err := validateNewPassword("alice", good); err != nil {
			t.Fatalf("rejected %q: %v", good, err)
		}
	}
}
