package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Deleted files, tax years and clients go to a Recycle Bin inside the
// company vault instead of being erased. They stay encrypted, keep their
// descriptions and Done marks, and can be restored for 30 days.

const recycleBinDir = ".recycle-bin"
const recycleRetention = 30 * 24 * time.Hour

type RecycleItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"` // file, taxyear or client
	OriginalKey string `json:"originalKey"`
	Location    string `json:"location"`
	DeletedAt   string `json:"deletedAt"`
	DeletedBy   string `json:"deletedBy"`
	ExpiresAt   string `json:"expiresAt"`
}

func (a *App) recycleRoot() string { return filepath.Join(a.dataRoot, recycleBinDir) }

func (a *App) recycleItemPath(item RecycleItem) string {
	return filepath.Join(a.recycleRoot(), item.ID, filepath.Base(filepath.FromSlash(item.OriginalKey)))
}

func (a *App) recycleItemKey(item RecycleItem) string {
	return recycleBinDir + "/" + item.ID + "/" + filepath.Base(filepath.FromSlash(item.OriginalKey))
}

func (a *App) loadRecycleIndex() ([]RecycleItem, error) {
	var items []RecycleItem
	err := a.metadataJSONGet("recycle-bin", "all", &items)
	if errors.Is(err, os.ErrNotExist) {
		return []RecycleItem{}, nil
	}
	return items, err
}

func (a *App) saveRecycleIndex(items []RecycleItem) error {
	return a.metadataJSONPut("recycle-bin", "all", items)
}

// remapMetadataKeys moves descriptions and Done marks stored under oldKey (and
// anything beneath it) to newKey. Keys are paths relative to the data folder.
func (a *App) remapMetadataKeys(oldKey, newKey string) {
	move := func(m map[string]string) bool {
		changed := false
		for key, value := range m {
			if key == oldKey || strings.HasPrefix(key, oldKey+"/") {
				delete(m, key)
				m[newKey+strings.TrimPrefix(key, oldKey)] = value
				changed = true
			}
		}
		return changed
	}
	if meta, err := a.readDocumentMetadata(); err == nil && move(meta) {
		_ = a.writeDocumentMetadata(meta)
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		changed := false
		for key, value := range statuses {
			if key == oldKey || strings.HasPrefix(key, oldKey+"/") {
				delete(statuses, key)
				statuses[newKey+strings.TrimPrefix(key, oldKey)] = value
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

func (a *App) removeMetadataKeys(prefix string) {
	if meta, err := a.readDocumentMetadata(); err == nil {
		changed := false
		for key := range meta {
			if key == prefix || strings.HasPrefix(key, prefix+"/") {
				delete(meta, key)
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentMetadata(meta)
		}
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		changed := false
		for key := range statuses {
			if key == prefix || strings.HasPrefix(key, prefix+"/") {
				delete(statuses, key)
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

// moveToRecycleBin is called by DeleteFile, DeleteTaxYear and DeleteClient
// after their own checks. path must already be validated.
func (a *App) moveToRecycleBin(path, kind, location string) error {
	a.recycleMu.Lock()
	defer a.recycleMu.Unlock()
	a.purgeExpiredUnlocked()
	rel, err := filepath.Rel(a.dataRoot, path)
	if err != nil || strings.HasPrefix(rel, "..") {
		return errors.New("item is outside the company data folder")
	}
	idBytes := make([]byte, 6)
	if _, err := rand.Read(idBytes); err != nil {
		return err
	}
	now := time.Now()
	item := RecycleItem{
		ID:          now.Format("20060102-150405") + "-" + hex.EncodeToString(idBytes),
		Name:        filepath.Base(path),
		Kind:        kind,
		OriginalKey: filepath.ToSlash(rel),
		Location:    location,
		DeletedAt:   now.Format(time.RFC3339),
		ExpiresAt:   now.Add(recycleRetention).Format(time.RFC3339),
	}
	if user, _ := a.auditContext(); user.Username != "" {
		item.DeletedBy = strings.TrimSpace(user.FirstName + " " + user.LastName)
		if item.DeletedBy == "" {
			item.DeletedBy = user.Username
		}
	}
	items, err := a.loadRecycleIndex()
	if err != nil {
		return err
	}
	dest := a.recycleItemPath(item)
	if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
		return err
	}
	if err := os.Rename(path, dest); err != nil {
		_ = os.Remove(filepath.Dir(dest))
		return fmt.Errorf("move to Recycle Bin: %w", err)
	}
	if kind == "file" {
		// Previous versions go with the document.
		if _, err := os.Stat(versionsFolder(path)); err == nil {
			_ = os.Rename(versionsFolder(path), filepath.Join(filepath.Dir(dest), versionsDirName))
			removeEmptyVersionsDir(filepath.Dir(path))
		}
	}
	items = append(items, item)
	if err := a.saveRecycleIndex(items); err != nil {
		// Without an index entry the item could never be restored, so put it back.
		_ = os.Rename(dest, path)
		_ = os.Remove(filepath.Dir(dest))
		return err
	}
	a.remapMetadataKeys(item.OriginalKey, a.recycleItemKey(item))
	if kind == "client" {
		_ = a.metadataRenamePrefix("client-profile", item.OriginalKey, a.recycleItemKey(item))
	}
	return nil
}

// purgeExpiredUnlocked permanently removes items older than 30 days.
func (a *App) purgeExpiredUnlocked() {
	items, err := a.loadRecycleIndex()
	if err != nil {
		return
	}
	now := time.Now()
	kept := items[:0]
	changed := false
	for _, item := range items {
		expires, err := time.Parse(time.RFC3339, item.ExpiresAt)
		if err == nil && now.After(expires) {
			a.eraseRecycleItem(item)
			changed = true
			continue
		}
		kept = append(kept, item)
	}
	if changed {
		_ = a.saveRecycleIndex(kept)
	}
}

func (a *App) eraseRecycleItem(item RecycleItem) {
	_ = os.RemoveAll(filepath.Join(a.recycleRoot(), item.ID))
	a.removeMetadataKeys(a.recycleItemKey(item))
	if item.Kind == "client" {
		_ = a.metadataDelete("client-profile", a.recycleItemKey(item))
	}
}

func (a *App) ListRecycleBin() ([]RecycleItem, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	a.recycleMu.Lock()
	defer a.recycleMu.Unlock()
	a.purgeExpiredUnlocked()
	items, err := a.loadRecycleIndex()
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].DeletedAt > items[j].DeletedAt })
	return items, nil
}

func (a *App) findRecycleItem(items []RecycleItem, id string) (int, error) {
	for i, item := range items {
		if item.ID == id {
			return i, nil
		}
	}
	return -1, errors.New("that item is no longer in the Recycle Bin")
}

// RestoreFromRecycleBin puts an item back where it was and returns its path.
func (a *App) RestoreFromRecycleBin(id string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	a.recycleMu.Lock()
	defer a.recycleMu.Unlock()
	items, err := a.loadRecycleIndex()
	if err != nil {
		return "", err
	}
	index, err := a.findRecycleItem(items, id)
	if err != nil {
		return "", err
	}
	item := items[index]
	src := a.recycleItemPath(item)
	dest := filepath.Join(a.dataRoot, filepath.FromSlash(item.OriginalKey))
	if rel, err := filepath.Rel(a.dataRoot, dest); err != nil || strings.HasPrefix(rel, "..") || strings.HasPrefix(rel, recycleBinDir) {
		return "", errors.New("the original location is not valid")
	}
	switch item.Kind {
	case "client":
		if _, err := os.Stat(dest); err == nil {
			return "", errors.New("a client folder with the same number and name already exists")
		}
	default:
		// The client must still exist; a deleted tax year or section is recreated.
		parts := strings.SplitN(item.OriginalKey, "/", 2)
		clientDir := filepath.Join(a.dataRoot, filepath.FromSlash(parts[0]))
		if info, err := os.Stat(clientDir); err != nil || !info.IsDir() {
			return "", errors.New("restore the client first: its folder is no longer in the Work Space")
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
			return "", err
		}
		if _, err := os.Stat(dest); err == nil {
			if item.Kind != "file" {
				return "", fmt.Errorf("%s already exists; rename or delete it first", item.Name)
			}
			dest = uniqueDestination(dest)
		}
	}
	if err := os.Rename(src, dest); err != nil {
		return "", fmt.Errorf("restore: %w", err)
	}
	if held := filepath.Join(filepath.Dir(src), versionsDirName); item.Kind == "file" {
		if _, err := os.Stat(held); err == nil && os.MkdirAll(filepath.Dir(versionsFolder(dest)), 0700) == nil {
			_ = os.Rename(held, versionsFolder(dest))
		}
	}
	_ = os.RemoveAll(filepath.Dir(src))
	rel, _ := filepath.Rel(a.dataRoot, dest)
	newKey := filepath.ToSlash(rel)
	a.remapMetadataKeys(a.recycleItemKey(item), newKey)
	if item.Kind == "client" {
		_ = a.metadataRenamePrefix("client-profile", a.recycleItemKey(item), newKey)
	}
	items = append(items[:index], items[index+1:]...)
	if err := a.saveRecycleIndex(items); err != nil {
		return "", err
	}
	_ = a.appendAudit(dest, "Restored from Recycle Bin", item.Name)
	return dest, nil
}

func (a *App) DeleteFromRecycleBin(id string) error {
	if err := a.requireAdministrator("permanently delete items from the Recycle Bin"); err != nil {
		return err
	}
	a.recycleMu.Lock()
	defer a.recycleMu.Unlock()
	items, err := a.loadRecycleIndex()
	if err != nil {
		return err
	}
	index, err := a.findRecycleItem(items, id)
	if err != nil {
		return err
	}
	a.eraseRecycleItem(items[index])
	_ = a.appendAppAuditCurrent("", "", "Permanently deleted from Recycle Bin", items[index].Name)
	return a.saveRecycleIndex(append(items[:index], items[index+1:]...))
}

func (a *App) EmptyRecycleBin() error {
	if err := a.requireAdministrator("empty the Recycle Bin"); err != nil {
		return err
	}
	a.recycleMu.Lock()
	defer a.recycleMu.Unlock()
	items, err := a.loadRecycleIndex()
	if err != nil {
		return err
	}
	for _, item := range items {
		a.eraseRecycleItem(item)
	}
	_ = a.appendAppAuditCurrent("", "", "Recycle Bin emptied", strconv.Itoa(len(items))+" item(s)")
	return a.saveRecycleIndex([]RecycleItem{})
}

// recycledClientIDs keeps new clients from reusing the number of a client
// that is still in the Recycle Bin.
func (a *App) recycledClientIDs() []string {
	items, err := a.loadRecycleIndex()
	if err != nil {
		return nil
	}
	var ids []string
	for _, item := range items {
		if item.Kind == "client" && len(item.Name) >= 5 {
			ids = append(ids, item.Name[:5])
		}
	}
	return ids
}
