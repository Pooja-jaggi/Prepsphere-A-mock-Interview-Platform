const db = require('./database/db');
console.log(db.prepare("SELECT date(created_at) AS day, COUNT(*) AS count FROM interviews GROUP BY day").all());
console.log("Today per SQLite:", db.prepare("SELECT date('now') AS today").get());