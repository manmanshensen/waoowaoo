ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `combinedStoryboard1x1Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard2x2Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard3x3Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard1x1Resolution` VARCHAR(191) NOT NULL DEFAULT '1K',
  ADD COLUMN `combinedStoryboard2x2Resolution` VARCHAR(191) NOT NULL DEFAULT '2K',
  ADD COLUMN `combinedStoryboard3x3Resolution` VARCHAR(191) NOT NULL DEFAULT '4K';

ALTER TABLE `user_preferences`
  ADD COLUMN `combinedStoryboard1x1Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard2x2Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard3x3Model` TEXT NULL,
  ADD COLUMN `combinedStoryboard1x1Resolution` VARCHAR(191) NOT NULL DEFAULT '1K',
  ADD COLUMN `combinedStoryboard2x2Resolution` VARCHAR(191) NOT NULL DEFAULT '2K',
  ADD COLUMN `combinedStoryboard3x3Resolution` VARCHAR(191) NOT NULL DEFAULT '4K';
