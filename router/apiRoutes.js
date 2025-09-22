import express from 'express';

const router = express.Router();

router.get("/panel", (req, res) => {
  res.json({ message: "Panel data" });
});

export default router;