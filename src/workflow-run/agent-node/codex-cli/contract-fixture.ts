type ContractFixtureScenario = {
  exitCode: number;
  events: readonly string[];
};

type CodexCliContractFixture = {
  cliVersion: string;
  outputFormat: {
    selected: string;
    acceptedButUndocumented: string;
  };
  scenarios: Record<string, ContractFixtureScenario>;
};

const unsupportedModelFailure = JSON.stringify({
  type: 'error',
  status: 400,
  error: {
    type: 'invalid_request_error',
    message:
      "The '<invalid-model>' model is not supported when using Codex with a ChatGPT account.",
  },
});

// Sanitized JSONL captured from codex-cli 0.153.4 on 2026-09-05.
// This is a transport fixture for the future native runner, not a persisted or raw-event schema.
export const codexCliContractFixture = {
  cliVersion: '0.153.4',
  outputFormat: {
    selected: '--json',
    acceptedButUndocumented: '--experimental-json',
  },
  scenarios: {
    text: {
      exitCode: 0,
      events: [
        '{"type":"thread.started","thread_id":"<thread-id>"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"agent_message","text":"CONTRACT_OK"}}',
        '{"type":"turn.completed"}',
      ],
    },
    command: {
      exitCode: 0,
      events: [
        '{"type":"thread.started","thread_id":"<thread-id>"}',
        '{"type":"turn.started"}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"agent_message","text":"I’ll run the requested command once."}}',
        '{"type":"item.started","item":{"id":"<item-id>","type":"command_execution","command":"/bin/zsh -lc \'printf COMMAND_OK\'","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"command_execution","command":"/bin/zsh -lc \'printf COMMAND_OK\'","aggregated_output":"COMMAND_OK","exit_code":0,"status":"completed"}}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"agent_message","text":"COMMAND_DONE"}}',
        '{"type":"turn.completed"}',
      ],
    },
    fileChange: {
      exitCode: 0,
      events: [
        '{"type":"thread.started","thread_id":"<thread-id>"}',
        '{"type":"turn.started"}',
        '{"type":"item.started","item":{"id":"<item-id>","type":"file_change","changes":[{"path":"/<temporary-directory>/stage-1-fixture.txt","kind":"add"}],"status":"in_progress"}}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"file_change","changes":[{"path":"/<temporary-directory>/stage-1-fixture.txt","kind":"add"}],"status":"completed"}}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"agent_message","text":"FILE_DONE"}}',
        '{"type":"turn.completed"}',
      ],
    },
    unsupportedModel: {
      exitCode: 1,
      events: [
        '{"type":"thread.started","thread_id":"<thread-id>"}',
        '{"type":"item.completed","item":{"id":"<item-id>","type":"error","message":"Model metadata for `<invalid-model>` not found. Defaulting to fallback metadata; this can degrade performance and cause issues."}}',
        '{"type":"turn.started"}',
        JSON.stringify({ type: 'error', message: unsupportedModelFailure }),
        JSON.stringify({
          type: 'turn.failed',
          error: { message: unsupportedModelFailure },
        }),
      ],
    },
  },
} satisfies CodexCliContractFixture;
