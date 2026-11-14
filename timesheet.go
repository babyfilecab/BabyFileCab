package main

import (
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

func (a *App) loadTimeSheetEntriesUnlocked() ([]TimeSheetEntry, error) {
	var items []TimeSheetEntry
	err := a.metadataJSONGet("timesheet", "all", &items)
	if errors.Is(err, os.ErrNotExist) {
		return []TimeSheetEntry{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read time sheet: %w", err)
	}
	return items, nil
}

func (a *App) saveTimeSheetEntriesUnlocked(items []TimeSheetEntry) error {
	sort.Slice(items, func(i, j int) bool {
		if items[i].Date == items[j].Date {
			if strings.EqualFold(items[i].ClientName, items[j].ClientName) {
				return items[i].CreatedAt < items[j].CreatedAt
			}
			return strings.ToLower(items[i].ClientName) < strings.ToLower(items[j].ClientName)
		}
		return items[i].Date > items[j].Date
	})
	return a.metadataJSONPut("timesheet", "all", items)
}

// GetTimeSheetEntries returns the signed-in user's saved time entries.
func (a *App) GetTimeSheetEntries() ([]TimeSheetEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	a.timesheetMu.Lock()
	defer a.timesheetMu.Unlock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err != nil {
		return nil, err
	}
	username := ""
	a.authMu.RLock()
	if a.currentUser != nil {
		username = a.currentUser.Username
	}
	a.authMu.RUnlock()
	out := make([]TimeSheetEntry, 0)
	for _, item := range items {
		if strings.EqualFold(item.Username, username) {
			out = append(out, item)
		}
	}
	return out, nil
}

// SaveTimeSheetEntry records hours worked for one client on one calendar date.
func (a *App) SaveTimeSheetEntry(date, clientPath, work string, hours float64) ([]TimeSheetEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	date = strings.TrimSpace(date)
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil || parsed.Format("2006-01-02") != date {
		return nil, errors.New("choose a valid calendar date")
	}
	work = strings.TrimSpace(work)
	if work == "" {
		return nil, errors.New("choose or type what you worked on")
	}
	if len([]rune(work)) > 160 {
		return nil, errors.New("work performed must be 160 characters or less")
	}
	if hours <= 0 || hours > 24 {
		return nil, errors.New("hours must be greater than 0 and no more than 24")
	}
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return nil, err
	}
	a.authMu.RLock()
	username := ""
	if a.currentUser != nil {
		username = a.currentUser.Username
	}
	a.authMu.RUnlock()
	if username == "" {
		return nil, errors.New("sign in again to save time")
	}
	idBytes := make([]byte, 12)
	if _, err := rand.Read(idBytes); err != nil {
		return nil, fmt.Errorf("create time entry: %w", err)
	}
	entry := TimeSheetEntry{ID: fmt.Sprintf("%x", idBytes), Date: date, ClientID: props.ClientID, ClientName: props.Name, ClientPath: props.Path, Work: work, Hours: hours, Username: username, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	a.timesheetMu.Lock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err == nil {
		items = append(items, entry)
		err = a.saveTimeSheetEntriesUnlocked(items)
	}
	a.timesheetMu.Unlock()
	if err != nil {
		return nil, err
	}
	_ = a.appendAppAuditCurrent(props.ClientID, props.Name, "Time sheet entry added", fmt.Sprintf("%s — %s — %.2f hours", date, work, hours))
	return a.GetTimeSheetEntries()
}

// UpdateTimeSheetEntry edits one time entry owned by the signed-in user.
func (a *App) UpdateTimeSheetEntry(id, date, clientPath, work string, hours float64) ([]TimeSheetEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	id = strings.TrimSpace(id)
	date = strings.TrimSpace(date)
	if id == "" {
		return nil, errors.New("invalid time entry")
	}
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil || parsed.Format("2006-01-02") != date {
		return nil, errors.New("choose a valid calendar date")
	}
	work = strings.TrimSpace(work)
	if work == "" {
		return nil, errors.New("choose or type what you worked on")
	}
	if len([]rune(work)) > 160 {
		return nil, errors.New("work performed must be 160 characters or less")
	}
	if hours <= 0 || hours > 24 {
		return nil, errors.New("hours must be greater than 0 and no more than 24")
	}
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return nil, err
	}
	a.authMu.RLock()
	username := ""
	if a.currentUser != nil {
		username = a.currentUser.Username
	}
	a.authMu.RUnlock()
	if username == "" {
		return nil, errors.New("sign in again to update time")
	}

	a.timesheetMu.Lock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err != nil {
		a.timesheetMu.Unlock()
		return nil, err
	}
	updated := false
	for i := range items {
		if items[i].ID == id && strings.EqualFold(items[i].Username, username) {
			items[i].Date = date
			items[i].ClientID = props.ClientID
			items[i].ClientName = props.Name
			items[i].ClientPath = props.Path
			items[i].Work = work
			items[i].Hours = hours
			updated = true
			break
		}
	}
	if !updated {
		a.timesheetMu.Unlock()
		return nil, errors.New("time entry not found")
	}
	err = a.saveTimeSheetEntriesUnlocked(items)
	a.timesheetMu.Unlock()
	if err != nil {
		return nil, err
	}
	_ = a.appendAppAuditCurrent(props.ClientID, props.Name, "Time sheet entry updated", fmt.Sprintf("%s — %s — %.2f hours", date, work, hours))
	return a.GetTimeSheetEntries()
}

// DeleteTimeSheetEntry removes one time entry owned by the signed-in user.
func (a *App) DeleteTimeSheetEntry(id string) ([]TimeSheetEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, errors.New("invalid time entry")
	}
	a.authMu.RLock()
	username := ""
	if a.currentUser != nil {
		username = a.currentUser.Username
	}
	a.authMu.RUnlock()
	a.timesheetMu.Lock()
	items, err := a.loadTimeSheetEntriesUnlocked()
	if err != nil {
		a.timesheetMu.Unlock()
		return nil, err
	}
	out := make([]TimeSheetEntry, 0, len(items))
	removed := false
	for _, item := range items {
		if item.ID == id && strings.EqualFold(item.Username, username) {
			removed = true
			continue
		}
		out = append(out, item)
	}
	if !removed {
		a.timesheetMu.Unlock()
		return nil, errors.New("time entry not found")
	}
	err = a.saveTimeSheetEntriesUnlocked(out)
	a.timesheetMu.Unlock()
	if err != nil {
		return nil, err
	}
	_ = a.appendAppAuditCurrent("", "", "Time sheet entry deleted", id)
	return a.GetTimeSheetEntries()
}

// GetFirmCalendar2026 returns the company-shared client schedule for every
// supported calendar year (2025 through two years past the current year).
// The "2026" in the name is historical and kept for frontend compatibility.
// The calendar file lives inside the signed-in company's local data directory, so every
// local BabyFileCab user in the same company sees the same assignments.
func (a *App) GetFirmCalendar2026() ([]FirmCalendarAssignment, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	a.calendarMu.Lock()
	defer a.calendarMu.Unlock()
	stored, err := a.loadFirmCalendarUnlocked()
	if err != nil {
		return nil, err
	}
	return a.resolveFirmCalendarAssignmentsUnlocked(stored)
}
