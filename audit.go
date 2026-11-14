package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (a *App) GetAuditTrail(path string) ([]AuditEntry, error) {
	cp, err := a.clientPathFor(path)
	if err != nil {
		return nil, err
	}
	clientID, _, _ := parseClientDirName(filepath.Base(cp))
	entries := make([]AuditEntry, 0)
	if err := a.loadAuditSQLite("client", clientID, func(b []byte) error {
		var entry AuditEntry
		if err := json.Unmarshal(b, &entry); err != nil {
			return err
		}
		entries = append(entries, entry)
		return nil
	}); err != nil {
		return nil, err
	}
	sortClientAudit(entries)
	return entries, nil
}

func (a *App) appendAudit(path, action, details string) error {
	cp, err := a.clientPathFor(path)
	if err != nil {
		return err
	}
	clientID, clientName, _ := parseClientDirName(filepath.Base(cp))
	entry := AuditEntry{
		Timestamp: time.Now().Format(time.RFC3339),
		Action:    strings.TrimSpace(action),
		Details:   strings.TrimSpace(details),
	}
	user, root := a.auditContext()

	a.auditMu.Lock()
	defer a.auditMu.Unlock()
	if err := a.appendAuditSQLite("client", clientID, entry); err != nil {
		return err
	}
	return a.appendAppAuditEntryUnlocked(root, AppAuditEntry{
		Timestamp:  entry.Timestamp,
		Username:   user.Username,
		UserName:   strings.TrimSpace(strings.Join([]string{user.FirstName, user.LastName}, " ")),
		Role:       user.Role,
		ClientID:   clientID,
		ClientName: clientName,
		Action:     entry.Action,
		Details:    entry.Details,
	})
}

// LogAppEvent records a company-wide event that is not tied to one client,
// such as opening a firm tool. It is intentionally exposed to the Wails UI.
func (a *App) LogAppEvent(action, details string) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	action = strings.TrimSpace(action)
	if action == "" {
		return errors.New("audit action is required")
	}
	return a.appendAppAuditCurrent("", "", action, details)
}

// GetAppAuditTrail returns newest-first company-wide BabyFileCab history.
func (a *App) GetAppAuditTrail() ([]AppAuditEntry, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	a.auditMu.Lock()
	defer a.auditMu.Unlock()
	entries := make([]AppAuditEntry, 0)
	if err := a.loadAuditSQLite("app", "", func(b []byte) error {
		var entry AppAuditEntry
		if err := json.Unmarshal(b, &entry); err != nil {
			return err
		}
		entries = append(entries, entry)
		return nil
	}); err != nil {
		return nil, err
	}
	sortAppAudit(entries)
	return entries, nil
}

func (a *App) auditContext() (UserProfile, string) {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	var user UserProfile
	if a.currentUser != nil {
		user = *a.currentUser
	}
	return user, a.dataRoot
}

func (a *App) appendAppAuditCurrent(clientID, clientName, action, details string) error {
	user, root := a.auditContext()
	if user.Username == "" || root == "" {
		return nil
	}
	return a.appendAppAuditFor(root, user, clientID, clientName, action, details)
}

func (a *App) appendAppAuditFor(root string, user UserProfile, clientID, clientName, action, details string) error {
	if strings.TrimSpace(root) == "" {
		return nil
	}
	entry := AppAuditEntry{
		Timestamp:  time.Now().Format(time.RFC3339),
		Username:   strings.TrimSpace(user.Username),
		UserName:   strings.TrimSpace(strings.Join([]string{user.FirstName, user.LastName}, " ")),
		Role:       strings.TrimSpace(user.Role),
		ClientID:   strings.TrimSpace(clientID),
		ClientName: strings.TrimSpace(clientName),
		Action:     strings.TrimSpace(action),
		Details:    strings.TrimSpace(details),
	}
	a.auditMu.Lock()
	defer a.auditMu.Unlock()
	return a.appendAppAuditEntryUnlocked(root, entry)
}

func (a *App) appendAppAuditEntryUnlocked(root string, entry AppAuditEntry) error {
	if entry.Action == "" {
		return nil
	}
	return a.appendAuditSQLite("app", "", entry)
}

func (a *App) clientPathByID(clientID string) string {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return ""
	}
	entries, err := os.ReadDir(a.dataRoot)
	if err != nil {
		return ""
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		id, _, ok := parseClientDirName(entry.Name())
		if ok && id == clientID {
			return filepath.Join(a.dataRoot, entry.Name())
		}
	}
	return ""
}

func displayAuditRole(role string) string {
	if strings.EqualFold(strings.TrimSpace(role), "administrator") {
		return "Administrator"
	}
	return "Staff"
}
