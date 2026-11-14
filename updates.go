package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Update notice: once a day BabyFileCab asks GitHub for the latest public
// release. Only that public page is requested; nothing about the user, the
// firm or its data is sent. Settings > Check for Updates turns it off.

const releasesAPI = "https://api.github.com/repos/babyfilecab/BabyFileCab/releases/latest"
const releasesPagePrefix = "https://github.com/babyfilecab/BabyFileCab/releases/"

type UpdateInfo struct {
	Available bool   `json:"available"`
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	URL       string `json:"url"`
}

func (a *App) updateCheckSettingPath() string {
	return filepath.Join(a.storageRoot, ".update-check")
}

func (a *App) GetUpdateCheckEnabled() bool {
	data, err := os.ReadFile(a.updateCheckSettingPath())
	return err != nil || strings.TrimSpace(string(data)) != "off"
}

func (a *App) SetUpdateCheckEnabled(enabled bool) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	value := "on"
	if !enabled {
		value = "off"
	}
	return writeAtomicPrivate(a.updateCheckSettingPath(), []byte(value))
}

// parseVersion turns "v2.1.0" into [2 1 0]; anything unparsable is 0.
func parseVersion(v string) [3]int {
	var out [3]int
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if i := strings.IndexAny(v, "-+ "); i >= 0 {
		v = v[:i]
	}
	for i, part := range strings.SplitN(v, ".", 3) {
		n, _ := strconv.Atoi(part)
		out[i] = n
	}
	return out
}

func versionNewer(latest, current string) bool {
	l, c := parseVersion(latest), parseVersion(current)
	for i := range l {
		if l[i] != c[i] {
			return l[i] > c[i]
		}
	}
	return false
}

func (a *App) CheckForUpdate() (UpdateInfo, error) {
	info := UpdateInfo{Current: appVersion}
	if err := a.requireSignedIn(); err != nil {
		return info, err
	}
	if !a.GetUpdateCheckEnabled() {
		return info, nil
	}
	a.updateMu.Lock()
	defer a.updateMu.Unlock()
	if !a.lastUpdateCheck.IsZero() && time.Since(a.lastUpdateCheck) < 24*time.Hour {
		return a.lastUpdateInfo, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releasesAPI, nil)
	if err != nil {
		return info, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "BabyFileCab-update-check")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return info, fmt.Errorf("could not check for updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return info, fmt.Errorf("could not check for updates (%s)", resp.Status)
	}
	var release struct {
		TagName string `json:"tag_name"`
		HTMLURL string `json:"html_url"`
		Draft   bool   `json:"draft"`
		Pre     bool   `json:"prerelease"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&release); err != nil {
		return info, err
	}
	info.Latest = strings.TrimPrefix(release.TagName, "v")
	if strings.HasPrefix(release.HTMLURL, releasesPagePrefix) {
		info.URL = release.HTMLURL
	}
	info.Available = !release.Draft && !release.Pre && info.URL != "" && versionNewer(release.TagName, appVersion)
	a.lastUpdateCheck, a.lastUpdateInfo = time.Now(), info
	return info, nil
}

// OpenReleasePage opens the BabyFileCab download page in the web browser.
func (a *App) OpenReleasePage(url string) error {
	if !strings.HasPrefix(url, releasesPagePrefix) {
		return errors.New("not a BabyFileCab release page")
	}
	if a.ctx == nil {
		return errors.New("application is not ready")
	}
	wailsruntime.BrowserOpenURL(a.ctx, url)
	return nil
}

func (a *App) AppVersion() string { return appVersion }
