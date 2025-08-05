import { Commands, XygeniIssue, XygeniIssueData } from '../common/interfaces';


export abstract class AbstractXygeniIssue implements XygeniIssueData, XygeniIssue {
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
  beginLine?: number;
  endLine?: number;
  beginColumn?: number;
  endColumn?: number;
  code?: string;
  tags?: string[];
  explanation: string;

  constructor(issue: XygeniIssueData) {
    this.id = issue.id;
    this.type = issue.type;
    this.detector = issue.detector;
    this.tool = issue.tool;
    this.kind = issue.kind;
    this.severity = issue.severity;
    this.confidence = issue.confidence;
    this.category = issue.category;
    this.categoryName = issue.categoryName;
    this.file = issue.file;
    this.beginLine = issue.beginLine;
    this.endLine = issue.endLine;
    this.beginColumn = issue.beginColumn;
    this.endColumn = issue.endColumn;
    this.code = issue.code;
    this.tags = issue.tags;
    this.explanation = issue.explanation;
  }

  public showIssueDetails(commands: Commands): void {
    commands.showIssueDetails(this);
  }

  abstract getIssueDetailsHtml(): string;
  abstract getCodeSnippetHtmlTab(): string;
  abstract getCodeSnippetHtml(): string;
  abstract getDetectorDetails(doc: any): string;

  public getWebviewContent(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        {{meta-security-policy}}
        <title>Xygeni Issue Details</title>
        <style nonce="{{nonce}}">{{xygeniStyle}}</style>
      </head>
      <body>
            <h1>Xygeni ${this.categoryName} Issue</h1>
            <p><span class="xy-slide-${this.severity}">${this.severity}</span> ${this.type}</p>
          
            <section class="xy-tabs-section">
            <input type="radio" name="tabs" id="tab-1" checked>
            <label for="tab-1">ISSUE DETAILS</label>
            ${this.getCodeSnippetHtmlTab()}
            
            ${this.getIssueDetailsHtml()}
            ${this.getCodeSnippetHtml()}

            </section>
      </body>
      </html>
    `;
  }

  public getSeverityLevel(): number {
    switch (this.severity) {
      case 'critical':
        return 0;
      case 'high':
        return 1;
      case 'medium':
        return 2;
      case 'low':
        return 3;
      case 'info':
        return 4;
    }
  }

}
