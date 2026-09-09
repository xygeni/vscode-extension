import { XygeniIssueData } from '../common/interfaces';
import { AbstractXygeniIssue } from './abstract-issue';

/**
 * API Security flaw (missing authentication, BOLA, BFLA, data exposure, JWT/CORS
 * misconfigurations...), emitted by the `apisec` scan into `apisec.<suffix>`.
 *
 * Two shape differences with the SAST-family reports drive this class:
 *  - the findings live under `flaws`, not `vulnerabilities` — the rest of the report is the
 *    discovered API inventory (services / dataObjects), which is NOT a finding stream;
 *  - a flaw may be scoped to a module or a service instead of an endpoint, and in that case it
 *    has no `location` — so it has no file, and inline diagnostics skip it by design.
 *
 * See ticket xygeni/xygeni-product-backlog#1691.
 */
export interface ApisecXygeniIssueData extends XygeniIssueData {
  branch: string;
  /** HTTP method of the affected endpoint, when the flaw is endpoint-scoped. */
  endpointMethod?: string;
  /** Path of the affected endpoint, when the flaw is endpoint-scoped. */
  endpointPath?: string;
  /** Owning module, when the scanner resolved one. */
  moduleName?: string;
  /** Owning service, when the scanner resolved one. */
  serviceName?: string;
  /** OWASP API Top 10 control ids the flaw maps to. */
  owaspApiTop10?: string[];
  /** CWE ids the flaw maps to. */
  cwes?: string[];
  /** Remediation advice from the detector. */
  remediation?: string;
}

export class ApisecXygeniIssue extends AbstractXygeniIssue {

  branch: string;
  endpointMethod?: string;
  endpointPath?: string;
  moduleName?: string;
  serviceName?: string;
  owaspApiTop10?: string[];
  cwes?: string[];
  remediation?: string;

  constructor(issue: ApisecXygeniIssueData) {
    super(issue);
    this.branch = issue.branch;
    this.endpointMethod = issue.endpointMethod;
    this.endpointPath = issue.endpointPath;
    this.moduleName = issue.moduleName;
    this.serviceName = issue.serviceName;
    this.owaspApiTop10 = issue.owaspApiTop10;
    this.cwes = issue.cwes;
    this.remediation = issue.remediation;
  }

  /** `POST /users/v1/login` when endpoint-scoped, otherwise empty. */
  get endpoint(): string | undefined {
    if (!this.endpointPath) { return undefined; }
    return this.endpointMethod ? `${this.endpointMethod} ${this.endpointPath}` : this.endpointPath;
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
          ${this.field(this.endpoint, 'Endpoint')}
          ${this.field(this.moduleName, 'Module')}
          ${this.field(this.serviceName, 'Service')}
          ${this.field(this.owaspApiTop10?.join(', '), 'OWASP API Top 10')}
          ${this.field(this.cwes?.join(', '), 'CWE')}
          ${this.field(this.where(this.branch, undefined, undefined), 'Where')}
          ${this.field(this.file, 'Location')}
          ${this.field(this.detector, 'Found By')}
          ${this.field(this.remediation, 'Remediation')}

          ${this.fieldTags(this.tags)}

      </table>

        <p><span id="xy-detector-doc">Loading...</span></p>
      </div>`;
  }

  getCodeSnippetHtmlTab(): string {
    // Module-/service-scoped flaws have no location, so there is no snippet to show.
    return this.file
      ? `
    <input type="radio" name="tabs" id="tab-2">
    <label for="tab-2">CODE SNIPPET</label>`
      : ``;
  }

  // API flaws are single-location: no taint/code-flow tab.
  getCodeFlowHtmlTab(): string {
    return ``;
  }

  getCodeFlowHtml(): string {
    return ``;
  }
}
