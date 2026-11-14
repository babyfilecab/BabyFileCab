package main

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNextInvoiceNumber(t *testing.T) {
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	if got := nextInvoiceNumber(nil, now); got != "INV-2026-0001" {
		t.Fatalf("first number %s", got)
	}
	items := []InvoiceRecord{{Number: "INV-2026-0009"}, {Number: "INV-2025-0044"}, {Number: "custom-12"}, {Number: "INV-2026-0003"}}
	if got := nextInvoiceNumber(items, now); got != "INV-2026-0010" {
		t.Fatalf("next number %s", got)
	}
}

func TestInvoiceLinesAndMoney(t *testing.T) {
	lines, total, err := invoiceLinesFrom([]InvoiceLineInput{{"1040 preparation", 1, 650}, {"Bookkeeping cleanup", 2.5, 120.10}})
	if err != nil || len(lines) != 2 || total != 950.25 || lines[1].Amount != 300.25 {
		t.Fatalf("lines %v total %v err %v", lines, total, err)
	}
	for _, bad := range [][]InvoiceLineInput{nil, {{"", 1, 10}}, {{"x", 0, 10}}, {{"x", 1, -5}}, {{"x", 1, 0}}} {
		if _, _, err := invoiceLinesFrom(bad); err == nil {
			t.Errorf("accepted bad lines %v", bad)
		}
	}
	for v, want := range map[float64]string{0: "$0.00", 5.5: "$5.50", 1234567.891: "$1,234,567.89", 999.995: "$1,000.00"} {
		if got := invoiceMoneyText(v); got != want {
			t.Errorf("money %v = %s, want %s", v, got, want)
		}
	}
}

func TestGenerateInvoiceRegisterAndTimeBilling(t *testing.T) {
	opened := ""
	openPath = func(p string) error { opened = p; return nil }
	defer func() { openPath = openWithSystem }()

	a, client := newRecycleTestApp(t)
	year, err := a.AddTaxYear(client, "2025")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := a.SaveTimeSheetEntry("2026-02-03", client, "Organizer review", 1.5)
	if err != nil {
		t.Fatal(err)
	}
	unbilled, err := a.UnbilledTimeForClient(client)
	if err != nil || len(unbilled) != 1 {
		t.Fatalf("unbilled %v %v", unbilled, err)
	}
	number, err := a.NextInvoiceNumber()
	if err != nil || !strings.HasPrefix(number, "INV-") {
		t.Fatalf("number %q %v", number, err)
	}
	folder, err := a.clientOutputFolder(client, "2025")
	if err != nil || folder != year {
		t.Fatalf("output folder %q, want the 2025 folder %q (%v)", folder, year, err)
	}
	users, _ := a.ListCompanyUsers()
	req := InvoiceRequest{
		ClientPath: client, PreparerUsername: users[0].Username, Service: "1040", TaxYear: "2025",
		InvoiceNumber: number, InvoiceDate: "2026-02-10", DueDate: "2026-03-12",
		Lines:        []InvoiceLineInput{{"Form 1040", 1, 800}, {"Organizer review (Feb 3)", 1.5, 150}},
		OutputPath:   filepath.Join(year, "Invoice.pdf"),
		TimeEntryIDs: []string{entries[0].ID},
	}
	paths, err := a.GenerateInvoice(req, "pdf")
	if err != nil || len(paths) != 1 {
		t.Fatalf("generate: %v %v", paths, err)
	}
	if opened == "" {
		t.Error("invoice wasn't opened after saving")
	}
	data, err := a.secureReadFile(paths[0])
	if err != nil || !strings.HasPrefix(string(data), "%PDF") {
		t.Fatalf("saved invoice isn't a readable PDF in the vault: %v", err)
	}
	// The Word copy of the same invoice is allowed and joins the same record.
	req.OutputPath = filepath.Join(year, "Invoice.docx")
	docx, err := a.GenerateInvoice(req, "docx")
	if err != nil {
		t.Fatalf("word copy: %v", err)
	}
	raw, err := a.secureReadFile(docx[0])
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("word file isn't a zip: %v", err)
	}
	for _, f := range zr.File {
		if !strings.HasSuffix(f.Name, ".xml") && !strings.HasSuffix(f.Name, ".rels") {
			continue
		}
		rc, _ := f.Open()
		dec := xml.NewDecoder(rc)
		for {
			if _, err := dec.Token(); err == io.EOF {
				break
			} else if err != nil {
				t.Fatalf("%s is not valid XML: %v", f.Name, err)
			}
		}
		rc.Close()
	}
	list, err := a.ListInvoices()
	if err != nil || len(list) != 1 || list[0].Total != 1025 || len(list[0].Files) != 2 || list[0].Paid {
		t.Fatalf("register %+v %v", list, err)
	}
	if list[0].ClientPath != client {
		t.Errorf("register client path %q", list[0].ClientPath)
	}
	if next, _ := a.NextInvoiceNumber(); next == number {
		t.Error("next number didn't move on")
	}
	// Billed hours are locked and no longer offered.
	if left, _ := a.UnbilledTimeForClient(client); len(left) != 0 {
		t.Errorf("billed hours still unbilled: %v", left)
	}
	if _, err := a.DeleteTimeSheetEntry(entries[0].ID); err == nil || !strings.Contains(err.Error(), number) {
		t.Errorf("deleting billed hours: %v", err)
	}
	// Another client can't reuse the number.
	other, err := a.AddClient("Second Client", "", "", "", "", "1040")
	if err != nil {
		t.Fatal(err)
	}
	req2 := req
	req2.ClientPath, req2.TimeEntryIDs, req2.OutputPath = other, nil, filepath.Join(other, permanentFolder, "x.pdf")
	if _, err := a.GenerateInvoice(req2, "pdf"); err == nil || !strings.Contains(err.Error(), "already used") {
		t.Errorf("duplicate number for another client: %v", err)
	}
	list, err = a.SetInvoicePaid(number, true, "2026-02-20")
	if err != nil || !list[0].Paid || list[0].PaidDate != "2026-02-20" {
		t.Fatalf("mark paid %+v %v", list, err)
	}
	list, _ = a.SetInvoicePaid(number, false, "")
	if list[0].Paid || list[0].PaidDate != "" {
		t.Fatal("mark unpaid didn't clear")
	}
}

func TestCSVSafe(t *testing.T) {
	for in, want := range map[string]string{"=SUM(A1)": "'=SUM(A1)", "+1": "'+1", "Smith": "Smith", "": ""} {
		if got := csvSafe(in); got != want {
			t.Errorf("csvSafe(%q) = %q", in, got)
		}
	}
}
