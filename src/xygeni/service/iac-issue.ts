
import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';

export interface IacXygeniIssueData extends XygeniIssueData {
  resource: string;
  provider: string;
  foundBy: string;
  branch: string;
}

export class IacXygeniIssue extends AbstractXygeniIssue {

  resource: string;
  provider: string;
  foundBy: string;
  branch: string;

  constructor(issue: IacXygeniIssueData) {
    super(issue);
    this.resource = issue.resource;
    this.provider = issue.provider;
    this.foundBy = issue.foundBy;
    this.branch = issue.branch;
  }


  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
                  ${this.field(this.type, 'Type')}               
                  ${this.field(this.provider, 'Provider')}
                  ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
                  ${this.field(this.file, 'Location')}
                  ${this.field(this.resource, 'Resource')}
                  ${this.field(this.detector, 'Found By')}

                  ${this.fieldTags(this.tags)}
                </table>
                
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

  
}
