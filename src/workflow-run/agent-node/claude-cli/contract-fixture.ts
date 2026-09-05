type ContractFixtureScenario = {
  exitCode: number;
  events: readonly string[];
};

type ClaudeCliContractFixture = {
  cliVersion: string;
  input: {
    format: string;
    message: string;
  };
  outputFormat: string;
  scenarios: Record<string, ContractFixtureScenario>;
};

const streamInputMessage = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: '<prompt>' },
  parent_tool_use_id: null,
  shouldQuery: true,
  origin: { kind: 'human' },
});

// Sanitized JSONL captured from Claude Code 2.1.261 on 2026-09-05 with Haiku only.
// It stays in the rollback-only claude-cli adapter until the production switch.
// This is a temporary transport fixture for the native CLI runner. It is not a
// persisted schema and must be removed after the Claude raw-event parser lands.
export const claudeCliContractFixture = {
  cliVersion: '2.1.261',
  input: {
    format: '--input-format stream-json',
    message: streamInputMessage,
  },
  outputFormat: '--verbose --output-format stream-json',
  scenarios: {
    text: {
      exitCode: 0,
      events: [
        '{"type":"system","subtype":"init","session_id":"<session-id>","model":"claude-haiku-4-5-20251001","permissionMode":"bypassPermissions","claude_code_version":"2.1.261"}',
        '{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","role":"assistant","content":[{"type":"text","text":"First normal line\\nSecond normal line"}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"result","subtype":"success","is_error":false,"result":"First normal line\\nSecond normal line","session_id":"<session-id>","terminal_reason":"completed"}',
      ],
    },
    commandAndFileEdit: {
      exitCode: 0,
      events: [
        '{"type":"system","subtype":"init","session_id":"<session-id>","model":"claude-haiku-4-5-20251001","permissionMode":"bypassPermissions","claude_code_version":"2.1.261"}',
        '{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","role":"assistant","content":[{"type":"tool_use","id":"<tool-use-id>","name":"Bash","input":{"command":"printf COMMAND_FIXTURE","description":"Run printf with COMMAND_FIXTURE"}}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","role":"assistant","content":[{"type":"tool_use","id":"<tool-use-id>","name":"Write","input":{"file_path":"/<temporary-directory>/stage-1-fixture.txt","content":"FILE_FIXTURE\\n"}}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"user","message":{"role":"user","content":[{"tool_use_id":"<tool-use-id>","type":"tool_result","content":"COMMAND_FIXTURE","is_error":false}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"user","message":{"role":"user","content":[{"tool_use_id":"<tool-use-id>","type":"tool_result","content":"File created successfully at: /<temporary-directory>/stage-1-fixture.txt"}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","role":"assistant","content":[{"type":"text","text":"FIXTURE_DONE"}]},"parent_tool_use_id":null,"session_id":"<session-id>"}',
        '{"type":"result","subtype":"success","is_error":false,"result":"FIXTURE_DONE","session_id":"<session-id>","terminal_reason":"completed"}',
      ],
    },
    invalidModel: {
      exitCode: 1,
      events: [
        '{"type":"system","subtype":"init","session_id":"<session-id>","model":"<invalid-model>","permissionMode":"bypassPermissions","claude_code_version":"2.1.261"}',
        '{"type":"assistant","message":{"model":"<synthetic>","role":"assistant","content":[{"type":"text","text":"There is an issue with the selected model (<invalid-model>)."}]},"parent_tool_use_id":null,"session_id":"<session-id>","error":"model_not_found","is_api_error_message":true}',
        '{"type":"result","subtype":"success","is_error":true,"result":"There is an issue with the selected model (<invalid-model>).","session_id":"<session-id>","terminal_reason":"api_error","api_error_status":404}',
      ],
    },
  },
} satisfies ClaudeCliContractFixture;
