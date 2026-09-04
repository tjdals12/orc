<p align="center">
  <img src="assets/banner.webp" alt="orc" width="100%">
</p>

<p align="center">
  English | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tjdals12/orc"><img src="https://img.shields.io/npm/v/@tjdals12/orc" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@tjdals12/orc"><img src="https://img.shields.io/npm/dm/@tjdals12/orc" alt="downloads"></a>
  <a href="https://github.com/tjdals12/orc/actions/workflows/ci.yml"><img src="https://github.com/tjdals12/orc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <strong>Stop repeating the same conversation — automate it as a workflow.</strong>
</p>

Work with an AI agent long enough and you start to notice the same loop. For a new feature: nail down the requirements, plan it, build it, check the result. For a bug: read the error, track down the cause, fix it, test it. The work changes, the steps don't.

orc is a workflow engine for AI coding agents: you write that loop down as a YAML workflow, and orc runs it. A workflow is a series of steps, and every step picks its own agent and model, so the right agent lands on the right job. Each step starts in a fresh session, so context never piles up from one step to the next. And every run gets its own isolated git worktree, which means you can have several going at once.

## Contents

- [Supported agents](#supported-agents)
- [Core Concepts](#core-concepts)
  - [What is a workflow](#what-is-a-workflow)
  - [How a workflow runs](#how-a-workflow-runs)
- [Getting Started](#getting-started)
- [Writing a workflow](#writing-a-workflow)
  - [With an agent](#with-an-agent)
  - [By hand](#by-hand)
  - [Listing and validating](#listing-and-validating)
- [Running a workflow](#running-a-workflow)
  - [Ask an agent](#ask-an-agent)
  - [From the CLI](#from-the-cli)
  - [Checking a run](#checking-a-run)
  - [Cancelling and resuming](#cancelling-and-resuming)
  - [Approvals](#approvals)
- [Project structure](#project-structure)
- [Worktrees](#worktrees)
  - [Copying files in](#copying-files-in)
  - [Running scripts](#running-scripts)
- [The agent skill](#the-agent-skill)
- [Commands](#commands)

## Supported agents

The agents orc supports.

| Agent       | `provider` |
| ----------- | ---------- |
| Claude Code | `claude`   |
| Codex       | `codex`    |
| Grok Build  | `grok`     |

## Core Concepts

### What is a workflow

A workflow is a file that describes work you do over and over. It's built from nodes, and each node does one job — handing a prompt to a coding agent, or running a shell script. A node can leave files behind as it works, and those files are artifacts: the only way context travels from one node to the next. An artifact might be something the next node picks up, or just a record you open once the run is done. A workflow can also take an input. Put whatever changes from run to run in there — the bug to fix, the feature to build — and one workflow covers all of them.

### How a workflow runs

When you run a workflow, the dependencies between its nodes form a DAG, and that graph decides what runs when. Nodes follow that order, but any that don't depend on each other run at the same time. Every node has its own context and knows nothing about what came before it, and an agent node starts a fresh session every time, so none of the earlier conversation carries over. Artifacts are how context gets across, and since any node can read and write them, you can keep a summary that builds up as the workflow goes. By default each run gets its own isolated worktree and the nodes work inside it, so several runs can go at once without touching each other. A run can also be sent to the background, so you don't have to wait for it to finish.

## Getting Started

**Node.js 24 or later is required.**

Install orc globally.

```bash
npm install -g @tjdals12/orc
```

Set orc up on your machine. You can run this from any directory.

```bash
orc setup
```

Check which agents you are signed in to.

```bash
orc auth status
```

Sign in to the ones you are not.

```bash
orc auth login claude
orc auth login codex
orc auth login grok
```

If you already have Claude Code, Codex, or Grok Build installed, `claude auth login`, `codex login`, and `grok login` work just as well.

Grok Build is installed separately from orc; see [x.ai/cli](https://x.ai/cli). orc supports Grok `>=1.0.13, <2.0.0`. A newer Grok version may work, but `orc doctor` warns that it may be incompatible.

orc keeps workflows and run history per project. Register the project you want to run workflows in.

```bash
cd your-project
orc project add my-project
```

This creates `.orc/` with a config file and a workflows directory, and installs the agent skill.

Check that it is registered.

```bash
orc project list
```

## Writing a workflow

A workflow is a YAML file under `.orc/workflows/`.

### With an agent

Registering a project installs a skill for your coding agent. The skill covers how orc works and how a workflow file is put together, so you can describe the workflow you want and have the agent write it for you.

```text
Write me a workflow for fixing bugs. It takes the error as input, tracks down the cause, fixes it, then runs the tests to confirm.
```

**Review what the agent writes.** orc passes scripts and prompts straight through and never checks what they do. Make sure the prompt asks for what you meant, and that the script runs nothing destructive.

### By hand

To write one yourself, create a `.yml` file under your project's `.orc/workflows/`. Below is an example (`implement.yml`) that plans a requested feature, implements it, and verifies the result.

```yaml
# Schema version of the workflow file
version: 1
# The workflow's name. Must match the file name (implement.yml)
id: implement
# What this workflow does. Tells the agent what the workflow is for
description: Plan a feature, implement it, and verify the result

# The input this workflow takes. Leave it out if it takes none
input:
  # Whether the input is required
  required: true
  # Tells the agent what input this workflow needs
  description: The feature to implement

nodes:
  # The node's name. Must be unique within the workflow
  - id: plan
    # Node type. agent or bash
    type: agent
    # Which agent to use
    provider: claude
    # Which model to use
    model: sonnet
    # $INPUT is replaced with the input given at run time, $ARTIFACTS_DIR with the artifacts directory
    prompt: |
      $INPUT

      Explore the codebase and write an implementation plan to $ARTIFACTS_DIR/plan.md.
    # Artifacts the node leaves behind
    produces:
      - plan.md

  - id: implement
    type: agent
    provider: claude
    model: sonnet
    # Nodes that have to finish first
    depends_on: [plan]
    # Artifacts the node needs
    consumes:
      - plan.md
    # $ARTIFACT(plan.md) is replaced with the artifact's contents
    prompt: |
      Implement the following plan.

      $ARTIFACT(plan.md)
    produces:
      - summary.md

  - id: verify
    type: bash
    depends_on: [implement]
    # The script to run
    script: |
      pnpm typecheck
      pnpm lint
```

The full schema is documented in [the workflow schema](skills/orc/references/workflow-schema.md).

### Listing and validating

`orc workflow list` shows the workflows in the project.

```text
$ orc workflow list

ID         DESCRIPTION                                                 INPUT     NODES
bugfix     Find the cause of an error, fix it, and confirm with tests  required  3
implement  Plan a feature, implement it, and verify the result         required  3
```

`orc workflow validate` checks that a workflow is written correctly.

```text
$ orc workflow validate implement

✔ implement is valid  ·  3 nodes
```

## Running a workflow

You can run a workflow from the CLI yourself, or ask an agent to. By default a run gets its own isolated worktree, on a branch whose name starts with `orc/<workflow id>` and which forks from the current HEAD. `--branch` and `--base` change those. `--no-worktree` runs in the project directory instead. A run prints its progress until it finishes, and `--detach` sends it to the background.

### Ask an agent

Describe the work and ask for a workflow run. The agent picks the workflow that fits, starts it, watches until it finishes, and tells you how it went.

```text
Use a workflow to add dark mode to the settings page
```

### From the CLI

You can also run a workflow yourself. (Run it from the project root.)

```bash
# Pass the input with --input
orc workflow run implement --input "Add dark mode to the settings page"

# --input takes at most 1,000 characters. For anything longer, use --input-file
orc workflow run implement --input-file ./request.md

# --base and --branch change the worktree branch
orc workflow run implement --input-file ./request.md --base develop --branch feature/dark-mode

# --no-worktree runs in the project directory instead of a worktree
orc workflow run implement --input-file ./request.md --no-worktree

# --detach runs it in the background
orc workflow run implement --input-file ./request.md --detach
```

### Checking a run

Every run is given a unique ID. Use it to check the run's state and what it recorded.

| Command                           | What it shows                                  |
| --------------------------------- | ---------------------------------------------- |
| `orc workflow runs`               | Recent runs                                    |
| `orc workflow status <run-id>`    | The run's current state and each node's result |
| `orc workflow events <run-id>`    | State changes of the run and its nodes         |
| `orc workflow logs <run-id>`      | What the nodes printed                         |
| `orc workflow stream <run-id>`    | State changes and logs together (`-f`: live)   |
| `orc workflow hook-logs <run-id>` | What the worktree hooks printed                |
| `orc workflow approvals <run-id>` | What the run is asking                         |

### Cancelling and resuming

You can cancel a running workflow, and pick a failed one back up.

```bash
# Cancel a running workflow. A cancelled run cannot be resumed
orc workflow cancel <run-id>

# Resume a failed workflow. It keeps the original input and picks up at the nodes that did not finish
orc workflow resume <run-id>
```

### Approvals

Put an `approval` node wherever a person should sign off before the run moves on. When the run reaches one, it leaves an approval request and pauses. In a feature workflow that means reviewing the plan before implementation starts; in a bugfix workflow, checking the cause was correctly diagnosed before any code changes.

```yaml
- id: review-gate
  type: approval
  depends_on: [plan]
  consumes: [plan.md]
  message: |
    Review the plan before the implementation starts.

    $ARTIFACT(plan.md)
```

`message` renders tokens the way an agent prompt does, so `$ARTIFACT(...)` puts the artifact under review right in front of you. A paused run shows up as `paused` in `orc workflow runs`.

```bash
# See what the run is asking
orc workflow approvals <run-id>

# Approve. This records the decision only — continue the run with resume
orc workflow approve <run-id> <node-id>
orc workflow resume <run-id>

# Reject. This cancels the run
orc workflow reject <run-id> <node-id>
```

Declare `on_reject` on the node and rejecting no longer cancels the run — the work you declared runs, and the node asks again. Pass your feedback with `--reason`, and the work picks it up as `$REASON`. `--reason` is optional on its own, and required once the work references `$REASON`. There is no limit on how many rounds this takes: approve and resume to carry on, or cancel the run, whenever you decide. The work is an agent prompt or a script, and [the workflow schema](skills/orc/references/workflow-schema.md#approval-nodes) has the keys it takes.

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

## Project structure

`orc setup` creates the `~/.orc/` directory.

```text
~/.orc/
├── config.yml
├── orc.db
├── setup-stamp.json
└── projects/
    └── <project id>/
        └── <run id>/
            ├── worktree/
            ├── artifacts/
            └── spec/
```

- **config.yml** — Global settings every project inherits. A project's `.orc/config.yml` can override them.
- **orc.db** — The database holding projects, workflow run state, events and logs.
- **setup-stamp.json** — Records orc's installation state and version. `orc setup` writes it and `orc doctor` reads it.
- **projects/** — One directory per run, grouped by project, holding the files and settings that run needs.
- **worktree/** — The worktree the workflow runs in.
- **artifacts/** — Where the nodes' artifacts collect. This is the path `$ARTIFACTS_DIR` points at.
- **spec/** — Copies of the workflow file, the project config and the hooks, taken when the run starts. A run — and a resume — works from these copies, not the originals.

`orc project add` creates an `.orc/` directory in the project.

```text
.orc/
├── config.yml
├── workflows/
│   ├── bugfix.yml
│   ├── implement.yml
│   └── ...
└── hooks/
    ├── install_deps.sh
    ├── cleanup.sh
    └── ...
```

- **config.yml** — Project settings. They override the global ones.
- **workflows/** — The workflow files.
- **hooks/** — Worktree hook scripts. They run when a worktree is created or removed, and `config.yml` names which ones.

Both `config.yml` files are documented in [the config schema](skills/orc/references/config-schema.md).

## Worktrees

Git only checks out committed files into a worktree, so an environment file like `.env` and installed dependencies like `node_modules` are not there. If a workflow needs them, you would have to copy the files in and run the commands yourself.

orc lets you declare which extra files to copy in, and which scripts to run when a worktree is created or removed, so you do not have to touch it on every run.

Worktree settings live under the `worktree` key in the project's `.orc/config.yml`.

```yaml
worktree:
  include:
    - .env
    - .secrets/
  exclude:
    - .secrets/production.key
  hook:
    post-create:
      - setup.sh
    pre-remove:
      - cleanup.sh
```

### Copying files in

List the files to copy into the worktree under `worktree.include`. Committed files are already there, so only gitignored files belong on the list.

`worktree.exclude` drops files from whatever `worktree.include` matched. Put `.secrets/` in `include` and `.secrets/production.key` in `exclude`, and everything under `.secrets/` is copied except `production.key`.

```yaml
worktree:
  include:
    - .env
    - .secrets/
  exclude:
    - .secrets/production.key
```

### Running scripts

To run a script when a worktree is created or removed, register it under `worktree.hook`. The script files themselves go in `.orc/hooks/`.

#### Phase

`worktree.hook` offers three phases. Each one runs at a different point, and in a different place.

| Phase         | When it runs                                                             | Runs in             |
| ------------- | ------------------------------------------------------------------------ | ------------------- |
| `post-create` | After the worktree is created and files are copied, before any node runs | the worktree        |
| `pre-remove`  | Before the worktree is removed                                           | the worktree        |
| `post-remove` | After the worktree is removed                                            | the repository root |

A worktree is not removed when the workflow finishes. It goes away when you clear the run with `orc workflow prune` or `orc project prune`, and that is when the `pre-remove` and `post-remove` hooks run.

If a `post-create` hook fails, the workflow fails without running a single node. A failing `pre-remove` or `post-remove` hook only leaves a warning, and the cleanup finishes either way.

```yaml
worktree:
  hook:
    post-create:
      - setup.sh
    pre-remove:
      - cleanup.sh
```

#### Templates

You can run several workflows at once, but a worktree only separates files. The code still reads the same environment variables and binds the same port, so the runs collide at runtime.

orc renders each script as a Jinja template and passes in details of the run as variables. Filters for reshaping those values come with it.

| Kind     | Name            | What it is                                                                                           |
| -------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| Variable | `repo`          | The repository directory's name                                                                      |
| Variable | `worktree_path` | Absolute path of the worktree                                                                        |
| Variable | `branch`        | The worktree branch                                                                                  |
| Filter   | `sanitize`      | Lowercases the value, turns everything but letters and digits into `-`, and trims `-` from both ends |
| Filter   | `hash_port`     | Turns the value into a single port number between 1024 and 65535                                     |

The branch name differs from run to run, so a port or a name derived from it never collides.

Here is a `post-create` hook. The variables and filters give it a port and a container name that differ on every run.

```bash
# .orc/hooks/setup.sh
npm ci

sed -i.bak "s#PORT=.*#PORT={{ branch | hash_port }}#" .env && rm .env.bak
sed -i.bak "s#DATABASE_URL=.*#DATABASE_URL=postgres://postgres:dev@localhost:{{ ('db-' ~ branch) | hash_port }}/postgres#" .env && rm .env.bak

docker run -d --rm \
  --name {{ repo }}-{{ branch | sanitize }}-postgres \
  -p {{ ('db-' ~ branch) | hash_port }}:5432 \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_PASSWORD=dev \
  postgres:16-alpine
```

A filter returns the same value for the same input, which is how a `pre-remove` hook stops the container the one above started.

```bash
# .orc/hooks/cleanup.sh
docker stop {{ repo }}-{{ branch | sanitize }}-postgres 2>/dev/null || true
```

#### Trying it out

A hook registered under `worktree.hook` can be tried with `orc hook run`. The command creates a throwaway worktree and runs the scripts in it. `--dry-run` renders and prints them without running anything.

```bash
orc hook run post-create
orc hook run post-create --dry-run
```

## The agent skill

orc ships a skill that lets your agent write and run workflows. Registering a project installs it automatically. Pass `--no-skill` to skip it.

If you skipped it, or you updated orc and want the newer skill, install it yourself.

```text
$ orc skill install

✔ Installed the agent skill
  .claude/skills/orc
  .agents/skills/orc
```

`orc doctor` tells you whether the skill is installed and whether it needs updating.

```text
$ orc doctor

Installation
✔ Setup       complete
✔ Config      valid

Providers
✔ claude      signed in
✔ codex       signed in
✔ grok        signed in

Project
✔ Status      registered
✔ Config      valid
✔ Git         ready
✔ Workflows   2
○ Hooks       none yet
⚠ Skill       outdated
              →  orc skill install
```

## Commands

### `orc setup`

Sets orc up on this machine. Run it again after updating orc to bring it up to date.

```text
orc setup
```

### `orc doctor`

Checks whether orc and the current project are ready to run workflows.

```text
orc doctor [options]
```

| Option   | What it does     |
| -------- | ---------------- |
| `--json` | Print it as JSON |

### `orc project add`

Registers a project with orc.

```text
orc project add <name> [options]
```

| Option          | What it does                                |
| --------------- | ------------------------------------------- |
| `--path <path>` | Project path (default: current directory)   |
| `--no-skill`    | Register without installing the agent skill |

### `orc project list`

Lists the projects registered with orc.

```text
orc project list [options]
```

| Option   | What it does       |
| -------- | ------------------ |
| `--json` | Print them as JSON |

### `orc project remove`

Unregisters a project from orc.

```text
orc project remove <name>
```

### `orc project prune`

Deletes every run record and run directory belonging to a project. Leave the name out to clear away only the run directories nothing points at any more.

```text
orc project prune [name] [options]
```

| Option    | What it does                                                    |
| --------- | --------------------------------------------------------------- |
| `--force` | Also delete orphaned directories and unmerged worktree branches |

### `orc workflow list`

Lists the workflows in the project.

```text
orc workflow list [options]
```

| Option   | What it does                                     |
| -------- | ------------------------------------------------ |
| `--json` | Print the workflows and unreadable files as JSON |

### `orc workflow validate`

Checks whether a workflow is written correctly.

```text
orc workflow validate <id> [options]
```

| Option   | What it does                           |
| -------- | -------------------------------------- |
| `--json` | Print the verdict and findings as JSON |

### `orc workflow run`

Runs a workflow.

```text
orc workflow run <id> [options]
```

| Option                | What it does                                                  |
| --------------------- | ------------------------------------------------------------- |
| `--input <text>`      | Text the workflow receives as `$INPUT` (1,000 characters max) |
| `--input-file <path>` | File whose text the workflow receives as `$INPUT`             |
| `--no-worktree`       | Run in the project directory instead of a worktree            |
| `--base <ref>`        | Ref the worktree branch forks from (default: current HEAD)    |
| `--branch <prefix>`   | Worktree branch prefix (default: `orc/<workflow id>`)         |
| `--detach`            | Run in the background and return immediately                  |
| `--json`              | Print the run and its nodes as JSON                           |

### `orc workflow resume`

Continues a stopped workflow run from where it left off.

```text
orc workflow resume <run-id> [options]
```

| Option     | What it does                                 |
| ---------- | -------------------------------------------- |
| `--detach` | Run in the background and return immediately |
| `--json`   | Print the run and its nodes as JSON          |

### `orc workflow approve`

Approves a node awaiting a decision. The run is not resumed.

```text
orc workflow approve <run-id> <node-id> [options]
```

| Option   | What it does               |
| -------- | -------------------------- |
| `--json` | Print the decision as JSON |

### `orc workflow reject`

Rejects a node awaiting a decision. Without `on_reject` on the node this cancels the run; with it, the run stays paused and `resume` runs the `on_reject` body.

```text
orc workflow reject <run-id> <node-id> [options]
```

| Option            | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `--reason <text>` | Text the `on_reject` body receives as `$REASON`. Required when the body references it |
| `--json`          | Print the decision as JSON                                                            |

### `orc workflow approvals`

Shows a run's approval requests.

```text
orc workflow approvals <run-id> [node-id] [options]
```

| Option   | What it does     |
| -------- | ---------------- |
| `--json` | Print it as JSON |

### `orc workflow status`

Shows a run's current state.

```text
orc workflow status <run-id> [options]
```

| Option   | What it does     |
| -------- | ---------------- |
| `--json` | Print it as JSON |

### `orc workflow runs`

Lists recent workflow runs.

```text
orc workflow runs [options]
```

| Option            | What it does                        |
| ----------------- | ----------------------------------- |
| `--all`           | List every project's runs           |
| `--limit <count>` | How many runs to list (default: 10) |
| `--json`          | Print them as JSON                  |

### `orc workflow events`

Shows the state changes of a run and its nodes.

```text
orc workflow events <run-id> [options]
```

| Option   | What it does       |
| -------- | ------------------ |
| `--json` | Print them as JSON |

### `orc workflow logs`

Shows what the nodes printed.

```text
orc workflow logs <run-id> [node-id] [options]
```

| Option   | What it does       |
| -------- | ------------------ |
| `--json` | Print them as JSON |

### `orc workflow hook-logs`

Shows what the worktree hooks printed.

```text
orc workflow hook-logs <run-id> [file] [options]
```

| Option   | What it does       |
| -------- | ------------------ |
| `--json` | Print them as JSON |

### `orc workflow stream`

Shows state changes and logs together.

```text
orc workflow stream <run-id> [options]
```

| Option         | What it does                     |
| -------------- | -------------------------------- |
| `-f, --follow` | Keep printing until the run ends |
| `--json`       | Print it as JSON                 |

### `orc workflow cancel`

Cancels a running or paused workflow. A cancelled run cannot be resumed.

```text
orc workflow cancel <run-id>
```

### `orc workflow prune`

Deletes a workflow run, along with its records, artifacts, worktree and branch.

```text
orc workflow prune <run-id> [options]
```

| Option    | What it does                                      |
| --------- | ------------------------------------------------- |
| `--force` | Force-delete the worktree branch even if unmerged |

### `orc hook run`

Runs the project's worktree hooks in a throwaway worktree. Use it to check a hook without running a workflow.

```text
orc hook run <phase> [options]
```

| Option      | What it does                                         |
| ----------- | ---------------------------------------------------- |
| `--dry-run` | Print the rendered hook scripts without running them |

`<phase>` is one of `post-create`, `pre-remove`, `post-remove`.

### `orc auth login`

Signs in to an agent.

```text
orc auth login <provider>
```

### `orc auth logout`

Signs out of an agent.

```text
orc auth logout <provider>
```

### `orc auth status`

Shows which agents you are signed in to.

```text
orc auth status [options]
```

| Option   | What it does     |
| -------- | ---------------- |
| `--json` | Print it as JSON |

### `orc skill install`

Installs the agent skill into the project. If the skill is already installed, it is brought up to date.

```text
orc skill install [options]
```

| Option          | What it does                              |
| --------------- | ----------------------------------------- |
| `--path <path>` | Project path (default: current directory) |
