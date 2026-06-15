import { describe, it, expect } from 'vitest';
import { exportToCSV } from '../export';

const proc = (over = {}) => ({
  name: '工序A',
  process_type: 'normal',
  before_start_time: 0,
  before_end_time: 10,
  after_start_time: 0,
  after_end_time: 6,
  time_saved: 4,
  improvement_note: '',
  ...over,
});

describe('exportToCSV', () => {
  it('输出含 BOM、表头与总计行', () => {
    const csv = exportToCSV({ name: '阶段1' }, [proc()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('工序名称');
    expect(csv).toContain('总计');
  });

  it('正确计算前后时长与节省', () => {
    const csv = exportToCSV({}, [proc({ before_end_time: 10, after_end_time: 6, time_saved: 4 })]);
    const dataLine = csv.split('\n').find((l) => l.includes('工序A'));
    expect(dataLine).toContain('10.0'); // 改善前
    expect(dataLine).toContain('6.0'); // 改善后
    expect(dataLine).toContain('4.0'); // 节省
  });

  it('含逗号的字段被引号包裹', () => {
    const csv = exportToCSV({}, [proc({ improvement_note: '减少搬运,优化动作' })]);
    expect(csv).toContain('"减少搬运,优化动作"');
  });

  it('含双引号的字段被转义为两个双引号并整体包裹', () => {
    const csv = exportToCSV({}, [proc({ name: '工序"特殊"' })]);
    expect(csv).toContain('"工序""特殊"""');
  });

  it('含换行的字段被引号包裹', () => {
    const csv = exportToCSV({}, [proc({ improvement_note: '第一行\n第二行' })]);
    expect(csv).toContain('"第一行\n第二行"');
  });

  it('空/缺失字段安全处理为空串', () => {
    const csv = exportToCSV({}, [proc({ improvement_note: null, time_saved: null })]);
    expect(csv).toContain('0.0'); // time_saved 缺失记 0
    // 不抛错即通过
    expect(typeof csv).toBe('string');
  });
});
