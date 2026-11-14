package main

import (
	"os"
	"path/filepath"
	"strings"
)

// FirmService is one kind of work the firm can write an engagement letter
// or invoice for.
type FirmService struct {
	Code        string `json:"code"`
	Label       string `json:"label"`
	Description string `json:"description"`
	// Kind is "tax-return", "bookkeeping" or "projection". It decides which
	// sections of the engagement letter apply.
	Kind string `json:"kind"`
}

var firmServices = []FirmService{
	{"1040", "1040 Individual", "Form 1040 U.S. Individual Income Tax Return", "tax-return"},
	{"1040-X", "1040-X Amended individual", "Form 1040-X Amended U.S. Individual Income Tax Return", "tax-return"},
	{"1041", "1041 Estate or trust", "Form 1041 U.S. Income Tax Return for Estates and Trusts", "tax-return"},
	{"1065", "1065 Partnership", "Form 1065 U.S. Return of Partnership Income", "tax-return"},
	{"1120S", "1120-S S corporation", "Form 1120-S U.S. Income Tax Return for an S Corporation", "tax-return"},
	{"1120", "1120 C corporation", "Form 1120 U.S. Corporation Income Tax Return", "tax-return"},
	{"990", "990 Exempt organization", "Form 990 Return of Organization Exempt From Income Tax", "tax-return"},
	{"709", "709 Gift tax", "Form 709 U.S. Gift (and Generation-Skipping Transfer) Tax Return", "tax-return"},
	{"706", "706 Estate tax", "Form 706 U.S. Estate (and Generation-Skipping Transfer) Tax Return", "tax-return"},
	{"State", "State income tax return", "state income tax return", "tax-return"},
	{"Bookkeeping", "Bookkeeping", "bookkeeping services", "bookkeeping"},
	{"Tax Projection", "Tax projection", "tax projection services", "projection"},
}

// ListFirmServices gives the frontend the same list the backend validates against.
func (a *App) ListFirmServices() []FirmService {
	return append([]FirmService(nil), firmServices...)
}

func findFirmService(code string) (FirmService, bool) {
	code = strings.TrimSpace(code)
	for _, s := range firmServices {
		if s.Code == code {
			return s, true
		}
	}
	return FirmService{}, false
}

// notIncludedServices lists the work a tax-return engagement leaves out,
// minus whatever the engagement itself is for.
func notIncludedServices(code string) string {
	items := []struct{ skipFor, text string }{
		{"State", "state and local returns"},
		{"1040-X", "amended returns"},
		{"", "information returns"},
		{"", "payroll and sales tax filings"},
		{"", "foreign reporting"},
		{"Bookkeeping", "bookkeeping"},
		{"", "responses to IRS or state notices"},
		{"", "audit representation"},
		{"Tax Projection", "tax planning and projections"},
	}
	var out []string
	for _, item := range items {
		if item.skipFor != "" && item.skipFor == code {
			continue
		}
		out = append(out, item.text)
	}
	if len(out) > 1 {
		return strings.Join(out[:len(out)-1], ", ") + ", and " + out[len(out)-1]
	}
	return strings.Join(out, "")
}

// clientOutputFolder is where a generated engagement letter or invoice is
// saved by default: the client's folder for that tax year when there is one,
// otherwise the client's Permanent Folder. Either way it is inside the vault,
// so the file is encrypted and shows up under the client.
func (a *App) clientOutputFolder(clientPath, taxYear string) (string, error) {
	clientPath, err := a.requireType(clientPath, "client")
	if err != nil {
		return "", err
	}
	taxYear = strings.TrimSpace(taxYear)
	if isTaxYear(taxYear) {
		year := filepath.Join(clientPath, taxYear)
		if info, err := os.Stat(year); err == nil && info.IsDir() {
			return year, nil
		}
	}
	folder := filepath.Join(clientPath, permanentFolder)
	if err := os.MkdirAll(folder, 0700); err != nil {
		return "", err
	}
	return folder, nil
}
