package main

import (
	"strings"
	"testing"
)

func TestDefaultEngagementTemplateFillsEveryService(t *testing.T) {
	tpl := defaultEngagementTemplate()
	if err := validateEngagementTemplate(&tpl); err != nil {
		t.Fatalf("default template invalid: %v", err)
	}
	for _, svc := range firmServices {
		data := engagementLetterData{CompanyName: "Oak CPA", ClientName: "Jane Doe", Service: svc.Code,
			ServiceDesc: svc.Description, TaxYear: "2025", FeeType: "Flat Fee", FeeValue: "$900"}
		intro, sections, closing := renderEngagementTemplate(tpl, data)
		all := intro + closing
		titles := map[string]bool{}
		for _, s := range sections {
			all += s.Title + s.Body
			titles[s.Title] = true
		}
		if placeholderPattern.MatchString(all) {
			t.Errorf("%s: placeholder left in letter", svc.Code)
		}
		if !strings.Contains(all, "Jane Doe") || !strings.Contains(all, "$900") || !strings.Contains(all, svc.Description) {
			t.Errorf("%s: names, fee or service missing", svc.Code)
		}
		if titles["Electronic Filing and Authorization"] != (svc.Kind == "tax-return") {
			t.Errorf("%s: e-file section wrong for kind %s", svc.Code, svc.Kind)
		}
		scopes := 0
		for _, s := range sections {
			if s.Title == "Scope of Services" {
				scopes++
			}
		}
		if scopes != 1 {
			t.Errorf("%s: %d scope sections", svc.Code, scopes)
		}
	}
	if strings.Contains(notIncludedServices("State"), "state and local") {
		t.Error("a state-return letter shouldn't exclude state returns")
	}
	if strings.Contains(notIncludedServices("1040-X"), "amended") {
		t.Error("an amended-return letter shouldn't exclude amended returns")
	}
}

func TestEngagementTemplateSaveAndPermissions(t *testing.T) {
	a, _ := newRecycleTestApp(t)
	tpl := defaultEngagementTemplate()
	tpl.Sections = append(tpl.Sections, EngagementTemplateSection{Title: "Payment", Body: "{client} pays {fee} on receipt.", AppliesTo: "all"})
	if err := a.SaveEngagementTemplate(tpl); err != nil {
		t.Fatal(err)
	}
	info, err := a.GetEngagementTemplate()
	if err != nil || !info.Custom || len(info.Template.Sections) != len(tpl.Sections) {
		t.Fatalf("custom template not stored: %v %+v", err, info.Custom)
	}
	bad := defaultEngagementTemplate()
	bad.Intro = "Hello {clinet}"
	if err := a.SaveEngagementTemplate(bad); err == nil || !strings.Contains(err.Error(), "{clinet}") {
		t.Fatalf("misspelled placeholder accepted: %v", err)
	}
	a.authMu.Lock()
	a.currentUser.Role = "staff"
	a.authMu.Unlock()
	if err := a.SaveEngagementTemplate(tpl); err == nil {
		t.Fatal("staff changed the letter wording")
	}
	if err := a.ResetEngagementTemplate(); err == nil {
		t.Fatal("staff reset the letter wording")
	}
	a.authMu.Lock()
	a.currentUser.Role = "administrator"
	a.authMu.Unlock()
	if err := a.ResetEngagementTemplate(); err != nil {
		t.Fatal(err)
	}
	if info, _ := a.GetEngagementTemplate(); info.Custom {
		t.Fatal("reset didn't restore the standard wording")
	}
}
