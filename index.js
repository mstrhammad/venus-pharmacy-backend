const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { readDB, writeDB, nextId } = require("./db");

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

const ADMIN_EMAIL = "test@123.com";
const ADMIN_PASSWORD = "test123";

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return res.json({ message: "success", token: "venus-" + Date.now() });
  }
  return res.status(401).json({ message: "Email or password is invalid" });
});

app.get("/allData", (req, res) => {
  const db = readDB();
  res.json(db);
});

function computeAmount(qty, price, discount) {
  const q = Number(qty) || 0;
  const p = Number(price) || 0;
  const d = Number(discount) || 0;
  const gross = q * p;
  return Math.round((gross - (gross * d) / 100) * 100) / 100;
}

function findMedicine(db, id) {
  return db.medicines.find((m) => m.id === Number(id));
}

app.get("/medicines", (req, res) => {
  const db = readDB();
  res.json(db.medicines);
});

app.post("/medicines", (req, res) => {
  const { name, mg, price } = req.body;
  if (!name || !mg || price === undefined || price === "") {
    return res.status(400).json({ message: "name, mg and price are required" });
  }
  const db = readDB();
  const medicine = {
    id: nextId(db, "medicines"),
    name: String(name).trim(),
    mg: String(mg).trim(),
    price: Number(price),
    quantity: 0,
  };
  db.medicines.push(medicine);
  writeDB(db);
  res.status(201).json(medicine);
});

app.put("/medicines/:id", (req, res) => {
  const db = readDB();
  const medicine = findMedicine(db, req.params.id);
  if (!medicine) return res.status(404).json({ message: "Medicine not found" });

  const { name, mg, price } = req.body;
  if (name !== undefined) medicine.name = String(name).trim();
  if (mg !== undefined) medicine.mg = String(mg).trim();
  if (price !== undefined) medicine.price = Number(price);

  writeDB(db);
  res.json(medicine);
});

app.delete("/medicines/:id", (req, res) => {
  const db = readDB();
  const idx = db.medicines.findIndex((m) => m.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Medicine not found" });

  const [removed] = db.medicines.splice(idx, 1);
  writeDB(db);
  res.json(removed);
});

app.get("/purchases", (req, res) => {
  const db = readDB();
  const sorted = [...db.purchases].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(sorted);
});

app.post("/purchases", (req, res) => {
  const { medicineId, qty, price, discount } = req.body;
  const db = readDB();
  const medicine = findMedicine(db, medicineId);
  if (!medicine) return res.status(400).json({ message: "Please select a valid medicine" });
  const qtyNum = Number(qty);
  if (!qtyNum || qtyNum <= 0) return res.status(400).json({ message: "Quantity must be greater than 0" });

  const purchase = {
    id: nextId(db, "purchases"),
    medicineId: medicine.id,
    name: medicine.name,
    mg: medicine.mg,
    qty: qtyNum,
    price: Number(price) || medicine.price,
    discount: Number(discount) || 0,
    amount: computeAmount(qtyNum, Number(price) || medicine.price, Number(discount) || 0),
    date: new Date().toISOString(),
  };

  medicine.quantity = Number(medicine.quantity || 0) + qtyNum;

  db.purchases.push(purchase);
  writeDB(db);
  res.status(201).json({ purchase, medicine });
});

app.put("/purchases/:id", (req, res) => {
  const db = readDB();
  const purchase = db.purchases.find((p) => p.id === Number(req.params.id));
  if (!purchase) return res.status(404).json({ message: "Purchase record not found" });

  const medicine = findMedicine(db, purchase.medicineId);
  const { qty, price, discount } = req.body;
  const newQty = qty !== undefined ? Number(qty) : purchase.qty;
  const newPrice = price !== undefined ? Number(price) : purchase.price;
  const newDiscount = discount !== undefined ? Number(discount) : purchase.discount;

  if (medicine) {
    const delta = newQty - purchase.qty;
    if (Number(medicine.quantity || 0) + delta < 0) {
      return res.status(400).json({ message: "Cannot reduce below zero stock" });
    }
    medicine.quantity = Number(medicine.quantity || 0) + delta;
  }

  purchase.qty = newQty;
  purchase.price = newPrice;
  purchase.discount = newDiscount;
  purchase.amount = computeAmount(newQty, newPrice, newDiscount);

  writeDB(db);
  res.json({ purchase, medicine });
});

app.delete("/purchases/:id", (req, res) => {
  const db = readDB();
  const idx = db.purchases.findIndex((p) => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Purchase record not found" });

  const [removed] = db.purchases.splice(idx, 1);
  const medicine = findMedicine(db, removed.medicineId);
  if (medicine) {
    medicine.quantity = Math.max(0, Number(medicine.quantity || 0) - removed.qty);
  }

  writeDB(db);
  res.json({ removed, medicine });
});

app.get("/sales", (req, res) => {
  const db = readDB();
  const sorted = [...db.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(sorted);
});

app.post("/sales", (req, res) => {
  const { medicineId, qty, price, discount } = req.body;
  const db = readDB();
  const medicine = findMedicine(db, medicineId);
  if (!medicine) return res.status(400).json({ message: "Please select a valid medicine" });
  const qtyNum = Number(qty);
  if (!qtyNum || qtyNum <= 0) return res.status(400).json({ message: "Quantity must be greater than 0" });
  if (Number(medicine.quantity || 0) < qtyNum) {
    return res.status(400).json({ message: `Insufficient stock. Only ${medicine.quantity} available` });
  }

  const sale = {
    id: nextId(db, "sales"),
    medicineId: medicine.id,
    name: medicine.name,
    mg: medicine.mg,
    qty: qtyNum,
    price: Number(price) || medicine.price,
    discount: Number(discount) || 0,
    amount: computeAmount(qtyNum, Number(price) || medicine.price, Number(discount) || 0),
    date: new Date().toISOString(),
  };

  medicine.quantity = Number(medicine.quantity || 0) - qtyNum;

  db.sales.push(sale);
  writeDB(db);
  res.status(201).json({ sale, medicine });
});

app.put("/sales/:id", (req, res) => {
  const db = readDB();
  const sale = db.sales.find((s) => s.id === Number(req.params.id));
  if (!sale) return res.status(404).json({ message: "Sale record not found" });

  const medicine = findMedicine(db, sale.medicineId);
  const { qty, price, discount } = req.body;
  const newQty = qty !== undefined ? Number(qty) : sale.qty;
  const newPrice = price !== undefined ? Number(price) : sale.price;
  const newDiscount = discount !== undefined ? Number(discount) : sale.discount;

  if (medicine) {
    const delta = newQty - sale.qty; // positive delta means selling MORE than before
    if (delta > 0 && Number(medicine.quantity || 0) < delta) {
      return res.status(400).json({ message: `Insufficient stock. Only ${medicine.quantity} available` });
    }
    medicine.quantity = Number(medicine.quantity || 0) - delta;
  }

  sale.qty = newQty;
  sale.price = newPrice;
  sale.discount = newDiscount;
  sale.amount = computeAmount(newQty, newPrice, newDiscount);

  writeDB(db);
  res.json({ sale, medicine });
});

app.delete("/sales/:id", (req, res) => {
  const db = readDB();
  const idx = db.sales.findIndex((s) => s.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ message: "Sale record not found" });

  const [removed] = db.sales.splice(idx, 1);
  const medicine = findMedicine(db, removed.medicineId);
  if (medicine) {
    medicine.quantity = Number(medicine.quantity || 0) + removed.qty; // restock
  }

  writeDB(db);
  res.json({ removed, medicine });
});

app.listen(port, () => {
  console.log(`Venus Pharmacy backend listening on port ${port}`);
});
