
import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

export interface SastXygeniIssueData extends XygeniIssueData {
  branch: string;
  language: string;
  cwe: number;
  cwes: string[];
  container: string;
}


export class SastXygeniIssue extends AbstractXygeniIssue {

  branch: string;
  language: string;
  cwe: number;
  cwes: string[];
  container: string;

  constructor(issue: SastXygeniIssueData) {
      super(issue);
      this.branch = issue.branch;
      this.language = issue.language;
      this.cwe = issue.cwe;
      this.cwes = issue.cwes;
      this.container = issue.container;
  }

  override getSubtitleLineHtml(): string {

    let subtitle = this.categoryName;

    if (this.url) {
      subtitle += ` &nbsp;&nbsp; <a href="${this.url}" target="_blank">${this.type}</a>`;
    }
    else {
      subtitle += ` ${this.type}`;
    }

    if (this.cwes.length > 0) {

      subtitle += ' &nbsp;&nbsp;  ' + this.cwes.map(
        weakness => {
          const wcode = weakness.split('-')[1]; // use the CWE code (CWE-123)
          return `<a href="https://cwe.mitre.org/data/definitions/${wcode}.html" target="_blank">${weakness}</a>`;
        }).join(' &nbsp;&nbsp; ');
    }
    
    return subtitle;
  }

  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
          ${this.field(this.explanation, 'Explanation')}         
          ${this.field(this.type, 'Type')}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
          ${this.field(this.url, 'Fount At')}                  
          ${this.field(this.file, 'Location')}
          ${this.field(this.detector, 'Found By')}
          
          ${this.fieldTags(this.tags)}

                                 
      </table>
                
        <p><span id="xy-detector-doc">Loading...</span></p>
      </div>`;
  }
  getCodeSnippetHtmlTab(): string {
    return `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`;
  }
  

  
}
