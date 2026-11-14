package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/argon2"
)

func (a *App) HasUsers() bool {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	users, err := a.loadUsersUnlocked()
	return err == nil && len(users) > 0
}

func (a *App) CurrentUser() UserProfile {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	if a.currentUser == nil || time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return UserProfile{}
	}
	return *a.currentUser
}

// ListCompanyUsers returns the user profiles that belong to the currently
// signed-in company. Password salts and hashes are never exposed to the UI.
func (a *App) ListCompanyUsers() ([]UserProfile, error) {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	if a.currentUser == nil || a.currentCompany == nil || time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return nil, errors.New("sign in to BabyFileCab first")
	}
	users, err := a.loadUsersUnlocked()
	if err != nil {
		return nil, err
	}
	profiles := make([]UserProfile, 0)
	for _, u := range users {
		if u.CompanyID != a.currentCompany.ID {
			continue
		}
		profile := u.UserProfile
		if err := a.metadataJSONGet("user-profile", strings.ToLower(u.Username), &profile); err != nil {
			return nil, err
		}
		profile.CompanyName = a.currentCompany.Name
		keyPath, err := a.activeWrappedKeyPath(a.currentCompany.ID, u.Username)
		if err != nil {
			return nil, err
		}
		if _, err := os.Stat(keyPath); err == nil {
			profile.VaultStatus = "Enrolled"
		} else {
			profile.VaultStatus = "Pending"
		}
		profiles = append(profiles, profile)
	}
	sort.Slice(profiles, func(i, j int) bool {
		left := strings.ToLower(strings.TrimSpace(profiles[i].LastName + " " + profiles[i].FirstName + " " + profiles[i].Username))
		right := strings.ToLower(strings.TrimSpace(profiles[j].LastName + " " + profiles[j].FirstName + " " + profiles[j].Username))
		return left < right
	})
	return profiles, nil
}

// ListCompanies returns the locally registered companies so the sign-in screen
// can offer "Create User Under Existing Company". Client/document data is not
// exposed by this method.
func (a *App) ListCompanies() ([]CompanyProfile, error) {
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	companies, err := a.loadCompaniesUnlocked()
	if err != nil {
		return nil, err
	}
	sort.Slice(companies, func(i, j int) bool {
		return strings.ToLower(companies[i].Name) < strings.ToLower(companies[j].Name)
	})
	return companies, nil
}

// RegisterUser creates a new local company and its first account. A company
// must start with an Administrator so additional users can later be authorized.
func (a *App) RegisterUser(req UserRegistration) (UserProfile, error) {
	normalizeUserRegistration(&req)
	req.CompanyName = strings.TrimSpace(req.CompanyName)
	if req.CompanyName == "" {
		return UserProfile{}, errors.New("company name is required")
	}
	if err := validateUserRegistration(req); err != nil {
		return UserProfile{}, err
	}
	if req.Role != "administrator" {
		return UserProfile{}, errors.New("the first user for a new company must be an Administrator")
	}

	a.authMu.Lock()
	defer a.authMu.Unlock()

	users, err := a.loadUsersUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	if usernameExists(users, req.Username) {
		return UserProfile{}, errors.New("that username already exists")
	}
	companies, err := a.loadCompaniesUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	for _, company := range companies {
		if strings.EqualFold(strings.TrimSpace(company.Name), req.CompanyName) {
			return UserProfile{}, errors.New("a company with that name already exists; use Create User Under Existing Company instead")
		}
	}

	companyID, err := newCompanyID()
	if err != nil {
		return UserProfile{}, err
	}
	company := CompanyProfile{
		ID:        companyID,
		Name:      req.CompanyName,
		DataDir:   filepath.Join("companies", companyID),
		CreatedAt: time.Now().Format(time.RFC3339),
	}
	companyRoot, err := a.companyDataRootUnlocked(company)
	if err != nil {
		return UserProfile{}, err
	}
	if err := os.MkdirAll(companyRoot, 0700); err != nil {
		return UserProfile{}, fmt.Errorf("create company data folder: %w", err)
	}

	entry, profile, err := buildStoredUser(req, company)
	if err != nil {
		return UserProfile{}, err
	}
	vaultKey, err := randomBytes(vaultKeySize)
	if err != nil {
		return UserProfile{}, err
	}
	if err := a.writeWrappedKey(company.ID, profile.Username, req.Password, vaultKey); err != nil {
		return UserProfile{}, err
	}
	if err := migrateCompanyData(companyRoot, a.storageRoot, company.ID, vaultKey); err != nil {
		return UserProfile{}, err
	}
	if err := migrateAuditToSQLite(companyRoot, a.storageRoot, vaultKey); err != nil {
		return UserProfile{}, err
	}
	profileBytes, err := json.Marshal(profile)
	if err != nil {
		return UserProfile{}, err
	}
	profileDB, err := openVaultDB(companyRoot)
	if err != nil {
		return UserProfile{}, err
	}
	err = metadataPut(profileDB, vaultKey, "user-profile", strings.ToLower(profile.Username), profileBytes)
	_ = profileDB.Close()
	if err != nil {
		return UserProfile{}, err
	}
	companies = append(companies, company)
	if err := a.saveCompaniesUnlocked(companies); err != nil {
		return UserProfile{}, err
	}
	users = append(users, redactedUser(entry))
	if err := a.saveUsersUnlocked(users); err != nil {
		return UserProfile{}, err
	}
	if err := a.maybeMigrateAuthIndex(users); err != nil {
		return UserProfile{}, err
	}

	a.currentUser = &profile
	a.currentCompany = &company
	a.vaultMu.Lock()
	a.vaultKey = vaultKey
	a.vaultMu.Unlock()
	a.lastActivity = time.Now()
	a.dataRoot = companyRoot
	_ = a.appendAppAuditFor(companyRoot, profile, "", "", "Company created", fmt.Sprintf("%s created with first Administrator account @%s", company.Name, profile.Username))
	return profile, nil
}

// CreateUserUnderExistingCompany adds a user to an existing company only after
// an active Administrator for that same company supplies valid credentials.
// Every user in that company resolves to the same company dataRoot, so they see
// the same client tree and documents on this local BabyFileCab installation.
func (a *App) CreateUserUnderExistingCompany(req ExistingCompanyUserRegistration) (UserProfile, error) {
	companyID := strings.TrimSpace(req.CompanyID)
	adminUsername := strings.TrimSpace(req.AdminUsername)
	adminPassword := req.AdminPassword
	if companyID == "" {
		return UserProfile{}, errors.New("select a company")
	}
	if adminUsername == "" || adminPassword == "" {
		return UserProfile{}, errors.New("administrator username and password are required")
	}

	userReq := UserRegistration{
		Username: req.Username, FirstName: req.FirstName, LastName: req.LastName,
		Email: req.Email, Phone: req.Phone, Password: req.Password,
		ConfirmPassword: req.ConfirmPassword, Role: req.Role,
		StreetAddress: req.StreetAddress, City: req.City, State: req.State, ZIP: req.ZIP,
		CAF: req.CAF, PTIN: req.PTIN, Telephone: req.Telephone, Fax: req.Fax,
	}
	normalizeUserRegistration(&userReq)
	if err := validateUserRegistration(userReq); err != nil {
		return UserProfile{}, err
	}

	a.authMu.Lock()
	defer a.authMu.Unlock()

	companies, err := a.loadCompaniesUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	company, ok := findCompany(companies, companyID)
	if !ok {
		return UserProfile{}, errors.New("selected company no longer exists")
	}
	users, err := a.loadUsersUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	if usernameExists(users, userReq.Username) {
		return UserProfile{}, errors.New("that username already exists")
	}

	adminOK := false
	var adminProfile UserProfile
	for _, candidate := range users {
		if candidate.CompanyID != company.ID || !strings.EqualFold(candidate.Username, adminUsername) {
			continue
		}
		if strings.ToLower(candidate.Role) != "administrator" {
			return UserProfile{}, errors.New("that account is not an Administrator for the selected company")
		}
		ok, err := verifyStoredPassword(candidate, adminPassword)
		if err != nil {
			return UserProfile{}, err
		}
		adminOK = ok
		if ok {
			adminProfile = candidate.UserProfile
			adminProfile.CompanyName = company.Name
		}
		break
	}
	if !adminOK {
		return UserProfile{}, errors.New("administrator authorization failed")
	}

	entry, profile, err := buildStoredUser(userReq, company)
	if err != nil {
		return UserProfile{}, err
	}
	adminKey, err := a.unwrapKey(company.ID, adminUsername, adminPassword)
	if err != nil {
		return UserProfile{}, fmt.Errorf("administrator must unlock the company vault before adding users: %w", err)
	}
	if err := a.writeWrappedKey(company.ID, profile.Username, userReq.Password, adminKey); err != nil {
		return UserProfile{}, err
	}
	defer func() {
		for i := range adminKey {
			adminKey[i] = 0
		}
	}()
	root, err := a.companyDataRootUnlocked(company)
	if err != nil {
		return UserProfile{}, err
	}
	profileBytes, err := json.Marshal(profile)
	if err != nil {
		return UserProfile{}, err
	}
	profileDB, err := openVaultDB(root)
	if err != nil {
		return UserProfile{}, err
	}
	err = metadataPut(profileDB, adminKey, "user-profile", strings.ToLower(profile.Username), profileBytes)
	_ = profileDB.Close()
	if err != nil {
		return UserProfile{}, err
	}
	users = append(users, redactedUser(entry))
	if err := a.saveUsersUnlocked(users); err != nil {
		return UserProfile{}, err
	}
	companyRoot, rootErr := a.companyDataRootUnlocked(company)
	if rootErr == nil {
		_ = a.appendAppAuditFor(companyRoot, adminProfile, "", "", "User account created", fmt.Sprintf("@%s created as %s", profile.Username, displayAuditRole(profile.Role)))
	}
	return profile, nil
}

func (a *App) Login(username, password string) (UserProfile, error) {
	username = strings.TrimSpace(username)
	if username == "" || password == "" {
		return UserProfile{}, errors.New("enter your username and password")
	}

	a.authMu.Lock()
	defer a.authMu.Unlock()
	users, err := a.loadUsersUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	companies, err := a.loadCompaniesUnlocked()
	if err != nil {
		return UserProfile{}, err
	}
	for index, u := range users {
		if !strings.EqualFold(u.Username, username) {
			continue
		}
		ok, err := verifyStoredPassword(u, password)
		if err != nil {
			return UserProfile{}, err
		}
		if !ok {
			break
		}
		company, found := findCompany(companies, u.CompanyID)
		if !found {
			return UserProfile{}, errors.New("the company assigned to this account could not be found")
		}
		vaultKey, keyErr := a.unwrapKey(company.ID, u.Username, password)
		if keyErr != nil && errors.Is(keyErr, os.ErrNotExist) && u.KeyWrapID == "" && u.PasswordKDF == "" {
			// Pre-encryption company: the first administrator creates the key;
			// everyone else waits to be enrolled by that administrator.
			if u.Role != "administrator" {
				return UserProfile{}, errors.New("your account is pending vault enrollment: ask a company administrator to sign in and enroll you")
			}
			legacyRoot, rootErr := a.companyDataRootUnlocked(company)
			if rootErr != nil {
				return UserProfile{}, rootErr
			}
			vaultKey, keyErr = a.bootstrapLegacyVaultKey(company, legacyRoot, u.Username, password)
			if errors.Is(keyErr, os.ErrExist) {
				return UserProfile{}, errors.New("your account is pending vault enrollment: ask an administrator who can already unlock this company to enroll you")
			}
		}
		if keyErr != nil {
			if errors.Is(keyErr, os.ErrNotExist) {
				return UserProfile{}, errors.New("company vault key is missing: restore the encrypted key file from a complete backup, or ask an administrator who can already unlock this company to enroll your account; no replacement key was created")
			}
			return UserProfile{}, keyErr
		}

		if u.PasswordKDF == "" {
			// Upgrade only after a successful legacy password check. An interrupted
			// write leaves the old verifier usable on the next login.
			salt := make([]byte, passwordSaltLength)
			if _, err := rand.Read(salt); err != nil {
				return UserProfile{}, err
			}
			hash := argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, passwordKeyLength)
			users[index].PasswordSalt = base64.StdEncoding.EncodeToString(salt)
			users[index].PasswordHash = base64.StdEncoding.EncodeToString(hash)
			users[index].PasswordKDF = "argon2id-v1"
			users[index].Iterations = 0
			if err := a.saveUsersUnlocked(users); err != nil {
				return UserProfile{}, err
			}
		}
		root, err := a.companyDataRootUnlocked(company)
		if err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		if err := os.MkdirAll(root, 0700); err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, fmt.Errorf("open company data folder: %w", err)
		}
		if err := migrateCompanyData(root, a.storageRoot, company.ID, vaultKey); err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, fmt.Errorf("migrate company vault: %w", err)
		}
		if err := migrateAuditToSQLite(root, a.storageRoot, vaultKey); err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		users, err = a.migrateCompanyUserProfiles(users, company, root, vaultKey)
		if err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		if err := a.maybeMigrateAuthIndex(users); err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		profileDB, err := openVaultDB(root)
		if err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		profileBytes, err := metadataGet(profileDB, vaultKey, "user-profile", strings.ToLower(u.Username))
		_ = profileDB.Close()
		if err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		var profile UserProfile
		if err := json.Unmarshal(profileBytes, &profile); err != nil {
			zeroBytes(vaultKey)
			return UserProfile{}, err
		}
		profile.CompanyName = company.Name
		a.currentUser = &profile
		a.currentCompany = &company
		a.vaultMu.Lock()
		a.vaultKey = vaultKey
		a.vaultMu.Unlock()
		a.lastActivity = time.Now()
		a.dataRoot = root
		_ = a.appendAppAuditFor(root, profile, "", "", "Signed in", "BabyFileCab session started")
		return profile, nil
	}
	return UserProfile{}, errors.New("invalid username or password")
}

func (a *App) Logout() {
	a.authMu.Lock()
	var user UserProfile
	root := a.dataRoot
	if a.currentUser != nil {
		user = *a.currentUser
	}
	if user.Username != "" && root != "" {
		_ = a.appendAppAuditFor(root, user, "", "", "Signed out", "BabyFileCab session ended")
	}
	a.currentUser = nil
	a.currentCompany = nil
	a.vaultMu.Lock()
	for i := range a.vaultKey {
		a.vaultKey[i] = 0
	}
	a.vaultKey = nil
	a.vaultMu.Unlock()
	a.lastActivity = time.Time{}
	a.dataRoot = a.storageRoot
	a.authMu.Unlock()
	a.removeDecryptedTemps()
}

// EnrollExistingUser adds a separately wrapped company key only after the
// administrator has unlocked the vault and the target user proves their own
// existing password. Neither person has to reveal a password to the other.
func (a *App) EnrollExistingUser(username, password string) error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	if a.currentUser == nil || a.currentCompany == nil || a.currentUser.Role != "administrator" || len(a.vaultKey) != vaultKeySize {
		return errors.New("an administrator must unlock the company vault first")
	}
	if time.Since(a.lastActivity) >= a.idleTimeoutLocked() {
		return errors.New("the company vault is locked")
	}
	users, err := a.loadUsersUnlocked()
	if err != nil {
		return err
	}
	for _, user := range users {
		if user.CompanyID != a.currentCompany.ID || !strings.EqualFold(user.Username, strings.TrimSpace(username)) {
			continue
		}
		if user.KeyWrapID != "" {
			return errors.New("user is already enrolled; restore the encrypted vault-key file if it is missing")
		}
		if _, err := os.Stat(a.wrappedKeyPath(user.CompanyID, user.Username)); err == nil {
			return errors.New("user is already enrolled")
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		ok, err := verifyStoredPassword(user, password)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("incorrect user password")
		}
		if err := a.writeWrappedKey(user.CompanyID, user.Username, password, a.vaultKey); err != nil {
			return err
		}
		key, err := a.unwrapKey(user.CompanyID, user.Username, password)
		if err != nil {
			_ = os.Remove(a.wrappedKeyPath(user.CompanyID, user.Username))
			return err
		}
		verified := subtle.ConstantTimeCompare(key, a.vaultKey) == 1
		for i := range key {
			key[i] = 0
		}
		if !verified {
			_ = os.Remove(a.wrappedKeyPath(user.CompanyID, user.Username))
			return errors.New("vault enrollment verification failed")
		}
		_ = a.appendAppAuditFor(a.dataRoot, *a.currentUser, "", "", "Vault user enrolled", "@"+user.Username)
		return nil
	}
	return errors.New("user does not belong to this company")
}

func (a *App) usersPath() string {
	return filepath.Join(a.storageRoot, ".users.json")
}

func (a *App) companiesPath() string {
	return filepath.Join(a.storageRoot, ".companies.json")
}

func (a *App) loadUsersUnlocked() ([]storedUser, error) {
	if a.accountsReady() {
		return a.loadUsersSQLite()
	}
	data, err := os.ReadFile(a.usersPath())
	if errors.Is(err, os.ErrNotExist) {
		return []storedUser{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read users: %w", err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return []storedUser{}, nil
	}
	var users []storedUser
	if err := json.Unmarshal(data, &users); err != nil {
		return nil, fmt.Errorf("read users: %w", err)
	}
	return users, nil
}

func (a *App) saveUsersUnlocked(users []storedUser) error {
	if a.accountsReady() {
		return a.saveUsersSQLite(users)
	}
	data, err := json.MarshalIndent(users, "", "  ")
	if err != nil {
		return fmt.Errorf("save users: %w", err)
	}
	if err := writeAtomicPrivate(a.usersPath(), data); err != nil {
		return err
	}
	return syncVaultDirectory(a.storageRoot)
}

func (a *App) loadCompaniesUnlocked() ([]CompanyProfile, error) {
	if a.accountsReady() {
		return a.loadCompaniesSQLite()
	}
	data, err := os.ReadFile(a.companiesPath())
	if errors.Is(err, os.ErrNotExist) {
		return []CompanyProfile{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read companies: %w", err)
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return []CompanyProfile{}, nil
	}
	var companies []CompanyProfile
	if err := json.Unmarshal(data, &companies); err != nil {
		return nil, fmt.Errorf("read companies: %w", err)
	}
	return companies, nil
}

func (a *App) saveCompaniesUnlocked(companies []CompanyProfile) error {
	if a.accountsReady() {
		return a.saveCompaniesSQLite(companies)
	}
	data, err := json.MarshalIndent(companies, "", "  ")
	if err != nil {
		return fmt.Errorf("save companies: %w", err)
	}
	path := a.companiesPath()
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("save companies: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("save companies: %w", err)
	}
	return nil
}

func normalizeUserRegistration(req *UserRegistration) {
	req.Username = strings.TrimSpace(req.Username)
	req.FirstName = strings.TrimSpace(req.FirstName)
	req.LastName = strings.TrimSpace(req.LastName)
	req.Email = strings.TrimSpace(req.Email)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	req.StreetAddress = strings.TrimSpace(req.StreetAddress)
	req.City = strings.TrimSpace(req.City)
	req.State = strings.TrimSpace(req.State)
	req.ZIP = strings.TrimSpace(req.ZIP)
	req.CAF = strings.TrimSpace(req.CAF)
	req.PTIN = strings.TrimSpace(req.PTIN)
	req.Telephone = strings.TrimSpace(req.Telephone)
	req.Fax = strings.TrimSpace(req.Fax)
}

func buildStoredUser(req UserRegistration, company CompanyProfile) (storedUser, UserProfile, error) {
	salt := make([]byte, passwordSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return storedUser{}, UserProfile{}, fmt.Errorf("generate password salt: %w", err)
	}
	hash := argon2.IDKey([]byte(req.Password), salt, 3, 64*1024, 4, passwordKeyLength)
	profile := UserProfile{
		Username: req.Username, FirstName: req.FirstName, LastName: req.LastName,
		Email: req.Email, Phone: req.Phone, Role: req.Role,
		CompanyID: company.ID, CompanyName: company.Name,
		StreetAddress: req.StreetAddress, City: req.City, State: req.State, ZIP: req.ZIP,
		CAF: req.CAF, PTIN: req.PTIN, Telephone: req.Telephone, Fax: req.Fax,
		CreatedAt: time.Now().Format(time.RFC3339),
	}
	entry := storedUser{
		UserProfile: profile, PasswordSalt: base64.StdEncoding.EncodeToString(salt),
		PasswordHash: base64.StdEncoding.EncodeToString(hash), PasswordKDF: "argon2id-v1",
	}
	return entry, profile, nil
}

func verifyStoredPassword(user storedUser, password string) (bool, error) {
	salt, err := base64.StdEncoding.DecodeString(user.PasswordSalt)
	if err != nil {
		return false, errors.New("stored account is damaged")
	}
	want, err := base64.StdEncoding.DecodeString(user.PasswordHash)
	if err != nil || len(want) == 0 {
		return false, errors.New("stored account is damaged")
	}
	if user.PasswordKDF == "argon2id-v1" {
		if len(salt) != passwordSaltLength || len(want) != passwordKeyLength {
			return false, errors.New("stored account is damaged")
		}
		got := argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, passwordKeyLength)
		return subtle.ConstantTimeCompare(got, want) == 1, nil
	}
	if user.PasswordKDF != "" {
		return false, errors.New("unsupported password format")
	}
	iterations := user.Iterations
	if iterations <= 0 {
		iterations = passwordIterations
	}
	got := pbkdf2SHA256([]byte(password), salt, iterations, len(want))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

func usernameExists(users []storedUser, username string) bool {
	for _, user := range users {
		if strings.EqualFold(user.Username, username) {
			return true
		}
	}
	return false
}

func findCompany(companies []CompanyProfile, id string) (CompanyProfile, bool) {
	for _, company := range companies {
		if company.ID == id {
			return company, true
		}
	}
	return CompanyProfile{}, false
}

func newCompanyID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate company ID: %w", err)
	}
	return fmt.Sprintf("company-%x", b), nil
}

func (a *App) companyDataRootUnlocked(company CompanyProfile) (string, error) {
	if strings.TrimSpace(company.DataDir) == "" || company.DataDir == "." {
		return a.storageRoot, nil
	}
	root, err := filepath.Abs(filepath.Join(a.storageRoot, company.DataDir))
	if err != nil {
		return "", err
	}
	storage, _ := filepath.Abs(a.storageRoot)
	if root != storage && !strings.HasPrefix(root, storage+string(os.PathSeparator)) {
		return "", errors.New("company data folder is outside BabyFileCab storage")
	}
	return root, nil
}

// migrateLegacyCompanyData keeps accounts and clients created by the previous
// sign-in build working. Legacy users are assigned to one shared company whose
// data directory remains the existing ~/BabyFileCabData root, so no client
// folders are moved or renamed during this upgrade.
func (a *App) migrateLegacyCompanyData() error {
	a.authMu.Lock()
	defer a.authMu.Unlock()
	users, err := a.loadUsersUnlocked()
	if err != nil {
		return err
	}
	companies, err := a.loadCompaniesUnlocked()
	if err != nil {
		return err
	}
	needsMigration := false
	for _, user := range users {
		if strings.TrimSpace(user.CompanyID) == "" {
			needsMigration = true
			break
		}
	}
	if !needsMigration {
		return nil
	}

	const legacyID = "company-existing-local"
	legacy, found := findCompany(companies, legacyID)
	if !found {
		legacy = CompanyProfile{
			ID: legacyID, Name: "Existing BabyFileCab Company", DataDir: ".",
			CreatedAt: time.Now().Format(time.RFC3339),
		}
		companies = append(companies, legacy)
	}
	for i := range users {
		if strings.TrimSpace(users[i].CompanyID) == "" {
			users[i].CompanyID = legacy.ID
			users[i].CompanyName = legacy.Name
		}
	}
	if err := a.saveCompaniesUnlocked(companies); err != nil {
		return err
	}
	return a.saveUsersUnlocked(users)
}

func validateUserRegistration(req UserRegistration) error {
	if len(req.Username) < 3 || len(req.Username) > 40 {
		return errors.New("username must be between 3 and 40 characters")
	}
	for _, r := range req.Username {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '-' {
			continue
		}
		return errors.New("username may contain only letters, numbers, periods, underscores, and hyphens")
	}
	if req.FirstName == "" || req.LastName == "" {
		return errors.New("first name and last name are required")
	}
	if req.Email == "" {
		return errors.New("email address is required")
	}
	if parsed, err := mail.ParseAddress(req.Email); err != nil || !strings.EqualFold(strings.TrimSpace(parsed.Address), req.Email) {
		return errors.New("enter a valid email address")
	}
	if req.Phone == "" {
		return errors.New("phone number is required")
	}
	if err := validateNewPassword(req.Username, req.Password); err != nil {
		return err
	}
	if req.Password != req.ConfirmPassword {
		return errors.New("password and confirm password do not match")
	}
	if req.Role != "staff" && req.Role != "administrator" {
		return errors.New("role must be Staff or Administrator")
	}
	return nil
}

func pbkdf2SHA256(password, salt []byte, iterations, keyLength int) []byte {
	if iterations < 1 {
		iterations = 1
	}
	hashLength := sha256.Size
	blocks := (keyLength + hashLength - 1) / hashLength
	result := make([]byte, 0, blocks*hashLength)
	var counter [4]byte
	for block := 1; block <= blocks; block++ {
		binary.BigEndian.PutUint32(counter[:], uint32(block))
		mac := hmac.New(sha256.New, password)
		_, _ = mac.Write(salt)
		_, _ = mac.Write(counter[:])
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iterations; i++ {
			mac = hmac.New(sha256.New, password)
			_, _ = mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		result = append(result, t...)
	}
	return result[:keyLength]
}

// requireAdministrator stops staff accounts from doing things that can't be
// undone. action finishes the sentence "only an administrator can ...".
func (a *App) requireAdministrator(action string) error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	a.authMu.RLock()
	defer a.authMu.RUnlock()
	if a.currentUser == nil || !strings.EqualFold(a.currentUser.Role, "administrator") {
		return errors.New("only an administrator can " + action)
	}
	return nil
}
