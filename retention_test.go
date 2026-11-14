package main

import "testing"

func TestRetentionItems(t *testing.T) {
	tree := []TreeNode{
		{Name: "Smith", ClientID: "00001", Path: "/d/00001 - Smith", Type: "client", Children: []TreeNode{
			{Name: permanentFolder, Type: "permanent"},
			{Name: "2017", Type: "taxyear", Path: "/d/00001 - Smith/2017"},
			{Name: "2018", Type: "taxyear", Path: "/d/00001 - Smith/2018"},
			{Name: "2019", Type: "taxyear", Path: "/d/00001 - Smith/2019"},
			{Name: "2025", Type: "taxyear", Path: "/d/00001 - Smith/2025"},
		}},
		{Name: "Adams", ClientID: "00002", Path: "/d/00002 - Adams", Type: "client", Children: []TreeNode{
			{Name: "2018", Type: "taxyear", Path: "/d/00002 - Adams/2018"},
		}},
	}
	// Seven years in 2026: the 2018 return was filed in 2019 and kept through
	// 2025, so 2018 and older are past the period.
	got := retentionItems(tree, RetentionSettings{Years: 7, Held: []string{"00002/2018"}}, 2026)
	want := []struct {
		name, year string
		since      int
		held       bool
	}{{"Smith", "2017", 2025, false}, {"Adams", "2018", 2026, true}, {"Smith", "2018", 2026, false}}
	if len(got) != len(want) {
		t.Fatalf("got %d items: %+v", len(got), got)
	}
	for i, w := range want {
		g := got[i]
		if g.ClientName != w.name || g.TaxYear != w.year || g.PastSince != w.since || g.Held != w.held {
			t.Errorf("item %d = %+v, want %+v", i, g, w)
		}
	}
	// Three years: 2019 (filed 2020, kept through 2023) is past too, 2025 isn't.
	if got := retentionItems(tree, RetentionSettings{Years: 3}, 2026); len(got) != 4 {
		t.Fatalf("3-year period: got %d items", len(got))
	}
}
