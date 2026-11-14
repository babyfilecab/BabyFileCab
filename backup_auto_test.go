package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAutomaticBackupAndRestore(t *testing.T) {
	a, client := newRecycleTestApp(t)
	doc := filepath.Join(client, permanentFolder, "engagement.pdf")
	if err := a.secureWriteFile(doc, []byte("signed letter")); err != nil {
		t.Fatal(err)
	}
	preview := filepath.Join(a.storageRoot, ".plaintext-preview", "leak.txt")
	_ = os.MkdirAll(filepath.Dir(preview), 0700)
	_ = os.WriteFile(preview, []byte("plaintext"), 0600)

	dest := t.TempDir()
	if _, err := a.SaveBackupSettings(filepath.Join(a.storageRoot, "inside"), "daily", 3); err == nil {
		t.Fatal("backup folder inside the data folder accepted")
	}
	s, err := a.SaveBackupSettings(dest, "daily", 2)
	if err != nil {
		t.Fatal(err)
	}
	s, err = a.RunScheduledBackup()
	if err != nil || s.LastOK == "" || s.LastFile == "" {
		t.Fatal("scheduled backup did not run", s, err)
	}
	info, err := verifyFullBackup(s.LastFile)
	if err != nil || info.Files == 0 {
		t.Fatal("backup does not verify", err)
	}
	raw, _ := os.ReadFile(s.LastFile)
	if strings.Contains(string(raw), "signed letter") || strings.Contains(string(raw), "plaintext") {
		t.Fatal("backup contains plaintext")
	}
	// Not due again until tomorrow.
	again, _ := a.RunScheduledBackup()
	if again.LastFile != s.LastFile {
		t.Fatal("backup ran again before it was due")
	}
	// Keep only the newest 2.
	for i := 0; i < 3; i++ {
		time.Sleep(1100 * time.Millisecond)
		if _, err := a.BackUpNow(); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(dest)
	if len(entries) != 2 {
		t.Fatalf("expected 2 backups kept, found %d", len(entries))
	}
	latest := a.loadBackupSettings().LastFile

	// Change the data, then restore the backup.
	_ = a.secureWriteFile(doc, []byte("changed after backup"))
	if _, err := a.RestoreFullBackup(latest); err == nil {
		t.Fatal("restore allowed while signed in")
	}
	a.Logout()
	setAside, err := a.RestoreFullBackup(latest)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(setAside, ".vault-keys")); err != nil {
		t.Fatal("previous data was not kept aside")
	}
	if _, err := a.Login("binadmin", "bin-admin-passphrase"); err != nil {
		t.Fatal("cannot sign in to restored data", err)
	}
	if got, err := a.secureReadFile(doc); err != nil || string(got) != "signed letter" {
		t.Fatal("restored document wrong", string(got), err)
	}
}

func TestBackupVerificationRejectsDamage(t *testing.T) {
	a, _ := newRecycleTestApp(t)
	dest := t.TempDir()
	if _, err := a.SaveBackupSettings(dest, "weekly", 5); err != nil {
		t.Fatal(err)
	}
	s, err := a.BackUpNow()
	if err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(s.LastFile)
	data[len(data)/2] ^= 0xff
	damaged := filepath.Join(dest, "damaged.zip")
	_ = os.WriteFile(damaged, data, 0600)
	if _, err := verifyFullBackup(damaged); err == nil {
		t.Fatal("damaged backup passed verification")
	}
	other := filepath.Join(dest, "other.zip")
	_ = os.WriteFile(other, []byte("not a zip"), 0600)
	if _, err := verifyFullBackup(other); err == nil {
		t.Fatal("non-backup accepted")
	}
}
