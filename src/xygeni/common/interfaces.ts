import { IncomingMessage, ClientRequest } from 'http';
import { ProxySettings } from '../config/xygeni-configuration';


export interface XyContext {
  readonly xyContext: { [key: string]: unknown };
  getKey(key: string): unknown;
  setKey(key: string, value: unknown): Promise<void>;
}


export interface GlobalContext {
  updateGlobalStateValue(key: string, value: unknown): Thenable<void>;
  getGlobalStateValue(key: string): unknown;
  getExtensionPath(): string;
}

export interface ILogger {
  log(message: string): void;
  error(error: Error | unknown, message: string): void;
  showOutput(): void;
}

export interface IOutputChannel {
  appendLine(value: string): void;
  append(value: string): void;
  show(): void;
  clear(): void;
}

export interface EventEmitter {
  emitChange(): void;
}


export interface WorkspaceFiles {
  storeFile(filename: string, content: string): Promise<void>;
  readFile(filename: string): Promise<string>;
  fileExists(filename: string): Promise<boolean>;
  storeGlobalFile(filename: string, content: string): Promise<void>;
  readGlobalFile(filename: string): Promise<string>;
  globalFileExists(filename: string): Promise<boolean>;
  getWsLocalStorage(): string;
}

export interface Commands extends WorkspaceFiles {

  refreshAllViews(): void;
  showIssueDetails(issue: XygeniIssue): void;

  editUrl(): Promise<void>;
  editToken(): Promise<void>;
  getXygeniUrl(): string | undefined
  getToken(): Promise<string | undefined>
  isProxyEnabled(): boolean
  getProxySettings(): ProxySettings

  getHttpClient(url: string): IHttpClient;

  refreshAndInstall(): Promise<unknown>;

  getScans(): ScanResult[];
  getIssues(): XygeniIssue[];
  getIssuesByCategory(category: string): XygeniIssue[];
  getDetectorDoc(url: URL, token: string): Promise<string>

  getXygeniMedia(): XygeniMedia;

  getXygeniCss(): string;

}


export interface ScanResult {
  timestamp: Date;
  status: 'completed' | 'running' | 'failed' | '';
  issuesFound: number | undefined;
  summary: string;
}

export interface IHttpClient {
  get(url: string, callback: (res: IncomingMessage) => void): ClientRequest;
  post(url: string, data: any, callback: (res: IncomingMessage) => void): ClientRequest;
  setAuthToken(token: string): IHttpClient;
}

export interface XygeniMedia {
  getIconPath(iconname: string): string;
  getXygeniCss(): string
}


export interface XygeniIssueData {
  id: string;
  type: string;
  detector: string;
  tool: string;
  kind: 'secret' | 'misconfiguration' | 'iac_flaw' | 'code_vulnerability' | 'sca_vulnerability';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'highest' | 'high' | 'medium' | 'low';
  category: 'secrets' | 'misconf' | 'iac' | 'sast' | 'sca';
  categoryName: 'Secret' | 'Misconfiguration' | 'IaC' | 'SAST' | 'Vulnerability';
  file?: string;
  beginLine: number;
  endLine: number;
  beginColumn: number;
  endColumn: number;
  code?: string;
  tags?: string[];
  explanation: string;
}

export interface XygeniIssue extends XygeniIssueData {
  getSeverityLevel(): number;
  getWebviewContent(): string;
  getIssueDetailsHtml(): string;
  getCodeSnippetHtml(): string;
  getCodeSnippetHtmlTab(): string;
  getDetectorDetails(doc: any): string
}


export interface IssueDoc {
  linkDocumentation: string;
  descriptionDoc: string;
  detectorDoc: DetectorDoc;
}

export interface DetectorDoc {
  id: string;
  title: string;
  severity: string;
  vendor: string;
  family: string;
  resource: string;
  language: string;
  tags: string;
  sections: Section[];
}

export interface Section {
  name: string;
  level: number;
  paragraphs: Paragraph[]
}

export interface Paragraph {
  kind: Kind;
  text: string;
}

export enum Kind {
  doc,
  metadata,
  section,
  text,
  code,
  admonition,
  ul,
  ol
}

