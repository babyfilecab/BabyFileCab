package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) GetClientProperties(path string) (ClientProperties, error) {
	path, err := a.requireType(path, "client")
	if err != nil {
		return ClientProperties{}, err
	}
	clientID, displayName, ok := parseClientDirName(filepath.Base(path))
	if !ok {
		return ClientProperties{}, errors.New("invalid client folder")
	}
	profile, _ := a.readClientProfile(path)
	return ClientProperties{
		Name:       displayName,
		ClientID:   clientID,
		Path:       path,
		Address:    profile.Address,
		Phone:      profile.Phone,
		Email:      profile.Email,
		TaxID:      profile.TaxID,
		ReturnType: profile.ReturnType,
	}, nil
}

func (a *App) UpdateClientProfile(path, address, phone, email, taxID, returnType string) error {
	path, err := a.requireType(path, "client")
	if err != nil {
		return err
	}
	returnType = strings.TrimSpace(returnType)
	switch returnType {
	case "1040", "1065", "1120S", "1120":
	default:
		return errors.New("return type must be 1040, 1065, 1120S, or 1120")
	}
	profile := ClientProfile{
		Address:    strings.TrimSpace(address),
		Phone:      strings.TrimSpace(phone),
		Email:      strings.TrimSpace(email),
		TaxID:      strings.TrimSpace(taxID),
		ReturnType: returnType,
	}
	if err := a.writeClientProfile(path, profile); err != nil {
		return err
	}
	return a.appendAudit(path, "Client profile updated", "Address, phone, email, tax ID, or return type was updated")
}

func (a *App) GetClientCommunications() ([]ClientCommunication, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(a.dataRoot)
	if err != nil {
		return nil, err
	}
	out := make([]ClientCommunication, 0)
	for _, entry := range entries {
		if !entry.IsDir() || !isClientDirName(entry.Name()) {
			continue
		}
		clientPath := filepath.Join(a.dataRoot, entry.Name())
		_, displayName, ok := parseClientDirName(entry.Name())
		if !ok {
			continue
		}
		profile, _ := a.readClientProfile(clientPath)
		out = append(out, ClientCommunication{
			Name:       displayName,
			Email:      profile.Email,
			Phone:      profile.Phone,
			ReturnType: profile.ReturnType,
			Path:       clientPath,
		})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out, nil
}

func (a *App) BackupClient(path string) (string, error) {
	path, err := a.requireType(path, "client")
	if err != nil {
		return "", err
	}
	props, err := a.GetClientProperties(path)
	if err != nil {
		return "", err
	}
	base := sanitizeName(props.Name)
	if base == "" {
		base = "Client"
	}
	defaultName := fmt.Sprintf("BabyFileCab_%s_%s_%s.bfcbackup", props.ClientID, base, time.Now().Format("20060102-150405"))
	dest, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Back Up Client",
		DefaultFilename: defaultName,
		Filters:         []wailsruntime.FileFilter{{DisplayName: "Encrypted BabyFileCab Backup (*.bfcbackup)", Pattern: "*.bfcbackup"}},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(dest) == "" {
		return "", nil
	}
	if !strings.EqualFold(filepath.Ext(dest), ".bfcbackup") {
		dest += ".bfcbackup"
	}
	if err := a.appendAudit(path, "Backup created", filepath.Base(dest)); err != nil {
		return "", err
	}
	if err := a.encryptedClientBackup(path, dest); err != nil {
		return "", err
	}
	return dest, nil
}

func (a *App) RestoreClient(path string) (string, error) {
	path, err := a.requireType(path, "client")
	if err != nil {
		return "", err
	}
	backupPath, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Restore Client from Backup",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Encrypted BabyFileCab Backup (*.bfcbackup)", Pattern: "*.bfcbackup"},
			{DisplayName: "Legacy BabyFileCab ZIP (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(backupPath) == "" {
		return "", nil
	}
	var restoreErr error
	if strings.EqualFold(filepath.Ext(backupPath), ".zip") {
		restoreErr = a.restoreLegacyClientZIP(path, backupPath)
	} else {
		restoreErr = a.restoreEncryptedClientBackup(path, backupPath)
	}
	if restoreErr != nil {
		return "", restoreErr
	}
	if err := a.appendAudit(path, "Client restored", filepath.Base(backupPath)); err != nil {
		return "", err
	}
	return backupPath, nil
}

func (a *App) ArchiveClient(path string) (string, error) {
	path, err := a.requireType(path, "client")
	if err != nil {
		return "", err
	}
	if err := a.appendAudit(path, "Client archived", "Client moved to the local BabyFileCab archive"); err != nil {
		return "", err
	}
	archiveRoot := filepath.Join(a.dataRoot, ".Archive")
	if err := os.MkdirAll(archiveRoot, 0700); err != nil {
		return "", err
	}
	dest := uniqueDestination(filepath.Join(archiveRoot, filepath.Base(path)))
	if err := os.Rename(path, dest); err != nil {
		return "", err
	}
	a.remapDocumentMetadataPrefix(path, dest)
	_ = a.metadataRenamePrefix("client-profile", a.documentMetadataKey(path), a.documentMetadataKey(dest))
	return dest, nil
}

func (a *App) ListArchivedClients() ([]TreeNode, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	archiveRoot := filepath.Join(a.dataRoot, ".Archive")
	entries, err := os.ReadDir(archiveRoot)
	if errors.Is(err, os.ErrNotExist) {
		return []TreeNode{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := make([]TreeNode, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		clientID, displayName, ok := parseClientDirName(entry.Name())
		if !ok {
			continue
		}
		path := filepath.Join(archiveRoot, entry.Name())
		out = append(out, TreeNode{
			ID:       path,
			Name:     displayName,
			ClientID: clientID,
			Type:     "archived-client",
			Path:     path,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		left := strings.ToLower(out[i].Name)
		right := strings.ToLower(out[j].Name)
		if left == right {
			return out[i].ClientID < out[j].ClientID
		}
		return left < right
	})
	return out, nil
}

func (a *App) UnarchiveClient(path string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	path, err := a.safePath(path)
	if err != nil {
		return "", err
	}
	archiveRoot, _ := filepath.Abs(filepath.Join(a.dataRoot, ".Archive"))
	absPath, _ := filepath.Abs(path)
	if absPath == archiveRoot || !strings.HasPrefix(absPath, archiveRoot+string(os.PathSeparator)) {
		return "", errors.New("select an archived client first")
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("archived client is not a folder")
	}
	clientID, displayName, ok := parseClientDirName(filepath.Base(absPath))
	if !ok {
		return "", errors.New("invalid archived client folder")
	}

	dest := filepath.Join(a.dataRoot, filepath.Base(absPath))
	if _, statErr := os.Stat(dest); !errors.Is(statErr, os.ErrNotExist) {
		// An archived client ID may have been reused while the client was archived.
		// Preserve the client name but assign the next available local client ID.
		newID := a.nextClientID()
		for {
			dest = filepath.Join(a.dataRoot, fmt.Sprintf("%05d - %s", newID, displayName))
			if _, statErr = os.Stat(dest); errors.Is(statErr, os.ErrNotExist) {
				clientID = fmt.Sprintf("%05d", newID)
				break
			}
			newID++
		}
	}
	if err := os.Rename(absPath, dest); err != nil {
		return "", err
	}
	a.remapDocumentMetadataPrefix(absPath, dest)
	_ = a.metadataRenamePrefix("client-profile", a.documentMetadataKey(absPath), a.documentMetadataKey(dest))
	_ = a.appendAudit(dest, "Client unarchived", fmt.Sprintf("Client restored to active workspace as ID %s", clientID))
	return dest, nil
}

func (a *App) AddClient(name, address, phone, email, taxID, returnType string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	name = sanitizeName(name)
	if name == "" {
		return "", errors.New("client name is required")
	}
	returnType = strings.ToUpper(strings.TrimSpace(returnType))
	switch returnType {
	case "1040", "1065", "1120S", "1120":
	default:
		return "", errors.New("select a return type: 1040, 1065, 1120S, or 1120")
	}
	id := a.nextClientID()
	if id > 99999 {
		return "", errors.New("no 5-digit client IDs are available")
	}
	clientDir := filepath.Join(a.dataRoot, fmt.Sprintf("%05d - %s", id, name))
	if err := os.MkdirAll(filepath.Join(clientDir, permanentFolder), 0700); err != nil {
		return "", err
	}
	if err := a.secureWriteFile(filepath.Join(clientDir, permanentFolder, notesFile), []byte("")); err != nil {
		return "", err
	}
	profile := ClientProfile{
		Address:    strings.TrimSpace(address),
		Phone:      strings.TrimSpace(phone),
		Email:      strings.TrimSpace(email),
		TaxID:      strings.TrimSpace(taxID),
		ReturnType: returnType,
	}
	if err := a.writeClientProfile(clientDir, profile); err != nil {
		return "", err
	}
	_ = a.appendAudit(clientDir, "Client created", fmt.Sprintf("Client ID %05d • Return type %s", id, returnType))
	return clientDir, nil
}

func (a *App) RenameClient(path, newName string) (string, error) {
	path, err := a.requireType(path, "client")
	if err != nil {
		return "", err
	}
	newName = sanitizeName(newName)
	if newName == "" {
		return "", errors.New("client name is required")
	}
	base := filepath.Base(path)
	parts := strings.SplitN(base, " - ", 2)
	if len(parts) != 2 {
		return "", errors.New("invalid client folder")
	}
	oldName := parts[1]
	newPath := filepath.Join(filepath.Dir(path), parts[0]+" - "+newName)
	if err := os.Rename(path, newPath); err != nil {
		return "", err
	}
	a.remapDocumentMetadataPrefix(path, newPath)
	_ = a.metadataRenamePrefix("client-profile", a.documentMetadataKey(path), a.documentMetadataKey(newPath))
	_ = a.appendAudit(newPath, "Client renamed", fmt.Sprintf("%s → %s", oldName, newName))
	return newPath, nil
}

func (a *App) DeleteClient(path string) error {
	path, err := a.requireType(path, "client")
	if err != nil {
		return err
	}
	_, displayName, _ := parseClientDirName(filepath.Base(path))
	_ = a.appendAudit(path, "Client moved to Recycle Bin", displayName)
	return a.moveToRecycleBin(path, "client", "Work Space")
}

func (a *App) AddTaxYear(clientPath, year string) (string, error) {
	clientPath, err := a.requireType(clientPath, "client")
	if err != nil {
		return "", err
	}
	year = strings.TrimSpace(year)
	if !isTaxYear(year) {
		return "", errors.New("enter a 4-digit tax year, for example 2026")
	}
	p := filepath.Join(clientPath, year)
	if err := os.Mkdir(p, 0700); err != nil {
		return "", err
	}
	_ = a.appendAudit(p, "Tax year added", year)
	return p, nil
}

func (a *App) RenameTaxYear(path, year string) (string, error) {
	path, err := a.requireType(path, "taxyear")
	if err != nil {
		return "", err
	}
	oldYear := filepath.Base(path)
	year = strings.TrimSpace(year)
	if !isTaxYear(year) {
		return "", errors.New("enter a 4-digit tax year")
	}
	newPath := filepath.Join(filepath.Dir(path), year)
	if err := os.Rename(path, newPath); err != nil {
		return "", err
	}
	a.remapDocumentMetadataPrefix(path, newPath)
	_ = a.appendAudit(newPath, "Tax year renamed", fmt.Sprintf("%s → %s", oldYear, year))
	return newPath, nil
}

func (a *App) DeleteTaxYear(path string) error {
	path, err := a.requireType(path, "taxyear")
	if err != nil {
		return err
	}
	_ = a.appendAudit(path, "Tax year moved to Recycle Bin", filepath.Base(path))
	_, clientName, _ := parseClientDirName(filepath.Base(filepath.Dir(path)))
	return a.moveToRecycleBin(path, "taxyear", clientName)
}

func (a *App) AddSection(parentPath, name string) (string, error) {
	parentPath, err := a.safePath(parentPath)
	if err != nil {
		return "", err
	}
	t := a.pathType(parentPath)
	if t != "client" && t != "taxyear" && t != "section" {
		return "", errors.New("select a client, tax year, or section first")
	}
	// A section selected for Add Section creates a sibling, never nests or moves documents.
	if t == "section" {
		parentPath = filepath.Dir(parentPath)
	}
	name = sanitizeName(name)
	if name == "" {
		return "", errors.New("section name is required")
	}
	if isTaxYear(name) || strings.HasPrefix(name, ".") || name == permanentFolder {
		return "", errors.New("choose a section name other than a tax year or reserved folder name")
	}
	p := filepath.Join(parentPath, name)
	if err := os.Mkdir(p, 0700); err != nil {
		return "", err
	}
	_ = a.appendAudit(p, "Section added", name)
	return p, nil
}

func (a *App) RenameSection(path, name string) (string, error) {
	path, err := a.requireType(path, "section")
	if err != nil {
		return "", err
	}
	name = sanitizeName(name)
	if name == "" {
		return "", errors.New("section name is required")
	}
	oldName := filepath.Base(path)
	newPath := filepath.Join(filepath.Dir(path), name)
	if err := os.Rename(path, newPath); err != nil {
		return "", err
	}
	a.remapDocumentMetadataPrefix(path, newPath)
	_ = a.appendAudit(newPath, "Section renamed", fmt.Sprintf("%s → %s", oldName, name))
	return newPath, nil
}

func (a *App) DeleteSection(path string) error {
	path, err := a.requireType(path, "section")
	if err != nil {
		return err
	}
	// Remove only an empty directory; os.Remove also closes the check/delete race.
	entries, err := os.ReadDir(path)
	if err != nil {
		return err
	}
	if len(entries) != 0 {
		return errors.New("delete or move every file and subsection before deleting this section")
	}
	if err := os.Remove(path); err != nil {
		return fmt.Errorf("section must be empty before deletion: %w", err)
	}
	_ = a.appendAudit(path, "Section deleted", filepath.Base(path))
	a.removeDocumentMetadataPrefix(path)
	return nil
}

func (a *App) nextClientID() int {
	entries, _ := os.ReadDir(a.dataRoot)
	max := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if len(name) >= 5 {
			if n, err := strconv.Atoi(name[:5]); err == nil && n > max {
				max = n
			}
		}
	}
	for _, id := range a.recycledClientIDs() {
		if n, err := strconv.Atoi(id); err == nil && n > max {
			max = n
		}
	}
	return max + 1
}

func (a *App) clientPathFor(path string) (string, error) {
	p, err := a.safePath(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(a.dataRoot, p)
	if err != nil {
		return "", err
	}
	parts := splitRel(rel)
	if len(parts) < 1 || !isClientDirName(parts[0]) {
		return "", errors.New("select an item under a client")
	}
	return filepath.Join(a.dataRoot, parts[0]), nil
}

func (a *App) readClientProfile(clientPath string) (ClientProfile, error) {
	clientPath, err := a.requireType(clientPath, "client")
	if err != nil {
		return ClientProfile{}, err
	}
	var profile ClientProfile
	err = a.metadataJSONGet("client-profile", a.documentMetadataKey(clientPath), &profile)
	if errors.Is(err, os.ErrNotExist) {
		return ClientProfile{}, nil
	}
	return profile, err
}

func (a *App) writeClientProfile(clientPath string, profile ClientProfile) error {
	clientPath, err := a.requireType(clientPath, "client")
	if err != nil {
		return err
	}
	return a.metadataJSONPut("client-profile", a.documentMetadataKey(clientPath), profile)
}

func parseClientDirName(s string) (clientID, displayName string, ok bool) {
	if len(s) < 9 || s[5:8] != " - " {
		return "", "", false
	}
	if _, err := strconv.Atoi(s[:5]); err != nil {
		return "", "", false
	}
	displayName = strings.TrimSpace(s[8:])
	if displayName == "" {
		return "", "", false
	}
	return s[:5], displayName, true
}

func isClientDirName(s string) bool {
	_, _, ok := parseClientDirName(s)
	return ok
}

func isTaxYear(s string) bool {
	if len(s) != 4 {
		return false
	}
	n, err := strconv.Atoi(s)
	return err == nil && n >= 1900 && n <= 2200
}

func sanitizeName(s string) string {
	s = strings.TrimSpace(s)
	r := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "\x00", "")
	s = r.Replace(s)
	return strings.TrimSpace(s)
}

func uniqueDestination(path string) string {
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return path
	}
	dir, ext := filepath.Dir(path), filepath.Ext(path)
	base := strings.TrimSuffix(filepath.Base(path), ext)
	for i := 2; ; i++ {
		p := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
		if _, err := os.Stat(p); errors.Is(err, os.ErrNotExist) {
			return p
		}
	}
}
