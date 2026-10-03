import * as path from "node:path";
import { CalendarError } from "./calendar";
import { HistoryStore } from "./db";
import { CalendarService } from "./service";

function parseDateArg(text: string): { year: number; month: number; day: number } {
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!m) throw new CalendarError("BAD_REQUEST", `日期格式应为 YYYY-MM-DD，收到 "${text}"`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const USAGE = [
  "历法换算 CLI（儒略历 / 格里高利历 / 1582 混合模式）",
  "",
  "用法: node dist/src/cli.js <命令> [参数]",
  "",
  "命令:",
  "  validate    <mode> <date>                校验日期并显示日序与星期",
  "  convert     <fromMode> <toMode> <date>   跨历法换算",
  "  add-days    <mode> <date> <days>         加减整数天（days 可为负）",
  "  diff-days   <mode> <fromDate> <toDate>   两日期相差天数（to - from）",
  "  weekday     <mode> <date>                查询星期",
  "  month-dates <mode> <year> <month>        列出该月有效日期与缺失标签",
  "  history     [limit]                      查看历史操作记录",
  "  demo                                     运行演示",
  "",
  "mode 取值: gregorian | julian | mixed",
  "date 格式: YYYY-MM-DD（年 1-9999）",
  "",
].join("\n");

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function demo(service: CalendarService): void {
  console.log("== 演示 1：同一日期文本在不同历法下是不同日子 ==");
  print(service.convert("gregorian", "julian", { year: 2024, month: 1, day: 1 }));
  console.log("\n== 演示 2：混合模式改革月 1582-10 只有 21 个有效标签 ==");
  const md = service.monthDates("mixed", 1582, 10);
  console.log(`有效 ${md.count} 天，缺失标签: ${md.skipped.join(", ")}`);
  console.log("\n== 演示 3：混合模式 1582-10-04 加一天跨到 1582-10-15 ==");
  print(service.addDays("mixed", { year: 1582, month: 10, day: 4 }, 1));
  console.log("\n== 演示 4：星期基准核对 1970-01-01 = 星期四 ==");
  print(service.weekday("gregorian", { year: 1970, month: 1, day: 1 }));
}

export function runCli(argv: string[]): number {
  const dbPath = path.join(__dirname, "..", "data", "calendar.db");
  const store = new HistoryStore(dbPath);
  const service = new CalendarService(store);
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case "validate":
        print(service.validate(args[0], parseDateArg(args[1])));
        break;
      case "convert":
        print(service.convert(args[0], args[1], parseDateArg(args[2])));
        break;
      case "add-days":
        print(service.addDays(args[0], parseDateArg(args[1]), Number(args[2])));
        break;
      case "diff-days":
        print(service.diffDays(args[0], parseDateArg(args[1]), parseDateArg(args[2])));
        break;
      case "weekday":
        print(service.weekday(args[0], parseDateArg(args[1])));
        break;
      case "month-dates":
        print(service.monthDates(args[0], Number(args[1]), Number(args[2])));
        break;
      case "history":
        print(store.list(args[0] ? Number(args[0]) : 20));
        break;
      case "demo":
        demo(service);
        break;
      default:
        process.stderr.write(USAGE);
        return cmd ? 1 : 0;
    }
    return 0;
  } catch (e) {
    if (e instanceof CalendarError) {
      console.error(`错误 [${e.code}] ${e.message}`);
    } else {
      console.error(`内部错误: ${e instanceof Error ? e.message : String(e)}`);
    }
    return 1;
  } finally {
    store.close();
  }
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}
