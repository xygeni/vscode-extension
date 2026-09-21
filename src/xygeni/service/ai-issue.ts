import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

/**
 * AI Security finding (OWASP LLM Top 10 / Agentic ASI + red-team vectors), emitted by the
 * `ai` scan into `ai.<suffix>`.
 *
 * The AI report is NOT shaped like the SAST/quality ones: `AIVulnerability` serializes
 * `severityFloor` (its `getSeverity()` is @JsonIgnore), `detectorId`, `description` and `id`,
 * and carries no `kind`/`type` field at all. The mapping in IssuesService is what bridges those
 * names; this class only renders what the report actually provides.
 *
 * See ticket xygeni/xygeni-product-backlog#1692.
 */
export interface AiXygeniIssueData extends XygeniIssueData {
  branch: string;
  /** AI asset kind the finding applies to (e.g. `ai_prompt`, `ai_agent`), when the inventory produced one. */
  assetKind?: string;
  /** Canonical taxonomy tags (OWASP LLM / ASI / AST), already materialized by the scanner. */
  standards?: string[];
  /** Red-team attack vectors (Jailbreaks, PromptInjection, ...). */
  redTeamVectors?: string[];
  /** Free-text remediation advice from the detector, when present. */
  remediationHint?: string;
}

export class AiXygeniIssue extends AbstractXygeniIssue {

  branch: string;
  assetKind?: string;
  standards?: string[];
  redTeamVectors?: string[];
  remediationHint?: string;

  constructor(issue: AiXygeniIssueData) {
    super(issue);
    this.branch = issue.branch;
    this.assetKind = issue.assetKind;
    this.standards = issue.standards;
    this.redTeamVectors = issue.redTeamVectors;
    this.remediationHint = issue.remediationHint;
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
          ${this.field(this.assetKind, 'AI Asset')}
          ${this.field(this.standards?.join(', '), 'Standards')}
          ${this.field(this.redTeamVectors?.join(', '), 'Red Team Vectors')}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
          ${this.field(this.file, 'Location')}
          ${this.field(this.detector, 'Found By')}
          ${this.field(this.remediationHint, 'Remediation')}

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

  // AI findings are single-location: no taint/code-flow tab.
  getCodeFlowHtmlTab(): string {
    return ``;
  }

  getCodeFlowHtml(): string {
    return ``;
  }
}
