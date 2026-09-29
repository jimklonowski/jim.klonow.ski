-- Mirror-image correction for progress photos: 1 renders the photo flipped left-to-right
-- (a mirror selfie or a front camera that saved the preview mirror image), 0 as captured.
-- Applied as a CSS transform like the reframe columns; the original pixels are untouched.
ALTER TABLE progress_photos ADD COLUMN frame_flip INTEGER NOT NULL DEFAULT 0;
