import { formatTime, formatTimeSaved } from './time';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

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

/**
 * 导出为PDF报告（支持中文和缩略图）
 * @param {Object} project - 项目数据
 * @param {Object} stage - 阶段数据
 * @param {Array} processes - 工序列表
 * @returns {Blob} PDF Blob
 */
export async function exportToPDF(project, stage, processes) {
  // 计算汇总数据
  const totalSaved = processes.reduce((sum, p) => sum + (p.time_saved || 0), 0);
  const totalBefore = processes.reduce((sum, p) => sum + (p.before_end_time - p.before_start_time), 0);
  const totalAfter = processes.reduce((sum, p) => sum + (p.after_end_time - p.after_start_time), 0);
  const improvementRate = totalBefore > 0 ? ((totalSaved / totalBefore) * 100).toFixed(1) : 0;

  // 创建临时HTML容器
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.width = '800px';
  container.style.background = 'white';
  container.style.padding = '40px';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  // 生成HTML报告内容
  let html = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #667eea; font-size: 32px; margin: 0 0 10px 0;">改善效果报告</h1>
      <h2 style="color: #333; font-size: 20px; margin: 0;">${project.name} - ${stage.name}</h2>
      <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">导出时间: ${new Date().toLocaleString('zh-CN')}</p>
    </div>

    <div style="border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
      <h3 style="color: #667eea; font-size: 18px; margin: 0 0 15px 0;">改善概要</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">工序总数</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${processes.length}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">改善前总时长</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${formatTime(totalBefore)}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">改善后总时长</td>
          <td style="padding: 10px; border: 1px solid #dee2e6;">${formatTime(totalAfter)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">总节省时间</td>
          <td style="padding: 10px; border: 1px solid #dee2e6; color: #22c55e; font-weight: bold;">${formatTimeSaved(totalSaved)}</td>
        </tr>
        <tr style="background: #f8f9fa;">
          <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">改善率</td>
          <td style="padding: 10px; border: 1px solid #dee2e6; color: #667eea; font-weight: bold;">${improvementRate}%</td>
        </tr>
      </table>
    </div>

    <h3 style="color: #667eea; font-size: 18px; margin: 30px 0 15px 0;">工序明细</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
      <thead>
        <tr style="background: #667eea; color: white;">
          <th style="padding: 10px; border: 1px solid #667eea; text-align: center;">序号</th>
          <th style="padding: 10px; border: 1px solid #667eea;">缩略图</th>
          <th style="padding: 10px; border: 1px solid #667eea;">工序名称</th>
          <th style="padding: 10px; border: 1px solid #667eea; text-align: center;">改善前</th>
          <th style="padding: 10px; border: 1px solid #667eea; text-align: center;">改善后</th>
          <th style="padding: 10px; border: 1px solid #667eea; text-align: center;">节省时间</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (let i = 0; i < processes.length; i++) {
    const p = processes[i];
    const beforeDuration = p.before_end_time - p.before_start_time;
    const afterDuration = p.after_end_time - p.after_start_time;
    const bgColor = i % 2 === 0 ? '#f8f9fa' : 'white';

    // 处理缩略图
    let thumbnailHtml = '<div style="width: 60px; height: 40px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; color: #999; font-size: 20px;">' + (i + 1) + '</div>';
    if (p.thumbnail_path) {
      // 将文件路径转换为base64（需要在前端环境中处理）
      thumbnailHtml = `<img src="local-video://${p.thumbnail_path}" style="width: 60px; height: 40px; object-fit: cover;" onerror="this.style.display='none'"/>`;
    }

    html += `
      <tr style="background: ${bgColor};">
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">${i + 1}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${thumbnailHtml}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6;">${p.name}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">${formatTime(beforeDuration)}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center;">${formatTime(afterDuration)}</td>
        <td style="padding: 10px; border: 1px solid #dee2e6; text-align: center; color: ${p.time_saved >= 0 ? '#22c55e' : '#ef4444'}; font-weight: bold;">${formatTimeSaved(p.time_saved)}</td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
  `;

  // 改善说明
  const processesWithNotes = processes.filter(p => p.improvement_note);
  if (processesWithNotes.length > 0) {
    html += `<h3 style="color: #667eea; font-size: 18px; margin: 30px 0 15px 0;">改善说明</h3>`;
    processesWithNotes.forEach((p, idx) => {
      html += `
        <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-left: 4px solid #667eea;">
          <h4 style="margin: 0 0 8px 0; color: #333;">${idx + 1}. ${p.name}</h4>
          <p style="margin: 0; color: #666; line-height: 1.6;">${p.improvement_note}</p>
        </div>
      `;
    });
  }

  html += `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #999; font-size: 12px;">
      由改善效果展示系统自动生成 • ${new Date().toLocaleString('zh-CN')}
    </div>
  `;

  container.innerHTML = html;
  document.body.appendChild(container);

  // 等待图片加载
  const images = container.getElementsByTagName('img');
  await Promise.all(
    Array.from(images).map(img => {
      return new Promise((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = resolve;
          img.onerror = resolve;
        }
      });
    })
  );

  // 将HTML转换为canvas
  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  });

  // 移除临时容器
  document.body.removeChild(container);

  // 创建PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const imgData = canvas.toDataURL('image/png');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pdfWidth - 20; // 左右各留10mm边距
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 10; // 上边距10mm

  // 添加第一页
  pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
  heightLeft -= (pdfHeight - 20);

  // 如果内容超过一页，添加更多页
  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
    heightLeft -= (pdfHeight - 20);
  }

  return pdf.output('blob');
}
