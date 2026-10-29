require('dotenv').config();
const fs = require('fs'), path = require('path'), mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8').replace(/^--.*$/gm, '');
  for (const s of sql.split(';').map(x => x.trim()).filter(Boolean)) await c.query(s);
  console.log('Base de données à jour.'); await c.end();
})().catch(e => { console.error('Échec :', e.message); process.exit(1); });
