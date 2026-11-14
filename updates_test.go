package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestVersionNewer(t *testing.T) {
	cases := []struct {
		latest, current string
		want            bool
	}{
		{"v2.1.1", "2.1.0", true},
		{"v2.2.0", "2.1.9", true},
		{"v3.0.0", "2.9.9", true},
		{"v2.1.0", "2.1.0", false},
		{"v2.0.9", "2.1.0", false},
		{"v2.1.10", "2.1.9", true},
		{"v2.1.1-beta", "2.1.1", false},
	}
	for _, c := range cases {
		if got := versionNewer(c.latest, c.current); got != c.want {
			t.Errorf("versionNewer(%q, %q) = %v", c.latest, c.current, got)
		}
	}
}

func TestAppVersionMatchesWailsJSON(t *testing.T) {
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.Info.ProductVersion != appVersion {
		t.Fatalf("wails.json productVersion %q != appVersion %q", cfg.Info.ProductVersion, appVersion)
	}
}
