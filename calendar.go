package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func (a *App) AssignClientToFirmCalendar2026(date, clientPath string) ([]FirmCalendarAssignment, error) {
	return a.AssignClientToFirmCalendarForPreparer2026(date, clientPath, "")
}

func (a *App) AssignClientToFirmCalendarForPreparer2026(date, clientPath, preparerUsername string) ([]FirmCalendarAssignment, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	if err := validateFirmCalendarDate(date); err != nil {
		return nil, err
	}
	clientPath, err := a.requireType(clientPath, "client")
	if err != nil {
		return nil, err
	}
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return nil, err
	}

	preparerUsername, err = a.validateCalendarPreparer(preparerUsername)
	if err != nil {
		return nil, err
	}

	a.calendarMu.Lock()
	defer a.calendarMu.Unlock()
	stored, err := a.loadFirmCalendarUnlocked()
	if err != nil {
		return nil, err
	}
	for _, item := range stored {
		if item.Date == date && item.ClientID == props.ClientID {
			return a.resolveFirmCalendarAssignmentsUnlocked(stored)
		}
	}
	stored = append(stored, storedFirmCalendarAssignment{
		Date:             date,
		ClientID:         props.ClientID,
		ClientName:       props.Name,
		ReturnType:       props.ReturnType,
		PreparerUsername: preparerUsername,
	})
	if err := a.saveFirmCalendarUnlocked(stored); err != nil {
		return nil, err
	}
	_ = a.appendAudit(clientPath, "Firm Calendar assignment added", date)
	return a.resolveFirmCalendarAssignmentsUnlocked(stored)
}

func (a *App) RemoveClientFromFirmCalendar2026(date, clientID string) ([]FirmCalendarAssignment, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	if err := validateFirmCalendarDate(date); err != nil {
		return nil, err
	}
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return nil, errors.New("client ID is required")
	}

	a.calendarMu.Lock()
	defer a.calendarMu.Unlock()
	stored, err := a.loadFirmCalendarUnlocked()
	if err != nil {
		return nil, err
	}
	filtered := make([]storedFirmCalendarAssignment, 0, len(stored))
	var removed *storedFirmCalendarAssignment
	for _, item := range stored {
		if item.Date == date && item.ClientID == clientID {
			copyItem := item
			removed = &copyItem
			continue
		}
		filtered = append(filtered, item)
	}
	if err := a.saveFirmCalendarUnlocked(filtered); err != nil {
		return nil, err
	}
	if removed != nil {
		if clientPath := a.clientPathByID(clientID); clientPath != "" {
			_ = a.appendAudit(clientPath, "Firm Calendar assignment removed", date)
		} else {
			_ = a.appendAppAuditCurrent(clientID, removed.ClientName, "Firm Calendar assignment removed", date)
		}
	}
	return a.resolveFirmCalendarAssignmentsUnlocked(filtered)
}

// ReassignClientInFirmCalendar2026 moves one scheduled client between supported 2025/2026/2027 dates.
// The legacy method name is retained for frontend compatibility. If the client is already assigned to the destination date, the
// original assignment is simply removed so the schedule never contains duplicates.
func (a *App) ReassignClientInFirmCalendar2026(oldDate, newDate, clientID string) ([]FirmCalendarAssignment, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	if err := validateFirmCalendarDate(oldDate); err != nil {
		return nil, err
	}
	if err := validateFirmCalendarDate(newDate); err != nil {
		return nil, err
	}
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return nil, errors.New("client ID is required")
	}
	if oldDate == newDate {
		return a.GetFirmCalendar2026()
	}

	a.calendarMu.Lock()
	defer a.calendarMu.Unlock()
	stored, err := a.loadFirmCalendarUnlocked()
	if err != nil {
		return nil, err
	}

	var moved *storedFirmCalendarAssignment
	filtered := make([]storedFirmCalendarAssignment, 0, len(stored))
	destinationAlreadyExists := false
	for _, item := range stored {
		if item.Date == oldDate && item.ClientID == clientID {
			copyItem := item
			moved = &copyItem
			continue
		}
		if item.Date == newDate && item.ClientID == clientID {
			destinationAlreadyExists = true
		}
		filtered = append(filtered, item)
	}
	if moved == nil {
		return nil, errors.New("calendar assignment was not found")
	}
	if !destinationAlreadyExists {
		moved.Date = newDate
		filtered = append(filtered, *moved)
	}
	if err := a.saveFirmCalendarUnlocked(filtered); err != nil {
		return nil, err
	}
	if clientPath := a.clientPathByID(clientID); clientPath != "" {
		_ = a.appendAudit(clientPath, "Firm Calendar assignment moved", fmt.Sprintf("%s → %s", oldDate, newDate))
	} else {
		_ = a.appendAppAuditCurrent(clientID, moved.ClientName, "Firm Calendar assignment moved", fmt.Sprintf("%s → %s", oldDate, newDate))
	}
	return a.resolveFirmCalendarAssignmentsUnlocked(filtered)
}

func validateFirmCalendarDate(value string) error {
	value = strings.TrimSpace(value)
	d, err := time.Parse("2006-01-02", value)
	if err != nil {
		return errors.New("calendar date must be in YYYY-MM-DD format")
	}
	if d.Year() != 2025 && d.Year() != 2026 && d.Year() != 2027 {
		return errors.New("Firm Calendar assignments are limited to calendar years 2025, 2026, and 2027")
	}
	return nil
}

func (a *App) firmCalendarPath() string {
	return filepath.Join(a.dataRoot, firmCalendarFile)
}

func (a *App) loadFirmCalendarUnlocked() ([]storedFirmCalendarAssignment, error) {
	var items []storedFirmCalendarAssignment
	err := a.metadataJSONGet("firm-calendar", "all", &items)
	if errors.Is(err, os.ErrNotExist) {
		return []storedFirmCalendarAssignment{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read firm calendar: %w", err)
	}
	return items, nil
}

func (a *App) saveFirmCalendarUnlocked(items []storedFirmCalendarAssignment) error {
	sort.Slice(items, func(i, j int) bool {
		if items[i].Date == items[j].Date {
			return strings.ToLower(items[i].ClientName) < strings.ToLower(items[j].ClientName)
		}
		return items[i].Date < items[j].Date
	})
	return a.metadataJSONPut("firm-calendar", "all", items)
}

func (a *App) resolveFirmCalendarAssignmentsUnlocked(stored []storedFirmCalendarAssignment) ([]FirmCalendarAssignment, error) {
	active := make(map[string]ClientProperties)
	entries, err := os.ReadDir(a.dataRoot)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() || !isClientDirName(entry.Name()) {
			continue
		}
		clientID, displayName, ok := parseClientDirName(entry.Name())
		if !ok {
			continue
		}
		path := filepath.Join(a.dataRoot, entry.Name())
		profile, _ := a.readClientProfile(path)
		active[clientID] = ClientProperties{Name: displayName, ClientID: clientID, Path: path, ReturnType: profile.ReturnType}
	}

	out := make([]FirmCalendarAssignment, 0, len(stored))
	for _, item := range stored {
		resolved := FirmCalendarAssignment{Date: item.Date, ClientID: item.ClientID, ClientName: item.ClientName, ReturnType: item.ReturnType, Status: item.Status, PreparerUsername: item.PreparerUsername}
		if props, ok := active[item.ClientID]; ok {
			resolved.ClientName = props.Name
			resolved.ClientPath = props.Path
			resolved.ReturnType = props.ReturnType
		}
		if strings.TrimSpace(resolved.ClientName) == "" {
			resolved.ClientName = "Client " + item.ClientID
		}
		out = append(out, resolved)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Date == out[j].Date {
			return strings.ToLower(out[i].ClientName) < strings.ToLower(out[j].ClientName)
		}
		return out[i].Date < out[j].Date
	})
	return out, nil
}
