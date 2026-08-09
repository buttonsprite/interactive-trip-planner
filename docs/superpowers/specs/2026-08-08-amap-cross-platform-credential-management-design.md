# 高德跨平台凭据管理设计

**日期：** 2026-08-08
**状态：** 待用户书面审核
**目标版本：** `interactive-trip-planner` 0.3.0
**范围：** 高德首次配置、跨平台安全存储、凭据解析、provider 自动启动与停止、异常降级、对外说明和发布验收

## 一、需求文档变更记录

| 变更时间 | 修改人/来源 | 变更内容 |
| --- | --- | --- |
| 2026-08-08 | 用户确认 + Codex | 创建设计规格；确认从第一版同时支持 macOS、Windows、Linux，Linux 无 Secret Service 时不自动降级为明文长期保存 |

## 二、背景

### 2.1 当前问题

高德官方 `amap-gui` 通过 `AMAP_KEY` 与 `AMAP_SECURITY_KEY` 两个环境变量读取凭据。当前 Skill 直接继承这一底层接口，因此用户需要在每个可见到 Skill 的终端环境中手动设置两项变量，并手动运行 `amap-gui start`。

这种设计满足“不把凭据写入 Git、旅行资料、地图或发布包”的安全要求，但把底层配置细节暴露给了普通旅行者：

- 用户已经在高德控制台创建 Key，仍不知道为什么 Skill 不能直接使用。
- 不同终端、Codex 任务或重启后的环境变量不一定继承，容易出现“已经配置过但仍提示缺少凭据”。
- 手动输入、启动、停止和清理的步骤多，且用户可能把密钥误贴进聊天、命令历史或项目文件。
- 当前能力探测只能确认环境变量非空，不能证明凭据有效，也不能自动完成 provider readiness。

2026-08-08 已完成一次真实验证：使用临时 `0600` 凭据文件后，`amap-gui` 成功进入 `mapReady: true`，真实 POI 搜索返回 3 项，真实路线验证返回 1 条；测试后已停止容器并删除临时文件。这证明 provider 链路可用，当前主要问题是首次配置与长期使用体验，而不是高德能力不可用。

### 2.2 目标用户与使用场景

- 普通旅行者：只愿意首次配置一次，此后由 Skill 自动使用高德增强。
- Codex / REDSkill 用户：不需要理解环境变量、进程继承和 provider 生命周期。
- 高级用户与 CI：仍可通过环境变量临时覆盖系统存储。
- macOS、Windows、Linux 用户：第一版即具备明确、可验证且不静默降级的凭据路径。

### 2.3 必要性判断

该问题需要在 0.3.0 发布前解决。0.3.0 的主要价值之一是让中国大陆 POI 搜索与路线复核真实可用；如果普通用户每次都要手动配置环境变量，live gate 虽然通过，产品仍不具备合理的首次使用体验。

## 三、目标和收益预估

### 3.1 产品目标

把高德增强从“每次手动配置的开发者能力”改成“首次安全配置一次、以后自动使用的旅行能力”。

完成后，普通用户只需理解：

```text
首次需要连接高德地图
→ 隐蔽输入 Key 和安全密钥
→ 自动验证
→ 保存到本机系统安全存储
→ 以后自动搜索地点和复核路线
```

### 3.2 完成标准

- macOS、Windows、Linux 都有首选安全存储路径和明确的不可用降级。
- 用户不需要在日常规划中手动运行 `export` 或 `amap-gui start`。
- 首次配置只有在真实 POI 与路线验证成功后才变成“已配置”。
- 密钥不进入命令参数、聊天、日志、Git、旅行文件、地图、导出或 REDSkill 包。
- 环境变量继续支持高级用户与 CI，但不再是普通用户唯一入口。
- Linux 缺少 Secret Service 时不自动创建明文长期凭据文件。

### 3.3 非目标

- 不代用户申请高德开发者账号、创建 Key 或接受高德协议。
- 不把 Key 上传到任何自有服务，也不建设云端密钥托管。
- 不自动写入高德收藏夹，不改变现有 POI、路线和地图交付事实边界。
- 不引入必须随 REDSkill 分发的 native binary 或安装后编译步骤。
- 不把凭据管理扩展到小红书 Cookie、Google 账号或其他第三方登录态。

## 四、产品思路

### 4.1 方案比较

#### （1）系统安全存储适配层，保留环境变量覆盖（采用）

- macOS 使用 Keychain。
- Windows 使用当前用户范围的 DPAPI 加密存储。
- Linux 使用 Secret Service / `secret-tool`。
- 环境变量用于 CI、临时调试和高级覆盖。
- 优点：首次配置一次；不在 Skill 中保存明文；不需要随发布包分发 native binary。
- 代价：需要维护三套平台 adapter；Linux 桌面环境能力不完全一致。

#### （2）使用统一 Node 原生 Keychain 依赖（不采用）

- 优点：调用接口统一。
- 问题：通常依赖 native binary、Node ABI 或安装后编译，不适合 REDSkill 只包含 Markdown、HTML、CSS、JavaScript、JSON 的发布边界，也增加跨平台安装失败面。

#### （3）使用 `.env` 或 `0600` 本地配置文件（不作为默认）

- 优点：实现和迁移简单，所有系统都能读取。
- 问题：仍是长期明文凭据，容易被备份、同步、误传或提交；不能作为公共 Skill 的默认安全承诺。
- 仅保留“用户明确选择的当次会话环境变量”，不提供静默长期明文 fallback。

### 4.2 核心判断

系统安全存储是普通用户默认入口；环境变量是兼容入口，不是 onboarding。三平台差异封装在确定性的 credential store 边界内，地图研究、路线复核与输出规范不感知具体平台。

## 五、详细方案

### 5.1 用户入口

新增统一命令：

```bash
node skill/scripts/amap-credentials.js setup
node skill/scripts/amap-credentials.js status
node skill/scripts/amap-credentials.js update
node skill/scripts/amap-credentials.js remove
```

规则：

- `setup`：首次配置。已有有效配置时不覆盖，提示使用 `update`。
- `status`：只显示当前平台、有效来源、是否已配置、provider 是否可用和下一步，不显示任何凭据值或凭据片段。
- `update`：新凭据真实验证成功后才切换；验证失败继续保留旧配置。
- `remove`：删除本 Skill 的高德凭据，并停止由本 Skill 管理的 `amap-gui`；不删除高德控制台的 Key，不影响其他应用的 Keychain、DPAPI 或 Secret Service 项目。

`setup` 与 `update` 必须在交互式 TTY 中执行，不接受 `--key`、`--security-key` 或把秘密放进 JSON/命令参数的用法。CI 不走 setup，直接使用环境变量。

### 5.2 情境化触发

保持现有触发边界：只有中国大陆行程进入 POI 定位或正式路线复核时，Skill 才检查高德增强。

- 已配置：安静使用，不重复介绍安装过程。
- 未配置：说明这是可选增强，展示一次配置入口；用户跳过后继续规划，并保持“未完成高德定位/路网复核”。
- 海外行程：不触发高德配置。
- 主题提案和初步意向阶段：不把地图配置作为启动问题。

### 5.3 首次配置流程

```text
检查平台与 amap-gui
  → 选择系统安全存储 adapter
  → 在系统或终端的隐蔽输入中取得两项凭据
  → 写入候选凭据槽
  → 用候选凭据启动独立验证流程
  → 执行一条稳定的公开 POI 查询
  → 执行一条稳定的公开路线查询
  → 两项均通过：切换 active profile，删除旧 profile
  → 任一失败：删除候选 profile，保留旧 profile 或未配置状态
  → 停止本次验证容器
```

配置成功必须同时满足：

- `amap-gui` 命令可用。
- 地图容器成功进入 `mapReady: true`。
- POI 请求返回经过现有 allowlist normalization 的 `status: ok`。
- 路线请求返回与本次起点、终点、途经点和 mode 绑定的 `status: ok`。
- 输出与错误流均未出现两项凭据值。

仅“变量非空”、仅 `amap-gui status` 成功、仅打开地图或仅生成 URI 都不算配置验证成功。

### 5.4 候选槽与更新安全

凭据成对管理，不能逐项覆盖 active 配置：

- 每次 setup/update 创建新的随机 profile ID。
- 两项秘密都写入该候选 profile。
- 非秘密的 active profile 指针保存在平台用户配置目录；目录拒绝 symlink，指针以当前用户权限和原子替换方式写入。
- 真实验证成功后原子切换 active 指针，再删除旧 profile。
- 验证失败、用户取消或进程中断时，active 指针不变；候选 profile 在当前流程或下次启动清理。

这保证 update 失败不会破坏原有可用配置，也避免把一个新 Key 与一个旧安全密钥混成一对。

### 5.5 平台存储

#### （1）macOS

- 使用系统 Keychain generic password item。
- Key 与安全密钥使用独立 item，并共享本 Skill 专用 service namespace 与 profile ID。
- 写入时使用 `security` 的交互式密码提示；`-w` 作为最后一个选项，让系统提示输入，不把秘密作为命令参数。
- 读取仅进入当前 Node 进程内存与目标 provider 子进程环境；捕获的 stdout 不向用户转发。

#### （2）Windows

- 使用 PowerShell 与当前用户范围 DPAPI 加密两项秘密。
- 只在 `%APPDATA%/interactive-trip-planner/` 保存密文、profile ID、格式版本和非秘密状态；目录与文件 ACL 限制为当前用户。
- 明文只通过受控 stdin 和当前进程内存传递，不进入 PowerShell 命令参数或脚本文件。
- 换用户或换机器后无法解密时返回“需要重新配置”，不把损坏数据当作空凭据。

#### （3）Linux

- 默认使用 Secret Service，通过 `secret-tool` 写入、查询和清除。
- 写入的秘密通过 stdin 传递，不进入命令参数。
- 预检 `secret-tool`、D-Bus session 与可解锁 keyring；任何一项不可用均返回 `store-unavailable`。
- 不自动创建明文配置。提示安装 `libsecret-tools`/启用桌面 Keyring，或由高级用户为本次会话提供环境变量。

### 5.6 凭据解析与覆盖

每次 provider 请求只选择一套完整凭据：

1. `AMAP_KEY` 与 `AMAP_SECURITY_KEY` 同时为 trim 后非空：使用环境变量，标记来源 `environment`。
2. 两项环境变量都不存在：读取 active 系统安全存储，标记来源 `system-store`。
3. 只存在一个环境变量：返回 `partial-environment-credentials`，不与系统存储混用。
4. 系统存储无 active profile：返回 `missing-credentials`。
5. 系统存储不可用或无法解密：返回 `store-unavailable` 或 `store-corrupt`，不删除数据、不静默降级。

`status` 可以同时说明“当前有效来源”和“本机是否存在已保存配置”，避免环境变量覆盖时用户误以为 Keychain 没有保存。

### 5.7 Provider 生命周期

普通用户不再手动运行 `amap-gui start`：

- 请求开始时先解析完整凭据，再检查 `amap-gui` 命令与容器状态。
- 每次 `amap-cli.js` 真实请求都由 Skill 用选中的完整凭据建立 request-scoped provider session；如果已有容器，先停止再以当前凭据启动，不能假设旧容器使用同一 Key。
- 请求完成、失败或超时都在 `finally` 停止本次容器；用户执行 remove 或凭据更新前也先停止容器。
- 启动、查询和停止失败都不得把请求升级为 verified；现有 `provider-error` 和人工复核降级继续生效。

首版接受每次请求产生一次冷启动，以换取简单、确定和无后台残留。后续只有在真实行程的查询延迟成为明确问题时，才单独设计 bounded batch session；不得在本需求中加入常驻 daemon、idle timer 或跨请求秘密缓存。

### 5.8 状态与异常

| 状态 | 用户含义 | 处理 |
| --- | --- | --- |
| `ready` | 凭据与真实高德查询均验证成功 | 后续自动使用 |
| `missing-cli` | 未安装 `amap-gui` | 展示官方安装入口，规划继续 |
| `missing-credentials` | 尚未完成首次配置 | 展示 setup 入口，规划继续 |
| `partial-environment-credentials` | 环境变量只配置了一项 | 提示补齐或清除，不混用系统存储 |
| `store-unavailable` | 当前系统安全存储不可用 | Linux 给安装提示；其他平台给诊断信息 |
| `store-corrupt` | 已保存配置无法读取或解密 | 保留损坏项，提示 remove 后重新 setup |
| `invalid-credentials` | 真实验证未通过 | 不激活候选配置，保留旧配置 |
| `provider-error` | 本次真实请求没有形成事实 | 继续规划，标记未复核 |

错误信息只能包含稳定状态、平台、可执行下一步和官方文档入口。不得包含 Key 值、前后缀、长度、密文、绝对用户路径、PowerShell 原始错误、Keychain 输出、D-Bus 错误正文或 provider stderr。

### 5.9 组件与责任边界

- Credential Store：平台探测、候选 profile、读写、删除和 active pointer；不执行地图请求。
- Credential Resolver：按完整来源优先级返回一对凭据；不混源、不输出值。
- Provider Session：用已解析凭据建立 request-scoped `amap-gui` session，并保证成功、失败和超时路径都执行停止清理；不改变 POI/路线 normalization。
- AMap Runtime：继续负责请求校验、provider 调用、响应绑定、allowlist、脱敏和事实状态。
- Agent Workflow：只在中国大陆的定位/路线阶段触发 setup；不索取用户在聊天中粘贴密钥。

现有单请求 JSON contract、搜索/路线返回 shape、路线 verified 规则、AMap URI、Google handoff 和 My Maps 导出均保持不变。

### 5.10 发布和迁移

- 现有只使用环境变量的用户无需迁移，行为保持兼容。
- 0.3.0 发布前，将高德文档的普通用户主路径改为一次性 setup；手动 environment/start 命令移到高级用法与故障排查。
- REDSkill 发布仍只包含受支持的文本和代码文件，不包含 native binary、加密凭据、active pointer 或本机状态。
- 构建和测试 fixture 只使用合成秘密，release secret scan 继续覆盖 Key 名称、假秘密与新 credential store 输出。

### 5.11 验收标准

#### （1）跨平台功能

- macOS：setup → status ready → 真实查询 → update → remove 完整通过。
- Windows：DPAPI 当前用户可读，其他用户/损坏密文不可用且不泄露；完整流程通过。
- Linux：Secret Service 可用时完整流程通过；缺失时明确 `store-unavailable`，没有新明文凭据文件。
- 三个平台都支持完整环境变量覆盖与 partial-env 拒绝混源。

#### （2）安全

- setup/update 不接受 secret CLI args。
- 子进程 argv、stdout、stderr、固定错误、日志、trip data、map、My Maps 导出、Git diff 和 REDSkill release 均无凭据值。
- update 失败不破坏旧 active profile；remove 只删除本 Skill namespace。
- provider 容器不会因 setup 验证失败继续运行。

#### （3）事实与降级

- 只有真实 POI + 路线验证都成功才显示配置成功。
- 自动启动失败、旧容器冲突、provider error 或 credential store 异常均不能形成 verified route。
- 不配置高德仍能完成旅行规划，并明确人工复核边界。

#### （4）回归

- 现有 `npm run test:skill` 全部通过。
- `npm run build:redskill` 与 `npm run test:redskill` 通过。
- opt-in live AMap gate 使用系统存储和环境变量两种来源各验证一次，不输出秘密。
- 生成 release 经过完整 secret scan，且不包含平台状态或凭据存储产物。

### 5.12 风险和回滚边界

#### （1）主要风险

- macOS Keychain、Windows DPAPI、Linux Secret Service 的可用性与交互差异可能造成平台特定问题。
- Linux headless 环境通常没有 D-Bus/Keyring，不能承诺一次配置长期保存。
- `amap-gui` 是本地有状态服务；异常中断可能让容器未能停止，下一次请求必须先停止旧容器再重新建立 request-scoped session。
- Windows 或 Linux adapter 的错误输出可能含路径或平台细节，必须在统一边界内转成稳定错误。
- 用户环境已有手动启动的 `amap-gui` 时，必须重启后才能确保使用当前凭据，可能打断其独立地图会话。

#### （2）回滚

- Credential Resolver 保留环境变量路径；系统存储功能发生平台回归时可以关闭对应 adapter，而不改动 AMap 请求/响应 contract。
- Provider 自动生命周期是独立层；必要时可回滚为用户手动启动，同时保留一次性安全存储。
- 不迁移或删除用户已有环境变量，不修改高德控制台 Key。
- 任何回滚都不得退回到默认明文 `.env` 长期存储。

## 六、实验方案

不做 A/B 实验。该需求是安全与基础可用性改造，以三平台功能测试、首次配置走查、真实 provider gate 和发布隐私验收作为放行依据。

## 七、数据方案

不新增远程 telemetry 或账号数据收集。

本地 `status` 只允许展示并即时计算：平台、credential source 类型、是否存在 active profile、CLI 是否安装、provider 是否 ready、最近一次稳定状态。不得保存或上报 Key、密文、完整错误、查询内容、地点、路线或用户身份。

## 八、文案与多语言

### 8.1 首次提示

> 首次使用高德地图增强，需要完成一次安全配置。Key 和安全密钥只保存在这台设备的系统安全存储中，不会写入攻略、Git 或发布包。配置成功后，后续搜索地点和复核路线会自动使用高德；不配置也可以继续规划。

### 8.2 成功提示

> 高德地图已连接。地点搜索和路线复核以后会自动使用当前设备的安全配置。

### 8.3 Linux 缺少安全存储

> 当前 Linux 环境没有可用的 Secret Service。Skill 不会把密钥明文保存到本地文件。你可以安装并启用 libsecret/系统 Keyring，或仅为本次会话配置环境变量。

### 8.4 同步范围

英文文案与中文含义一致，不扩大能力承诺。README、README.en、SKILL、REDSkill 安装说明和 `map-provider-delivery.md` 必须同步更新，旧的“密钥值只保存在用户本地环境中”改为“只存在于用户选择的当次环境或本机系统安全存储”。
