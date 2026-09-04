# Workflow file

One file per workflow at `.orc/workflows/<id>.yml`. **The `id:` inside the file
must match the file name without `.yml`** — `id: plan` goes in `plan.yml`.

```yaml
version: 1
id: plan
description: Turn a request into an implementation plan
input:
  required: true
  description: The request to plan, or a summary of the conversation that led here
nodes:
  - id: draft
    type: agent
    provider: claude
    model: sonnet
    prompt: |
      **Request**: $INPUT

      Explore the codebase and write the plan to $ARTIFACTS_DIR/plan.md.
    produces:
      - plan.md

  - id: check
    type: bash
    depends_on: [draft]
    consumes:
      - plan.md
    script: |
      test -s "$ARTIFACTS_DIR/plan.md"
```

## Top level

| Key                 | Required     | Meaning                                                                              |
| ------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `version`           | yes          | Schema version. `1`.                                                                 |
| `id`                | yes          | The file name without `.yml`. Lowercase letters, digits, `-`, `_`.                   |
| `description`       | yes          | One sentence. `orc workflow list` shows it.                                          |
| `input`             | no           | Declares that this workflow takes a text input.                                      |
| `input.required`    | with `input` | `true` refuses to start without an input; `false` accepts a run with or without one. |
| `input.description` | with `input` | What to put in it.                                                                   |
| `nodes`             | yes          | At least one.                                                                        |

Omit `input:` when the workflow takes none; passing an input to such a workflow
is an error. When `input:` is present, both keys are required.

## Nodes

Every node has `id` and `type`. `type` determines which other keys apply.

| Key                      | Applies to  | Meaning                                                                                                                                                                |
| ------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | all         | Unique within the workflow.                                                                                                                                            |
| `type`                   | all         | `bash`, `agent` or `approval`.                                                                                                                                         |
| `depends_on`             | all         | Node ids that must finish first. Nodes whose dependencies are all done run in parallel.                                                                                |
| `produces`               | all         | Artifact file names this node writes into `$ARTIFACTS_DIR`. Checked after the node succeeds; on an `approval` node, the reviewer's response files, checked at approve. |
| `consumes`               | all         | Artifact file names this node needs. Checked before the node starts.                                                                                                   |
| `script`                 | `bash`      | The shell script. Use a `\|` block — an inline `: ` is a YAML parse error.                                                                                             |
| `prompt`                 | `agent`     | The instruction sent to the session that runs this node.                                                                                                               |
| `message`                | `approval`  | The approval request shown to whoever decides. Renders tokens exactly as a `prompt` does.                                                                              |
| `on_reject`              | `approval`  | What runs when the node is rejected — a nested node body (`type: bash` or `type: agent`). Without it, rejecting cancels the run.                                       |
| `provider`               | `agent`     | `claude`, `codex` or `grok`.                                                                                                                                           |
| `model`                  | `agent`     | The provider's model name. Not checked — a wrong value fails at run time.                                                                                              |
| `options`                | `agent`     | Provider-specific options. claude takes `effort` and `max_turns`; codex takes `model_reasoning_effort`; grok takes `reasoning_effort` and `max_turns`.                 |
| `loop`                   | `agent`     | Repeat this node until a completion key says it is done.                                                                                                               |
| `loop.completion_signal` | exactly one | A single line the session must print to end the loop.                                                                                                                  |
| `loop.completion_bash`   | exactly one | A bash script run after each iteration; its exit code ends or continues the loop.                                                                                      |
| `loop.max_iterations`    | with `loop` | Maximum iterations. The node fails if it reaches this.                                                                                                                 |

Artifact names are file names, not paths: lowercase letters, digits, `.`, `-`,
`_`.

### Ending a loop

A `loop:` declares **exactly one** of `completion_signal` and
`completion_bash`. Declaring both, or neither, makes the workflow invalid.

`completion_bash` is a bash script, like a `bash` node's `script`. It runs after
each iteration — never before the first — with `$INPUT` and `$ARTIFACTS_DIR` in
its environment. The **last command's exit code** is the answer:

| Exit | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | Done. The loop ends and the node succeeds.              |
| `1`  | Not yet. The next iteration starts.                     |
| else | The check itself is broken. The node fails immediately. |

That third row is why an ordinary command's failure must not escape the script.
`grep -c` prints `0` and **exits 1** when it counts nothing, so
`n=$(grep -c X f || echo 0)` produces two lines and the `test` after it exits 2
— the check calls itself broken at the moment the work finished. Put the
fallback on the assignment instead, guard what can be absent, and end with the
test:

```bash
test -f "$ARTIFACTS_DIR/tasks.md" || exit 1
n=$(grep -c '^- \[ \]' "$ARTIFACTS_DIR/tasks.md") || n=0
test "$n" -eq 0
```

## Approval nodes

An `approval` node stops the run for a person to decide. When the run reaches
it, the node renders `message` and records the approval request; the run keeps
running whatever does not depend on the gate, then pauses. A paused run exits
with `⚠` and code 0 — it is waiting, not failed.

| To                         | Run                                                 |
| -------------------------- | --------------------------------------------------- |
| See what the run is asking | `orc workflow approvals <run-id> [node-id]`         |
| Approve                    | `orc workflow approve <run-id> <node-id>`           |
| Reject                     | `orc workflow reject <run-id> <node-id> [--reason]` |
| Continue the run           | `orc workflow resume <run-id>`                      |

Approving records the decision only — the run stays paused until it is resumed.
What rejecting does is the node's own declaration:

- Without `on_reject`, rejecting cancels the run, and a cancelled run cannot
  be resumed.
- With `on_reject`, the node keeps the rejection and the run stays paused. The
  next `resume` runs the `on_reject` body and reopens the gate with a freshly
  rendered `message`. Until then the rejection is still open: rejecting again
  replaces the reason, and approving passes the gate without running
  `on_reject`.

`on_reject` holds one node body — the keys a node of that `type` takes, without
`id` or `depends_on`:

```yaml
- id: review-gate
  type: approval
  depends_on: [plan]
  consumes: [plan.md]
  message: |
    Review the plan before the implementation starts.

    $ARTIFACT(plan.md)
  on_reject:
    type: agent
    provider: claude
    model: sonnet
    prompt: |
      $REASON

      Revise plan.md to address the feedback.
```

`$REASON` renders as the text passed to `reject --reason` and is valid only in
an `on_reject` prompt. Referencing it makes `--reason` required — a reject
without one is refused and records nothing. A `type: bash` body is also
accepted; it receives no reason. If the `on_reject` body fails, the node and
the run fail — the next `resume` reopens the gate as if freshly reached.

To put a file in front of the reviewer, declare it in `consumes` and write
`$ARTIFACT(<name>)` in `message`. For the reviewer to answer with a file,
declare the name in `produces` and point at it in `message` — the reviewer
writes the file into the artifacts directory, and `approve` refuses until
every declared file exists:

```yaml
- id: review-gate
  type: approval
  depends_on: [plan]
  consumes: [plan.md]
  produces:
    - review.md
  message: |
    Review the plan, and leave your comments in $ARTIFACTS_DIR/review.md.

    $ARTIFACT(plan.md)
```

Downstream nodes read the response like any other artifact — `consumes` plus
`$ARTIFACT(review.md)`.

## Where a script runs

A `bash` node's `script` and a `loop`'s `completion_bash` both run in the run's
working directory. That directory is a fresh git worktree by default, holding
the committed files and nothing else: whatever `.gitignore` covers is absent
unless `worktree.include` in `.orc/config.yml` lists it or a `post-create` hook
creates it. A step that installs, builds or tests needs one of the two.

## Tokens

Four tokens. Write them exactly as shown — a token is recognised only at a
word boundary. An `approval` node's `message` and an `on_reject` prompt render
them exactly as an `agent` prompt does.

| Token               | In a `bash` script                                                      | In an `agent` prompt                                      |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `$INPUT`            | environment variable holding the run's input (empty when there is none) | replaced with the input text                              |
| `$ARTIFACTS_DIR`    | environment variable holding the run's artifact directory               | replaced with the directory path                          |
| `$ARTIFACT(<name>)` | **nothing** — read the file with `cat "$ARTIFACTS_DIR/<name>"`          | replaced with the file's contents                         |
| `$REASON`           | **nothing** — a bash `on_reject` receives no reason                     | replaced with the reject reason, `on_reject` prompts only |

`$REASON` anywhere outside an `on_reject` prompt makes the workflow invalid.

Name only artifacts the same node declares in `consumes` — any other name makes
the workflow invalid. Inline values under 2,000 characters only; for anything
larger, write `$ARTIFACTS_DIR/<name>` in the prompt and tell the session to read
the file. Injected values are never re-scanned, so an input or an artifact may
safely contain a token's spelling.

An optional `input:` may be absent at run time, and `$INPUT` then renders as
nothing. Put it where the surrounding line still reads when it is empty.

## Rules

- **Declare `depends_on` as well as `consumes`.** Consuming an artifact does
  not put the node after its producer; without `depends_on` it runs too early.
- **Match `id:` to the file name.** A workflow with `id: plan` must be the
  file `plan.yml`, or the loader refuses it.
- **In a bash node, read artifacts with `cat`.** `$ARTIFACT(...)` is agent-only
  and is a shell syntax error there.
- **In a `loop:` node, name the file the prompt must read and append to.** Each
  iteration is a fresh session and nothing else carries over.
- **Let a command decide when completion is a fact.** A count, a status field,
  a passing suite — `completion_bash` reads it directly. Keep
  `completion_signal` for completion only the session can judge.

## Validate

```bash
orc workflow validate <id> --json
```

Fix every entry in `findings` and run it again until `valid` is `true`. Then
compare `nodeCount` against the number of nodes you wrote — a lower count means
your indentation is wrong.
