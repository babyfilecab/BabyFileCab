package main

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Encryption check. Everything in a company's data folder is encrypted the
// first time someone signs in to it. Files copied into the folder afterwards
// with the file manager are not, and BabyFileCab can't open them. This finds
// them and encrypts them in place, checking each encrypted copy before it
// replaces the original.

type EncryptionReport struct {
	Checked     int      `json:"checked"`
	Unencrypted []string `json:"unencrypted"` // relative to the data folder
	Encrypted   int      `json:"encrypted"`   // files encrypted by this run
	Failed      []string `json:"failed"`
}

// encryptionCheckSkips reports files that are meant to stay as they are: the
// vault database and its markers, account files, write temp files and
// settings that are read before anyone signs in.
func (a *App) encryptionCheckSkips(root, path string, d fs.DirEntry) bool {
	name := d.Name()
	atStorageRoot := root == a.storageRoot && filepath.Dir(path) == root
	if d.IsDir() {
		return atStorageRoot && (name == "companies" || name == ".vault-keys" || name == ".migration-backups" || name == ".plaintext-preview")
	}
	if name == vaultDBName || strings.HasPrefix(name, vaultDBName+"-") || name == vaultReadyName || strings.HasPrefix(name, ".bfc-write-") {
		return true
	}
	if root == a.storageRoot && (name == accountsDBName || name == accountsReadyName || strings.HasPrefix(name, accountsDBName+"-")) {
		return true
	}
	return atStorageRoot && (name == ".users.json" || name == ".companies.json" || name == ".autolock-minutes")
}

func (a *App) findUnencryptedFiles() (EncryptionReport, error) {
	root, err := filepath.Abs(a.dataRoot)
	if err != nil {
		return EncryptionReport{}, err
	}
	report := EncryptionReport{Unencrypted: []string{}, Failed: []string{}}
	magic := []byte(vaultFileMagic)
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil // unreadable folder: skip rather than stop the whole check
		}
		if path == root {
			return nil
		}
		if a.encryptionCheckSkips(root, path, d) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() || !d.Type().IsRegular() {
			return nil
		}
		report.Checked++
		f, err := os.Open(path)
		if err != nil {
			return nil
		}
		head := make([]byte, len(magic))
		n, _ := f.Read(head)
		f.Close()
		if n == len(magic) && bytes.Equal(head, magic) {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		report.Unencrypted = append(report.Unencrypted, filepath.ToSlash(rel))
		return nil
	})
	sort.Strings(report.Unencrypted)
	return report, err
}

// CheckEncryption lists files in the company's data folder that aren't
// encrypted.
func (a *App) CheckEncryption() (EncryptionReport, error) {
	if err := a.requireAdministrator("run the encryption check"); err != nil {
		return EncryptionReport{}, err
	}
	return a.findUnencryptedFiles()
}

// EncryptUnencryptedFiles encrypts every file CheckEncryption finds.
func (a *App) EncryptUnencryptedFiles() (EncryptionReport, error) {
	if err := a.requireAdministrator("encrypt files"); err != nil {
		return EncryptionReport{}, err
	}
	found, err := a.findUnencryptedFiles()
	if err != nil {
		return found, err
	}
	key, err := a.vaultKeyCopy()
	if err != nil {
		return found, err
	}
	defer zeroBytes(key)
	encrypted := 0
	failed := []string{}
	for _, rel := range found.Unencrypted {
		if err := encryptFileInPlace(filepath.Join(a.dataRoot, filepath.FromSlash(rel)), key); err != nil {
			failed = append(failed, rel+": "+err.Error())
			continue
		}
		encrypted++
	}
	if encrypted > 0 {
		_ = a.appendAppAuditCurrent("", "", "Unencrypted files encrypted", fmt.Sprintf("%d file(s)", encrypted))
	}
	after, err := a.findUnencryptedFiles()
	after.Encrypted = encrypted
	after.Failed = failed
	return after, err
}

// encryptFileInPlace replaces a plain file with its encrypted form, but only
// after the encrypted bytes have been checked to decrypt back to the same
// content. The replacement is atomic, so the file is never half-written.
func encryptFileInPlace(path string, key []byte) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("not a regular file")
	}
	plain, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	defer zeroBytes(plain)
	if bytes.HasPrefix(plain, []byte(vaultFileMagic)) {
		return nil
	}
	sealed, err := encryptedFileBytes(key, plain)
	if err != nil {
		return err
	}
	check, err := decryptedFileBytes(key, sealed)
	if err != nil || !bytes.Equal(check, plain) {
		return errors.New("encrypted copy did not check out; the file was left as it was")
	}
	zeroBytes(check)
	if err := writeAtomicPrivate(path, sealed); err != nil {
		return err
	}
	_ = os.Chtimes(path, info.ModTime(), info.ModTime())
	return nil
}
