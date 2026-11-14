package main

import (
	"fmt"
	"testing"
	"time"
)

func TestValidateFirmCalendarDateRollsForward(t *testing.T) {
	last := firmCalendarLastYear(time.Now())
	for _, date := range []string{"2025-01-01", "2026-12-31", "2027-01-01", fmt.Sprintf("%d-12-31", last)} {
		if err := validateFirmCalendarDate(date); err != nil {
			t.Fatalf("expected %s to be accepted: %v", date, err)
		}
	}
	for _, date := range []string{"2024-12-31", fmt.Sprintf("%d-01-01", last+1), "not-a-date"} {
		if err := validateFirmCalendarDate(date); err == nil {
			t.Fatalf("expected %s to be rejected", date)
		}
	}
	if got := firmCalendarLastYear(time.Date(2031, 1, 1, 0, 0, 0, 0, time.UTC)); got != 2033 {
		t.Fatalf("calendar must keep rolling forward, got %d", got)
	}
	if got := latestTaxYear(time.Date(2030, 3, 1, 0, 0, 0, 0, time.UTC)); got != 2030 {
		t.Fatalf("latest tax year should follow the clock, got %d", got)
	}
}
