package main

import "testing"

func TestValidateFirmCalendarDateSupports2025Through2027(t *testing.T) {
	for _, date := range []string{"2025-01-01", "2025-12-31", "2026-01-01", "2026-12-31", "2027-01-01", "2027-12-31"} {
		if err := validateFirmCalendarDate(date); err != nil {
			t.Fatalf("expected %s to be accepted: %v", date, err)
		}
	}
	for _, date := range []string{"2024-12-31", "2028-01-01", "not-a-date"} {
		if err := validateFirmCalendarDate(date); err == nil {
			t.Fatalf("expected %s to be rejected", date)
		}
	}
}
