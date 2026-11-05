import { SingleLocationXygeniIssue, SingleLocationXygeniIssueData } from './single-location-issue';

/**
 * Code Quality issue (OpenGrep-based quality rules: code smells, complexity,
 * naming, maintainability...). Single-location, auto-remediable via `util rectify --quality`.
 *
 * Feeds the "Code Quality" tree view and the issue detail panel (Issue Details +
 * Code Snippet tabs). See ticket xygeni/xygeni-product-backlog#56.
 */
export interface QualityXygeniIssueData extends SingleLocationXygeniIssueData {
  language: string;
  /** Quality rule family (e.g. style, complexity, maintainability) when provided by the scanner. */
  qualityCategory?: string;
}

export class QualityXygeniIssue extends SingleLocationXygeniIssue {

  language: string;
  qualityCategory?: string;

  constructor(issue: QualityXygeniIssueData) {
    super(issue);
    this.language = issue.language;
    this.qualityCategory = issue.qualityCategory;
  }

  protected getDetailRowsHtml(): string {
    return `
          ${this.fieldText(this.qualityCategory, 'Category')}
          ${this.fieldText(this.language, 'Language')}`;
  }
}
