const Database =require('better-sqlite3');
const path =require('path');

const db=new Database(path.join(__dirname,'prepsphere.db'));
//Create user table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )
`);
console.log('Database connected and tables are ready.');
db.exec(`
    CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        project_url TEXT,
        mode TEXT,
        difficulty TEXT,
        tech_used TEXT,
        score INTEGER,
        confidence_level TEXT,
        improvement_areas TEXT,
        status TEXT DEFAULT 'incomplete',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);
module.exports=db;
