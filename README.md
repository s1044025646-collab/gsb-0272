# 儒略历 / 格里高利历日期换算服务

离线本地后端：TypeScript + Node.js + SQLite（Node 内置 `node:sqlite`，无原生编译依赖）。
只做 API 与 CLI，不依赖 Docker、WSL 或任何外部在线服务，不修改本机系统时间。

## 历法模型

- **三种模式**：`gregorian`（纯格里高利历）、`julian`（纯儒略历）、`mixed`（固定 1582 改革切换）。
- **混合模式**：儒略历 1582-10-04 之后紧接格里高利历 1582-10-15；1582-10-05 至 1582-10-14
  返回 `NONEXISTENT_DATE`，绝不悄悄规范化。不声称复现各国真实改革日期。
- **日序基准**：格里高利历 1970-01-01 = 整数 0，每过一天加一。这是纯日期序号，
  不是 UTC 时间戳，也不含儒略日正午起算的时刻概念。
- **星期基准**：日序 0（1970-01-01）为星期四。
- **闰年规则**：格里高利历四年一闰、百年不闰、四百年再闰；儒略历每四年一闰。
  核心换算为纯整数算法，不使用 JavaScript `Date` 或系统日期库。
- **年份范围**：1 至 9999，不支持公元前与零年。换算结果越界报 `OUT_OF_RANGE`。
- 两种历法偏移随世纪变化（17 世纪 10 天、21 世纪 13 天），不做固定天数平移。

## 快速开始

```powershell
npm install
npm run build    # 编译 TypeScript 到 dist/
npm test         # 构建并运行全部自动化测试
npm start        # 启动 API 服务（默认自动选择空闲端口；$env:PORT=8080 可指定）
npm run demo     # 运行演示
```

要求 Node.js >= 22（使用内置 `node:sqlite`；启动时的 ExperimentalWarning 可忽略）。

## API

所有端点均 `POST` JSON（历史查询除外），监听 `127.0.0.1`。

| 路由 | 请求体 | 说明 |
| --- | --- | --- |
| `POST /api/validate` | `{mode, date:{year,month,day}}` | 校验日期，返回日序与星期 |
| `POST /api/convert` | `{from, to, date}` | 跨历法换算（from/to 为模式） |
| `POST /api/add-days` | `{mode, date, days}` | 加减整数天，days 可为负 |
| `POST /api/diff-days` | `{mode, from, to}` | 相差天数 = to 日序 − from 日序 |
| `POST /api/weekday` | `{mode, date}` | 查询星期 |
| `POST /api/month-dates` | `{mode, year, month}` | 该月有效日期清单（按连续日序排序，含 `skipped` 缺失标签） |
| `GET /api/history?limit=N` | — | 历史操作记录 |
| `GET /api/history/:id` | — | 单条历史记录 |
| `GET /health` | — | 健康检查 |

错误响应形如 `{"error":{"code":"NONEXISTENT_DATE","message":"..."}}`，HTTP 400。

### 错误码

`INVALID_YEAR`（年份超出 1-9999）、`INVALID_MONTH`、`INVALID_DAY`（月天数越界）、
`NONEXISTENT_DATE`（混合模式改革缺失标签）、`OUT_OF_RANGE`（换算结果越界）、
`INVALID_MODE`、`INVALID_DAYS`、`BAD_REQUEST`、`NOT_FOUND`。

## CLI

```powershell
node dist/src/cli.js validate    gregorian 2024-02-29
node dist/src/cli.js convert     mixed gregorian 1582-10-04
node dist/src/cli.js add-days    mixed 1582-10-04 1      # -> 1582-10-15
node dist/src/cli.js diff-days   gregorian 2024-01-01 2024-03-01
node dist/src/cli.js weekday     gregorian 1970-01-01    # 星期四
node dist/src/cli.js month-dates mixed 1582 10           # 21 个有效标签
node dist/src/cli.js history     20
node dist/src/cli.js demo
```

## 数据与历史

SQLite 数据库保存在项目内 `data/calendar.db`，记录每次操作的类型、模式、
算法版本（`ALGORITHM_VERSION`，当前 1.0.0）、请求与结果快照、错误码与时间戳，
重启后可通过 `/api/history` 或 `cli.js history` 复查。

## 测试

`npm test` 覆盖：闰年规则（格里高利 1900 不闰 / 2000 闰、儒略 1900 闰）、
已知锚点（1970-01-01=0 星期四、2000-01-01=10957 星期六、1582-10-15=-141427 星期五、
儒略 1969-12-19=0）、月底年底、改革前后相邻两天、缺失标签、负向加日、年份边界、
往返恒等、连续日序、差值反对称、同一文本跨历法不同日、改革月 21 个有效标签。

## 已知限制

- 混合模式只实现 1582 年 10 月这一种固定切换，不复现各国真实改革日期。
- 年份仅支持 1-9999，不支持公元前与零年。
- 只处理日期（年月日），不含时刻、时区与夏令时。
- `node:sqlite` 在 Node 25 仍标记为实验特性，启动时有警告，功能稳定可用。
