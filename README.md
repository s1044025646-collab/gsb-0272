# datecal：儒略历 / 格里高利历日期换算后端

离线本地服务，TypeScript + Node.js + SQLite（Node 内置 `node:sqlite`，无原生依赖、无 Docker、无外部 API）。
只做 API 与 CLI，不含时刻、时区、夏令时；不读取也不修改系统时间。

## 历法模式

| 模式 | 说明 |
| --- | --- |
| `gregorian` | 纯格里高利历，可向过去延伸。闰年：4 年一闰、百年不闰、400 年再闰 |
| `julian` | 纯儒略历，可向过去延伸。每 4 年一闰 |
| `mixed` | 固定 1582 改革切换：儒略 1582-10-04 之后紧接格里高利 1582-10-15。1582-10-05..14 不存在（报 `DATE_NOT_EXIST`，绝不规范化）。不声称复现各国真实改革日期 |

## 日序基准

统一整数日序：**格里高利 1970-01-01 = 0**，每过一天 +1。这是纯日期序号，
不是 UTC 时间戳，也不含儒略日（JD）正午起算的时刻概念。
星期基准独立核对：日序 0 为星期四。跨历法的同一天具有相同日序与星期。

核心算法为 Howard Hinnant 的 `days_from_civil` / `civil_from_days` 及其儒略历变体，
纯整数运算（`src/calendar.ts`），**不使用 JavaScript `Date` 或系统日期库**。
闰年规则差异使两历偏移随世纪变化（1700 年差 10 天、2000 年差 13 天），
因此严禁用固定偏移代替换算。

## 限制

- 年份范围 1..9999，不支持公元前与零年；换算结果越界报 `OUT_OF_RANGE`
- 输入只含年、月、日整数

## 快速开始（Windows）

```powershell
npm install        # 仅需开发依赖 typescript / @types/node
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 API（默认端口 0 = 自动选空闲端口）
npm run demo       # 离线演示（需先 build）
```

指定端口：`node dist/src/cli.js serve --port 8080`
数据目录：默认项目内 `./data/datecal.db`，可用环境变量 `DATECAL_DATA_DIR` 覆盖。

## HTTP API

均为 JSON。错误统一为 `{"error":{"code","message"}}`，HTTP 400。

| 方法 | 路径 | 请求体 / 参数 |
| --- | --- | --- |
| POST | `/api/validate` | `{calendar, year, month, day}` |
| POST | `/api/convert` | `{from, to, year, month, day}` |
| POST | `/api/add` | `{calendar, year, month, day, days}`（days 可为负） |
| POST | `/api/diff` | `{calendar? 或 fromCalendar/toCalendar, from:{year,month,day}, to:{...}}`，结果 `days = 目标日序 - 来源日序` |
| POST | `/api/weekday` | `{calendar, year, month, day}` |
| GET | `/api/month?calendar=mixed&year=1582&month=10` | 当月有效标签清单（按真实连续日序排序）+ `missing` 缺失标签 |
| GET | `/api/history?limit=50` | SQLite 中的历史操作（含模式、算法版本、请求/结果快照） |
| GET | `/api/health` | 健康检查 |

错误码：`BAD_REQUEST`、`INVALID_YEAR`、`INVALID_MONTH`、`INVALID_DAY`、
`DATE_NOT_EXIST`（混合模式缺失日）、`OUT_OF_RANGE`、`NOT_FOUND`、`INTERNAL`。

## CLI

```
node dist/src/cli.js validate gregorian 2000 2 29
node dist/src/cli.js convert julian gregorian 1582 10 4
node dist/src/cli.js add mixed 1582 10 4 1        # -> 1582-10-15
node dist/src/cli.js diff gregorian 1970 1 1 2000 1 1
node dist/src/cli.js weekday gregorian 1970 1 1   # 星期四
node dist/src/cli.js month mixed 1582 10          # 21 个有效标签
node dist/src/cli.js history 20
```

## 测试

`npm test` 覆盖：1900/2000 格里高利闰年规则、儒略 1900 仍闰、月底/年底连续、
改革前后相邻两天、缺失标签、负向加日、年份边界、已知日序/星期基准样例
（1970-01-01=0/星期四、2000-01-01=10957/星期六、1582-10-15=-141427/星期五等）、
往返一致、连续日序、差值反对称，以及 API + SQLite 历史记录集成测试。

## 算法版本

`hinnant-civil-v1`，随每条历史记录存入 SQLite，重启后可复查。
