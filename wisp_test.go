package main

import (
	"archive/zip"
	"encoding/xml"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testWISPData() wispData {
	return wispData{
		Input:       WISPInput{Devices: "Office desktop", MFA: "Authenticator app on email and tax software"},
		Firm:        "Demo Tax Office",
		Date:        time.Date(2026, 11, 14, 0, 0, 0, 0, time.UTC),
		Coordinator: UserProfile{Username: "dana", FirstName: "Dana", LastName: "Demo", Email: "dana@example.com", Role: "administrator"},
		Users: []UserProfile{
			{Username: "dana", FirstName: "Dana", LastName: "Demo", Role: "administrator"},
			{Username: "sam", FirstName: "Sam", LastName: "Rivera", Role: "staff"},
		},
		DataFolder: "/home/user/BabyFileCabData", AutoLock: 15,
		Backup:    BackupSettings{Frequency: "daily", Folder: "/media/backup", Keep: 10},
		Retention: 7, FilesChecked: 120,
	}
}

func TestWISPContent(t *testing.T) {
	var text strings.Builder
	for _, b := range wispBlocks(testWISPData()) {
		text.WriteString(b.Text + "\n")
	}
	s := text.String()
	for _, want := range []string{
		"Demo Tax Office", "Next review by November 14, 2027", "Dana Demo is the firm's Data Security Coordinator",
		"Sam Rivera (@sam), Staff", "Office desktop", "Authenticator app", "15 minutes", "daily backup to /media/backup",
		"kept for 7 years", "all 120 files", "StateAlert@taxadmin.org", "500 or more",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("plan is missing %q", want)
		}
	}
	// Questions the firm hasn't answered are left blank to fill in.
	if !strings.Contains(s, "outside services that hold client information (tax software, email, e-signature, client portal, cloud storage, payroll): "+wispBlank) {
		t.Error("unanswered question not left blank")
	}
}

func TestWISPFiles(t *testing.T) {
	dir := t.TempDir()
	pdf := filepath.Join(dir, "plan.pdf")
	if err := writeWISPPDF(pdf, testWISPData()); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(pdf)
	if !strings.HasPrefix(string(raw), "%PDF-1.4") || !strings.Contains(string(raw), "Page 1 of") {
		t.Fatal("PDF not written as expected")
	}
	docx := filepath.Join(dir, "plan.docx")
	if err := writeWISPDOCX(docx, testWISPData()); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.OpenReader(docx)
	if err != nil {
		t.Fatal(err)
	}
	defer zr.Close()
	for _, f := range zr.File {
		if !strings.HasSuffix(f.Name, ".xml") && !strings.HasSuffix(f.Name, ".rels") {
			continue
		}
		rc, _ := f.Open()
		data, _ := io.ReadAll(rc)
		rc.Close()
		d := xml.NewDecoder(strings.NewReader(string(data)))
		for {
			if _, err := d.Token(); err == io.EOF {
				break
			} else if err != nil {
				t.Fatalf("%s is not valid XML: %v", f.Name, err)
			}
		}
	}
}
