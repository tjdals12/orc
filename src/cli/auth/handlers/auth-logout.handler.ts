import { checkProviderAuth, signOutFromProvider } from '#installation/provider/auth.js';

type AuthLogoutOutcome = 'cli-not-found' | 'already-signed-out' | 'signed-out' | 'sign-out-failed';

export type AuthLogoutResult = {
  outcome: AuthLogoutOutcome;
  providerId: string;
};

export class AuthLogoutHandler {
  async execute(args: { providerId: string }): Promise<AuthLogoutResult> {
    const auth = await checkProviderAuth(args.providerId);

    if (auth.status.status === 'cli-not-found') {
      const cliNotFound: AuthLogoutResult = { outcome: 'cli-not-found', providerId: auth.id };
      return cliNotFound;
    }
    if (auth.status.status === 'signed-out') {
      const alreadySignedOut: AuthLogoutResult = {
        outcome: 'already-signed-out',
        providerId: auth.id,
      };
      return alreadySignedOut;
    }

    const signedOutAuth = await signOutFromProvider(auth.id);
    if (signedOutAuth.status.status !== 'signed-out') {
      const signOutFailed: AuthLogoutResult = {
        outcome: 'sign-out-failed',
        providerId: signedOutAuth.id,
      };
      return signOutFailed;
    }

    const signedOut: AuthLogoutResult = { outcome: 'signed-out', providerId: signedOutAuth.id };
    return signedOut;
  }
}
