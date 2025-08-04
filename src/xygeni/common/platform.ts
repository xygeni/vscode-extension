import * as os from 'os';

export class Platform {
  public static get(): string {
    return os.platform();
  }
}