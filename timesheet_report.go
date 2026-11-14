package main

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) isAdministrator() bool {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	return a.currentUser != nil && strings.EqualFold(a.currentUser.Role, "administrator")
}

// GetFirmTimeSheetEntries returns everyone's time for administrators.
// Staff get only their own, the same as GetTimeSheetEntries.
func (a *App) GetFirmTimeSheetEntries() ([]TimeSheetEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	if !a.isAdministrator() {
		return a.GetTimeSheetEntries()
	}
	a.timesheetMu.Lock()
	defer a.timesheetMu.Unlock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err != nil {
		return nil, err
	}
	return append([]TimeSheetEntry{}, items...), nil
}

// UnbilledTimeForClient lists hours for one client that haven't been put on
// an invoice yet: everyone's for administrators, your own for staff.
func (a *App) UnbilledTimeForClient(clientPath string) ([]TimeSheetEntry, error) {
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return nil, err
	}
	items, err := a.GetFirmTimeSheetEntries()
	if err != nil {
		return nil, err
	}
	out := make([]TimeSheetEntry, 0)
	for _, item := range items {
		if item.ClientID == props.ClientID && item.InvoiceNumber == "" {
			out = append(out, item)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Date < out[j].Date })
	return out, nil
}

// markTimeEntriesBilled records the invoice number on the billed entries.
// Entries must belong to the invoiced client and not be on another invoice.
func (a *App) markTimeEntriesBilled(ids []string, clientID, invoiceNumber string) error {
	if len(ids) == 0 {
		return nil
	}
	admin := a.isAdministrator()
	username, _ := a.currentUsername()
	want := map[string]bool{}
	for _, id := range ids {
		want[strings.TrimSpace(id)] = true
	}
	a.timesheetMu.Lock()
	defer a.timesheetMu.Unlock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err != nil {
		return err
	}
	marked := 0
	for i := range items {
		if !want[items[i].ID] {
			continue
		}
		if items[i].ClientID != clientID {
			return errors.New("some of the selected hours belong to a different client")
		}
		if !admin && !strings.EqualFold(items[i].Username, username) {
			return errors.New("staff can only bill their own hours")
		}
		if items[i].InvoiceNumber != "" && items[i].InvoiceNumber != invoiceNumber {
			return fmt.Errorf("some of the selected hours are already on invoice %s", items[i].InvoiceNumber)
		}
		items[i].InvoiceNumber = invoiceNumber
		marked++
	}
	if marked != len(want) {
		return errors.New("some of the selected hours no longer exist")
	}
	return a.saveTimeSheetEntriesUnlocked(items)
}

// csvSafe stops a spreadsheet from treating a cell as a formula.
func csvSafe(value string) string {
	if value != "" && strings.ContainsAny(value[:1], "=+-@\t\r") {
		return "'" + value
	}
	return value
}

// ExportTimeSheetCSV saves the given entries (already filtered on screen) as
// a spreadsheet file. Only entries the user is allowed to see are written.
func (a *App) ExportTimeSheetCSV(ids []string, suggestedName string) (string, error) {
	visible, err := a.GetFirmTimeSheetEntries()
	if err != nil {
		return "", err
	}
	want := map[string]bool{}
	for _, id := range ids {
		want[id] = true
	}
	rows := make([]TimeSheetEntry, 0, len(ids))
	for _, item := range visible {
		if want[item.ID] {
			rows = append(rows, item)
		}
	}
	if len(rows) == 0 {
		return "", errors.New("there are no hours to export")
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Date != rows[j].Date {
			return rows[i].Date < rows[j].Date
		}
		return rows[i].ClientName < rows[j].ClientName
	})
	names := map[string]string{}
	if users, err := a.ListCompanyUsers(); err == nil {
		for _, u := range users {
			names[strings.ToLower(u.Username)] = strings.TrimSpace(u.FirstName + " " + u.LastName)
		}
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Date", "Preparer", "Client #", "Client", "Work performed", "Hours", "Invoice"})
	total := 0.0
	for _, r := range rows {
		who := names[strings.ToLower(r.Username)]
		if who == "" {
			who = r.Username
		}
		total += r.Hours
		_ = w.Write([]string{r.Date, csvSafe(who), csvSafe(r.ClientID), csvSafe(r.ClientName), csvSafe(r.Work), strconv.FormatFloat(r.Hours, 'f', 2, 64), csvSafe(r.InvoiceNumber)})
	}
	_ = w.Write([]string{"", "", "", "", "Total", strconv.FormatFloat(total, 'f', 2, 64), ""})
	w.Flush()

	name := engagementSafeFilename(strings.TrimSuffix(suggestedName, ".csv"))
	if name == "Client" {
		name = "Time_Sheet"
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Export Time Sheet",
		DefaultFilename: name + ".csv",
		Filters:         []wailsruntime.FileFilter{{DisplayName: "Spreadsheet (*.csv)", Pattern: "*.csv"}},
	})
	if err != nil || strings.TrimSpace(path) == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".csv") {
		path += ".csv"
	}
	if a.isInsideVault(path) {
		err = a.secureWriteFile(path, buf.Bytes())
	} else {
		err = os.WriteFile(path, buf.Bytes(), 0600)
	}
	if err != nil {
		return "", err
	}
	_ = a.appendAppAuditCurrent("", "", "Time sheet exported", fmt.Sprintf("%d entries to %s", len(rows), filepath.Base(path)))
	return path, nil
}
