-- Compliance LMS: tag modules with topics for search
--
-- Free-form tags (not a controlled/normalized vocabulary) — simplest thing
-- that supports the ask: admins type whatever topics make sense per
-- module, and both the Modules and Assignments pages can filter/search by
-- title or topic. A GIN index keeps array-containment lookups fast if this
-- is ever queried server-side instead of filtered client-side.

alter table public.modules add column topics text[] not null default '{}';

create index modules_topics_gin_idx on public.modules using gin (topics);
