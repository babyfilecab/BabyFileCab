package main

import (
	"strings"
	"testing"
)

func TestStaffCannotDeletePermanently(t *testing.T) {
	a, client := newRecycleTestApp(t)
	year, err := a.AddTaxYear(client, "2025")
	if err != nil {
		t.Fatal(err)
	}
	if err := a.DeleteTaxYear(year); err != nil {
		t.Fatal(err)
	}
	items, err := a.ListRecycleBin()
	if err != nil || len(items) != 1 {
		t.Fatalf("recycle bin = %v, %v", items, err)
	}

	a.authMu.Lock()
	a.currentUser.Role = "staff"
	a.authMu.Unlock()

	for name, call := range map[string]func() error{
		"delete client":     func() error { return a.DeleteClient(client) },
		"delete from bin":   func() error { return a.DeleteFromRecycleBin(items[0].ID) },
		"empty recycle bin": func() error { return a.EmptyRecycleBin() },
	} {
		if err := call(); err == nil || !strings.Contains(err.Error(), "only an administrator") {
			t.Errorf("%s as staff: got %v, want administrator error", name, err)
		}
	}
	// Staff can still restore what they deleted.
	if _, err := a.RestoreFromRecycleBin(items[0].ID); err != nil {
		t.Fatalf("staff restore: %v", err)
	}

	a.authMu.Lock()
	a.currentUser.Role = "administrator"
	a.authMu.Unlock()
	if err := a.DeleteClient(client); err != nil {
		t.Fatalf("administrator delete client: %v", err)
	}
	if err := a.EmptyRecycleBin(); err != nil {
		t.Fatalf("administrator empty bin: %v", err)
	}
}
