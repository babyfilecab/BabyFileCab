package main

import (
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Record keeping. The IRS asks preparers to keep a copy of each return (or a
// list of the returns) for at least three years after filing (IRC 6107), and
// many firms keep seven. BabyFileCab lists the tax years that are past the
// firm's period so someone can review them. Nothing is ever deleted
// automatically, and years under audit or otherwise worth keeping can be put
// on hold.

const (
	defaultRetentionYears = 7
	minRetentionYears     = 3
	maxRetentionYears     = 10
)

type RetentionSettings struct {
	Years int `json:"years"`
	// Held lists "clientID/taxYear" pairs to keep regardless of age. Client
	// IDs don't change when a client is renamed.
	Held []string `json:"held"`
	// RemindedOn is the last date (YYYY-MM-DD) the sign-in reminder was
	// dismissed.
	RemindedOn string `json:"remindedOn,omitempty"`
}

type RetentionItem struct {
	ClientID   string `json:"clientId"`
	ClientName string `json:"clientName"`
	ClientPath string `json:"clientPath"`
	TaxYear    string `json:"taxYear"`
	Path       string `json:"path"`
	// PastSince is the calendar year the tax year went past the period.
	PastSince int  `json:"pastSince"`
	Held      bool `json:"held"`
}

// retentionPastSince returns the first calendar year in which a tax year is
// past the period: the return is filed the year after the tax year, then kept
// for the given number of years.
func retentionPastSince(taxYear, years int) int { return taxYear + 1 + years }

func (a *App) loadRetentionSettings() RetentionSettings {
	var s RetentionSettings
	if err := a.metadataJSONGet("settings", "retention", &s); err != nil {
		s = RetentionSettings{}
	}
	if s.Years < minRetentionYears || s.Years > maxRetentionYears {
		s.Years = defaultRetentionYears
	}
	return s
}

func (a *App) GetRetentionSettings() (RetentionSettings, error) {
	if err := a.requireSignedIn(); err != nil {
		return RetentionSettings{}, err
	}
	a.retentionMu.Lock()
	defer a.retentionMu.Unlock()
	return a.loadRetentionSettings(), nil
}

func (a *App) SetRetentionYears(years int) (RetentionSettings, error) {
	if err := a.requireAdministrator("change the record-keeping period"); err != nil {
		return RetentionSettings{}, err
	}
	if years < minRetentionYears || years > maxRetentionYears {
		return RetentionSettings{}, errors.New("choose between 3 and 10 years")
	}
	a.retentionMu.Lock()
	defer a.retentionMu.Unlock()
	s := a.loadRetentionSettings()
	s.Years = years
	if err := a.metadataJSONPut("settings", "retention", s); err != nil {
		return RetentionSettings{}, err
	}
	_ = a.appendAppAuditCurrent("", "", "Record-keeping period changed", strconv.Itoa(years)+" years after filing")
	return s, nil
}

func retentionHoldKey(clientID, taxYear string) string { return clientID + "/" + taxYear }

// SetRetentionHold keeps (or stops keeping) one client's tax year off the
// review list.
func (a *App) SetRetentionHold(clientID, taxYear string, hold bool) (RetentionSettings, error) {
	if err := a.requireAdministrator("put tax years on hold"); err != nil {
		return RetentionSettings{}, err
	}
	clientID, taxYear = strings.TrimSpace(clientID), strings.TrimSpace(taxYear)
	if clientID == "" || !isTaxYear(taxYear) {
		return RetentionSettings{}, errors.New("choose a client tax year")
	}
	a.retentionMu.Lock()
	defer a.retentionMu.Unlock()
	s := a.loadRetentionSettings()
	key := retentionHoldKey(clientID, taxYear)
	kept := s.Held[:0:0]
	for _, k := range s.Held {
		if k != key {
			kept = append(kept, k)
		}
	}
	if hold {
		kept = append(kept, key)
	}
	sort.Strings(kept)
	s.Held = kept
	if err := a.metadataJSONPut("settings", "retention", s); err != nil {
		return RetentionSettings{}, err
	}
	action := "Tax year put on hold"
	if !hold {
		action = "Tax year hold released"
	}
	_ = a.appendAppAuditCurrent(clientID, "", action, taxYear)
	return s, nil
}

// MarkRetentionReminded snoozes the sign-in reminder.
func (a *App) MarkRetentionReminded() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	a.retentionMu.Lock()
	defer a.retentionMu.Unlock()
	s := a.loadRetentionSettings()
	s.RemindedOn = time.Now().Format("2006-01-02")
	return a.metadataJSONPut("settings", "retention", s)
}

// ListRetentionDue lists every client tax year past the firm's period,
// oldest first, including those on hold (marked as such).
func (a *App) ListRetentionDue() ([]RetentionItem, error) {
	tree, err := a.GetTree()
	if err != nil {
		return nil, err
	}
	a.retentionMu.Lock()
	s := a.loadRetentionSettings()
	a.retentionMu.Unlock()
	return retentionItems(tree, s, time.Now().Year()), nil
}

func retentionItems(tree []TreeNode, s RetentionSettings, currentYear int) []RetentionItem {
	held := map[string]bool{}
	for _, k := range s.Held {
		held[k] = true
	}
	items := []RetentionItem{}
	for _, client := range tree {
		for _, child := range client.Children {
			if child.Type != "taxyear" {
				continue
			}
			year, err := strconv.Atoi(child.Name)
			if err != nil {
				continue
			}
			since := retentionPastSince(year, s.Years)
			if since > currentYear {
				continue
			}
			items = append(items, RetentionItem{
				ClientID: client.ClientID, ClientName: client.Name, ClientPath: client.Path,
				TaxYear: child.Name, Path: child.Path, PastSince: since,
				Held: held[retentionHoldKey(client.ClientID, child.Name)],
			})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].TaxYear != items[j].TaxYear {
			return items[i].TaxYear < items[j].TaxYear
		}
		return strings.ToLower(items[i].ClientName) < strings.ToLower(items[j].ClientName)
	})
	return items
}
