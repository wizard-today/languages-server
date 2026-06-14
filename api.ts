import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ══════════════════════════════════════════════════════════
   ENV
══════════════════════════════════════════════════════════ */

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD!;   // service_role key

if (!SUPABASE_URL || !SUPABASE_PASSWORD) {
  throw new Error("Нужно установить SUPABASE_URL и SUPABASE_PASSWORD");
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PASSWORD);

/* ══════════════════════════════════════════════════════════
   ТИПЫ
══════════════════════════════════════════════════════════ */

export interface Repeat {
  id:        string;
  duration:  string;
  timestamp: number;
}

export interface Category {
  id:                 string;
  name:               string;
  short_name:         string;
  cards_count:        number;
  repeat_cards_count: number;
  nested:             Category[];
}

export interface Card {
  id:                    string;
  question:              string;
  answer:                string;
  comment:               string;
  repeat_date_timestamp: number | null;
  repeat_after:          { id: string } | null;
  repeatable:            boolean;
}

/* ══════════════════════════════════════════════════════════
   ХЕЛПЕРЫ
══════════════════════════════════════════════════════════ */

function assertNoError<T>(
  result: { data: T | null; error: unknown },
  context: string
): T {
  if (result.error) throw new Error(`[${context}] ${JSON.stringify(result.error)}`);
  if (result.data === null) throw new Error(`[${context}] No data returned`);
  return result.data;
}

/* ══════════════════════════════════════════════════════════
   API CLASS
══════════════════════════════════════════════════════════ */

export class Api {

  /* ── Repeats ── */
  async getRepeats(): Promise<Repeat[]> {
    const data = assertNoError(
      await supabase
        .from("repeats")
        .select("id, duration, timestamp")
        .order("timestamp", { ascending: true }),
      "getRepeats"
    );

    return data as Repeat[];
  }

  /* ── Categories (древовидная структура) ── */
  async getCategories(): Promise<Category[]> {
    // 1. Все категории
    const categoriesRaw = assertNoError(
      await supabase.from("categories").select("id, name, short_name"),
      "getCategories/categories"
    ) as { id: string; name: string; short_name: string }[];

    // 2. Связи parent → child
    const nestedRaw = assertNoError(
      await supabase.from("category_nested").select("parent_id, child_id"),
      "getCategories/nested"
    ) as { parent_id: string; child_id: string }[];

    // 3. Счётчики карточек — одним SQL-запросом
    const allIds = categoriesRaw.map(c => c.id);

    const countsRaw = assertNoError(
      await supabase.rpc("get_category_card_counts", { category_ids: allIds }),
      "getCategories/counts"
    ) as { category_id: string; cards_count: number; repeat_cards_count: number }[];

    const countsMap = new Map(countsRaw.map(r => [r.category_id, r]));

    // 4. Собираем Map категорий
    const categoriesMap = new Map<string, Category>(
      categoriesRaw.map(c => {
        const counts = countsMap.get(c.id);
        return [
          c.id,
          {
            id:                 c.id,
            name:               c.name,
            short_name:         c.short_name,
            cards_count:        counts?.cards_count        ?? 0,
            repeat_cards_count: counts?.repeat_cards_count ?? 0,
            nested:             [],
          },
        ];
      })
    );

    // 5. Строим дерево
    const childIds = new Set<string>();

    for (const { parent_id, child_id } of nestedRaw) {
      const parent = categoriesMap.get(parent_id);
      const child  = categoriesMap.get(child_id);
      if (parent && child) {
        parent.nested.push(child);
        childIds.add(child_id);
      }
    }

    // Корневые — те, что не являются ничьими детьми
    return [...categoriesMap.values()].filter(c => !childIds.has(c.id));
  }

  /* ── Карточки, готовые к повторению (repeat_date <= now или null) ── */
  async getRepeatCards({ categoryIds }: { categoryIds?: string[] } = {}): Promise<Card[]> {
    let query = supabase
      .from("repeatable_cards")   // view из init.sql
      .select("id, question, answer, comment, repeat_date, repeat_after_id, category_id");

    if (categoryIds?.length) {
      query = query.in("category_id", categoryIds);
    }

    const data = assertNoError(await query, "getRepeatCards");
    return (data as any[]).map(mapCard);
  }

  /* ── Все карточки (включая ещё не готовые к повторению) ── */
  async getAllCards({ categoryIds }: { categoryIds?: string[] } = {}): Promise<Card[]> {
    let query = supabase
      .from("cards")
      .select("id, question, answer, comment, repeat_date, repeat_after_id, category_id");

    if (categoryIds?.length) {
      query = query.in("category_id", categoryIds);
    }

    const data = assertNoError(await query, "getAllCards");
    return (data as any[]).map(mapCard);
  }

  /* ── Карточка выучена: обновить интервал и дату следующего повторения ── */
  async markCardLearned(
    cardId: string,
    repeat_date_timestamp: number,
    repeat_after: { id: string }
  ): Promise<void> {
    const { error } = await supabase
      .from("cards")
      .update({
        repeat_after_id: repeat_after.id,
        repeat_date:     new Date(repeat_date_timestamp).toISOString(),
      })
      .eq("id", cardId);

    if (error) throw new Error(`[markCardLearned] ${JSON.stringify(error)}`);
  }

  /* ── Карточка провалена: сбросить интервал ── */
  async markCardNotLearned(cardId: string): Promise<void> {
    const { error } = await supabase
      .from("cards")
      .update({ repeat_after_id: null, repeat_date: null })
      .eq("id", cardId);

    if (error) throw new Error(`[markCardNotLearned] ${JSON.stringify(error)}`);
  }
}

/* ══════════════════════════════════════════════════════════
   МАППИНГ: строка БД → Card
══════════════════════════════════════════════════════════ */

function mapCard(row: {
  id:              string;
  question:        string;
  answer:          string;
  comment:         string;
  repeat_date:     string | null;
  repeat_after_id: string | null;
}): Card {
  return {
    id:                    row.id,
    question:              row.question,
    answer:                row.answer,
    comment:               row.comment,
    repeat_date_timestamp: row.repeat_date ? Date.parse(row.repeat_date) : null,
    repeat_after:          row.repeat_after_id ? { id: row.repeat_after_id } : null,
    repeatable:            row.repeat_date === null || Date.parse(row.repeat_date) <= Date.now(),
  };
}
