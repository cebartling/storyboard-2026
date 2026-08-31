CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`name` text NOT NULL,
	`rank` text NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_map_id_rank_idx` ON `activities` (`map_id`,`rank`);--> statement-breakpoint
CREATE TABLE `maps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slices` (
	`id` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`name` text NOT NULL,
	`rank` text NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slices_map_id_rank_idx` ON `slices` (`map_id`,`rank`);--> statement-breakpoint
CREATE TABLE `steps` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`name` text NOT NULL,
	`rank` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `steps_activity_id_rank_idx` ON `steps` (`activity_id`,`rank`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`step_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`slice_id` text,
	`rank` text NOT NULL,
	FOREIGN KEY (`step_id`) REFERENCES `steps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slice_id`) REFERENCES `slices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_step_id_slice_id_rank_idx` ON `stories` (`step_id`,`slice_id`,`rank`);