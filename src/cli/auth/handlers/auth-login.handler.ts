import { checkProviderAuth, signInToProvider } from '#installation/provider/auth.js';

export type AuthLoginResult =
  | { outcome: 'cli-not-found'; providerId: string }
  | { outcome: 'already-signed-in'; providerId: string; method: string }
  | { outcome: 'signed-in'; providerId: string; method: string }
  | { outcome: 'sign-in-failed'; providerId: string };

export class AuthLoginHandler {
  constructor(private readonly _onSignInNote: (note: string) => void) {}

  async execute(args: { providerId: string }): Promise<AuthLoginResult> {
    const auth = await checkProviderAuth(args.providerId);

    if (auth.status.status === 'cli-not-found') {
      const cliNotFound: AuthLoginResult = { outcome: 'cli-not-found', providerId: auth.id };
      return cliNotFound;
    }
    if (auth.status.status === 'signed-in') {
      const alreadySignedIn: AuthLoginResult = {
        outcome: 'already-signed-in',
        providerId: auth.id,
        method: auth.status.method,
      };
      return alreadySignedIn;
    }

    if (auth.signInNote !== null) {
      this._onSignInNote(auth.signInNote);
    }

    const signedInAuth = await signInToProvider(auth.id);
    if (signedInAuth.status.status !== 'signed-in') {
      const signInFailed: AuthLoginResult = {
        outcome: 'sign-in-failed',
        providerId: signedInAuth.id,
      };
      return signInFailed;
    }

    const signedIn: AuthLoginResult = {
      outcome: 'signed-in',
      providerId: signedInAuth.id,
      method: signedInAuth.status.method,
    };
    return signedIn;
  }
}
