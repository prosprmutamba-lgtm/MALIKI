require('dotenv').config();
const readline = require('readline'), bcrypt = require('bcryptjs'), mysql = require('mysql2/promise');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));
(async () => {
  const email = (await ask('E-mail administrateur : ')).trim().toLowerCase();
  const pw = await ask('Mot de passe (12 caractères min.) : ');
  rl.close();
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 12) throw new Error('E-mail invalide ou mot de passe trop court.');
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await c.execute('INSERT INTO admins (email, password_hash) VALUES (?, ?)', [email, await bcrypt.hash(pw, 12)]);
  console.log('Administrateur créé.'); await c.end();
})().catch(e => { console.error('Échec :', e.message); process.exit(1); });
