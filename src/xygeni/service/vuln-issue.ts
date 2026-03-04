import { AbstractXygeniIssue } from './abstract-issue';
import { XygeniIssueData } from '../common/interfaces';
import { MarkdownParser } from '../common/markdown';

export interface VulnXygeniIssueData extends XygeniIssueData {
  virtual: boolean;
  url: string;
  repositoryType: string;
  displayFileName: string;
  group: string;
  name: string;
  version: string;
  dependencyPaths: string;
  directDependency: string;

  baseScore: number;
  publicationDate: string;
  weakness: string[];
  references: string[];
  versions: string;
  vector: string;
  remediableLevel: string;
  language: string;
}

export class VulnXygeniIssue extends AbstractXygeniIssue {

  virtual: boolean;
  url: string;
  repositoryType: string;
  displayFileName: string;
  group: string;
  name: string;
  version: string;
  dependencyPaths: string;
  directDependency: string;

  baseScore: number;
  publicationDate: string;
  weakness: string[];
  references: string[];
  versions: string;
  vector: string;
  remediableLevel: string;
  language: string;
  
  constructor(issue: VulnXygeniIssueData) {
    super(issue);
    this.virtual = issue.virtual;
    this.url = issue.url;
    this.repositoryType = issue.repositoryType;
    this.displayFileName = issue.displayFileName;
    this.group = issue.group;
    this.name = issue.name;
    this.version = issue.version;
    this.dependencyPaths = issue.dependencyPaths;
    this.directDependency = issue.directDependency;

    this.baseScore = issue.baseScore;
    this.publicationDate = issue.publicationDate;
    this.weakness = issue.weakness? issue.weakness : [];
    this.references = issue.references? issue.references : [];
    this.versions = issue.versions;
    this.vector = issue.vector;
    this.remediableLevel = issue.remediableLevel;
    this.language = issue.language;
  }

  override getSubtitleLineHtml(): string {

    let subtitle = this.categoryName;

      if(this.url) {
        subtitle +=  ` &nbsp;&nbsp; <a href="${this.url}" target="_blank">${this.type}</a>` ;
      }
      else {
        subtitle += ` ${this.type}`;
      }

      if(this.weakness.length > 0) {

        subtitle += ' &nbsp;&nbsp;  ' + this.weakness.map(
          weakness => {
            const wcode = weakness.split('-')[1]; // use the CWE code (CWE-123)
            return `<a href="https://cwe.mitre.org/data/definitions/${wcode}.html" target="_blank">${weakness}</a>`;
          }).join(' &nbsp;&nbsp; ');
      }

      if(this.baseScore) {
        subtitle += ` &nbsp;&nbsp; Score: <span class="xy-slide-${this.severity}">${this.baseScore}</span> `;
      }
      return subtitle;
  }

  getIssueDetailsHtml(): string {
    
    return `      
        <div id="tab-content-1">
        <table>
                    
                    ${this.field(this.publicationDate, 'Published')}
                    ${this.field(this.group ? this.group + ':' + this.name + ':' + this.version : (this.name + ':' + this.version) , 'Affecting')}
                    ${this.field(this.versions, 'Versions')}
                    ${this.field(this.file ? this.file : '', 'File')}
                    ${this.field(this.directDependency, 'Direct Dependency')}
                    ${this.field(this.vector, 'Vector')}

                    ${this.fieldTags(this.tags)}  
                  

                  </table>

                  ${this.explanation ? `<p>${MarkdownParser.parse(this.explanation)}</p>` : ''}                       

                  <p><span id="xy-detector-doc"></span></p>

                  ${this.url ? `<p><a href="${this.url}" target="_blank">Link to documentation</a></p>` : ''}

                  ${this.fieldReferences(this.references)}

                  

        </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    if (this.code) {
      return `<input type="radio" name="tabs" id="tab-2">
        <label for="tab-2">CODE SNIPPET</label>`;
    }
    return ``;
  }
  getCodeFlowHtmlTab(): string{
    return ``;
  }
  getCodeFlowHtml(): string{
    return ``;
  } 
  

  public fieldReferences(references: string[] | undefined): string {
    return references ?
      '<p>References</p>' +
      references.map(reference => {
        if (reference.startsWith('[')) {
          const mdRef = MarkdownParser.parse(reference); // to html link
          return `<p>${mdRef}</p>`;
        }
        else {
          return `<p><a href="${reference}" target="_blank">${reference}</a></p>`;
        }
      }).join(' ') 
      : '';
  }
}
