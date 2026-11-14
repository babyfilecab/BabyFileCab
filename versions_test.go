package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentVersions(t *testing.T) {
	a, client := newRecycleTestApp(t)
	outside := t.TempDir()
	src := filepath.Join(outside, "W-2.pdf")
	section := filepath.Join(client, permanentFolder)
	drop := func(content string) {
		t.Helper()
		if err := os.WriteFile(src, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := a.ImportDroppedFiles(section, []string{src}); err != nil {
			t.Fatal(err)
		}
	}
	doc := filepath.Join(section, "W-2.pdf")
	drop("first")
	drop("second")
	if got, _ := a.secureReadFile(doc); string(got) != "second" {
		t.Fatal("upload did not replace the document")
	}
	if _, err := os.Stat(filepath.Join(section, "W-2 (2).pdf")); err == nil {
		t.Fatal("a renamed copy was created instead of a version")
	}
	versions, err := a.ListDocumentVersions(doc)
	if err != nil || len(versions) != 1 {
		t.Fatal("expected one previous version", versions, err)
	}
	raw, _ := os.ReadFile(filepath.Join(versionsFolder(doc), versions[0].ID))
	if string(raw) == "first" {
		t.Fatal("previous version is not encrypted")
	}
	if tree, _ := a.GetTree(); len(tree) == 0 {
		t.Fatal("tree empty")
	}
	if _, err := a.safePath(filepath.Join(versionsFolder(doc), versions[0].ID)); err == nil {
		t.Fatal("version files reachable through normal paths")
	}

	if err := a.RestoreDocumentVersion(doc, versions[0].ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := a.secureReadFile(doc); string(got) != "first" {
		t.Fatal("restore did not bring back the old content")
	}
	if versions, _ := a.ListDocumentVersions(doc); len(versions) != 1 {
		t.Fatal("restoring should keep the replaced copy as a version", versions)
	}

	renamed, err := a.RenameFile(doc, "W-2 Acme.pdf")
	if err != nil {
		t.Fatal(err)
	}
	if versions, _ := a.ListDocumentVersions(renamed); len(versions) != 1 {
		t.Fatal("versions lost on rename")
	}
	if err := a.DeleteFile(renamed); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(section, versionsDirName)); !os.IsNotExist(err) {
		t.Fatal("empty .versions folder left behind after delete")
	}
	items, _ := a.ListRecycleBin()
	restored, err := a.RestoreFromRecycleBin(items[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if versions, _ := a.ListDocumentVersions(restored); len(versions) != 1 {
		t.Fatal("versions lost through the Recycle Bin")
	}
}

func TestDocumentVersionsArePruned(t *testing.T) {
	dir := t.TempDir()
	doc := filepath.Join(dir, "scan.pdf")
	for i := 0; i < maxDocumentVersions+5; i++ {
		if err := os.WriteFile(doc, []byte{byte(i)}, 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := archiveCurrentVersion(doc); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(versionsFolder(doc))
	if len(entries) != maxDocumentVersions {
		t.Fatalf("expected %d versions, got %d", maxDocumentVersions, len(entries))
	}
}
