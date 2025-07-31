import { XygeniIssue } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

export interface DepsXygeniIssueData extends XygeniIssue {
  virtual: boolean;
  repositoryType: string;
  displayFileName: string;
  group: string,
  name: string,
  version: string,
  dependencyPaths: string,
  directDependency: string
}

export class DepsXygeniIssue extends AbstractXygeniIssue {

  virtual: boolean;
  repositoryType: string;
  displayFileName: string;
  group: string;
  name: string;
  version: string;
  dependencyPaths: string;
  directDependency: string;

  constructor(issue: DepsXygeniIssueData) {
    super(issue);
    this.virtual = issue.virtual;
    this.repositoryType = issue.repositoryType;
    this.displayFileName = issue.displayFileName;
    this.group = issue.group;
    this.name = issue.name;
    this.version = issue.version;
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
                      <td>${this.description}</td>
                    </tr>                  
                  </table>
                 
        </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    return ``;
  }
  getCodeSnippetHtml(): string {
    return ``;
  }

  getDetectorDetails(doc: any): string {
    return `  
      <p>${doc.descriptionDoc}</p>
      <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
      `;
  }
}