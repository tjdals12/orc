import { checkClaudeAuthStatus, signInToClaude, signOutFromClaude } from './claude.js';
import { checkCodexAuthStatus, signInToCodex, signOutFromCodex } from './codex.js';

export type ProviderAuthStatus =
  | { status: 'signed-in'; method: string }
  | { status: 'signed-out' }
  | { status: 'cli-not-found' }
  | { status: 'check-failed' };

export type ProviderAuth = {
  id: string;
  status: ProviderAuthStatus;
  signInNote: string | null;
};

type AuthProvider = {
  id: string;
  checkAuthStatus: () => Promise<ProviderAuthStatus>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInNote: string | null;
};

const AUTH_PROVIDERS: AuthProvider[] = [
  {
    id: 'claude',
    checkAuthStatus: checkClaudeAuthStatus,
    signIn: signInToClaude,
    signOut: signOutFromClaude,
    signInNote: null,
  },
  {
    id: 'codex',
    checkAuthStatus: checkCodexAuthStatus,
    signIn: signInToCodex,
    signOut: signOutFromCodex,
    signInNote: 'Remote machine? Sign in with your own codex CLI: "codex login --device-auth".',
  },
];

export function listProviderIds(): string[] {
  const ids = AUTH_PROVIDERS.map((authProvider) => authProvider.id);
  return ids;
}

export async function checkProviderAuth(id: string): Promise<ProviderAuth> {
  const authProvider = AUTH_PROVIDERS.find((provider) => provider.id === id);
  if (authProvider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  const status = await authProvider.checkAuthStatus();
  const auth = { id: authProvider.id, status, signInNote: authProvider.signInNote };
  return auth;
}

export async function checkProviderAuths(): Promise<ProviderAuth[]> {
  const auths = await Promise.all(
    AUTH_PROVIDERS.map((authProvider) => checkProviderAuth(authProvider.id)),
  );
  return auths;
}

export async function signInToProvider(id: string): Promise<ProviderAuth> {
  const authProvider = AUTH_PROVIDERS.find((provider) => provider.id === id);
  if (authProvider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  await authProvider.signIn();
  const auth = await checkProviderAuth(id);
  return auth;
}

export async function signOutFromProvider(id: string): Promise<ProviderAuth> {
  const authProvider = AUTH_PROVIDERS.find((provider) => provider.id === id);
  if (authProvider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  await authProvider.signOut();
  const auth = await checkProviderAuth(id);
  return auth;
}
