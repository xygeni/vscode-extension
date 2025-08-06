
import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';

export interface SecretsXygeniIssueData extends XygeniIssueData {
  hash: string;
  resource: string;
  foundBy: string;
}

export class SecretsXygeniIssue extends AbstractXygeniIssue {

  hash: string;
  resource: string;
  foundBy: string;

  constructor(issue: SecretsXygeniIssueData) {
    super(issue);
    this.hash = issue.hash;
    this.resource = issue.resource;
    this.foundBy = issue.foundBy;
  }


  getIssueDetailsHtml(): string {
    return `      
      <div id="tab-content-1">
      <table>
                  <tr>
                    <th>Resource</th>
                    <td>${this.resource}</td>
                  </tr>
                  <tr>
                    <th>Found by</th>
                    <td>${this.foundBy}</td>
                  </tr>
                  ${this.tags ?
        '<tr><th>Tags</th>' +
        '<td>' + this.tags.join(', ') + '</td></tr>'
        : ''}
                  <tr>
                    <th>Description</th>
                    <td>${this.explanation}</td>
                  </tr>                  
                </table>
                <p>Details:</p>
                <p><span>Loading...</span></p>
      </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    return `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`;
  }
  getCodeSnippetHtml(): string {
    return `    
    <div id="tab-content-2">
    <p class="file">${this.file ? this.file : ''}</p>
    <pre><code class="code language-js">${this.code}</code></pre>
    </div>`;
  }

  getDetectorDetails(doc: any): string {
    return `  
    <p>${doc.descriptionDoc}</p>
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }
}
