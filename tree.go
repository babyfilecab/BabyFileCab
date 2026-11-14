package main

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (a *App) GetTree() ([]TreeNode, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	statuses, err := a.readDocumentStatuses()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(a.dataRoot)
	if err != nil {
		return nil, err
	}
	var clients []TreeNode
	for _, e := range entries {
		if !e.IsDir() || !isClientDirName(e.Name()) {
			continue
		}
		p := filepath.Join(a.dataRoot, e.Name())
		n, err := a.buildClientNode(p, statuses)
		if err == nil {
			clients = append(clients, n)
		}
	}
	sort.Slice(clients, func(i, j int) bool { return strings.ToLower(clients[i].Name) < strings.ToLower(clients[j].Name) })
	return clients, nil
}

func (a *App) buildClientNode(clientPath string, statuses map[string]bool) (TreeNode, error) {
	clientPath, err := a.safePath(clientPath)
	if err != nil {
		return TreeNode{}, err
	}
	base := filepath.Base(clientPath)
	clientID, displayName, ok := parseClientDirName(base)
	if !ok {
		return TreeNode{}, errors.New("invalid client folder")
	}
	// Keep the 5-digit client ID in the local folder name and node metadata,
	// but show only the human-friendly client name in the document tree.
	n := TreeNode{ID: clientPath, Name: displayName, ClientID: clientID, Type: "client", Path: clientPath}

	permanent := filepath.Join(clientPath, permanentFolder)
	if err := os.MkdirAll(permanent, 0700); err != nil {
		return TreeNode{}, err
	}
	notes := filepath.Join(permanent, notesFile)
	if _, err := os.Stat(notes); errors.Is(err, os.ErrNotExist) {
		if err := a.secureWriteFile(notes, []byte("")); err != nil {
			return TreeNode{}, err
		}
	}

	permNode, err := a.buildFolderNode(permanent, "permanent", statuses)
	if err != nil {
		return TreeNode{}, err
	}
	n.Children = append(n.Children, permNode)

	entries, err := os.ReadDir(clientPath)
	if err != nil {
		return TreeNode{}, err
	}
	var years, clientSections []TreeNode
	for _, e := range entries {
		if !e.IsDir() || e.Name() == permanentFolder || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		p := filepath.Join(clientPath, e.Name())
		if isTaxYear(e.Name()) {
			yn, err := a.buildTaxYearNode(p, statuses)
			if err == nil {
				years = append(years, yn)
			}
		} else {
			sn, err := a.buildFolderNode(p, "section", statuses)
			if err == nil {
				clientSections = append(clientSections, sn)
			}
		}
	}
	sort.Slice(years, func(i, j int) bool { return years[i].Name > years[j].Name })
	sortNodes(clientSections)
	n.Children = append(n.Children, years...)
	n.Children = append(n.Children, clientSections...)
	return n, nil
}

func (a *App) buildTaxYearNode(path string, statuses map[string]bool) (TreeNode, error) {
	path, err := a.safePath(path)
	if err != nil {
		return TreeNode{}, err
	}
	n := TreeNode{ID: path, Name: filepath.Base(path), Type: "taxyear", Path: path}
	entries, err := os.ReadDir(path)
	if err != nil {
		return TreeNode{}, err
	}
	var dirs, files []TreeNode
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		p := filepath.Join(path, e.Name())
		if e.IsDir() {
			cn, err := a.buildFolderNode(p, "section", statuses)
			if err == nil {
				dirs = append(dirs, cn)
			}
		} else {
			files = append(files, a.fileNode(p, statuses))
		}
	}
	sortNodes(dirs)
	sortNodes(files)
	n.Children = append(n.Children, dirs...)
	n.Children = append(n.Children, files...)
	return n, nil
}

func (a *App) buildFolderNode(path, nodeType string, statuses map[string]bool) (TreeNode, error) {
	path, err := a.safePath(path)
	if err != nil {
		return TreeNode{}, err
	}
	n := TreeNode{ID: path, Name: filepath.Base(path), Type: nodeType, Path: path}
	entries, err := os.ReadDir(path)
	if err != nil {
		return TreeNode{}, err
	}
	var dirs, files []TreeNode
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		p := filepath.Join(path, e.Name())
		if e.IsDir() {
			cn, err := a.buildFolderNode(p, "section", statuses)
			if err == nil {
				dirs = append(dirs, cn)
			}
		} else {
			files = append(files, a.fileNode(p, statuses))
		}
	}
	sortNodes(dirs)
	sortNodes(files)
	// notes.txt should always be first in Permanent Folder.
	if nodeType == "permanent" {
		sort.SliceStable(files, func(i, j int) bool {
			if files[i].Name == notesFile {
				return true
			}
			if files[j].Name == notesFile {
				return false
			}
			return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
		})
	}
	n.Children = append(n.Children, dirs...)
	n.Children = append(n.Children, files...)
	return n, nil
}

func (a *App) fileNode(path string, statuses map[string]bool) TreeNode {
	return TreeNode{ID: path, Name: filepath.Base(path), Type: "file", Path: path, Done: statuses[a.documentMetadataKey(path)]}
}

func sortNodes(nodes []TreeNode) {
	sort.Slice(nodes, func(i, j int) bool { return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name) })
}

func (a *App) NodeType(path string) string { return a.pathType(path) }
