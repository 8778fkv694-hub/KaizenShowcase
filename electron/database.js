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
  }

  // 项目操作
  createProject(name, description = '') {
    const stmt = this.db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)');
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

  updateProject(id, name, description) {
    const stmt = this.db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    return stmt.run(name, description, id);
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
    const { name, description, improvementNote, beforeStart, beforeEnd, afterStart, afterEnd, processType = 'normal' } = data;
    const timeSaved = (beforeEnd - beforeStart) - (afterEnd - afterStart);

    const stmt = this.db.prepare(`
      INSERT INTO processes
      (stage_id, name, description, improvement_note, before_start_time, before_end_time,
       after_start_time, after_end_time, time_saved, sort_order, process_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const maxOrder = this.db.prepare('SELECT MAX(sort_order) as max FROM processes WHERE stage_id = ?').get(stageId);
    const sortOrder = (maxOrder?.max || 0) + 1;

    const result = stmt.run(stageId, name, description, improvementNote,
      beforeStart, beforeEnd, afterStart, afterEnd, timeSaved, sortOrder, processType);
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
    const { name, description, improvementNote, beforeStart, beforeEnd, afterStart, afterEnd, processType = 'normal' } = data;
    const timeSaved = (beforeEnd - beforeStart) - (afterEnd - afterStart);

    const stmt = this.db.prepare(`
      UPDATE processes
      SET name = ?, description = ?, improvement_note = ?,
          before_start_time = ?, before_end_time = ?,
          after_start_time = ?, after_end_time = ?, time_saved = ?, process_type = ?
      WHERE id = ?
    `);
    return stmt.run(name, description, improvementNote, beforeStart, beforeEnd,
      afterStart, afterEnd, timeSaved, processType, id);
  }

  deleteProcess(id) {
    const stmt = this.db.prepare('DELETE FROM processes WHERE id = ?');
    return stmt.run(id);
  }

  updateProcessOrder(id, newOrder) {
    const stmt = this.db.prepare('UPDATE processes SET sort_order = ? WHERE id = ?');
    return stmt.run(newOrder, id);
  }

  // 获取阶段的总时间节省
  getStageTotalTimeSaved(stageId) {
    const stmt = this.db.prepare('SELECT SUM(time_saved) as total FROM processes WHERE stage_id = ?');
    const result = stmt.get(stageId);
    return result?.total || 0;
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
