export namespace main {
	
	export class AppAuditEntry {
	    timestamp: string;
	    username?: string;
	    userName?: string;
	    role?: string;
	    clientId?: string;
	    clientName?: string;
	    action: string;
	    details?: string;
	
	    static createFrom(source: any = {}) {
	        return new AppAuditEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.username = source["username"];
	        this.userName = source["userName"];
	        this.role = source["role"];
	        this.clientId = source["clientId"];
	        this.clientName = source["clientName"];
	        this.action = source["action"];
	        this.details = source["details"];
	    }
	}
	export class AuditEntry {
	    timestamp: string;
	    action: string;
	    details: string;
	
	    static createFrom(source: any = {}) {
	        return new AuditEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.action = source["action"];
	        this.details = source["details"];
	    }
	}
	export class BackupInfo {
	    path: string;
	    createdAt: string;
	    files: number;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.createdAt = source["createdAt"];
	        this.files = source["files"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class BackupSettings {
	    folder: string;
	    frequency: string;
	    keep: number;
	    lastRun?: string;
	    lastOk?: string;
	    lastError?: string;
	    lastFile?: string;
	    lastSizeMb?: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folder = source["folder"];
	        this.frequency = source["frequency"];
	        this.keep = source["keep"];
	        this.lastRun = source["lastRun"];
	        this.lastOk = source["lastOk"];
	        this.lastError = source["lastError"];
	        this.lastFile = source["lastFile"];
	        this.lastSizeMb = source["lastSizeMb"];
	    }
	}
	export class ClientCommunication {
	    name: string;
	    email: string;
	    phone: string;
	    returnType: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new ClientCommunication(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.returnType = source["returnType"];
	        this.path = source["path"];
	    }
	}
	export class ClientProperties {
	    name: string;
	    clientId: string;
	    path: string;
	    address?: string;
	    phone?: string;
	    email?: string;
	    taxId?: string;
	    returnType?: string;
	
	    static createFrom(source: any = {}) {
	        return new ClientProperties(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.clientId = source["clientId"];
	        this.path = source["path"];
	        this.address = source["address"];
	        this.phone = source["phone"];
	        this.email = source["email"];
	        this.taxId = source["taxId"];
	        this.returnType = source["returnType"];
	    }
	}
	export class CompanyProfile {
	    id: string;
	    name: string;
	    dataDir: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new CompanyProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.dataDir = source["dataDir"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class DocumentProperties {
	    name: string;
	    path: string;
	    clientName: string;
	    clientId: string;
	    location: string;
	    description: string;
	    size: number;
	    modified: string;
	
	    static createFrom(source: any = {}) {
	        return new DocumentProperties(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.clientName = source["clientName"];
	        this.clientId = source["clientId"];
	        this.location = source["location"];
	        this.description = source["description"];
	        this.size = source["size"];
	        this.modified = source["modified"];
	    }
	}
	export class DocumentVersion {
	    id: string;
	    savedAt: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new DocumentVersion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.size = source["size"];
	    }
	}
	export class EngagementLetterLogoInfo {
	    path: string;
	    dataURL: string;
	
	    static createFrom(source: any = {}) {
	        return new EngagementLetterLogoInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.dataURL = source["dataURL"];
	    }
	}
	export class EngagementLetterRequest {
	    clientPath: string;
	    preparerUsername: string;
	    service: string;
	    taxYear: string;
	    feeType: string;
	    feeValue: string;
	    letterDate: string;
	    outputPath: string;
	
	    static createFrom(source: any = {}) {
	        return new EngagementLetterRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clientPath = source["clientPath"];
	        this.preparerUsername = source["preparerUsername"];
	        this.service = source["service"];
	        this.taxYear = source["taxYear"];
	        this.feeType = source["feeType"];
	        this.feeValue = source["feeValue"];
	        this.letterDate = source["letterDate"];
	        this.outputPath = source["outputPath"];
	    }
	}
	export class ExistingCompanyUserRegistration {
	    companyId: string;
	    adminUsername: string;
	    adminPassword: string;
	    username: string;
	    firstName: string;
	    lastName: string;
	    email: string;
	    phone: string;
	    password: string;
	    confirmPassword: string;
	    role: string;
	    streetAddress: string;
	    city: string;
	    state: string;
	    zip: string;
	    caf: string;
	    ptin: string;
	    telephone: string;
	    fax: string;
	
	    static createFrom(source: any = {}) {
	        return new ExistingCompanyUserRegistration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.companyId = source["companyId"];
	        this.adminUsername = source["adminUsername"];
	        this.adminPassword = source["adminPassword"];
	        this.username = source["username"];
	        this.firstName = source["firstName"];
	        this.lastName = source["lastName"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.password = source["password"];
	        this.confirmPassword = source["confirmPassword"];
	        this.role = source["role"];
	        this.streetAddress = source["streetAddress"];
	        this.city = source["city"];
	        this.state = source["state"];
	        this.zip = source["zip"];
	        this.caf = source["caf"];
	        this.ptin = source["ptin"];
	        this.telephone = source["telephone"];
	        this.fax = source["fax"];
	    }
	}
	export class FirmCalendarAssignment {
	    date: string;
	    clientId: string;
	    clientName: string;
	    clientPath?: string;
	    returnType?: string;
	    status?: string;
	    statusSince?: string;
	    preparerUsername?: string;
	
	    static createFrom(source: any = {}) {
	        return new FirmCalendarAssignment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.clientId = source["clientId"];
	        this.clientName = source["clientName"];
	        this.clientPath = source["clientPath"];
	        this.returnType = source["returnType"];
	        this.status = source["status"];
	        this.statusSince = source["statusSince"];
	        this.preparerUsername = source["preparerUsername"];
	    }
	}
	export class GlobalSearchResult {
	    name: string;
	    path: string;
	    clientName: string;
	    clientId: string;
	    location: string;
	    description: string;
	    match: string;
	
	    static createFrom(source: any = {}) {
	        return new GlobalSearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.clientName = source["clientName"];
	        this.clientId = source["clientId"];
	        this.location = source["location"];
	        this.description = source["description"];
	        this.match = source["match"];
	    }
	}
	export class InboxFile {
	    name: string;
	    size: number;
	    modified: string;
	
	    static createFrom(source: any = {}) {
	        return new InboxFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.modified = source["modified"];
	    }
	}
	export class InvoiceRequest {
	    clientPath: string;
	    preparerUsername: string;
	    service: string;
	    taxYear: string;
	    invoiceNumber: string;
	    invoiceDate: string;
	    dueDate: string;
	    feeType: string;
	    feeValue: string;
	    hours: string;
	    description: string;
	    notes: string;
	    outputPath: string;
	
	    static createFrom(source: any = {}) {
	        return new InvoiceRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clientPath = source["clientPath"];
	        this.preparerUsername = source["preparerUsername"];
	        this.service = source["service"];
	        this.taxYear = source["taxYear"];
	        this.invoiceNumber = source["invoiceNumber"];
	        this.invoiceDate = source["invoiceDate"];
	        this.dueDate = source["dueDate"];
	        this.feeType = source["feeType"];
	        this.feeValue = source["feeValue"];
	        this.hours = source["hours"];
	        this.description = source["description"];
	        this.notes = source["notes"];
	        this.outputPath = source["outputPath"];
	    }
	}
	export class NotesDocument {
	    text: string;
	    html: string;
	
	    static createFrom(source: any = {}) {
	        return new NotesDocument(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.html = source["html"];
	    }
	}
	export class Preview {
	    kind: string;
	    name: string;
	    path: string;
	    text?: string;
	    imageData?: string;
	    rows?: string[][];
	    pageCount?: number;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new Preview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.text = source["text"];
	        this.imageData = source["imageData"];
	        this.rows = source["rows"];
	        this.pageCount = source["pageCount"];
	        this.message = source["message"];
	    }
	}
	export class RecycleItem {
	    id: string;
	    name: string;
	    kind: string;
	    originalKey: string;
	    location: string;
	    deletedAt: string;
	    deletedBy: string;
	    expiresAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecycleItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.originalKey = source["originalKey"];
	        this.location = source["location"];
	        this.deletedAt = source["deletedAt"];
	        this.deletedBy = source["deletedBy"];
	        this.expiresAt = source["expiresAt"];
	    }
	}
	export class TimeSheetEntry {
	    id: string;
	    date: string;
	    clientId: string;
	    clientName: string;
	    clientPath?: string;
	    work?: string;
	    hours: number;
	    username: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new TimeSheetEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.date = source["date"];
	        this.clientId = source["clientId"];
	        this.clientName = source["clientName"];
	        this.clientPath = source["clientPath"];
	        this.work = source["work"];
	        this.hours = source["hours"];
	        this.username = source["username"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class TreeNode {
	    id: string;
	    name: string;
	    clientId?: string;
	    type: string;
	    path: string;
	    done?: boolean;
	    children?: TreeNode[];
	
	    static createFrom(source: any = {}) {
	        return new TreeNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.clientId = source["clientId"];
	        this.type = source["type"];
	        this.path = source["path"];
	        this.done = source["done"];
	        this.children = this.convertValues(source["children"], TreeNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateInfo {
	    available: boolean;
	    current: string;
	    latest: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.url = source["url"];
	    }
	}
	export class UserProfile {
	    username: string;
	    firstName: string;
	    lastName: string;
	    email: string;
	    phone: string;
	    role: string;
	    companyId: string;
	    companyName: string;
	    streetAddress?: string;
	    city?: string;
	    state?: string;
	    zip?: string;
	    caf?: string;
	    ptin?: string;
	    telephone?: string;
	    fax?: string;
	    createdAt: string;
	    vaultStatus?: string;
	
	    static createFrom(source: any = {}) {
	        return new UserProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.username = source["username"];
	        this.firstName = source["firstName"];
	        this.lastName = source["lastName"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.role = source["role"];
	        this.companyId = source["companyId"];
	        this.companyName = source["companyName"];
	        this.streetAddress = source["streetAddress"];
	        this.city = source["city"];
	        this.state = source["state"];
	        this.zip = source["zip"];
	        this.caf = source["caf"];
	        this.ptin = source["ptin"];
	        this.telephone = source["telephone"];
	        this.fax = source["fax"];
	        this.createdAt = source["createdAt"];
	        this.vaultStatus = source["vaultStatus"];
	    }
	}
	export class UserRegistration {
	    companyName: string;
	    username: string;
	    firstName: string;
	    lastName: string;
	    email: string;
	    phone: string;
	    password: string;
	    confirmPassword: string;
	    role: string;
	    streetAddress: string;
	    city: string;
	    state: string;
	    zip: string;
	    caf: string;
	    ptin: string;
	    telephone: string;
	    fax: string;
	
	    static createFrom(source: any = {}) {
	        return new UserRegistration(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.companyName = source["companyName"];
	        this.username = source["username"];
	        this.firstName = source["firstName"];
	        this.lastName = source["lastName"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.password = source["password"];
	        this.confirmPassword = source["confirmPassword"];
	        this.role = source["role"];
	        this.streetAddress = source["streetAddress"];
	        this.city = source["city"];
	        this.state = source["state"];
	        this.zip = source["zip"];
	        this.caf = source["caf"];
	        this.ptin = source["ptin"];
	        this.telephone = source["telephone"];
	        this.fax = source["fax"];
	    }
	}

}

