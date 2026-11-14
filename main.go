package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	_ "image/png"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// appVersion must match "productVersion" in wails.json.
const appVersion = "2.1.1"

const (
	appTitle             = "BabyFileCab — Local Document Management"
	permanentFolder      = "Permanent Folder"
	notesFile            = "notes.txt"
	richNotesFile        = ".notes-rich.html"
	auditFile            = ".audit.jsonl"
	appAuditFile         = ".babyfilecab-audit.jsonl"
	clientProfileFile    = ".client-profile.json"
	documentMetadataFile = ".document-metadata.json"
	firmCalendarFile     = ".firm-calendar-2026.json"
	engagementLogoFile   = ".engagement-letter-logo.jpg"
)

//go:embed all:frontend/dist
var embeddedAssets embed.FS

type App struct {
	ctx         context.Context
	storageRoot string
	dataRoot    string

	authMu          sync.RWMutex
	currentUser     *UserProfile
	currentCompany  *CompanyProfile
	vaultKey        []byte
	vaultMu         sync.RWMutex
	lastActivity    time.Time
	autoLockMinutes int
	calendarMu      sync.Mutex
	recycleMu       sync.Mutex
	backupMu        sync.Mutex
	updateMu        sync.Mutex
	lastUpdateCheck time.Time
	lastUpdateInfo  UpdateInfo
	auditMu         sync.Mutex
	timesheetMu     sync.Mutex
	tempMu          sync.Mutex
	tempDirs        map[string]struct{}
}

const (
	passwordIterations = 210000
	passwordKeyLength  = 32
	passwordSaltLength = 24
)

func main() {
	assets, err := fs.Sub(embeddedAssets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	app, err := NewApp()
	if err != nil {
		log.Fatal(err)
	}

	err = wails.Run(&options.App{
		Title:            appTitle,
		Width:            1420,
		Height:           900,
		MinWidth:         1050,
		MinHeight:        680,
		BackgroundColour: &options.RGBA{R: 250, G: 252, B: 255, A: 255},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: app.startup,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: false,
		},
		Bind: []interface{}{app},
	})
	if err != nil {
		log.Fatal(err)
	}
}

func NewApp() (*App, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	root := filepath.Join(home, "BabyFileCabData")
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	if err := os.Chmod(root, 0700); err != nil {
		return nil, err
	}
	app := &App{storageRoot: root, dataRoot: root, autoLockMinutes: 15}
	if data, err := os.ReadFile(filepath.Join(root, ".autolock-minutes")); err == nil {
		var minutes int
		if json.Unmarshal(data, &minutes) == nil && validAutoLockMinutes(minutes) {
			app.autoLockMinutes = minutes
		}
	}
	if err := os.RemoveAll(filepath.Join(root, ".plaintext-preview")); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(root, ".plaintext-preview"), 0700); err != nil {
		return nil, err
	}
	if err := app.migrateLegacyCompanyData(); err != nil {
		return nil, err
	}
	if app.accountsReady() {
		_ = os.Remove(app.usersPath())
		_ = os.Remove(app.companiesPath())
	}
	return app, nil
}

func validAutoLockMinutes(minutes int) bool {
	return minutes == 15 || minutes == 30 || minutes == 45
}

// Caller holds authMu for reading or writing.
func (a *App) idleTimeoutLocked() time.Duration {
	minutes := a.autoLockMinutes
	if !validAutoLockMinutes(minutes) {
		minutes = 15
	}
	return time.Duration(minutes) * time.Minute
}

func (a *App) GetAutoLockMinutes() int {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	return int(a.idleTimeoutLocked() / time.Minute)
}

func (a *App) SetAutoLockMinutes(minutes int) error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	if !validAutoLockMinutes(minutes) {
		return errors.New("choose 15, 30, or 45 minutes")
	}
	if a.currentUser == nil || time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return errors.New("sign in to BabyFileCab first")
	}
	data, err := json.Marshal(minutes)
	if err != nil {
		return err
	}
	if err := writeAtomicPrivate(filepath.Join(a.storageRoot, ".autolock-minutes"), data); err != nil {
		return err
	}
	a.autoLockMinutes = minutes
	a.lastActivity = time.Now()
	return nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startSessionMonitor(ctx)
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		lastTickUnix := time.Now().UnixNano()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				nowUnix := time.Now().UnixNano()
				gap := time.Duration(nowUnix - lastTickUnix)
				lastTickUnix = nowUnix
				a.authMu.RLock()
				expired := a.currentUser != nil && (time.Since(a.lastActivity) >= a.idleTimeoutLocked() || gap >= a.idleTimeoutLocked())
				a.authMu.RUnlock()
				if expired {
					a.Logout()
				}
			}
		}
	}()
}

func (a *App) DataRoot() string {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	return a.dataRoot
}

func (a *App) ExitBabyFileCab() {
	_ = a.appendAppAuditCurrent("", "", "Application exited", "BabyFileCab was closed")
	wailsruntime.Quit(a.ctx)
}

func (a *App) OpenDataFolder() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	if err := openPath(a.dataRoot); err != nil {
		return err
	}
	_ = a.appendAppAuditCurrent("", "", "Company data folder opened", "Local company workspace opened in the file manager")
	return nil
}

func (a *App) requireSignedIn() error {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	if a.currentUser == nil || time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return errors.New("sign in to BabyFileCab first")
	}
	return nil
}

// TouchActivity is called only for real input events in the desktop webview.
// A stale session cannot be revived without entering the password again.
func (a *App) TouchActivity() bool {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	if a.currentUser == nil || time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return false
	}
	a.lastActivity = time.Now()
	return true
}

func (a *App) SessionActive() bool {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	return a.currentUser != nil && time.Since(a.lastActivity) < a.idleTimeoutLocked()
}
