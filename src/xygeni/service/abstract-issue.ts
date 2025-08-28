import { Commands, XygeniIssue, XygeniIssueData } from '../common/interfaces';
import { MarkdownParser } from '../common/markdown';


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
  url: string;

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
    this.url = issue.url;
  }

  public showIssueDetails(commands: Commands): void {
    commands.showIssueDetails(this);
  }

  abstract getIssueDetailsHtml(): string;
  abstract getCodeSnippetHtmlTab(): string;
  abstract getFixSnippetHtmlTab(): string;
  abstract getFixSnippetHtml(): string;

  public getSubtitleLineHtml(): string {

    let subtitle = this.categoryName;

    if (this.url) {
      subtitle += ` &nbsp;&nbsp; <a href="${this.url}" target="_blank">${this.type}</a>`;
    }
    else {
      subtitle += ` ${this.type}`;
    }
    return subtitle;
  }

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
            <p>${this.severity ? `<span class="xy-slide-${this.severity}">${this.severity}</span>` : ''}</span> ${this.explanation ? this.explanation.length > 50 ? this.explanation.substring(0, 50) + '...' : this.explanation : this.type}</p>
            <p> ${this.getSubtitleLineHtml()} </p>
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

  public field(value: string | undefined, title: string): string {
    return value ?
      '<tr><th>' + title + '</th>' +
      '<td>' + value + '</td></tr>'
      : '';
  }

  public fieldTags(tags: string[] | undefined): string {
    return tags ?
      '<tr><th>Tags</th>' +
      '<td><div class="xy-container-chip">' + tags.map(tag => `<div class="xy-blue-chip">${this.tagNames(tag)}</div>`).join(' ') + '</div></td></tr>'
      : '';    
  }

  public fieldLinkDoc(url: string | undefined): string {
    return url ?
      '<tr><th></th>' +
      '<td><a href="' + url + '" target="_blank">Link to documentation</a></td></tr></tr>'
      : '';
  }

  public fieldDetails(explanation: string | undefined): string {
    return explanation && explanation.length > 0 ?
      '<tr><th>Details </th>' +
      '<td>' + MarkdownParser.parse(explanation) + '</td></tr>'
      : '';
  }

  private tagNames(tag: string): string {
    const texts: Record<string, string> = {
      "manual_fix": "Manual Fix",
      "potential_reachable": "Potential Reachable",
      "in-app-code": "In-App Code",      
      "generic": "Generic"
    } as const;

    return texts[tag.toLowerCase()] ? texts[tag.toLowerCase()] : tag;
  }

  public getDetectorDetails(doc: any): string {
    return `      
    ${doc.descriptionDoc ? "<p> " + MarkdownParser.parse(doc.descriptionDoc) + "</p>" : ''}
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }

  public where(branch: string, commitHash: string | undefined, user: string | undefined): string {
    let where = '';
    if (branch) {
      where += '<img src="{{iconsPath}}/branch.svg" alt="Branch"></img> ' + branch + ' &nbsp;&nbsp; ';
    }
    if (commitHash) { 
      where += '<img src="{{iconsPath}}/branch.svg" alt="Commit"></i> ' + commitHash + ' &nbsp;&nbsp; ';
    }
    if (user) {
      where += '<img src="{{iconsPath}}/account.svg" alt="User"></img> ' + user ;
    }
    return where;
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
