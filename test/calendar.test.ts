import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGregorianLeap, isJulianLeap, gregorianToSerial, julianToSerial,
  serialToGregorian, serialToJulian, labelToSerial, serialToLabel,
  weekdayOfSerial, monthDays, CalError, REFORM_SERIAL, validateFields,
} from '../src/calendar.js';

// ---- 已知对应关系（外部基准，非自洽性检查）----

test('日序基准：格里高利 1970-01-01 = 0，星期四', () => {
  assert.equal(gregorianToSerial(1970, 1, 1), 0);
  assert.equal(weekdayOfSerial(0), 4); // Thursday
});

test('已知日序：格里高利 2000-01-01 = 10957，星期六', () => {
  assert.equal(gregorianToSerial(2000, 1, 1), 10957);
  assert.equal(weekdayOfSerial(10957), 6);
});

test('已知日序：格里高利 1900-01-01 = -25567，星期一', () => {
  assert.equal(gregorianToSerial(1900, 1, 1), -25567);
  assert.equal(weekdayOfSerial(-25567), 1);
});

test('已知星期：2024-02-29 星期四；1969-12-31 星期三', () => {
  assert.equal(weekdayOfSerial(gregorianToSerial(2024, 2, 29)), 4);
  assert.equal(weekdayOfSerial(gregorianToSerial(1969, 12, 31)), 3);
});

test('改革切换点：格里高利 1582-10-15 = -141427，星期五', () => {
  assert.equal(gregorianToSerial(1582, 10, 15), -141427);
  assert.equal(REFORM_SERIAL, -141427);
  assert.equal(weekdayOfSerial(-141427), 5);
});

test('儒略 1582-10-04 与格里高利 1582-10-14 同一天，星期四', () => {
  assert.equal(julianToSerial(1582, 10, 4), -141428);
  assert.equal(gregorianToSerial(1582, 10, 14), -141428);
  assert.equal(weekdayOfSerial(-141428), 4);
});

test('儒略 1900-02-29 = 格里高利 1900-03-13（偏移 13 天）', () => {
  assert.equal(julianToSerial(1900, 2, 29), gregorianToSerial(1900, 3, 13));
});

test('儒略 2000-01-01 = 格里高利 2000-01-14；跨历法同一天日序与星期相同', () => {
  const j = julianToSerial(2000, 1, 1);
  const g = gregorianToSerial(2000, 1, 14);
  assert.equal(j, g);
  assert.equal(weekdayOfSerial(j), weekdayOfSerial(g));
});

// ---- 闰年规则 ----

test('格里高利：1900 不闰，2000 闰，2024 闰', () => {
  assert.equal(isGregorianLeap(1900), false);
  assert.equal(isGregorianLeap(2000), true);
  assert.equal(isGregorianLeap(2024), true);
});

test('儒略：1900 仍闰', () => {
  assert.equal(isJulianLeap(1900), true);
  assert.equal(julianToSerial(1900, 2, 29), julianToSerial(1900, 3, 1) - 1);
});

test('格里高利 1900-02-29 非法', () => {
  assert.throws(() => labelToSerial('gregorian', 1900, 2, 29), (e: any) => e.code === 'INVALID_DAY');
});

// ---- 月底 / 年底 ----

test('月底与年底连续性', () => {
  assert.equal(gregorianToSerial(2023, 2, 1), gregorianToSerial(2023, 1, 31) + 1);
  assert.equal(gregorianToSerial(2024, 3, 1), gregorianToSerial(2024, 2, 29) + 1);
  assert.equal(gregorianToSerial(2024, 1, 1), gregorianToSerial(2023, 12, 31) + 1);
  assert.equal(julianToSerial(1583, 1, 1), julianToSerial(1582, 12, 31) + 1);
});

// ---- 混合模式 ----

test('混合模式：1582-10-04 加一天跨到 1582-10-15', () => {
  const s = labelToSerial('mixed', 1582, 10, 4);
  assert.equal(s, -141428);
  assert.deepEqual(serialToLabel('mixed', s + 1), { year: 1582, month: 10, day: 15 });
});

test('混合模式：1582-10-05..14 全部返回不存在，不规范化', () => {
  for (let d = 5; d <= 14; d++) {
    assert.throws(
      () => labelToSerial('mixed', 1582, 10, d),
      (e: any) => e instanceof CalError && e.code === 'DATE_NOT_EXIST',
    );
  }
});

test('混合模式：改革月只有 21 个有效标签，缺失 10 天', () => {
  const m = monthDays('mixed', 1582, 10);
  assert.equal(m.validCount, 21);
  assert.equal(m.missing.length, 10);
  assert.deepEqual(m.missing.map((x) => x.day), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  // 有效标签按真实连续日序排序
  for (let i = 1; i < m.days.length; i++) {
    assert.equal(m.days[i].serial, m.days[i - 1].serial + 1);
  }
  // 4 日之后紧接 15 日
  const i4 = m.days.findIndex((x) => x.day === 4);
  assert.equal(m.days[i4 + 1].day, 15);
});

test('混合模式：改革前用儒略规则（1580 儒略闰年 2-29 有效）', () => {
  assert.equal(labelToSerial('mixed', 1580, 2, 29), julianToSerial(1580, 2, 29));
});

// ---- 负向加日 / 年份边界 / 错误 ----

test('负向加日：日序 0 - 1 = 1969-12-31', () => {
  assert.deepEqual(serialToLabel('gregorian', -1), { year: 1969, month: 12, day: 31 });
});

test('年份边界：1-01-01 有效，0 年与 10000 年报错', () => {
  assert.ok(Number.isInteger(labelToSerial('gregorian', 1, 1, 1)));
  assert.throws(() => validateFields(0, 1, 1), (e: any) => e.code === 'INVALID_YEAR');
  assert.throws(() => validateFields(10000, 1, 1), (e: any) => e.code === 'INVALID_YEAR');
  assert.throws(() => serialToLabel('gregorian', gregorianToSerial(1, 1, 1) - 1), (e: any) => e.code === 'OUT_OF_RANGE');
  assert.throws(() => serialToLabel('gregorian', gregorianToSerial(9999, 12, 31) + 1), (e: any) => e.code === 'OUT_OF_RANGE');
});

// ---- 往返 / 连续 / 反对称 ----

test('合法范围内往返一致（抽样）', () => {
  for (const y of [1, 4, 100, 400, 1582, 1583, 1900, 2000, 9999]) {
    for (const m of [1, 2, 3, 12]) {
      const s = gregorianToSerial(y, m, 1);
      assert.deepEqual(serialToGregorian(s), { year: y, month: m, day: 1 });
      const js = julianToSerial(y, m, 1);
      assert.deepEqual(serialToJulian(js), { year: y, month: m, day: 1 });
    }
  }
});

test('连续日序：全年逐日 +1', () => {
  for (const y of [1582, 1900, 2000]) {
    let prev = gregorianToSerial(y, 1, 1);
    for (let i = 0; i < 400; i++) {
      const cur = prev + 1;
      const lbl = serialToGregorian(cur);
      assert.equal(gregorianToSerial(lbl.year, lbl.month, lbl.day), cur);
      prev = cur;
    }
  }
});

test('差值反对称：diff(a,b) = -diff(b,a)', () => {
  const a = gregorianToSerial(2024, 2, 29);
  const b = gregorianToSerial(1583, 3, 1);
  assert.equal(b - a, -(a - b));
  assert.equal(gregorianToSerial(2000, 3, 1) - gregorianToSerial(1900, 3, 1), 36525);
});

test('同一天文本在不同历法下是不同日子（演示数据）', () => {
  // 2000-01-01 在两种纯历法下相差 13 天
  assert.equal(julianToSerial(2000, 1, 1) - gregorianToSerial(2000, 1, 1), 13);
  // 1700-01-01 相差 10 天（1700-03-01 后变 11 天）（世纪闰年规则使偏移变化，不能用固定偏移代替）
  assert.equal(julianToSerial(1700, 1, 1) - gregorianToSerial(1700, 1, 1), 10);
});



