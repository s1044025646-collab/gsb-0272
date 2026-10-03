// 演示脚本：先构建（npm run build），再运行 node scripts/demo.js
import { DateService } from '../dist/src/service.js';
import { HistoryStore } from '../dist/src/db.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const svc = new DateService(new HistoryStore(join(mkdtempSync(join(tmpdir(), 'datecal-demo-')), 'demo.db')));
const show = (title, v) => console.log(`\n== ${title} ==\n` + JSON.stringify(v, null, 2));

// 1. 同一日期文本在不同历法下是不同日子
show('同一文本 2000-01-01：格里高利 vs 儒略', {
  gregorian: svc.convert({ from: 'gregorian', to: 'julian', year: 2000, month: 1, day: 1 }),
  julian: svc.convert({ from: 'julian', to: 'gregorian', year: 2000, month: 1, day: 1 }),
});

// 2. 混合模式改革切换：4 日加一天到 15 日
show('混合模式 1582-10-04 + 1 天', svc.add({ calendar: 'mixed', year: 1582, month: 10, day: 4, days: 1 }));

// 3. 缺失标签报错
try {
  svc.convert({ from: 'mixed', to: 'gregorian', year: 1582, month: 10, day: 10 });
} catch (e) {
  show('混合模式 1582-10-10（不存在）', { code: e.code, message: e.message });
}

// 4. 改革月只有 21 个有效标签
const m = svc.month({ calendar: 'mixed', year: 1582, month: 10 });
show('混合模式 1582 年 10 月', {
  validCount: m.validCount,
  validDays: m.days.map((d) => d.day),
  missing: m.missing.map((d) => d.day),
});

// 5. 星期与差值
show('星期：格里高利 1970-01-01', svc.weekday({ calendar: 'gregorian', year: 1970, month: 1, day: 1 }));
show('差值：儒略 1582-10-04 -> 格里高利 1582-10-15', svc.diff({
  fromCalendar: 'julian', toCalendar: 'gregorian',
  from: { year: 1582, month: 10, day: 4 }, to: { year: 1582, month: 10, day: 15 },
}));
