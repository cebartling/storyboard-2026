PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stories` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`slice_id` text,
	`rank` text NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slice_id`) REFERENCES `slices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stories`("id", "step_id", "title", "description", "slice_id", "rank") SELECT "id", "step_id", "title", "description", "slice_id", "rank" FROM `stories`;--> statement-breakpoint
DROP TABLE `stories`;--> statement-breakpoint
ALTER TABLE `__new_stories` RENAME TO `stories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `stories_step_id_slice_id_rank_idx` ON `stories` (`step_id`,`slice_id`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `stories_step_id_unsliced_rank_idx` ON `stories` (`step_id`,`rank`) WHERE "stories"."slice_id" is null;