import * as vscode from "vscode";
import { Commands, ILogger } from "../common/interfaces";


export class VulnerabilitiesService {

  private static instance: VulnerabilitiesService;

  public static getInstance(context?: vscode.ExtensionContext, logger?: ILogger, commands?: Commands): VulnerabilitiesService {
    if (!VulnerabilitiesService.instance) {
      if (logger === undefined) {
        throw new Error('Logger are required');
      }
      if (context === undefined) {
        throw new Error('Extension context are required');
      }
      if (commands === undefined) {
        throw new Error('Commands are required');
      }
      VulnerabilitiesService.instance = new VulnerabilitiesService(context, logger, commands);
    }
    return VulnerabilitiesService.instance;
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: ILogger,
    private readonly commands: Commands
  ) { }


  async getVulnerabilities(deps: Map<string, any>, addVulnerabilityFunction: (dep: any, vulnerability: any) => void): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const xygeniUrl = this.commands.getXygeniUrl();
      if (!xygeniUrl) {
        this.logger.log('Xygeni url not found, skipping vuln retrieve...');
        return resolve();
      }

      // retrieve detector doc
      const url = new URL(`${xygeniUrl}/internal/component/newVulnerabilitiesByComponent`);

      const gavtComponents: any = [];
      const requestData = {
        'gavtComponents': []
      };

      deps.forEach((value, key) => {
        if (!value.group || !value.name || !value.version || !value.language) {
          return;
        }
        gavtComponents.push({
          group: value.group,
          name: value.name,
          version: value.version,
          technology: value.language
        });
      });

      requestData['gavtComponents'] = gavtComponents;

      const client = this.commands.getHttpClient(url.toString());
      this.logger.log('  Retrieving vulnerabilities for ' + gavtComponents.length + ' components');
      const token = await this.commands.getToken();
      if (!token) {
        this.logger.log('   Xygeni token not found, skipping vuln retrieve...');
        return resolve();
      }
      client.setAuthToken(token);
      client.post(url.toString(), JSON.stringify(requestData), (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;

        });
        res.on('end', () => {
          try {
            this.readVulnerabilities(rawData, deps, addVulnerabilityFunction);
            resolve();
          } catch (e) {
            this.logger.error(e, 'Error parsing vulnerabilities');
            reject(e);
          }

        });
      }).on('error', (err) => {
        this.logger.error(err, 'Error retrieving vulnerabilities');
        reject(err);
      });
    });
  }

  readVulnerabilities(rawData: string, deps: Map<string, any>, addVulnerabilityFunction: (dep: any, vulnerability: any) => void) {
    if (!rawData) {
      this.logger.log('  No vulnerabilities found');
      return [];
    }
    const parsedData = JSON.parse(rawData);

    if (!parsedData.componentsByGavt) {
      this.logger.log('  No vulnerabilities found');
      return [];
    }

    const componentsByGavt = parsedData.componentsByGavt;

    let countV = 0;
    for (const gavt in componentsByGavt) {
      if (Object.prototype.hasOwnProperty.call(componentsByGavt, gavt)) {
        const vulns = componentsByGavt[gavt];
        const dependency = deps.get(gavt);
        if (!dependency) {
          this.logger.error(new Error('No dependency found for ' + gavt), 'Error retrieving vulnerabilities');
          continue;
        }

        //this.logger.log('  Vulnerabilities found for ' + gavt + ': ' + vulns.length);
        for (const rawVuln of vulns) {

          const vuln = {
            cve: rawVuln.cveidentification,
            severity: rawVuln.xygeniSeverity ? rawVuln.xygeniSeverity : 'info',
            description: rawVuln.description,
            url: rawVuln.url,
            xygeniSeverity: rawVuln.xygeniSeverity,
            baseScore: rawVuln.baseScore,
            publicationDate: rawVuln.publicationDate,
            tags: rawVuln.tags,
            cveidentification: rawVuln.cveidentification,
            weakness: this.readWeakness(rawVuln.weakness)
 };
          addVulnerabilityFunction(dependency, vuln);
          countV++;
        }
      }
    }

    if (countV > 0) {
      this.logger.log('  ' + countV + ' vulnerabilities found');
    }
  }

  readWeakness(rawWeakness: any): string[] {
    if (!rawWeakness) {
      return [];
    }

    if (Array.isArray(rawWeakness)) {
      return rawWeakness.map((weakness: any) => {
        return {
          weaknessId: weakness.weaknessId,
          source: weakness.source,
          type: weakness.type,
          description: weakness.description
        }.description; // return only the description
      });
    }
    return [];
  }
}