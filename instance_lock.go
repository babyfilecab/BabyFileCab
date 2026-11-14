package main

import (
	"errors"
	"os"
	"path/filepath"
)

// Only one copy of BabyFileCab may use the data folder at a time. Two copies
// would each keep their own idea of the vault and could overwrite each
// other's changes. The lock lives in the per-user settings folder rather than
// in BabyFileCabData so backups and encryption never touch it. The operating
// system releases it when the app exits, even after a crash.

var errAlreadyOpen = errors.New("BabyFileCab is already open")

// instanceLockFile stays open for the life of the process.
var instanceLockFile *os.File

func instanceLockPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "BabyFileCab")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "instance.lock"), nil
}

func acquireInstanceLock() error {
	path, err := instanceLockPath()
	if err != nil {
		return err
	}
	return acquireInstanceLockAt(path)
}

func acquireInstanceLockAt(path string) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	if err := lockFileExclusive(f); err != nil {
		f.Close()
		return err
	}
	instanceLockFile = f
	return nil
}
