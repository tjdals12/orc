import { checkClaudeAuthStatus, signInToClaude, signOutFromClaude } from './claude.js';
import { checkCodexAuthStatus, signInToCodex, signOutFromCodex } from './codex/auth.js';
import { checkCodexCliStatus } from './codex/cli-status.js';
import { checkGrokAuthStatus, signInToGrok, signOutFromGrok } from './grok/auth.js';
import { checkGrokCliStatus } from './grok/cli-status.js';

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

export type ProviderCliStatus =
  | { status: 'available' }
  | { status: 'not-found'; installHint: string }
  | { status: 'check-failed'; checkCommand: string }
  | { status: 'unsupported'; supportedVersionRange: string; updateCommand: string }
  | { status: 'may-be-incompatible'; supportedVersionRange: string };

export type ProviderDoctorStatus = {
  id: string;
  authStatus: ProviderAuthStatus;
  cliStatus: ProviderCliStatus | null;
};

type Provider = {
  id: string;
  checkAuthStatus: () => Promise<ProviderAuthStatus>;
  checkCliStatus: (() => Promise<ProviderCliStatus>) | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInNote: string | null;
};

const PROVIDERS: Provider[] = [
  {
    id: 'claude',
    checkAuthStatus: checkClaudeAuthStatus,
    checkCliStatus: null,
    signIn: signInToClaude,
    signOut: signOutFromClaude,
    signInNote: null,
  },
  {
    id: 'codex',
    checkAuthStatus: checkCodexAuthStatus,
    checkCliStatus: checkCodexCliStatus,
    signIn: signInToCodex,
    signOut: signOutFromCodex,
    signInNote: 'Remote machine? Sign in with your own codex CLI: "codex login --device-auth".',
  },
  {
    id: 'grok',
    checkAuthStatus: checkGrokAuthStatus,
    checkCliStatus: checkGrokCliStatus,
    signIn: signInToGrok,
    signOut: signOutFromGrok,
    signInNote: 'Remote machine? Sign in with your own grok CLI: "grok login --device-auth".',
  },
];

export function listProviderIds(): string[] {
  const ids = PROVIDERS.map((provider) => provider.id);
  return ids;
}

export async function checkProviderAuth(id: string): Promise<ProviderAuth> {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (provider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  const status = await provider.checkAuthStatus();
  const auth = { id: provider.id, status, signInNote: provider.signInNote };
  return auth;
}

export async function checkProviderAuths(): Promise<ProviderAuth[]> {
  const auths = await Promise.all(PROVIDERS.map((provider) => checkProviderAuth(provider.id)));
  return auths;
}

export async function checkProviderDoctorStatuses(): Promise<ProviderDoctorStatus[]> {
  const providerStatuses = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const [authStatus, cliStatus] = await Promise.all([
        provider.checkAuthStatus(),
        provider.checkCliStatus === null ? null : provider.checkCliStatus(),
      ]);
      const providerStatus: ProviderDoctorStatus = {
        id: provider.id,
        authStatus,
        cliStatus,
      };
      return providerStatus;
    }),
  );
  return providerStatuses;
}

export async function signInToProvider(id: string): Promise<ProviderAuth> {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (provider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  await provider.signIn();
  const auth = await checkProviderAuth(id);
  return auth;
}

export async function signOutFromProvider(id: string): Promise<ProviderAuth> {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (provider === undefined) {
    throw new Error(`No provider with id ${id}`);
  }

  await provider.signOut();
  const auth = await checkProviderAuth(id);
  return auth;
}
