ALTER TABLE `AnalysisResult` ADD COLUMN `cacheKey` CHAR(64) NULL;
CREATE UNIQUE INDEX `AnalysisResult_scenarioId_cacheKey_key` ON `AnalysisResult` (`scenarioId`, `cacheKey`);
