import type { ProgressReporter } from '#cli/progress-reporter.js';
import { checkProviderAuths, type ProviderAuthStatus } from '#installation/provider/auth.js';

export type AuthStatusResult = {
  providerAuths: { id: string; status: ProviderAuthStatus }[];
};

export class AuthStatusHandler {
  constructor(private readonly _reporter: ProgressReporter) {}

  async execute(): Promise<AuthStatusResult> {
    this._reporter.start('Checking providers...');
    try {
      const providerAuths = await checkProviderAuths();

      const result: AuthStatusResult = {
        providerAuths: providerAuths.map((providerAuth) => ({
          id: providerAuth.id,
          status: providerAuth.status,
        })),
      };
      return result;
    } finally {
      this._reporter.stop();
    }
  }
}
