package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptionCheck(t *testing.T) {
	a, client := newRecycleTestApp(t)
	year, err := a.AddTaxYear(client, "2025")
	if err != nil {
		t.Fatal(err)
	}
	// One document added the normal way, one dropped in with the file manager.
	if err := a.secureWriteFile(filepath.Join(year, "W-2.pdf"), []byte("encrypted W-2")); err != nil {
		t.Fatal(err)
	}
	dropped := filepath.Join(year, "copied in.pdf")
	if err := os.WriteFile(dropped, []byte("plain 1099"), 0600); err != nil {
		t.Fatal(err)
	}
	report, err := a.CheckEncryption()
	if err != nil {
		t.Fatal(err)
	}
	rel, _ := filepath.Rel(a.dataRoot, dropped)
	if len(report.Unencrypted) != 1 || report.Unencrypted[0] != filepath.ToSlash(rel) {
		t.Fatalf("unencrypted files: %+v", report.Unencrypted)
	}
	report, err = a.EncryptUnencryptedFiles()
	if err != nil || report.Encrypted != 1 || len(report.Unencrypted) != 0 || len(report.Failed) != 0 {
		t.Fatalf("encrypt: %+v %v", report, err)
	}
	if raw, _ := os.ReadFile(dropped); string(raw) == "plain 1099" {
		t.Fatal("file still plain on disk")
	}
	if got, err := a.secureReadFile(dropped); err != nil || string(got) != "plain 1099" {
		t.Fatalf("encrypted file reads back wrong: %q %v", got, err)
	}
	if got, _ := a.secureReadFile(filepath.Join(year, "W-2.pdf")); string(got) != "encrypted W-2" {
		t.Fatal("already-encrypted file was changed")
	}
}
