package main

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// The invoice register keeps one record per invoice number so the firm can
// see what has been billed, what is still unpaid, and number invoices in
// order. It is stored encrypted with the rest of the company's metadata.

type InvoiceRecord struct {
	Number      string   `json:"number"`
	ClientID    string   `json:"clientId"`
	ClientName  string   `json:"clientName"`
	ClientPath  string   `json:"clientPath,omitempty"` // filled in when listed; not stored
	Service     string   `json:"service"`
	TaxYear     string   `json:"taxYear"`
	InvoiceDate string   `json:"invoiceDate"` // YYYY-MM-DD
	DueDate     string   `json:"dueDate"`     // YYYY-MM-DD
	Total       float64  `json:"total"`
	Paid        bool     `json:"paid"`
	PaidDate    string   `json:"paidDate,omitempty"`
	Files       []string `json:"files,omitempty"`
	CreatedBy   string   `json:"createdBy"`
	CreatedAt   string   `json:"createdAt"`
}

const invoiceRegisterKey = "invoice-register"

func (a *App) loadInvoiceRegisterUnlocked() ([]InvoiceRecord, error) {
	var items []InvoiceRecord
	err := a.metadataJSONGet("settings", invoiceRegisterKey, &items)
	if errors.Is(err, os.ErrNotExist) {
		return []InvoiceRecord{}, nil
	}
	return items, err
}

func (a *App) saveInvoiceRegisterUnlocked(items []InvoiceRecord) error {
	return a.metadataJSONPut("settings", invoiceRegisterKey, items)
}

// ListInvoices returns every invoice, newest first.
func (a *App) ListInvoices() ([]InvoiceRecord, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	a.invoiceMu.Lock()
	items, err := a.loadInvoiceRegisterUnlocked()
	a.invoiceMu.Unlock()
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].ClientPath = a.clientPathByID(items[i].ClientID)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].InvoiceDate != items[j].InvoiceDate {
			return items[i].InvoiceDate > items[j].InvoiceDate
		}
		return items[i].Number > items[j].Number
	})
	return items, nil
}

var invoiceNumberPattern = regexp.MustCompile(`^INV-(\d{4})-(\d+)$`)

func nextInvoiceNumber(items []InvoiceRecord, now time.Time) string {
	year := now.Year()
	highest := 0
	for _, item := range items {
		m := invoiceNumberPattern.FindStringSubmatch(item.Number)
		if m == nil || m[1] != strconv.Itoa(year) {
			continue
		}
		if n, err := strconv.Atoi(m[2]); err == nil && n > highest {
			highest = n
		}
	}
	return fmt.Sprintf("INV-%d-%04d", year, highest+1)
}

// NextInvoiceNumber suggests the next number in order, for example
// INV-2026-0007. Numbering starts again at 0001 each year.
func (a *App) NextInvoiceNumber() (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	a.invoiceMu.Lock()
	defer a.invoiceMu.Unlock()
	items, err := a.loadInvoiceRegisterUnlocked()
	if err != nil {
		return "", err
	}
	return nextInvoiceNumber(items, time.Now()), nil
}

// checkInvoiceNumberFree stops two different invoices sharing a number.
// Making the Word copy of an invoice that already has a PDF is fine.
func (a *App) checkInvoiceNumberFree(number, clientID string) error {
	a.invoiceMu.Lock()
	defer a.invoiceMu.Unlock()
	items, err := a.loadInvoiceRegisterUnlocked()
	if err != nil {
		return err
	}
	for _, item := range items {
		if strings.EqualFold(item.Number, number) && item.ClientID != clientID {
			return fmt.Errorf("invoice number %s is already used for %s. Use the next number: %s", number, item.ClientName, nextInvoiceNumber(items, time.Now()))
		}
	}
	return nil
}

// recordInvoice adds the invoice to the register, or adds another file to
// an invoice that is already there.
func (a *App) recordInvoice(data invoiceData, invoiceDate, dueDate, file string) error {
	a.invoiceMu.Lock()
	defer a.invoiceMu.Unlock()
	items, err := a.loadInvoiceRegisterUnlocked()
	if err != nil {
		return err
	}
	username, _ := a.currentUsername()
	for i := range items {
		if strings.EqualFold(items[i].Number, data.InvoiceNumber) && items[i].ClientID == data.ClientID {
			items[i].Service, items[i].TaxYear = data.Service, data.TaxYear
			items[i].InvoiceDate, items[i].DueDate, items[i].Total = invoiceDate, dueDate, data.Total
			if !containsString(items[i].Files, file) {
				items[i].Files = append(items[i].Files, file)
			}
			return a.saveInvoiceRegisterUnlocked(items)
		}
	}
	items = append(items, InvoiceRecord{
		Number: data.InvoiceNumber, ClientID: data.ClientID, ClientName: data.ClientName,
		Service: data.Service, TaxYear: data.TaxYear, InvoiceDate: invoiceDate, DueDate: dueDate,
		Total: data.Total, Files: []string{file}, CreatedBy: username, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	return a.saveInvoiceRegisterUnlocked(items)
}

// SetInvoicePaid marks an invoice paid on paidDate (YYYY-MM-DD), or unpaid.
func (a *App) SetInvoicePaid(number string, paid bool, paidDate string) ([]InvoiceRecord, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	if paid {
		if paidDate == "" {
			paidDate = time.Now().Format("2006-01-02")
		}
		if _, err := time.Parse("2006-01-02", paidDate); err != nil {
			return nil, errors.New("choose a valid payment date")
		}
	} else {
		paidDate = ""
	}
	a.invoiceMu.Lock()
	items, err := a.loadInvoiceRegisterUnlocked()
	found := -1
	if err == nil {
		for i := range items {
			if items[i].Number == number {
				found = i
				items[i].Paid, items[i].PaidDate = paid, paidDate
				break
			}
		}
		if found < 0 {
			err = errors.New("invoice not found")
		} else {
			err = a.saveInvoiceRegisterUnlocked(items)
		}
	}
	a.invoiceMu.Unlock()
	if err != nil {
		return nil, err
	}
	action := "Invoice marked unpaid"
	if paid {
		action = "Invoice marked paid"
	}
	_ = a.appendAppAuditCurrent(items[found].ClientID, items[found].ClientName, action, number)
	return a.ListInvoices()
}

func (a *App) currentUsername() (string, bool) {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	if a.currentUser == nil {
		return "", false
	}
	return a.currentUser.Username, true
}

func containsString(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}
