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
  fixedVersion: string;
  dependencyPaths: string;
  directDependency: string;

  baseScore: number;
  publicationDate: string;
  weakness: string[];
  references: string[];
  versions: string;
  vector: string;
}

export class VulnXygeniIssue extends AbstractXygeniIssue {

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

  baseScore: number;
  publicationDate: string;
  weakness: string[];
  references: string[];
  versions: string;
  vector: string;
  

  constructor(issue: VulnXygeniIssueData) {
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

    this.baseScore = issue.baseScore;
    this.publicationDate = issue.publicationDate;
    this.weakness = issue.weakness? issue.weakness : [];
    this.references = issue.references? issue.references : [];
    this.versions = issue.versions;
    this.vector = issue.vector;
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
                    ${this.field(this.fixedVersion, 'Fixed at')}
                    ${this.field(this.file ? this.file : '', 'File')}
                    ${this.field(this.directDependency, 'Direct Dependency')}
                    ${this.field(this.vector, 'Vector')}
               
                  
                    ${this.fieldTags(this.tags)}  
                    
                    

                  </table>

                  ${this.explanation ? `<p>${MarkdownParser.parse(this.explanation)}</p>` : ''}                       

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
  getFixSnippetHtmlTab(): string {
    if (this.fixedVersion && false) { // TODO: enable when fix is available
      return `<input type="radio" name="tabs" id="tab-3">
    <label for="tab-3">FIX IT</label>`;
    }
    return ``;
  }
  getFixSnippetHtml(): string {
    if (this.fixedVersion) {  // TODO : enable when fix is available
      return `<div id="tab-content-3">
      <p>Fix this version: ${this.group}:${this.name}:${this.version} to ${this.fixedVersion}</p>
      <pre><code class="code language-js">${this.code}</code></pre>
      <pre><code class="code language-js">${this.code?.replace(this.version, this.fixedVersion)}</code></pre>
      <button id="fix-it">FIX IT</button>
    </div>`;
    }
    return ``;
  }

  public fieldReferences(references: string[] | undefined): string {
    return references ?
      '<p>References</p>' +
      references.map(reference => `<p><a href="${reference}" target="_blank">${reference}</a></p>`).join(' ') 
      : '';
  }
  
  
}