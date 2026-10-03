import {
  ALGORITHM_VERSION,
  CalendarError,
  CalendarMode,
  DateLabel,
  dateToSerial,
  formatDate,
  monthValidDates,
  serialToDate,
  validateMode,
  weekdayOfSerial,
} from "./calendar";
import { HistoryStore } from "./db";

export class CalendarService {
  constructor(private store: HistoryStore | null) {}

  private run<T>(
    operation: string,
    mode: string,
    request: unknown,
    fn: () => T
  ): T {
    try {
      const result = fn();
      this.store?.record({
        operation,
        mode,
        algorithmVersion: ALGORITHM_VERSION,
        request,
        result,
        status: "ok",
      });
      return result;
    } catch (e) {
      const code = e instanceof CalendarError ? e.code : "BAD_REQUEST";
      this.store?.record({
        operation,
        mode,
        algorithmVersion: ALGORITHM_VERSION,
        request,
        result: { error: e instanceof Error ? e.message : String(e) },
        status: "error",
        errorCode: code,
      });
      throw e;
    }
  }

  private decorate(mode: CalendarMode, date: DateLabel) {
    const serial = dateToSerial(mode, date);
    const weekday = weekdayOfSerial(serial);
    return { mode, date: formatDate(date), ...date, serial, weekday };
  }

  validate(mode: string, date: DateLabel) {
    return this.run("validate", mode, { mode, date }, () => {
      const m = validateMode(mode);
      const info = this.decorate(m, date);
      return { valid: true, ...info };
    });
  }

  convert(fromMode: string, toMode: string, date: DateLabel) {
    return this.run("convert", fromMode, { fromMode, toMode, date }, () => {
      const from = validateMode(fromMode);
      const to = validateMode(toMode);
      const serial = dateToSerial(from, date);
      const target = serialToDate(to, serial);
      return {
        from: this.decorate(from, date),
        to: this.decorate(to, target),
        serial,
      };
    });
  }

  addDays(mode: string, date: DateLabel, days: number) {
    return this.run("addDays", mode, { mode, date, days }, () => {
      const m = validateMode(mode);
      if (!Number.isInteger(days)) {
        throw new CalendarError("INVALID_DAYS", `days 必须为整数，收到 ${days}`);
      }
      const serial = dateToSerial(m, date);
      const result = serialToDate(m, serial + days);
      return {
        from: this.decorate(m, date),
        days,
        result: this.decorate(m, result),
      };
    });
  }

  diffDays(mode: string, from: DateLabel, to: DateLabel) {
    return this.run("diffDays", mode, { mode, from, to }, () => {
      const m = validateMode(mode);
      const fromSerial = dateToSerial(m, from);
      const toSerial = dateToSerial(m, to);
      return {
        from: this.decorate(m, from),
        to: this.decorate(m, to),
        diffDays: toSerial - fromSerial,
      };
    });
  }

  weekday(mode: string, date: DateLabel) {
    return this.run("weekday", mode, { mode, date }, () => {
      const m = validateMode(mode);
      return this.decorate(m, date);
    });
  }

  monthDates(mode: string, year: number, month: number) {
    return this.run("monthDates", mode, { mode, year, month }, () => {
      const m = validateMode(mode);
      const { dates, skipped } = monthValidDates(m, year, month);
      return { mode: m, year, month, count: dates.length, dates, skipped };
    });
  }
}
