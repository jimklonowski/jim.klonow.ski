-- The barcode a hand entry's figures were looked up by (audit #43 item 81): a scan filled the
-- form and the save kept nothing of it — the row read "corrected by hand" like a typed one. With
-- the barcode on the row (and the product and serving in `assumptions`), reopening the form says
-- where the figures came from. NULL on every typed entry and every model row.
ALTER TABLE meal_estimates ADD COLUMN barcode TEXT;
