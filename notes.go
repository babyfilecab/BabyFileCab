package main

import (
	"errors"
	"os"
	"path/filepath"
)

func (a *App) GetNotes(path string) (string, error) {
	np, err := a.notesPathFor(path)
	if err != nil {
		return "", err
	}
	b, err := a.secureReadFile(np)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (a *App) GetNotesDocument(path string) (NotesDocument, error) {
	np, err := a.notesPathFor(path)
	if err != nil {
		return NotesDocument{}, err
	}
	b, err := a.secureReadFile(np)
	if err != nil {
		return NotesDocument{}, err
	}
	doc := NotesDocument{Text: string(b)}
	rp, err := a.richNotesPathFor(path)
	if err == nil {
		if hb, readErr := a.secureReadFile(rp); readErr == nil {
			clean, sanitizeErr := sanitizeNotesHTML(string(hb))
			if sanitizeErr != nil {
				return NotesDocument{}, sanitizeErr
			}
			doc.HTML = clean
		}
	}
	return doc, nil
}

func (a *App) SaveNotes(path, text string) error {
	np, err := a.notesPathFor(path)
	if err != nil {
		return err
	}
	if err := a.secureWriteFile(np, []byte(text)); err != nil {
		return err
	}
	_ = a.appendAudit(path, "Client notes saved", "notes.txt updated")
	return nil
}

func (a *App) SaveNotesDocument(path, htmlContent, text string) error {
	cleanHTML, err := sanitizeNotesHTML(htmlContent)
	if err != nil {
		return err
	}
	np, err := a.notesPathFor(path)
	if err != nil {
		return err
	}
	rp, err := a.richNotesPathFor(path)
	if err != nil {
		return err
	}
	if err := a.secureWriteFile(np, []byte(text)); err != nil {
		return err
	}
	if err := a.secureWriteFile(rp, []byte(cleanHTML)); err != nil {
		return err
	}
	_ = a.appendAudit(path, "Client notes saved", "Formatted notes and notes.txt updated")
	return nil
}

func (a *App) richNotesPathFor(path string) (string, error) {
	cp, err := a.clientPathFor(path)
	if err != nil {
		return "", err
	}
	return filepath.Join(cp, richNotesFile), nil
}

func (a *App) notesPathFor(path string) (string, error) {
	p, err := a.safePath(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(a.dataRoot, p)
	if err != nil {
		return "", err
	}
	parts := splitRel(rel)
	if len(parts) < 1 || !isClientDirName(parts[0]) {
		return "", errors.New("select an item under a client")
	}
	np := filepath.Join(a.dataRoot, parts[0], permanentFolder, notesFile)
	if _, err := os.Stat(np); errors.Is(err, os.ErrNotExist) {
		_ = a.secureWriteFile(np, []byte(""))
	}
	return np, nil
}
