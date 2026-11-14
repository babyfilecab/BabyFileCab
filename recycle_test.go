package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newRecycleTestApp(t *testing.T) (*App, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	a, err := NewApp()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.RegisterUser(UserRegistration{CompanyName: "Bin Test", Username: "binadmin", FirstName: "Test", LastName: "User", Email: "bin@example.test", Phone: "5551234", Password: "bin-admin-passphrase", ConfirmPassword: "bin-admin-passphrase", Role: "administrator"}); err != nil {
		t.Fatal(err)
	}
	client, err := a.AddClient("Bin Client", "", "", "", "123-45-6789", "1040")
	if err != nil {
		t.Fatal(err)
	}
	return a, client
}

func TestRecycleBinFileRoundTrip(t *testing.T) {
	a, client := newRecycleTestApp(t)
	year, err := a.AddTaxYear(client, "2025")
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(year, "W-2 Acme.pdf")
	if err := a.secureWriteFile(file, []byte("wages")); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveDocumentDescription(file, "Acme W-2"); err != nil {
		t.Fatal(err)
	}
	if err := a.SetDocumentEnteredDone(file, true); err != nil {
		t.Fatal(err)
	}

	if err := a.DeleteFile(file); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("file still in place after delete")
	}
	items, err := a.ListRecycleBin()
	if err != nil || len(items) != 1 || items[0].Name != "W-2 Acme.pdf" || items[0].Kind != "file" || !strings.Contains(items[0].Location, "2025") {
		t.Fatalf("recycle bin listing wrong: %+v %v", items, err)
	}
	if results, _ := a.GlobalFind("Acme"); len(results) != 0 {
		t.Fatal("recycled file still shows up in Global Find")
	}
	if _, err := a.safePath(a.recycleItemPath(items[0])); err == nil {
		t.Fatal("recycle bin contents reachable through normal paths")
	}
	raw, _ := os.ReadFile(a.recycleItemPath(items[0]))
	if strings.Contains(string(raw), "wages") {
		t.Fatal("recycled file is not encrypted")
	}

	restored, err := a.RestoreFromRecycleBin(items[0].ID)
	if err != nil || restored != file {
		t.Fatal("restore", restored, err)
	}
	if got, _ := a.secureReadFile(file); string(got) != "wages" {
		t.Fatal("restored content wrong")
	}
	props, err := a.GetDocumentProperties(file)
	if err != nil || props.Description != "Acme W-2" {
		t.Fatal("description not restored", props, err)
	}
	if statuses, _ := a.readDocumentStatuses(); !statuses[a.documentMetadataKey(file)] {
		t.Fatal("Done mark not restored")
	}
	if items, _ := a.ListRecycleBin(); len(items) != 0 {
		t.Fatal("restored item still listed")
	}
}

func TestRecycleBinClientAndTaxYear(t *testing.T) {
	a, client := newRecycleTestApp(t)
	year, _ := a.AddTaxYear(client, "2024")
	_ = a.secureWriteFile(filepath.Join(year, "return.pdf"), []byte("x"))

	if err := a.DeleteTaxYear(year); err != nil {
		t.Fatal(err)
	}
	if err := a.DeleteClient(client); err != nil {
		t.Fatal(err)
	}
	items, _ := a.ListRecycleBin()
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %+v", items)
	}
	var yearItem, clientItem RecycleItem
	for _, it := range items {
		if it.Kind == "taxyear" {
			yearItem = it
		} else {
			clientItem = it
		}
	}
	// A new client must not reuse the recycled client's number.
	other, err := a.AddClient("Other Client", "", "", "", "", "1040")
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(filepath.Base(other), filepath.Base(client)[:5]) {
		t.Fatal("new client reused a recycled client number")
	}
	if _, err := a.RestoreFromRecycleBin(yearItem.ID); err == nil {
		t.Fatal("tax year restored without its client")
	}
	if _, err := a.RestoreFromRecycleBin(clientItem.ID); err != nil {
		t.Fatal(err)
	}
	props, err := a.GetClientProperties(client)
	if err != nil || props.TaxID != "123-45-6789" {
		t.Fatal("client profile not restored", props, err)
	}
	if _, err := a.RestoreFromRecycleBin(yearItem.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := a.secureReadFile(filepath.Join(year, "return.pdf")); string(got) != "x" {
		t.Fatal("tax year contents not restored")
	}
}

func TestRecycleBinPurgesAfter30Days(t *testing.T) {
	a, client := newRecycleTestApp(t)
	file := filepath.Join(client, permanentFolder, "old.pdf")
	_ = a.secureWriteFile(file, []byte("x"))
	if err := a.DeleteFile(file); err != nil {
		t.Fatal(err)
	}
	items, _ := a.loadRecycleIndex()
	items[0].ExpiresAt = time.Now().Add(-time.Hour).Format(time.RFC3339)
	_ = a.saveRecycleIndex(items)
	path := a.recycleItemPath(items[0])
	if list, _ := a.ListRecycleBin(); len(list) != 0 {
		t.Fatal("expired item not purged")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("expired item still on disk")
	}

	_ = a.secureWriteFile(file, []byte("y"))
	_ = a.DeleteFile(file)
	if err := a.EmptyRecycleBin(); err != nil {
		t.Fatal(err)
	}
	if list, _ := a.ListRecycleBin(); len(list) != 0 {
		t.Fatal("Empty Recycle Bin left items")
	}
}
