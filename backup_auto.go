package main

import (
	"archive/zip"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Automatic backups copy the whole BabyFileCab data folder into one zip in a
// folder of your choice (an external drive, a NAS, a synced folder). Client
// files, databases and vault keys are already encrypted, so the backup is too;
// your normal password is all you need to open a restored copy.

const backupManifestFull = "BFC-FULL-BACKUP.json"
const backupFilePrefix = "BabyFileCab-Backup-"

type BackupSettings struct {
	Folder     string `json:"folder"`
	Frequency  string `json:"frequency"` // off, daily or weekly
	Keep       int    `json:"keep"`
	LastRun    string `json:"lastRun,omitempty"`
	LastOK     string `json:"lastOk,omitempty"`
	LastError  string `json:"lastError,omitempty"`
	LastFile   string `json:"lastFile,omitempty"`
	LastSizeMB int64  `json:"lastSizeMb,omitempty"`
}

type BackupInfo struct {
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
	Files     int    `json:"files"`
	SizeBytes int64  `json:"sizeBytes"`
}

type fullBackupManifest struct {
	Format    int    `json:"format"`
	CreatedAt string `json:"createdAt"`
	Version   string `json:"version"`
	Files     int    `json:"files"`
}

func (a *App) loadBackupSettings() BackupSettings {
	s := BackupSettings{Frequency: "off", Keep: 10}
	_ = a.metadataJSONGet("settings", "auto-backup", &s)
	if s.Keep < 1 {
		s.Keep = 10
	}
	return s
}

func (a *App) saveBackupSettings(s BackupSettings) error {
	return a.metadataJSONPut("settings", "auto-backup", s)
}

func (a *App) GetBackupSettings() (BackupSettings, error) {
	if err := a.requireSignedIn(); err != nil {
		return BackupSettings{}, err
	}
	return a.loadBackupSettings(), nil
}

func (a *App) ChooseBackupFolder() (string, error) {
	if err := a.requireAdministrator("change backup settings"); err != nil {
		return "", err
	}
	folder, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Choose where to save BabyFileCab backups"})
	if err != nil || folder == "" {
		return "", err
	}
	return filepath.Abs(folder)
}

func (a *App) SaveBackupSettings(folder, frequency string, keep int) (BackupSettings, error) {
	if err := a.requireAdministrator("change backup settings"); err != nil {
		return BackupSettings{}, err
	}
	s := a.loadBackupSettings()
	if frequency != "off" && frequency != "daily" && frequency != "weekly" {
		return s, errors.New("choose Off, Daily or Weekly")
	}
	if keep < 1 || keep > 100 {
		return s, errors.New("keep between 1 and 100 backups")
	}
	folder = strings.TrimSpace(folder)
	if frequency != "off" {
		if folder == "" {
			return s, errors.New("choose a backup folder first")
		}
		if err := a.checkBackupFolder(folder); err != nil {
			return s, err
		}
	}
	s.Folder, s.Frequency, s.Keep = folder, frequency, keep
	if err := a.saveBackupSettings(s); err != nil {
		return s, err
	}
	_ = a.appendAppAuditCurrent("", "", "Automatic backups updated", fmt.Sprintf("%s, keep %d, %s", frequency, keep, folder))
	return s, nil
}

func (a *App) checkBackupFolder(folder string) error {
	folder, err := filepath.Abs(folder)
	if err != nil {
		return err
	}
	storage, _ := filepath.Abs(a.storageRoot)
	if folder == storage || strings.HasPrefix(folder, storage+string(os.PathSeparator)) {
		return errors.New("save backups outside the BabyFileCab data folder, ideally on another drive")
	}
	info, err := os.Stat(folder)
	if err != nil || !info.IsDir() {
		return errors.New("the backup folder is not available; is the drive connected?")
	}
	probe, err := os.CreateTemp(folder, ".bfc-write-test-*")
	if err != nil {
		return fmt.Errorf("cannot write to the backup folder: %w", err)
	}
	probe.Close()
	return os.Remove(probe.Name())
}

func backupInterval(frequency string) time.Duration {
	switch frequency {
	case "daily":
		return 24 * time.Hour
	case "weekly":
		return 7 * 24 * time.Hour
	}
	return 0
}

// RunScheduledBackup is called by the app every so often; it only backs up
// when a backup is due. It returns the current settings and status.
func (a *App) RunScheduledBackup() (BackupSettings, error) {
	if err := a.requireSignedIn(); err != nil {
		return BackupSettings{}, err
	}
	s := a.loadBackupSettings()
	interval := backupInterval(s.Frequency)
	if interval == 0 || s.Folder == "" {
		return s, nil
	}
	if last, err := time.Parse(time.RFC3339, s.LastOK); err == nil && time.Since(last) < interval {
		return s, nil
	}
	// After a failure (drive unplugged), try again at most once an hour.
	if last, err := time.Parse(time.RFC3339, s.LastRun); err == nil && s.LastError != "" && time.Since(last) < time.Hour {
		return s, nil
	}
	return a.BackUpNow()
}

func (a *App) BackUpNow() (BackupSettings, error) {
	if err := a.requireSignedIn(); err != nil {
		return BackupSettings{}, err
	}
	if !a.backupMu.TryLock() {
		return a.loadBackupSettings(), errors.New("a backup is already running")
	}
	defer a.backupMu.Unlock()
	s := a.loadBackupSettings()
	if s.Folder == "" {
		return s, errors.New("choose a backup folder first (Settings › Automatic Backups)")
	}
	s.LastRun = time.Now().Format(time.RFC3339)
	path, size, err := a.writeFullBackup(s.Folder)
	if err != nil {
		s.LastError = err.Error()
		_ = a.saveBackupSettings(s)
		_ = a.appendAppAuditCurrent("", "", "Automatic backup failed", err.Error())
		return s, err
	}
	s.LastOK, s.LastError, s.LastFile, s.LastSizeMB = s.LastRun, "", path, size>>20
	pruneBackups(s.Folder, s.Keep)
	if err := a.saveBackupSettings(s); err != nil {
		return s, err
	}
	_ = a.appendAppAuditCurrent("", "", "Backup created", filepath.Base(path))
	return s, nil
}

// skipInBackup leaves out plaintext preview copies, SQLite side files and
// half-written temp files.
func skipInBackup(rel string, d fs.DirEntry) bool {
	name := d.Name()
	if d.IsDir() {
		return name == ".plaintext-preview"
	}
	return strings.HasPrefix(name, ".bfc-write-") ||
		strings.HasSuffix(name, ".sqlite-journal") || strings.HasSuffix(name, ".sqlite-wal") || strings.HasSuffix(name, ".sqlite-shm")
}

func (a *App) writeFullBackup(folder string) (string, int64, error) {
	if err := a.checkBackupFolder(folder); err != nil {
		return "", 0, err
	}
	stamp := time.Now().Format("2006-01-02-150405")
	final := filepath.Join(folder, backupFilePrefix+stamp+".zip")
	partial := final + ".partial"
	out, err := os.OpenFile(partial, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, err
	}
	ok := false
	defer func() {
		if !ok {
			out.Close()
			os.Remove(partial)
		}
	}()
	snapshots, err := os.MkdirTemp("", "bfc-backup-")
	if err != nil {
		return "", 0, err
	}
	defer os.RemoveAll(snapshots)

	zw := zip.NewWriter(out)
	files := 0
	root := a.storageRoot
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if skipInBackup(rel, d) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 || d.IsDir() {
			return nil
		}
		source := path
		if strings.HasSuffix(d.Name(), ".sqlite") {
			// A consistent copy even if someone is working right now.
			snap := filepath.Join(snapshots, fmt.Sprintf("%d.sqlite", files))
			if err := snapshotSQLite(path, snap); err != nil {
				return fmt.Errorf("snapshot %s: %w", rel, err)
			}
			source = snap
		}
		info, err := os.Stat(source)
		if err != nil {
			return err
		}
		header := &zip.FileHeader{Name: filepath.ToSlash(rel), Method: zip.Store, Modified: info.ModTime()}
		header.SetMode(0600)
		w, err := zw.CreateHeader(header)
		if err != nil {
			return err
		}
		f, err := os.Open(source)
		if err != nil {
			return err
		}
		_, err = io.Copy(w, f)
		f.Close()
		if err != nil {
			return err
		}
		files++
		return nil
	})
	if err != nil {
		return "", 0, err
	}
	manifest, _ := json.Marshal(fullBackupManifest{Format: 1, CreatedAt: time.Now().Format(time.RFC3339), Version: appVersion, Files: files})
	if w, err := zw.Create(backupManifestFull); err != nil {
		return "", 0, err
	} else if _, err := w.Write(manifest); err != nil {
		return "", 0, err
	}
	if err := zw.Close(); err != nil {
		return "", 0, err
	}
	if err := out.Sync(); err != nil {
		return "", 0, err
	}
	if err := out.Close(); err != nil {
		return "", 0, err
	}
	if _, err := verifyFullBackup(partial); err != nil {
		return "", 0, fmt.Errorf("backup verification failed: %w", err)
	}
	if err := os.Rename(partial, final); err != nil {
		return "", 0, err
	}
	ok = true
	info, _ := os.Stat(final)
	return final, info.Size(), nil
}

func snapshotSQLite(src, dst string) error {
	db, err := sql.Open("sqlite", src)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`VACUUM INTO ?`, dst)
	return err
}

// verifyFullBackup reads every file in the zip (checking each CRC) and
// returns its manifest.
func verifyFullBackup(path string) (BackupInfo, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return BackupInfo{}, err
	}
	defer zr.Close()
	var manifest fullBackupManifest
	found := false
	var total int64
	for _, f := range zr.File {
		name := filepath.Clean(filepath.FromSlash(f.Name))
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(os.PathSeparator)) {
			return BackupInfo{}, errors.New("backup contains an unsafe path")
		}
		rc, err := f.Open()
		if err != nil {
			return BackupInfo{}, err
		}
		// Reading to the end makes archive/zip check the stored CRC.
		var sink io.Writer = io.Discard
		var manifestData strings.Builder
		if f.Name == backupManifestFull {
			sink = &manifestData
		}
		n, err := io.Copy(sink, rc)
		rc.Close()
		if err != nil {
			return BackupInfo{}, fmt.Errorf("%s: %w", f.Name, err)
		}
		total += n
		if f.Name == backupManifestFull && json.Unmarshal([]byte(manifestData.String()), &manifest) == nil && manifest.Format == 1 {
			found = true
		}
	}
	if !found {
		return BackupInfo{}, errors.New("this is not a BabyFileCab backup")
	}
	if len(zr.File)-1 != manifest.Files {
		return BackupInfo{}, errors.New("the backup is incomplete")
	}
	return BackupInfo{Path: path, CreatedAt: manifest.CreatedAt, Files: manifest.Files, SizeBytes: total}, nil
}

func pruneBackups(folder string, keep int) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), backupFilePrefix) && strings.HasSuffix(e.Name(), ".zip") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // timestamped names sort oldest first
	for len(names) > keep {
		_ = os.Remove(filepath.Join(folder, names[0]))
		names = names[1:]
	}
}

// ChooseBackupToRestore is used from the sign-in screen.
func (a *App) ChooseBackupToRestore() (BackupInfo, error) {
	if a.ctx == nil {
		return BackupInfo{}, errors.New("application is not ready")
	}
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:   "Choose a BabyFileCab backup",
		Filters: []wailsruntime.FileFilter{{DisplayName: "BabyFileCab backups", Pattern: backupFilePrefix + "*.zip"}, {DisplayName: "Zip files", Pattern: "*.zip"}},
	})
	if err != nil || path == "" {
		return BackupInfo{}, err
	}
	return verifyFullBackup(path)
}

// RestoreFullBackup replaces the data folder with a backup. The current data
// is never deleted: it is renamed to BabyFileCabData-before-restore-<time>.
// Only possible while nobody is signed in.
func (a *App) RestoreFullBackup(path string) (string, error) {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	if a.currentUser != nil {
		return "", errors.New("sign out before restoring a backup")
	}
	if _, err := verifyFullBackup(path); err != nil {
		return "", err
	}
	root := a.storageRoot
	staging := root + ".restoring"
	_ = os.RemoveAll(staging)
	if err := extractFullBackup(path, staging); err != nil {
		os.RemoveAll(staging)
		return "", err
	}
	setAside := root + "-before-restore-" + time.Now().Format("2006-01-02-150405")
	if _, err := os.Stat(root); err == nil {
		if err := os.Rename(root, setAside); err != nil {
			os.RemoveAll(staging)
			return "", fmt.Errorf("could not set the current data aside: %w", err)
		}
	} else {
		setAside = ""
	}
	if err := os.Rename(staging, root); err != nil {
		if setAside != "" {
			_ = os.Rename(setAside, root)
		}
		return "", err
	}
	_ = os.MkdirAll(filepath.Join(root, ".plaintext-preview"), 0700)
	return setAside, nil
}

func extractFullBackup(path, dest string) error {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer zr.Close()
	if err := os.MkdirAll(dest, 0700); err != nil {
		return err
	}
	for _, f := range zr.File {
		if f.Name == backupManifestFull || strings.HasSuffix(f.Name, "/") {
			continue
		}
		name := filepath.Clean(filepath.FromSlash(f.Name))
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(os.PathSeparator)) {
			return errors.New("backup contains an unsafe path")
		}
		target := filepath.Join(dest, name)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		rc.Close()
		if cerr := out.Close(); err == nil {
			err = cerr
		}
		if err != nil {
			return err
		}
	}
	return nil
}
