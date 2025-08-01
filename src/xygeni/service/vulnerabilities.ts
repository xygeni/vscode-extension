import * as vscode from "vscode";
import { getHttpClient } from "../common/https";
import { ConfigManager } from "../config/xygeni-configuration";
import { ILogger } from "../common/interfaces";


export class VulnerabilitiesService {

  private static instance: VulnerabilitiesService;

  public static getInstance(context?: vscode.ExtensionContext, logger?: ILogger): VulnerabilitiesService {
    if (!VulnerabilitiesService.instance) {
      if (logger === undefined) {
        throw new Error('Logger are required');
      }
      if (context === undefined) {
        throw new Error('Extension context are required');
      }
      VulnerabilitiesService.instance = new VulnerabilitiesService(context, logger);
    }
    return VulnerabilitiesService.instance;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: ILogger
  ) { }


  async getVulnerabilities(deps: Map<string, any>, addVulnerabilityFunction: (dep: any, vulnerability: any) => void): Promise<void> {

    this.logger.log("  Retrieving vulnerabilities...");
    const xygeniUrl = ConfigManager.getXygeniUrl();
    if (!xygeniUrl) {
      this.logger.log('Xygeni url not found, skipping vuln retrieve...');
      return;
    }

    // retrieve detector doc
    const url = new URL(`${xygeniUrl}/internal/component/newVulnerabilitiesByComponent`);

    const requestData = {
      gavtComponents: [
        {
          "group": "phpmailer",
          "name": "phpmailer",
          "version": "5.2.28",
          "technology": "php"
        }
      ]
    };

    const client = getHttpClient(url.toString());
    //this.logger.log('Retrieving vulnerabilities...' + JSON.stringify(requestData));
    const token = await ConfigManager.getXygeniToken(this.context);
    if (!token) {
      this.logger.log('   Xygeni token not found, skipping vuln retrieve...');
      return;
    }
    client.setAuthToken(token);
    const req = client.post(url.toString(), JSON.stringify(requestData), (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;

      });
      res.on('end', () => {
        try {
          this.readVulnerabilities(rawData, deps, addVulnerabilityFunction);
        } catch (e) {
          this.logger.error(e, 'Error parsing vulnerabilities');
        }

      });
    }).on('error', (err) => {
      this.logger.error(err, 'Error retrieving vulnerabilities');
    });
  }

  readVulnerabilities(rawData: string, deps: Map<string, any>, addVulnerabilityFunction: (dep: any, vulnerability: any) => void) {
    if (!rawData) {
      this.logger.log('  No vulnerabilities found');
      return [];
    }
    const parsedData = JSON.parse(rawData);

    //this.logger.log('Vulnerabilities parsed: ' + JSON.stringify(parsedData));
    if (!parsedData.componentsByGavt) {
      this.logger.log('  No vulnerabilities found');
      return [];
    }
    const componentsByGavt = parsedData.componentsByGavt;

    for (const gavt in componentsByGavt) {
      if (Object.prototype.hasOwnProperty.call(componentsByGavt, gavt)) {
        const vulns = componentsByGavt[gavt];
        const dependency = deps.get(gavt);
        for (const rawVuln of vulns) {

          const parts = gavt.split(':');
          const vulrawVuln = {
            group: parts[0],
            name: parts[1],
            version: parts[2],
            language: parts[3]
          };

          const vuln = {
            cve: rawVuln.cveidentification,
            severity: rawVuln.xigeniSeverity ? rawVuln.xigeniSeverity : 'info',
            description: rawVuln.description
          };
          addVulnerabilityFunction(dependency, vuln);
        }
      }
    }
  }
}