/**
 * 历法核心：儒略历 / 格里高利历 / 1582 改革混合模式 与统一整数日序的双向转换。
 *
 * 日序基准：格里高利历 1970-01-01 = 0，每过一天 +1。
 * 这是纯日期序号，不是 UTC 时间戳，也不含儒略日正午起算概念。
 *
 * 算法：Howard Hinnant 的 days_from_civil / civil_from_days 及其儒略历变体，
 * 纯整数运算，不使用 JavaScript Date 或任何系统日期库。
 */

export type CalendarId = 'gregorian' | 'julian' | 'mixed';

export const ALGORITHM_VERSION = 'hinnant-civil-v1';

/** 日序 0 = 格里高利 1970-01-01 = 星期四 */
export const EPOCH_WEEKDAY = 4; // 0=Sunday ... 4=Thursday

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;

export class CalError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CalError';
  }
}

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function isGregorianLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isJulianLeap(year: number): boolean {
  return year % 4 === 0;
}

export function isLeap(calendar: CalendarId, year: number): boolean {
  // 混合模式下闰年规则取决于该年所处区间；1582 及以前按儒略，之后按格里高利。
  if (calendar === 'julian') return isJulianLeap(year);
  if (calendar === 'gregorian') return isGregorianLeap(year);
  return year <= 1582 ? isJulianLeap(year) : isGregorianLeap(year);
}

export function daysInMonth(calendar: CalendarId, year: number, month: number): number {
  const base = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (month === 2 && isLeap(calendar, year)) return 29;
  return base;
}

/** 格里高利历 年月日 -> 日序 */
export function gregorianToSerial(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400; // [0, 399]
  const mp = m > 2 ? m - 3 : m + 9; // [0, 11]，3 月为 0
  const doy = floorDiv(153 * mp + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 日序 -> 格里高利历 年月日 */
export function serialToGregorian(z: number): { year: number; month: number; day: number } {
  const zz = z + 719468;
  const era = floorDiv(zz, 146097);
  const doe = zz - era * 146097; // [0, 146096]
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

/** 儒略历 年月日 -> 日序 */
export function julianToSerial(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 4);
  const yoe = yy - era * 4; // [0, 3]
  const mp = m > 2 ? m - 3 : m + 9;
  const doy = floorDiv(153 * mp + 2, 5) + d - 1;
  const doe = yoe * 365 + doy;
  return era * 1461 + doe - 719470;
}

/** 日序 -> 儒略历 年月日 */
export function serialToJulian(z: number): { year: number; month: number; day: number } {
  const zz = z + 719470;
  const era = floorDiv(zz, 1461);
  const doe = zz - era * 1461; // [0, 1460]
  const yoe = floorDiv(doe - floorDiv(doe, 1460), 365);
  const y = yoe + era * 4;
  const doy = doe - 365 * yoe;
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: m <= 2 ? y + 1 : y, month: m, day: d };
}

/** 混合模式切换点：日序 >= 此值用格里高利规则，否则用儒略规则 */
export const REFORM_SERIAL = gregorianToSerial(1582, 10, 15);

function assertInt(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new CalError('BAD_REQUEST', `${name} 必须是整数`);
  }
  return v as number;
}

export function validateFields(year: unknown, month: unknown, day: unknown): { year: number; month: number; day: number } {
  const y = assertInt('year', year);
  const m = assertInt('month', month);
  const d = assertInt('day', day);
  if (y < MIN_YEAR || y > MAX_YEAR) throw new CalError('INVALID_YEAR', `年份须在 ${MIN_YEAR}..${MAX_YEAR}，不支持公元前或零年`);
  if (m < 1 || m > 12) throw new CalError('INVALID_MONTH', '月份须在 1..12');
  if (d < 1 || d > 31) throw new CalError('INVALID_DAY', '日须在 1..31');
  return { year: y, month: m, day: d };
}

/** 混合模式下判断标签所处区间 */
export function mixedRegion(year: number, month: number, day: number): 'julian' | 'gregorian' | 'gap' {
  if (year < 1582 || (year === 1582 && (month < 10 || (month === 10 && day <= 4)))) return 'julian';
  if (year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)))) return 'gregorian';
  return 'gap';
}

/** 标签 -> 日序。非法日期、月天数越界、混合缺失日均抛 CalError。 */
export function labelToSerial(calendar: CalendarId, year: number, month: number, day: number): number {
  const dim = daysInMonth(calendar, year, month);
  if (day > dim) {
    throw new CalError('INVALID_DAY', `${calendar} ${year}-${month}-${day} 超出当月天数（${dim} 天）`);
  }
  if (calendar === 'gregorian') return gregorianToSerial(year, month, day);
  if (calendar === 'julian') return julianToSerial(year, month, day);
  const region = mixedRegion(year, month, day);
  if (region === 'gap') {
    throw new CalError('DATE_NOT_EXIST', `混合模式中 1582-10-05 至 1582-10-14 不存在（收到 ${year}-${month}-${day}）`);
  }
  return region === 'julian' ? julianToSerial(year, month, day) : gregorianToSerial(year, month, day);
}

/** 日序 -> 标签，并校验结果年份在支持范围内。 */
export function serialToLabel(calendar: CalendarId, serial: number): { year: number; month: number; day: number } {
  const r =
    calendar === 'gregorian'
      ? serialToGregorian(serial)
      : calendar === 'julian'
        ? serialToJulian(serial)
        : serial < REFORM_SERIAL
          ? serialToJulian(serial)
          : serialToGregorian(serial);
  if (r.year < MIN_YEAR || r.year > MAX_YEAR) {
    throw new CalError('OUT_OF_RANGE', `换算结果年份 ${r.year} 超出支持范围 ${MIN_YEAR}..${MAX_YEAR}`);
  }
  return r;
}

/** 星期：0=Sunday..6=Saturday；日序 0（1970-01-01 格里高利）为星期四。 */
export function weekdayOfSerial(serial: number): number {
  return (((serial + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

export const WEEKDAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 某月有效标签清单（按真实连续日序排序），混合模式改革月附缺失标签。 */
export function monthDays(calendar: CalendarId, year: number, month: number) {
  if (month < 1 || month > 12) throw new CalError('INVALID_MONTH', '月份须在 1..12');
  const dim = daysInMonth(calendar, year, month);
  const days: Array<{ year: number; month: number; day: number; serial: number; weekday: number }> = [];
  const missing: Array<{ year: number; month: number; day: number }> = [];
  for (let d = 1; d <= dim; d++) {
    try {
      const serial = labelToSerial(calendar, year, month, d);
      days.push({ year, month, day: d, serial, weekday: weekdayOfSerial(serial) });
    } catch (e) {
      if (e instanceof CalError && e.code === 'DATE_NOT_EXIST') {
        missing.push({ year, month, day: d });
      } else {
        throw e;
      }
    }
  }
  days.sort((a, b) => a.serial - b.serial);
  return { calendar, year, month, daysInMonth: dim, validCount: days.length, days, missing };
}

