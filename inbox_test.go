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
