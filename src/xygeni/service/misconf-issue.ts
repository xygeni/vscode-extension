
import { XygeniIssue } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

export interface MisconfXygeniIssueData extends XygeniIssue {
  type: string;
  tool_kind: string;
}

export class MisconfXygeniIssue extends AbstractXygeniIssue {

  tool_kind: string;

  constructor(issue: MisconfXygeniIssueData) {
    super(issue);
    this.tool_kind = issue.tool_kind;
  }


  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
                  <tr>
                    <th>Type</th>
                    <td>${this.type}</td>
                  </tr>
                  <tr>
                    <th>Tool</th>
                    <td>${this.tool_kind ? this.tool_kind : ''}</td>
                  </tr>
                  ${this.file ?
        '<tr><th>File</th>' +
        '<td>' + this.file + '</td></tr>'
        : ''}
                  ${this.tags ?
        '<tr><th>Tags</th>' +
        '<td>' + this.tags.join(', ') + '</td></tr>'
        : ''}
                  <tr>
                    <th>Description</th>
                    <td>${this.description}</td>
                  </tr>                  
                </table>
                
                <p>Details:</p>
                <p><span>Loading...</span></p>
      </div>`;
  }
  getCodeSnippetHtmlTab(): string {
    if (!this.file || !this.code) {
      return '';
    }
    return `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`;
  }
  getCodeSnippetHtml(): string {
    if (!this.file || !this.code) {
      return '';
    }

    return `
    <div id="tab-content-2">
    <p class="file">${this.file ? this.file : ''}</p>
    <pre><code class="code language-js">${this.code}</code></pre>
    </div>`;
  }

  getDetectorDetails(doc: any): string {
    return `    
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }
}
