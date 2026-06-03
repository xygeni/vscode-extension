import { Commands, ILogger } from '../common/interfaces';

/**
 * Calls the Xygeni backend `GET /license/state` endpoint and exposes the resolved
 * license type so the UI can gate features that are not available in the Free edition
 * (e.g. Auto Scan on Save, which relies on `--incremental` and is rejected by the
 * scanner CLI when the installed license is Free).
 */
const LICENSE_STATE_PATH = '/license/state';
const FREE_LICENSE_TYPE = 'free';

interface DataLicensePlan {
  licenseType?: string;
}

interface LicState {
  dataLicensePlan?: DataLicensePlan;
}

export default class LicenseStateService {

  private static instance: LicenseStateService;

  private licenseType: string | undefined;

  public static getInstance(logger?: ILogger, commands?: Commands): LicenseStateService {
    if (!LicenseStateService.instance) {
      if (logger === undefined || commands === undefined) {
        throw new Error('LicenseStateService requires logger and commands on first instantiation');
      }
      LicenseStateService.instance = new LicenseStateService(logger, commands);
    }
    return LicenseStateService.instance;
  }

  private constructor(
    private readonly logger: ILogger,
    private readonly commands: Commands
  ) { }

  public clear(): void {
    this.licenseType = undefined;
  }

  public getLicenseType(): string | undefined {
    return this.licenseType;
  }

  public isFreeLicense(): boolean {
    return this.licenseType?.toLowerCase() === FREE_LICENSE_TYPE;
  }

  /**
   * Fetch the license state from the backend and cache the resolved license type.
   * Resolves with the license type string (e.g. "free", "enterprise"), or `undefined`
   * if the request fails. Never rejects: callers should treat `undefined` as
   * "unknown — assume non-Free" and gate features accordingly.
   */
  public async refresh(token: string): Promise<string | undefined> {
    const xygeniApiUrl = this.commands.getXygeniUrl();
    if (!xygeniApiUrl) {
      this.licenseType = undefined;
      return undefined;
    }
    const url = `${xygeniApiUrl}${LICENSE_STATE_PATH}`;
    return new Promise<string | undefined>((resolve) => {
      const request = this.commands.getHttpClient(url)
        .setAuthToken(token)
        .get(url, (res) => {
          if (res.statusCode !== 200) {
            this.logger.log(`Error response fetching Xygeni license state: ${res.statusCode}`);
            this.licenseType = undefined;
            res.resume();
            resolve(undefined);
            return;
          }
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              const state = JSON.parse(body) as LicState;
              this.licenseType = state?.dataLicensePlan?.licenseType;
              resolve(this.licenseType);
            } catch (err) {
              this.logger.error(err, 'Error parsing Xygeni license state response');
              this.licenseType = undefined;
              resolve(undefined);
            }
          });
        });
      request.on('error', (error) => {
        this.logger.error(error, 'Error fetching Xygeni license state');
        this.licenseType = undefined;
        resolve(undefined);
      });
    });
  }
}
