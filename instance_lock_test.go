package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// A second process must not get the lock while the first holds it. flock
// locks belong to the open file, so the check runs in a child process.
func TestInstanceLockBlocksSecondProcess(t *testing.T) {
	if path := os.Getenv("BFC_LOCK_CHILD"); path != "" {
		if err := acquireInstanceLockAt(path); errors.Is(err, errAlreadyOpen) {
			os.Exit(3)
		} else if err != nil {
			os.Exit(4)
		}
		os.Exit(0)
	}
	path := filepath.Join(t.TempDir(), "instance.lock")
	run := func() int {
		cmd := exec.Command(os.Args[0], "-test.run=TestInstanceLockBlocksSecondProcess")
		cmd.Env = append(os.Environ(), "BFC_LOCK_CHILD="+path)
		err := cmd.Run()
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return exit.ExitCode()
		}
		if err != nil {
			t.Fatal(err)
		}
		return 0
	}
	if code := run(); code != 0 {
		t.Fatalf("lock should be free at first, child exit %d", code)
	}
	if err := acquireInstanceLockAt(path); err != nil {
		t.Fatal(err)
	}
	if code := run(); code != 3 {
		t.Fatalf("second copy should see the app as already open, child exit %d", code)
	}
	instanceLockFile.Close()
	instanceLockFile = nil
	if code := run(); code != 0 {
		t.Fatalf("lock should be free after the first copy exits, child exit %d", code)
	}
}
