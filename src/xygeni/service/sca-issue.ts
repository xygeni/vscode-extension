
import { AbstractXygeniIssue } from './abstract-issue';

export class ScaXygeniIssue extends AbstractXygeniIssue {


  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
                  
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
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }
}
