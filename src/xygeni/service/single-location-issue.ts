import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

export interface SingleLocationXygeniIssueData extends XygeniIssueData {
  branch: string;
}

/**
 * Base of the single-location findings (Code Quality, API Security, AI Security): one details
 * table, a CODE SNIPPET tab only when the location carries an excerpt, and no code-flow tab.
 * Subclasses only list the rows specific to their scan type, so the details skeleton (and its
 * load-bearing `xy-detector-doc` placeholder, targeted by DetailsView) lives in one place.
 */
export abstract class SingleLocationXygeniIssue extends AbstractXygeniIssue {

  branch: string;

  constructor(issue: SingleLocationXygeniIssueData) {
    super(issue);
    this.branch = issue.branch;
  }

  /** Rows specific to the scan type, rendered between Type and Where. */
  protected abstract getDetailRowsHtml(): string;

  /** Rows rendered after Found By (remediation advice); none by default. */
  protected getTrailingRowsHtml(): string {
    return '';
  }

  getIssueDetailsHtml(): string {
    return `
      <div id="tab-content-1">
      <table>
          ${this.fieldText(this.explanation, 'Explanation')}
          ${this.fieldText(this.type, 'Type')}
          ${this.getDetailRowsHtml()}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
          ${this.fieldText(this.file, 'Location')}
          ${this.fieldText(this.detector, 'Found By')}
          ${this.getTrailingRowsHtml()}

          ${this.fieldTags(this.tags)}

      </table>

        <p><span id="xy-detector-doc">Loading...</span></p>
      </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    // A finding whose location carries no excerpt has nothing to show in the tab.
    return this.code
      ? `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`
      : ``;
  }

  // Single-location findings have no taint/code-flow: no tab and no content.
  getCodeFlowHtmlTab(): string {
    return ``;
  }

  getCodeFlowHtml(): string {
    return ``;
  }
}
