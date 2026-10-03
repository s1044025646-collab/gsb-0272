#!/usr/bin/env node
import { DateService } from './service.js';
import { HistoryStore } from './db.js';
import { startServer } from './api.js';
import { CalError } from './calendar.js';

function num(v: string | undefined, name: string): number {
  const n = Number(v);
  if (v === undefined || !Number.isInteger(n)) throw new CalError('BAD_REQUEST', `参数 ${name} 缺失或不是整数：${v}`);
  return n;
}

function print(v: unknown) {
  console.log(JSON.stringify(v, null, 2));
}

const USAGE = `用法: node dist/cli.js <命令> [参数]

命令:
  serve [--port N]                      启动 HTTP API（默认端口 0 = 自动选空闲端口）
  validate <calendar> <y> <m> <d>       校验日期
  convert <from> <to> <y> <m> <d>       跨历法换算
  add <calendar> <y> <m> <d> <days>     加减整数天（days 可为负）
  diff <calendar> <y1> <m1> <d1> <y2> <m2> <d2>   两日期相差天数（to - from）
  weekday <calendar> <y> <m> <d>        查询星期
  month <calendar> <y> <m>              月份有效日期清单
  history [limit]                       查看历史操作

calendar: gregorian | julian | mixed
环境变量: DATECAL_DATA_DIR 覆盖数据目录（默认 ./data）`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const service = new DateService(new HistoryStore());

  switch (cmd) {
    case 'serve': {
      const idx = args.indexOf('--port');
      const port = idx >= 0 ? num(args[idx + 1], '--port') : 0;
      const { port: actual } = await startServer(service, port);
      console.log(`datecal API 已启动: http://localhost:${actual}/api/health`);
      return; // 保持进程存活
    }
    case 'validate':
      return print(service.validate({ calendar: args[0], year: num(args[1], 'year'), month: num(args[2], 'month'), day: num(args[3], 'day') }));
    case 'convert':
      return print(service.convert({ from: args[0], to: args[1], year: num(args[2], 'year'), month: num(args[3], 'month'), day: num(args[4], 'day') }));
    case 'add':
      return print(service.add({ calendar: args[0], year: num(args[1], 'year'), month: num(args[2], 'month'), day: num(args[3], 'day'), days: num(args[4], 'days') }));
    case 'diff':
      return print(
        service.diff({
          calendar: args[0],
          from: { year: num(args[1], 'y1'), month: num(args[2], 'm1'), day: num(args[3], 'd1') },
          to: { year: num(args[4], 'y2'), month: num(args[5], 'm2'), day: num(args[6], 'd2') },
        }),
      );
    case 'weekday':
      return print(service.weekday({ calendar: args[0], year: num(args[1], 'year'), month: num(args[2], 'month'), day: num(args[3], 'day') }));
    case 'month':
      return print(service.month({ calendar: args[0], year: num(args[1], 'year'), month: num(args[2], 'month') }));
    case 'history':
      return print(service.history(args[0] ? num(args[0], 'limit') : 50));
    default:
      console.log(USAGE);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

main().catch((e) => {
  if (e instanceof CalError) {
    console.error(`错误 [${e.code}] ${e.message}`);
  } else {
    console.error(e);
  }
  process.exitCode = 1;
});
