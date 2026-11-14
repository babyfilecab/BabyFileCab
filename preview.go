package main

import (
	"archive/zip"
	"bufio"
	"encoding/base64"
	"encoding/csv"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	goruntime "runtime"
	"strconv"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) GetPreview(path string) (Preview, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return Preview{}, err
	}
	name := filepath.Base(path)
	ext := strings.ToLower(filepath.Ext(path))
	p := Preview{Name: name, Path: path}
	if ext == ".pdf" {
		// Rendered in the window by PDF.js (see GetPDFData), which also counts pages.
		p.Kind = "pdf"
		return p, nil
	}
	previewPath, cleanup, err := a.decryptedTemp(path)
	if err != nil {
		return p, err
	}
	defer cleanup()

	if name == notesFile || ext == ".txt" {
		b, err := a.secureReadFile(path)
		if err != nil {
			return p, err
		}
		p.Kind = "text"
		p.Text = string(b)
		return p, nil
	}
	if ext == ".csv" {
		rows, err := readCSV(previewPath, 200)
		if err != nil {
			return p, err
		}
		p.Kind = "csv"
		p.Rows = rows
		return p, nil
	}
	if ext == ".xlsx" || ext == ".xlsm" {
		rows, err := readXLSX(previewPath, 200, 60)
		if err == nil && len(rows) > 0 {
			p.Kind = "spreadsheet"
			p.Rows = rows
			return p, nil
		}
	}
	if ext == ".eml" {
		text, err := emlText(previewPath)
		if err == nil {
			p.Kind = "email"
			p.Text = text
			return p, nil
		}
	}
	if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".webp" {
		b, err := a.secureReadFile(path)
		if err != nil {
			return p, err
		}
		mt := mime.TypeByExtension(ext)
		if mt == "" {
			mt = "image/png"
		}
		p.Kind = "image"
		p.ImageData = "data:" + mt + ";base64," + base64.StdEncoding.EncodeToString(b)
		return p, nil
	}
	if ext == ".docx" {
		text, err := docxText(previewPath)
		if err == nil && strings.TrimSpace(text) != "" {
			p.Kind = "text"
			p.Text = text
			return p, nil
		}
	}
	p.Kind = "unsupported"
	p.Message = "This file is stored in BabyFileCab. Legacy .doc/.xls and Outlook .msg/.oft files can be opened in their normal desktop application."
	return p, nil
}

// maxPDFPreviewBytes keeps a single preview from exhausting memory; larger
// files can still be opened in the desktop PDF reader.
const maxPDFPreviewBytes = 150 << 20

// GetPDFData returns a PDF from the vault, decrypted in memory and base64
// encoded, for the built-in PDF.js viewer. No plaintext copy touches the disk.
func (a *App) GetPDFData(path string) (string, error) {
	path, err := a.requireType(path, "file")
	if err != nil {
		return "", err
	}
	if strings.ToLower(filepath.Ext(path)) != ".pdf" {
		return "", errors.New("not a PDF file")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.Size() > maxPDFPreviewBytes {
		return "", errors.New("this PDF is too large to preview; use Open to view it in your PDF reader")
	}
	data, err := a.secureReadFile(path)
	if err != nil {
		return "", err
	}
	defer zeroBytes(data)
	return base64.StdEncoding.EncodeToString(data), nil
}

func (a *App) OpenFile(path string) error {
	path, err := a.safePath(path)
	if err != nil {
		return err
	}
	plainPath, cleanup, err := a.decryptedTemp(path)
	if err != nil {
		return err
	}
	if err := openPath(plainPath); err != nil {
		cleanup()
		return err
	}
	// External viewers may read asynchronously; cleanup occurs on lock/sign out.
	return nil
}

func (a *App) OpenIRSPaymentPage() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	wailsruntime.BrowserOpenURL(a.ctx, "https://www.irs.gov/payments")
	_ = a.appendAppAuditCurrent("", "", "IRS payment website opened", "https://www.irs.gov/payments")
	return nil
}

func (a *App) OpenIRSCurrencyExchangeRatesPage() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	const url = "https://www.irs.gov/individuals/international-taxpayers/yearly-average-currency-exchange-rates"
	wailsruntime.BrowserOpenURL(a.ctx, url)
	_ = a.appendAppAuditCurrent("", "", "IRS currency exchange-rate website opened", url)
	return nil
}

func readCSV(path string, maxRows int) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReader(f))
	r.FieldsPerRecord = -1
	var rows [][]string
	for len(rows) < maxRows {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return rows, err
		}
		rows = append(rows, rec)
	}
	return rows, nil
}

func docxText(path string) (string, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.Name != "word/document.xml" {
			continue
		}
		r, err := f.Open()
		if err != nil {
			return "", err
		}
		defer r.Close()
		dec := xml.NewDecoder(r)
		var b strings.Builder
		for {
			tok, err := dec.Token()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			switch t := tok.(type) {
			case xml.CharData:
				b.WriteString(string(t))
			case xml.EndElement:
				if t.Name.Local == "p" {
					b.WriteString("\n")
				}
			}
		}
		return b.String(), nil
	}
	return "", errors.New("document.xml not found")
}

func readXLSX(path string, maxRows, maxCols int) ([][]string, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return nil, err
	}
	defer zr.Close()

	shared := []string{}
	if data, err := zipEntryBytes(zr.File, "xl/sharedStrings.xml"); err == nil {
		shared, _ = parseSharedStrings(data)
	}

	var sheetName string
	for _, f := range zr.File {
		if strings.HasPrefix(f.Name, "xl/worksheets/sheet") && strings.HasSuffix(f.Name, ".xml") {
			if sheetName == "" || f.Name < sheetName {
				sheetName = f.Name
			}
		}
	}
	if sheetName == "" {
		return nil, errors.New("workbook has no worksheet")
	}
	data, err := zipEntryBytes(zr.File, sheetName)
	if err != nil {
		return nil, err
	}

	type xlsxRun struct {
		Text string `xml:"t"`
	}
	type xlsxInline struct {
		Text string    `xml:"t"`
		Runs []xlsxRun `xml:"r"`
	}
	type xlsxCell struct {
		Ref    string     `xml:"r,attr"`
		Type   string     `xml:"t,attr"`
		Value  string     `xml:"v"`
		Inline xlsxInline `xml:"is"`
	}
	type xlsxRow struct {
		Cells []xlsxCell `xml:"c"`
	}
	type worksheet struct {
		Rows []xlsxRow `xml:"sheetData>row"`
	}
	var ws worksheet
	if err := xml.Unmarshal(data, &ws); err != nil {
		return nil, err
	}

	var out [][]string
	for _, row := range ws.Rows {
		if len(out) >= maxRows {
			break
		}
		values := make([]string, 0)
		for _, cell := range row.Cells {
			col := xlsxColumnIndex(cell.Ref)
			if col < 0 || col >= maxCols {
				continue
			}
			for len(values) <= col {
				values = append(values, "")
			}
			val := cell.Value
			switch cell.Type {
			case "s":
				if idx, err := strconv.Atoi(strings.TrimSpace(cell.Value)); err == nil && idx >= 0 && idx < len(shared) {
					val = shared[idx]
				}
			case "inlineStr":
				var b strings.Builder
				b.WriteString(cell.Inline.Text)
				for _, run := range cell.Inline.Runs {
					b.WriteString(run.Text)
				}
				val = b.String()
			case "b":
				if strings.TrimSpace(cell.Value) == "1" {
					val = "TRUE"
				} else {
					val = "FALSE"
				}
			}
			values[col] = val
		}
		out = append(out, values)
	}
	return out, nil
}

func zipEntryBytes(files []*zip.File, name string) ([]byte, error) {
	for _, f := range files {
		if f.Name != name {
			continue
		}
		r, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return io.ReadAll(r)
	}
	return nil, os.ErrNotExist
}

func parseSharedStrings(data []byte) ([]string, error) {
	dec := xml.NewDecoder(strings.NewReader(string(data)))
	var out []string
	var current strings.Builder
	inSI := false
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "si" {
				inSI = true
				current.Reset()
			} else if inSI && t.Name.Local == "t" {
				var text string
				if err := dec.DecodeElement(&text, &t); err != nil {
					return nil, err
				}
				current.WriteString(text)
			}
		case xml.EndElement:
			if t.Name.Local == "si" && inSI {
				out = append(out, current.String())
				inSI = false
			}
		}
	}
	return out, nil
}

func xlsxColumnIndex(ref string) int {
	col := 0
	seen := false
	for _, r := range strings.ToUpper(ref) {
		if r < 'A' || r > 'Z' {
			break
		}
		seen = true
		col = col*26 + int(r-'A'+1)
	}
	if !seen {
		return -1
	}
	return col - 1
}

func emlText(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	msg, err := mail.ReadMessage(f)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	for _, key := range []string{"From", "To", "Cc", "Date", "Subject"} {
		if value := strings.TrimSpace(msg.Header.Get(key)); value != "" {
			fmt.Fprintf(&b, "%s: %s\n", key, value)
		}
	}
	b.WriteString("\n")
	body, err := readEmailBody(msg.Header.Get("Content-Type"), msg.Header.Get("Content-Transfer-Encoding"), msg.Body)
	if err != nil {
		return b.String(), nil
	}
	b.WriteString(body)
	return b.String(), nil
}

func readEmailBody(contentType, transferEncoding string, r io.Reader) (string, error) {
	mediaType, params, _ := mime.ParseMediaType(contentType)
	mediaType = strings.ToLower(mediaType)
	if strings.HasPrefix(mediaType, "multipart/") && params["boundary"] != "" {
		mr := multipart.NewReader(r, params["boundary"])
		var htmlFallback string
		for {
			part, err := mr.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			text, err := readEmailBody(part.Header.Get("Content-Type"), part.Header.Get("Content-Transfer-Encoding"), part)
			_ = part.Close()
			if err != nil || strings.TrimSpace(text) == "" {
				continue
			}
			pt, _, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
			if strings.EqualFold(pt, "text/plain") {
				return text, nil
			}
			if strings.EqualFold(pt, "text/html") && htmlFallback == "" {
				htmlFallback = text
			}
		}
		return htmlFallback, nil
	}

	decoded := decodeEmailTransfer(r, transferEncoding)
	data, err := io.ReadAll(decoded)
	if err != nil {
		return "", err
	}
	text := string(data)
	if mediaType == "text/html" {
		text = stripHTML(text)
	}
	return text, nil
}

func decodeEmailTransfer(r io.Reader, encoding string) io.Reader {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, r)
	case "quoted-printable":
		return quotedprintable.NewReader(r)
	default:
		return r
	}
}

var htmlTagPattern = regexp.MustCompile(`(?s)<[^>]*>`)

func stripHTML(s string) string {
	s = htmlTagPattern.ReplaceAllString(s, " ")
	s = html.UnescapeString(s)
	return strings.Join(strings.Fields(s), " ")
}

func openPath(path string) error {
	var cmd *exec.Cmd
	switch goruntime.GOOS {
	case "windows":
		// Do not route through cmd.exe: Go only quotes arguments containing
		// spaces, so a file name like "a&calc.pdf" would run a second command.
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}
