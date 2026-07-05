const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

function readDB() {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function nextId(db, key) {
  const id = db.nextIds[key];
  db.nextIds[key] = id + 1;
  return id;
}

module.exports = { readDB, writeDB, nextId };
