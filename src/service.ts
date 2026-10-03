import {
  CalendarId, CalError, labelToSerial, serialToLabel, weekdayOfSerial,
  WEEKDAY_NAMES_ZH, monthDays, validateFields, daysInMonth, isLeap,
} from './calendar.js';
import { HistoryStore } from './db.js';

export function parseCalendar(v: unknown): CalendarId {
  if (v === 'gregorian' || v === 'julian' || v === 'mixed') return v;
  throw new CalError('BAD_REQUEST', `calendar 必须是 gregorian | julian | mixed，收到 ${JSON.stringify(v)}`);
}

function dateOut(calendar: CalendarId, serial: number) {
  const label = serialToLabel(calendar, serial);
  const wd = weekdayOfSerial(serial);
  return { ...label, serial, weekday: wd, weekdayName: WEEKDAY_NAMES_ZH[wd] };
}

export class DateService {
  constructor(private store: HistoryStore | null) {}

  private log(kind: string, mode: string, request: unknown, result: unknown) {
    this.store?.record(kind, mode, request, result);
  }

  validate(body: any) {
    const calendar = parseCalendar(body.calendar);
    const { year, month, day } = validateFields(body.year, body.month, body.day);
    const dim = daysInMonth(calendar, year, month);
    let result: any;
    try {
      const serial = labelToSerial(calendar, year, month, day);
      result = { valid: true, calendar, year, month, day, serial, leap: isLeap(calendar, year), daysInMonth: dim };
    } catch (e) {
      if (e instanceof CalError && (e.code === 'DATE_NOT_EXIST' || e.code === 'INVALID_DAY')) {
        result = { valid: false, calendar, year, month, day, reason: e.code, message: e.message, daysInMonth: dim };
      } else {
        throw e;
      }
    }
    this.log('validate', calendar, body, result);
    return result;
  }

  convert(body: any) {
    const from = parseCalendar(body.from);
    const to = parseCalendar(body.to);
    const { year, month, day } = validateFields(body.year, body.month, body.day);
    const serial = labelToSerial(from, year, month, day);
    const result = {
      from: { calendar: from, year, month, day },
      to: { calendar: to, ...serialToLabel(to, serial) },
      serial,
      weekday: weekdayOfSerial(serial),
      weekdayName: WEEKDAY_NAMES_ZH[weekdayOfSerial(serial)],
    };
    this.log('convert', `${from}->${to}`, body, result);
    return result;
  }

  add(body: any) {
    const calendar = parseCalendar(body.calendar);
    const { year, month, day } = validateFields(body.year, body.month, body.day);
    if (typeof body.days !== 'number' || !Number.isInteger(body.days)) {
      throw new CalError('BAD_REQUEST', 'days 必须是整数（可为负）');
    }
    const serial = labelToSerial(calendar, year, month, day);
    const target = serial + body.days;
    const result = {
      calendar,
      from: { year, month, day, serial },
      days: body.days,
      to: dateOut(calendar, target),
    };
    this.log('add', calendar, body, result);
    return result;
  }

  diff(body: any) {
    const fromCal = parseCalendar(body.fromCalendar ?? body.calendar);
    const toCal = parseCalendar(body.toCalendar ?? body.calendar);
    const f = validateFields(body.from?.year, body.from?.month, body.from?.day);
    const t = validateFields(body.to?.year, body.to?.month, body.to?.day);
    const fromSerial = labelToSerial(fromCal, f.year, f.month, f.day);
    const toSerial = labelToSerial(toCal, t.year, t.month, t.day);
    const result = {
      from: { calendar: fromCal, ...f, serial: fromSerial },
      to: { calendar: toCal, ...t, serial: toSerial },
      days: toSerial - fromSerial, // 目标日序 - 来源日序
    };
    this.log('diff', `${fromCal}->${toCal}`, body, result);
    return result;
  }

  weekday(body: any) {
    const calendar = parseCalendar(body.calendar);
    const { year, month, day } = validateFields(body.year, body.month, body.day);
    const serial = labelToSerial(calendar, year, month, day);
    const wd = weekdayOfSerial(serial);
    const result = { calendar, year, month, day, serial, weekday: wd, weekdayName: WEEKDAY_NAMES_ZH[wd] };
    this.log('weekday', calendar, body, result);
    return result;
  }

  month(query: any) {
    const calendar = parseCalendar(query.calendar);
    const year = Number(query.year);
    const month = Number(query.month);
    validateFields(year, month, 1);
    const result = monthDays(calendar, year, month);
    this.log('month', calendar, query, { validCount: result.validCount, missing: result.missing });
    return result;
  }

  history(limit = 50) {
    return this.store?.list(limit) ?? [];
  }
}
