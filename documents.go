package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) GetDocumentProperties(path string) (DocumentProperties, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return DocumentProperties{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return DocumentProperties{}, err
	}
	clientPath, err := a.clientPathFor(path)
	if err != nil {
		return DocumentProperties{}, err
	}
	clientID, clientName, _ := parseClientDirName(filepath.Base(clientPath))
	location, _ := filepath.Rel(clientPath, filepath.Dir(path))
	if location == "." {
		location = "Client root"
	}
	meta, _ := a.readDocumentMetadata()
	return DocumentProperties{
		Name:        filepath.Base(path),
		Path:        path,
		ClientName:  clientName,
		ClientID:    clientID,
		Location:    location,
		Description: meta[a.documentMetadataKey(path)],
		Size:        info.Size(),
		Modified:    info.ModTime().Format(time.RFC3339),
	}, nil
}

func (a *App) SaveDocumentDescription(path, description string) error {
	path, err := a.requireType(path, "file")
	if err != nil {
		return err
	}
	meta, err := a.readDocumentMetadata()
	if err != nil {
		return err
	}
	key := a.documentMetadataKey(path)
	description = strings.TrimSpace(description)
	if description == "" {
		delete(meta, key)
	} else {
		meta[key] = description
	}
	if err := a.writeDocumentMetadata(meta); err != nil {
		return err
	}
	_ = a.appendAudit(path, "Document description updated", filepath.Base(path))
	return nil
}

func (a *App) GlobalFind(query string) ([]GlobalSearchResult, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return []GlobalSearchResult{}, nil
	}
	q := strings.ToLower(query)
	meta, _ := a.readDocumentMetadata()
	results := make([]GlobalSearchResult, 0)
	err := filepath.WalkDir(a.dataRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			// Legacy-company data may live at ~/BabyFileCabData. Never descend
			// into the container used by other company workspaces.
			if path != a.dataRoot && filepath.Dir(path) == a.dataRoot && (d.Name() == "companies" || d.Name() == recycleBinDir) {
				return fs.SkipDir
			}
			return nil
		}
		name := d.Name()
		if name == clientProfileFile || name == auditFile || name == richNotesFile || name == documentMetadataFile {
			return nil
		}
		clientPath, err := a.clientPathFor(path)
		if err != nil {
			return nil
		}
		clientID, clientName, ok := parseClientDirName(filepath.Base(clientPath))
		if !ok {
			return nil
		}
		desc := meta[a.documentMetadataKey(path)]
		rel, _ := filepath.Rel(clientPath, path)
		noteText := ""
		if name == notesFile {
			if data, readErr := a.secureReadFile(path); readErr == nil {
				noteText = string(data)
			}
		}
		hay := strings.ToLower(strings.Join([]string{name, desc, clientName, clientID, rel, noteText}, " "))
		if !strings.Contains(hay, q) {
			return nil
		}
		match := "File name"
		if strings.Contains(strings.ToLower(noteText), q) {
			match = "Client notes"
		} else if strings.Contains(strings.ToLower(desc), q) {
			match = "Description"
		} else if strings.Contains(strings.ToLower(clientName), q) || strings.Contains(clientID, q) {
			match = "Client"
		} else if strings.Contains(strings.ToLower(rel), q) {
			match = "Location"
		}
		results = append(results, GlobalSearchResult{
			Name: name, Path: path, ClientName: clientName, ClientID: clientID,
			Location: rel, Description: desc, Match: match,
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(results, func(i, j int) bool {
		if strings.ToLower(results[i].ClientName) == strings.ToLower(results[j].ClientName) {
			return strings.ToLower(results[i].Name) < strings.ToLower(results[j].Name)
		}
		return strings.ToLower(results[i].ClientName) < strings.ToLower(results[j].ClientName)
	})
	return results, nil
}

func (a *App) UploadFiles(targetPath string) ([]string, error) {
	if a.ctx == nil {
		return nil, errors.New("application is not ready")
	}
	targetPath, err := a.uploadTarget(targetPath)
	if err != nil {
		return nil, err
	}
	files, err := wailsruntime.OpenMultipleFilesDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Upload Files to BabyFileCab",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Office & Email Documents", Pattern: "*.pdf;*.doc;*.docx;*.rtf;*.xls;*.xlsx;*.xlsm;*.csv;*.eml;*.msg;*.mbox;*.oft;*.png;*.jpg;*.jpeg;*.gif;*.webp;*.txt"},
			{DisplayName: "PDF Files", Pattern: "*.pdf"},
			{DisplayName: "Word Documents", Pattern: "*.doc;*.docx;*.rtf"},
			{DisplayName: "Excel Documents", Pattern: "*.xls;*.xlsx;*.xlsm;*.csv"},
			{DisplayName: "Email Files", Pattern: "*.eml;*.msg;*.mbox;*.oft"},
			{DisplayName: "All Files", Pattern: "*"},
		},
	})
	if err != nil {
		return nil, err
	}
	var copied, updated []string
	for _, src := range files {
		if src == "" {
			continue
		}
		dst := filepath.Join(targetPath, filepath.Base(src))
		replaced, err := a.storeNewVersion(src, dst)
		if err != nil {
			return copied, err
		}
		copied = append(copied, dst)
		if replaced {
			updated = append(updated, filepath.Base(dst))
		}
	}
	a.auditImported(targetPath, "Files uploaded", copied, updated)
	return copied, nil
}

func (a *App) MoveDocument(sourcePath, targetPath string) (string, error) {
	sourcePath, err := a.requireType(sourcePath, "file")
	if err != nil {
		return "", err
	}
	if filepath.Base(sourcePath) == notesFile {
		return "", errors.New("notes.txt is protected and cannot be moved")
	}

	targetDir, err := a.uploadTarget(targetPath)
	if err != nil {
		return "", err
	}
	targetDir, err = a.safePath(targetDir)
	if err != nil {
		return "", err
	}

	// Dropping back into the same folder is a no-op.
	if filepath.Clean(filepath.Dir(sourcePath)) == filepath.Clean(targetDir) {
		return sourcePath, nil
	}

	sourceClient, err := a.clientPathFor(sourcePath)
	if err != nil {
		return "", err
	}
	destClient, err := a.clientPathFor(targetDir)
	if err != nil {
		return "", err
	}

	fileName := filepath.Base(sourcePath)
	destPath := uniqueDestination(filepath.Join(targetDir, fileName))
	if err := os.Rename(sourcePath, destPath); err != nil {
		return "", err
	}
	a.moveDocumentMetadata(sourcePath, destPath)
	moveVersions(sourcePath, destPath)

	// Record the move in the destination client's audit trail. If the move
	// crosses clients, also leave a history entry in the source client.
	destLabel := relativeClientLocation(destClient, destPath)
	sourceLabel := relativeClientLocation(sourceClient, sourcePath)
	if filepath.Clean(sourceClient) == filepath.Clean(destClient) {
		_ = a.appendAudit(destPath, "Document moved", fmt.Sprintf("%s: %s → %s", filepath.Base(destPath), sourceLabel, destLabel))
	} else {
		srcID, srcName, _ := parseClientDirName(filepath.Base(sourceClient))
		dstID, dstName, _ := parseClientDirName(filepath.Base(destClient))
		_ = a.appendAudit(sourceClient, "Document moved out", fmt.Sprintf("%s → %s (%s), %s", fileName, dstName, dstID, destLabel))
		_ = a.appendAudit(destPath, "Document moved in", fmt.Sprintf("%s ← %s (%s), %s", filepath.Base(destPath), srcName, srcID, sourceLabel))
	}

	return destPath, nil
}

func relativeClientLocation(clientPath, itemPath string) string {
	rel, err := filepath.Rel(clientPath, itemPath)
	if err != nil || rel == "." {
		return filepath.Base(itemPath)
	}
	return rel
}

func (a *App) ImportDroppedFiles(targetPath string, paths []string) ([]string, error) {
	targetPath, err := a.uploadTarget(targetPath)
	if err != nil {
		return nil, err
	}
	var copied, updated []string
	for _, src := range paths {
		src = strings.TrimSpace(src)
		if src == "" {
			continue
		}
		info, err := os.Stat(src)
		if err != nil || info.IsDir() {
			continue
		}
		dst := filepath.Join(targetPath, filepath.Base(src))
		replaced, err := a.storeNewVersion(src, dst)
		if err != nil {
			return copied, err
		}
		copied = append(copied, dst)
		if replaced {
			updated = append(updated, filepath.Base(dst))
		}
	}
	if len(copied) == 0 {
		return nil, errors.New("no files were dropped")
	}
	a.auditImported(targetPath, "Files added by drag and drop", copied, updated)
	return copied, nil
}

func (a *App) RenameFile(path, newName string) (string, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return "", err
	}
	if filepath.Base(path) == notesFile {
		return "", errors.New("notes.txt is protected")
	}
	newName = strings.TrimSpace(filepath.Base(newName))
	if newName == "" {
		return "", errors.New("file name is required")
	}
	oldName := filepath.Base(path)
	newPath := filepath.Join(filepath.Dir(path), newName)
	if newPath == path {
		return path, nil
	}
	if _, err := os.Lstat(newPath); err == nil {
		return "", errors.New("a file with that name already exists in this section; choose another name")
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if err := os.Rename(path, newPath); err != nil {
		return "", err
	}
	a.moveDocumentMetadata(path, newPath)
	moveVersions(path, newPath)
	_ = a.appendAudit(newPath, "File renamed", fmt.Sprintf("%s → %s", oldName, newName))
	return newPath, nil
}

func (a *App) DeleteFile(path string) error {
	path, err := a.requireType(path, "file")
	if err != nil {
		return err
	}
	if filepath.Base(path) == notesFile {
		return errors.New("notes.txt is protected")
	}
	name := filepath.Base(path)
	location := ""
	if cp, err := a.clientPathFor(path); err == nil {
		if rel, err := filepath.Rel(cp, filepath.Dir(path)); err == nil {
			_, clientName, _ := parseClientDirName(filepath.Base(cp))
			location = clientName
			if rel != "." {
				location += " › " + strings.ReplaceAll(filepath.ToSlash(rel), "/", " › ")
			}
		}
	}
	if err := a.moveToRecycleBin(path, "file", location); err != nil {
		return err
	}
	_ = a.appendAudit(filepath.Dir(path), "File moved to Recycle Bin", name)
	return nil
}

func (a *App) safePath(path string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	if strings.TrimSpace(path) == "" {
		return "", errors.New("no item selected")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	root, _ := filepath.Abs(a.dataRoot)
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", errors.New("path is outside BabyFileCab data folder")
	}
	relPath, _ := filepath.Rel(root, abs)
	for _, part := range splitRel(relPath) {
		if part == vaultDBName || part == vaultReadyName || part == accountsDBName || part == accountsReadyName || part == ".vault-keys" || part == ".migration-backups" || part == ".plaintext-preview" || part == recycleBinDir || part == versionsDirName || part == ".users.json" || part == ".companies.json" || part == clientProfileFile || part == documentMetadataFile || part == firmCalendarFile {
			return "", errors.New("this is an internal BabyFileCab file")
		}
	}
	check := root
	for _, part := range splitRel(relPath) {
		check = filepath.Join(check, part)
		info, statErr := os.Lstat(check)
		if errors.Is(statErr, os.ErrNotExist) {
			break
		}
		if statErr != nil {
			return "", statErr
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("symbolic links are not allowed inside the company vault")
		}
	}
	// When a migrated legacy company uses the storage root directly, keep the
	// application from traversing into other companies' workspace directories
	// or account metadata. (The operating-system user still owns local files.)
	storage, _ := filepath.Abs(a.storageRoot)
	if root == storage {
		companiesRoot := filepath.Join(storage, "companies")
		if abs == companiesRoot || strings.HasPrefix(abs, companiesRoot+string(os.PathSeparator)) ||
			abs == filepath.Join(storage, ".users.json") || abs == filepath.Join(storage, ".companies.json") {
			return "", errors.New("path belongs to BabyFileCab system or another company workspace")
		}
	}
	return filepath.Clean(abs), nil
}

func (a *App) requireType(path, want string) (string, error) {
	p, err := a.safePath(path)
	if err != nil {
		return "", err
	}
	if a.pathType(p) != want {
		return "", fmt.Errorf("select a %s first", want)
	}
	return p, nil
}

func (a *App) pathType(path string) string {
	p, err := a.safePath(path)
	if err != nil {
		return ""
	}
	info, err := os.Stat(p)
	if err != nil {
		return ""
	}
	if !info.IsDir() {
		return "file"
	}
	rel, err := filepath.Rel(a.dataRoot, p)
	if err != nil {
		return ""
	}
	parts := splitRel(rel)
	if len(parts) == 1 && isClientDirName(parts[0]) {
		return "client"
	}
	if len(parts) == 2 && parts[1] == permanentFolder {
		return "permanent"
	}
	if len(parts) == 2 && isTaxYear(parts[1]) {
		return "taxyear"
	}
	if len(parts) == 2 {
		return "section"
	}
	if len(parts) >= 3 {
		return "section"
	}
	return "folder"
}

func (a *App) uploadTarget(path string) (string, error) {
	p, err := a.safePath(path)
	if err != nil {
		return "", err
	}
	t := a.pathType(p)
	switch t {
	case "client":
		return filepath.Join(p, permanentFolder), nil
	case "permanent", "taxyear", "section":
		return p, nil
	case "file":
		return filepath.Dir(p), nil
	default:
		return "", errors.New("select a client, folder, tax year, section, or file")
	}
}

func (a *App) documentMetadataPath() string {
	return filepath.Join(a.dataRoot, documentMetadataFile)
}

func (a *App) documentMetadataKey(path string) string {
	path, err := a.safePath(path)
	if err != nil {
		return ""
	}
	rel, err := filepath.Rel(a.dataRoot, path)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func (a *App) readDocumentMetadata() (map[string]string, error) {
	meta := map[string]string{}
	err := a.metadataJSONGet("document-metadata", "all", &meta)
	if errors.Is(err, os.ErrNotExist) {
		return meta, nil
	}
	return meta, err
}

func (a *App) writeDocumentMetadata(meta map[string]string) error {
	return a.metadataJSONPut("document-metadata", "all", meta)
}

func (a *App) readDocumentStatuses() (map[string]bool, error) {
	statuses := map[string]bool{}
	err := a.metadataJSONGet("document-status", "all", &statuses)
	if errors.Is(err, os.ErrNotExist) {
		return statuses, nil
	}
	return statuses, err
}

func (a *App) writeDocumentStatuses(statuses map[string]bool) error {
	return a.metadataJSONPut("document-status", "all", statuses)
}

// SetDocumentEnteredDone marks a document as already entered/worked in the tax return.
// The status is stored as encrypted company metadata rather than modifying the client document.
func (a *App) SetDocumentEnteredDone(path string, done bool) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	absPath, err := a.requireType(path, "file")
	if err != nil {
		return err
	}
	statuses, err := a.readDocumentStatuses()
	if err != nil {
		return err
	}
	key := a.documentMetadataKey(absPath)
	if key == "" {
		return errors.New("invalid document path")
	}
	if done {
		statuses[key] = true
	} else {
		delete(statuses, key)
	}
	return a.writeDocumentStatuses(statuses)
}

func (a *App) moveDocumentMetadata(oldPath, newPath string) {
	oldKey := a.documentMetadataKey(oldPath)
	newKey := a.documentMetadataKey(newPath)
	if meta, err := a.readDocumentMetadata(); err == nil {
		if value, ok := meta[oldKey]; ok {
			delete(meta, oldKey)
			meta[newKey] = value
			_ = a.writeDocumentMetadata(meta)
		}
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		if value, ok := statuses[oldKey]; ok {
			delete(statuses, oldKey)
			statuses[newKey] = value
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

func (a *App) removeDocumentMetadata(path string) {
	key := a.documentMetadataKey(path)
	if meta, err := a.readDocumentMetadata(); err == nil {
		if _, ok := meta[key]; ok {
			delete(meta, key)
			_ = a.writeDocumentMetadata(meta)
		}
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		if _, ok := statuses[key]; ok {
			delete(statuses, key)
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

func (a *App) remapDocumentMetadataPrefix(oldPath, newPath string) {
	oldKey := a.documentMetadataKey(oldPath)
	newKey := a.documentMetadataKey(newPath)
	if meta, err := a.readDocumentMetadata(); err == nil {
		changed := false
		for key, value := range meta {
			if key == oldKey || strings.HasPrefix(key, oldKey+"/") {
				suffix := strings.TrimPrefix(key, oldKey)
				delete(meta, key)
				meta[newKey+suffix] = value
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentMetadata(meta)
		}
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		changed := false
		for key, value := range statuses {
			if key == oldKey || strings.HasPrefix(key, oldKey+"/") {
				suffix := strings.TrimPrefix(key, oldKey)
				delete(statuses, key)
				statuses[newKey+suffix] = value
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

func (a *App) removeDocumentMetadataPrefix(path string) {
	prefix := a.documentMetadataKey(path)
	if meta, err := a.readDocumentMetadata(); err == nil {
		changed := false
		for key := range meta {
			if key == prefix || strings.HasPrefix(key, prefix+"/") {
				delete(meta, key)
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentMetadata(meta)
		}
	}
	if statuses, err := a.readDocumentStatuses(); err == nil {
		changed := false
		for key := range statuses {
			if key == prefix || strings.HasPrefix(key, prefix+"/") {
				delete(statuses, key)
				changed = true
			}
		}
		if changed {
			_ = a.writeDocumentStatuses(statuses)
		}
	}
}

func splitRel(rel string) []string {
	if rel == "." || rel == "" {
		return nil
	}
	return strings.FieldsFunc(rel, func(r rune) bool { return r == '/' || r == '\\' })
}

// auditImported records added files, noting which ones replaced an existing
// document (whose old copy is kept as a previous version).
func (a *App) auditImported(targetPath, action string, copied, updated []string) {
	if len(copied) == 0 {
		return
	}
	names := make([]string, 0, len(copied))
	for _, p := range copied {
		names = append(names, filepath.Base(p))
	}
	details := strings.Join(names, ", ")
	if len(updated) > 0 {
		details += " (new version of " + strings.Join(updated, ", ") + ")"
	}
	_ = a.appendAudit(targetPath, action, details)
}
