//go:build !windows

package main

import (
	"errors"
	"os"
	"syscall"
)

func lockFileExclusive(f *os.File) error {
	err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return errAlreadyOpen
	}
	return err
}
