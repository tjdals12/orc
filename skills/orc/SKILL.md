---
name: orc
description: "Runs and writes orc workflows. Use when the user wants work done by
  an orc workflow, asks what a run is doing or wants to cancel or resume it,
  needs to decide a run's approval request, or wants a workflow written or
  fixed. Not for doing the work directly: this skill delegates to the orc CLI."
compatibility: Requires the orc CLI.
metadata:
  version: '4'
---

Each workflow is a file at `.orc/workflows/<id>.yml`. Every run executes in its
own git worktree. Run `orc` from the project root.

**Pick a flow**

- The user wants work done by a workflow → **Run a workflow**
- The user asks what a run is doing, or wants to stop or resume it → **Watch and control a run**
- A run is paused on an approval request → **Handle an approval request**
- The user wants a new workflow, or a change to one → **Write a workflow**
- A command failed because orc is not set up → **When orc is not set up**

## Run a workflow

**Steps**

1. **Pick the workflow**

   ```bash
   orc workflow list --json
   ```

   ```json
   {
     "workflows": [
       {
         "version": 1,
         "id": "plan",
         "description": "Turn a request into an implementation plan",
         "input": {
           "required": true,
           "description": "The request to plan, or a summary of the conversation that led here"
         },
         "nodes": [
           {
             "id": "draft",
             "type": "agent",
             "prompt": "**Request**: $INPUT\n\nExplore the codebase and write the plan to $ARTIFACTS_DIR/plan.md.",
             "provider": "claude",
             "model": "sonnet",
             "produces": ["plan.md"]
           }
         ]
       }
     ],
     "brokenWorkflows": []
   }
   ```

   If the user named a workflow, find it in `workflows`. Otherwise pick by
   `description`. A workflow under `brokenWorkflows` cannot run — `file` names
   it and `message` says why, so go to **Write a workflow** and fix it first.

2. **Prepare the input** — skip when the workflow has no `input`

   `input.description` says what to write; `input.required` says whether the
   run starts without it.

   Write it to a file such as `/tmp/orc-input.md`: the user's request, or your
   summary of the conversation that decided it. Do not ask the user to prepare
   it.

3. **Start the run**

   ```bash
   orc workflow run <id> --input-file <path> --detach --json
   ```

   ```json
   {
     "run": {
       "id": "9f3c1b70-5b2a-4a1e-9b77-0d3c2f5a8e41",
       "project_id": "1c8d4e02-7a55-4f19-8b3d-6e0a91c74b22",
       "workflow_id": "plan",
       "input": "Add dark mode to the settings page",
       "execution_environment_id": "b41a7d63-92e8-4c07-a5f1-2d8b6e30c915",
       "status": "pending",
       "pid": null,
       "started_at": null,
       "finished_at": null,
       "created_at": "2026-08-10T09:12:44.881Z"
     },
     "nodes": [
       {
         "id": "5e2f8a14-0c6b-4d93-8e77-1a4f7b209d3c",
         "workflow_run_id": "9f3c1b70-5b2a-4a1e-9b77-0d3c2f5a8e41",
         "node_id": "draft",
         "position": 0,
         "status": "pending",
         "attempt": 1,
         "message": null,
         "reason": null,
         "started_at": null,
         "finished_at": null
       }
     ]
   }
   ```

   Take `run.id`; the steps below need it. Tell the user the run id.

4. **Follow it in the background**

   ```bash
   orc workflow stream <run-id> -f
   ```

   Run this in the background. It prints events and node output as they happen
   and exits by itself when the run ends. Do not poll.

5. **Report the result**

   ```bash
   orc workflow status <run-id> --json
   ```

   Tell the user `run.status`. When it is `paused`, the run is waiting on an
   approval request — go to **Handle an approval request**. When it is neither
   `succeeded` nor `paused`, name the node whose `status` is `failed` and give
   the reason from the last entry in `events`.

**Guardrails**

- Do not start a run unless you are sure the workflow is the one the user
  meant. When several could fit, or none clearly does, ask the user first.
- When one message asks for two unrelated changes ("add dark mode and also fix
  the login bug"), start a run for each. A run produces one branch, and
  unrelated work sharing a branch cannot be reviewed or merged separately.
- Add `--no-worktree`, `--base <ref>` or `--branch <prefix>` only when the user
  asks for them. By default the run gets its own worktree branched from HEAD.

## Watch and control a run

| To find out             | Run                                           |
| ----------------------- | --------------------------------------------- |
| What happened, in order | `orc workflow events <run-id>`                |
| What a node printed     | `orc workflow logs <run-id> [node-id]`        |
| Both, live              | `orc workflow stream <run-id> -f`             |
| What the hooks printed  | `orc workflow hook-logs <run-id> [file]`      |
| Where a run stands now  | `orc workflow status <run-id>`                |
| What a run is asking    | `orc workflow approvals <run-id> [node-id]`   |
| What has run recently   | `orc workflow runs [--limit <count>] [--all]` |

| To act                                    | Run                                                 |
| ----------------------------------------- | --------------------------------------------------- |
| Stop a run                                | `orc workflow cancel <run-id>`                      |
| Continue a stopped run                    | `orc workflow resume <run-id> [--detach]`           |
| Approve an approval request               | `orc workflow approve <run-id> <node-id>`           |
| Reject an approval request                | `orc workflow reject <run-id> <node-id> [--reason]` |
| Delete a run with its worktree and branch | `orc workflow prune <run-id>`                       |

Add `--json` to any command above except `cancel` and `prune`. `resume` prints
the same document as `run`; `approve` and `reject` print the decision. A
resumed run keeps its original input and re-runs only what did not finish.

## Handle an approval request

A run whose `status` is `paused` is waiting for a person to decide.

```bash
orc workflow approvals <run-id> --json
```

```json
{
  "workflow_run_id": "9f3c1b70-5b2a-4a1e-9b77-0d3c2f5a8e41",
  "approvals": [
    {
      "node_id": "review-gate",
      "status": "awaiting_decision",
      "message": "Review the plan before the implementation starts.\n\n## Dark mode plan\n1. Add a ThemeProvider …",
      "reason": null
    }
  ]
}
```

Show the user every entry whose `status` is `awaiting_decision` — the `message`
in full, not a summary — and stop there. **The decision is the user's.** Never
run `approve` or `reject` on your own judgment; a gate an agent waves through
protects nothing.

When the user has said which way:

```bash
orc workflow approve <run-id> <node-id> --json
orc workflow reject <run-id> <node-id> --reason "<the user's words>" --json
```

Approving records the decision and nothing more — continue the run with
`orc workflow resume <run-id> --detach --json` and follow it as in **Run a
workflow**. What rejecting does is the node's own declaration: without
`on_reject` it cancels the run; with `on_reject` the run stays paused, and the
next `resume` runs the `on_reject` body and reopens the gate — `has_on_reject`
in the decision document says which of the two you are in. When that body's
prompt references `$REASON`, `--reason` is required — a reject without one is
refused and records nothing. An entry whose `status` is `rejected` is a rejection
waiting for `resume`; its `reason` holds what was staged, `approve` still
passes it as it stands, and `reject --reason` replaces the reason.

## Write a workflow

Read [references/workflow-schema.md](references/workflow-schema.md) first — it
has the file shape, the key meanings and the token grammar.

Four whole files sit beside it. Read the one closest to what you are writing.

| Example                                                            | What it shows                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [examples/minimal.yml](examples/minimal.yml)                       | Two bash nodes, no input, running in parallel         |
| [examples/plan-and-implement.yml](examples/plan-and-implement.yml) | An input, an artifact chain, and a node that verifies |
| [examples/loop.yml](examples/loop.yml)                             | A node that repeats until the session says it is done |
| [examples/loop-check.yml](examples/loop-check.yml)                 | A node that repeats until a command says so           |

**Steps**

1. **Decide the nodes with the user**

   Settle what each node does and which of them need an agent. Put
   deterministic work — builds, tests, formatters, git — in `bash` nodes. Where
   a person should look before expensive work starts, put an `approval` node
   between the two — the schema reference has its shape.

   A run's worktree holds committed files only. When a step installs, builds or
   tests, read `.orc/config.yml` — see
   [references/config-schema.md](references/config-schema.md). It must list what
   that step depends on under `worktree.include` or create it in a `post-create`
   hook. Add whichever is missing — write the hook script yourself when the
   project needs one — and tell the user what you changed.

2. **Plan the artifact chain before writing prompts**

   Decide which file each node writes and which node reads it. If a node cannot
   work from its `consumes` files alone, add what it needs to the `produces` of
   the node above.

3. **Write each prompt for the session that receives it**

   An agent prompt is read by a fresh session that knows nothing about orc, this
   workflow, or where in it the node sits. Leave all of that out: no runs, nodes,
   iterations or loops, and no account of why the node is shaped the way it is.
   Give it three things — what to read, what to do, and what to write. A node
   whose loop ends on `completion_signal` takes a fourth: what to print when it
   is done. One that ends on `completion_bash` does not — finishing is not the
   session's to decide, so leave it out of the prompt entirely.

   When the prompt invokes a skill, it names the skill and lets the session load
   it — never copy what the skill says. Supply only what the skill does not:

   - **Overrides.** A skill written for a chat session will ask the user and stop.
     Say what to decide instead.
   - **Constraints the skill cannot know**, such as the project's conventions.
   - **Artifact writes**, named by path.
   - **The completion signal**, phrased as an output rule: "end your message with
     this line on its own when <condition>".

   Read the skill first, and never repeat a step it already performs.

   A prompt that leaked the workflow into the session:

   ```
   You are node 2 of 3 in the plan-and-implement workflow. This node loops up
   to 5 times, so this may be iteration 3. Use the scaffold skill: it says to
   run `scaffold new <id>`, then fill in the template, then …
   ```

   The same node, written for the session:

   ```
   Read $ARTIFACTS_DIR/plan.md and implement the next unfinished item.

   Use the scaffold skill. It asks which template to use — take the one named
   in the plan instead of asking.

   Append what you did to $ARTIFACTS_DIR/progress.md.

   When every item is done, end your message with exactly DONE on its own
   line.
   ```

4. **Write the file**

   Write `.orc/workflows/<id>.yml`. The `id:` key inside must match the file
   name without `.yml`.

   For `model:`, copy a value from another workflow in this project. If there
   is none, ask the user which model to use.

5. **Validate, and fix every finding**

   ```bash
   orc workflow validate <id> --json
   ```

   ```json
   {
     "id": "plan",
     "valid": false,
     "nodeCount": null,
     "findings": ["node \"draft\" references artifact \"plan.md\" which it does not consume"]
   }
   ```

   Fix every entry in `findings` and run it again until `valid` is `true`. Then
   compare `nodeCount` against the number of nodes you wrote — a lower count
   means your indentation is wrong.

6. **Offer to run it**

**Guardrails**

- Do not tell the user a workflow is ready before `valid` is `true`.
- Never guess a model name. `validate` does not check it, so a wrong one fails
  only once the run reaches that node.
- Move values between nodes as artifacts, never by describing them in a later
  prompt.
- In a `loop:` node, name the file the prompt must read and append to. Each
  iteration is a fresh session, so nothing else carries over.
- Decide how the loop ends before writing the prompt. When a command can tell
  that the work is done, use `completion_bash` and leave finishing out of the
  prompt. Never ask a session to read two numbers and compare them — that is
  what `completion_bash` is for.
- Write `completion_bash` against a condition that is false when the node
  starts. A check that already passes ends the loop after one iteration,
  whatever that iteration did.

## When orc is not set up

When a command fails because this machine or this project is not ready:

```bash
orc doctor --json
```

```json
{
  "installation": {
    "setup": {
      "status": "complete"
    },
    "config": {
      "status": "valid"
    },
    "providers": [
      {
        "id": "claude",
        "status": "signed-in",
        "method": "claude.ai",
        "cli": null
      },
      {
        "id": "codex",
        "status": "signed-out",
        "cli": null
      },
      {
        "id": "grok",
        "status": "signed-in",
        "method": "cached credentials",
        "cli": {
          "status": "available"
        }
      }
    ]
  },
  "project": {
    "path": "/Users/me/work/acme",
    "registered": {
      "status": "not-registered"
    },
    "config": null,
    "git": {
      "status": "ready"
    },
    "workflows": {
      "count": 0
    },
    "hooks": null,
    "skill": {
      "status": "not-installed"
    }
  }
}
```

Report the items that are not ready as a short summary — here codex is signed
out, the project is not registered, and the skill is not installed — then tell
the user to run `orc doctor`, which prints the command that fixes each one. A
`null` item means there was nothing to judge, not a failure. A provider's
`cli` value is its local CLI readiness: Grok may report `not-found`,
`check-failed`, `unsupported`, or `may-be-incompatible`; use the doctor output
and its guidance rather than claiming that the provider can run.
