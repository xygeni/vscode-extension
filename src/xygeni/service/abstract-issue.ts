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
  beginLine: number;
  endLine: number;
  beginColumn: number;
  endColumn: number;
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
    if (this.category === 'sca') {
      this.beginLine = Math.max(0, issue.beginLine ? issue.beginLine : 0);
      this.endLine = Math.max(0, issue.endLine ? issue.endLine : this.beginLine);;
    }
    else {
      // normalize line numbers to 0-based
      this.beginLine = Math.max(0, issue.beginLine ? issue.beginLine - 1 : 0);
      this.endLine = Math.max(0, issue.endLine ? issue.endLine - 1 : this.beginLine);
    }
    this.beginColumn = Math.max(0, issue.beginColumn ? issue.beginColumn - 1 : 0);
    this.endColumn = Math.max(0, issue.endColumn ? issue.endColumn - 1 : Number.MAX_SAFE_INTEGER);
    this.code = issue.code;
    this.tags = issue.tags;
    this.explanation = issue.explanation;
  }

  public showIssueDetails(commands: Commands): void {
    commands.showIssueDetails(this);
  }

  abstract getIssueDetailsHtml(): string;
  abstract getCodeSnippetHtmlTab(): string;
  abstract getFixSnippetHtmlTab(): string;
  abstract getFixSnippetHtml(): string;
  abstract getDetectorDetails(doc: any): string;

  public getCodeSnippetHtml(): string {
    const codeLines = this.code?.split('\n') || [];
    const codeSnippet = codeLines.map((line, index) => {
      const lineNumber = this.beginLine + index + 1;
      const escapedLine = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `
        <tr>
          <td class="line-number">${lineNumber}</td>
          <td class="code-line">${escapedLine}</td>
        </tr>
      `;
    }).join('');

    return `
      <div id="tab-content-2">
        <p class="file">${this.file ? this.file : ''}</p>
        <table class="code-snippet-table">
          <tbody>
            ${codeSnippet}
          </tbody>
        </table>
      </div>
    `;
  }

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
            ${this.getFixSnippetHtmlTab()}
            
            ${this.getIssueDetailsHtml()}
            ${this.getCodeSnippetHtml()}
            ${this.getFixSnippetHtml()}

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
