"""Create all tables from seed-data.ts into prisma/dev.db using vanilla Python."""
import sqlite3, re, sys

db_path = "E:/Program/Content Operation Platform/prisma/dev.db"
seed_path = "E:/Program/Content Operation Platform/prisma/seed-data.ts"

db = sqlite3.connect(db_path)
cur = db.cursor()

with open(seed_path, "r", encoding="utf-8") as f:
    source = f.read()

# Each table DDL lives between backticks in the TS source
# pattern: match sql between backticks (non-greedy)
with open(seed_path, "r", encoding="utf-8") as f:
    source = f.read()

# Extract all SQL CREATE statements between template literals
# Each backtick block containing DDL
import re
# pattern: content between backtick pairs that contain CREATE
blocks = re.findall(r'`\s*(CREATE\s+(?:TABLE|INDEX|UNIQUE).*?)\s*`[\s;]*', source, re.S)
saved = 0
for sql in blocks:
    sql = re.sub(r'\s+', ' ', sql).strip()
    if not sql or len(sql) < 10:
        continue
    try:
        cur.executescript(sql)
        saved += 1
    except Exception as e:
        pass

db.commit()

db.commit()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cur.fetchall()
print(f"Done: {len(tables)} tables")
for t in tables:
    cur.execute(f"PRAGMA table_info('{t[0]}')")
    cols = cur.fetchall()
    print(f"  {t[0]} ({len(cols)} cols)")
