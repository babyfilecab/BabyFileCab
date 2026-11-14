package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Scan inbox: point BabyFileCab at the folder your scanner or phone app saves
// to. New files show up in an Inbox list, and filing one moves it into the
// encrypted vault and removes the plaintext original from the inbox folder.

type InboxFile struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

func (a *App) inboxFolder() string {
	var folder string
	if err := a.metadataJSONGet("settings", "inbox-folder", &folder); err != nil {
		return ""
	}
	return folder
}

func (a *App) GetInboxFolder() (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	return a.inboxFolder(), nil
}

func (a *App) ChooseInboxFolder() (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	if a.ctx == nil {
		return "", errors.New("application is not ready")
	}
	folder, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Choose the folder your scanner saves to",
	})
	if err != nil || folder == "" {
		return a.inboxFolder(), err
	}
	folder, err = filepath.Abs(folder)
	if err != nil {
		return "", err
	}
	storage, _ := filepath.Abs(a.storageRoot)
	if folder == storage || strings.HasPrefix(folder, storage+string(os.PathSeparator)) || strings.HasPrefix(storage, folder+string(os.PathSeparator)) {
		return "", errors.New("choose a folder outside BabyFileCab's data folder")
	}
	if err := a.metadataJSONPut("settings", "inbox-folder", folder); err != nil {
		return "", err
	}
	_ = a.appendAppAuditCurrent("", "", "Scan inbox folder set", folder)
	return folder, nil
}

func (a *App) ClearInboxFolder() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	return a.metadataDelete("settings", "inbox-folder")
}

// inboxFileUsable skips hidden files, partial downloads and files that are
// still being written.
func inboxFileUsable(name string, info os.FileInfo) bool {
	if !info.Mode().IsRegular() || strings.HasPrefix(name, ".") || strings.HasPrefix(name, "~$") {
		return false
	}
	lower := strings.ToLower(name)
	for _, ext := range []string{".part", ".crdownload", ".tmp", ".download", ".partial"} {
		if strings.HasSuffix(lower, ext) {
			return false
		}
	}
	if lower == "desktop.ini" || lower == "thumbs.db" {
		return false
	}
	return time.Since(info.ModTime()) > 3*time.Second
}

func (a *App) ListInbox() ([]InboxFile, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	folder := a.inboxFolder()
	if folder == "" {
		return []InboxFile{}, nil
	}
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, fmt.Errorf("could not read the scan inbox folder: %w", err)
	}
	out := []InboxFile{}
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !inboxFileUsable(e.Name(), info) {
			continue
		}
		out = append(out, InboxFile{Name: e.Name(), Size: info.Size(), Modified: info.ModTime().Format(time.RFC3339)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Modified > out[j].Modified })
	return out, nil
}

func (a *App) inboxFilePath(name string) (string, error) {
	folder := a.inboxFolder()
	if folder == "" {
		return "", errors.New("choose a scan inbox folder first (Settings › Scan Inbox Folder)")
	}
	if name == "" || name != filepath.Base(name) || name == "." || name == ".." {
		return "", errors.New("invalid inbox file")
	}
	p := filepath.Join(folder, name)
	info, err := os.Lstat(p)
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("that file is no longer in the inbox")
	}
	return p, nil
}

// OpenInboxFile shows a scan in its normal desktop app before filing it.
func (a *App) OpenInboxFile(name string) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	p, err := a.inboxFilePath(name)
	if err != nil {
		return err
	}
	return openPath(p)
}

// FileInboxDocument encrypts an inbox file into the chosen folder and then
// removes the original from the inbox. Returns the new document path.
func (a *App) FileInboxDocument(name, targetPath, newName string) (string, error) {
	targetPath, err := a.uploadTarget(targetPath)
	if err != nil {
		return "", err
	}
	src, err := a.inboxFilePath(name)
	if err != nil {
		return "", err
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		newName = name
	}
	if newName != filepath.Base(newName) || strings.HasPrefix(newName, ".") {
		return "", errors.New("enter a file name without folders")
	}
	if filepath.Ext(newName) == "" {
		newName += filepath.Ext(name)
	}
	dst := filepath.Join(targetPath, newName)
	replaced, err := a.storeNewVersion(src, dst)
	if err != nil {
		return "", err
	}
	// Only remove the original once the encrypted copy reads back correctly.
	original, err := os.ReadFile(src)
	if err != nil {
		return "", err
	}
	stored, err := a.secureReadFile(dst)
	if err != nil || string(stored) != string(original) {
		return "", errors.New("the filed copy could not be verified; the original was left in the inbox")
	}
	zeroBytes(original)
	zeroBytes(stored)
	if err := os.Remove(src); err != nil {
		return dst, fmt.Errorf("filed, but the original could not be removed from the inbox: %w", err)
	}
	var updated []string
	if replaced {
		updated = []string{newName}
	}
	a.auditImported(targetPath, "Filed from scan inbox", []string{dst}, updated)
	return dst, nil
}
