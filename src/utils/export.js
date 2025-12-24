import { formatTime, formatTimeSaved } from './time';

/**
 * 导出为CSV格式
 * @param {Object} stage - 阶段数据
 * @param {Array} processes - 工序列表
 * @returns {string} CSV内容
 */
export function exportToCSV(stage, processes) {
  const headers = [
    '序号',
    '工序名称',
    '类型',
    '改善前时长(秒)',
    '改善后时长(秒)',
    '节省时间(秒)',
    '改善说明'
  ];

  const rows = processes.map((p, idx) => [
    idx + 1,
    p.name,
    getProcessTypeName(p.process_type),
    (p.before_end_time - p.before_start_time).toFixed(1),
    (p.after_end_time - p.after_start_time).toFixed(1),
    (p.time_saved || 0).toFixed(1),
    `"${(p.improvement_note || '').replace(/"/g, '""')}"`
  ]);

  const totalSaved = processes.reduce((sum, p) => sum + (p.time_saved || 0), 0);
  rows.push(['', '总计', '', '', '', totalSaved.toFixed(1), '']);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return '\uFEFF' + csvContent; // 添加BOM以支持Excel中文
}

/**
 * 导出为JSON格式
 * @param {Object} project - 项目数据
 * @param {Object} stage - 阶段数据
 * @param {Array} processes - 工序列表
 * @returns {string} JSON内容
 */
export function exportToJSON(project, stage, processes) {
  const data = {
    exportTime: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      description: project.description
    },
    stage: {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      beforeVideoPath: stage.before_video_path,
      afterVideoPath: stage.after_video_path
    },
    processes: processes.map((p, idx) => ({
      order: idx + 1,
      name: p.name,
      description: p.description,
      type: p.process_type,
      beforeStartTime: p.before_start_time,
      beforeEndTime: p.before_end_time,
      afterStartTime: p.after_start_time,
      afterEndTime: p.after_end_time,
      timeSaved: p.time_saved,
      improvementNote: p.improvement_note
    })),
    summary: {
      totalProcesses: processes.length,
      totalTimeSaved: processes.reduce((sum, p) => sum + (p.time_saved || 0), 0),
      totalBeforeTime: processes.reduce((sum, p) => sum + (p.before_end_time - p.before_start_time), 0),
      totalAfterTime: processes.reduce((sum, p) => sum + (p.after_end_time - p.after_start_time), 0)
    }
  };

  return JSON.stringify(data, null, 2);
}

/**
 * 导出为Markdown报告
 * @param {Object} project - 项目数据
 * @param {Object} stage - 阶段数据
 * @param {Array} processes - 工序列表
 * @returns {string} Markdown内容
 */
export function exportToMarkdown(project, stage, processes) {
  const totalSaved = processes.reduce((sum, p) => sum + (p.time_saved || 0), 0);
  const totalBefore = processes.reduce((sum, p) => sum + (p.before_end_time - p.before_start_time), 0);
  const totalAfter = processes.reduce((sum, p) => sum + (p.after_end_time - p.after_start_time), 0);

  let md = `# ${project.name} - 改善报告

## 阶段信息
- **阶段名称**: ${stage.name}
- **阶段描述**: ${stage.description || '无'}
- **导出时间**: ${new Date().toLocaleString('zh-CN')}

## 改善概要

| 指标 | 数值 |
|------|------|
| 工序总数 | ${processes.length} |
| 改善前总时长 | ${formatTime(totalBefore)} |
| 改善后总时长 | ${formatTime(totalAfter)} |
| **总节省时间** | **${formatTimeSaved(totalSaved)}** |

## 工序明细

| 序号 | 工序名称 | 类型 | 改善前 | 改善后 | 节省时间 |
|------|----------|------|--------|--------|----------|
`;

  processes.forEach((p, idx) => {
    const beforeDuration = p.before_end_time - p.before_start_time;
    const afterDuration = p.after_end_time - p.after_start_time;
    md += `| ${idx + 1} | ${p.name} | ${getProcessTypeName(p.process_type)} | ${formatTime(beforeDuration)} | ${formatTime(afterDuration)} | ${formatTimeSaved(p.time_saved)} |\n`;
  });

  md += `\n## 改善说明详情\n\n`;

  processes.forEach((p, idx) => {
    if (p.improvement_note) {
      md += `### ${idx + 1}. ${p.name}\n\n${p.improvement_note}\n\n`;
    }
  });

  md += `\n---\n*本报告由改善效果展示系统自动生成*\n`;

  return md;
}

/**
 * 下载文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 获取工序类型名称
 */
function getProcessTypeName(type) {
  const types = {
    'normal': '正常',
    'new_step': '新增',
    'cancelled': '取消'
  };
  return types[type] || '正常';
}
