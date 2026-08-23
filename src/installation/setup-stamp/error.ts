export class SetupStampError extends Error {}

export class InvalidSetupStampError extends SetupStampError {}

export class NotFoundSetupStampError extends SetupStampError {}

export class OutdatedSetupStampError extends SetupStampError {}

export class NewerSetupStampError extends SetupStampError {}
