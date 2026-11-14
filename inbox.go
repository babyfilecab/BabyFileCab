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
// to. While someone is signed in, each new scan is encrypted into a holding
// folder inside the vault within a few seconds and the unencrypted original
// is removed, so scans don't sit around in plain form waiting to be filed.
// Filing one then moves it from the holding folder into the client.

// inboxHoldDir is the encrypted holding folder inside the company vault. The
// leading dot keeps it out of the client list.
const inboxHoldDir = ".Inbox"

// vaultFileOverhead is what encryption adds to a file: the marker, the
// 12-byte nonce and the 16-byte tag.
const vaultFileOverhead = len(vaultFileMagic) + 12 + 16

type InboxFile struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
	// Encrypted is false only when a scan couldn't be taken in yet (for
	// example it is still open in another program).
	Encrypted bool `json:"encrypted"`
}

func (a *App) inboxHoldPath() string { return filepath.Join(a.dataRoot, inboxHoldDir) }

// freeInboxName picks a name in the holding folder that isn't taken.
func freeInboxName(dir, name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	candidate := name
	for i := 2; ; i++ {
		if _, err := os.Lstat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
		candidate = fmt.Sprintf("%s (%d)%s", stem, i, ext)
	}
}

// intakeInbox encrypts every finished file in the watched folder into the
// holding folder, checks the encrypted copy, and only then deletes the
// original. Anything that fails stays where it is and is tried again later.
func (a *App) intakeInbox() (int, error) {
	if a.requireSignedIn() != nil {
		return 0, nil
	}
	folder := a.inboxFolder()
	if folder == "" {
		return 0, nil
	}
	a.inboxMu.Lock()
	defer a.inboxMu.Unlock()
	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0, err
	}
	hold := a.inboxHoldPath()
	if err := os.MkdirAll(hold, 0700); err != nil {
		return 0, err
	}
	taken := 0
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !inboxFileUsable(e.Name(), info) {
			continue
		}
		src := filepath.Join(folder, e.Name())
		plain, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		dst := filepath.Join(hold, freeInboxName(hold, e.Name()))
		err = a.secureWriteFile(dst, plain)
		if err == nil {
			var back []byte
			back, err = a.secureReadFile(dst)
			if err == nil && string(back) != string(plain) {
				err = errors.New("encrypted copy did not match")
			}
			zeroBytes(back)
		}
		zeroBytes(plain)
		if err != nil {
			_ = os.Remove(dst)
			continue
		}
		_ = os.Chtimes(dst, info.ModTime(), info.ModTime())
		if err := os.Remove(src); err != nil {
			// Keep one copy only: if the original can't be removed (still
			// open elsewhere), drop the encrypted copy and try again later.
			_ = os.Remove(dst)
			continue
		}
		taken++
	}
	if taken > 0 {
		_ = a.appendAppAuditCurrent("", "", "Scans encrypted from inbox folder", fmt.Sprintf("%d file(s)", taken))
	}
	return taken, nil
}

// watchInbox takes in new scans every few seconds while someone is signed in.
func (a *App) watchInbox(done <-chan struct{}) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			_, _ = a.intakeInbox()
		}
	}
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
	_, intakeErr := a.intakeInbox()
	out := []InboxFile{}
	if entries, err := os.ReadDir(a.inboxHoldPath()); err == nil {
		for _, e := range entries {
			info, err := e.Info()
			if err != nil || !info.Mode().IsRegular() || strings.HasPrefix(e.Name(), ".") {
				continue
			}
			size := info.Size() - int64(vaultFileOverhead)
			if size < 0 {
				size = 0
			}
			out = append(out, InboxFile{Name: e.Name(), Size: size, Modified: info.ModTime().Format(time.RFC3339), Encrypted: true})
		}
	}
	// Scans that couldn't be taken in yet still show, so nothing goes missing.
	entries, err := os.ReadDir(folder)
	if err != nil {
		if intakeErr != nil {
			return nil, fmt.Errorf("could not read the scan inbox folder: %w", intakeErr)
		}
		return nil, fmt.Errorf("could not read the scan inbox folder: %w", err)
	}
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !inboxFileUsable(e.Name(), info) {
			continue
		}
		out = append(out, InboxFile{Name: e.Name(), Size: info.Size(), Modified: info.ModTime().Format(time.RFC3339)})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Modified > out[j].Modified })
	return out, nil
}

// inboxFilePath finds a scan in the encrypted holding folder, or failing
// that in the watched folder. encrypted says which.
func (a *App) inboxFilePath(name string) (path string, encrypted bool, err error) {
	if name == "" || name != filepath.Base(name) || name == "." || name == ".." || strings.HasPrefix(name, ".") {
		return "", false, errors.New("invalid inbox file")
	}
	held := filepath.Join(a.inboxHoldPath(), name)
	if info, err := os.Lstat(held); err == nil && info.Mode().IsRegular() {
		return held, true, nil
	}
	folder := a.inboxFolder()
	if folder == "" {
		return "", false, errors.New("choose a scan inbox folder first (Settings › Data & Backups)")
	}
	p := filepath.Join(folder, name)
	info, err := os.Lstat(p)
	if err != nil || !info.Mode().IsRegular() {
		return "", false, errors.New("that file is no longer in the inbox")
	}
	return p, false, nil
}

// OpenInboxFile shows a scan in its normal desktop app before filing it.
func (a *App) OpenInboxFile(name string) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	p, encrypted, err := a.inboxFilePath(name)
	if err != nil {
		return err
	}
	if !encrypted {
		return openPath(p)
	}
	tmp, _, err := a.decryptedTemp(p)
	if err != nil {
		return err
	}
	return openPath(tmp)
}

// DiscardInboxFile moves an unwanted scan to the Recycle Bin.
func (a *App) DiscardInboxFile(name string) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	a.inboxMu.Lock()
	defer a.inboxMu.Unlock()
	p, encrypted, err := a.inboxFilePath(name)
	if err != nil {
		return err
	}
	if !encrypted {
		return errors.New("this scan hasn't been encrypted yet; try again in a few seconds")
	}
	return a.moveToRecycleBin(p, "file", "Scan Inbox")
}

// FileInboxDocument encrypts an inbox file into the chosen folder and then
// removes it from the inbox. Returns the new document path.
func (a *App) FileInboxDocument(name, targetPath, newName string) (string, error) {
	targetPath, err := a.uploadTarget(targetPath)
	if err != nil {
		return "", err
	}
	a.inboxMu.Lock()
	defer a.inboxMu.Unlock()
	src, encrypted, err := a.inboxFilePath(name)
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
	// Only remove the inbox copy once the filed copy reads back correctly.
	var original []byte
	if encrypted {
		original, err = a.secureReadFile(src)
	} else {
		original, err = os.ReadFile(src)
	}
	if err != nil {
		return "", err
	}
	stored, err := a.secureReadFile(dst)
	if err != nil || string(stored) != string(original) {
		return "", errors.New("the filed copy could not be verified; the scan was left in the inbox")
	}
	zeroBytes(original)
	zeroBytes(stored)
	if err := os.Remove(src); err != nil {
		return dst, fmt.Errorf("filed, but the scan could not be removed from the inbox: %w", err)
	}
	var updated []string
	if replaced {
		updated = []string{newName}
	}
	a.auditImported(targetPath, "Filed from scan inbox", []string{dst}, updated)
	return dst, nil
}
