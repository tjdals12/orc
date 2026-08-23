# Config files

orc reads two config files. The global file loads first, the project file on
top.

## `~/.orc/config.yml`

Written by `orc setup`. Applies to every project on this machine.

```yaml
version: 1

run:
  max_concurrent_nodes: 2
```

| Key                        | Required | Meaning                                                    |
| -------------------------- | -------- | ---------------------------------------------------------- |
| `version`                  | yes      | Schema version. `1`.                                       |
| `run.max_concurrent_nodes` | no       | How many nodes a run may execute at once. Defaults to `2`. |

## `.orc/config.yml`

Written by `orc project add`. Applies to this project only, and any key it sets
wins over the global file.

```yaml
version: 1

run:
  max_concurrent_nodes: 4

worktree:
  include:
    - .env
    - .secrets/
  exclude:
    - .secrets/production.key
  hook:
    post-create:
      - install_deps.sh
    pre-remove:
      - cleanup.sh
```

| Key                         | Required | Meaning                                                                                              |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `version`                   | yes      | Schema version. `1`.                                                                                 |
| `run.max_concurrent_nodes`  | no       | How many nodes a run may execute at once. Overrides the global value; `2` when neither file sets it. |
| `worktree.include`          | no       | Git-ignored files to copy into the worktree.                                                         |
| `worktree.exclude`          | no       | Files to drop from what `include` matched.                                                           |
| `worktree.hook.post-create` | no       | Hook files to run after the worktree is created.                                                     |
| `worktree.hook.pre-remove`  | no       | Hook files to run before the worktree is removed.                                                    |
| `worktree.hook.post-remove` | no       | Hook files to run after the worktree is removed.                                                     |

## What the worktree does not have

A run works in its own worktree, and a worktree holds the committed files and
nothing else. When a node needs something outside that, there are two ways to
put it there.

- **`worktree.include`** — copies it from the project. Use this for secrets and
  local settings, which no command can recreate.
- **A `post-create` hook** — recreates it inside the worktree. Use this for
  installed dependencies and build output, which a command reproduces.

A node that cannot find what it needs is missing one of the two.

### How `include` patterns match

- The candidates are what `git ls-files --others --ignored --exclude-standard`
  lists. Tracked files are already in the worktree.
- Patterns are globs, and they match dotfiles. Write `.env` as it is.
- A directory name covers everything under it: `.secrets/` also matches
  `.secrets/**`.

## Hooks

A hook is a bash script under `.orc/hooks/`, named by `worktree.hook`. Dropping
a file there does not run it. Its contents are passed to `bash -c`, so the file
needs no executable bit.

| Phase         | When                                                                      | Runs in             |
| ------------- | ------------------------------------------------------------------------- | ------------------- |
| `post-create` | After the worktree is created and files are copied, before the run starts | the worktree        |
| `pre-remove`  | Before the worktree is removed                                            | the worktree        |
| `post-remove` | After the worktree is removed                                             | the repository root |

A name is a path relative to `.orc/hooks/` with no leading `/`. Lowercase
letters, digits, `_`, `.` and `-`; join subdirectories with `/`. `.` and `..`
are rejected.

A run fails before it starts when `worktree.hook` names a file that is not
there.

### Hooks are templates

A hook is rendered with Jinja before it runs. It gets three variables.

| Variable        | Value                           |
| --------------- | ------------------------------- |
| `repo`          | The repository directory's name |
| `worktree_path` | Absolute path of the worktree   |
| `branch`        | The branch this run is on       |

And two filters.

| Filter      | What it does                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `sanitize`  | Lowercases the value, turns everything but letters and digits into `-`, and trims `-` from both ends |
| `hash_port` | Turns a value into one port number between 1024 and 65535                                            |

```bash
# .orc/hooks/install_deps.sh
npm ci
PORT={{ branch | hash_port }} docker compose -p {{ branch | sanitize }} up -d
```

`hash_port` gives the same value the same port every time. That is how a
`pre-remove` hook finds what `post-create` started — it renders the same
expression again.

```bash
# .orc/hooks/cleanup.sh
docker compose -p {{ branch | sanitize }} down
```

Rendering fails on a variable that is not defined.

## Check it

```bash
orc hook run post-create --dry-run   # print the rendered scripts only
orc hook run post-create             # run them in a throwaway worktree
orc doctor                           # whether both config files are valid
```
