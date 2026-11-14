package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestScanInbox(t *testing.T) {
	a, client := newRecycleTestApp(t)
	inbox := t.TempDir()
	if err := a.metadataJSONPut("settings", "inbox-folder", inbox); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Minute)
	write := func(name, content string) {
		p := filepath.Join(inbox, name)
		if err := os.WriteFile(p, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		_ = os.Chtimes(p, old, old)
	}
	write("scan0001.pdf", "scanned W-2")
	write(".hidden.pdf", "x")
	write("download.pdf.part", "x")
	if err := os.WriteFile(filepath.Join(inbox, "still-writing.pdf"), []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}

	files, err := a.ListInbox()
	if err != nil || len(files) != 1 || files[0].Name != "scan0001.pdf" {
		t.Fatalf("inbox listing wrong: %+v %v", files, err)
	}
	year, _ := a.AddTaxYear(client, "2025")
	filed, err := a.FileInboxDocument("scan0001.pdf", year, "W-2 Acme")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(filed) != "W-2 Acme.pdf" {
		t.Fatal("extension not kept when renaming", filed)
	}
	if got, _ := a.secureReadFile(filed); string(got) != "scanned W-2" {
		t.Fatal("filed content wrong")
	}
	if raw, _ := os.ReadFile(filed); string(raw) == "scanned W-2" {
		t.Fatal("filed document is not encrypted")
	}
	if _, err := os.Stat(filepath.Join(inbox, "scan0001.pdf")); !os.IsNotExist(err) {
		t.Fatal("original left in the inbox")
	}
	if _, err := a.FileInboxDocument("../escape.pdf", year, ""); err == nil {
		t.Fatal("path traversal accepted")
	}
	if _, err := a.FileInboxDocument("scan0001.pdf", year, "../x.pdf"); err == nil {
		t.Fatal("folder in new name accepted")
	}
}

// New scans are encrypted into the vault as soon as they're seen, the
// plaintext original is removed, and filing/discarding work from there.
func TestScanInboxEncryptsOnArrival(t *testing.T) {
	a, client := newRecycleTestApp(t)
	inbox := t.TempDir()
	if err := a.metadataJSONPut("settings", "inbox-folder", inbox); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-time.Minute)
	for name, content := range map[string]string{"scan1.pdf": "1099-INT", "scan2.pdf": "junk page", "fresh.pdf": "still scanning"} {
		p := filepath.Join(inbox, name)
		if err := os.WriteFile(p, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		if name != "fresh.pdf" {
			_ = os.Chtimes(p, old, old)
		}
	}
	if n, err := a.intakeInbox(); err != nil || n != 2 {
		t.Fatalf("intake took %d files, err %v", n, err)
	}
	for _, name := range []string{"scan1.pdf", "scan2.pdf"} {
		if _, err := os.Stat(filepath.Join(inbox, name)); !os.IsNotExist(err) {
			t.Fatalf("%s: plaintext original still in the inbox folder", name)
		}
		raw, err := os.ReadFile(filepath.Join(a.inboxHoldPath(), name))
		if err != nil || string(raw) == "1099-INT" || string(raw) == "junk page" {
			t.Fatalf("%s: held copy missing or not encrypted", name)
		}
	}
	if _, err := os.Stat(filepath.Join(inbox, "fresh.pdf")); err != nil {
		t.Fatal("a file still being written was taken")
	}
	files, err := a.ListInbox()
	if err != nil || len(files) != 2 {
		t.Fatalf("listing: %+v %v", files, err)
	}
	for _, f := range files {
		if !f.Encrypted {
			t.Fatalf("%s should be listed as encrypted", f.Name)
		}
		if f.Name == "scan1.pdf" && f.Size != int64(len("1099-INT")) {
			t.Fatalf("size shown as %d", f.Size)
		}
	}
	// A second scan with the same name doesn't overwrite the first.
	p := filepath.Join(inbox, "scan1.pdf")
	_ = os.WriteFile(p, []byte("second 1099"), 0600)
	_ = os.Chtimes(p, old, old)
	if n, _ := a.intakeInbox(); n != 1 {
		t.Fatal("second scan not taken in")
	}
	if got, _ := a.secureReadFile(filepath.Join(a.inboxHoldPath(), "scan1 (2).pdf")); string(got) != "second 1099" {
		t.Fatal("same-name scan not kept separately")
	}

	year, _ := a.AddTaxYear(client, "2025")
	filed, err := a.FileInboxDocument("scan1.pdf", year, "1099-INT Bank")
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := a.secureReadFile(filed); string(got) != "1099-INT" {
		t.Fatal("filed content wrong")
	}
	if _, err := os.Stat(filepath.Join(a.inboxHoldPath(), "scan1.pdf")); !os.IsNotExist(err) {
		t.Fatal("held copy not removed after filing")
	}
	if err := a.DiscardInboxFile("scan2.pdf"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(a.inboxHoldPath(), "scan2.pdf")); !os.IsNotExist(err) {
		t.Fatal("discarded scan still in the inbox")
	}
	if items, _ := a.ListRecycleBin(); len(items) != 1 || items[0].Name != "scan2.pdf" {
		t.Fatalf("discarded scan not in the Recycle Bin: %+v", items)
	}
	// The holding folder never shows up as a client.
	tree, _ := a.GetTree()
	for _, n := range tree {
		if n.Name == inboxHoldDir {
			t.Fatal("holding folder shown in the client list")
		}
	}
}
