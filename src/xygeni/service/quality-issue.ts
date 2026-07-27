import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

/**
 * Code Quality issue (OpenGrep-based quality rules: code smells, complexity,
 * naming, maintainability...). Modelled after {@link SastXygeniIssue} but simpler:
 * quality findings are single-location (no taint / code-flow) and, for now, are not
 * auto-remediable.
 *
 * Feeds the "Code Quality" tree view and the issue detail panel (Issue Details +
 * Code Snippet tabs). See ticket xygeni/xygeni-product-backlog#56.
 */
export interface QualityXygeniIssueData extends XygeniIssueData {
  branch: string;
  language: string;
  /** Quality rule family (e.g. style, complexity, maintainability) when provided by the scanner. */
  qualityCategory?: string;
}

export class QualityXygeniIssue extends AbstractXygeniIssue {

  branch: string;
  language: string;
  qualityCategory?: string;

  constructor(issue: QualityXygeniIssueData) {
    super(issue);
    this.branch = issue.branch;
    this.language = issue.language;
    this.qualityCategory = issue.qualityCategory;
  }

  override getSubtitleLineHtml(): string {
    let subtitle = this.categoryName;

    if (this.url) {
      subtitle += ` &nbsp;&nbsp; <a href="${this.url}" target="_blank">${this.type}</a>`;
    } else {
      subtitle += ` ${this.type}`;
    }
    return subtitle;
  }

  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
          ${this.field(this.explanation, 'Explanation')}
          ${this.field(this.type, 'Type')}
          ${this.field(this.qualityCategory, 'Category')}
          ${this.field(this.language, 'Language')}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
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

  // Quality findings have no taint/code-flow: no tab and no content.
  getCodeFlowHtmlTab(): string {
    return ``;
  }

  getCodeFlowHtml(): string {
    return ``;
  }
}
