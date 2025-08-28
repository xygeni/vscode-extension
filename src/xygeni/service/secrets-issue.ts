
import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';

export interface SecretsXygeniIssueData extends XygeniIssueData {
  hash: string;
  secret: string;
  branch: string;
  commitHash: string;
  resource: string;
  foundBy: string;
  timeAdded: number;
  user: string;
}

export class SecretsXygeniIssue extends AbstractXygeniIssue {

  hash: string;
  secret: string;
  branch: string;
  commitHash: string;
  resource: string;
  foundBy: string;
  timeAdded: number;
  user: string;

  constructor(issue: SecretsXygeniIssueData) {
    super(issue);
    this.hash = issue.hash;
    this.resource = issue.resource;
    this.foundBy = issue.foundBy;
    this.secret = issue.secret;
    this.branch = issue.branch;
    this.commitHash = issue.commitHash;
    this.timeAdded = issue.timeAdded;
    this.user = issue.user;
  }

  override getSubtitleLineHtml(): string {

    let subtitle = this.categoryName;

    if (this.url) {
      subtitle += ` &nbsp;&nbsp; <a href="${this.url}" target="_blank"> Family: ${this.type}</a>`;
    }
    else {
      subtitle += ` &nbsp;&nbsp; Family: ${this.type}`;
    }
    return subtitle;
  }

  getIssueDetailsHtml(): string {
    return `      
      <div id="tab-content-1">
      <table>
                  ${this.field(this.type, 'Type')}
                  ${this.field(this.secret, 'Secret')}
                  ${this.field(this.where(this.branch, this.commitHash, this.user), 'Where')}
                  ${this.field( this.timeAdded ? new Date(this.timeAdded).toLocaleString() : '' , 'Date')}
                  ${this.field(this.url, 'Location')}
                  ${this.field(this.resource, 'Resource')}
                  ${this.field(this.foundBy, 'Found By')}
                  
                  ${this.fieldTags(this.tags)}

                  ${this.fieldDetails(this.explanation)}

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
  getFixSnippetHtmlTab(): string {
    return ``;
  }
  getFixSnippetHtml(): string {
    return ``;
  }


  getDetectorDetails(doc: any): string {
    return `  
    <p>${doc.descriptionDoc}</p>
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }

  
}
