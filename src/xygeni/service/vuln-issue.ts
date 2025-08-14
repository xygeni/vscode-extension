import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';

export interface DepsXygeniIssueData extends XygeniIssueData {
  virtual: boolean;
  url: string;
  repositoryType: string;
  displayFileName: string;
  group: string,
  name: string,
  version: string,
  fixedVersion: string,
  dependencyPaths: string,
  directDependency: string
}

export class DepsXygeniIssue extends AbstractXygeniIssue {

  virtual: boolean;
  url: string;
  repositoryType: string;
  displayFileName: string;
  group: string;
  name: string;
  version: string;
  fixedVersion: string;
  dependencyPaths: string;
  directDependency: string;

  constructor(issue: DepsXygeniIssueData) {
    super(issue);
    this.virtual = issue.virtual;
    this.url = issue.url;
    this.repositoryType = issue.repositoryType;
    this.displayFileName = issue.displayFileName;
    this.group = issue.group;
    this.name = issue.name;
    this.version = issue.version;
    this.fixedVersion = issue.fixedVersion;
    this.dependencyPaths = issue.dependencyPaths;
    this.directDependency = issue.directDependency;
  }


  getIssueDetailsHtml(): string {
    return `      
        <div id="tab-content-1">
        <table>
                    <tr>
                      <th>Virtual</th>
                      <td>${this.virtual}</td>
                    </tr>                    
                    <tr>
                      <th>File</th>
                      <td>${this.file ? this.file : ''}</td>
                    </tr>
                    <tr>
                      <th>Dependency</th>
                      <td>${this.displayFileName}</td>
                    </tr>
                    <tr>
                      <th>Direct Dependency</th>
                      <td>${this.directDependency ? this.directDependency : ''}</td>
                    </tr>
                    ${this.tags ?
        '<tr><th>Tags</th>' +
        '<td>' + this.tags.join(', ') + '</td></tr>'
        : ''}
                    <tr>
                      <th>Description</th>
                      <td>${this.explanation}</td>
                    </tr>    
                    ${this.url ?
        '<tr><th></th>' +
        '<td><a href="' + this.url + '" target="_blank">Link to documentation</a></td></tr></tr>'
        : ''}              
                  </table>
                 
        </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    if (this.code) {
      return `<input type="radio" name="tabs" id="tab-2">
        <label for="tab-2">CODE SNIPPET</label>`;
    }
    return ``;
  }
  getFixSnippetHtmlTab(): string {
    if (this.fixedVersion && false) { // TODO: enable when fix is available
      return `<input type="radio" name="tabs" id="tab-3">
    <label for="tab-3">FIX IT</label>`;
    }
    return ``;
  }
  getFixSnippetHtml(): string {
    if (this.fixedVersion && false) {  // TODO : enable when fix is available
      return `<div id="tab-content-3">
      <p>Fix this version: ${this.group}:${this.name}:${this.version} to ${this.fixedVersion}</p>
      <pre><code class="code language-js">${this.code}</code></pre>
      <pre><code class="code language-js">${this.code?.replace(this.version, this.fixedVersion)}</code></pre>
      <button id="fix-it">FIX IT</button>
    </div>`;
    }
    return ``;
  }

  getDetectorDetails(doc: any): string {
    return `  
      <p>${doc.descriptionDoc}</p>
      <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
      `;
  }
}