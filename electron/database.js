const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class DatabaseManager {
  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'improvement.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  initDatabase() {
    // 项目表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        narration_speed REAL DEFAULT 5.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 改善阶段表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        before_video_path TEXT,
        after_video_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // 工序表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        improvement_note TEXT,
        before_start_time REAL NOT NULL,
        before_end_time REAL NOT NULL,
        after_start_time REAL NOT NULL,
        after_end_time REAL NOT NULL,
        time_saved REAL,
        sort_order INTEGER DEFAULT 0,
        process_type TEXT DEFAULT 'normal',
        FOREIGN KEY (stage_id) REFERENCES stages(id) ON DELETE CASCADE
      )
    `);

    // 为现有表添加 process_type 列（如果不存在）
    try {
      this.db.exec(`
        ALTER TABLE processes ADD COLUMN process_type TEXT DEFAULT 'normal'
      `);
    } catch (e) {
      // 列已存在，忽略错误
    }

    try {
      this.db.exec(`
        ALTER TABLE processes ADD COLUMN subtitle_text TEXT
      `);
    } catch (e) {
      // 列已存在，忽略错误
    }

    try {
      this.db.exec(`
        ALTER TABLE projects ADD COLUMN narration_speed REAL DEFAULT 5.0
      `);
    } catch (e) {
      // 列已存在，忽略错误
    }

    // 添加缩略图字段
    try {
      this.db.exec(`
        ALTER TABLE processes ADD COLUMN thumbnail_path TEXT
      `);
    } catch (e) {
      // 列已存在，忽略错误
    }

    // 字幕设置表（应用级别）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtitle_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        font_size INTEGER DEFAULT 24,
        text_color TEXT DEFAULT '#FFFFFF',
        highlight_color TEXT DEFAULT '#FFD700',
        bg_color TEXT DEFAULT '#000000',
        bg_opacity REAL DEFAULT 0.7,
        max_lines INTEGER DEFAULT 2,
        position_x REAL DEFAULT 50,
        position_y REAL DEFAULT 85,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 确保有一条默认设置记录
    const existingSettings = this.db.prepare('SELECT id FROM subtitle_settings WHERE id = 1').get();
    if (!existingSettings) {
      this.db.prepare('INSERT INTO subtitle_settings (id) VALUES (1)').run();
    }

    // 标注表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id INTEGER NOT NULL,
        video_type TEXT NOT NULL,
        annotation_type TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        width REAL,
        height REAL,
        end_x REAL,
        end_y REAL,
        text TEXT,
        color TEXT DEFAULT '#FF0000',
        stroke_width INTEGER DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
      )
    `);
  }

  // 项目操作
  createProject(name, description = '') {
    const stmt = this.db.prepare('INSERT INTO projects (name, description, narration_speed) VALUES (?, ?, 5.0)');
    const result = stmt.run(name, description);
    return result.lastInsertRowid;
  }

  getAllProjects() {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
    return stmt.all();
  }

  getProject(id) {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id);
  }

  updateProject(id, name, description, narrationSpeed = 5.0) {
    const stmt = this.db.prepare('UPDATE projects SET name = ?, description = ?, narration_speed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(name, description, narrationSpeed, id);
  }

  deleteProject(id) {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    return stmt.run(id);
  }

  // 阶段操作
  createStage(projectId, name, description = '') {
    const stmt = this.db.prepare('INSERT INTO stages (project_id, name, description) VALUES (?, ?, ?)');
    const result = stmt.run(projectId, name, description);
    return result.lastInsertRowid;
  }

  getStagesByProject(projectId) {
    const stmt = this.db.prepare('SELECT * FROM stages WHERE project_id = ? ORDER BY created_at');
    return stmt.all(projectId);
  }

  getStage(id) {
    const stmt = this.db.prepare('SELECT * FROM stages WHERE id = ?');
    return stmt.get(id);
  }

  updateStage(id, data) {
    const { name, description, beforeVideoPath, afterVideoPath } = data;
    const stmt = this.db.prepare(`
      UPDATE stages
      SET name = ?, description = ?, before_video_path = ?, after_video_path = ?
      WHERE id = ?
    `);
    return stmt.run(name, description, beforeVideoPath, afterVideoPath, id);
  }

  deleteStage(id) {
    const stmt = this.db.prepare('DELETE FROM stages WHERE id = ?');
    return stmt.run(id);
  }

  // 工序操作
  createProcess(stageId, data) {
    const { name, description, improvementNote, beforeStart, beforeEnd, afterStart, afterEnd, processType = 'normal', subtitleText = '' } = data;
    const timeSaved = (beforeEnd - beforeStart) - (afterEnd - afterStart);

    const stmt = this.db.prepare(`
      INSERT INTO processes
      (stage_id, name, description, improvement_note, before_start_time, before_end_time,
       after_start_time, after_end_time, time_saved, sort_order, process_type, subtitle_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM processes WHERE stage_id = ?').get(stageId);
    const sortOrder = (maxOrder?.max || 0) + 1;

    const result = stmt.run(stageId, name, description, improvementNote,
      beforeStart, beforeEnd, afterStart, afterEnd, timeSaved, sortOrder, processType, subtitleText);
    return result.lastInsertRowid;
  }

  getProcessesByStage(stageId) {
    const stmt = this.db.prepare('SELECT * FROM processes WHERE stage_id = ? ORDER BY sort_order');
    return stmt.all(stageId);
  }

  getProcess(id) {
    const stmt = this.db.prepare('SELECT * FROM processes WHERE id = ?');
    return stmt.get(id);
  }

  updateProcess(id, data) {
    const { name, description, improvementNote, beforeStart, beforeEnd, afterStart, afterEnd, processType = 'normal', subtitleText = '' } = data;
    const timeSaved = (beforeEnd - beforeStart) - (afterEnd - afterStart);

    const stmt = this.db.prepare(`
      UPDATE processes
      SET name = ?, description = ?, improvement_note = ?,
          before_start_time = ?, before_end_time = ?,
          after_start_time = ?, after_end_time = ?, time_saved = ?, process_type = ?,
          subtitle_text = ?
      WHERE id = ?
    `);
    return stmt.run(name, description, improvementNote, beforeStart, beforeEnd,
      afterStart, afterEnd, timeSaved, processType, subtitleText, id);
  }

  deleteProcess(id) {
    const stmt = this.db.prepare('DELETE FROM processes WHERE id = ?');
    return stmt.run(id);
  }

  updateProcessOrder(id, newOrder) {
    const stmt = this.db.prepare('UPDATE processes SET sort_order = ? WHERE id = ?');
    return stmt.run(newOrder, id);
  }

  updateProcessThumbnail(id, thumbnailPath) {
    const stmt = this.db.prepare('UPDATE processes SET thumbnail_path = ? WHERE id = ?');
    return stmt.run(thumbnailPath, id);
  }

  // 获取阶段的总时间节省
  getStageTotalTimeSaved(stageId) {
    const stmt = this.db.prepare('SELECT SUM(time_saved) as total FROM processes WHERE stage_id = ?');
    const result = stmt.get(stageId);
    return result?.total || 0;
  }

  // 标注操作
  createAnnotation(processId, data) {
    const {
      videoType, annotationType, startTime, endTime,
      x, y, width, height, endX, endY,
      text, color, strokeWidth
    } = data;

    const stmt = this.db.prepare(`
      INSERT INTO annotations
      (process_id, video_type, annotation_type, start_time, end_time,
       x, y, width, height, end_x, end_y, text, color, stroke_width)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      processId, videoType, annotationType, startTime, endTime,
      x, y, width, height, endX, endY, text, color, strokeWidth
    );
    return result.lastInsertRowid;
  }

  getAnnotationsByProcess(processId, videoType = null) {
    if (videoType) {
      const stmt = this.db.prepare(
        'SELECT * FROM annotations WHERE process_id = ? AND video_type = ? ORDER BY start_time'
      );
      return stmt.all(processId, videoType);
    }
    const stmt = this.db.prepare('SELECT * FROM annotations WHERE process_id = ? ORDER BY start_time');
    return stmt.all(processId);
  }

  getAnnotation(id) {
    const stmt = this.db.prepare('SELECT * FROM annotations WHERE id = ?');
    return stmt.get(id);
  }

  updateAnnotation(id, data) {
    const {
      startTime, endTime, x, y, width, height,
      endX, endY, text, color, strokeWidth
    } = data;

    const stmt = this.db.prepare(`
      UPDATE annotations
      SET start_time = ?, end_time = ?, x = ?, y = ?,
          width = ?, height = ?, end_x = ?, end_y = ?,
          text = ?, color = ?, stroke_width = ?
      WHERE id = ?
    `);
    return stmt.run(
      startTime, endTime, x, y, width, height,
      endX, endY, text, color, strokeWidth, id
    );
  }

  deleteAnnotation(id) {
    const stmt = this.db.prepare('DELETE FROM annotations WHERE id = ?');
    return stmt.run(id);
  }

  // 字幕设置操作
  getSubtitleSettings() {
    const stmt = this.db.prepare('SELECT * FROM subtitle_settings WHERE id = 1');
    return stmt.get();
  }

  updateSubtitleSettings(settings) {
    const {
      fontSize = 24,
      textColor = '#FFFFFF',
      highlightColor = '#FFD700',
      bgColor = '#000000',
      bgOpacity = 0.7,
      maxLines = 2,
      positionX = 50,
      positionY = 85
    } = settings;

    const stmt = this.db.prepare(`
      UPDATE subtitle_settings
      SET font_size = ?, text_color = ?, highlight_color = ?, bg_color = ?,
          bg_opacity = ?, max_lines = ?, position_x = ?, position_y = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    return stmt.run(fontSize, textColor, highlightColor, bgColor, bgOpacity, maxLines, positionX, positionY);
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
