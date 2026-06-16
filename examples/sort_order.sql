UPDATE category_nested cn
SET sort_order = v.ord
FROM categories c
JOIN (VALUES
  ('A1', 1),
  ('A2', 2),
  ('B1', 3),
  ('B2', 4),
  ('C1', 5),
  ('C2', 6)
) AS v(name, ord)
ON c.name = v.name
WHERE cn.child_id = c.id
  AND cn.parent_id = '...';