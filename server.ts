import express from "express";
import cors from "cors";
import { Api } from "./api.ts";

const app = express();
const api = new Api();

app.use(cors());
app.use(express.json());

/**
 * GET /repeats
 */
app.get("/repeats", async (req, res) => {
  try {
    const repeats = await api.getRepeats();
    return res.json(repeats);
  } catch (err) {
    return res.status(500).json({
      error: (err as Error).message,
    });
  }
});

/**
 * GET /categories
 */
app.get("/categories", async (req, res) => {
  try {
    const categories = await api.getCategories();
    return res.json(categories);
  } catch (err) {
    return res.status(500).json({
      error: (err as Error).message,
    });
  }
});
/**
 * GET /cards
 * GET /cards?categoryIds=xxx,yyy,zzz
 */
app.get("/cards", async (req, res) => {
  try {
    if (typeof req.query.categoryIds !== 'string') {
      return res.status(401)
    }
    const categoryIds = req.query.categoryIds.split(",").filter(Boolean);
    const cards = await api.getAllCards({ categoryIds });
    return res.json(cards);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /cards/repeat
 * GET /cards/repeat?categoryIds=xxx,yyy,zzz
 */
app.get("/cards/repeat", async (req, res) => {
  try {
    if (typeof req.query.categoryIds !== 'string') {
      return res.status(401)
    }
    const categoryIds = req.query.categoryIds.split(",").filter(Boolean);
    const cards = await api.getRepeatCards({ categoryIds });
    return res.json(cards);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /cards/:id/learned
 * Body: { repeat_date_timestamp: number, repeat_after: { id: string } }
 */
app.post("/cards/:id/learned", async (req, res) => {
  try {
    const { repeat_date_timestamp, repeat_after } = req.body;
    await api.markCardLearned(req.params.id, repeat_date_timestamp, repeat_after);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({
      error: (err as Error).message,
    });
  }
});

/**
 * POST /cards/:id/not-learned
 */
app.post("/cards/:id/not-learned", async (req, res) => {
  try {
    await api.markCardNotLearned(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({
      error: (err as Error).message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
