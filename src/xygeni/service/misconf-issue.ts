
import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';

export interface MisconfXygeniIssueData extends XygeniIssueData {  
  tool_kind: string;
  currentBranch: string;
}

export class MisconfXygeniIssue extends AbstractXygeniIssue {

  tool_kind: string;
  currentBranch: string;

  constructor(issue: MisconfXygeniIssueData) {
    super(issue);
    this.tool_kind = issue.tool_kind;
    this.currentBranch = issue.currentBranch;
  }


  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
        ${this.field(this.explanation, 'Explanation')}                    
        ${this.field(this.where(this.currentBranch, undefined, undefined), 'Where')}
        ${this.field(this.file, 'Location')}
        ${this.field(this.detector, 'Found By')}          
        ${this.field(this.tool_kind, 'Tool')}
      
        ${this.fieldTags(this.tags)}
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
  getFixSnippetHtmlTab(): string {
    return ``;
  }
  getFixSnippetHtml(): string {
    return ``;
  }

  getDetectorDetails(doc: any): string {
    return `    
    <p><a href="${doc.linkDocumentation}" target="_blank">Link to documentation</a></p>
    `;
  }
}
