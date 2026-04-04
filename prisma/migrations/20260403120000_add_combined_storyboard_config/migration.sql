ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `combinedStoryboardModel` TEXT NULL,
  ADD COLUMN `combinedStoryboardResolution` VARCHAR(191) NOT NULL DEFAULT '4K';

ALTER TABLE `user_preferences`
  ADD COLUMN `combinedStoryboardModel` TEXT NULL,
  ADD COLUMN `combinedStoryboardResolution` VARCHAR(191) NOT NULL DEFAULT '4K';
