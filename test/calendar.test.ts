import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CalendarError,
  dateToSerial,
  formatDate,
  gregorianToSerial,
  isGregorianLeap,
  isJulianLeap,
  julianToSerial,
  monthValidDates,
  serialToDate,
  serialToGregorian,
  serialToJulian,
  weekdayOfSerial,
} from "../src/calendar";
import { CalendarService } from "../src/service";

const svc = new CalendarService(null);

// ---------- 闰年规则 ----------
test("格里高利历：1900 不闰，2000 闰，2024 闰", () => {
  assert.equal(isGregorianLeap(1900), false);
  assert.equal(isGregorianLeap(2000), true);
  assert.equal(isGregorianLeap(2024), true);
  assert.equal(isGregorianLeap(2023), false);
});

test("儒略历：1900 仍是闰年", () => {
  assert.equal(isJulianLeap(1900), true);
  assert.equal(isJulianLeap(1901), false);
});

// ---------- 已知日期锚点（外部先验值，非自我往返） ----------
test("日序基准：格里高利 1970-01-01 = 0，且为星期四", () => {
  assert.equal(gregorianToSerial(1970, 1, 1), 0);
  const w = weekdayOfSerial(0);
  assert.equal(w.index, 4);
  assert.equal(w.nameZh, "星期四");
});

test("已知锚点：格里高利 2000-01-01 = 日序 10957，星期六", () => {
  assert.equal(gregorianToSerial(2000, 1, 1), 10957);
  assert.equal(weekdayOfSerial(10957).index, 6);
});

test("已知锚点：格里高利 1582-10-15 = 日序 -141427，星期五", () => {
  assert.equal(gregorianToSerial(1582, 10, 15), -141427);
  assert.equal(weekdayOfSerial(-141427).index, 5);
});

test("跨历法同一天：儒略 1969-12-19 与格里高利 1970-01-01 日序与星期相同", () => {
  const j = julianToSerial(1969, 12, 19);
  assert.equal(j, 0);
  assert.equal(weekdayOfSerial(j).index, 4);
});

test("跨历法同一天：儒略 1582-10-04 = 格里高利 1582-10-14", () => {
  assert.equal(julianToSerial(1582, 10, 4), gregorianToSerial(1582, 10, 14));
});

test("同一日期文本在不同历法下是不同日子", () => {
  const g = dateToSerial("gregorian", { year: 2024, month: 1, day: 1 });
  const j = dateToSerial("julian", { year: 2024, month: 1, day: 1 });
  assert.notEqual(g, j);
  assert.equal(j - g, 13); // 21 世纪偏移 13 天，且不是固定 10 天
  const g16 = dateToSerial("gregorian", { year: 1600, month: 3, day: 1 });
  const j16 = dateToSerial("julian", { year: 1600, month: 3, day: 1 });
  assert.equal(j16 - g16, 10); // 17 世纪偏移为 10 天，证明偏移随世纪变化
});

// ---------- 月底 / 年底 ----------
test("月底与年底换算", () => {
  assert.equal(formatDate(serialToGregorian(gregorianToSerial(2024, 2, 29))), "2024-02-29");
  assert.throws(
    () => dateToSerial("gregorian", { year: 2023, month: 2, day: 29 }),
    (e: any) => e.code === "INVALID_DAY"
  );
  // 年底跨年
  const r = svc.addDays("gregorian", { year: 2023, month: 12, day: 31 }, 1);
  assert.equal(r.result.date, "2024-01-01");
  // 儒略历 1900-02-29 合法
  assert.equal(formatDate(serialToJulian(julianToSerial(1900, 2, 29))), "1900-02-29");
});

// ---------- 改革切换 ----------
test("混合模式：1582-10-04 加一天 = 1582-10-15", () => {
  const r = svc.addDays("mixed", { year: 1582, month: 10, day: 4 }, 1);
  assert.equal(r.result.date, "1582-10-15");
  assert.equal(r.result.serial - r.from.serial, 1);
});

test("混合模式：改革前后相邻两天日序连续", () => {
  const a = dateToSerial("mixed", { year: 1582, month: 10, day: 4 });
  const b = dateToSerial("mixed", { year: 1582, month: 10, day: 15 });
  assert.equal(b - a, 1);
});

test("混合模式：1582-10-05 至 1582-10-14 必须报不存在", () => {
  for (let d = 5; d <= 14; d++) {
    assert.throws(
      () => dateToSerial("mixed", { year: 1582, month: 10, day: d }),
      (e: any) => e instanceof CalendarError && e.code === "NONEXISTENT_DATE"
    );
  }
});

test("混合模式：改革月只有 21 个有效标签，缺失 10 个", () => {
  const { dates, skipped } = monthValidDates("mixed", 1582, 10);
  assert.equal(dates.length, 21);
  assert.equal(skipped.length, 10);
  assert.deepEqual(skipped, [
    "1582-10-05", "1582-10-06", "1582-10-07", "1582-10-08", "1582-10-09",
    "1582-10-10", "1582-10-11", "1582-10-12", "1582-10-13", "1582-10-14",
  ]);
  // 按真实连续日序排序
  for (let i = 1; i < dates.length; i++) {
    assert.equal(dates[i].serial - dates[i - 1].serial, 1);
  }
});

// ---------- 加减天 / 差值 ----------
test("负向加日", () => {
  const r = svc.addDays("gregorian", { year: 1970, month: 1, day: 1 }, -1);
  assert.equal(r.result.date, "1969-12-31");
  assert.equal(r.result.serial, -1);
  const r2 = svc.addDays("mixed", { year: 1582, month: 10, day: 15 }, -1);
  assert.equal(r2.result.date, "1582-10-04");
});

test("差值定义为目标减来源，且反对称", () => {
  const a = svc.diffDays("gregorian", { year: 2024, month: 1, day: 1 }, { year: 2024, month: 3, day: 1 });
  const b = svc.diffDays("gregorian", { year: 2024, month: 3, day: 1 }, { year: 2024, month: 1, day: 1 });
  assert.equal(a.diffDays, 60); // 闰年 1 月 31 + 2 月 29
  assert.equal(b.diffDays, -60);
  assert.equal(a.diffDays + b.diffDays, 0);
});

// ---------- 边界与错误 ----------
test("年份边界：1 与 9999 合法，0 与 10000 报错", () => {
  assert.equal(formatDate(serialToDate("gregorian", dateToSerial("gregorian", { year: 1, month: 1, day: 1 }))), "0001-01-01");
  assert.equal(formatDate(serialToDate("gregorian", dateToSerial("gregorian", { year: 9999, month: 12, day: 31 }))), "9999-12-31");
  assert.throws(() => dateToSerial("gregorian", { year: 0, month: 1, day: 1 }), (e: any) => e.code === "INVALID_YEAR");
  assert.throws(() => dateToSerial("gregorian", { year: 10000, month: 1, day: 1 }), (e: any) => e.code === "INVALID_YEAR");
  assert.throws(() => svc.addDays("gregorian", { year: 9999, month: 12, day: 31 }, 1), (e: any) => e.code === "OUT_OF_RANGE");
  assert.throws(() => svc.addDays("gregorian", { year: 1, month: 1, day: 1 }, -1), (e: any) => e.code === "OUT_OF_RANGE");
});

test("非法月、非法日、非法模式、非整数天数", () => {
  assert.throws(() => dateToSerial("gregorian", { year: 2024, month: 13, day: 1 }), (e: any) => e.code === "INVALID_MONTH");
  assert.throws(() => dateToSerial("gregorian", { year: 2024, month: 4, day: 31 }), (e: any) => e.code === "INVALID_DAY");
  assert.throws(() => svc.weekday("lunar", { year: 2024, month: 1, day: 1 }), (e: any) => e.code === "INVALID_MODE");
  assert.throws(() => svc.addDays("gregorian", { year: 2024, month: 1, day: 1 }, 1.5), (e: any) => e.code === "INVALID_DAYS");
});

// ---------- 往返 / 连续性性质 ----------
test("合法范围内往返：serial -> date -> serial 恒等", () => {
  const samples = [0, -1, 1, 10957, -141427, -141428, 100000, -719162, 2000000];
  for (const mode of ["gregorian", "julian", "mixed"] as const) {
    for (const s of samples) {
      const d = serialToDate(mode, s);
      assert.equal(dateToSerial(mode, d), s, `${mode} serial=${s}`);
    }
  }
});

test("连续日序：逐日加一覆盖改革区间无间断", () => {
  let prev = dateToSerial("mixed", { year: 1582, month: 10, day: 1 });
  let cur = prev;
  const labels: string[] = [];
  for (let i = 0; i < 40; i++) {
    const d = serialToDate("mixed", cur);
    labels.push(formatDate(d));
    cur += 1;
  }
  assert.ok(labels.includes("1582-10-04"));
  assert.ok(labels.includes("1582-10-15"));
  assert.ok(!labels.some((l) => /1582-10-(0[5-9]|1[0-4])/.test(l)));
  void prev;
});

test("星期样例：已知日期星期核对", () => {
  const cases: [number, number, number, number][] = [
    [1970, 1, 1, 4],   // 星期四
    [2000, 1, 1, 6],   // 星期六
    [2024, 1, 1, 1],   // 星期一
    [1582, 10, 15, 5], // 星期五（格里高利）
    [1999, 12, 31, 5], // 星期五
  ];
  for (const [y, m, d, idx] of cases) {
    const s = gregorianToSerial(y, m, d);
    assert.equal(weekdayOfSerial(s).index, idx, `${y}-${m}-${d}`);
  }
});

test("月份清单：格里高利 2024-02 有 29 天，2023-02 有 28 天", () => {
  assert.equal(monthValidDates("gregorian", 2024, 2).dates.length, 29);
  assert.equal(monthValidDates("gregorian", 2023, 2).dates.length, 28);
  assert.equal(monthValidDates("julian", 1900, 2).dates.length, 29);
  assert.equal(monthValidDates("gregorian", 1900, 2).dates.length, 28);
});
