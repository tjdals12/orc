<p align="center">
  <img src="assets/banner.webp" alt="orc" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> | 한국어
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@tjdals12/orc"><img src="https://img.shields.io/npm/v/@tjdals12/orc" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@tjdals12/orc"><img src="https://img.shields.io/npm/dm/@tjdals12/orc" alt="downloads"></a>
  <a href="https://github.com/tjdals12/orc/actions/workflows/ci.yml"><img src="https://github.com/tjdals12/orc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <strong>반복적인 대화는 그만, 워크플로우로 자동화하세요.</strong>
</p>

AI 에이전트와 작업을 하다 보면 어느 순간 같은 흐름을 반복하고 있다는 것을 깨닫게 됩니다. 새 기능을 만들 때는 요구사항을 정리하고, 계획을 세우고, 구현하고, 검증합니다. 버그를 고칠 때는 에러를 확인하고, 원인을 파악하고, 수정하고, 테스트합니다. 작업이 달라져도 이런 흐름을 반복합니다.

orc는 이러한 반복적인 흐름을 YAML로 정의해 실행하는, AI 에이전트를 위한 워크플로우 엔진입니다. 워크플로우는 여러 단계로 구성되어, 단계마다 다른 에이전트와 모델을 지정해 작업 성격에 맞는 에이전트를 배치할 수 있습니다. 모든 단계는 새로운 세션에서 시작하므로 단계를 거듭해도 컨텍스트가 쌓이지 않습니다. 워크플로우는 격리된 워크트리에서 실행되기 때문에, 여러 개를 동시에 돌릴 수 있습니다.

## 목차

- [지원 에이전트](#지원-에이전트)
- [핵심 개념](#핵심-개념)
  - [워크플로우](#워크플로우)
  - [실행 방식](#실행-방식)
- [시작하기](#시작하기)
- [워크플로우 작성](#워크플로우-작성)
  - [에이전트와 함께 작성하기](#에이전트와-함께-작성하기)
  - [직접 작성하기](#직접-작성하기)
  - [확인하기](#확인하기)
- [워크플로우 실행](#워크플로우-실행)
  - [에이전트와 함께 실행하기](#에이전트와-함께-실행하기)
  - [직접 실행하기](#직접-실행하기)
  - [확인하기](#확인하기-1)
  - [취소와 재개](#취소와-재개)
  - [승인](#승인)
- [프로젝트 구조](#프로젝트-구조)
- [워크트리](#워크트리)
  - [파일 복사하기](#파일-복사하기)
  - [스크립트 실행하기](#스크립트-실행하기)
- [에이전트 스킬](#에이전트-스킬)
- [명령어](#명령어)

## 지원 에이전트

지원하는 에이전트 목록입니다.

| Agent       | `provider` |
| ----------- | ---------- |
| Claude Code | `claude`   |
| Codex       | `codex`    |

## 핵심 개념

### 워크플로우

워크플로우는 반복되는 작업 흐름을 정의한 파일입니다. 워크플로우는 여러 개의 노드로 이루어지고, 노드 하나가 작업 하나를 맡아 코딩 에이전트에게 프롬프트를 넘기거나 셸 스크립트를 실행합니다. 노드는 작업을 하면서 파일을 남기기도 합니다. 이 파일을 아티팩트라고 하며, 노드 사이에 컨텍스트를 넘기는 유일한 수단입니다. 다음 노드에 넘길 결과물일 수도 있고, 실행이 끝난 뒤 열어 볼 기록일 수도 있습니다. 또한 워크플로우는 실행할 때 입력을 받을 수 있습니다. 고칠 버그의 내용이나 만들 기능의 설명처럼 매번 달라지는 부분을 입력으로 받으면, 워크플로우 하나를 여러 경우에 사용할 수 있습니다.

### 실행 방식

워크플로우를 실행하면 노드 사이의 의존 관계를 파악해 DAG를 만들고, 실행 순서를 결정합니다. 노드는 실행 순서에 따라 순차적으로 실행되지만, 의존 관계가 없는 노드끼리는 동시에 실행됩니다. 노드는 모두 독립적인 컨텍스트를 갖기 때문에, 앞 노드가 무엇을 했는지 알지 못합니다. 특히 에이전트를 사용하는 노드는 항상 새로운 세션에서 시작되기 때문에, 앞 노드에서 오간 대화가 남아 있지 않습니다. 그래서 노드 사이에 컨텍스트를 공유하려면 아티팩트를 사용해야 합니다. 아티팩트는 모든 노드가 사용할 수 있으므로, 노드를 거치며 컨텍스트를 요약해 쌓아 둘 수도 있습니다. 워크플로우는 기본적으로 실행마다 격리된 워크트리를 만들고, 노드는 그 안에서 작업합니다. 각 실행이 자신만의 작업 환경을 갖기 때문에 여러 개를 동시에 돌릴 수 있습니다. 또한 백그라운드 실행을 지원하기 때문에 끝날 때까지 기다리지 않아도 됩니다.

## 시작하기

**Node.js 24 이상이 필요합니다.**

orc를 전역에 설치합니다.

```bash
npm install -g @tjdals12/orc
```

로컬에 orc 설정을 추가합니다. 어느 디렉터리에서 실행해도 됩니다.

```bash
orc setup
```

에이전트 로그인 상태를 확인합니다.

```bash
orc auth status
```

로그인되어 있지 않다면 로그인합니다.

```bash
orc auth login claude
orc auth login codex
```

Claude Code나 Codex가 이미 설치되어 있다면 `claude auth login`, `codex login`으로 로그인해도 됩니다.

orc는 워크플로우와 실행 기록을 프로젝트 단위로 관리합니다. 워크플로우를 실행할 프로젝트를 등록합니다.

```bash
cd your-project
orc project add my-project
```

`.orc/`에 설정 파일과 워크플로우 디렉터리가 만들어지고, 에이전트 스킬이 함께 설치됩니다.

등록된 프로젝트를 확인합니다.

```bash
orc project list
```

## 워크플로우 작성

워크플로우는 `.orc/workflows/` 아래에 YAML 파일로 정의합니다.

### 에이전트와 함께 작성하기

orc에 프로젝트를 등록할 때 에이전트를 위한 스킬이 함께 설치됩니다. 이 스킬을 통해 에이전트는 orc 사용법과 워크플로우 문법을 알 수 있어서, 만들고 싶은 워크플로우를 설명하면 에이전트가 대신 작성해 줍니다.

```text
버그를 고치는 워크플로우를 만들어 줘. 에러 내용을 입력으로 받아서 원인을 찾고, 고친 다음, 테스트를 돌려 확인하는 흐름이야.
```

**에이전트가 작성한 워크플로우를 확인하세요.** orc는 스크립트와 프롬프트를 그대로 전달할 뿐, 무엇을 하는지는 검증하지 않습니다. 프롬프트가 의도한 지시를 담고 있는지, 스크립트에 파괴적인 명령어가 없는지 살펴보세요.

### 직접 작성하기

직접 작성하려면 프로젝트의 `.orc/workflows/` 아래에 `.yml` 파일을 생성합니다. 아래는 요청받은 기능을 계획하고 구현한 뒤 검증하는 예시(`implement.yml`)입니다.

```yaml
# 워크플로우 파일의 스키마 버전
version: 1
# 워크플로우의 이름. 파일 이름과 같아야 합니다 (implement.yml)
id: implement
# 워크플로우에 대한 설명. 에이전트에게 워크플로우에 대해서 설명합니다
description: 요청받은 기능을 계획하고 구현한 뒤 검증합니다

# 워크플로우가 받는 입력. 받지 않는다면 생략합니다
input:
  # 입력 필수 여부
  required: true
  # 입력에 대한 설명. 에이전트에게 어떤 입력이 필요한지 안내합니다
  description: 구현할 기능

nodes:
  # 노드의 이름. 워크플로우 안에서 유일해야 합니다
  - id: plan
    # 노드 종류. agent 또는 bash
    type: agent
    # 사용할 에이전트
    provider: claude
    # 사용할 모델
    model: sonnet
    # $INPUT은 실행할 때 받은 입력으로 교체되고, $ARTIFACTS_DIR는 산출물 디렉터리 경로로 교체됩니다
    prompt: |
      $INPUT

      코드베이스를 살펴보고 구현 계획을 $ARTIFACTS_DIR/plan.md에 적어 주세요.
    # 노드가 남기는 산출물
    produces:
      - plan.md

  - id: implement
    type: agent
    provider: claude
    model: sonnet
    # 먼저 끝나야 하는 노드
    depends_on: [plan]
    # 노드가 필요로 하는 산출물
    consumes:
      - plan.md
    # $ARTIFACT(plan.md)는 산출물의 내용으로 교체됩니다
    prompt: |
      다음 계획대로 구현해 주세요.

      $ARTIFACT(plan.md)
    produces:
      - summary.md

  - id: verify
    type: bash
    depends_on: [implement]
    # 실행할 스크립트
    script: |
      pnpm typecheck
      pnpm lint
```

전체 스키마는 [워크플로우 스키마](skills/orc/references/workflow-schema.md)에 정리되어 있습니다.

### 확인하기

작성한 워크플로우는 `orc workflow list`로 조회합니다.

```text
$ orc workflow list

ID         DESCRIPTION                                    INPUT     NODES
bugfix     에러의 원인을 찾아 고치고 테스트로 확인합니다  required  3
implement  요청받은 기능을 계획하고 구현한 뒤 검증합니다  required  3
```

`orc workflow validate`로 워크플로우가 올바르게 작성되었는지 검증합니다.

```text
$ orc workflow validate implement

✔ implement is valid  ·  3 nodes
```

## 워크플로우 실행

워크플로우는 CLI로 직접 실행할 수도 있고, 에이전트에게 요청할 수도 있습니다. 워크플로우는 기본적으로 격리된 워크트리에서 실행되며, 워크트리의 브랜치 이름은 `orc/<워크플로우 id>`로 시작하고 베이스는 현재 HEAD입니다. 브랜치 이름과 베이스는 `--branch`, `--base` 옵션으로 변경할 수 있습니다. 워크트리 없이 프로젝트 디렉터리에서 실행하려면 `--no-worktree`를 붙입니다. 실행하는 동안 진행 상황을 출력하고, `--detach`를 붙이면 백그라운드에서 실행합니다.

### 에이전트와 함께 실행하기

에이전트에게 작업을 설명하고 워크플로우 실행을 요청하면, 에이전트가 알맞은 워크플로우를 골라 실행하고, 끝날 때까지 상태를 확인해 결과를 알려 줍니다.

```text
워크플로우를 사용해서 설정 페이지에 다크 모드를 추가해 줘
```

### 직접 실행하기

orc CLI의 명령어를 통해 워크플로우를 직접 실행할 수 있습니다. (프로젝트 루트에서 실행해야 합니다.)

```bash
# 입력은 --input으로 전달합니다
orc workflow run implement --input "설정 페이지에 다크 모드를 추가한다"

# --input은 최대 1,000자까지만 입력할 수 있습니다. 입력이 크다면 --input-file을 사용하세요
orc workflow run implement --input-file ./request.md

# --base, --branch로 워크트리 브랜치를 변경합니다
orc workflow run implement --input-file ./request.md --base develop --branch feature/dark-mode

# --no-worktree로 워크트리 없이 프로젝트 디렉터리에서 실행합니다
orc workflow run implement --input-file ./request.md --no-worktree

# --detach로 백그라운드에서 실행합니다
orc workflow run implement --input-file ./request.md --detach
```

### 확인하기

워크플로우를 실행하면 실행마다 고유한 ID가 부여됩니다. 이 ID로 실행 상태와 기록을 확인할 수 있습니다.

| 명령                              | 설명                                   |
| --------------------------------- | -------------------------------------- |
| `orc workflow runs`               | 최근 실행 목록                         |
| `orc workflow status <run-id>`    | 실행의 현재 상태와 노드별 결과         |
| `orc workflow events <run-id>`    | 실행과 노드의 상태 변화                |
| `orc workflow logs <run-id>`      | 노드가 출력한 내용                     |
| `orc workflow stream <run-id>`    | 상태 변화와 로그를 함께 (`-f`: 실시간) |
| `orc workflow hook-logs <run-id>` | 워크트리 훅이 출력한 내용              |
| `orc workflow approvals <run-id>` | 실행이 무엇을 묻고 있는지              |

### 취소와 재개

실행 중인 워크플로우는 중단할 수 있고, 실패한 워크플로우는 이어서 다시 실행할 수 있습니다.

```bash
# 실행 중인 워크플로우를 중단합니다. 중단한 워크플로우는 재개할 수 없습니다
orc workflow cancel <run-id>

# 실패한 워크플로우를 이어서 실행합니다. 원래 입력을 그대로 쓰고, 끝나지 않은 노드부터 다시 시작합니다
orc workflow resume <run-id>
```

### 승인

사람이 확인한 뒤에 다음 단계로 가야 하는 지점에는 `approval` 노드를 배치합니다. 해당 노드에 도착하면 검토 요청을 남기고 워크플로우 실행을 멈춥니다. 기능 개발 워크플로우라면 구현 전에 계획을 검토하고, 버그 수정 워크플로우라면 코드를 고치기 전에 원인을 제대로 파악했는지 확인하는 용도로 사용할 수 있습니다.

```yaml
- id: review-gate
  type: approval
  depends_on: [plan]
  consumes: [plan.md]
  message: |
    구현을 시작하기 전에 계획을 검토해 주세요.

    $ARTIFACT(plan.md)
```

`message`는 에이전트 프롬프트와 같은 방식으로 토큰을 렌더하므로, 검토할 산출물을 `$ARTIFACT(...)`로 그 자리에 띄울 수 있습니다. 멈춘 실행은 `orc workflow runs`에 `paused`로 보입니다.

```bash
# 실행이 무엇을 묻고 있는지 확인합니다
orc workflow approvals <run-id>

# 승인합니다. 결정만 기록하므로, 이어서 실행하려면 resume을 실행합니다
orc workflow approve <run-id> <node-id>
orc workflow resume <run-id>

# 거부합니다. 실행이 취소됩니다
orc workflow reject <run-id> <node-id>
```

거부가 실행을 취소하지 않고 특정 작업과 함께 승인 과정을 반복하게 하려면 노드에 `on_reject`를 선언합니다. 사용자의 입력은 `--reason`으로 전달할 수 있고, 작업에서는 `$REASON`으로 참조합니다. `--reason`은 기본적으로 생략할 수 있지만, 작업에서 `$REASON`을 참조한다면 반드시 전달해야 합니다. 반복 횟수는 제한이 없고, 원할 때 승인해서 실행을 이어가거나(`approve` → `resume`) 실행을 취소할 수 있습니다(`cancel`). 작업은 에이전트에게 요청하거나 스크립트를 실행할 수 있습니다 — [워크플로우 스키마](skills/orc/references/workflow-schema.md#approval-nodes)를 참고하세요.

```yaml
- id: review-gate
  type: approval
  depends_on: [plan]
  consumes: [plan.md]
  message: |
    구현을 시작하기 전에 계획을 검토해 주세요.

    $ARTIFACT(plan.md)
  on_reject:
    type: agent
    provider: claude
    model: sonnet
    prompt: |
      $REASON

      거부 사유를 반영해 plan.md를 수정해 주세요.
```

## 프로젝트 구조

`orc setup`을 실행하면 `~/.orc/` 디렉터리가 만들어집니다.

```text
~/.orc/
├── config.yml
├── orc.db
├── setup-stamp.json
└── projects/
    └── <프로젝트 id>/
        └── <실행 id>/
            ├── worktree/
            ├── artifacts/
            └── spec/
```

- **config.yml** — 모든 프로젝트가 상속하는 글로벌 설정입니다. 프로젝트의 `.orc/config.yml`에서 덮어쓸 수 있습니다.
- **orc.db** — 프로젝트와 워크플로우 실행 상태, 이벤트와 로그를 저장하는 데이터베이스입니다.
- **setup-stamp.json** — orc의 설치 상태와 버전을 기록합니다. `orc setup`이 기록하고 `orc doctor`가 확인합니다.
- **projects/** — 프로젝트별로 각 워크플로우 실행에 필요한 파일과 설정을 디렉터리 단위로 관리합니다.
- **worktree/** — 워크플로우가 실행되는 워크트리입니다.
- **artifacts/** — 노드가 남긴 산출물이 쌓입니다. `$ARTIFACTS_DIR`가 가리키는 경로입니다.
- **spec/** — 워크플로우를 실행할 때 복사한 워크플로우 파일과 프로젝트 설정, 훅입니다. 워크플로우 실행/재개는 원본이 아니라 이 복사본을 사용합니다.

`orc project add`로 프로젝트를 등록하면 프로젝트에 `.orc/` 디렉터리가 만들어집니다.

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

- **config.yml** — 프로젝트 설정입니다. 글로벌 설정을 덮어쓸 수 있습니다.
- **workflows/** — 워크플로우 파일이 위치합니다.
- **hooks/** — 워크트리 훅 스크립트가 위치합니다. 워크트리를 생성하거나 삭제할 때 실행되며, `config.yml`에서 사용합니다.

두 `config.yml`의 전체 스키마는 [설정 파일](skills/orc/references/config-schema.md)에 정리되어 있습니다.

## 워크트리

Git은 워크트리를 만들 때 커밋된 파일만 가져갑니다. `.env` 같은 환경 변수 파일이나 설치된 의존성(`node_modules`)은 기본적으로 워크트리에 없습니다. 워크플로우에서 이런 파일들이 필요하면 직접 복사하거나 워크트리에서 직접 명령어를 실행해야 합니다.

orc는 워크트리에 추가적으로 복사할 파일과 워크트리 생성/삭제 시 실행할 스크립트를 설정할 수 있어서, 워크플로우를 실행할 때마다 직접 손댈 필요가 없습니다.

워크트리 설정은 프로젝트의 `.orc/config.yml`에서 `worktree` 키로 관리합니다.

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

### 파일 복사하기

워크트리에 복사할 파일은 `worktree.include`에 추가합니다. 커밋된 파일은 이미 워크트리에 있기 때문에 `.gitignore`에 걸린 파일만 추가합니다.

`worktree.exclude`는 `worktree.include`에 포함된 파일 중에 제외할 파일을 추가합니다. 예를 들면 `worktree.include`에 `.secrets/`를, `worktree.exclude`에 `.secrets/production.key`를 추가하면 `production.key`만 제외하고 전부 복사합니다.

```yaml
worktree:
  include:
    - .env
    - .secrets/
  exclude:
    - .secrets/production.key
```

### 스크립트 실행하기

워크트리를 생성하거나 삭제할 때 스크립트를 실행하려면 `worktree.hook`에 추가합니다. 스크립트 파일은 `.orc/hooks/`에 작성합니다.

#### Phase

`worktree.hook`은 세 가지 phase를 제공합니다. 각 phase는 실행 시점과 실행 위치가 다릅니다.

| phase         | 실행 시점                                          | 실행 위치   |
| ------------- | -------------------------------------------------- | ----------- |
| `post-create` | 워크트리를 생성하고 파일을 복사한 뒤, 노드 실행 전 | 워크트리    |
| `pre-remove`  | 워크트리를 삭제하기 전                             | 워크트리    |
| `post-remove` | 워크트리를 삭제한 뒤                               | 저장소 루트 |

워크트리는 워크플로우가 종료되어도 자동으로 삭제되지 않습니다. `orc workflow prune`이나 `orc project prune`으로 워크플로우 실행을 정리할 때 워크트리를 삭제하고, 이때 `pre-remove`와 `post-remove` 훅이 실행됩니다.

`post-create` 훅이 실패하면 워크플로우는 노드를 하나도 실행하지 않고 실패합니다. `pre-remove`와 `post-remove` 훅은 실패해도 경고만 남기고 정리를 마칩니다.

```yaml
worktree:
  hook:
    post-create:
      - setup.sh
    pre-remove:
      - cleanup.sh
```

#### 템플릿

워크플로우는 여러 개를 동시에 실행할 수 있지만, 워크트리로 분리되는 것은 파일뿐입니다. 코드는 같은 환경 변수를 읽고 같은 포트를 사용하기 때문에 런타임에는 여전히 충돌이 발생합니다.

orc는 스크립트를 Jinja 템플릿으로 렌더하고, 실행 정보를 변수로 전달합니다. 변수를 가공하는 필터도 함께 제공합니다.

| 구분 | 이름            | 설명                                                                                   |
| ---- | --------------- | -------------------------------------------------------------------------------------- |
| 변수 | `repo`          | 저장소 디렉터리 이름                                                                   |
| 변수 | `worktree_path` | 워크트리의 절대 경로                                                                   |
| 변수 | `branch`        | 워크트리 브랜치 이름                                                                   |
| 필터 | `sanitize`      | 값을 소문자로 바꾸고 영문자와 숫자가 아닌 문자를 `-`로 바꾼 뒤 앞뒤의 `-`를 제거합니다 |
| 필터 | `hash_port`     | 값을 1024에서 65535 사이의 포트 번호 하나로 바꿉니다                                   |

브랜치 이름은 워크플로우 실행마다 다르기 때문에, 이 값으로 포트나 이름을 만들면 겹치지 않습니다.

예를 들면 `post-create` 훅을 아래와 같이 작성할 수 있습니다. 템플릿 변수와 필터로 포트와 컨테이너 이름을 워크플로우 실행마다 다르게 만듭니다.

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

필터는 입력이 같으면 항상 같은 값을 반환합니다. 그래서 `pre-remove` 훅에서 위에서 띄운 컨테이너를 종료할 수 있습니다.

```bash
# .orc/hooks/cleanup.sh
docker stop {{ repo }}-{{ branch | sanitize }}-postgres 2>/dev/null || true
```

#### 확인하기

`worktree.hook`에 등록한 훅은 `orc hook run`으로 실행해 볼 수 있습니다. 이 명령어는 임시 워크트리를 만들어 스크립트를 실행합니다. `--dry-run`은 스크립트를 렌더해서 출력하고 실행은 하지 않습니다.

```bash
orc hook run post-create
orc hook run post-create --dry-run
```

## 에이전트 스킬

orc는 에이전트가 워크플로우를 작성하고 실행할 수 있도록 스킬을 제공합니다. 프로젝트 등록 시 이 스킬을 자동으로 설치합니다. 스킬을 설치하고 싶지 않다면 `--no-skill` 옵션을 사용하세요.

설치를 건너뛰었거나, orc를 업데이트한 뒤 스킬을 갱신할 때는 아래의 명령어를 사용합니다.

```text
$ orc skill install

✔ Installed the agent skill
  .claude/skills/orc
  .agents/skills/orc
```

스킬이 설치되었는지, 업데이트가 필요한지는 `orc doctor` 명령어로 확인할 수 있습니다.

```text
$ orc doctor

Installation
✔ Setup       complete
✔ Config      valid

Providers
✔ claude      signed in
✔ codex       signed in

Project
✔ Status      registered
✔ Config      valid
✔ Git         ready
✔ Workflows   2
○ Hooks       none yet
⚠ Skill       outdated
              →  orc skill install
```

## 명령어

### `orc setup`

로컬에 orc 설정을 추가합니다. orc를 업데이트한 뒤 다시 실행하면 최신 상태로 갱신합니다.

```text
orc setup
```

### `orc doctor`

orc와 현재 프로젝트가 워크플로우를 실행할 준비가 되었는지 확인합니다.

```text
orc doctor [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc project add`

orc에 프로젝트를 등록합니다.

```text
orc project add <name> [options]
```

| 옵션            | 설명                                     |
| --------------- | ---------------------------------------- |
| `--path <path>` | 프로젝트 경로 (기본: 현재 디렉터리)      |
| `--no-skill`    | 에이전트 스킬을 설치하지 않고 등록합니다 |

### `orc project list`

orc에 등록된 프로젝트를 조회합니다.

```text
orc project list [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc project remove`

orc에서 프로젝트를 삭제합니다.

```text
orc project remove <name>
```

### `orc project prune`

프로젝트의 워크플로우 실행 기록과 디렉터리를 모두 삭제합니다. 이름을 생략하면 정리되지 않고 남아있던 디렉터리만 삭제합니다.

```text
orc project prune [name] [options]
```

| 옵션      | 설명                                                        |
| --------- | ----------------------------------------------------------- |
| `--force` | 기록에 없는 디렉터리와 병합되지 않은 워크트리 브랜치도 삭제 |

### `orc workflow list`

프로젝트의 워크플로우를 조회합니다.

```text
orc workflow list [options]
```

| 옵션     | 설명                                        |
| -------- | ------------------------------------------- |
| `--json` | 워크플로우와 읽지 못한 파일을 JSON으로 출력 |

### `orc workflow validate`

워크플로우가 올바르게 작성되었는지 검증합니다.

```text
orc workflow validate <id> [options]
```

| 옵션     | 설명                            |
| -------- | ------------------------------- |
| `--json` | 판정과 findings를 JSON으로 출력 |

### `orc workflow run`

워크플로우를 실행합니다.

```text
orc workflow run <id> [options]
```

| 옵션                  | 설명                                                 |
| --------------------- | ---------------------------------------------------- |
| `--input <text>`      | `$INPUT`으로 전달할 텍스트 (최대 1,000자)            |
| `--input-file <path>` | `$INPUT`으로 전달할 텍스트가 담긴 파일               |
| `--no-worktree`       | 워크트리 없이 프로젝트 디렉터리에서 실행             |
| `--base <ref>`        | 워크트리 브랜치가 갈라져 나올 ref (기본: 현재 HEAD)  |
| `--branch <prefix>`   | 워크트리 브랜치 접두사 (기본: `orc/<워크플로우 id>`) |
| `--detach`            | 백그라운드로 실행하고 즉시 반환                      |
| `--json`              | 실행과 노드를 JSON으로 출력                          |

### `orc workflow resume`

멈춘 워크플로우 실행을 이어서 실행합니다.

```text
orc workflow resume <run-id> [options]
```

| 옵션       | 설명                            |
| ---------- | ------------------------------- |
| `--detach` | 백그라운드로 실행하고 즉시 반환 |
| `--json`   | 실행과 노드를 JSON으로 출력     |

### `orc workflow approve`

승인을 기다리는 노드를 승인합니다. 실행은 재개하지 않습니다.

```text
orc workflow approve <run-id> <node-id> [options]
```

| 옵션     | 설명                 |
| -------- | -------------------- |
| `--json` | 결정을 JSON으로 출력 |

### `orc workflow reject`

승인을 기다리는 노드를 거부합니다. 노드에 `on_reject`가 없으면 실행을 취소하고, 있으면 실행은 멈춘 채 남아 `resume`이 `on_reject` 본문을 실행합니다.

```text
orc workflow reject <run-id> <node-id> [options]
```

| 옵션              | 설명                                                      |
| ----------------- | --------------------------------------------------------- |
| `--reason <text>` | `$REASON`으로 전달할 텍스트. 작업이 참조한다면 필수입니다 |
| `--json`          | 결정을 JSON으로 출력                                      |

### `orc workflow approvals`

실행의 검토 요청을 조회합니다.

```text
orc workflow approvals <run-id> [node-id] [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc workflow status`

워크플로우 실행의 현재 상태를 조회합니다.

```text
orc workflow status <run-id> [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc workflow runs`

최근 워크플로우 실행을 조회합니다.

```text
orc workflow runs [options]
```

| 옵션              | 설명                        |
| ----------------- | --------------------------- |
| `--all`           | 모든 프로젝트의 실행을 조회 |
| `--limit <count>` | 조회할 실행 개수 (기본: 10) |
| `--json`          | JSON으로 출력               |

### `orc workflow events`

워크플로우 실행과 노드의 상태 변화를 조회합니다.

```text
orc workflow events <run-id> [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc workflow logs`

노드가 출력한 내용을 조회합니다.

```text
orc workflow logs <run-id> [node-id] [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc workflow hook-logs`

워크트리 훅이 출력한 내용을 조회합니다.

```text
orc workflow hook-logs <run-id> [file] [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc workflow stream`

상태 변화와 로그를 함께 조회합니다.

```text
orc workflow stream <run-id> [options]
```

| 옵션           | 설명                         |
| -------------- | ---------------------------- |
| `-f, --follow` | 실행이 끝날 때까지 계속 출력 |
| `--json`       | JSON으로 출력                |

### `orc workflow cancel`

실행 중이거나 승인을 기다리는 워크플로우를 중단합니다. 중단한 실행은 재개할 수 없습니다.

```text
orc workflow cancel <run-id>
```

### `orc workflow prune`

워크플로우 실행을 삭제합니다. 기록과 산출물, 워크트리와 브랜치를 함께 지웁니다.

```text
orc workflow prune <run-id> [options]
```

| 옵션      | 설명                                        |
| --------- | ------------------------------------------- |
| `--force` | 병합되지 않은 워크트리 브랜치도 강제로 삭제 |

### `orc hook run`

프로젝트의 워크트리 훅을 임시 워크트리에서 실행합니다. 워크플로우를 실행하지 않고 훅을 확인할 때 사용합니다.

```text
orc hook run <phase> [options]
```

| 옵션        | 설명                             |
| ----------- | -------------------------------- |
| `--dry-run` | 실행하지 않고 훅 스크립트만 출력 |

`<phase>`는 `post-create`, `pre-remove`, `post-remove` 중 하나입니다.

### `orc auth login`

에이전트에 로그인합니다.

```text
orc auth login <provider>
```

### `orc auth logout`

에이전트에서 로그아웃합니다.

```text
orc auth logout <provider>
```

### `orc auth status`

에이전트 로그인 상태를 조회합니다.

```text
orc auth status [options]
```

| 옵션     | 설명          |
| -------- | ------------- |
| `--json` | JSON으로 출력 |

### `orc skill install`

에이전트 스킬을 프로젝트에 설치합니다. 이미 설치되어 있다면 최신 상태로 갱신합니다.

```text
orc skill install [options]
```

| 옵션            | 설명                                |
| --------------- | ----------------------------------- |
| `--path <path>` | 프로젝트 경로 (기본: 현재 디렉터리) |
