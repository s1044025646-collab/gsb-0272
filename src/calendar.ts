/**
 * 核心历法换算模块。
 *
 * 日序基准：格里高利历 1970-01-01 对应整数 0，每增加一天整数加一。
 * 这是纯日期序号，不是 UTC 时间戳，也不含儒略日正午起算的时刻概念。
 * 星期基准：日序 0（1970-01-01）为星期四。
 *
 * 不依赖 JavaScript Date 或任何系统日期库。
 */

export const ALGORITHM_VERSION = "1.0.0";

export type CalendarMode = "gregorian" | "julian" | "mixed";

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

/** 改革切换：儒略历 1582-10-04 之后紧接格里高利历 1582-10-15 */
export const REFORM_LAST_JULIAN = { year: 1582, month: 10, day: 4 };
export const REFORM_FIRST_GREGORIAN = { year: 1582, month: 10, day: 15 };

export type ErrorCode =
  | "INVALID_YEAR"
  | "INVALID_MONTH"
  | "INVALID_DAY"
  | "NONEXISTENT_DATE"
  | "OUT_OF_RANGE"
  | "INVALID_MODE"
  | "INVALID_DAYS"
  | "BAD_REQUEST";

export class CalendarError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "CalendarError";
  }
}

export interface DateLabel {
  year: number;
  month: number;
  day: number;
}

export function isGregorianLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isJulianLeap(year: number): boolean {
  return year % 4 === 0;
}

const MONTH_DAYS_COMMON = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonthGregorian(year: number, month: number): number {
  if (month === 2) return isGregorianLeap(year) ? 29 : 28;
  return MONTH_DAYS_COMMON[month - 1];
}

export function daysInMonthJulian(year: number, month: number): number {
  if (month === 2) return isJulianLeap(year) ? 29 : 28;
  return MONTH_DAYS_COMMON[month - 1];
}

function isLeapFor(cal: "gregorian" | "julian", year: number): boolean {
  return cal === "gregorian" ? isGregorianLeap(year) : isJulianLeap(year);
}

export function daysInMonth(
  cal: "gregorian" | "julian",
  year: number,
  month: number
): number {
  return cal === "gregorian"
    ? daysInMonthGregorian(year, month)
    : daysInMonthJulian(year, month);
}

/**
 * 格里高利历日期 -> 日序。使用基于 0001-01-01 起累计天数的纯整数算法。
 */
export function gregorianToSerial(year: number, month: number, day: number): number {
  // 1 月 1 日到当年 1 月 1 日的累计天数（从 1 年起）
  const y = year - 1;
  let serial = y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  for (let m = 1; m < month; m++) serial += daysInMonthGregorian(year, m);
  serial += day;
  // 0001-01-01 的日序定义为 -719162，使 1970-01-01 = 0
  return serial - 719163;
}

/**
 * 儒略历日期 -> 日序。同一基准：1970-01-01（格里高利）= 0。
 */
export function julianToSerial(year: number, month: number, day: number): number {
  const y = year - 1;
  let serial = y * 365 + Math.floor(y / 4);
  for (let m = 1; m < month; m++) serial += daysInMonthJulian(year, m);
  serial += day;
  // 公元 1 世纪格里高利历比儒略历“落后”2 天（儒略 0001-01-01 = 格里高利 0000-12-30），
  // 故儒略历绝对日数需减去 719165 才能使 1970-01-01（格里高利）= 0。
  // 校验锚点：儒略历 1969-12-19 = 格里高利历 1970-01-01 = 日序 0。
  return serial - 719165;
}

/** 日序 -> 格里高利历日期（二分查找年份，纯整数运算） */
export function serialToGregorian(serial: number): DateLabel {
  const n = serial + 719163; // 自 0001-01-01 起的天数，1 起算
  if (n < 1) {
    throw new CalendarError("OUT_OF_RANGE", `日序 ${serial} 早于 0001-01-01，超出支持范围`);
  }
  let lo = 1;
  let hi = Math.max(1, Math.floor(n / 365) + 2);
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const y = mid - 1;
    const start = y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + 1;
    if (start <= n) lo = mid;
    else hi = mid - 1;
  }
  const year = lo;
  const y = year - 1;
  let rem = n - (y * 365 + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400));
  let month = 1;
  while (true) {
    const dim = daysInMonthGregorian(year, month);
    if (rem <= dim) break;
    rem -= dim;
    month++;
  }
  return { year, month, day: rem };
}

/** 日序 -> 儒略历日期 */
export function serialToJulian(serial: number): DateLabel {
  const n = serial + 719165;
  if (n < 1) {
    throw new CalendarError("OUT_OF_RANGE", `日序 ${serial} 早于儒略历 0001-01-01，超出支持范围`);
  }
  let lo = 1;
  let hi = Math.max(1, Math.floor(n / 365) + 2);
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const y = mid - 1;
    const start = y * 365 + Math.floor(y / 4) + 1;
    if (start <= n) lo = mid;
    else hi = mid - 1;
  }
  const year = lo;
  const y = year - 1;
  let rem = n - (y * 365 + Math.floor(y / 4));
  let month = 1;
  while (true) {
    const dim = daysInMonthJulian(year, month);
    if (rem <= dim) break;
    rem -= dim;
    month++;
  }
  return { year, month, day: rem };
}

function assertInteger(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CalendarError("BAD_REQUEST", `${name} 必须为整数`);
  }
}

export function validateMode(mode: string): CalendarMode {
  if (mode === "gregorian" || mode === "julian" || mode === "mixed") return mode;
  throw new CalendarError("INVALID_MODE", `未知历法模式: ${mode}`);
}

/** 校验混合模式下的日期标签，确定应使用哪套纯历法规则 */
function resolveMixedCalendar(date: DateLabel): "gregorian" | "julian" {
  const { year, month, day } = date;
  const before =
    year < 1582 ||
    (year === 1582 && (month < 10 || (month === 10 && day <= 4)));
  const after =
    year > 1582 ||
    (year === 1582 && (month > 10 || (month === 10 && day >= 15)));
  if (before) return "julian";
  if (after) return "gregorian";
  throw new CalendarError(
    "NONEXISTENT_DATE",
    `混合模式下 ${year}-${month}-${day} 不存在（1582-10-05 至 1582-10-14 为改革缺失日期）`
  );
}

/** 校验日期标签在给定模式下合法，返回其日序 */
export function dateToSerial(mode: CalendarMode, date: DateLabel): number {
  assertInteger(date.year, "year");
  assertInteger(date.month, "month");
  assertInteger(date.day, "day");
  if (date.year < MIN_YEAR || date.year > MAX_YEAR) {
    throw new CalendarError(
      "INVALID_YEAR",
      `年份须在 ${MIN_YEAR} 至 ${MAX_YEAR} 之间，收到 ${date.year}`
    );
  }
  if (date.month < 1 || date.month > 12) {
    throw new CalendarError("INVALID_MONTH", `月份须在 1 至 12 之间，收到 ${date.month}`);
  }
  const cal = mode === "mixed" ? resolveMixedCalendar(date) : mode;
  const dim = daysInMonth(cal, date.year, date.month);
  if (date.day < 1 || date.day > dim) {
    throw new CalendarError(
      "INVALID_DAY",
      `${date.year}-${date.month} 在 ${cal} 历法下只有 ${dim} 天，收到日 ${date.day}`
    );
  }
  return cal === "gregorian"
    ? gregorianToSerial(date.year, date.month, date.day)
    : julianToSerial(date.year, date.month, date.day);
}

/** 日序 -> 指定模式下的日期标签，并校验结果年份范围 */
export function serialToDate(mode: CalendarMode, serial: number): DateLabel {
  assertInteger(serial, "serial");
  let date: DateLabel;
  if (mode === "gregorian") {
    date = serialToGregorian(serial);
  } else if (mode === "julian") {
    date = serialToJulian(serial);
  } else {
    // 混合模式：以改革边界日序决定使用哪套规则
    const reformBoundary = gregorianToSerial(1582, 10, 15);
    date = serial < reformBoundary ? serialToJulian(serial) : serialToGregorian(serial);
  }
  if (date.year < MIN_YEAR || date.year > MAX_YEAR) {
    throw new CalendarError(
      "OUT_OF_RANGE",
      `换算结果 ${date.year}-${date.month}-${date.day} 超出支持年份范围 ${MIN_YEAR}-${MAX_YEAR}`
    );
  }
  return date;
}

const WEEKDAY_NAMES = ["星期四", "星期五", "星期六", "星期日", "星期一", "星期二", "星期三"];
const WEEKDAY_NAMES_EN = [
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
];

/** 星期：0=星期日 ... 6=星期六。基准：日序 0 = 1970-01-01 = 星期四 */
export function weekdayOfSerial(serial: number): {
  index: number;
  nameZh: string;
  nameEn: string;
} {
  const mod = ((serial % 7) + 7) % 7; // 0=周四
  const index = (mod + 4) % 7; // 转为 0=周日
  return { index, nameZh: WEEKDAY_NAMES[mod], nameEn: WEEKDAY_NAMES_EN[mod] };
}

export function formatDate(d: DateLabel): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${String(d.year).padStart(4, "0")}-${mm}-${dd}`;
}

export function parseDateString(text: string): DateLabel {
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) {
    throw new CalendarError("BAD_REQUEST", `日期格式应为 YYYY-MM-DD，收到 "${text}"`);
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** 月份有效日期清单（混合模式会跳过改革缺失标签），按连续日序排序 */
export function monthValidDates(
  mode: CalendarMode,
  year: number,
  month: number
): { dates: { label: string; serial: number }[]; skipped: string[] } {
  assertInteger(year, "year");
  assertInteger(month, "month");
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new CalendarError("INVALID_YEAR", `年份须在 ${MIN_YEAR} 至 ${MAX_YEAR} 之间`);
  }
  if (month < 1 || month > 12) {
    throw new CalendarError("INVALID_MONTH", `月份须在 1 至 12 之间`);
  }
  const cal = mode === "mixed" ? "gregorian" : mode; // 月天数对两种历法相同（2 月除外，分别判断）
  const dim =
    month === 2
      ? mode === "julian"
        ? daysInMonthJulian(year, 2)
        : daysInMonthGregorian(year, 2)
      : MONTH_DAYS_COMMON[month - 1];
  void cal;
  const dates: { label: string; serial: number }[] = [];
  const skipped: string[] = [];
  for (let day = 1; day <= dim; day++) {
    const label = formatDate({ year, month, day });
    try {
      const serial = dateToSerial(mode, { year, month, day });
      dates.push({ label, serial });
    } catch (e) {
      if (e instanceof CalendarError && e.code === "NONEXISTENT_DATE") {
        skipped.push(label);
      } else {
        throw e;
      }
    }
  }
  dates.sort((a, b) => a.serial - b.serial);
  return { dates, skipped };
}
