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

// Uploading a file with the same name as an existing document replaces it
// and keeps the old copy as a previous version. Versions live, still
// encrypted, in a hidden .versions folder next to the document and follow it
// when it is renamed, moved, deleted or restored.

const versionsDirName = ".versions"
const maxDocumentVersions = 20
const versionTimeLayout = "2006-01-02 150405.000"

type DocumentVersion struct {
	ID      string `json:"id"`
	SavedAt string `json:"savedAt"`
	Size    int64  `json:"size"`
}

func versionsFolder(path string) string {
	return filepath.Join(filepath.Dir(path), versionsDirName, filepath.Base(path))
}

// archiveCurrentVersion moves an existing document into its version history
// and returns where it went, or "" when there was nothing to keep.
func archiveCurrentVersion(path string) (string, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("%s is a folder", filepath.Base(path))
	}
	dir := versionsFolder(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	dest := filepath.Join(dir, time.Now().Format(versionTimeLayout)+filepath.Ext(path))
	dest = uniqueDestination(dest)
	if err := os.Rename(path, dest); err != nil {
		return "", err
	}
	pruneVersions(dir)
	return dest, nil
}

func pruneVersions(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) <= maxDocumentVersions {
		return
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // timestamps sort oldest first
	for len(names) > maxDocumentVersions {
		_ = os.Remove(filepath.Join(dir, names[0]))
		names = names[1:]
	}
}

// moveVersions keeps a document's history with it after a rename or move.
func moveVersions(oldPath, newPath string) {
	src := versionsFolder(oldPath)
	if _, err := os.Stat(src); err != nil {
		return
	}
	dst := versionsFolder(newPath)
	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return
	}
	if _, err := os.Stat(dst); err == nil {
		// Merge into an existing history (rare: two documents shared a name).
		entries, _ := os.ReadDir(src)
		for _, e := range entries {
			_ = os.Rename(filepath.Join(src, e.Name()), uniqueDestination(filepath.Join(dst, e.Name())))
		}
		_ = os.Remove(src)
	} else {
		_ = os.Rename(src, dst)
	}
	removeEmptyVersionsDir(filepath.Dir(oldPath))
}

func removeEmptyVersionsDir(folder string) {
	_ = os.Remove(filepath.Join(folder, versionsDirName)) // only succeeds when empty
}

// storeNewVersion writes data from src into dst. An existing dst becomes a
// previous version; if the copy fails it is put back.
func (a *App) storeNewVersion(src, dst string) (replaced bool, err error) {
	archived, err := archiveCurrentVersion(dst)
	if err != nil {
		return false, err
	}
	if err := a.secureCopyFile(src, dst); err != nil {
		if archived != "" {
			_ = os.Rename(archived, dst)
		}
		return false, err
	}
	return archived != "", nil
}

func (a *App) versionPath(path, id string) (string, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return "", err
	}
	if id == "" || id != filepath.Base(id) || strings.HasPrefix(id, ".") {
		return "", errors.New("invalid version")
	}
	p := filepath.Join(versionsFolder(path), id)
	if info, err := os.Lstat(p); err != nil || !info.Mode().IsRegular() {
		return "", errors.New("that version no longer exists")
	}
	return p, nil
}

func (a *App) ListDocumentVersions(path string) ([]DocumentVersion, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(versionsFolder(path))
	if errors.Is(err, os.ErrNotExist) {
		return []DocumentVersion{}, nil
	}
	if err != nil {
		return nil, err
	}
	out := []DocumentVersion{}
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		stamp := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		saved := info.ModTime()
		if t, err := time.ParseInLocation(versionTimeLayout, stamp, time.Local); err == nil {
			saved = t
		}
		out = append(out, DocumentVersion{ID: e.Name(), SavedAt: saved.Format(time.RFC3339), Size: info.Size()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SavedAt > out[j].SavedAt })
	return out, nil
}

// RestoreDocumentVersion makes an older version current again. The version
// being replaced is kept in the history, so nothing is lost.
func (a *App) RestoreDocumentVersion(path, id string) error {
	version, err := a.versionPath(path, id)
	if err != nil {
		return err
	}
	path, _ = a.requireType(path, "file")
	held := version + ".restoring"
	if err := os.Rename(version, held); err != nil {
		return err
	}
	if _, err := archiveCurrentVersion(path); err != nil {
		_ = os.Rename(held, version)
		return err
	}
	if err := os.Rename(held, path); err != nil {
		return err
	}
	_ = a.appendAudit(path, "Previous version restored", filepath.Base(path))
	return nil
}

func (a *App) OpenDocumentVersion(path, id string) error {
	version, err := a.versionPath(path, id)
	if err != nil {
		return err
	}
	plainPath, cleanup, err := a.decryptedTemp(version)
	if err != nil {
		return err
	}
	if err := openPath(plainPath); err != nil {
		cleanup()
		return err
	}
	return nil
}
