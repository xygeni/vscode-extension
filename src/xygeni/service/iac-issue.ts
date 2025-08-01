
import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssue } from '../common/interfaces';

export interface IacXygeniIssueData extends XygeniIssue {
  resource: string;
  provider: string;
  foundBy: string;
}

export class IacXygeniIssue extends AbstractXygeniIssue {

  resource: string;
  provider: string;
  foundBy: string;

  constructor(issue: IacXygeniIssueData) {
    super(issue);
    this.resource = issue.resource;
    this.provider = issue.provider;
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
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }

}
