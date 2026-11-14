package main

import (
	"errors"
	"strings"
	"time"
)

// calendarStatuses lists every status a scheduled return can have, in the
// order a return normally moves through them.
var calendarStatuses = []string{
	"drafting", "waiting-on-reports", "extension-filed", "8879-sent",
	"waiting-for-signature", "signed", "ready-to-e-file", "e-filed",
	"accepted", "rejected", "completed",
}

func validCalendarStatus(status string) bool {
	if status == "" {
		return true
	}
	for _, s := range calendarStatuses {
		if s == status {
			return true
		}
	}
	return false
}

func updateCalendarAssignmentStatus(items []storedFirmCalendarAssignment, date, clientID, status string) error {
	if !validCalendarStatus(status) {
		return errors.New("invalid calendar status")
	}
	for i := range items {
		if items[i].Date == date && items[i].ClientID == clientID {
			if items[i].Status != status {
				items[i].StatusSince = ""
				if status != "" {
					// Lets reminders tell how long an item has been waiting.
					items[i].StatusSince = time.Now().Format("2006-01-02")
				}
			}
			items[i].Status = status
			return nil
		}
	}
	return errors.New("calendar assignment could not be found")
}

// Status belongs to one scheduled assignment and follows it when rescheduled.
// Calendar metadata is encrypted with the signed-in company's vault key.
func (a *App) SetFirmCalendarStatus2026(date, clientID, status string) ([]FirmCalendarAssignment, error) {
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
	items, err := a.loadFirmCalendarUnlocked()
	if err != nil {
		return nil, err
	}
	if err := updateCalendarAssignmentStatus(items, date, clientID, status); err != nil {
		return nil, err
	}
	if err := a.saveFirmCalendarUnlocked(items); err != nil {
		return nil, err
	}
	return a.resolveFirmCalendarAssignmentsUnlocked(items)
}
